import { loadWorkspaceEnv } from '../../apps/dashboard/lib/dle-enterprise-db.ts';
import { ensureFinanceDb } from '../../apps/dashboard/lib/finance-intelligence/store.ts';
import { listApprovalMatrixRules, resolveApprovalChain } from '../../apps/dashboard/lib/finance-intelligence/approval-matrix-service.ts';

loadWorkspaceEnv();

const main = async () => {
  const pool = await ensureFinanceDb();
  console.log('pool', Boolean(pool), {
    host: process.env.DLE_ENTERPRISE_DB_HOST,
    db: process.env.DLE_ENTERPRISE_DB_NAME,
  });
  if (pool) {
    try {
      const raw = await pool.request().query('SELECT COUNT(1) AS c FROM [finance].[ApprovalMatrix]');
      console.log('raw count', raw.recordset);
      const sample = await pool.request().query('SELECT TOP 3 MatrixId, PathType, MinAmount, MaxAmount, StagesJson, Status, IsActive FROM [finance].[ApprovalMatrix]');
      console.log('sample', JSON.stringify(sample.recordset, null, 2));
    } catch (error) {
      console.error('raw query failed', error);
    }
  }
  const rules = await listApprovalMatrixRules();
  console.log('mapped rules', rules.length, rules.map((r) => ({ id: r.matrixId, path: r.pathType, stages: r.stages, active: r.isActive, status: r.status })));
  const chain = await resolveApprovalChain({ amount: 650000, currencyCode: 'NGN' });
  console.log('chain', chain);
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
