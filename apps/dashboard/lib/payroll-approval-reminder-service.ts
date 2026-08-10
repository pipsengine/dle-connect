import {
  clearPayrollApprovalReminder,
  getCurrentPayrollApprovalStage,
  isPayrollRunAwaitingApproval,
  resolvePayrollApprovalStageEnteredAt,
  type PayrollApprovalStageId,
} from '@/lib/payroll-approval-workflow';
import { notifyPayrollApprovalStage } from '@/lib/payroll-approval-notification-service';
import { normalizePayrollRunPack } from '@/lib/payroll-employee-classification';
import {
  appendPayrollAudit,
  getPayrollRun,
  getPayrollRunForPeriod,
  listPayrollRuns,
  savePayrollRun,
  type UnifiedPayrollRun,
} from '@/lib/payroll-run-store';

const REMINDER_AFTER_MS = 24 * 60 * 60 * 1000;
const MANUAL_COOLDOWN_MS = 15 * 60 * 1000;
const nowIso = () => new Date().toISOString();

const effectiveLastReminderAt = (run: UnifiedPayrollRun, stageId: PayrollApprovalStageId) => {
  if (run.lastReminderStageId && run.lastReminderStageId !== stageId) return 0;
  return run.lastReminderAt ? Date.parse(run.lastReminderAt) : 0;
};

const markReminderSent = async (run: UnifiedPayrollRun, stageId: PayrollApprovalStageId) => {
  run.lastReminderAt = nowIso();
  run.lastReminderStageId = stageId;
  run.updatedAt = nowIso();
  await savePayrollRun(run);
};

const sendStageReminder = async (input: {
  run: UnifiedPayrollRun;
  stageId: PayrollApprovalStageId;
  actor: string;
  role?: string;
  baseUrl?: string | null;
  mode: 'manual' | 'auto';
}) => {
  const result = await notifyPayrollApprovalStage({
    run: input.run,
    stageId: input.stageId,
    actor: input.actor,
    baseUrl: input.baseUrl,
  });

  await markReminderSent(input.run, input.stageId);
  await appendPayrollAudit({
    user: input.actor,
    role: input.role || (input.mode === 'auto' ? 'System' : 'Payroll Officer'),
    action: input.mode === 'auto' ? 'approval-reminder-auto' : 'approval-reminder-manual',
    record: input.run.id,
    oldValue: input.stageId,
    newValue: `reminded:${result.emailed} emailed / ${result.notified} in-app`,
    comment: input.mode === 'auto'
      ? `Automatic 24-hour reminder sent for ${input.stageId} stage.`
      : `Manual reminder sent for ${input.stageId} stage.`,
  });

  return result;
};

/** Manual reminder from Payroll Officer while a stage is awaiting approval. */
export const sendPayrollApprovalReminder = async (input: {
  runId?: string | null;
  period?: string | null;
  pack?: string | null;
  actor: string;
  role?: string;
  baseUrl?: string | null;
  force?: boolean;
}) => {
  let run: UnifiedPayrollRun | null = null;
  if (input.runId) {
    run = await getPayrollRun(input.runId);
  }
  if (!run && input.period) {
    const pack = normalizePayrollRunPack(input.pack) || 'salaried';
    run = await getPayrollRunForPeriod(input.period, pack);
  }
  if (!run) throw new Error('Payroll run not found.');
  if (!isPayrollRunAwaitingApproval(run)) {
    throw new Error('Reminders can only be sent while payroll is awaiting approval.');
  }

  const stage = getCurrentPayrollApprovalStage(run);
  if (!stage || stage.id === 'payroll-officer') {
    throw new Error('No pending approver stage is active for this payroll run.');
  }

  if (run.lastReminderStageId && run.lastReminderStageId !== stage.id) {
    clearPayrollApprovalReminder(run);
  }

  const last = effectiveLastReminderAt(run, stage.id);
  if (!input.force && last && Date.now() - last < MANUAL_COOLDOWN_MS) {
    const mins = Math.ceil((MANUAL_COOLDOWN_MS - (Date.now() - last)) / 60_000);
    throw new Error(`A reminder was sent recently. Please wait about ${mins} minute${mins === 1 ? '' : 's'} before sending again.`);
  }

  const notify = await sendStageReminder({
    run,
    stageId: stage.id,
    actor: input.actor,
    role: input.role,
    baseUrl: input.baseUrl,
    mode: 'manual',
  });

  const refreshed = await getPayrollRun(run.id);
  return {
    run: refreshed || run,
    stageId: stage.id,
    stageTitle: stage.title,
    notified: notify.notified,
    emailed: notify.emailed,
  };
};

/** Auto-remind current stage approvers when a stage has sat idle for 24h+. Repeats every 24h while still pending. */
export const processOverduePayrollApprovalReminders = async (options?: {
  baseUrl?: string | null;
  limit?: number;
}) => {
  const limit = Math.min(Math.max(Number(options?.limit || 40), 1), 100);
  const runs = await listPayrollRuns();
  const candidates = runs
    .filter((run) => isPayrollRunAwaitingApproval(run))
    .filter((run) => {
      const stage = getCurrentPayrollApprovalStage(run);
      return Boolean(stage && stage.id !== 'payroll-officer');
    })
    .slice(0, limit);

  let reminded = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    try {
      const run = (await getPayrollRun(candidate.id)) || candidate;
      if (!isPayrollRunAwaitingApproval(run)) {
        skipped += 1;
        continue;
      }
      const stage = getCurrentPayrollApprovalStage(run);
      if (!stage || stage.id === 'payroll-officer') {
        skipped += 1;
        continue;
      }

      if (run.lastReminderStageId && run.lastReminderStageId !== stage.id) {
        clearPayrollApprovalReminder(run);
      }

      const stageAt = Date.parse(resolvePayrollApprovalStageEnteredAt(run) || '') || 0;
      if (!stageAt || Date.now() - stageAt < REMINDER_AFTER_MS) {
        skipped += 1;
        continue;
      }

      const last = effectiveLastReminderAt(run, stage.id);
      if (last && Date.now() - last < REMINDER_AFTER_MS) {
        skipped += 1;
        continue;
      }

      await sendStageReminder({
        run,
        stageId: stage.id,
        actor: 'Payroll Approval Reminder',
        role: 'System',
        baseUrl: options?.baseUrl,
        mode: 'auto',
      });
      reminded += 1;
    } catch (error) {
      skipped += 1;
      console.error('[payroll-approval-reminder] send failed', candidate.id, error);
    }
  }

  return { scanned: candidates.length, reminded, skipped };
};
