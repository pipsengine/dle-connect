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
const day = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString().slice(0, 10);
};

const rows = await pool.request().query(`
  SELECT h.Id, h.MobilizationNo, h.CreatedAt, h.CreatedBy, h.OffshoreSupervisor, h.OffshoreSite, h.ProjectCode, h.EffectiveFrom,
    e.EmployeeCode, e.EmployeeName, e.HomeSupervisor, e.ExceptionStatus
  FROM tsmgmt.Mobilizations h
  INNER JOIN tsmgmt.MobilizationEmployees e ON e.MobilizationId = h.Id
  WHERE e.EmployeeCode IN (N'C2015', N'C2823', N'C1686', N'C1229', N'C1544', N'C2456')
  ORDER BY h.CreatedAt, e.EmployeeName
`);
console.log('MOB_BATCHES');
for (const row of rows.recordset) {
  console.log([row.MobilizationNo, day(row.CreatedAt), row.CreatedBy, row.OffshoreSupervisor, row.EmployeeCode, row.EmployeeName, row.HomeSupervisor, row.ExceptionStatus].join(' | '));
}

const today = await pool.request().query(`
  SELECT t.Id, t.WorkDate, t.SupervisorName, t.Status, t.LocationName,
    (SELECT COUNT(1) FROM tsmgmt.TimesheetEntryLines l WHERE l.TimesheetId = t.Id) AS People
  FROM tsmgmt.Timesheets t
  WHERE t.WorkDate = '2026-10-14'
  ORDER BY t.SupervisorName
`);
console.log('TODAY_SHEETS');
for (const row of today.recordset) console.log([row.SupervisorName, row.Status, row.LocationName || '-', row.People, row.Id].join(' | '));

await pool.close();
