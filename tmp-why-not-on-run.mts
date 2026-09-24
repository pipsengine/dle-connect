import fs from 'node:fs';
import path from 'node:path';

for (const file of [path.resolve('.env'), path.resolve('apps/dashboard/.env'), path.resolve('deployment/iis/site/.env')]) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[match[1]]) process.env[match[1]] = value;
  }
}

const codes = ['C1924', 'C2413', 'C2471', 'C2806', 'C2809', 'C2819', 'C2822', 'C2828', 'C2830'];
const { getDleEnterpriseDbPool } = await import('./apps/dashboard/lib/dle-enterprise-db.ts');
const { readPayrollEmployees } = await import('./apps/dashboard/lib/payroll-employee-source.ts');
const { synthesizeTimesheetHoursForPeriod } = await import('./apps/dashboard/lib/timesheet-entry-store.ts');

const pool = await getDleEnterpriseDbPool();
const source = await readPayrollEmployees();
const hours = await synthesizeTimesheetHoursForPeriod('per-2026-09');

const list = codes.map((code) => `'${code}'`).join(',');
const lines = await pool.request().query(`
SELECT
  UPPER(LTRIM(RTRIM(l.EmployeeNo))) AS Code,
  COUNT(*) AS Lines,
  SUM(CASE WHEN h.Status IN ('Rejected','Returned') THEN 1 ELSE 0 END) AS RejectedLines,
  MIN(h.Status) AS SampleStatus,
  MIN(CONVERT(varchar(10), h.TimesheetDate, 23)) AS FirstDate,
  MAX(CONVERT(varchar(10), h.TimesheetDate, 23)) AS LastDate,
  SUM(CASE WHEN ISNULL(l.UsedHours,0) > 0 OR ISNULL(l.TotalHours,0) > 0 OR ISNULL(l.AttendanceDuration,0) > 0 OR NULLIF(LTRIM(RTRIM(l.ClockIn)),'') IS NOT NULL THEN 1 ELSE 0 END) AS WorkedLines
FROM [hris].[TimesheetLines] l
INNER JOIN [hris].[TimesheetHeaders] h ON h.Id = l.HeaderId
WHERE h.PeriodId = N'per-2026-09'
  AND UPPER(LTRIM(RTRIM(l.EmployeeNo))) IN (${list})
GROUP BY UPPER(LTRIM(RTRIM(l.EmployeeNo)))
`);

const byCode = new Map((lines.recordset || []).map((row) => [String(row.Code), row]));
const employees = source.employees || [];
const report = codes.map((code) => {
  const employee = employees.find((item) => String(item.employeeCode || item.employeeId || '').trim().toUpperCase() === code);
  const sheet = byCode.get(code);
  const entry = hours.get(code);
  return {
    code,
    name: employee?.fullName || '',
    ratePerDay: Number(employee?.ratePerDay || 0),
    ratePerHour: Number(employee?.ratePerHour || 0),
    status: employee?.status || '',
    timesheetLines: Number(sheet?.Lines || 0),
    workedLines: Number(sheet?.WorkedLines || 0),
    rejectedLines: Number(sheet?.RejectedLines || 0),
    sampleStatus: sheet?.SampleStatus || null,
    firstDate: sheet?.FirstDate || null,
    lastDate: sheet?.LastDate || null,
    weekdayDays: Number(entry?.weekdayDays || 0),
    saturdayHours: Number(entry?.saturdayHours || 0),
    sundayHours: Number(entry?.sundayHours || 0),
    publicHolidayHours: Number(entry?.publicHolidayHours || 0),
    nightDays: Number(entry?.nightDays || 0),
  };
});

console.log(JSON.stringify(report, null, 2));
process.exit(0);
