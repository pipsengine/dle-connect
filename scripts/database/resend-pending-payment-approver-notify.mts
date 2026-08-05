/**
 * Resend in-app/email approval notifications for payment requests awaiting an assignee.
 *
 * Usage:
 *   npx --yes tsx --tsconfig apps/dashboard/tsconfig.json scripts/database/resend-pending-payment-approver-notify.mts
 */
import { loadWorkspaceEnv } from '../../apps/dashboard/lib/dle-enterprise-db.ts';
import { notifyPaymentApprovalRequired } from '../../apps/dashboard/lib/finance-intelligence/payment-approval-notify.ts';
import { buildPaymentRequestsWorkspace, getPaymentRequestById } from '../../apps/dashboard/lib/finance-intelligence/payment-requests-service.ts';

loadWorkspaceEnv();

const main = async () => {
  const workspace = await buildPaymentRequestsWorkspace();
  const pending = workspace.rows.filter((row) =>
    /pending approval/i.test(row.status)
    && Boolean(String(row.currentApproverCode || '').trim()));

  console.log(`Found ${pending.length} pending assigned payment request(s).`);
  for (const row of pending) {
    const fresh = (await getPaymentRequestById(row.requestId)) || row;
    console.log(`Notifying ${fresh.currentApproverName} (${fresh.currentApproverCode}) for ${fresh.requestNumber} @ ${fresh.currentStage}`);
    const approver = await notifyPaymentApprovalRequired({
      request: fresh,
      stage: fresh.currentStage || 'Finance Manager',
      actorName: 'System Resend',
    });
    console.log('  -> targeted', approver.code, approver.name);
  }
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
