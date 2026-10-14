import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sql from 'mssql';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const loadEnvFile = (filePath) => {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
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
loadEnvFile(path.join(repo, '.env'));
loadEnvFile(path.join(repo, 'apps/dashboard/.env'));

const pool = await sql.connect({
  server: process.env.DLE_ENTERPRISE_DB_HOST || process.env.DLE_ENTERPRISE_DB_SERVER,
  port: Number(process.env.DLE_ENTERPRISE_DB_PORT || 1433),
  database: process.env.DLE_ENTERPRISE_DB_NAME,
  user: process.env.DLE_ENTERPRISE_DB_USER,
  password: process.env.DLE_ENTERPRISE_DB_PASSWORD,
  options: { encrypt: false, trustServerCertificate: true },
});

const rows = await pool.request().query(`
  SELECT employee_code, employee_name, supervisor_employee_code, supervisor_name, matched_status
  FROM hris.SupervisorEmployeeAssignments
  WHERE employee_code IN (N'C2225', N'C2015') OR supervisor_employee_code IN (N'C2225', N'P0013')
  ORDER BY supervisor_name, employee_name
`);
console.log('ASSIGN');
for (const row of rows.recordset) {
  console.log([row.employee_code, row.employee_name, row.supervisor_employee_code, row.supervisor_name, row.matched_status].join(' | '));
}

const samuel = await pool.request().query(`
  SELECT employee_code, full_name, job_title FROM hris.EmployeeMasterView
  WHERE full_name LIKE N'%KARONWI%' OR employee_code IN (N'P0013', N'C0013')
`);
console.log('SAMUEL');
for (const row of samuel.recordset) console.log([row.employee_code, row.full_name, row.job_title].join(' | '));

await pool.close();
