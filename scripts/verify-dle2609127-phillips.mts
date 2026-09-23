import { loadWorkspaceEnv } from '../apps/dashboard/lib/dle-enterprise-db.ts';
import { getPaymentRequestById } from '../apps/dashboard/lib/finance-intelligence/payment-requests-service.ts';
import { ensureFinanceDb } from '../apps/dashboard/lib/finance-intelligence/store.ts';
import { isAssignedPaymentApprover } from '../apps/dashboard/lib/finance-intelligence/payment-access.ts';

loadWorkspaceEnv();

const main = async () => {
  const pool = await ensureFinanceDb();
  if (!pool) throw new Error('NO_FINANCE');
  const row = await getPaymentRequestById('PREQ-1790081818894');
  const inbox = row
    ? isAssignedPaymentApprover(
      { actorCode: 'P0464', roles: ['Project Manager'] },
      row,
    )
    : false;
  console.log(JSON.stringify({
    requestId: row?.requestId,
    requestNumber: row?.requestNumber,
    status: row?.status,
    currentStage: row?.currentStage,
    currentApproverCode: row?.currentApproverCode,
    currentApproverName: row?.currentApproverName,
    phillipsInboxMatch: inbox,
  }, null, 2));
  process.exit(0);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
