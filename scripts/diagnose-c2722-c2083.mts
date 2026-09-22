/**
 * Diagnose C2722 Absent days and C2083 Fitting auto-book.
 *
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/diagnose-c2722-c2083.mts
 */
import fs from 'node:fs';
import path from 'node:path';
import sql from 'mssql';

import { getDleEnterpriseDbPool, loadWorkspaceEnv } from '../apps/dashboard/lib/dle-enterprise-db';

const loadEnvFiles = () => {
  for (const file of [path.resolve('.env'), path.resolve('apps/dashboard/.env'), path.resolve('apps/dashboard/.env.local')]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (!process.env[match[1]]) process.env[match[1]] = value;
    }
  }
  loadWorkspaceEnv();
};

const main = async () => {
  loadEnvFiles();
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('No DLE Enterprise database.');
  const dates = ['2026-09-07', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-14', '2026-09-15'];
  const dateList = dates.map((date) => `N'${date}'`).join(', ');

  const [c2722, c2083Sheets, c2083Assign, c2083Job] = await Promise.all([
    pool.request().query(`
SELECT CONVERT(varchar(10), h.TimesheetDate, 23) AS TimesheetDate, h.Id AS HeaderId, h.SupervisorId, h.WorkCenterName, h.LocationName, h.Status,
       l.EmployeeNo, l.EmployeeName, l.ClockIn, l.ClockOut, l.UsedHours, l.IdleHours, l.TotalHours, l.AttendanceMode, l.Remarks, l.ValidationStatus
FROM [hris].[TimesheetHeaders] h
INNER JOIN [hris].[TimesheetLines] l ON l.HeaderId = h.Id
WHERE CONVERT(varchar(10), h.TimesheetDate, 23) IN (${dateList})
  AND (l.EmployeeNo LIKE N'%C2722%' OR l.EmployeeId LIKE N'%C2722%' OR l.EmployeeName LIKE N'%ADENIJI%')
ORDER BY h.TimesheetDate, h.SupervisorId
`),
    pool.request().query(`
SELECT CONVERT(varchar(10), h.TimesheetDate, 23) AS TimesheetDate, h.Id AS HeaderId, h.SupervisorId, h.WorkCenterName, h.Status,
       l.EmployeeNo, l.EmployeeName, l.ClockIn, l.UsedHours, l.TotalHours, l.AttendanceMode, l.Remarks
FROM [hris].[TimesheetHeaders] h
INNER JOIN [hris].[TimesheetLines] l ON l.HeaderId = h.Id
WHERE CONVERT(varchar(10), h.TimesheetDate, 23) BETWEEN N'2026-08-16' AND N'2026-09-15'
  AND (l.EmployeeNo LIKE N'%C2083%' OR l.EmployeeId LIKE N'%C2083%')
ORDER BY h.TimesheetDate DESC
`),
    pool.request().query(`
SELECT employee_code, employee_name, supervisor_employee_code, supervisor_name, assignment_group, assignment_batch
FROM [hris].[SupervisorEmployeeAssignments]
WHERE employee_code = N'C2083'
`),
    pool.request().query(`
SELECT e.employee_code, e.full_name, e.employment_status, j.reporting_manager
FROM [hris].[Employees] e
LEFT JOIN [hris].[EmployeeJobInfo] j ON j.employee_id = e.employee_id
WHERE e.employee_code = N'C2083'
`),
  ]);

  console.log(JSON.stringify({
    c2722: c2722.recordset,
    c2083Assign: c2083Assign.recordset,
    c2083Job: c2083Job.recordset,
    c2083Sheets: c2083Sheets.recordset.slice(0, 40),
    c2083SheetCount: c2083Sheets.recordset.length,
  }, null, 2));
  process.exit(0);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
