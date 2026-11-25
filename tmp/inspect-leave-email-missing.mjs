import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sql from 'mssql';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const rel of ['apps/dashboard/.env.local', 'apps/dashboard/.env', '.env.local', '.env']) {
  const filePath = path.join(repo, rel);
  if (!fs.existsSync(filePath)) continue;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let value = t.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

const codes = ['P0330', 'C1705', 'C2326', 'C2383'];
const pool = await sql.connect({
  server: process.env.DLE_ENTERPRISE_DB_HOST || process.env.DLE_ENTERPRISE_DB_SERVER,
  port: Number(process.env.DLE_ENTERPRISE_DB_PORT || 1433),
  database: process.env.DLE_ENTERPRISE_DB_NAME,
  user: process.env.DLE_ENTERPRISE_DB_USER,
  password: process.env.DLE_ENTERPRISE_DB_PASSWORD,
  options: {
    encrypt: String(process.env.DLE_ENTERPRISE_DB_ENCRYPT || '').toLowerCase() === 'true',
    trustServerCertificate: true,
  },
});

const req = pool.request();
codes.forEach((c, i) => req.input(`c${i}`, sql.NVarChar(40), c));
const inList = codes.map((_, i) => `@c${i}`).join(',');

const emp = await req.query(`
SELECT e.employee_id, e.employee_code, e.full_name, e.employment_status, e.employment_type,
       c.official_email, c.personal_email, c.primary_phone,
       j.job_title, j.department, j.reporting_manager
FROM [hris].[Employees] e
LEFT JOIN [hris].[EmployeeContactInfo] c ON c.employee_id = e.employee_id
LEFT JOIN [hris].[EmployeeJobInfo] j ON j.employee_id = e.employee_id
WHERE e.employee_code IN (${inList})
ORDER BY e.employee_code;
`);

const authUsersPath = path.join(repo, 'apps/dashboard/data/auth/users.json');
const users = JSON.parse(fs.readFileSync(authUsersPath, 'utf8'));
const authHits = users.filter((u) => codes.includes(String(u.employeeCode || u.employeeId || '').toUpperCase())
  || codes.includes(String(u.username || '').toUpperCase()));

console.log(JSON.stringify({
  sql: emp.recordset,
  auth: authHits.map((u) => ({
    username: u.username,
    employeeCode: u.employeeCode,
    fullName: u.fullName,
    email: u.email,
    status: u.status,
    employmentStatus: u.employmentStatus,
  })),
}, null, 2));

await pool.close();
