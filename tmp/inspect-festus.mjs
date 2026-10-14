import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sql from 'mssql';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.join(repo, 'apps/dashboard');
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
loadEnvFile(path.join(repo, '.env.local'));
loadEnvFile(path.join(repo, '.env'));
loadEnvFile(path.join(root, '.env.local'));
loadEnvFile(path.join(root, '.env'));
loadEnvFile(path.join(repo, 'deployment/iis/site/.env'));
loadEnvFile(path.join(repo, 'deployment/iis/site/apps/dashboard/.env'));
console.log('HOST_SET', Boolean(process.env.DLE_ENTERPRISE_DB_HOST || process.env.DLE_ENTERPRISE_DB_SERVER));

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
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().slice(0, 10);
};

const mob = await pool.request().input('Code', sql.NVarChar(80), 'C2015').query(`
  SELECT e.EmployeeCode, e.EmployeeName, e.Status, e.ExceptionStatus, e.EffectiveFrom, e.ExpectedReturn, e.RevisedExpectedReturn, e.ActualReturn, e.HomeSupervisor, e.HomeLocation,
    h.ProjectCode, h.ProjectName, h.OffshoreSite, h.OffshoreSupervisor, h.Status AS BatchStatus
  FROM tsmgmt.MobilizationEmployees e
  INNER JOIN tsmgmt.Mobilizations h ON h.Id = e.MobilizationId
  WHERE e.EmployeeCode = @Code
  ORDER BY e.EffectiveFrom DESC
`);
console.log('MOBILIZATIONS');
for (const row of mob.recordset) {
  console.log([row.Status, row.ExceptionStatus, day(row.EffectiveFrom), day(row.ExpectedReturn), row.ProjectCode, row.OffshoreSite, row.OffshoreSupervisor, row.HomeSupervisor, row.HomeLocation].join(' | '));
}

const crew = await pool.request().input('Code', sql.NVarChar(80), 'C2015').query(`
  SELECT EmployeeCode, EmployeeName, AssignmentType, SupervisorName, LocationName, WorkCenterName, OperationalStatus, Status, EffectiveFrom, EffectiveTo
  FROM tsmgmt.CrewAssignments
  WHERE EmployeeCode = @Code
  ORDER BY EffectiveFrom DESC
`);
console.log('CREW');
for (const row of crew.recordset) {
  console.log([row.AssignmentType, row.Status, row.OperationalStatus, row.SupervisorName, row.LocationName, day(row.EffectiveFrom), day(row.EffectiveTo)].join(' | '));
}

const bookCols = await pool.request().query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='tsmgmt' AND TABLE_NAME='Bookings'`);
console.log('BOOKING_COLS', bookCols.recordset.map((row) => row.COLUMN_NAME).join(','));
const books = await pool.request().input('Code', sql.NVarChar(80), 'C2015').query(`
  SELECT TOP 15 WorkDate, LocationName, RegularHours, OvtHours, NightHours
  FROM tsmgmt.Bookings
  WHERE EmployeeCode = @Code
  ORDER BY WorkDate DESC
`);
console.log('BOOKINGS');
for (const row of books.recordset) {
  console.log([day(row.WorkDate), row.LocationName, row.RegularHours, row.OvtHours, row.NightHours].join(' | '));
}
const abel = await pool.request().query(`
  SELECT TOP 1 t.Id, t.WorkDate, t.SupervisorName, t.LocationName, t.ShiftLabel
  FROM tsmgmt.Timesheets t
  WHERE t.SupervisorName LIKE N'%ABEL DANIEL%'
  ORDER BY t.WorkDate DESC
`);
console.log('ABEL_SHEET');
for (const row of abel.recordset) console.log([day(row.WorkDate), row.SupervisorName, row.LocationName, row.ShiftLabel, row.Id].join(' | '));
if (abel.recordset[0]) {
  const lines = await pool.request().input('Id', sql.NVarChar(40), abel.recordset[0].Id).query(`
    SELECT EmployeeCode, EmployeeName, OperationalStatus FROM tsmgmt.TimesheetEntryLines WHERE TimesheetId = @Id ORDER BY EmployeeName
  `);
  console.log('ABEL_LINES', lines.recordset.map((row) => row.EmployeeCode + ' ' + row.EmployeeName).join(' ; '));
}
const sup = await pool.request().input('Code', sql.NVarChar(80), 'C2015').query(`
  SELECT employee_code, employee_name, supervisor_employee_code, supervisor_name, matched_status
  FROM hris.SupervisorEmployeeAssignments
  WHERE employee_code = @Code
`);
console.log('SUPERVISOR');
for (const row of sup.recordset) console.log([row.supervisor_employee_code, row.supervisor_name, row.matched_status].join(' | '));

const lines = await pool.request().input('Code', sql.NVarChar(80), 'C2015').query(`
  SELECT TOP 10 t.WorkDate, t.SupervisorName, t.ShiftLabel, t.LocationName, l.OperationalStatus
  FROM tsmgmt.TimesheetEntryLines l
  INNER JOIN tsmgmt.Timesheets t ON t.Id = l.TimesheetId
  WHERE l.EmployeeCode = @Code
  ORDER BY t.WorkDate DESC
`);
console.log('LINES');
for (const row of lines.recordset) {
  console.log([day(row.WorkDate), row.SupervisorName, row.ShiftLabel, row.LocationName, row.OperationalStatus].join(' | '));
}

const hrisLine = await pool.request().input('Code', sql.NVarChar(80), 'C2015').query(`
  SELECT TOP 8 h.TimesheetDate, h.SupervisorId, h.SupervisorName, h.LocationName, h.WorkCenterName, h.ShiftLabel, l.EmployeeNo, l.EmployeeName
  FROM hris.TimesheetLines l
  INNER JOIN hris.TimesheetHeaders h ON h.Id = l.HeaderId
  WHERE l.EmployeeNo = @Code OR l.EmployeeId = @Code
  ORDER BY h.TimesheetDate DESC
`);
console.log('HRIS_LINES');
for (const row of hrisLine.recordset) console.log([day(row.TimesheetDate), row.SupervisorName, row.LocationName, row.WorkCenterName, row.ShiftLabel].join(' | '));
const cols = await pool.request().query(`
  SELECT t.WorkDate, t.SupervisorName, t.LocationName, t.ShiftLabel, a.ProjectCode, COUNT(DISTINCT l.EmployeeCode) AS People
  FROM tsmgmt.TimesheetAllocations a
  INNER JOIN tsmgmt.TimesheetEntryLines l ON l.Id = a.LineId
  INNER JOIN tsmgmt.Timesheets t ON t.Id = l.TimesheetId
  WHERE t.WorkDate = '2026-10-14' AND a.ProjectCode IN (N'DLPC0087', N'DL2601', N'DLPC0070', N'DL2801')
  GROUP BY t.WorkDate, t.SupervisorName, t.LocationName, t.ShiftLabel, a.ProjectCode
  ORDER BY t.SupervisorName, a.ProjectCode
`);
console.log('TODAY_COLS');
for (const row of cols.recordset) console.log([day(row.WorkDate), row.SupervisorName, row.LocationName, row.ShiftLabel, row.ProjectCode, row.People].join(' | '));
const locs = await pool.request().input('Id', sql.NVarChar(40), 'ts-mv7tln1q-gzfouy').query(`
  SELECT EmployeeCode, EmployeeName, LocationName, WorkCenterName, OperationalStatus
  FROM tsmgmt.TimesheetEntryLines WHERE TimesheetId = @Id ORDER BY EmployeeName
`);
console.log('LINE_LOCS');
for (const row of locs.recordset) console.log([row.EmployeeCode, row.LocationName, row.WorkCenterName, row.OperationalStatus].join(' | '));
const recent = await pool.request().query(`
  SELECT TOP 5 h.TimesheetDate, h.SupervisorName, h.LocationName, l.EmployeeNo, l.EmployeeName
  FROM hris.TimesheetLines l
  INNER JOIN hris.TimesheetHeaders h ON h.Id = l.HeaderId
  WHERE l.EmployeeName LIKE N'%AMADI%' OR l.EmployeeNo = N'C2823'
  ORDER BY h.TimesheetDate DESC
`);
console.log('AMADI');
for (const row of recent.recordset) console.log([day(row.TimesheetDate), row.EmployeeNo, row.EmployeeName, row.SupervisorName, row.LocationName].join(' | '));
const dl = await pool.request().query(`
  SELECT TOP 8 h.TimesheetDate, h.SupervisorName, h.LocationName, l.EmployeeNo, l.EmployeeName, a.ProjectCode, a.Hours
  FROM hris.TimesheetProjectAllocations a
  INNER JOIN hris.TimesheetLines l ON l.Id = a.LineId
  INNER JOIN hris.TimesheetHeaders h ON h.Id = l.HeaderId
  WHERE a.ProjectCode = N'DL2601' AND h.TimesheetDate >= '2026-10-01'
  ORDER BY h.TimesheetDate DESC, l.EmployeeName
`);
console.log('DL2601_OCT');
for (const row of dl.recordset) console.log([day(row.TimesheetDate), row.EmployeeNo, row.EmployeeName, row.SupervisorName, row.LocationName, row.Hours].join(' | '));
const abelHris = await pool.request().query(`
  SELECT h.Id, h.TimesheetDate, h.SupervisorName, h.LocationName, h.WorkCenterName, h.ShiftLabel, h.Status,
    (SELECT COUNT(1) FROM hris.TimesheetLines l WHERE l.HeaderId = h.Id) AS LineCount
  FROM hris.TimesheetHeaders h
  WHERE h.SupervisorName LIKE N'%ABEL DANIEL%' AND h.TimesheetDate >= '2026-10-01'
  ORDER BY h.TimesheetDate DESC
`);
console.log('ABEL_HRIS');
for (const row of abelHris.recordset.slice(0, 8)) {
  console.log([day(row.TimesheetDate), row.LocationName, row.WorkCenterName, row.ShiftLabel, row.Status, row.LineCount, row.Id].join(' | '));
}
if (abelHris.recordset[0]) {
  const people = await pool.request().input('Id', sql.NVarChar(180), abelHris.recordset[0].Id).query(`
    SELECT EmployeeNo, EmployeeName FROM hris.TimesheetLines WHERE HeaderId=@Id ORDER BY EmployeeName
  `);
  console.log('ABEL_HRIS_PEOPLE', people.recordset.map((item) => item.EmployeeNo + ' ' + item.EmployeeName).join(' ; '));
}
const sample = await pool.request().query(`
  SELECT TOP 1 h.Id, h.TimesheetDate, h.SupervisorName, h.LocationName, h.WorkCenterName
  FROM hris.TimesheetLines l
  INNER JOIN hris.TimesheetHeaders h ON h.Id = l.HeaderId
  WHERE l.EmployeeNo = N'C2823' AND h.TimesheetDate = '2026-10-14'
`);
console.log('SAMPLE_HEADER');
for (const row of sample.recordset) {
  console.log([day(row.TimesheetDate), row.SupervisorName, row.LocationName, row.WorkCenterName, row.Id].join(' | '));
  const people = await pool.request().input('Id', sql.NVarChar(160), row.Id).query(`SELECT EmployeeNo, EmployeeName FROM hris.TimesheetLines WHERE HeaderId=@Id ORDER BY EmployeeName`);
  console.log(people.recordset.map((item) => item.EmployeeNo + ' ' + item.EmployeeName).join(' ; '));
}
const hrisMob = await pool.request().input('Code', sql.NVarChar(80), 'C2015').query(`
  SELECT EmployeeCode, EmployeeName, SupervisorId, SupervisorName, ProjectCode, ProjectName, WorkCenterName, LocationName, StartDate, EndDate, Status, Reason
  FROM hris.TimesheetMobilizations
  WHERE EmployeeCode = @Code
`);
console.log('HRIS_MOB');
for (const row of hrisMob.recordset) console.log([row.Status, row.ProjectCode, row.WorkCenterName, row.LocationName, day(row.StartDate), day(row.EndDate), row.SupervisorId, row.SupervisorName].join(' | '));
const projects = await pool.request().query(`
  SELECT ProjectCode, ProjectName FROM tsmgmt.Mobilizations WHERE ProjectName LIKE N'%YINSON%' OR ProjectCode IN (N'DL2601', N'DL2801')
`);
console.log('PROJECTS');
for (const row of projects.recordset) console.log(row.ProjectCode + ' | ' + row.ProjectName);
const others = await pool.request().query(`
  SELECT employee_code, employee_name, supervisor_employee_code, supervisor_name
  FROM hris.SupervisorEmployeeAssignments
  WHERE employee_code IN (N'C2823', N'C1686', N'C1229', N'C1544', N'C2015')
`);
console.log('OTHERS');
for (const row of others.recordset) console.log([row.employee_code, row.employee_name, row.supervisor_employee_code, row.supervisor_name].join(' | '));
const festusHours = await pool.request().input('Code', sql.NVarChar(80), 'C2015').query(`
  SELECT TOP 3 WorkDate, SupervisorName, LocationName, ProjectHoursJson
  FROM tsmgmt.Bookings WHERE EmployeeCode = @Code ORDER BY WorkDate DESC
`);
console.log('FESTUS_JSON');
for (const row of festusHours.recordset) console.log(day(row.WorkDate), row.SupervisorName, row.LocationName, String(row.ProjectHoursJson || '').slice(0, 400));
await pool.close();
