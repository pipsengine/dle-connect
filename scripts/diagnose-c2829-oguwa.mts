/**
 * Read-only investigation: Christain / Christian Oguwa timesheet presence.
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/diagnose-c2829-oguwa.mts
 */
import { getDleEnterpriseDbPool, loadWorkspaceEnv } from '../apps/dashboard/lib/dle-enterprise-db';

loadWorkspaceEnv();

const main = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('NO_DB');

  const employee = await pool.request().query(`
SELECT e.employee_id, e.employee_code, e.full_name, e.preferred_name, e.employment_status, e.employment_type,
       j.job_title, j.office_location, j.work_center, j.reporting_manager, j.department,
       emp.work_location
FROM [hris].[Employees] e
LEFT JOIN [hris].[EmployeeJobInfo] j ON j.employee_id = e.employee_id
LEFT JOIN [hris].[EmployeeEmploymentInfo] emp ON emp.employee_id = e.employee_id
WHERE e.employee_code = N'C2829'
   OR e.full_name LIKE N'%OGUWA%'
   OR e.preferred_name LIKE N'%OGUWA%'
   OR e.preferred_name LIKE N'%Christain%'
`);

  const assignment = await pool.request().query(`
SELECT assignment_id, assignment_batch, assignment_group, source_label,
       supervisor_employee_code, supervisor_name,
       employee_code, employee_name, trade_role, matched_status,
       CONVERT(varchar(19), assigned_at, 126) AS assigned_at, assigned_by
FROM [hris].[SupervisorEmployeeAssignments]
WHERE employee_code = N'C2829'
   OR employee_name LIKE N'%OGUWA%'
   OR source_label LIKE N'%OGUWA%'
   OR source_label LIKE N'%Christain%'
ORDER BY assigned_at DESC
`);

  const akandeCrew = await pool.request().query(`
SELECT employee_code, employee_name, trade_role, assignment_group, assignment_batch,
       CONVERT(varchar(19), assigned_at, 126) AS assigned_at
FROM [hris].[SupervisorEmployeeAssignments]
WHERE supervisor_employee_code LIKE N'%P0072%'
ORDER BY employee_code
`);

  const lines = await pool.request().query(`
SELECT l.Id AS LineId, l.HeaderId, l.EmployeeId, l.EmployeeNo, l.EmployeeName,
       CONVERT(varchar(10), h.TimesheetDate, 23) AS d,
       DATENAME(weekday, h.TimesheetDate) AS wd,
       h.Status, h.SupervisorId, h.SupervisorName, h.WorkCenterName, h.LocationName, h.ShiftLabel,
       CONVERT(varchar(19), h.LastSyncAt, 126) AS lastSyncAt,
       CAST(ISNULL(l.UsedHours,0) AS decimal(10,2)) AS usedHours,
       CAST(ISNULL(l.TotalHours,0) AS decimal(10,2)) AS totalHours,
       CAST(ISNULL(l.IdleHours,0) AS decimal(10,2)) AS idleHours,
       ISNULL(l.ClockIn, N'') AS clockIn,
       ISNULL(l.ClockOut, N'') AS clockOut,
       ISNULL(l.AttendanceMode, N'') AS attendanceMode,
       LEFT(ISNULL(l.Remarks, N''), 160) AS remarks,
       l.ValidationStatus, l.ValidationMessage
FROM [hris].[TimesheetLines] l
JOIN [hris].[TimesheetHeaders] h ON CONVERT(NVARCHAR(4000), h.Id) = CONVERT(NVARCHAR(4000), l.HeaderId)
WHERE l.EmployeeNo = N'C2829'
   OR l.EmployeeId = N'C2829'
   OR l.EmployeeName LIKE N'%OGUWA%'
ORDER BY h.TimesheetDate, h.WorkCenterName, l.Id
`);

  const allocs = await pool.request().query(`
SELECT a.LineId, a.ProjectCode, a.ProjectName, CAST(a.Hours AS decimal(10,2)) AS hours,
       LEFT(ISNULL(a.Remarks, N''), 80) AS remarks
FROM [hris].[TimesheetProjectAllocations] a
WHERE a.LineId IN (
  SELECT l.Id FROM [hris].[TimesheetLines] l
  WHERE l.EmployeeNo = N'C2829' OR l.EmployeeId = N'C2829' OR l.EmployeeName LIKE N'%OGUWA%'
)
`);

  const idle = await pool.request().query(`
SELECT a.LineId, a.ReasonName, CAST(a.Hours AS decimal(10,2)) AS hours
FROM [hris].[TimesheetIdleAllocations] a
WHERE a.LineId IN (
  SELECT l.Id FROM [hris].[TimesheetLines] l
  WHERE l.EmployeeNo = N'C2829' OR l.EmployeeId = N'C2829' OR l.EmployeeName LIKE N'%OGUWA%'
)
`);

  const akandeSheets = await pool.request().query(`
SELECT CONVERT(varchar(10), h.TimesheetDate, 23) AS d,
       DATENAME(weekday, h.TimesheetDate) AS wd,
       h.Id AS HeaderId, h.Status, h.WorkCenterName, h.LocationName, h.ShiftLabel,
       CONVERT(varchar(19), h.LastSyncAt, 126) AS lastSyncAt,
       SUM(CASE WHEN l.EmployeeNo = N'C2829' OR l.EmployeeId = N'C2829' THEN 1 ELSE 0 END) AS oguwaRows,
       SUM(CASE WHEN (l.EmployeeNo = N'C2829' OR l.EmployeeId = N'C2829') AND ISNULL(l.UsedHours,0) > 0 THEN 1 ELSE 0 END) AS oguwaBooked,
       COUNT(l.Id) AS crewRows,
       SUM(CASE WHEN ISNULL(l.UsedHours,0) > 0 THEN 1 ELSE 0 END) AS crewBooked
FROM [hris].[TimesheetHeaders] h
LEFT JOIN [hris].[TimesheetLines] l ON CONVERT(NVARCHAR(4000), l.HeaderId) = CONVERT(NVARCHAR(4000), h.Id)
WHERE h.TimesheetDate BETWEEN N'2026-08-17' AND N'2026-09-22'
  AND (h.SupervisorId LIKE N'%P0072%' OR h.SupervisorName LIKE N'%AKANDE%')
  AND ISNULL(h.ShiftLabel, N'Day') NOT LIKE N'%Night%'
GROUP BY h.TimesheetDate, h.Id, h.Status, h.WorkCenterName, h.LocationName, h.ShiftLabel, h.LastSyncAt
ORDER BY h.TimesheetDate, h.WorkCenterName
`);

  const missingFromAkande = await pool.request().query(`
SELECT CONVERT(varchar(10), h.TimesheetDate, 23) AS d, h.Id AS HeaderId, h.Status,
       h.WorkCenterName, h.LocationName
FROM [hris].[TimesheetHeaders] h
WHERE h.TimesheetDate BETWEEN N'2026-08-17' AND N'2026-09-22'
  AND (h.SupervisorId LIKE N'%P0072%' OR h.SupervisorName LIKE N'%AKANDE%')
  AND ISNULL(h.ShiftLabel, N'Day') NOT LIKE N'%Night%'
  AND NOT EXISTS (
    SELECT 1 FROM [hris].[TimesheetLines] l
    WHERE CONVERT(NVARCHAR(4000), l.HeaderId) = CONVERT(NVARCHAR(4000), h.Id)
      AND (l.EmployeeNo = N'C2829' OR l.EmployeeId = N'C2829')
  )
ORDER BY h.TimesheetDate
`);

  const byDate: Record<string, {
    rows: number;
    present: number;
    absent: number;
    sheets: string[];
  }> = {};
  for (const row of lines.recordset) {
    const bucket = byDate[row.d] || { rows: 0, present: 0, absent: 0, sheets: [] };
    bucket.rows += 1;
    const present = Number(row.usedHours) > 0 || Boolean(String(row.clockIn || '').trim()) || String(row.remarks || '').includes('PAPER');
    if (present) bucket.present += 1;
    else bucket.absent += 1;
    bucket.sheets.push(
      `${row.LocationName}|${row.WorkCenterName}|${row.Status}|${row.usedHours}h|${row.attendanceMode}|${row.remarks || 'no-remark'}|${row.lastSyncAt || 'no-sync'}`,
    );
    byDate[row.d] = bucket;
  }

  const absentRows = lines.recordset.filter((row: { usedHours: number; clockIn: string }) =>
    Number(row.usedHours) === 0 && !String(row.clockIn || '').trim(),
  );
  const presentRows = lines.recordset.filter((row: { usedHours: number; clockIn: string; remarks: string }) =>
    Number(row.usedHours) > 0 || Boolean(String(row.clockIn || '').trim()) || String(row.remarks || '').includes('PAPER'),
  );

  console.log(JSON.stringify({
    employee: employee.recordset,
    assignment: assignment.recordset,
    akandeCrew: akandeCrew.recordset,
    lineCount: lines.recordset.length,
    allocCount: allocs.recordset.length,
    idleCount: idle.recordset.length,
    presentCount: presentRows.length,
    absentCount: absentRows.length,
    byDate,
    absentRows,
    presentSample: presentRows.slice(0, 12),
    allocs: allocs.recordset,
    idle: idle.recordset,
    akandeSheets: akandeSheets.recordset,
    akandeSheetsMissingOguwa: missingFromAkande.recordset,
  }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
