import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sql from 'mssql';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const loadEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
};
[
  path.join(repo, 'apps/dashboard/.env.local'),
  path.join(repo, 'apps/dashboard/.env'),
  path.join(repo, '.env.local'),
  path.join(repo, '.env'),
].forEach(loadEnvFile);

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

const people = await pool.request().query(`
SELECT e.employee_code, e.full_name, e.employment_status, e.employment_type,
       j.job_title, j.department, j.job_grade, j.reporting_manager
FROM [hris].[Employees] e
LEFT JOIN [hris].[EmployeeJobInfo] j ON j.employee_id = e.employee_id
WHERE e.full_name LIKE '%Mba%'
   OR e.full_name LIKE '%MBA%'
ORDER BY e.employee_code;
`);

const codes = [...new Set(people.recordset.map((r) => String(r.employee_code || '').trim()).filter(Boolean))];
let balances = [];
let apps = [];
if (codes.length) {
  const req = pool.request();
  codes.forEach((c, i) => req.input(`c${i}`, sql.NVarChar(40), c));
  const inList = codes.map((_, i) => `@c${i}`).join(',');
  balances = (await req.query(`
SELECT EmployeeId, FullName, LeaveType, CurrentBalance, AccruedBalance, UsedBalance, PendingBalance,
       StatusName, ExceptionsJson, UpdatedAt
FROM [hris].[LeaveBalances]
WHERE EmployeeId IN (${inList}) AND LeaveType LIKE '%Annual%'
ORDER BY EmployeeId;
`)).recordset;

  const req2 = pool.request();
  codes.forEach((c, i) => req2.input(`c${i}`, sql.NVarChar(40), c));
  apps = (await req2.query(`
SELECT TOP 40 Id, EmployeeId, FullName, LeaveType, StartDate, EndDate, Days, StatusName,
       ApprovalStatus, SourceSystem, CreatedAt, UpdatedAt
FROM [hris].[LeaveApplications]
WHERE EmployeeId IN (${inList})
ORDER BY CreatedAt DESC;
`)).recordset;
}

const eventPaths = [
  path.join(repo, 'data/hris/payroll-leave-allowance-events.json'),
  path.join(repo, 'apps/dashboard/data/hris/payroll-leave-allowance-events.json'),
];
const events = [];
for (const p of eventPaths) {
  if (!fs.existsSync(p)) continue;
  const rows = JSON.parse(fs.readFileSync(p, 'utf8'));
  const hits = rows.filter((e) =>
    /mba/i.test(String(e.fullName || ''))
    || codes.some((c) => String(e.employeeCode || e.employeeId || '').toUpperCase().includes(String(c).replace(/^P0*/, '').toUpperCase())
      || String(e.employeeCode || '').toUpperCase() === String(c).toUpperCase()),
  );
  events.push({ path: p, hits });
  break;
}

console.log(JSON.stringify({ people: people.recordset, balances, apps, events }, null, 2));
await pool.close();
