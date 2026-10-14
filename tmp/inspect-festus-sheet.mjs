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

const sheets = await pool.request().query(`
  SELECT t.Id, t.WorkDate, t.SupervisorName, t.LocationName, t.ShiftLabel, t.Status,
    COUNT(DISTINCT l.EmployeeCode) AS People
  FROM tsmgmt.Timesheets t
  INNER JOIN tsmgmt.TimesheetEntryLines l ON l.TimesheetId = t.Id
  WHERE t.WorkDate >= '2026-10-01'
    AND EXISTS (
      SELECT 1 FROM tsmgmt.TimesheetEntryLines x
      WHERE x.TimesheetId = t.Id AND x.EmployeeCode IN (N'C2823', N'C1686', N'C1229', N'C1544')
    )
  GROUP BY t.Id, t.WorkDate, t.SupervisorName, t.LocationName, t.ShiftLabel, t.Status
  ORDER BY t.WorkDate DESC, t.SupervisorName
`);
console.log('SHEETS_WITH_SHOT_PEOPLE');
for (const row of sheets.recordset) {
  console.log([day(row.WorkDate), row.SupervisorName, row.LocationName || '-', row.ShiftLabel, row.Status, row.People, row.Id].join(' | '));
}

const codes = await pool.request().query(`
  SELECT TOP 30 t.WorkDate, t.SupervisorName, t.ShiftLabel, a.ProjectCode, a.ProjectName, COUNT(*) AS Rows
  FROM tsmgmt.TimesheetAllocations a
  INNER JOIN tsmgmt.TimesheetEntryLines l ON l.Id = a.LineId
  INNER JOIN tsmgmt.Timesheets t ON t.Id = l.TimesheetId
  WHERE t.WorkDate >= '2026-10-10'
    AND (a.ProjectCode LIKE N'DLPC00%' OR a.ProjectCode IN (N'DL2601', N'DL2801'))
  GROUP BY t.WorkDate, t.SupervisorName, t.ShiftLabel, a.ProjectCode, a.ProjectName
  ORDER BY t.WorkDate DESC, t.SupervisorName, a.ProjectCode
`);
console.log('RECENT_PROJECT_COLS');
for (const row of codes.recordset) {
  console.log([day(row.WorkDate), row.SupervisorName, row.ShiftLabel, row.ProjectCode, row.ProjectName, row.Rows].join(' | '));
}

const festus = await pool.request().query(`
  SELECT t.WorkDate, t.SupervisorName, t.LocationName, t.ShiftLabel, l.LocationName AS LineLoc, l.OperationalStatus
  FROM tsmgmt.TimesheetEntryLines l
  INNER JOIN tsmgmt.Timesheets t ON t.Id = l.TimesheetId
  WHERE l.EmployeeCode = N'C2015' AND t.WorkDate >= '2026-10-01'
  ORDER BY t.WorkDate DESC
`);
console.log('FESTUS_OCT_LINES');
for (const row of festus.recordset) {
  console.log([day(row.WorkDate), row.SupervisorName, row.ShiftLabel, row.LocationName || '-', row.LineLoc, row.OperationalStatus].join(' | '));
}

await pool.close();
