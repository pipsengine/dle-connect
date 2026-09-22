import { getDleEnterpriseDbPool, loadWorkspaceEnv } from '../apps/dashboard/lib/dle-enterprise-db';

loadWorkspaceEnv();

const main = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('NO_DB');

  const lines = await pool.request().query(`
SELECT l.Id AS LineId, l.EmployeeId, l.EmployeeNo, l.EmployeeName,
       CONVERT(varchar(10), h.TimesheetDate, 23) AS d,
       DATENAME(weekday, h.TimesheetDate) AS wd,
       h.Status, h.SupervisorId, h.SupervisorName, h.WorkCenterName, h.LocationName, h.ShiftLabel,
       CAST(ISNULL(l.UsedHours,0) AS decimal(10,2)) AS usedHours,
       CAST(ISNULL(l.TotalHours,0) AS decimal(10,2)) AS totalHours,
       CAST(ISNULL(l.IdleHours,0) AS decimal(10,2)) AS idleHours,
       ISNULL(l.ClockIn, N'') AS clockIn,
       ISNULL(l.AttendanceMode, N'') AS attendanceMode,
       LEFT(ISNULL(l.Remarks, N''), 120) AS remarks,
       l.ValidationStatus
FROM [hris].[TimesheetLines] l
JOIN [hris].[TimesheetHeaders] h ON CONVERT(NVARCHAR(4000), h.Id) = CONVERT(NVARCHAR(4000), l.HeaderId)
WHERE (l.EmployeeNo = N'C2825' OR l.EmployeeId = N'C2825' OR l.EmployeeName LIKE N'%AKANDE%ISMAIL%')
  AND h.TimesheetDate BETWEEN N'2026-08-17' AND N'2026-09-15'
ORDER BY h.TimesheetDate, h.WorkCenterName, l.Id
`);

  const allocs = await pool.request().query(`
SELECT a.LineId, a.ProjectCode, CAST(a.Hours AS decimal(10,2)) AS hours
FROM [hris].[TimesheetProjectAllocations] a
WHERE a.LineId IN (
  SELECT l.Id FROM [hris].[TimesheetLines] l
  JOIN [hris].[TimesheetHeaders] h ON CONVERT(NVARCHAR(4000), h.Id) = CONVERT(NVARCHAR(4000), l.HeaderId)
  WHERE (l.EmployeeNo = N'C2825' OR l.EmployeeId = N'C2825')
    AND h.TimesheetDate BETWEEN N'2026-08-17' AND N'2026-09-15'
)
`);

  const byDate: Record<string, { rows: number; present: number; absent: number; sheets: string[] }> = {};
  for (const row of lines.recordset) {
    const bucket = byDate[row.d] || { rows: 0, present: 0, absent: 0, sheets: [] };
    bucket.rows += 1;
    const present = Number(row.usedHours) > 0 || String(row.clockIn) || String(row.remarks).includes('PAPER');
    if (present) bucket.present += 1;
    else bucket.absent += 1;
    bucket.sheets.push(`${row.WorkCenterName}|${row.usedHours}h|${row.remarks || 'no-remark'}|${row.EmployeeId}/${row.EmployeeNo}`);
    byDate[row.d] = bucket;
  }

  console.log(JSON.stringify({
    lineCount: lines.recordset.length,
    allocCount: allocs.recordset.length,
    absentRows: lines.recordset.filter((row: { usedHours: number; clockIn: string }) => Number(row.usedHours) === 0 && !row.clockIn),
    byDate,
    sample: lines.recordset.slice(0, 8),
    allocs: allocs.recordset.slice(0, 20),
  }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
