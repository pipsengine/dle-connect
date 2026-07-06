import {
  activatePayrollPeriod,
  closePayrollPeriodRecord,
  createPayrollPeriod,
  ensurePayrollPeriod,
  openPayrollPeriod,
  payrollPeriodLabel,
  reopenPayrollPeriodRecord,
} from '@/lib/payroll-period-store';
import { calculatePayrollForPeriod } from '@/lib/payroll-calculation-service';
import {
  appendPayrollArtifact,
  appendPayrollAudit,
  capturePayrollSnapshot,
  ensurePayrollRun,
  getPayrollRunForPeriod,
  savePayrollRun,
  type UnifiedPayrollRun,
  type UnifiedPayrollRunStatus,
} from '@/lib/payroll-run-store';
import type { PayrollSessionRole } from '@/lib/payroll-session';
import {
  clearPayrollApprovalSignoffs,
  normalizePayrollApprovalAction,
  resolvePayrollApprovalActionForRun,
} from '@/lib/payroll-approval-workflow';
import { notifyNextPayrollApprovalStage } from '@/lib/payroll-approval-notification-service';
import { invalidateHrisEmployeeCaches } from '@/lib/hris-employee-cache';
import { invalidatePayrollEmployeeCache } from '@/lib/payroll-employee-source';
import {
  assertPayrollCutoverBackupBeforeOpen,
  runPayrollCutoverBackup,
} from '@/lib/payroll-cutover-backup-service';

type WorkflowInput = {
  action: string;
  period: string;
  actor: string;
  role: PayrollSessionRole;
  reason?: string;
  comment?: string;
  ip?: string | null;
  paymentDate?: string | null;
  isGlobalAdmin?: boolean;
  baseUrl?: string | null;
};

const nowIso = () => new Date().toISOString();

const syncRunTotals = (run: UnifiedPayrollRun, summary: Awaited<ReturnType<typeof calculatePayrollForPeriod>>['summary']) => {
  run.employeeCount = summary.payrollEligible;
  run.grossPay = summary.grossPay;
  run.deductions = summary.deductions;
  run.netPay = summary.netPay;
  run.employerCost = summary.employerCost;
  run.exceptionCount = summary.exceptionCount;
};

const transitionProcessingStatus = (action: string, current?: UnifiedPayrollRunStatus): UnifiedPayrollRunStatus => {
  if (action === 'calculate') return 'Calculated';
  if (action === 'submit' || action === 'submit-run') return 'Submitted';
  if (action === 'finance-approve') return 'Finance Approved';
  if (action === 'hr-approve') return 'HR Approved';
  if (action === 'approve-run') return 'Approved';
  if (action === 'release-run') return 'Released';
  if (action === 'generate-payslips') return 'Published';
  if (action === 'lock' || action === 'lock-run') return 'Locked';
  if (action === 'post' || action === 'post-run') return 'Posted';
  if (action === 'close-period') return 'Closed';
  if (action === 'reopen-period') return 'Reopened';
  if (action === 'reject' || action === 'reject-run') return 'Rejected';
  if (action === 'request-revision') return 'Revision Requested';
  if (action === 'create-run') return 'Computed';
  if (action === 'validate-payroll') return 'Validated';
  if (action === 'open-period') return 'Open';
  if (action === 'create-period') return 'Draft';
  if (action === 'reopen') return 'Reopened';
  return current || 'Calculated';
};

const assertNotBlocked = (summary: Awaited<ReturnType<typeof calculatePayrollForPeriod>>['summary'], actions: string[]) => {
  if (actions.includes('blocked-check') && summary.blocked > 0) {
    throw new Error('Blocked payroll exceptions must be resolved before this workflow action.');
  }
};

const FORCE_REFRESH_ACTIONS = new Set([
  'calculate',
  'create-run',
  'validate-payroll',
  'submit',
  'submit-run',
  'approve-run',
  'cfo-approve',
  'md-ceo-approve',
  'hr-manager-approve',
  'finance-manager-approve',
  'release-run',
  'generate-payslips',
  'post',
  'post-run',
  'close-period',
]);

export const executePayrollWorkflowAction = async (input: WorkflowInput) => {
  const { period, actor, role, reason, comment, ip, paymentDate, isGlobalAdmin, baseUrl } = input;
  let action = normalizePayrollApprovalAction(input.action) as string;
  if (['calculate', 'create-run', 'validate-payroll'].includes(action)) invalidatePayrollEmployeeCache();
  const periodLabel = payrollPeriodLabel(period);
  let run = await getPayrollRunForPeriod(period);
  let calculation: Awaited<ReturnType<typeof calculatePayrollForPeriod>> | null = null;
  const loadCalculation = async () => {
    if (!calculation) {
      calculation = await calculatePayrollForPeriod(
        period,
        FORCE_REFRESH_ACTIONS.has(action) ? { forceRefresh: true } : undefined,
      );
    }
    return calculation;
  };

  const audit = async (auditAction: string, oldValue: string | null, newValue: string) => {
    await appendPayrollAudit({
      user: actor,
      role,
      action: auditAction,
      record: run?.id || `payroll-${period}`,
      oldValue,
      newValue,
      reason: reason || null,
      comment: comment || null,
      ip,
    });
  };

  if (action === 'create-period') {
    await createPayrollPeriod(period, actor, paymentDate);
    run = await ensurePayrollRun(period, periodLabel, actor);
    run.status = 'Draft';
    run.updatedBy = actor;
    await savePayrollRun(run);
    await audit('create-period', null, 'Draft');
    return { run, calculation: await loadCalculation(), periodRecord: await ensurePayrollPeriod(period, actor) };
  }

  if (action === 'open-period') {
    await assertPayrollCutoverBackupBeforeOpen(period);
    const periodRecord = await openPayrollPeriod(period, actor);
    run = await ensurePayrollRun(period, periodLabel, actor);
    run.status = 'Open';
    run.updatedBy = actor;
    await savePayrollRun(run);
    await audit('open-period', null, 'Open');
    return { run, calculation: await loadCalculation(), periodRecord };
  }

  if (action === 'activate-period') {
    await assertPayrollCutoverBackupBeforeOpen(period);
    const periodRecord = await activatePayrollPeriod(period, actor);
    run = await ensurePayrollRun(period, periodLabel, actor);
    run.status = 'Open';
    await savePayrollRun(run);
    await audit('activate-period', null, period);
    return { run, calculation: await loadCalculation(), periodRecord };
  }

  run = run || (await ensurePayrollRun(period, periodLabel, actor));
  action = resolvePayrollApprovalActionForRun(action, run) as string;

  const notifyNext = async () => {
    try {
      await notifyNextPayrollApprovalStage({ run: run!, actor, baseUrl });
    } catch (error) {
      console.warn('[payroll-workflow] approval notification failed', error);
    }
  };

  if (action === 'generate-bank-schedule') {
    if (!['Released', 'Locked', 'Published', 'Posted', 'Approved', 'Closed'].includes(run.status)) {
      throw new Error('Bank schedule generation requires released payroll.');
    }
    run.bankScheduleGeneratedAt = nowIso();
    run.bankScheduleGeneratedBy = actor;
    run.updatedBy = actor;
    await savePayrollRun(run);
    await appendPayrollArtifact(run.id, {
      type: 'bank-schedule',
      label: 'Bank payment schedule',
      fileName: `bank-schedule-${period}.xls`,
      generatedBy: actor,
      meta: { netPay: run.netPay, employeeCount: run.employeeCount },
    });
    await audit('generate-bank-schedule', null, 'Bank schedule generated');
    return { run, calculation: calculation as NonNullable<typeof calculation> };
  }

  if (action === 'generate-statutory-schedules') {
    if (!['Released', 'Locked', 'Published', 'Posted', 'Approved', 'Closed'].includes(run.status)) {
      throw new Error('Statutory schedules require released payroll.');
    }
    run.statutorySchedulesGeneratedAt = nowIso();
    run.statutorySchedulesGeneratedBy = actor;
    run.updatedBy = actor;
    await savePayrollRun(run);
    await appendPayrollArtifact(run.id, {
      type: 'statutory-schedules',
      label: 'PAYE, pension, NHF, NSITF, ITF schedules',
      fileName: `statutory-schedules-${period}.zip`,
      generatedBy: actor,
    });
    await audit('generate-statutory-schedules', null, 'Statutory schedules generated');
    return { run, calculation: calculation as NonNullable<typeof calculation> };
  }

  calculation = await loadCalculation();

  if (['calculate', 'create-run', 'validate-payroll'].includes(action)) {
    assertNotBlocked(calculation.summary, action === 'validate-payroll' ? ['blocked-check'] : []);
    const before = run.status;
    run.status = transitionProcessingStatus(action, run.status);
    syncRunTotals(run, calculation.summary);
    if (action === 'validate-payroll') {
      run.validatedAt = nowIso();
      run.validatedBy = actor;
    }
    if (action === 'create-run') {
      run.validatedAt = run.validatedAt || nowIso();
      run.validatedBy = run.validatedBy || actor;
      if (['Revision Requested', 'Rejected'].includes(run.status)) {
        clearPayrollApprovalSignoffs(run);
      }
    }
    run.updatedBy = actor;
    await savePayrollRun(run);
    await capturePayrollSnapshot(run.id, action, actor, calculation.summary as unknown as Record<string, unknown>, calculation.records);
    await audit(action, before, run.status);
    await notifyNext();
    return { run, calculation };
  }

  if (action === 'submit' || action === 'submit-run') {
    assertNotBlocked(calculation.summary, ['blocked-check']);
    if (!['Computed', 'Calculated', 'Validated', 'Ready for Approval'].includes(run.status)) {
      throw new Error(`Cannot submit payroll from ${run.status}. Process payroll first.`);
    }
    const before = run.status;
    run.status = 'Submitted';
    run.submittedAt = nowIso();
    run.submittedBy = actor;
    run.updatedBy = actor;
    await savePayrollRun(run);
    await capturePayrollSnapshot(run.id, action, actor, calculation.summary as unknown as Record<string, unknown>, calculation.records);
    await audit(action, before, run.status);
    await notifyNext();
    return { run, calculation };
  }

  if (action === 'hr-manager-approve') {
    assertNotBlocked(calculation.summary, ['blocked-check']);
    if (!isGlobalAdmin && !['Submitted', 'Under Review'].includes(run.status)) {
      throw new Error(`HR Manager approval requires a submitted payroll run. Current status: ${run.status}.`);
    }
    const before = run.status;
    run.status = 'HR Approved';
    run.hrReviewedAt = nowIso();
    run.hrReviewedBy = actor;
    run.updatedBy = actor;
    await savePayrollRun(run);
    await capturePayrollSnapshot(run.id, action, actor, calculation.summary as unknown as Record<string, unknown>, calculation.records);
    await audit(action, before, run.status);
    await notifyNext();
    return { run, calculation };
  }

  if (action === 'finance-manager-approve') {
    assertNotBlocked(calculation.summary, ['blocked-check']);
    if (!isGlobalAdmin && run.status !== 'HR Approved') {
      throw new Error(`Finance Manager approval requires HR Manager sign-off first. Current status: ${run.status}.`);
    }
    const before = run.status;
    run.status = 'Finance Approved';
    run.financeReviewedAt = nowIso();
    run.financeReviewedBy = actor;
    run.updatedBy = actor;
    await savePayrollRun(run);
    await capturePayrollSnapshot(run.id, action, actor, calculation.summary as unknown as Record<string, unknown>, calculation.records);
    await audit(action, before, run.status);
    await notifyNext();
    return { run, calculation };
  }

  if (action === 'cfo-approve') {
    assertNotBlocked(calculation.summary, ['blocked-check']);
    if (!isGlobalAdmin && run.status !== 'Finance Approved') {
      throw new Error(`CFO approval requires Finance Manager sign-off first. Current status: ${run.status}.`);
    }
    if (!isGlobalAdmin && (run.submittedBy === actor || run.createdBy === actor)) throw new Error('Self-approval is not allowed.');
    const before = run.status;
    run.status = 'CFO Approved';
    run.cfoReviewedAt = nowIso();
    run.cfoReviewedBy = actor;
    run.updatedBy = actor;
    await savePayrollRun(run);
    await capturePayrollSnapshot(run.id, action, actor, calculation.summary as unknown as Record<string, unknown>, calculation.records);
    await audit(action, before, run.status);
    await notifyNext();
    return { run, calculation };
  }

  if (action === 'md-ceo-approve') {
    assertNotBlocked(calculation.summary, ['blocked-check']);
    if (!isGlobalAdmin && run.status !== 'CFO Approved') {
      throw new Error(`MD / CEO approval requires CFO sign-off first. Current status: ${run.status}.`);
    }
    if (!isGlobalAdmin && (run.submittedBy === actor || run.createdBy === actor)) throw new Error('Self-approval is not allowed.');
    const before = run.status;
    run.status = 'Approved';
    run.approvedAt = nowIso();
    run.approvedBy = actor;
    run.updatedBy = actor;
    await savePayrollRun(run);
    await capturePayrollSnapshot(run.id, action, actor, calculation.summary as unknown as Record<string, unknown>, calculation.records);
    await audit(action, before, run.status);
    return { run, calculation };
  }

  if (action === 'release-run') {
    if (run.status !== 'Approved') {
      throw new Error('Payroll can only be released after MD / CEO approval.');
    }
    const before = run.status;
    run.status = 'Released';
    run.releasedAt = nowIso();
    run.releasedBy = actor;
    run.lockedAt = run.lockedAt || nowIso();
    run.updatedBy = actor;
    syncRunTotals(run, calculation.summary);
    await savePayrollRun(run);
    await capturePayrollSnapshot(run.id, action, actor, calculation.summary as unknown as Record<string, unknown>, calculation.records);
    invalidateHrisEmployeeCaches();
    await audit(action, before, run.status);
    return { run, calculation };
  }

  if (action === 'generate-payslips') {
    if (!['Released', 'Locked', 'Posted', 'Published', 'Approved'].includes(run.status)) {
      throw new Error('Payslips can only be published after payroll release.');
    }
    const before = run.status;
    run.payslipsGeneratedAt = nowIso();
    run.payslipsGeneratedBy = actor;
    run.status = run.postedAt ? run.status : 'Published';
    run.updatedBy = actor;
    syncRunTotals(run, calculation.summary);
    await savePayrollRun(run);
    await capturePayrollSnapshot(run.id, action, actor, calculation.summary as unknown as Record<string, unknown>, calculation.records);
    invalidateHrisEmployeeCaches();
    await appendPayrollArtifact(run.id, {
      type: 'payslips',
      label: 'Employee payslips published to ESS',
      fileName: `payslips-${period}.json`,
      generatedBy: actor,
      meta: { employeeCount: calculation.summary.payrollEligible },
    });
    await audit(action, before, run.status);
    return { run, calculation };
  }

  if (action === 'post' || action === 'post-run') {
    if (!['Released', 'Locked', 'Published'].includes(run.status)) {
      throw new Error('Payroll journal cannot be posted before payroll release.');
    }
    if (!run.bankScheduleGeneratedAt || !run.statutorySchedulesGeneratedAt) {
      throw new Error('Generate bank and statutory schedules before posting payroll.');
    }
    const before = run.status;
    run.status = 'Posted';
    run.postedAt = nowIso();
    run.postedBy = actor;
    run.updatedBy = actor;
    await savePayrollRun(run);
    await appendPayrollArtifact(run.id, {
      type: 'journal',
      label: 'Payroll journal posted',
      fileName: `payroll-journal-${period}.json`,
      generatedBy: actor,
    });
    await audit(action, before, run.status);
    return { run, calculation };
  }

  if (action === 'close-period') {
    if (run.status !== 'Posted') {
      throw new Error('Period closing requires payroll to be posted with payslips, bank schedule, and statutory schedules complete.');
    }
    if (!run.payslipsGeneratedAt || !run.bankScheduleGeneratedAt || !run.statutorySchedulesGeneratedAt) {
      throw new Error('Publish payslips and generate bank/statutory schedules before closing the payroll period.');
    }
    const before = run.status;
    run.status = 'Closed';
    run.closedAt = nowIso();
    run.lockedAt = run.lockedAt || nowIso();
    run.updatedBy = actor;
    await savePayrollRun(run);
    const periodRecord = await closePayrollPeriodRecord(period, actor, reason);
    if (periodRecord.status !== 'Closed') {
      throw new Error('Payroll run closed but period record could not be persisted to DLE_Enterprise.');
    }
    await audit('close-period', before, run.status);
    const backup = await runPayrollCutoverBackup(period, actor);
    await audit(
      'payroll-cutover-backup',
      backup.skipped ? 'Skipped' : 'Started',
      backup.skipped ? (backup.reason || 'Skipped') : (backup.record?.backupFilePath || period),
    );
    return { run, calculation, periodRecord, payrollCutoverBackup: backup };
  }

  if (action === 'reopen-period' || action === 'reopen') {
    if (!reason || reason.trim().length < 3) throw new Error('Reopening requires a reason.');
    if (run.status !== 'Closed') throw new Error('Only closed payroll periods can be reopened.');
    const before = run.status;
    run.status = 'Reopened';
    run.reopenedAt = nowIso();
    run.reopenedBy = actor;
    run.reopenReason = reason;
    run.updatedBy = actor;
    await savePayrollRun(run);
    const periodRecord = await reopenPayrollPeriodRecord(period, actor, reason);
    await audit('reopen-period', before, run.status);
    return { run, calculation, periodRecord };
  }

  if (action === 'reject-run' || action === 'reject') {
    const before = run.status;
    run.status = 'Rejected';
    clearPayrollApprovalSignoffs(run);
    run.updatedBy = actor;
    await savePayrollRun(run);
    await audit(action, before, run.status);
    return { run, calculation };
  }

  if (action === 'request-revision') {
    const before = run.status;
    run.status = 'Revision Requested';
    clearPayrollApprovalSignoffs(run);
    run.updatedBy = actor;
    await savePayrollRun(run);
    await audit(action, before, run.status);
    return { run, calculation };
  }

  if (action === 'lock' || action === 'lock-run') {
    const before = run.status;
    run.status = 'Locked';
    run.lockedAt = nowIso();
    run.updatedBy = actor;
    await savePayrollRun(run);
    await audit(action, before, run.status);
    return { run, calculation };
  }

  throw new Error(`Unsupported payroll workflow action: ${action}`);
};
