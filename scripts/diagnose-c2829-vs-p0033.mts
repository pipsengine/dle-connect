/**
 * Read-only: C2829 vs P0033 on Akande sheets, leftover allocations, recent syncs.
 */
import { getDleEnterpriseDbPool, loadWorkspaceEnv } from '../apps/dashboard/lib/dle-enterprise-db';

loadWorkspaceEnv();

const main = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('NO_DB');

  const compare = await pool.request().query(`
SELECT CONVERT(varchar(10), h.TimesheetDate, 23) AS d,
       l.EmployeeNo,
       CAST(ISNULL(l.UsedHours,0) AS decimal(10,2)) AS usedHours,
       ISNULL(l.ClockIn, N'') AS clockIn,
       ISNULL(l.AttendanceMode, N'') AS attendanceMode,
       LEFT(ISNULL(l.Remarks, N''), 40) AS remarks,
       l.ValidationMessage
FROM [hris].[TimesheetLines] l
JOIN [hris].[TimesheetHeaders] h ON CONVERT(NVARCHAR(4000), h.Id) = CONVERT(NVARCHAR(4000), l.HeaderId)
WHERE l.EmployeeNo IN (N'C2829', N'P0033')
  AND h.TimesheetDate BETWEEN N'2026-08-17' AND N'2026-09-22'
  AND (h.SupervisorId LIKE N'%P0072%' OR h.SupervisorName LIKE N'%AKANDE%')
  AND ISNULL(h.ShiftLabel, N'Day') NOT LIKE N'%Night%'
ORDER BY h.TimesheetDate, l.EmployeeNo
`);

  const leftoverAllocs = await pool.request().query(`
SELECT CONVERT(varchar(10), h.TimesheetDate, 23) AS d,
       l.EmployeeNo, l.Id AS LineId,
       CAST(ISNULL(l.UsedHours,0) AS decimal(10,2)) AS usedHours,
       a.ProjectCode, CAST(a.Hours AS decimal(10,2)) AS allocHours,
       LEFT(ISNULL(a.Remarks, N''), 80) AS allocRemarks
FROM [hris].[TimesheetProjectAllocations] a
JOIN [hris].[TimesheetLines] l ON l.Id = a.LineId
JOIN [hris].[TimesheetHeaders] h ON CONVERT(NVARCHAR(4000), h.Id) = CONVERT(NVARCHAR(4000), l.HeaderId)
WHERE l.EmployeeNo IN (N'C2829', N'P0033')
  AND h.TimesheetDate BETWEEN N'2026-08-17' AND N'2026-09-22'
ORDER BY h.TimesheetDate, l.EmployeeNo
`);

  const crewOnAug24 = await pool.request().query(`
SELECT l.EmployeeNo, l.EmployeeName,
       CAST(ISNULL(l.UsedHours,0) AS decimal(10,2)) AS usedHours,
       ISNULL(l.ClockIn, N'') AS clockIn,
       ISNULL(l.AttendanceMode, N'') AS attendanceMode,
       LEFT(ISNULL(l.Remarks, N''), 40) AS remarks
FROM [hris].[TimesheetLines] l
JOIN [hris].[TimesheetHeaders] h ON CONVERT(NVARCHAR(4000), h.Id) = CONVERT(NVARCHAR(4000), l.HeaderId)
WHERE h.Id = N'hdr-2026-08-24-p0072---mr-owoloja-akande-welding-day'
ORDER BY CASE WHEN ISNULL(l.UsedHours,0) = 0 THEN 0 ELSE 1 END, l.EmployeeNo
`);

  const summary = await pool.request().query(`
SELECT l.EmployeeNo,
       COUNT(*) AS days,
       SUM(CASE WHEN ISNULL(l.UsedHours,0) > 0 OR ISNULL(l.ClockIn, N'') <> N'' THEN 1 ELSE 0 END) AS presentDays,
       SUM(CASE WHEN ISNULL(l.UsedHours,0) = 0 AND ISNULL(l.ClockIn, N'') = N'' THEN 1 ELSE 0 END) AS absentDays,
       SUM(CASE WHEN l.Remarks LIKE N'%PAPER%' THEN 1 ELSE 0 END) AS paperDays
FROM [hris].[TimesheetLines] l
JOIN [hris].[TimesheetHeaders] h ON CONVERT(NVARCHAR(4000), h.Id) = CONVERT(NVARCHAR(4000), l.HeaderId)
WHERE l.EmployeeNo IN (N'C2829', N'P0033', N'C1162')
  AND h.TimesheetDate BETWEEN N'2026-08-17' AND N'2026-09-15'
  AND (h.SupervisorId LIKE N'%P0072%' OR h.SupervisorName LIKE N'%AKANDE%')
  AND ISNULL(h.ShiftLabel, N'Day') NOT LIKE N'%Night%'
GROUP BY l.EmployeeNo
`);

  const fataiByDate: Record<string, string> = {};
  const oguwaByDate: Record<string, string> = {};
  for (const row of compare.recordset) {
    const label = `${row.usedHours}h|${row.clockIn || '-'}|${row.attendanceMode}|${row.remarks || 'no-remark'}`;
    if (row.EmployeeNo === 'C2829') oguwaByDate[row.d] = label;
    else fataiByDate[row.d] = label;
  }

  console.log(JSON.stringify({
    summary: summary.recordset,
    leftoverAllocs: leftoverAllocs.recordset,
    aug24ZeroHourCrew: crewOnAug24.recordset.filter((row: { usedHours: number }) => Number(row.usedHours) === 0),
    aug24BookedCount: crewOnAug24.recordset.filter((row: { usedHours: number }) => Number(row.usedHours) > 0).length,
    aug24Total: crewOnAug24.recordset.length,
    oguwaVsFatai: Object.keys({ ...oguwaByDate, ...fataiByDate }).sort().map((d) => ({
      d,
      oguwa: oguwaByDate[d] || 'not-on-sheet',
      fatai: fataiByDate[d] || 'not-on-sheet',
    })),
  }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
