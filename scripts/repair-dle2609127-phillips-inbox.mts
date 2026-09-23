/**
 * DLE2609127 sat on Project Manager with name "Mr AYODEJI PHILLIPS" but a null
 * CurrentApproverCode, so P0464's inbox and mailbox lookup both missed it.
 *
 * Usage:
 *   npx --yes tsx --tsconfig apps/dashboard/tsconfig.json scripts/repair-dle2609127-phillips-inbox.mts
 */
import sql from 'mssql';
import { loadWorkspaceEnv } from '../apps/dashboard/lib/dle-enterprise-db';
import { syncPortalMailboxForEmployee } from '../apps/dashboard/lib/auth/auth-store';
import { resolveEmployeeMailbox } from '../apps/dashboard/lib/mail-service';
import {
  resolvePaymentStageApprover,
} from '../apps/dashboard/lib/finance-intelligence/payment-approval-notify';
import { sendPaymentApprovalReminder } from '../apps/dashboard/lib/finance-intelligence/payment-approval-reminder-service';
import { getPaymentRequestById } from '../apps/dashboard/lib/finance-intelligence/payment-requests-service';
import { ensureFinanceDb } from '../apps/dashboard/lib/finance-intelligence/store';
import type { DleEmployeeDirectoryRow } from '../apps/dashboard/lib/dle-enterprise-db';

loadWorkspaceEnv();

const REQUEST_NUMBER = 'DLE2609127';
const FALLBACK_CODE = 'P0464';
const FALLBACK_EMAIL = 'ayodejiphillips@dormanlongeng.com';

const main = async () => {
  const pool = await ensureFinanceDb();
  if (!pool) throw new Error('Finance database is not available.');

  const existing = await getPaymentRequestById(REQUEST_NUMBER);
  if (!existing) throw new Error(`${REQUEST_NUMBER} was not found.`);

  const resolved = await resolvePaymentStageApprover({
    stage: existing.currentStage || 'Project Manager',
    requesterCode: existing.requesterCode,
    projectCode: existing.projectCode,
    department: existing.department,
    costCentre: existing.costCentre,
    supervisorName: existing.supervisorName,
    paymentType: existing.paymentType,
  });

  const approverCode = resolved.code || FALLBACK_CODE;
  const approverName = resolved.name || existing.currentApproverName || 'Mr AYODEJI PHILLIPS';
  const mailbox = await resolveEmployeeMailbox({
    employeeCode: approverCode,
    employeeId: approverCode,
    fullName: approverName,
    officialEmail: FALLBACK_EMAIL,
    email: FALLBACK_EMAIL,
  } as DleEmployeeDirectoryRow) || FALLBACK_EMAIL;

  console.log(JSON.stringify({
    requestId: existing.requestId,
    requestNumber: existing.requestNumber,
    stage: existing.currentStage,
    previousCode: existing.currentApproverCode || null,
    previousName: existing.currentApproverName || null,
    resolvedCode: resolved.code || null,
    resolvedName: resolved.name || null,
    persistedCode: approverCode,
    mailbox,
  }, null, 2));

  await pool.request()
    .input('RequestId', sql.NVarChar(60), existing.requestId)
    .input('ApproverCode', sql.NVarChar(60), approverCode)
    .input('ApproverName', sql.NVarChar(200), approverName)
    .query(`
UPDATE [finance].[PaymentRequests]
SET [CurrentApproverCode] = @ApproverCode,
    [CurrentApproverName] = @ApproverName,
    [UpdatedAt] = SYSUTCDATETIME()
WHERE [RequestId] = @RequestId
`);

  await syncPortalMailboxForEmployee(approverCode, mailbox).catch((error) => {
    console.warn('[repair] portal mailbox sync failed', error);
  });

  const reminder = await sendPaymentApprovalReminder({
    requestId: existing.requestId,
    actor: 'System',
    actorCode: 'system',
    force: true,
  });

  const refreshed = reminder.request || await getPaymentRequestById(existing.requestId);
  console.log(JSON.stringify({
    sent: true,
    currentApproverCode: refreshed?.currentApproverCode || null,
    currentApproverName: refreshed?.currentApproverName || null,
    status: refreshed?.status || null,
    stage: refreshed?.currentStage || null,
  }, null, 2));
  process.exit(0);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
