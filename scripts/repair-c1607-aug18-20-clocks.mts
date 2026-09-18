/**
 * Stamp C1607 Ojika clocks on Abel Cutting 18–20 Aug (submitted, period may be closed).
 *
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/repair-c1607-aug18-20-clocks.mts --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import sql from 'mssql';

import { getDleEnterpriseDbPool, loadWorkspaceEnv } from '../apps/dashboard/lib/dle-enterprise-db';
import { attendanceDurationFromClock, DAILY_BREAK_HOURS, STANDARD_TIMESHEET_HOURS } from '../apps/dashboard/lib/timesheet-entry-shared';

const DATES = ['2026-08-18', '2026-08-19', '2026-08-20'] as const;
const CLOCKS: Record<(typeof DATES)[number], { clockIn: string; clockOut: string }> = {
  '2026-08-18': { clockIn: '08:00', clockOut: '18:04' },
  '2026-08-19': { clockIn: '08:00', clockOut: '18:55' },
  '2026-08-20': { clockIn: '08:46', clockOut: '17:53' },
};

const loadEnvFiles = () => {
  for (const file of [path.resolve('.env'), path.resolve('apps/dashboard/.env'), path.resolve('apps/dashboard/.env.local')]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[match[1]]) process.env[match[1]] = value;
    }
  }
  loadWorkspaceEnv();
};

const main = async () => {
  loadEnvFiles();
  const apply = process.argv.includes('--apply');
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('No DLE Enterprise database.');
  const updated: Array<Record<string, unknown>> = [];
  for (const date of DATES) {
    const clock = CLOCKS[date];
    const duration = attendanceDurationFromClock(clock.clockIn, clock.clockOut) || STANDARD_TIMESHEET_HOURS + DAILY_BREAK_HOURS;
    const lines = await pool.request()
      .input('date', sql.VarChar(10), date)
      .query(`
SELECT h.Id AS HeaderId, h.Status, l.Id AS LineId, l.ClockIn, l.ClockOut, l.UsedHours, l.TotalHours
FROM [hris].[TimesheetHeaders] h
INNER JOIN [hris].[TimesheetLines] l ON l.HeaderId = h.Id
WHERE CONVERT(varchar(10), h.TimesheetDate, 23) = @date
  AND h.WorkCenterName LIKE N'%Cutting%'
  AND h.SupervisorId LIKE N'%C2225%'
  AND (l.EmployeeNo = N'C1607' OR l.EmployeeId = N'C1607')
`);
    const line = lines.recordset[0];
    if (!line) {
      updated.push({ date, error: 'C1607 Cutting line not found' });
      continue;
    }
    const sibling = await pool.request()
      .input('headerId', sql.NVarChar(160), line.HeaderId)
      .query(`
SELECT TOP 1 a.ProjectId, a.ProjectCode, a.ProjectName, a.TaskId, a.TaskName, a.ActivityId
FROM [hris].[TimesheetProjectAllocations] a
INNER JOIN [hris].[TimesheetLines] l ON l.Id = a.LineId
WHERE l.HeaderId = @headerId
  AND a.Hours > 0
  AND a.ProjectCode NOT LIKE N'%IDLE%'
ORDER BY a.Hours DESC
`);
    const project = sibling.recordset[0] as {
      ProjectId?: string;
      ProjectCode?: string;
      ProjectName?: string;
      TaskId?: string | null;
      TaskName?: string | null;
      ActivityId?: string | null;
    } | undefined;
    if (apply) {
      await pool.request()
        .input('lineId', sql.NVarChar(160), line.LineId)
        .input('clockIn', sql.NVarChar(20), clock.clockIn)
        .input('clockOut', sql.NVarChar(20), clock.clockOut)
        .input('duration', sql.Float, Math.round(duration * 10) / 10)
        .input('used', sql.Float, STANDARD_TIMESHEET_HOURS)
        .input('idle', sql.Float, DAILY_BREAK_HOURS)
        .input('total', sql.Float, STANDARD_TIMESHEET_HOURS + DAILY_BREAK_HOURS)
        .query(`
UPDATE [hris].[TimesheetLines]
SET ClockIn = @clockIn,
    ClockOut = @clockOut,
    AttendanceDuration = @duration,
    AttendanceMode = N'Biometric',
    UsedHours = CASE WHEN UsedHours > 0 THEN UsedHours ELSE @used END,
    IdleHours = CASE WHEN IdleHours > 0 THEN IdleHours ELSE @idle END,
    TotalHours = CASE WHEN TotalHours > 0 THEN TotalHours ELSE @total END,
    ValidationStatus = N'Valid',
    ValidationMessage = NULL,
    BiometricId = CONCAT(N'repair-c1607-', CONVERT(varchar(10), SYSUTCDATETIME(), 112))
WHERE Id = @lineId
`);
      const hasAlloc = await pool.request()
        .input('lineId', sql.NVarChar(160), line.LineId)
        .query(`SELECT COUNT(*) AS n FROM [hris].[TimesheetProjectAllocations] WHERE LineId = @lineId AND Hours > 0`);
      if (!Number(hasAlloc.recordset[0]?.n || 0) && project?.ProjectCode) {
        await pool.request()
          .input('lineId', sql.NVarChar(160), line.LineId)
          .input('projectId', sql.NVarChar(80), project.ProjectId || project.ProjectCode)
          .input('projectCode', sql.NVarChar(50), project.ProjectCode)
          .input('projectName', sql.NVarChar(255), project.ProjectName || project.ProjectCode)
          .input('taskId', sql.NVarChar(80), project.TaskId || null)
          .input('taskName', sql.NVarChar(255), project.TaskName || null)
          .input('activityId', sql.NVarChar(80), project.ActivityId || null)
          .input('hours', sql.Float, STANDARD_TIMESHEET_HOURS)
          .query(`
INSERT INTO [hris].[TimesheetProjectAllocations]
  ([LineId],[ProjectId],[ProjectCode],[ProjectName],[TaskId],[TaskName],[ActivityId],[Hours],[Remarks])
VALUES
  (@lineId,@projectId,@projectCode,@projectName,@taskId,@taskName,@activityId,@hours,N'Auto-booked from biometric attendance.')
`);
      }
      const hasIdle = await pool.request()
        .input('lineId', sql.NVarChar(160), line.LineId)
        .query(`SELECT COUNT(*) AS n FROM [hris].[TimesheetIdleAllocations] WHERE LineId = @lineId AND Hours > 0`);
      if (!Number(hasIdle.recordset[0]?.n || 0)) {
        await pool.request()
          .input('lineId', sql.NVarChar(160), line.LineId)
          .input('hours', sql.Float, DAILY_BREAK_HOURS)
          .query(`
INSERT INTO [hris].[TimesheetIdleAllocations] ([LineId],[ReasonId],[ReasonName],[Hours],[Remarks])
VALUES (@lineId, N'idl-009', N'Break Time', @hours, N'Break')
`);
      }
      await pool.request()
        .input('date', sql.VarChar(10), date)
        .query(`
DELETE l
FROM [hris].[TimesheetLines] l
INNER JOIN [hris].[TimesheetHeaders] h ON h.Id = l.HeaderId
WHERE CONVERT(varchar(10), h.TimesheetDate, 23) = @date
  AND h.SupervisorId LIKE N'%P0277%'
  AND h.WorkCenterName LIKE N'%Blasting%'
  AND (l.EmployeeNo = N'C1607' OR l.EmployeeId = N'C1607')
`);
    }
    updated.push({
      date,
      apply,
      headerId: line.HeaderId,
      status: line.Status,
      from: { clockIn: line.ClockIn, clockOut: line.ClockOut, usedHours: line.UsedHours },
      to: clock,
      duration: Math.round(duration * 10) / 10,
      projectCode: project?.ProjectCode || null,
    });
  }
  console.log(JSON.stringify({ updated }, null, 2));
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
