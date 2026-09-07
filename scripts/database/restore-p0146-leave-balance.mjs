/**
 * One-time correction: cancel P0146's unapproved Sage annual leave (1 day on 2026-10-02)
 * and restore CurrentBalance so pending/unapproved no longer holds the day.
 *
 * Usage: node scripts/database/restore-p0146-leave-balance.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import sql from 'mssql';

const EMPLOYEE_CODE = 'P0146';
const APPLICATION_ID = 'sage-leave-tx-1084';

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

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

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
  const beforeApp = await pool
    .request()
    .input('Id', sql.NVarChar(120), APPLICATION_ID)
    .query(`
SELECT Id, LeaveType, StartDate, EndDate, Days, StatusName, ApprovalStatus, BalanceImpact, SourceSystem
FROM hris.LeaveApplications WHERE Id = @Id;`);

  const beforeBal = await pool
    .request()
    .input('EmployeeId', sql.NVarChar(80), EMPLOYEE_CODE)
    .query(`
SELECT LeaveType, CurrentBalance, AccruedBalance, UsedBalance, PendingBalance, SourceSystem, UpdatedAt
FROM hris.LeaveBalances
WHERE EmployeeId = @EmployeeId AND LeaveType = N'Annual Leave';`);

  const app = beforeApp.recordset[0];
  if (!app) {
    console.error(`Application ${APPLICATION_ID} not found.`);
    process.exit(1);
  }

  console.log('BEFORE', JSON.stringify({ application: app, balance: beforeBal.recordset[0] }, null, 2));

  await pool
    .request()
    .input('Id', sql.NVarChar(120), APPLICATION_ID)
    .query(`
UPDATE hris.LeaveApplications
SET StatusName = N'Cancelled',
    WorkflowStage = N'Closed',
    ApprovalStatus = N'Cancelled',
    UpdatedAt = SYSUTCDATETIME()
WHERE Id = @Id
  AND StatusName IN (N'Submitted', N'Under Review', N'Line Manager Review', N'HR Review');`);

  const leaveYear = new Date().getFullYear();
  const usage = await pool
    .request()
    .input('EmployeeId', sql.NVarChar(80), EMPLOYEE_CODE)
    .input('LeaveYear', sql.Int, leaveYear)
    .query(`
SELECT
  SUM(CASE WHEN StatusName IN (N'Approved', N'Completed') THEN BalanceImpact ELSE 0 END) AS UsedDays,
  SUM(CASE WHEN StatusName IN (N'Submitted', N'Under Review', N'Line Manager Review', N'HR Review') THEN BalanceImpact ELSE 0 END) AS PendingDays
FROM hris.LeaveApplications
WHERE EmployeeId = @EmployeeId
  AND LeaveType = N'Annual Leave'
  AND PolicyComplianceStatus <> N'Blocked'
  AND YEAR(StartDate) = @LeaveYear;`);

  const used = round2(usage.recordset[0]?.UsedDays || 0);
  const pending = round2(usage.recordset[0]?.PendingDays || 0);
  const accrued = round2(beforeBal.recordset[0]?.AccruedBalance ?? 30);
  const current = Math.max(0, round2(accrued - used));

  await pool
    .request()
    .input('EmployeeId', sql.NVarChar(80), EMPLOYEE_CODE)
    .input('CurrentBalance', sql.Decimal(9, 2), current)
    .input('UsedBalance', sql.Decimal(9, 2), used)
    .input('PendingBalance', sql.Decimal(9, 2), pending)
    .query(`
UPDATE hris.LeaveBalances
SET CurrentBalance = @CurrentBalance,
    UsedBalance = @UsedBalance,
    PendingBalance = @PendingBalance,
    SourceSystem = N'DLE_Enterprise HRIS',
    UpdatedAt = SYSUTCDATETIME()
WHERE EmployeeId = @EmployeeId AND LeaveType = N'Annual Leave';`);

  await pool
    .request()
    .input('Id', sql.NVarChar(120), `audit-restore-${EMPLOYEE_CODE.toLowerCase()}-${Date.now()}`)
    .input('Actor', sql.NVarChar(160), 'HRIS Leave Restore Script')
    .input('ActorRole', sql.NVarChar(80), 'System Administrator')
    .input('ActionName', sql.NVarChar(80), 'cancel')
    .input('RecordId', sql.NVarChar(160), APPLICATION_ID)
    .input('OldValue', sql.NVarChar(400), String(app.StatusName || 'Submitted'))
    .input('NewValue', sql.NVarChar(400), `Cancelled; restored Annual Leave CurrentBalance to ${current}`)
    .input('Comments', sql.NVarChar(700), 'Unapproved Sage leave must not hold annual leave balance (P0146 1-day restore).')
    .input('Reason', sql.NVarChar(700), 'Leave application was not approved; return 1 day to annual leave balance.')
    .query(`
INSERT hris.LeaveAuditTrail(Id, Actor, ActorRole, ActionName, RecordId, OldValue, NewValue, Comments, Reason)
VALUES (@Id, @Actor, @ActorRole, @ActionName, @RecordId, @OldValue, @NewValue, @Comments, @Reason);`);

  const afterApp = await pool
    .request()
    .input('Id', sql.NVarChar(120), APPLICATION_ID)
    .query(`
SELECT Id, StatusName, ApprovalStatus, Days, StartDate FROM hris.LeaveApplications WHERE Id = @Id;`);

  const afterBal = await pool
    .request()
    .input('EmployeeId', sql.NVarChar(80), EMPLOYEE_CODE)
    .query(`
SELECT LeaveType, CurrentBalance, AccruedBalance, UsedBalance, PendingBalance, UpdatedAt
FROM hris.LeaveBalances
WHERE EmployeeId = @EmployeeId AND LeaveType = N'Annual Leave';`);

  console.log(
    'AFTER',
    JSON.stringify(
      {
        application: afterApp.recordset[0],
        balance: afterBal.recordset[0],
        computed: { accrued, used, pending, current },
      },
      null,
      2,
    ),
  );
} finally {
  await pool.close();
}
