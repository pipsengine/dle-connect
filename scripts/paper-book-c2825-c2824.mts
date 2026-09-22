/**
 * Paper-book present days:
 *   C2825 Akande Ismaila  2026-08-17 → 2026-09-15
 *   C2824 Salawu Muyideen 2026-08-20 → 2026-09-15  (Welding)
 * Skip Eid Maulud 2026-08-25. Do not invent clocks.
 *
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/paper-book-c2825-c2824.mts
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/paper-book-c2825-c2824.mts --apply
 */
import sql from 'mssql';
import { randomUUID } from 'node:crypto';
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
const HOLIDAYS = new Set(['2026-08-25']);
const FALLBACK_PROJECT = { code: 'DL2601', name: 'DL2601' };

const TARGETS = [
  { code: 'C2825', name: 'Akande Ismaila', from: '2026-08-17', to: '2026-09-15' },
  { code: 'C2824', name: 'Salawu Muyideen', from: '2026-08-20', to: '2026-09-15' },
] as const;

const compact = (value: unknown) => String(value || '').trim();

const dateOnly = (value: string) => compact(value).slice(0, 10);

const addDays = (value: string, days: number) => {
  const [year, month, day] = dateOnly(value).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};

const weekday = (value: string) => new Date(`${dateOnly(value)}T12:00:00`).getDay();

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
SELECT TOP 1 a.ProjectCode AS code, MAX(a.ProjectName) AS name
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
  return FALLBACK_PROJECT;
};

const pickHeader = async (pool: sql.ConnectionPool, date: string) => {
  const result = await pool.request()
    .input('date', sql.NVarChar(10), date)
    .query(`
SELECT TOP 1 h.Id AS HeaderId, h.Status, h.SupervisorId, h.SupervisorName, h.LocationName, h.WorkCenterName
FROM [hris].[TimesheetHeaders] h
WHERE CONVERT(varchar(10), h.TimesheetDate, 23) = @date
  AND ISNULL(h.ShiftLabel, N'Day') NOT LIKE N'%Night%'
  AND (h.SupervisorId LIKE N'%C1229%' OR h.SupervisorName LIKE N'%SHITTU%')
  AND ISNULL(h.LocationName, N'') LIKE N'%AGEGE%'
ORDER BY
  CASE WHEN ISNULL(h.WorkCenterName, N'') LIKE N'%Weld%' THEN 0 ELSE 1 END,
  CASE WHEN h.Status IN (N'Draft', N'Submitted', N'Returned') THEN 0 ELSE 1 END,
  h.Id DESC
`);
  return (result.recordset[0] || null) as {
    HeaderId: string;
    Status: string;
    SupervisorId: string;
    SupervisorName: string;
    LocationName: string | null;
    WorkCenterName: string | null;
  } | null;
};

const employeeNameOnFile = async (pool: sql.ConnectionPool, code: string, fallback: string) => {
  const result = await pool.request()
    .input('code', sql.NVarChar(40), code)
    .query(`
SELECT TOP 1 EmployeeName FROM [hris].[TimesheetLines]
WHERE EmployeeNo = @code AND ISNULL(EmployeeName, N'') <> N''
ORDER BY Id DESC
`);
  return compact(result.recordset[0]?.EmployeeName) || fallback;
};

const insertLine = async (pool: sql.ConnectionPool, headerId: string, code: string, name: string) => {
  const lineId = `tsl-${randomUUID()}`;
  await pool.request()
    .input('id', sql.NVarChar(220), lineId)
    .input('headerId', sql.NVarChar(160), headerId)
    .input('employeeNo', sql.NVarChar(40), code)
    .input('employeeName', sql.NVarChar(200), name)
    .query(`
INSERT INTO [hris].[TimesheetLines]
  ([Id],[HeaderId],[EmployeeId],[EmployeeNo],[EmployeeName],[ClockIn],[ClockOut],[AttendanceDuration],
   [UsedHours],[IdleHours],[TotalHours],[Variance],[Remarks],[ValidationStatus],[ValidationMessage],[AttendanceMode])
VALUES
  (@id, @headerId, @employeeNo, @employeeNo, @employeeName, NULL, NULL, 0,
   0, 0, 0, 0, N'', N'Pending', N'', N'Manual')
`);
  return lineId;
};

const main = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE Enterprise database is not configured.');

  const report: Array<Record<string, unknown>> = [];
  let booked = 0;
  let skipped = 0;

  for (const target of TARGETS) {
    const displayName = await employeeNameOnFile(pool, target.code, target.name);
    const existing = await pool.request()
      .input('code', sql.NVarChar(40), target.code)
      .input('from', sql.NVarChar(10), target.from)
      .input('to', sql.NVarChar(10), target.to)
      .query(`
SELECT l.Id AS LineId, h.Id AS HeaderId, CONVERT(varchar(10), h.TimesheetDate, 23) AS TimesheetDate,
       h.Status, l.ClockIn, l.UsedHours, l.EmployeeName
FROM [hris].[TimesheetHeaders] h
INNER JOIN [hris].[TimesheetLines] l ON CONVERT(NVARCHAR(4000), l.HeaderId) = CONVERT(NVARCHAR(4000), h.Id)
WHERE l.EmployeeNo = @code
  AND CONVERT(varchar(10), h.TimesheetDate, 23) BETWEEN @from AND @to
  AND ISNULL(h.ShiftLabel, N'Day') NOT LIKE N'%Night%'
ORDER BY h.TimesheetDate
`);
    const byDate = new Map<string, typeof existing.recordset[0]>();
    for (const row of existing.recordset) {
      const date = dateOnly(row.TimesheetDate);
      const current = byDate.get(date);
      if (!current || Number(row.UsedHours || 0) > Number(current.UsedHours || 0)) byDate.set(date, row);
    }

    for (let date = target.from; date <= target.to; date = addDays(date, 1)) {
      if (weekday(date) === 0) {
        skipped += 1;
        report.push({ code: target.code, date, action: 'skipped', reason: 'Sunday' });
        continue;
      }
      if (HOLIDAYS.has(date)) {
        skipped += 1;
        report.push({ code: target.code, date, action: 'skipped', reason: 'public holiday (Eid Maulud)' });
        continue;
      }

      let row = byDate.get(date) || null;
      if (row) {
        const locked = /hr_acknowledged|locked|approved/i.test(compact(row.Status).replace(/[\s-]+/g, '_'));
        if (locked) {
          skipped += 1;
          report.push({ code: target.code, date, action: 'skipped', reason: `timesheet ${row.Status} is locked` });
          continue;
        }
        if (Number(row.UsedHours || 0) > 0 || compact(row.ClockIn)) {
          skipped += 1;
          report.push({ code: target.code, date, action: 'skipped', reason: 'already present' });
          continue;
        }
        const project = await majorityProject(pool, String(row.HeaderId), String(row.LineId));
        if (APPLY) await paperBookLine(pool, String(row.LineId), project.code, project.name || project.code);
        booked += 1;
        report.push({
          code: target.code,
          name: displayName,
          date,
          action: APPLY ? 'booked' : 'would-book',
          status: row.Status,
          project: project.code,
          hours: 8,
        });
        continue;
      }

      const header = await pickHeader(pool, date);
      if (!header) {
        skipped += 1;
        report.push({ code: target.code, date, action: 'skipped', reason: 'No Agege Shittu day sheet' });
        continue;
      }
      const locked = /hr_acknowledged|locked|approved/i.test(compact(header.Status).replace(/[\s-]+/g, '_'));
      if (locked) {
        skipped += 1;
        report.push({ code: target.code, date, action: 'skipped', reason: `timesheet ${header.Status} is locked` });
        continue;
      }
      const project = await majorityProject(pool, header.HeaderId);
      let lineId = `pending-${date}-${target.code}`;
      if (APPLY) {
        lineId = await insertLine(pool, header.HeaderId, target.code, displayName);
        await paperBookLine(pool, lineId, project.code, project.name || project.code);
      }
      booked += 1;
      report.push({
        code: target.code,
        name: displayName,
        date,
        action: APPLY ? 'added-and-booked' : 'would-add-and-book',
        status: header.Status,
        headerId: header.HeaderId,
        project: project.code,
        hours: 8,
      });
    }
  }

  if (APPLY) {
    invalidateTimesheetDataCache();
    invalidateTimesheetApprovalWorkspaceCache();
  }

  const remaining = await pool.request().query(`
SELECT l.EmployeeNo, CONVERT(varchar(10), h.TimesheetDate, 23) AS d, h.Status,
       CAST(ISNULL(l.UsedHours,0) AS decimal(10,2)) AS usedHours
FROM [hris].[TimesheetLines] l
JOIN [hris].[TimesheetHeaders] h ON CONVERT(NVARCHAR(4000), h.Id) = CONVERT(NVARCHAR(4000), l.HeaderId)
WHERE l.EmployeeNo IN (N'C2825', N'C2824')
  AND CONVERT(varchar(10), h.TimesheetDate, 23) BETWEEN N'2026-08-17' AND N'2026-09-15'
  AND ISNULL(h.ShiftLabel, N'Day') NOT LIKE N'%Night%'
  AND ISNULL(l.UsedHours, 0) = 0
  AND ISNULL(l.ClockIn, N'') = N''
ORDER BY l.EmployeeNo, h.TimesheetDate
`);

  console.log(JSON.stringify({
    apply: APPLY,
    booked,
    skipped,
    bookedRows: report.filter((row) => String(row.action).includes('book')),
    skippedOther: report.filter((row) => row.action === 'skipped' && row.reason !== 'already present' && row.reason !== 'Sunday'),
    stillZeroHours: remaining.recordset,
  }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
