/**
 * Agege Cutting attendance + Akinsanya galvanizing crew + C2087 fitter list.
 *
 * Dry run:
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/repair-agege-cutting-galvanizing-fitters.mts
 *
 * Apply:
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/repair-agege-cutting-galvanizing-fitters.mts --apply
 *
 * Finish (restore department reporting lines, Abel CNC roster, verify, retry thin Abel sheets):
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/repair-agege-cutting-galvanizing-fitters.mts --finish
 */
import fs from 'node:fs';
import path from 'node:path';
import sql from 'mssql';

import { assignEmployeesToSupervisor } from '../apps/dashboard/lib/supervisor-assignment-store';
import { getDleEnterpriseDbPool, loadWorkspaceEnv } from '../apps/dashboard/lib/dle-enterprise-db';
import { syncAttendanceForTimesheet } from '../apps/dashboard/lib/timesheet-entry-store';
import { isAgegeTimesheetLocation } from '../apps/dashboard/lib/timesheet-agege-blasting';

type RosterFile = {
  assignmentBatch: string;
  assignmentGroup: string;
  supervisorEmployeeCode: string;
  exclusive?: boolean;
  performedBy?: string;
  reason?: string;
  rows: Array<{
    sourceName: string;
    tradeRole?: string;
    employeeCode: string;
    matchConfidence?: string;
    matchNote?: string;
  }>;
};

const CUTTING_DATES = [
  '2026-08-18',
  '2026-08-19',
  '2026-08-20',
  '2026-08-27',
  '2026-09-01',
  '2026-09-02',
  '2026-09-08',
  '2026-09-09',
  '2026-09-10',
  '2026-09-11',
];

const ROSTER_FILES = [
  '2026-09-18-agege-galvanizing-akinsanya-adebobola.json',
  '2026-09-02-agege-fitters-raymond-adanou.json',
];

const ABEL_CNC_ROSTER = '2026-09-02-agege-cnc-abel-daniel.json';
const P0277_RESTORE_FILE = '2026-09-18-p0277-reporting-managers-to-restore.json';
const GALVANIZING_CREW = ['C2506', 'C2408', 'C2396', 'C2394', 'C2522', 'C2443', 'C2512'];
const ABEL_CNC_CREW = ['C2224', 'C2222', 'C2221', 'C2632', 'C2633', 'C2015', 'C1607', 'C2220', 'C2225'];
const P0277_LABEL = 'P0277 - Mr ADEBOBOLA MORUF AKINSANYA';

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

const applyRoster = async (fileName: string, apply: boolean) => {
  const rosterDir = path.resolve('scripts/database/supervisor-assignments');
  const roster = JSON.parse(fs.readFileSync(path.join(rosterDir, fileName), 'utf8')) as RosterFile;
  const employeeCodes = roster.rows.map((row) => row.employeeCode);
  console.log(`${apply ? 'APPLY' : 'DRY RUN'}  ${roster.supervisorEmployeeCode}  ${roster.assignmentGroup}  ${employeeCodes.join(', ')}`);
  if (!apply) {
    return { file: fileName, supervisor: roster.supervisorEmployeeCode, employees: employeeCodes, extrasRemoved: [] as string[] };
  }
  const result = await assignEmployeesToSupervisor({
    supervisorEmployeeCode: roster.supervisorEmployeeCode,
    employeeCodes,
    assignmentBatch: roster.assignmentBatch,
    assignmentGroup: roster.assignmentGroup,
    reason: roster.reason,
    performedBy: roster.performedBy || 'scripts/repair-agege-cutting-galvanizing-fitters.mts',
    exclusive: roster.exclusive === true,
    sourceRows: roster.rows.map((row) => ({
      employeeCode: row.employeeCode,
      sourceLabel: row.sourceName,
      tradeRole: row.tradeRole,
      matchConfidence: row.matchConfidence,
      matchNote: row.matchNote,
    })),
  });
  const extrasRemoved = (result.extrasRemoved || []).map((row) => row.employeeCode);
  if (extrasRemoved.length) console.log(`  Removed extras from ${roster.supervisorEmployeeCode}: ${extrasRemoved.join(', ')}`);
  return {
    file: fileName,
    supervisor: result.supervisor.reportingManagerLabel,
    matched: result.assignments.filter((row) => row.matchedStatus === 'Matched').length,
    extrasRemoved,
  };
};

const resyncAgegeCutting = async (apply: boolean) => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE Enterprise database is not configured.');
  const result = await pool.request().query(`
SELECT DISTINCT TimesheetDate, SupervisorId, WorkCenterName, LocationName, ShiftLabel
FROM [hris].[TimesheetHeaders]
WHERE WorkCenterName LIKE N'%Cutting%'
  AND TimesheetDate IN (${CUTTING_DATES.map((date) => `N'${date}'`).join(', ')})
`);
  const headers = result.recordset.filter((row) => {
    const supervisorId = String(row.SupervisorId || '');
    if (/^0000/i.test(supervisorId)) return false;
    return isAgegeTimesheetLocation(row.LocationName) || !String(row.LocationName || '').trim();
  });
  console.log(`${apply ? 'APPLY' : 'DRY RUN'}  Agege Cutting resync candidates: ${headers.length}`);
  const synced: Array<Record<string, unknown>> = [];
  if (!apply) {
    return headers.map((row) => ({
      date: row.TimesheetDate,
      supervisorId: row.SupervisorId,
      locationName: row.LocationName,
      shiftLabel: row.ShiftLabel,
    }));
  }
  for (const row of headers) {
    const date = row.TimesheetDate instanceof Date ? row.TimesheetDate.toISOString().slice(0, 10) : String(row.TimesheetDate).slice(0, 10);
    const summary = await syncAttendanceForTimesheet(
      date,
      String(row.SupervisorId || ''),
      String(row.WorkCenterName || 'Cutting'),
      String(row.LocationName || 'AGEGE'),
      { persist: true, shiftLabel: row.ShiftLabel },
    );
    synced.push({
      date,
      supervisorId: row.SupervisorId,
      headerId: summary.header?.id,
      lines: summary.lines?.length,
    });
    console.log(`  synced ${date} ${row.SupervisorId} lines=${summary.lines?.length || 0}`);
  }
  return synced;
};

const restoreP0277ReportingManagers = async () => {
  const rosterDir = path.resolve('scripts/database/supervisor-assignments');
  const restore = JSON.parse(fs.readFileSync(path.join(rosterDir, P0277_RESTORE_FILE), 'utf8')) as {
    reportingManagerLabel: string;
    employeeCodes: string[];
  };
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE Enterprise database is not configured.');
  const keepAssigned = new Set([...GALVANIZING_CREW, 'C2087'].map((code) => code.toUpperCase()));
  const codes = restore.employeeCodes.filter((code) => !keepAssigned.has(code.toUpperCase()));
  if (!codes.length) return { restored: 0 };
  const request = pool.request()
    .input('reporting_manager', sql.NVarChar(250), restore.reportingManagerLabel || P0277_LABEL);
  codes.forEach((code, index) => request.input(`c${index}`, sql.NVarChar(50), code));
  const result = await request.query(`
UPDATE j
SET reporting_manager = @reporting_manager, modified_at = SYSUTCDATETIME()
FROM [hris].[EmployeeJobInfo] j
INNER JOIN [hris].[Employees] e ON e.employee_id = j.employee_id
WHERE e.employee_code IN (${codes.map((_, index) => `@c${index}`).join(', ')})
  AND NULLIF(LTRIM(RTRIM(j.reporting_manager)), N'') IS NULL;
`);
  const restored = Number(result.rowsAffected?.[0] || 0);
  console.log(`RESTORE  P0277 reporting managers: ${restored}`);
  return { restored };
};

const verifyAgegeRepairs = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE Enterprise database is not configured.');
  const [c1607, galvanizing, fitter, extrasNull] = await Promise.all([
    pool.request().query(`
SELECT CONVERT(varchar(10), h.TimesheetDate, 23) AS TimesheetDate,
       h.SupervisorId, h.LocationName, l.EmployeeNo, l.EmployeeName, l.ClockIn, l.ClockOut, l.AttendanceDuration
FROM [hris].[TimesheetHeaders] h
INNER JOIN [hris].[TimesheetLines] l ON l.HeaderId = h.Id
WHERE h.WorkCenterName LIKE N'%Cutting%'
  AND h.TimesheetDate IN (${CUTTING_DATES.map((date) => `N'${date}'`).join(', ')})
  AND (l.EmployeeNo LIKE N'%C1607%' OR l.EmployeeId LIKE N'%C1607%' OR l.EmployeeName LIKE N'%C1607%' OR l.EmployeeName LIKE N'%OJIKA%')
ORDER BY h.TimesheetDate, h.SupervisorId
`),
    pool.request().query(`
SELECT employee_code, employee_name, supervisor_employee_code
FROM [hris].[SupervisorEmployeeAssignments]
WHERE supervisor_employee_code = N'P0277'
ORDER BY employee_code
`),
    pool.request().query(`
SELECT employee_code, employee_name, supervisor_employee_code, supervisor_name
FROM [hris].[SupervisorEmployeeAssignments]
WHERE employee_code = N'C2087'
`),
    pool.request().query(`
SELECT COUNT(*) AS NullManagers
FROM [hris].[EmployeeJobInfo] j
INNER JOIN [hris].[Employees] e ON e.employee_id = j.employee_id
WHERE NULLIF(LTRIM(RTRIM(j.reporting_manager)), N'') IS NULL
  AND e.employee_code IN (N'C1001', N'C1720', N'C2225')
`),
  ]);
  return {
    c1607: c1607.recordset,
    galvanizingCrew: galvanizing.recordset,
    thomsonNkanu: fitter.recordset,
    supervisorManagersCleared: extrasNull.recordset,
  };
};

const migrateAbelCncBlastingToCutting = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE Enterprise database is not configured.');
  const tx = new sql.Transaction(pool);
  await tx.begin();
  const moved: Array<Record<string, unknown>> = [];
  try {
    const headers = await new sql.Request(tx).query(`
SELECT Id, CONVERT(varchar(10), TimesheetDate, 23) AS TimesheetDate, SupervisorId, WorkCenterName, LocationName, Status, ShiftLabel
FROM [hris].[TimesheetHeaders]
WHERE SupervisorId LIKE N'%C2225%'
  AND TimesheetDate IN (${CUTTING_DATES.map((date) => `N'${date}'`).join(', ')})
  AND (WorkCenterName LIKE N'%Cutting%' OR WorkCenterName LIKE N'%Blasting%')
`);
    const byDate = new Map<string, typeof headers.recordset>();
    for (const row of headers.recordset) {
      const date = String(row.TimesheetDate).slice(0, 10);
      const list = byDate.get(date) || [];
      list.push(row);
      byDate.set(date, list);
    }
    for (const date of CUTTING_DATES) {
      const day = byDate.get(date) || [];
      const blasting = day.filter((row) => /blast/i.test(String(row.WorkCenterName || '')));
      const cutting = day.filter((row) => /cut/i.test(String(row.WorkCenterName || '')));
      for (const blast of blasting) {
        const crew = await new sql.Request(tx)
          .input('headerId', sql.NVarChar(160), blast.Id)
          .query(`
SELECT EmployeeNo, ClockIn, TotalHours
FROM [hris].[TimesheetLines]
WHERE HeaderId = @headerId
`);
        const cncLines = crew.recordset.filter((line) => ABEL_CNC_CREW.includes(String(line.EmployeeNo || '').trim().toUpperCase()));
        if (!cncLines.length) continue;
        const target = cutting[0];
        if (!target) {
          await new sql.Request(tx)
            .input('id', sql.NVarChar(160), blast.Id)
            .query(`
UPDATE [hris].[TimesheetHeaders]
SET WorkCenterName = N'Cutting', WorkCenterId = N'cutting', LocationName = COALESCE(NULLIF(LocationName, N''), N'AGEGE')
WHERE Id = @id
`);
          cutting.push({ ...blast, WorkCenterName: 'Cutting', LocationName: blast.LocationName || 'AGEGE' });
          moved.push({ date, action: 'relabel', from: blast.Id, lines: cncLines.length });
          console.log(`  relabel ${date} ${blast.Id} blasting → cutting lines=${cncLines.length}`);
          continue;
        }
        await new sql.Request(tx)
          .input('cuttingId', sql.NVarChar(160), target.Id)
          .input('blastingId', sql.NVarChar(160), blast.Id)
          .query(`
UPDATE c
SET
  c.ClockIn = COALESCE(c.ClockIn, b.ClockIn),
  c.ClockOut = COALESCE(c.ClockOut, b.ClockOut),
  c.AttendanceDuration = CASE WHEN c.AttendanceDuration > 0 THEN c.AttendanceDuration ELSE b.AttendanceDuration END,
  c.UsedHours = CASE WHEN c.UsedHours > 0 THEN c.UsedHours ELSE b.UsedHours END,
  c.IdleHours = CASE WHEN c.IdleHours > 0 THEN c.IdleHours ELSE b.IdleHours END,
  c.TotalHours = CASE WHEN c.TotalHours > 0 THEN c.TotalHours ELSE b.TotalHours END,
  c.Variance = b.Variance,
  c.BiometricId = COALESCE(c.BiometricId, b.BiometricId),
  c.AttendanceId = COALESCE(c.AttendanceId, b.AttendanceId),
  c.AttendanceMode = COALESCE(c.AttendanceMode, b.AttendanceMode),
  c.EmployeeName = CASE WHEN c.ClockIn IS NULL AND b.ClockIn IS NOT NULL THEN b.EmployeeName ELSE c.EmployeeName END
FROM [hris].[TimesheetLines] c
INNER JOIN [hris].[TimesheetLines] b
  ON b.HeaderId = @blastingId
 AND UPPER(LTRIM(RTRIM(b.EmployeeNo))) = UPPER(LTRIM(RTRIM(c.EmployeeNo)))
WHERE c.HeaderId = @cuttingId;

INSERT INTO [hris].[TimesheetLines] (
  [Id],[HeaderId],[EmployeeId],[EmployeeNo],[EmployeeName],[BiometricId],[AttendanceId],
  [ClockIn],[ClockOut],[AttendanceDuration],[UsedHours],[IdleHours],[TotalHours],[Variance],
  [Remarks],[ValidationStatus],[ValidationMessage],[AttendanceMode],[OffshoreAllowanceHours]
)
SELECT
  CONCAT(N'line-', @cuttingId, N'-', b.EmployeeNo),
  @cuttingId,
  b.EmployeeId, b.EmployeeNo, b.EmployeeName, b.BiometricId, b.AttendanceId,
  b.ClockIn, b.ClockOut, b.AttendanceDuration, b.UsedHours, b.IdleHours, b.TotalHours, b.Variance,
  b.Remarks, b.ValidationStatus, b.ValidationMessage, b.AttendanceMode, b.OffshoreAllowanceHours
FROM [hris].[TimesheetLines] b
WHERE b.HeaderId = @blastingId
  AND NOT EXISTS (
    SELECT 1 FROM [hris].[TimesheetLines] c
    WHERE c.HeaderId = @cuttingId
      AND UPPER(LTRIM(RTRIM(c.EmployeeNo))) = UPPER(LTRIM(RTRIM(b.EmployeeNo)))
  );

INSERT INTO [hris].[TimesheetProjectAllocations] ([LineId],[ProjectId],[ProjectCode],[ProjectName],[TaskId],[TaskName],[ActivityId],[Hours],[Remarks])
SELECT c.Id, a.ProjectId, a.ProjectCode, a.ProjectName, a.TaskId, a.TaskName, a.ActivityId, a.Hours, a.Remarks
FROM [hris].[TimesheetProjectAllocations] a
INNER JOIN [hris].[TimesheetLines] b ON b.Id = a.LineId AND b.HeaderId = @blastingId
INNER JOIN [hris].[TimesheetLines] c
  ON c.HeaderId = @cuttingId
 AND UPPER(LTRIM(RTRIM(c.EmployeeNo))) = UPPER(LTRIM(RTRIM(b.EmployeeNo)))
WHERE NOT EXISTS (SELECT 1 FROM [hris].[TimesheetProjectAllocations] x WHERE x.LineId = c.Id);

INSERT INTO [hris].[TimesheetIdleAllocations] ([LineId],[ReasonId],[ReasonName],[Hours],[Remarks])
SELECT c.Id, a.ReasonId, a.ReasonName, a.Hours, a.Remarks
FROM [hris].[TimesheetIdleAllocations] a
INNER JOIN [hris].[TimesheetLines] b ON b.Id = a.LineId AND b.HeaderId = @blastingId
INNER JOIN [hris].[TimesheetLines] c
  ON c.HeaderId = @cuttingId
 AND UPPER(LTRIM(RTRIM(c.EmployeeNo))) = UPPER(LTRIM(RTRIM(b.EmployeeNo)))
WHERE NOT EXISTS (SELECT 1 FROM [hris].[TimesheetIdleAllocations] x WHERE x.LineId = c.Id);

DELETE FROM [hris].[TimesheetLines] WHERE HeaderId = @blastingId;
DELETE FROM [hris].[TimesheetWorkflowEvents] WHERE HeaderId = @blastingId;
DELETE FROM [hris].[TimesheetHeaders] WHERE Id = @blastingId;
`);
        if (/draft/i.test(String(target.Status || '')) && !/draft/i.test(String(blast.Status || ''))) {
          await new sql.Request(tx)
            .input('cuttingId', sql.NVarChar(160), target.Id)
            .input('status', sql.NVarChar(50), blast.Status)
            .query(`
UPDATE [hris].[TimesheetHeaders]
SET Status = @status, LocationName = COALESCE(NULLIF(LocationName, N''), N'AGEGE')
WHERE Id = @cuttingId
`);
        } else {
          await new sql.Request(tx)
            .input('cuttingId', sql.NVarChar(160), target.Id)
            .query(`
UPDATE [hris].[TimesheetHeaders]
SET LocationName = COALESCE(NULLIF(LocationName, N''), N'AGEGE')
WHERE Id = @cuttingId
`);
        }
        moved.push({ date, action: 'merge', from: blast.Id, to: target.Id, lines: cncLines.length });
        console.log(`  merge ${date} ${blast.Id} → ${target.Id} cncLines=${cncLines.length}`);
      }
    }
    await tx.commit();
  } catch (error) {
    await tx.rollback().catch(() => undefined);
    throw error;
  }
  return moved;
};

const retryThinAbelSheets = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE Enterprise database is not configured.');
  const result = await pool.request().query(`
SELECT CONVERT(varchar(10), TimesheetDate, 23) AS TimesheetDate, SupervisorId, WorkCenterName, LocationName, ShiftLabel, Id
FROM [hris].[TimesheetHeaders]
WHERE WorkCenterName LIKE N'%Cutting%'
  AND SupervisorId LIKE N'%C2225%'
  AND TimesheetDate IN (${CUTTING_DATES.map((date) => `N'${date}'`).join(', ')})
`);
  const headers = result.recordset.filter((row) => isAgegeTimesheetLocation(row.LocationName) || !String(row.LocationName || '').trim());
  const synced: Array<Record<string, unknown>> = [];
  for (const row of headers) {
    const date = String(row.TimesheetDate).slice(0, 10);
    const preview = await syncAttendanceForTimesheet(
      date,
      String(row.SupervisorId || ''),
      String(row.WorkCenterName || 'Cutting'),
      String(row.LocationName || 'AGEGE'),
      { persist: false, shiftLabel: row.ShiftLabel },
    );
    const lineCount = preview.lines?.length || 0;
    if (lineCount < 6) {
      console.log(`  skip persist ${date} ${row.SupervisorId} previewLines=${lineCount}`);
      synced.push({ date, supervisorId: row.SupervisorId, headerId: row.Id, lines: lineCount, persisted: false });
      continue;
    }
    const summary = await syncAttendanceForTimesheet(
      date,
      String(row.SupervisorId || ''),
      String(row.WorkCenterName || 'Cutting'),
      String(row.LocationName || 'AGEGE'),
      { persist: true, shiftLabel: row.ShiftLabel },
    );
    console.log(`  retried ${date} ${row.SupervisorId} lines=${summary.lines?.length || 0}`);
    synced.push({ date, supervisorId: row.SupervisorId, headerId: summary.header?.id, lines: summary.lines?.length, persisted: true });
  }
  return synced;
};

const main = async () => {
  loadEnvFiles();
  const apply = process.argv.includes('--apply');
  const finish = process.argv.includes('--finish');
  const relabel = process.argv.includes('--relabel');
  if (relabel) {
    const moved = await migrateAbelCncBlastingToCutting();
    const verify = await verifyAgegeRepairs();
    console.log(JSON.stringify({ relabel: true, moved, verify }, null, 2));
    process.exit(0);
  }
  if (finish) {
    const restored = await restoreP0277ReportingManagers();
    const abel = await applyRoster(ABEL_CNC_ROSTER, true);
    const moved = await migrateAbelCncBlastingToCutting();
    const retried = await retryThinAbelSheets();
    const verify = await verifyAgegeRepairs();
    console.log(JSON.stringify({ finish: true, restored, abel, moved, retried, verify }, null, 2));
    process.exit(0);
  }
  const assignments = [];
  for (const fileName of ROSTER_FILES) {
    assignments.push(await applyRoster(fileName, apply));
  }
  const cutting = await resyncAgegeCutting(apply);
  console.log(JSON.stringify({ apply, assignments, cutting }, null, 2));
  process.exit(0);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
