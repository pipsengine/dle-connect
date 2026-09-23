import sql from 'mssql';
import { getDleEnterpriseDbPool, loadWorkspaceEnv } from '../apps/dashboard/lib/dle-enterprise-db';
import { timesheetAssignmentGroupIsExclusive } from '../apps/dashboard/lib/timesheet-sheet-identity';

loadWorkspaceEnv();

const main = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('NO_DB');

  const employee = await pool.request().query(`
SELECT v.employee_id, v.employee_code, v.full_name, v.employment_status, v.employment_type,
       v.job_title, v.department, v.work_location, v.project_site, v.reporting_manager,
       j.office_location, j.work_center, j.functional_manager, j.department_head
FROM hris.EmployeeMasterView v
LEFT JOIN hris.EmployeeJobInfo j ON j.employee_id = v.employee_id
WHERE v.employee_code IN (N'C2193', N'P0277', N'C1229')
   OR v.full_name LIKE N'%EMEH%'
`);

  const assignments = await pool.request().query(`
SELECT assignment_id, assignment_batch, assignment_group, supervisor_employee_code, supervisor_name,
       employee_code, employee_name, matched_status, assigned_at
FROM hris.SupervisorEmployeeAssignments
WHERE employee_code IN (N'C2193', N'P0277')
   OR supervisor_employee_code IN (N'C2193', N'P0277', N'C1229')
   OR employee_name LIKE N'%EMEH%'
   OR supervisor_name LIKE N'%EMEH%'
ORDER BY supervisor_employee_code, employee_code
`);

  const p0277Crew = await pool.request().query(`
SELECT assignment_group, employee_code, employee_name, matched_status
FROM hris.SupervisorEmployeeAssignments
WHERE supervisor_employee_code LIKE N'%P0277%'
ORDER BY assignment_group, employee_code
`);

  const lines = await pool.request().query(`
SELECT CONVERT(varchar(10), h.TimesheetDate, 23) AS d, h.Status, h.SupervisorId, h.SupervisorName,
       h.LocationName, h.WorkCenterName, h.ShiftLabel,
       l.EmployeeNo, l.EmployeeName, l.UsedHours, l.ClockIn, LEFT(ISNULL(l.Remarks,N''),80) AS remarks
FROM hris.TimesheetLines l
JOIN hris.TimesheetHeaders h ON CONVERT(NVARCHAR(4000), h.Id) = CONVERT(NVARCHAR(4000), l.HeaderId)
WHERE l.EmployeeNo = N'C2193'
  AND h.TimesheetDate >= DATEADD(day, -21, SYSUTCDATETIME())
ORDER BY h.TimesheetDate DESC, h.WorkCenterName
`);

  const ownHeaders = await pool.request().query(`
SELECT CONVERT(varchar(10), TimesheetDate, 23) AS d, Status, SupervisorId, LocationName, WorkCenterName, ShiftLabel
FROM hris.TimesheetHeaders
WHERE TimesheetDate >= DATEADD(day, -14, SYSUTCDATETIME())
  AND (SupervisorId LIKE N'%C2193%' OR SupervisorName LIKE N'%EMEH%' OR SupervisorId LIKE N'%P0277%')
ORDER BY TimesheetDate DESC, SupervisorId, WorkCenterName
`);

  const p0277Exclusive = (p0277Crew.recordset as Array<{ assignment_group: string }>).length > 0
    && (p0277Crew.recordset as Array<{ assignment_group: string }>).every((row) => timesheetAssignmentGroupIsExclusive(row.assignment_group));

  console.log(JSON.stringify({
    employee: employee.recordset,
    p0277CrewCount: p0277Crew.recordset.length,
    p0277CrewSample: p0277Crew.recordset.slice(0, 25),
    p0277HasC2193: p0277Crew.recordset.some((row: { employee_code: string }) => String(row.employee_code || '').toUpperCase() === 'C2193'),
    p0277Exclusive,
    p0277Groups: [...new Set((p0277Crew.recordset as Array<{ assignment_group: string }>).map((row) => row.assignment_group))],
    recentC2193Lines: lines.recordset,
    c2193AsSupervisor: (await pool.request().query(`
SELECT assignment_group, employee_code, employee_name, matched_status
FROM hris.SupervisorEmployeeAssignments
WHERE supervisor_employee_code LIKE N'%C2193%' OR supervisor_name LIKE N'%EMEH%'
ORDER BY employee_code
`)).recordset,
    c2193OnP0277ByDay: (await pool.request().query(`
SELECT CONVERT(varchar(10), h.TimesheetDate, 23) AS d, h.WorkCenterName, h.Status,
       SUM(CASE WHEN l.EmployeeNo = N'C2193' THEN 1 ELSE 0 END) AS c2193Lines,
       COUNT(l.Id) AS lineCount
FROM hris.TimesheetHeaders h
LEFT JOIN hris.TimesheetLines l ON CONVERT(NVARCHAR(4000), l.HeaderId) = CONVERT(NVARCHAR(4000), h.Id)
WHERE h.TimesheetDate >= N'2026-09-01'
  AND (h.SupervisorId LIKE N'%P0277%' OR h.SupervisorName LIKE N'%AKINSANYA%')
GROUP BY CONVERT(varchar(10), h.TimesheetDate, 23), h.WorkCenterName, h.Status
ORDER BY d DESC
`)).recordset.slice(0, 40),
    c2193OwnSheetPeople: (await pool.request().query(`
SELECT CONVERT(varchar(10), h.TimesheetDate, 23) AS d, l.EmployeeNo, l.EmployeeName, l.UsedHours, l.ClockIn
FROM hris.TimesheetHeaders h
JOIN hris.TimesheetLines l ON CONVERT(NVARCHAR(4000), l.HeaderId) = CONVERT(NVARCHAR(4000), h.Id)
WHERE h.TimesheetDate >= N'2026-09-01'
  AND (h.SupervisorId LIKE N'%C2193%' OR h.SupervisorName LIKE N'%EMEH%')
ORDER BY h.TimesheetDate DESC
`)).recordset,
    p0277DirectReports: (await pool.request().query(`
SELECT v.employee_code, v.full_name, v.job_title, j.work_center
FROM hris.EmployeeMasterView v
LEFT JOIN hris.EmployeeJobInfo j ON j.employee_id = v.employee_id
WHERE v.employment_status = N'Active'
  AND (v.reporting_manager LIKE N'%P0277%' OR v.reporting_manager LIKE N'%AKINSANYA%')
ORDER BY v.employee_code
`)).recordset,
  }, null, 2));
  process.exit(0);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
