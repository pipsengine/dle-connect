/**
 * Grant CFO (P0458 Mamora) and MD/Executive Director (P0413 Ijeli) payroll approval access.
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

const CFO_PERMS = [
  'enterprise.view',
  'hris.view',
  'finance.view',
  'finance.approve',
  'view_finance_intelligence',
  'reports.view',
  'reports.export',
  'page.payroll.management.bank-finance.view',
  'reports.payroll.bank-schedule.view',
  'page.hris.payroll.salary-management.view',
  'page.hris.payroll.salary-structure.view',
  'page.hris.payroll.employee-salary-setup.view',
  'page.hris.payroll.approval.view',
  'page.payroll.management.approval.view',
  'payroll.workflow.cfo-approval.view',
  'payroll.workflow.cfo-approval.approve',
  'payroll.approve',
];

const MD_PERMS = [
  'enterprise.view',
  'dashboard.view',
  'hris.view',
  'reports.view',
  'reports.export',
  'page.payroll.management.bank-finance.view',
  'reports.payroll.bank-schedule.view',
  'page.hris.payroll.salary-management.view',
  'page.hris.payroll.salary-structure.view',
  'page.hris.payroll.employee-salary-setup.view',
  'page.hris.payroll.approval.view',
  'page.payroll.management.approval.view',
  'payroll.workflow.md-approval.view',
  'payroll.workflow.md-approval.approve',
  'payroll.approve',
];

const GRANTS = [
  {
    code: 'P0458',
    nameHint: 'MAMORA',
    addRoles: ['CFO'],
    keepRoles: ['Accountant'],
    permissions: CFO_PERMS,
    label: 'CFO',
  },
  {
    code: 'P0413',
    nameHint: 'IJELI',
    addRoles: ['Executive Director'],
    keepRoles: ['Employee'],
    permissions: MD_PERMS,
    label: 'MD / Executive Director',
  },
];

const bool = (value, fallback = true) => {
  if (value == null || value === '') return fallback;
  return !/^(0|false|no|off)$/i.test(String(value));
};

async function upsertUser(pool, updated, row) {
  await pool.request()
    .input('UserId', sql.NVarChar(80), updated.id || row.UserId)
    .input('Username', sql.NVarChar(120), updated.username || row.Username)
    .input('EmployeeCode', sql.NVarChar(40), updated.employeeCode || row.EmployeeCode)
    .input('EmployeeId', sql.NVarChar(40), updated.employeeId || updated.employeeCode || row.EmployeeCode)
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
}

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

  const granted = [];

  for (const grant of GRANTS) {
    const userResult = await pool.request().query(`
SELECT [UserId], [Username], [EmployeeCode], [Email], [UserJson]
FROM [security].[AuthUsers]
WHERE [Deleted] = 0
  AND (
    UPPER(LTRIM(RTRIM([EmployeeCode]))) = N'${grant.code}'
    OR UPPER(LTRIM(RTRIM([Username]))) = N'${grant.code}'
  )
`);
    if (!userResult.recordset.length) {
      throw new Error(`${grant.label} ${grant.code} not found in security.AuthUsers`);
    }
    const row = userResult.recordset[0];
    const user = JSON.parse(row.UserJson);
    if (!String(user.fullName || '').toUpperCase().includes(grant.nameHint)) {
      console.warn(`Warning: ${grant.code} fullName="${user.fullName}" does not include ${grant.nameHint}`);
    }
    const roles = Array.from(new Set([
      ...(user.roles || []),
      ...grant.keepRoles,
      ...grant.addRoles,
    ]));
    const permissions = Array.from(new Set([
      ...(user.permissions || []),
      ...grant.permissions,
    ]));
    const updated = {
      ...user,
      roles,
      permissions,
      status: 'Active',
      firstLoginRequired: false,
      passwordResetRequired: false,
      updatedAt: new Date().toISOString(),
    };

    await upsertUser(pool, updated, row);
    granted.push({
      id: updated.id,
      username: updated.username,
      fullName: updated.fullName,
      email: updated.email,
      status: updated.status,
      roles: updated.roles,
      label: grant.label,
    });

    // Sync JSON fallback for the primary account only.
    const usersJsonPath = path.join(repoRoot, 'apps', 'dashboard', 'data', 'auth', 'users.json');
    try {
      if (fs.existsSync(usersJsonPath)) {
        const users = JSON.parse(fs.readFileSync(usersJsonPath, 'utf8'));
        const next = users.map((item) => (
          item.id === updated.id || item.username === grant.code || item.employeeCode === grant.code
            ? { ...item, ...updated }
            : item
        ));
        fs.writeFileSync(usersJsonPath, JSON.stringify(next, null, 2));
      }
    } catch (error) {
      console.warn('Could not sync users.json fallback:', error.message || error);
    }
  }

  console.log(JSON.stringify({ granted }, null, 2));
  await pool.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
