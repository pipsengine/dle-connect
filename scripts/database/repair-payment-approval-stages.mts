/**
 * Re-seed Approval Limits (MD removed from default open bands) and repair open payment stages.
 *
 * Usage:
 *   npx --yes tsx --tsconfig apps/dashboard/tsconfig.json scripts/database/repair-payment-approval-stages.mts
 */
import { loadWorkspaceEnv } from '../../apps/dashboard/lib/dle-enterprise-db.ts';
import {
  resolveApprovalChain,
  seedDefaultApprovalLimits,
} from '../../apps/dashboard/lib/finance-intelligence/approval-matrix-service.ts';
import {
  buildPaymentRequestsWorkspace,
  getPaymentRequestById,
} from '../../apps/dashboard/lib/finance-intelligence/payment-requests-service.ts';
import { ensureFinanceDb } from '../../apps/dashboard/lib/finance-intelligence/store.ts';
import sql from 'mssql';

loadWorkspaceEnv();

const main = async () => {
  console.log('Seeding default approval limit bands…');
  await seedDefaultApprovalLimits('System MD/Treasury Repair');

  const workspace = await buildPaymentRequestsWorkspace();
  const open = workspace.rows.filter((row) =>
    /pending approval|submitted|finance review|ready for treasury|approved/i.test(row.status));
  console.log(`Checking ${open.length} open payment request(s).`);

  const pool = await ensureFinanceDb();
  if (!pool) throw new Error('Finance DB unavailable');

  for (const row of open) {
    const fresh = (await getPaymentRequestById(row.requestId)) || row;
    const matched = await resolveApprovalChain({
      amount: fresh.netAmount,
      currencyCode: fresh.currencyCode || 'NGN',
      department: fresh.department,
      projectCode: fresh.projectCode,
      requesterCode: fresh.requesterCode,
      supervisorName: fresh.supervisorName,
    });
    if (!matched?.stages?.length) {
      console.log(`SKIP ${fresh.requestNumber}: no matrix match`);
      continue;
    }
    const existing = Array.isArray(fresh.payload?.stages)
      ? (fresh.payload.stages as string[]).map((s) => String(s))
      : [];
    const same = existing.length === matched.stages.length
      && existing.every((stage, index) => stage.toLowerCase() === matched.stages[index].toLowerCase());
    if (same) {
      console.log(`OK ${fresh.requestNumber}: ${matched.stages.join(' → ')}`);
      continue;
    }

    const nextPayload = {
      ...fresh.payload,
      stages: matched.stages,
      matrixRuleName: matched.ruleName,
      approvalLevel: matched.approvalLevel,
      pathType: matched.pathType,
      amountNgn: matched.amountNgn,
      fxRate: matched.fxRate,
      repairedStages: true,
      repairedAt: new Date().toISOString(),
    };

    // Keep current stage if it is still in the corrected chain; otherwise first unfinished stage.
    let nextStage = fresh.currentStage;
    if (!matched.stages.some((stage) => stage.toLowerCase() === String(fresh.currentStage || '').toLowerCase())) {
      nextStage = matched.stages[0];
    }

    await pool.request()
      .input('RequestId', sql.NVarChar(60), fresh.requestId)
      .input('PayloadJson', sql.NVarChar(sql.MAX), JSON.stringify(nextPayload))
      .input('CurrentStage', sql.NVarChar(80), nextStage)
      .query(`
UPDATE [finance].[PaymentRequests]
SET [PayloadJson] = @PayloadJson,
    [CurrentStage] = @CurrentStage,
    [UpdatedAt] = SYSUTCDATETIME()
WHERE [RequestId] = @RequestId
`);

    console.log(`FIXED ${fresh.requestNumber}: ${existing.join(' → ') || '(none)'} => ${matched.stages.join(' → ')} (current=${nextStage})`);
  }
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
