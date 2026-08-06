import sql from 'mssql';
import { ensureFinanceDb } from '@/lib/finance-intelligence/store';
import { notifyPaymentApprovalRequired } from '@/lib/finance-intelligence/payment-approval-notify';
import {
  getPaymentRequestById,
  listPaymentRequestActions,
  type PaymentRequestRow,
} from '@/lib/finance-intelligence/payment-requests-service';

const compact = (value?: string | null) => String(value || '').trim();
const REMINDER_AFTER_MS = 24 * 60 * 60 * 1000;
const MANUAL_COOLDOWN_MS = 15 * 60 * 1000;

const isPendingApprovalStatus = (status?: string | null) =>
  /pending approval|submitted|finance review/i.test(String(status || ''));

const markReminderSent = async (requestId: string) => {
  const pool = await ensureFinanceDb().catch(() => null);
  if (!pool) return;
  try {
    await pool.request()
      .input('RequestId', sql.NVarChar(60), requestId)
      .query(`
UPDATE [finance].[PaymentRequests]
SET [LastReminderAt] = SYSUTCDATETIME()
WHERE [RequestId] = @RequestId
`);
  } catch {
    // schema may not have LastReminderAt yet
  }
};

const logReminderAction = async (input: {
  requestId: string;
  actor: string;
  actorCode?: string;
  stage: string;
  comment: string;
}) => {
  const pool = await ensureFinanceDb().catch(() => null);
  if (!pool) return;
  try {
    const actionId = `PRA-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    await pool.request()
      .input('ActionId', sql.NVarChar(60), actionId)
      .input('RequestId', sql.NVarChar(60), input.requestId)
      .input('ActionType', sql.NVarChar(40), 'reminder')
      .input('Stage', sql.NVarChar(80), input.stage || null)
      .input('ActorCode', sql.NVarChar(60), compact(input.actorCode) || null)
      .input('ActorName', sql.NVarChar(200), input.actor)
      .input('Comment', sql.NVarChar(sql.MAX), input.comment)
      .input('Reason', sql.NVarChar(sql.MAX), null)
      .query(`
INSERT INTO [finance].[PaymentRequestActions]
  ([ActionId], [RequestId], [ActionType], [Stage], [ActorCode], [ActorName], [Comment], [Reason])
VALUES
  (@ActionId, @RequestId, @ActionType, @Stage, @ActorCode, @ActorName, @Comment, @Reason)
`);
  } catch {
    // best-effort audit
  }
};

const toNotifyRequest = (row: PaymentRequestRow) => ({
  requestId: row.requestId,
  requestNumber: row.requestNumber,
  paymentType: row.paymentType,
  title: row.title,
  requesterCode: row.requesterCode,
  requesterName: row.requesterName,
  beneficiaryName: row.beneficiaryName,
  netAmount: row.netAmount,
  currencyCode: row.currencyCode,
  currentStage: row.currentStage,
  currentApproverCode: row.currentApproverCode,
  currentApproverName: row.currentApproverName,
  projectCode: row.projectCode,
  supervisorName: row.supervisorName,
  paymentSiteCode: row.paymentSiteCode,
});

/** Manual reminder from requester (or elevated Finance user). */
export const sendPaymentApprovalReminder = async (input: {
  requestId: string;
  actor: string;
  actorCode?: string;
  baseUrl?: string | null;
  force?: boolean;
}) => {
  const row = await getPaymentRequestById(input.requestId);
  if (!row) throw new Error('Payment request not found.');
  if (!isPendingApprovalStatus(row.status)) {
    throw new Error('Reminders can only be sent while the request is awaiting approval.');
  }
  if (!compact(row.currentApproverCode) && !compact(row.currentApproverName)) {
    throw new Error('No current approver is assigned for this request.');
  }

  const last = row.lastReminderAt ? Date.parse(row.lastReminderAt) : 0;
  if (!input.force && last && Date.now() - last < MANUAL_COOLDOWN_MS) {
    const mins = Math.ceil((MANUAL_COOLDOWN_MS - (Date.now() - last)) / 60_000);
    throw new Error(`A reminder was sent recently. Please wait about ${mins} minute${mins === 1 ? '' : 's'} before sending again.`);
  }

  await notifyPaymentApprovalRequired({
    request: toNotifyRequest(row),
    stage: row.currentStage || 'Approval',
    actorName: input.actor,
    baseUrl: input.baseUrl,
  });
  await markReminderSent(row.requestId);
  await logReminderAction({
    requestId: row.requestId,
    actor: input.actor,
    actorCode: input.actorCode,
    stage: row.currentStage,
    comment: `Manual reminder sent to ${row.currentApproverName || row.currentApproverCode || 'current approver'}.`,
  });

  const refreshed = await getPaymentRequestById(row.requestId);
  const actions = await listPaymentRequestActions(row.requestId);
  return { request: refreshed || row, actions };
};

/** Auto-remind current approvers when a stage has sat idle for 24h+. */
export const processOverduePaymentApprovalReminders = async (options?: {
  baseUrl?: string | null;
  limit?: number;
}) => {
  const pool = await ensureFinanceDb().catch(() => null);
  if (!pool) return { scanned: 0, reminded: 0, skipped: 0 };

  const limit = Math.min(Math.max(Number(options?.limit || 40), 1), 100);
  let ids: string[] = [];
  try {
    const result = await pool.request().query(`
SELECT TOP ${limit} [RequestId]
FROM [finance].[PaymentRequests]
WHERE [Status] IN (N'Pending Approval', N'Submitted', N'Finance Review')
  AND COALESCE([CurrentApproverCode], N'') <> N''
  AND COALESCE([StageEnteredAt], [UpdatedAt], [SubmittedAt], [CreatedAt]) <= DATEADD(HOUR, -24, SYSUTCDATETIME())
  AND (
    [LastReminderAt] IS NULL
    OR [LastReminderAt] <= DATEADD(HOUR, -24, SYSUTCDATETIME())
  )
ORDER BY COALESCE([StageEnteredAt], [UpdatedAt], [SubmittedAt]) ASC
`);
    ids = (result.recordset || [])
      .map((row: { RequestId?: string }) => compact(row.RequestId))
      .filter(Boolean);
  } catch (error) {
    console.warn('[payment-approval-reminder] scan failed', error);
    return { scanned: 0, reminded: 0, skipped: 0 };
  }

  let reminded = 0;
  let skipped = 0;
  for (const requestId of ids) {
    try {
      const full = await getPaymentRequestById(requestId);
      if (!full || !isPendingApprovalStatus(full.status)) {
        skipped += 1;
        continue;
      }
      const stageAt = Date.parse(full.stageEnteredAt || full.updatedAt || full.submittedAt || full.createdAt || '') || 0;
      if (stageAt && Date.now() - stageAt < REMINDER_AFTER_MS) {
        skipped += 1;
        continue;
      }
      await notifyPaymentApprovalRequired({
        request: toNotifyRequest(full),
        stage: full.currentStage || 'Approval',
        actorName: 'Payment Approval Reminder',
        baseUrl: options?.baseUrl,
      });
      await markReminderSent(full.requestId);
      await logReminderAction({
        requestId: full.requestId,
        actor: 'Payment Approval Reminder',
        stage: full.currentStage,
        comment: `Automatic 24-hour reminder sent to ${full.currentApproverName || full.currentApproverCode || 'current approver'}.`,
      });
      reminded += 1;
    } catch (error) {
      skipped += 1;
      console.error('[payment-approval-reminder] send failed', requestId, error);
    }
  }

  return { scanned: ids.length, reminded, skipped };
};
