import sql from 'mssql';
import { getDleEnterpriseDbPool, loadWorkspaceEnv } from '../apps/dashboard/lib/dle-enterprise-db.ts';

loadWorkspaceEnv();
const pool = await getDleEnterpriseDbPool();
if (!pool) throw new Error('no db');
const result = await pool.request().query(`
SELECT WorkflowStatus, COUNT(*) AS total
FROM hris.OvertimeAuthorizationRequests WITH (NOLOCK)
GROUP BY WorkflowStatus
`);
console.log(JSON.stringify(result.recordset, null, 2));
process.exit(0);
