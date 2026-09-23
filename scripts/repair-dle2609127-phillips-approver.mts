/**
 * Assign P0464 as Project Manager on DLE2609127 and send the missed approval email.
 *
 *   npx --yes tsx --tsconfig apps/dashboard/tsconfig.json scripts/repair-dle2609127-phillips-approver.mts
 */
import { loadWorkspaceEnv } from '../apps/dashboard/lib/dle-enterprise-db.ts';
import { syncPortalMailboxForEmployee } from '../apps/dashboard/lib/auth/auth-store.ts';
import { readEmployeeMailboxFromDb } from '../apps/dashboard/lib/dle-enterprise-db.ts';
import { resolveEmployeeMailbox } from '../apps/dashboard/lib/mail-service.ts';
import {
  getPaymentRequestById,
  repairPendingMissingApproverCodes,
} from '../apps/dashboard/lib/finance-intelligence/payment-requests-service.ts';
import { sendPaymentApprovalReminder } from '../apps/dashboard/lib/finance-intelligence/payment-approval-reminder-service.ts';
import { resolvePaymentStageApprover } from '../apps/dashboard/lib/finance-intelligence/payment-approval-notify.ts';

loadWorkspaceEnv();

const REQUEST_ID = 'PREQ-1790081818894';
const MAILBOX = 'ayodejiphillips@dormanlongeng.com';

const main = async () => {
  const resolved = await resolvePaymentStageApprover({
    stage: 'Project Manager',
    projectCode: 'DL2608',
    requesterCode: 'NYSC0025',
    department: 'PROCUREMENT',
    paymentType: 'Cash Advance Payment',
  });
  console.log('resolved PM', resolved);

  const fromDb = await readEmployeeMailboxFromDb('P0464');
  console.log('hris mailbox', fromDb);
  const synced = await syncPortalMailboxForEmployee('P0464', fromDb || MAILBOX);
  console.log('portal mailbox synced', synced, fromDb || MAILBOX);

  const resolvedMailbox = await resolveEmployeeMailbox({
    employeeCode: 'P0464',
    employeeId: 'P0464',
    fullName: 'Mr AYODEJI PHILLIPS',
    officialEmail: fromDb || MAILBOX,
  });
  console.log('resolveEmployeeMailbox', resolvedMailbox);

  const repaired = await repairPendingMissingApproverCodes({
    requestId: REQUEST_ID,
    notify: false,
  });
  console.log('repaired', repaired);

  const beforeSend = await getPaymentRequestById(REQUEST_ID);
  console.log('request after repair', {
    requestId: beforeSend?.requestId,
    requestNumber: beforeSend?.requestNumber,
    status: beforeSend?.status,
    currentStage: beforeSend?.currentStage,
    currentApproverCode: beforeSend?.currentApproverCode,
    currentApproverName: beforeSend?.currentApproverName,
  });

  const reminder = await sendPaymentApprovalReminder({
    requestId: REQUEST_ID,
    actor: 'System',
    actorCode: 'system',
    force: true,
  });
  console.log('reminder sent', {
    requestNumber: reminder.request.requestNumber,
    currentApproverCode: reminder.request.currentApproverCode,
    currentApproverName: reminder.request.currentApproverName,
    lastReminderAt: reminder.request.lastReminderAt,
  });
  process.exit(0);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
