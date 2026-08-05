/**
 * Fix Rapheal (P0429) official email leading hyphen and sync auth user email.
 *
 * Usage:
 *   npx --yes tsx --tsconfig apps/dashboard/tsconfig.json scripts/database/fix-rapheal-email.mts
 */
import fs from 'node:fs';
import path from 'node:path';
import sql from 'mssql';

for (const file of [
  path.join(process.cwd(), 'apps', 'dashboard', '.env.local'),
  path.join(process.cwd(), 'apps', 'dashboard', '.env'),
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

const CODE = 'P0429';
const FALLBACK = 'raphealiyanda@dormanlongeng.com';

const normalizeEmail = (value: unknown) => {
  let email = String(value ?? '').trim().toLowerCase().replace(/^[^a-z0-9]+/i, '');
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email) ? email : '';
};

const main = async () => {
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

  const before = await pool.request()
    .input('code', sql.NVarChar(60), CODE)
    .query(`
SELECT e.employee_id, e.employee_code, c.official_email, c.personal_email
FROM [hris].[Employees] e
LEFT JOIN [hris].[EmployeeContactInfo] c ON c.employee_id = e.employee_id
WHERE e.employee_code = @code
`);
  console.log('HRIS before', before.recordset);

  const fixed = normalizeEmail(before.recordset?.[0]?.official_email) || FALLBACK;
  console.log('Writing official email as', fixed);

  await pool.request()
    .input('code', sql.NVarChar(60), CODE)
    .input('email', sql.NVarChar(320), fixed)
    .query(`
UPDATE c
SET c.official_email = @email,
    c.modified_at = SYSUTCDATETIME()
FROM [hris].[EmployeeContactInfo] c
INNER JOIN [hris].[Employees] e ON e.employee_id = c.employee_id
WHERE e.employee_code = @code
`);

  const usersPath = path.join(process.cwd(), 'apps', 'dashboard', 'data', 'auth', 'users.json');
  const users = JSON.parse(fs.readFileSync(usersPath, 'utf8')) as Array<Record<string, unknown>>;
  let updatedUsers = 0;
  for (const user of users) {
    const code = String(user.employeeCode || user.employeeId || user.username || '').toUpperCase();
    if (code !== CODE) continue;
    user.email = fixed;
    user.updatedAt = new Date().toISOString();
    updatedUsers += 1;
  }
  fs.writeFileSync(usersPath, `${JSON.stringify(users, null, 2)}\n`, 'utf8');
  console.log('Auth users updated', updatedUsers);

  const after = await pool.request()
    .input('code', sql.NVarChar(60), CODE)
    .query(`
SELECT e.employee_code, c.official_email
FROM [hris].[Employees] e
LEFT JOIN [hris].[EmployeeContactInfo] c ON c.employee_id = e.employee_id
WHERE e.employee_code = @code
`);
  console.log('HRIS after', after.recordset);
  await pool.close();
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
