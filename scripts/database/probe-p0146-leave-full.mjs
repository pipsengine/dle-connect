import fs from 'node:fs';
import path from 'node:path';
import sql from 'mssql';

const loadEnv = () => {
  for (const file of [
    path.join(process.cwd(), 'apps', 'dashboard', '.env.local'),
    path.join(process.cwd(), 'apps', 'dashboard', '.env'),
  ]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match || process.env[match[1]]) continue;
      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[match[1]] = value;
    }
  }
};

loadEnv();

const pool = await sql.connect({
  server: process.env.DLE_ENTERPRISE_DB_HOST,
  database: process.env.DLE_ENTERPRISE_DB_NAME,
  user: process.env.DLE_ENTERPRISE_DB_USER,
  password: process.env.DLE_ENTERPRISE_DB_PASSWORD,
  options: {
    encrypt: String(process.env.DLE_ENTERPRISE_DB_ENCRYPT || 'true').toLowerCase() === 'true',
    trustServerCertificate: true,
  },
});

try {
  const balances = await pool
    .request()
    .input('id', sql.NVarChar, 'P0146')
    .query(`
SELECT EmployeeId, LeaveType, CurrentBalance, AccruedBalance, UsedBalance, PendingBalance,
       ForfeitedBalance, CarryForwardBalance, StatusName, SourceSystem, UpdatedAt, ExceptionsJson
FROM hris.LeaveBalances
WHERE EmployeeId = @id
ORDER BY LeaveType;`);

  const apps = await pool
    .request()
    .input('id', sql.NVarChar, 'P0146')
    .query(`
SELECT Id, EmployeeId, LeaveType, StartDate, EndDate, Days, StatusName, WorkflowStage, ApprovalStatus,
       PolicyComplianceStatus, BalanceImpact, AvailableBalance, SourceSystem, CreatedAt, UpdatedAt
FROM hris.LeaveApplications
WHERE EmployeeId = @id
ORDER BY StartDate DESC;`);

  const pendingAnnual = await pool
    .request()
    .input('id', sql.NVarChar, 'P0146')
    .query(`
SELECT Id, LeaveType, StartDate, EndDate, Days, StatusName, BalanceImpact, SourceSystem, ApprovalStatus
FROM hris.LeaveApplications
WHERE EmployeeId = @id
  AND LeaveType = N'Annual Leave'
  AND StatusName IN (N'Submitted', N'Under Review', N'Line Manager Review', N'HR Review')
ORDER BY StartDate DESC;`);

  const sageTx = apps.recordset.filter((row) => String(row.Id || '').startsWith('sage-leave-tx-'));

  console.log(
    JSON.stringify(
      {
        balances: balances.recordset,
        applications: apps.recordset,
        pendingAnnual: pendingAnnual.recordset,
        sageSyncedApps: sageTx,
      },
      null,
      2,
    ),
  );
} finally {
  await pool.close();
}
