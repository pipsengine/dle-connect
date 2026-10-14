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

const mob = await pool.request().query(`
  SELECT e.EmployeeCode, e.EmployeeName, e.Status, e.HomeSupervisor, e.HomeLocation, h.OffshoreSite, h.OffshoreSupervisor, h.ProjectCode
  FROM tsmgmt.MobilizationEmployees e
  INNER JOIN tsmgmt.Mobilizations h ON h.Id = e.MobilizationId
  WHERE e.Status IN (N'Planned', N'Mobilized', N'Extended')
    AND e.EffectiveFrom <= '2026-10-14'
    AND (e.ActualReturn IS NULL OR e.ActualReturn >= '2026-10-14')
  ORDER BY h.OffshoreSupervisor, e.EmployeeName
`);
console.log('ACTIVE_MOB');
for (const row of mob.recordset) {
  console.log([row.EmployeeCode, row.EmployeeName, row.OffshoreSite, row.OffshoreSupervisor, row.ProjectCode, row.HomeSupervisor, row.HomeLocation].join(' | '));
}

const samuel = await pool.request().query(`
  SELECT l.EmployeeCode, l.EmployeeName, l.LocationName, l.OperationalStatus,
    MAX(CASE WHEN a.ProjectCode = N'DL2601' THEN a.RegularHours END) AS Reg,
    MAX(CASE WHEN a.ProjectCode = N'DL2601' THEN a.OvtHours END) AS Ovt
  FROM tsmgmt.TimesheetEntryLines l
  LEFT JOIN tsmgmt.TimesheetAllocations a ON a.LineId = l.Id
  WHERE l.TimesheetId = N'ts-mv6ijadw-qdorar'
  GROUP BY l.EmployeeCode, l.EmployeeName, l.LocationName, l.OperationalStatus
  ORDER BY l.EmployeeName
`);
console.log('SAMUEL_13');
for (const row of samuel.recordset) {
  console.log([row.EmployeeCode, row.EmployeeName, row.LocationName, row.OperationalStatus, row.Reg, row.Ovt].join(' | '));
}

const abel = await pool.request().query(`
  SELECT l.EmployeeCode, l.EmployeeName,
    SUM(CASE WHEN a.ProjectCode = N'DL2601' THEN a.RegularHours ELSE 0 END) AS Reg,
    SUM(CASE WHEN a.ProjectCode = N'DL2601' THEN a.OvtHours ELSE 0 END) AS Ovt
  FROM tsmgmt.TimesheetEntryLines l
  LEFT JOIN tsmgmt.TimesheetAllocations a ON a.LineId = l.Id
  WHERE l.TimesheetId = N'ts-mv7tln1q-gzfouy'
  GROUP BY l.EmployeeCode, l.EmployeeName
  ORDER BY l.EmployeeName
`);
console.log('ABEL_14_HOURS');
for (const row of abel.recordset) console.log([row.EmployeeCode, row.EmployeeName, row.Reg, row.Ovt].join(' | '));

const name = await pool.request().query(`
  SELECT employee_code, full_name, first_name, last_name, job_title, work_location
  FROM hris.EmployeeMasterView
  WHERE full_name LIKE N'%ABEL DANIEL%' OR employee_code IN (N'C2225', N'P2225')
`);
console.log('ABEL_MASTER');
for (const row of name.recordset) console.log([row.employee_code, row.full_name, row.job_title, row.work_location].join(' | '));

await pool.close();
