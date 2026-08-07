/**
 * Grant Rapheal (P0429) Finance Manager and resend payroll FM emails.
 * Standalone script — does not rely on Next path aliases.
 */
const fs = require('node:fs');
const path = require('node:path');
const sql = require('mssql');

const repoRoot = process.cwd();
for (const file of [
  path.join(repoRoot, 'apps', 'dashboard', '.env.local'),
  path.join(repoRoot, 'apps', 'dashboard', '.env'),
]) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

const FINANCE_MANAGER_PERMS = [
  'enterprise.view',
  'finance.view',
  'finance.create',
  'finance.edit',
  'finance.approve',
  'finance.posting.operate',
  'view_finance_intelligence',
  'reports.view',
  'page.payroll.management.bank-finance.view',
  'reports.payroll.bank-schedule.view',
  'button.payroll.post.view',
  'payroll.workflow.finance-review.view',
  'payroll.workflow.finance-review.approve',
  'page.hris.payroll.approval.view',
  'page.payroll.management.approval.view',
  'page.hris.payroll.salary-management.view',
  'page.hris.payroll.salary-structure.view',
  'page.hris.payroll.employee-salary-setup.view',
  'payroll.approve',
];

const bool = (value, fallback = true) => {
  if (value == null || value === '') return fallback;
  return !/^(0|false|no|off)$/i.test(String(value));
};

async function main() {
  const pool = await sql.connect({
    server: process.env.DLE_ENTERPRISE_DB_HOST || process.env.MSSQL_HOST || 'localhost',
    database: process.env.DLE_ENTERPRISE_DB_NAME || process.env.MSSQL_DATABASE || 'DLE_Enterprise',
    user: process.env.DLE_ENTERPRISE_DB_USER || process.env.MSSQL_USER,
    password: process.env.DLE_ENTERPRISE_DB_PASSWORD || process.env.MSSQL_PASSWORD,
    options: {
      encrypt: bool(process.env.DLE_ENTERPRISE_DB_ENCRYPT, true),
      trustServerCertificate: bool(process.env.DLE_ENTERPRISE_DB_TRUST_SERVER_CERTIFICATE, true),
      enableArithAbort: true,
    },
  });

  const userResult = await pool.request().query(`
SELECT [UserId], [Username], [EmployeeCode], [Email], [UserJson]
FROM [security].[AuthUsers]
WHERE [Deleted] = 0
  AND (
    UPPER(LTRIM(RTRIM([EmployeeCode]))) = N'P0429'
    OR UPPER(LTRIM(RTRIM([Username]))) = N'P0429'
    OR [UserJson] LIKE N'%IYANDA%'
  )
`);
  if (!userResult.recordset.length) throw new Error('Rapheal P0429 not found in security.AuthUsers');
  const row = userResult.recordset[0];
  const user = JSON.parse(row.UserJson);
  const roles = Array.from(new Set([...(user.roles || []), 'Accountant', 'Finance Manager']));
  const permissions = Array.from(new Set([...(user.permissions || []), ...FINANCE_MANAGER_PERMS]));
  const updated = {
    ...user,
    roles,
    permissions,
    status: 'Active',
    firstLoginRequired: false,
    passwordResetRequired: false,
    updatedAt: new Date().toISOString(),
  };

  await pool.request()
    .input('UserId', sql.NVarChar(80), updated.id || row.UserId)
    .input('Username', sql.NVarChar(120), updated.username || row.Username)
    .input('EmployeeCode', sql.NVarChar(40), updated.employeeCode || 'P0429')
    .input('EmployeeId', sql.NVarChar(40), updated.employeeId || 'P0429')
    .input('Email', sql.NVarChar(200), updated.email || row.Email || '')
    .input('UserJson', sql.NVarChar(sql.MAX), JSON.stringify(updated))
    .input('Deleted', sql.Bit, 0)
    .query(`
MERGE [security].[AuthUsers] AS target
USING (SELECT @UserId AS [UserId]) AS source
ON target.[UserId] = source.[UserId]
WHEN MATCHED THEN UPDATE SET
  [Username] = @Username,
  [EmployeeCode] = @EmployeeCode,
  [EmployeeId] = @EmployeeId,
  [Email] = @Email,
  [UserJson] = @UserJson,
  [Deleted] = @Deleted,
  [UpdatedAt] = SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT ([UserId], [Username], [EmployeeCode], [EmployeeId], [Email], [UserJson], [Deleted])
VALUES (@UserId, @Username, @EmployeeCode, @EmployeeId, @Email, @UserJson, @Deleted);
`);

  // Keep JSON fallback in sync when writable.
  const usersJsonPath = path.join(repoRoot, 'apps', 'dashboard', 'data', 'auth', 'users.json');
  try {
    if (fs.existsSync(usersJsonPath)) {
      const users = JSON.parse(fs.readFileSync(usersJsonPath, 'utf8'));
      const next = users.map((item) => (item.id === updated.id || item.username === 'P0429' ? { ...item, ...updated } : item));
      fs.writeFileSync(usersJsonPath, JSON.stringify(next, null, 2));
    }
  } catch (error) {
    console.warn('Could not sync users.json fallback:', error.message || error);
  }

  console.log(JSON.stringify({
    granted: {
      id: updated.id,
      username: updated.username,
      fullName: updated.fullName,
      email: updated.email,
      status: updated.status,
      roles: updated.roles,
    },
  }, null, 2));

  // Find HR Approved payroll runs from hris.PayrollRuns.
  let pendingRuns = [];
  try {
    const runsResult = await pool.request().query(`
SELECT TOP 50 [run_id], [period_code], [run_json]
FROM [hris].[PayrollRuns]
WHERE [run_json] LIKE N'%"status":"HR Approved"%'
   OR [run_json] LIKE N'%"status": "HR Approved"%'
ORDER BY [modified_at] DESC
`);
    pendingRuns = (runsResult.recordset || []).map((item) => {
      const parsed = item.run_json ? JSON.parse(item.run_json) : {};
      return {
        ...parsed,
        id: item.run_id || parsed.id,
        period: item.period_code || parsed.period,
        status: parsed.status || 'HR Approved',
        periodLabel: parsed.periodLabel || item.period_code,
        pack: parsed.pack || 'salaried',
        grossPay: Number(parsed.grossPay || 0),
        netPay: Number(parsed.netPay || 0),
        employeeCount: Number(parsed.employeeCount || 0),
      };
    }).filter((run) => run.status === 'HR Approved');
  } catch (error) {
    console.warn('Could not query hris.PayrollRuns:', error.message || error);
  }

  console.log(`HR Approved runs found: ${pendingRuns.length}`);
  if (!pendingRuns.length) {
    console.log('No HR Approved runs to notify. Role grant is complete — Rapheal can approve when a run reaches FM stage.');
    await pool.close();
    return;
  }

  // Prefer calling the live notification module after deploy; for now mark that resend should happen via API after publish.
  const markerPath = path.join(repoRoot, 'scripts', '.rapheal-fm-resend-pending.json');
  fs.writeFileSync(markerPath, JSON.stringify({
    at: new Date().toISOString(),
    recipient: { code: 'P0429', email: updated.email, name: updated.fullName },
    runs: pendingRuns.map((run) => ({ id: run.id, period: run.period, pack: run.pack, periodLabel: run.periodLabel })),
  }, null, 2));
  console.log(`Wrote resend marker: ${markerPath}`);
  console.log('After deploy, run: npx tsx scripts/resend-payroll-fm-approval.ts');

  await pool.close();
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
