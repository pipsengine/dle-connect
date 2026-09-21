/**
 * 1. Paper-book C2722 Sunday Adeniji present on Agege Rigging for
 *    7 / 9 / 10 / 11 / 14 / 15 Sep 2026 (he came to work; clocks missed).
 *    Clear the 7 Sep Blasting duplicate so he is not paid twice.
 * 2. Remove C2083 from Raymond Adanou Fitting: assignment, reporting line,
 *    and Fitting timesheet rows so auto-book stops.
 *
 * Dry run:
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/repair-c2722-c2083.mts
 *
 * Apply:
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/repair-c2722-c2083.mts --apply
 */
import fs from 'node:fs';
import path from 'node:path';
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
import { invalidatePayrollEmployeeCache } from '../apps/dashboard/lib/payroll-employee-source';
import { invalidateTimesheetApprovalWorkspaceCache, invalidateTimesheetDataCache } from '../apps/dashboard/lib/timesheet-entry-store';

const APPLY = process.argv.includes('--apply');
const C2722 = 'C2722';
const C2083 = 'C2083';
const C2722_DATES = ['2026-09-07', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-14', '2026-09-15'];
const FITTER_JSON = path.resolve('scripts/database/supervisor-assignments/2026-09-02-agege-fitters-raymond-adanou.json');
const LOCKED = `N'HR_Acknowledged', N'Locked', N'Approved'`;

const compact = (value: unknown) => String(value || '').trim();

type SheetRow = {
  LineId: string;
  HeaderId: string;
  TimesheetDate: string;
  SupervisorId: string;
  WorkCenterName: string;
  LocationName: string | null;
  Status: string;
  EmployeeNo: string | null;
  EmployeeName: string | null;
  ClockIn: string | null;
  UsedHours: number | null;
  IdleHours: number | null;
  TotalHours: number | null;
  Remarks: string | null;
};

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

const isRigging = (row: SheetRow) => /rigg/i.test(compact(row.WorkCenterName));
const isAgege = (row: SheetRow) => /\bagege\b/i.test(compact(row.LocationName));
const isFitting = (row: SheetRow) => /fitt/i.test(compact(row.WorkCenterName));
const isAdanou = (row: SheetRow) => /c1720|adanou/i.test(compact(row.SupervisorId));
const bookedHours = (row: SheetRow) => Number(row.UsedHours || 0) > 0 || Number(row.TotalHours || 0) > 0;

const riggerScore = (row: SheetRow) => {
  let score = 0;
  if (isRigging(row)) score += 50;
  if (isAgege(row)) score += 30;
  if (!bookedHours(row) && !compact(row.ClockIn)) score += 20;
  if (/c1544|adeniyi/i.test(compact(row.SupervisorId))) score += 10;
  return score;
};

const majorityProject = async (pool: sql.ConnectionPool, headerId: string, skipLineId?: string) => {
  const local = await pool.request()
    .input('headerId', sql.NVarChar(160), headerId)
    .input('skipLineId', sql.NVarChar(220), skipLineId || '')
    .query(`
SELECT TOP 1 a.ProjectCode AS code, MAX(a.ProjectName) AS name, SUM(a.Hours) AS hours
FROM [hris].[TimesheetProjectAllocations] a
INNER JOIN [hris].[TimesheetLines] l ON l.Id = a.LineId
WHERE l.HeaderId = @headerId
  AND (@skipLineId = N'' OR l.Id <> @skipLineId)
  AND a.Hours > 0
  AND a.ProjectCode LIKE N'DL%'
GROUP BY a.ProjectCode
ORDER BY SUM(a.Hours) DESC
`);
  if (local.recordset[0]) return local.recordset[0] as { code: string; name: string; hours: number };

  const fallback = await pool.request().query(`
SELECT TOP 1 a.ProjectCode AS code, MAX(a.ProjectName) AS name, SUM(a.Hours) AS hours
FROM [hris].[TimesheetProjectAllocations] a
INNER JOIN [hris].[TimesheetLines] l ON l.Id = a.LineId
INNER JOIN [hris].[TimesheetHeaders] h ON h.Id = l.HeaderId
WHERE CONVERT(varchar(10), h.TimesheetDate, 23) BETWEEN N'2026-08-16' AND N'2026-09-15'
  AND (h.SupervisorId LIKE N'%C1544%' OR h.SupervisorName LIKE N'%ADENIYI%')
  AND h.WorkCenterName LIKE N'%Rigg%'
  AND a.Hours > 0
  AND a.ProjectCode LIKE N'DL%'
GROUP BY a.ProjectCode
ORDER BY SUM(a.Hours) DESC
`);
  return (fallback.recordset[0] || null) as { code: string; name: string; hours: number } | null;
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
SET ClockIn = NULL,
    ClockOut = NULL,
    AttendanceDuration = 0,
    UsedHours = @usedHours,
    IdleHours = @idleHours,
    TotalHours = @totalHours,
    Variance = 0,
    Remarks = @remarks,
    ValidationStatus = N'Valid',
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
    ValidationStatus = N'Incomplete',
    ValidationMessage = NULL,
    AttendanceMode = N'Biometric'
WHERE Id = @lineId;
DELETE FROM [hris].[TimesheetProjectAllocations] WHERE LineId = @lineId;
DELETE FROM [hris].[TimesheetIdleAllocations] WHERE LineId = @lineId;
`);
};

const deleteLine = async (pool: sql.ConnectionPool, lineId: string) => {
  await pool.request().input('lineId', sql.NVarChar(220), lineId).query(`
DELETE FROM [hris].[TimesheetProjectAllocations] WHERE LineId = @lineId;
DELETE FROM [hris].[TimesheetIdleAllocations] WHERE LineId = @lineId;
DELETE FROM [hris].[TimesheetLines] WHERE Id = @lineId;
`);
};

const unassignC2083 = async (pool: sql.ConnectionPool) => {
  const assignment = await pool.request().input('code', sql.NVarChar(50), C2083).query(`
SELECT employee_code, employee_name, supervisor_employee_code, supervisor_name, assignment_group, assignment_batch
FROM [hris].[SupervisorEmployeeAssignments]
WHERE employee_code = @code
`);
  const job = await pool.request().input('code', sql.NVarChar(50), C2083).query(`
SELECT e.employee_id, e.employee_code, e.full_name, e.employment_status, j.reporting_manager
FROM [hris].[Employees] e
LEFT JOIN [hris].[EmployeeJobInfo] j ON j.employee_id = e.employee_id
WHERE e.employee_code = @code
`);
  const jsonStillHas = (JSON.parse(fs.readFileSync(FITTER_JSON, 'utf8')).rows as Array<{ employeeCode?: string }>)
    .some((row) => compact(row.employeeCode).toUpperCase() === C2083);

  if (!APPLY) {
    return { action: 'would-unassign', jsonStillHas, assignment: assignment.recordset, job: job.recordset };
  }

  await pool.request().input('code', sql.NVarChar(50), C2083).query(`
DELETE FROM [hris].[SupervisorEmployeeAssignments]
WHERE employee_code = @code
`);

  const employeeId = job.recordset[0]?.employee_id;
  const previousManager = compact(job.recordset[0]?.reporting_manager) || null;
  if (employeeId) {
    await pool.request()
      .input('employee_id', sql.BigInt, employeeId)
      .query(`
UPDATE [hris].[EmployeeJobInfo]
SET reporting_manager = NULL, modified_at = SYSUTCDATETIME()
WHERE employee_id = @employee_id
`);
    await pool.request()
      .input('employee_id', sql.BigInt, employeeId)
      .input('audit_action', sql.NVarChar(150), 'Supervisor assignment updated')
      .input('performed_by', sql.NVarChar(128), 'scripts/repair-c2722-c2083.mts')
      .input('reason', sql.NVarChar(1000), 'Supervisor requested C2083 removed from Fitting: no longer working with the crew, stop automatic booking.')
      .input('old_value', sql.NVarChar(sql.MAX), JSON.stringify({ reportingManager: previousManager, assignment: assignment.recordset }))
      .input('new_value', sql.NVarChar(sql.MAX), JSON.stringify({ reportingManager: null, assignment: [] }))
      .query(`
INSERT [hris].[EmployeeAuditLog](employee_id, audit_action, performed_by, reason, old_value, new_value)
VALUES (@employee_id, @audit_action, @performed_by, @reason, @old_value, @new_value);
`);
  }

  invalidatePayrollEmployeeCache();
  return {
    action: 'unassigned',
    jsonStillHas,
    deletedAssignments: assignment.recordset,
    clearedReportingManager: previousManager,
    job: job.recordset,
  };
};

const main = async () => {
  loadEnvFiles();
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE Enterprise database is not configured.');

  const dateList = C2722_DATES.map((date) => `N'${date}'`).join(', ');
  const c2722Rows = await pool.request().query(`
SELECT l.Id AS LineId, h.Id AS HeaderId, CONVERT(varchar(10), h.TimesheetDate, 23) AS TimesheetDate,
       h.SupervisorId, h.WorkCenterName, h.LocationName, h.Status,
       l.EmployeeNo, l.EmployeeName, l.ClockIn, l.UsedHours, l.IdleHours, l.TotalHours, l.Remarks
FROM [hris].[TimesheetHeaders] h
INNER JOIN [hris].[TimesheetLines] l ON l.HeaderId = h.Id
WHERE CONVERT(varchar(10), h.TimesheetDate, 23) IN (${dateList})
  AND (l.EmployeeNo LIKE N'%C2722%' OR l.EmployeeId LIKE N'%C2722%')
  AND ISNULL(h.ShiftLabel, N'Day') NOT LIKE N'%Night%'
  AND h.Status NOT IN (${LOCKED})
ORDER BY h.TimesheetDate, h.WorkCenterName
`);
  const c2083Rows = await pool.request().query(`
SELECT l.Id AS LineId, h.Id AS HeaderId, CONVERT(varchar(10), h.TimesheetDate, 23) AS TimesheetDate,
       h.SupervisorId, h.WorkCenterName, h.LocationName, h.Status,
       l.EmployeeNo, l.EmployeeName, l.ClockIn, l.UsedHours, l.IdleHours, l.TotalHours, l.Remarks
FROM [hris].[TimesheetHeaders] h
INNER JOIN [hris].[TimesheetLines] l ON l.HeaderId = h.Id
WHERE (h.SupervisorId LIKE N'%C1720%' OR h.SupervisorName LIKE N'%ADANOU%')
  AND h.WorkCenterName LIKE N'%Fitt%'
  AND (l.EmployeeNo LIKE N'%C2083%' OR l.EmployeeId LIKE N'%C2083%')
  AND h.Status NOT IN (${LOCKED})
ORDER BY h.TimesheetDate DESC
`);

  const c2722: Array<Record<string, unknown>> = [];
  let booked = 0;
  let clearedDup = 0;
  const byDate = new Map<string, SheetRow[]>();
  for (const row of c2722Rows.recordset as SheetRow[]) {
    const date = compact(row.TimesheetDate);
    const bucket = byDate.get(date) || [];
    bucket.push(row);
    byDate.set(date, bucket);
  }

  for (const date of C2722_DATES) {
    const dayLines = byDate.get(date) || [];
    const target = dayLines.slice().sort((left, right) => riggerScore(right) - riggerScore(left))[0];
    if (!target) {
      c2722.push({ date, action: 'skipped', reason: 'No timesheet line' });
      continue;
    }
    if (compact(target.ClockIn)) {
      c2722.push({ date, headerId: target.HeaderId, action: 'skipped', reason: `clock-in ${compact(target.ClockIn)} present` });
      continue;
    }

    const project = await majorityProject(pool, target.HeaderId, target.LineId);
    if (!project) {
      c2722.push({ date, headerId: target.HeaderId, action: 'skipped', reason: 'No project on Agege Rigging to book against' });
      continue;
    }

    const alreadyOnTarget = bookedHours(target);
    if (!alreadyOnTarget && APPLY) {
      await paperBookLine(pool, target.LineId, compact(project.code), compact(project.name) || compact(project.code));
    }
    if (!alreadyOnTarget) booked += 1;

    for (const duplicate of dayLines) {
      if (duplicate.LineId === target.LineId) continue;
      if (!bookedHours(duplicate)) continue;
      const paperDup = compact(duplicate.Remarks).includes(PAPER_ATTENDANCE_REMARKS_MARKER);
      if (!paperDup && isRigging(duplicate)) continue;
      if (APPLY) await clearLine(pool, duplicate.LineId);
      clearedDup += 1;
      c2722.push({
        date,
        action: APPLY ? 'cleared-duplicate' : 'would-clear-duplicate',
        duplicateHeaderId: duplicate.HeaderId,
        duplicateWorkCenter: duplicate.WorkCenterName,
      });
    }

    c2722.push({
      date,
      headerId: target.HeaderId,
      workCenter: target.WorkCenterName,
      location: target.LocationName,
      status: target.Status,
      action: alreadyOnTarget ? 'already-booked' : (APPLY ? 'booked' : 'would-book'),
      projectCode: compact(project.code),
      hours: 8,
    });
  }

  const c2083Removed: Array<Record<string, unknown>> = [];
  for (const row of c2083Rows.recordset as SheetRow[]) {
    if (!isAdanou(row) || !isFitting(row)) continue;
    if (APPLY) await deleteLine(pool, row.LineId);
    c2083Removed.push({
      date: row.TimesheetDate,
      headerId: row.HeaderId,
      status: row.Status,
      employeeName: row.EmployeeName,
      clockIn: row.ClockIn,
      usedHours: row.UsedHours,
      action: APPLY ? 'removed-line' : 'would-remove-line',
    });
  }

  const unassign = await unassignC2083(pool);
  if (APPLY) {
    invalidateTimesheetDataCache();
    invalidateTimesheetApprovalWorkspaceCache();
  }

  console.log(JSON.stringify({
    apply: APPLY,
    c2722: { booked, clearedDup, reports: c2722 },
    c2083: { removedLines: c2083Removed.length, lines: c2083Removed, unassign },
  }, null, 2));
};

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
