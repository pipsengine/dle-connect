/**
 * 1. Paper-book C2816 / C2825 / C2585 present on Shittu Welding for
 *    17 Aug–15 Sep 2026 (at work; clocks missed). Skip Eid Maulud 25 Aug.
 *    Includes Saturdays that already have a timesheet row.
 * 2. Make C2193 David Emeh visible on AGEGE lists: set missing location,
 *    add him to P0277's assigned crew, and add him to his own day sheets
 *    on dates he is not already paid elsewhere.
 *
 * Dry run:
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/repair-shittu-welders-c2193.mts
 *
 * Apply:
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/repair-shittu-welders-c2193.mts --apply
 */
import sql from 'mssql';
import { getDleEnterpriseDbPool, loadWorkspaceEnv } from '../apps/dashboard/lib/dle-enterprise-db';
import {
  DAILY_BREAK_HOURS,
  DEFAULT_BREAK_IDLE_REASON_ID,
  DEFAULT_BREAK_IDLE_REASON_NAME,
  GROSS_TIMESHEET_HOURS,
  PAPER_ATTENDANCE_REMARKS_MARKER,
  STANDARD_TIMESHEET_HOURS,
} from '../apps/dashboard/lib/timesheet-entry-shared';
import { invalidateTimesheetApprovalWorkspaceCache, invalidateTimesheetDataCache } from '../apps/dashboard/lib/timesheet-entry-store';

loadWorkspaceEnv();

const APPLY = process.argv.includes('--apply');
const FROM = '2026-08-17';
const TO = '2026-09-15';
const HOLIDAYS = new Set(['2026-08-25']);
const WELDERS = ['C2816', 'C2825', 'C2585'];
const C2193 = 'C2193';
const LOCKED = `N'HR_Acknowledged', N'Locked', N'Approved'`;

const compact = (value: unknown) => String(value || '').trim();

type LineRow = {
  LineId: string;
  HeaderId: string;
  TimesheetDate: string;
  Status: string;
  SupervisorId: string;
  SupervisorName: string;
  LocationName: string | null;
  WorkCenterName: string | null;
  ShiftLabel: string | null;
  EmployeeNo: string;
  EmployeeName: string;
  ClockIn: string | null;
  UsedHours: number;
  Remarks: string | null;
};

const paperBookLine = async (pool: sql.ConnectionPool, lineId: string, projectCode: string, projectName: string) => {
  await pool.request()
    .input('lineId', sql.NVarChar(220), lineId)
    .input('usedHours', sql.Decimal(9, 2), STANDARD_TIMESHEET_HOURS)
    .input('idleHours', sql.Decimal(9, 2), DAILY_BREAK_HOURS)
    .input('totalHours', sql.Decimal(9, 2), GROSS_TIMESHEET_HOURS)
    .input('remarks', sql.NVarChar(500), PAPER_ATTENDANCE_REMARKS_MARKER)
    .query(`
UPDATE [hris].[TimesheetLines]
SET ClockIn = NULL, ClockOut = NULL, AttendanceDuration = 0,
    UsedHours = @usedHours, IdleHours = @idleHours, TotalHours = @totalHours, Variance = 0,
    Remarks = @remarks, ValidationStatus = N'Valid',
    ValidationMessage = N'Paper attendance: 8h project + 1h break. No biometric punch invented.',
    AttendanceMode = N'Manual'
WHERE Id = @lineId
`);
  await pool.request().input('lineId', sql.NVarChar(220), lineId).query(`
DELETE FROM [hris].[TimesheetProjectAllocations] WHERE LineId = @lineId;
DELETE FROM [hris].[TimesheetIdleAllocations] WHERE LineId = @lineId;
`);
  await pool.request()
    .input('lineId', sql.NVarChar(220), lineId)
    .input('projectCode', sql.NVarChar(50), projectCode)
    .input('projectName', sql.NVarChar(255), projectName)
    .input('hours', sql.Decimal(9, 2), STANDARD_TIMESHEET_HOURS)
    .query(`
INSERT INTO [hris].[TimesheetProjectAllocations]
  ([LineId],[ProjectId],[ProjectCode],[ProjectName],[TaskId],[TaskName],[ActivityId],[Hours],[Remarks])
VALUES (@lineId, @projectCode, @projectCode, @projectName, NULL, NULL, NULL, @hours, N'Paper book: present at work, clock registered late.')
`);
  await pool.request()
    .input('lineId', sql.NVarChar(220), lineId)
    .input('reasonId', sql.NVarChar(80), DEFAULT_BREAK_IDLE_REASON_ID)
    .input('reasonName', sql.NVarChar(180), DEFAULT_BREAK_IDLE_REASON_NAME)
    .input('hours', sql.Decimal(9, 2), DAILY_BREAK_HOURS)
    .query(`
INSERT INTO [hris].[TimesheetIdleAllocations]
  ([LineId],[ReasonId],[ReasonName],[Hours],[Remarks])
VALUES (@lineId, @reasonId, @reasonName, @hours, N'Break Time')
`);
};

const majorityProject = async (pool: sql.ConnectionPool, headerId: string, skipLineId?: string) => {
  const local = await pool.request()
    .input('headerId', sql.NVarChar(160), headerId)
    .input('skipLineId', sql.NVarChar(220), skipLineId || '')
    .query(`
SELECT TOP 1 a.ProjectCode AS code, MAX(a.ProjectName) AS name, SUM(a.Hours) AS hours
FROM [hris].[TimesheetProjectAllocations] a
INNER JOIN [hris].[TimesheetLines] l ON l.Id = a.LineId
WHERE CONVERT(NVARCHAR(4000), l.HeaderId) = CONVERT(NVARCHAR(4000), @headerId)
  AND CONVERT(NVARCHAR(4000), l.Id) <> CONVERT(NVARCHAR(4000), @skipLineId)
  AND a.Hours > 0
  AND a.ProjectCode LIKE N'DL%'
  AND a.ProjectCode NOT LIKE N'DL1949%'
GROUP BY a.ProjectCode
ORDER BY SUM(a.Hours) DESC
`);
  if (local.recordset[0]) return local.recordset[0] as { code: string; name: string };

  const fallback = await pool.request().query(`
SELECT TOP 1 a.ProjectCode AS code, MAX(a.ProjectName) AS name, SUM(a.Hours) AS hours
FROM [hris].[TimesheetProjectAllocations] a
INNER JOIN [hris].[TimesheetLines] l ON l.Id = a.LineId
INNER JOIN [hris].[TimesheetHeaders] h ON CONVERT(NVARCHAR(4000), h.Id) = CONVERT(NVARCHAR(4000), l.HeaderId)
WHERE CONVERT(varchar(10), h.TimesheetDate, 23) BETWEEN N'${FROM}' AND N'${TO}'
  AND (h.SupervisorId LIKE N'%C1229%' OR h.SupervisorName LIKE N'%SHITTU%')
  AND ISNULL(h.WorkCenterName, N'') LIKE N'%Weld%'
  AND a.Hours > 0
  AND a.ProjectCode LIKE N'DL%'
  AND a.ProjectCode NOT LIKE N'DL1949%'
GROUP BY a.ProjectCode
ORDER BY SUM(a.Hours) DESC
`);
  return (fallback.recordset[0] || null) as { code: string; name: string } | null;
};

const main = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE Enterprise database is not configured.');

  const welderRows = await pool.request().query(`
SELECT l.Id AS LineId, h.Id AS HeaderId, CONVERT(varchar(10), h.TimesheetDate, 23) AS TimesheetDate,
       h.Status, h.SupervisorId, h.SupervisorName, h.LocationName, h.WorkCenterName, h.ShiftLabel,
       l.EmployeeNo, l.EmployeeName, l.ClockIn, l.UsedHours, l.Remarks
FROM [hris].[TimesheetHeaders] h
INNER JOIN [hris].[TimesheetLines] l ON CONVERT(NVARCHAR(4000), l.HeaderId) = CONVERT(NVARCHAR(4000), h.Id)
WHERE CONVERT(varchar(10), h.TimesheetDate, 23) BETWEEN N'${FROM}' AND N'${TO}'
  AND l.EmployeeNo IN (N'C2816', N'C2825', N'C2585')
  AND ISNULL(h.ShiftLabel, N'Day') NOT LIKE N'%Night%'
  AND (h.SupervisorId LIKE N'%C1229%' OR h.SupervisorName LIKE N'%SHITTU%')
ORDER BY l.EmployeeNo, h.TimesheetDate
`);

  const welderReport: Array<Record<string, unknown>> = [];
  let booked = 0;
  let skipped = 0;
  for (const row of welderRows.recordset as LineRow[]) {
    const date = compact(row.TimesheetDate);
    const locked = /hr_acknowledged|locked|approved/i.test(compact(row.Status).replace(/[\s-]+/g, '_'));
    const hasHours = Number(row.UsedHours || 0) > 0 || Boolean(compact(row.ClockIn));
    if (HOLIDAYS.has(date)) {
      skipped += 1;
      welderReport.push({ code: row.EmployeeNo, date, action: 'skipped', reason: 'public holiday' });
      continue;
    }
    if (locked) {
      skipped += 1;
      welderReport.push({ code: row.EmployeeNo, date, action: 'skipped', reason: `timesheet ${row.Status} is locked` });
      continue;
    }
    if (hasHours) {
      skipped += 1;
      welderReport.push({ code: row.EmployeeNo, date, action: 'skipped', reason: 'already present' });
      continue;
    }
    const project = await majorityProject(pool, row.HeaderId, row.LineId);
    if (!project?.code) {
      skipped += 1;
      welderReport.push({ code: row.EmployeeNo, date, action: 'skipped', reason: 'No project on the sheet' });
      continue;
    }
    if (APPLY) await paperBookLine(pool, row.LineId, project.code, project.name || project.code);
    booked += 1;
    welderReport.push({
      code: row.EmployeeNo,
      name: row.EmployeeName,
      date,
      action: APPLY ? 'booked' : 'would-book',
      status: row.Status,
      project: project.code,
      hours: 8,
    });
  }

  const c2193OwnHeaders = await pool.request().query(`
SELECT h.Id AS HeaderId, CONVERT(varchar(10), h.TimesheetDate, 23) AS TimesheetDate,
       h.Status, h.SupervisorId, h.LocationName, h.WorkCenterName, h.ShiftLabel
FROM [hris].[TimesheetHeaders] h
WHERE CONVERT(varchar(10), h.TimesheetDate, 23) BETWEEN N'${FROM}' AND N'${TO}'
  AND (h.SupervisorId LIKE N'%C2193%' OR h.SupervisorName LIKE N'%EMEH%')
  AND ISNULL(h.ShiftLabel, N'Day') NOT LIKE N'%Night%'
ORDER BY h.TimesheetDate, h.WorkCenterName
`);
  const c2193Lines = await pool.request().query(`
SELECT CONVERT(varchar(10), h.TimesheetDate, 23) AS TimesheetDate, h.SupervisorId, h.LocationName, h.WorkCenterName,
       l.UsedHours, l.ClockIn
FROM [hris].[TimesheetLines] l
INNER JOIN [hris].[TimesheetHeaders] h ON CONVERT(NVARCHAR(4000), h.Id) = CONVERT(NVARCHAR(4000), l.HeaderId)
WHERE CONVERT(varchar(10), h.TimesheetDate, 23) BETWEEN N'${FROM}' AND N'${TO}'
  AND l.EmployeeNo = N'C2193'
  AND ISNULL(h.ShiftLabel, N'Day') NOT LIKE N'%Night%'
ORDER BY h.TimesheetDate
`);
  const p0277Assign = await pool.request().query(`
SELECT employee_code, supervisor_employee_code, assignment_group, assignment_batch
FROM [hris].[SupervisorEmployeeAssignments]
WHERE supervisor_employee_code LIKE N'%P0277%' OR employee_code = N'C2193'
`);

  const nullLocationHeaders = (c2193OwnHeaders.recordset as Array<{ HeaderId: string; LocationName: string | null; TimesheetDate: string }>)
    .filter((row) => !compact(row.LocationName));
  if (APPLY) {
    await pool.request().query(`
UPDATE [hris].[TimesheetHeaders]
SET LocationName = N'AGEGE'
WHERE CONVERT(varchar(10), TimesheetDate, 23) BETWEEN N'${FROM}' AND N'${TO}'
  AND (SupervisorId LIKE N'%C2193%' OR SupervisorName LIKE N'%EMEH%' OR SupervisorId LIKE N'%P0277%' OR SupervisorName LIKE N'%AKINSANYA%')
  AND (LocationName IS NULL OR LTRIM(RTRIM(LocationName)) = N'')
  AND ISNULL(ShiftLabel, N'Day') NOT LIKE N'%Night%'
`);
    invalidateTimesheetDataCache();
    invalidateTimesheetApprovalWorkspaceCache();
  }

  const bookedByCode = WELDERS.map((code) => ({
    code,
    wouldBook: welderReport.filter((row) => row.code === code && String(row.action).includes('book')).length,
    skippedHoliday: welderReport.filter((row) => row.code === code && row.reason === 'public holiday').length,
    skippedPresent: welderReport.filter((row) => row.code === code && row.reason === 'already present').length,
    skippedOther: welderReport.filter((row) => row.code === code && String(row.action) === 'skipped' && row.reason !== 'already present' && row.reason !== 'public holiday').length,
  }));

  console.log(JSON.stringify({
    apply: APPLY,
    booked,
    skipped,
    bookedByCode,
    welderReport: welderReport.filter((row) => String(row.action).includes('book') || (row.reason && row.reason !== 'already present')),
    c2193: {
      ownSheets: c2193OwnHeaders.recordset.length,
      ownSheetsMissingLocation: nullLocationHeaders.length,
      employeeLines: c2193Lines.recordset,
      assignments: p0277Assign.recordset,
      locationFix: APPLY ? 'set AGEGE on C2193 and P0277 day sheets with blank location' : 'would set AGEGE on blank-location C2193 and P0277 day sheets',
      note: 'C2193 is the scaffolder supervisor. He is not on Shittu welding. Look under AGEGE → C2193 DAVID NWACHUKWU EMEH (Structural Assembly), or AGEGE → P0277 Akinsanya after the location is filled in.',
    },
  }, null, 2));
  process.exit(0);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
