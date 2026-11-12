import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sql from 'mssql';
import { bookedOffshoreLinesForSheet, mobilizationBelongsOnSheet } from '../apps/dashboard/lib/timesheet-mobilization-sheet.ts';
import { timesheetLocationsMatch } from '../apps/dashboard/lib/timesheet-agege-blasting.ts';

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
};
[
  '.env.local',
  '.env',
  'apps/dashboard/.env.local',
  'apps/dashboard/.env',
  'deployment/iis/site/.env',
  'deployment/iis/site/apps/dashboard/.env',
].forEach((file) => loadEnvFile(path.join(repo, file)));

const workDate = process.argv[2] || '2026-11-09';
const supervisor = 'Mr SAMUEL KARONWI';
const supervisorCode = 'P0013';

const pool = await sql.connect({
  server: process.env.DLE_ENTERPRISE_DB_HOST || process.env.DLE_ENTERPRISE_DB_SERVER,
  port: Number(process.env.DLE_ENTERPRISE_DB_PORT || 1433),
  database: process.env.DLE_ENTERPRISE_DB_NAME,
  user: process.env.DLE_ENTERPRISE_DB_USER,
  password: process.env.DLE_ENTERPRISE_DB_PASSWORD,
  options: { encrypt: false, trustServerCertificate: true },
});

const period = await pool.request().input('WorkDate', sql.Date, workDate).query(`
  SELECT TOP 1 Id FROM tsmgmt.Periods WHERE StartDate <= @WorkDate AND EndDate >= @WorkDate ORDER BY StartDate DESC
`);
const periodId = period.recordset?.[0]?.Id;
const periodCrew = await pool.request()
  .input('PeriodId', sql.NVarChar(40), periodId)
  .input('Supervisor', sql.NVarChar(180), supervisor)
  .input('WorkDate', sql.Date, workDate)
  .query(`
    SELECT EmployeeCode, EmployeeName, LocationName, WorkCenterName
    FROM (
      SELECT l.EmployeeCode, l.EmployeeName, l.LocationName, l.WorkCenterName,
        ROW_NUMBER() OVER (PARTITION BY l.EmployeeCode ORDER BY t.WorkDate DESC) AS rn
      FROM tsmgmt.TimesheetEntryLines l
      INNER JOIN tsmgmt.Timesheets t ON t.Id = l.TimesheetId
      WHERE t.PeriodId = @PeriodId
        AND t.SupervisorName = @Supervisor
        AND t.WorkDate <> @WorkDate
    ) ranked
    WHERE rn = 1
  `);

const active = await pool.request().input('WorkDate', sql.Date, workDate).query(`
  SELECT e.EmployeeCode, e.EmployeeName, h.OffshoreSite, h.OffshoreSupervisor
  FROM tsmgmt.MobilizationEmployees e
  INNER JOIN tsmgmt.Mobilizations h ON h.Id = e.MobilizationId
  WHERE e.Status IN (N'Planned', N'Mobilized', N'Extended')
    AND e.EffectiveFrom <= @WorkDate
    AND (e.ActualReturn IS NULL OR e.ActualReturn >= @WorkDate)
    AND (e.ActualDemobilization IS NULL OR e.ActualDemobilization >= @WorkDate)
`);

const offshoreCrew = (active.recordset || []).map((row) => ({
  employeeCode: row.EmployeeCode,
  employeeName: row.EmployeeName,
  site: 'OFFSHORE',
  supervisor: row.OffshoreSupervisor,
}));
const mobilizedCodes = new Set(offshoreCrew.map((row) => String(row.employeeCode || '').toUpperCase()));
const hosted = offshoreCrew.filter((row) => mobilizationBelongsOnSheet(row.supervisor, supervisor, supervisorCode));

let crew = (periodCrew.recordset || []).map((row) => ({
  employeeCode: row.EmployeeCode,
  employeeName: row.EmployeeName,
  location: row.LocationName,
  workCenter: row.WorkCenterName,
}));

const oldFilter = crew.filter((row) => !mobilizedCodes.has(String(row.employeeCode || '').toUpperCase()));
const newFilter = crew.filter((row) => {
  const code = String(row.employeeCode || '').toUpperCase();
  if (timesheetLocationsMatch(row.location, 'OFFSHORE')) return true;
  return !mobilizedCodes.has(code);
});
const present = new Set(hosted.map((row) => String(row.employeeCode || '').toUpperCase()));
const carried = bookedOffshoreLinesForSheet(newFilter, 'OFFSHORE').filter((row) => !present.has(String(row.employeeCode || '').toUpperCase()));
const visible = [
  ...hosted.map((row) => `${row.employeeCode} ${row.employeeName} [hosted]`),
  ...carried.map((row) => `${row.employeeCode} ${row.employeeName} [carried]`),
];

console.log(JSON.stringify({
  workDate,
  periodId,
  periodCarryCount: crew.length,
  hostedCount: hosted.length,
  oldVisibleWouldBe: hosted.length,
  newVisibleCount: visible.length,
  visible,
  strippedBefore: crew
    .filter((row) => mobilizedCodes.has(String(row.employeeCode || '').toUpperCase()) && timesheetLocationsMatch(row.location, 'OFFSHORE'))
    .filter((row) => !mobilizationBelongsOnSheet(
      offshoreCrew.find((item) => String(item.employeeCode).toUpperCase() === String(row.employeeCode).toUpperCase())?.supervisor || '',
      supervisor,
      supervisorCode,
    ))
    .map((row) => `${row.employeeCode} ${row.employeeName}`),
  oldFilterCount: oldFilter.length,
  newFilterCount: newFilter.length,
}, null, 2));

await pool.close();
