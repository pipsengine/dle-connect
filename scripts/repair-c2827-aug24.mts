/**
 * Paper-book C2827 Charles Akaka present on 24 Aug 2026 (the remaining Absent day).
 * Copies the 26 Aug split: 4h DL2421 + 4h DL2423 + 1h break, paper + offshore marker.
 *
 * Dry run:
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/repair-c2827-aug24.mts
 *
 * Apply:
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/repair-c2827-aug24.mts --apply
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
  OFFSHORE_REMARKS_MARKER,
  PAPER_ATTENDANCE_REMARKS_MARKER,
  STANDARD_TIMESHEET_HOURS,
} from '../apps/dashboard/lib/timesheet-entry-shared';
import { invalidateTimesheetApprovalWorkspaceCache, invalidateTimesheetDataCache } from '../apps/dashboard/lib/timesheet-entry-store';

const APPLY = process.argv.includes('--apply');
const DATE = '2026-08-24';
const TEMPLATE_DATE = '2026-08-26';
const CODE = 'C2827';
const LINE_ID = 'line-hdr-2026-08-24-p0289---mrs-ebele-victoria-onugha-painting-day-C2827';
const HEADER_ID = 'hdr-2026-08-24-p0289---mrs-ebele-victoria-onugha-painting-day';
const REMARKS = `${PAPER_ATTENDANCE_REMARKS_MARKER} | ${OFFSHORE_REMARKS_MARKER}`;

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
  if (!pool) throw new Error('DLE Enterprise database is not configured.');

  const line = await pool.request().input('lineId', sql.NVarChar(220), LINE_ID).query(`
SELECT l.Id, l.HeaderId, l.EmployeeNo, l.EmployeeName, l.ClockIn, l.UsedHours, l.TotalHours, l.Remarks, l.AttendanceMode, l.OffshoreAllowanceHours, h.Status
FROM [hris].[TimesheetLines] l
INNER JOIN [hris].[TimesheetHeaders] h ON h.Id = l.HeaderId
WHERE l.Id = @lineId
`);
  const current = line.recordset[0];
  if (!current) throw new Error(`C2827 line was not found on ${DATE}.`);

  const template = await pool.request().query(`
SELECT a.ProjectCode, a.ProjectName, a.Hours, a.Remarks
FROM [hris].[TimesheetHeaders] h
INNER JOIN [hris].[TimesheetLines] l ON l.HeaderId = h.Id
INNER JOIN [hris].[TimesheetProjectAllocations] a ON a.LineId = l.Id
WHERE CONVERT(varchar(10), h.TimesheetDate, 23) = N'${TEMPLATE_DATE}'
  AND (l.EmployeeNo LIKE N'%${CODE}%' OR l.EmployeeId LIKE N'%${CODE}%')
  AND a.Hours > 0
ORDER BY a.Hours DESC, a.ProjectCode
`);
  const projects = template.recordset as Array<{ ProjectCode: string; ProjectName: string; Hours: number; Remarks: string | null }>;
  if (!projects.length) throw new Error(`No ${TEMPLATE_DATE} project split found for ${CODE}.`);

  const templateLine = await pool.request().query(`
SELECT TOP 1 l.OffshoreAllowanceHours
FROM [hris].[TimesheetHeaders] h
INNER JOIN [hris].[TimesheetLines] l ON l.HeaderId = h.Id
WHERE CONVERT(varchar(10), h.TimesheetDate, 23) = N'${TEMPLATE_DATE}'
  AND (l.EmployeeNo LIKE N'%${CODE}%' OR l.EmployeeId LIKE N'%${CODE}%')
`);
  const offshoreAllowanceHours = Number(templateLine.recordset[0]?.OffshoreAllowanceHours || 0);

  const report = {
    date: DATE,
    headerId: HEADER_ID,
    lineId: LINE_ID,
    status: current.Status,
    employeeName: current.EmployeeName,
    before: { usedHours: current.UsedHours, remarks: current.Remarks, clockIn: current.ClockIn },
    projects: projects.map((row) => ({ code: row.ProjectCode, name: row.ProjectName, hours: Number(row.Hours) })),
    offshoreAllowanceHours,
  };

  if (Number(current.UsedHours || 0) > 0 || Number(current.TotalHours || 0) > 0) {
    console.log(JSON.stringify({ apply: APPLY, action: 'already-booked', ...report }, null, 2));
    process.exit(0);
  }

  if (APPLY) {
    await pool.request()
      .input('lineId', sql.NVarChar(220), LINE_ID)
      .input('usedHours', sql.Decimal(9, 2), STANDARD_TIMESHEET_HOURS)
      .input('idleHours', sql.Decimal(9, 2), DAILY_BREAK_HOURS)
      .input('totalHours', sql.Decimal(9, 2), GROSS_TIMESHEET_HOURS)
      .input('remarks', sql.NVarChar(500), REMARKS)
      .input('offshoreAllowanceHours', sql.Decimal(9, 2), offshoreAllowanceHours)
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
    AttendanceMode = N'Manual',
    OffshoreAllowanceHours = @offshoreAllowanceHours
WHERE Id = @lineId
`);
    await pool.request().input('lineId', sql.NVarChar(220), LINE_ID).query(`
DELETE FROM [hris].[TimesheetProjectAllocations] WHERE LineId = @lineId;
DELETE FROM [hris].[TimesheetIdleAllocations] WHERE LineId = @lineId;
`);
    for (const project of projects) {
      await pool.request()
        .input('lineId', sql.NVarChar(220), LINE_ID)
        .input('projectCode', sql.NVarChar(50), project.ProjectCode)
        .input('projectName', sql.NVarChar(255), project.ProjectName)
        .input('hours', sql.Decimal(9, 2), Number(project.Hours))
        .input('allocRemarks', sql.NVarChar(500), project.Remarks || 'Paper book: present at work, clock registered late.')
        .query(`
INSERT INTO [hris].[TimesheetProjectAllocations]
  ([LineId],[ProjectId],[ProjectCode],[ProjectName],[TaskId],[TaskName],[ActivityId],[Hours],[Remarks])
VALUES (@lineId, @projectCode, @projectCode, @projectName, NULL, NULL, NULL, @hours, @allocRemarks)
`);
    }
    await pool.request()
      .input('lineId', sql.NVarChar(220), LINE_ID)
      .input('reasonId', sql.NVarChar(80), DEFAULT_BREAK_IDLE_REASON_ID)
      .input('reasonName', sql.NVarChar(180), DEFAULT_BREAK_IDLE_REASON_NAME)
      .input('hours', sql.Decimal(9, 2), DAILY_BREAK_HOURS)
      .query(`
INSERT INTO [hris].[TimesheetIdleAllocations]
  ([LineId],[ReasonId],[ReasonName],[Hours],[Remarks])
VALUES (@lineId, @reasonId, @reasonName, @hours, N'Break Time')
`);
    invalidateTimesheetDataCache();
    invalidateTimesheetApprovalWorkspaceCache();
  }

  console.log(JSON.stringify({
    apply: APPLY,
    action: APPLY ? 'booked' : 'would-book',
    ...report,
  }, null, 2));
};

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
