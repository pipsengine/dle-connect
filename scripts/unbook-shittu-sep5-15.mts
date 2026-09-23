/**
 * Remove timesheet bookings that should not be there:
 *   C2816 Ananu Chibuzo and C2824 Salawu Muyideen — 5 Sep and 7 Sep 2026 only
 *   C2340 Ogbum Abel — 5 Sep through 15 Sep 2026 (absent)
 *
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/unbook-shittu-sep5-15.mts
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/unbook-shittu-sep5-15.mts --apply
 */
import sql from 'mssql';
import { getDleEnterpriseDbPool, loadWorkspaceEnv } from '../apps/dashboard/lib/dle-enterprise-db';
import { invalidateTimesheetApprovalWorkspaceCache, invalidateTimesheetDataCache } from '../apps/dashboard/lib/timesheet-entry-store';

loadWorkspaceEnv();

const APPLY = process.argv.includes('--apply');

const TARGETS = [
  { code: 'C2816', name: 'Ananu Chibuzo', from: '2026-09-05', to: '2026-09-05', also: ['2026-09-07'] },
  { code: 'C2824', name: 'Salawu Muyideen', from: '2026-09-05', to: '2026-09-05', also: ['2026-09-07'] },
  { code: 'C2340', name: 'Ogbum Abel', from: '2026-09-05', to: '2026-09-15', also: [] as string[] },
];

type LineRow = {
  LineId: string;
  HeaderId: string;
  TimesheetDate: string;
  Status: string;
  ShiftLabel: string | null;
  SupervisorName: string | null;
  WorkCenterName: string | null;
  EmployeeNo: string;
  EmployeeName: string;
  ClockIn: string | null;
  UsedHours: number | null;
  IdleHours: number | null;
  TotalHours: number | null;
  AttendanceMode: string | null;
  Remarks: string | null;
  ProjectCodes: string | null;
};

const dateOnly = (value: string) => String(value || '').trim().slice(0, 10);

const covers = (code: string, day: string) => {
  const target = TARGETS.find((item) => item.code === code);
  if (!target) return false;
  if (target.also.includes(day)) return true;
  return day >= target.from && day <= target.to;
};

const clearLine = async (pool: sql.ConnectionPool, lineId: string) => {
  await pool.request().input('lineId', sql.NVarChar(220), lineId).query(`
UPDATE [hris].[TimesheetLines]
SET ClockIn = NULL,
    ClockOut = NULL,
    AttendanceDuration = 0,
    UsedHours = 0,
    IdleHours = 0,
    TotalHours = 0,
    Variance = 0,
    Remarks = NULL,
    AttendanceMode = N'Biometric',
    ValidationStatus = N'Incomplete',
    ValidationMessage = NULL
WHERE Id = @lineId;
DELETE FROM [hris].[TimesheetProjectAllocations] WHERE LineId = @lineId;
DELETE FROM [hris].[TimesheetIdleAllocations] WHERE LineId = @lineId;
`);
};

const shouldClear = (row: LineRow) => {
  const day = dateOnly(row.TimesheetDate);
  if (!covers(row.EmployeeNo, day)) return false;
  const hours = Number(row.UsedHours || 0) > 0 || Boolean(row.ProjectCodes);
  const paper = String(row.Remarks || '').includes('PAPER_ATTENDANCE') || row.AttendanceMode === 'Manual';
  const abelPresent = row.EmployeeNo === 'C2340' && Boolean(String(row.ClockIn || '').trim());
  return hours || paper || abelPresent;
};

const main = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) {
    console.error('Enterprise database is not configured.');
    process.exit(1);
  }

  const rows = await pool.request().query<LineRow>(`
SELECT
  l.Id AS LineId,
  l.HeaderId,
  CONVERT(varchar(10), h.TimesheetDate, 23) AS TimesheetDate,
  h.Status,
  h.ShiftLabel,
  h.SupervisorName,
  h.WorkCenterName,
  l.EmployeeNo,
  l.EmployeeName,
  l.ClockIn,
  l.UsedHours,
  l.IdleHours,
  l.TotalHours,
  l.AttendanceMode,
  l.Remarks,
  STUFF((
    SELECT N', ' + a.ProjectCode + N' ' + CONVERT(nvarchar(20), a.Hours)
    FROM [hris].[TimesheetProjectAllocations] a
    WHERE a.LineId = l.Id AND a.Hours > 0
    FOR XML PATH(''), TYPE
  ).value('.', 'nvarchar(max)'), 1, 2, N'') AS ProjectCodes
FROM [hris].[TimesheetLines] l
INNER JOIN [hris].[TimesheetHeaders] h ON h.Id = l.HeaderId
WHERE l.EmployeeNo IN (N'C2816', N'C2824', N'C2340')
  AND CONVERT(varchar(10), h.TimesheetDate, 23) BETWEEN N'2026-09-05' AND N'2026-09-15'
ORDER BY l.EmployeeNo, h.TimesheetDate, h.ShiftLabel
`);

  const matched = rows.recordset.filter((row) => covers(row.EmployeeNo, dateOnly(row.TimesheetDate)));
  const booked = matched.filter(shouldClear);
  const cleared: string[] = [];

  if (APPLY) {
    for (const row of booked) {
      await clearLine(pool, row.LineId);
      cleared.push(`${row.EmployeeNo} ${dateOnly(row.TimesheetDate)} ${row.ShiftLabel || ''} ${row.ProjectCodes || row.ClockIn || ''}`.trim());
    }
    invalidateTimesheetDataCache();
    invalidateTimesheetApprovalWorkspaceCache();
  }

  console.log(JSON.stringify({
    apply: APPLY,
    matchedDays: matched.map((row) => ({
      code: row.EmployeeNo,
      name: row.EmployeeName,
      date: dateOnly(row.TimesheetDate),
      status: row.Status,
      shift: row.ShiftLabel,
      supervisor: row.SupervisorName,
      workCenter: row.WorkCenterName,
      clockIn: row.ClockIn,
      usedHours: Number(row.UsedHours || 0),
      projects: row.ProjectCodes,
      mode: row.AttendanceMode,
      remarks: row.Remarks,
    })),
    bookedCount: booked.length,
    cleared,
  }, null, 2));
  process.exit(0);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
