/**
 * Audit (and optionally fill) timesheet crew alignment:
 * supervisor assignment, yard, and work center.
 *
 * Dry run:
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/audit-timesheet-crew-alignment.mts
 *
 * Apply only unambiguous blank fills (location + work center + missing reporting manager):
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/audit-timesheet-crew-alignment.mts --apply
 */
import fs from 'node:fs';
import path from 'node:path';

import {
  getDleEnterpriseDbPool,
  loadWorkspaceEnv,
  readEmployeeDirectoryFromDb,
  type DleEmployeeDirectoryRow,
} from '../apps/dashboard/lib/dle-enterprise-db';
import { assignEmployeesToSupervisor, readSupervisorAssignments, type SupervisorAssignmentRow } from '../apps/dashboard/lib/supervisor-assignment-store';
import {
  extractSupervisorEmployeeCode,
  supervisorCodesMatch,
  timesheetLocationMatchKey,
  timesheetLocationsMatch,
} from '../apps/dashboard/lib/timesheet-agege-blasting';
import { timesheetWorkCentersMatch } from '../apps/dashboard/lib/timesheet-entry-shared';

const loadEnvFiles = () => {
  for (const file of [path.resolve('.env'), path.resolve('apps/dashboard/.env')]) {
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

const clean = (value: unknown) => String(value ?? '').trim();
const upper = (value: unknown) => clean(value).toUpperCase();
const INACTIVE = /inactive|terminated|resigned|retired|deceased|suspend/i;
const isInactive = (status: unknown) => INACTIVE.test(clean(status));
const codeOf = (employee: Pick<DleEmployeeDirectoryRow, 'employeeCode' | 'employeeId'>) =>
  upper(employee.employeeCode || employee.employeeId);

const UNASSIGNED_LOCATION = /^(unassigned(\s+location)?|n\/?a|none|-)$/i;

const WORK_CENTER_ALIASES: Array<[RegExp, string]> = [
  [/\bblast/i, 'Blasting'],
  [/\bfitter|fitting\b/i, 'Fitting'],
  [/\bwelder|welding|grinder\b/i, 'Welding'],
  [/\bpainter|painting|coating\b/i, 'Painting'],
  [/\brigger|rigging\b/i, 'Rigging'],
  [/\bscaffold/i, 'Structural Assembly'],
  [/\bcnc|machinist|machining|koike|angle\b/i, 'Machining'],
  [/\broller|rolling|forming\b/i, 'Rolling & Forming'],
  [/\bgalvaniz/i, 'Galvanizing'],
  [/\bmaintain|maintenance|electrician|mechanic\b/i, 'Maintenance'],
];

type CatalogWorkCenter = { name: string; location: string; site: string; status: string };
type CatalogLocation = { name: string; site: string };

type ProposedFix = {
  employeeCode: string;
  fullName: string;
  field: 'location' | 'workCenter' | 'reportingManager' | 'assignment';
  from: string;
  to: string;
  reason: string;
};

type ExceptionRow = {
  employeeCode: string;
  fullName: string;
  issue: string;
  detail: string;
};

const rawLocation = (employee?: Pick<DleEmployeeDirectoryRow, 'location' | 'workLocation' | 'officeLocation' | 'projectSite'> | null) => {
  if (!employee) return '';
  const values = [employee.officeLocation, employee.workLocation, employee.location, employee.projectSite].map(clean);
  return values.find((value) => value && !UNASSIGNED_LOCATION.test(value)) || '';
};

const canonicalYard = (value: string, catalogLocations: CatalogLocation[]) => {
  const raw = clean(value);
  if (!raw || UNASSIGNED_LOCATION.test(raw)) return '';
  const key = timesheetLocationMatchKey(raw);
  if (!key || key === 'unassignedlocation') return '';
  if (key.includes('agege')) {
    return catalogLocations.find((location) => timesheetLocationMatchKey(location.name).includes('agege'))?.name || 'AGEGE';
  }
  if (key.includes('idioro') || (key.includes('idi') && key.includes('oro'))) {
    return (
      catalogLocations.find((location) => {
        const locKey = timesheetLocationMatchKey(location.name || location.site);
        return locKey.includes('idioro') || (locKey.includes('idi') && locKey.includes('oro'));
      })?.name || 'IDI-ORO'
    );
  }
  return '';
};

const mapWorkCenter = (text: string, workCenters: CatalogWorkCenter[]) => {
  const haystack = clean(text).replace(/department reporting line/gi, '').trim();
  if (!haystack) return '';
  const alias = WORK_CENTER_ALIASES.find(([pattern]) => pattern.test(haystack))?.[1] || '';
  if (alias) {
    return workCenters.find((workCenter) => timesheetWorkCentersMatch(workCenter.name, alias))?.name || alias;
  }
  return workCenters.find((workCenter) => timesheetWorkCentersMatch(workCenter.name, haystack))?.name || '';
};

const tradeMappingText = (parts: Array<string | null | undefined>) =>
  parts
    .map(clean)
    .filter((value) => value && !/department reporting line/i.test(value))
    .join(' ');

const managerCode = (value: unknown) => extractSupervisorEmployeeCode(clean(value)) || '';

const compactName = (value: unknown) => clean(value).toLowerCase().replace(/[^a-z]/g, '');

const isShopFloor = (employee: DleEmployeeDirectoryRow) => {
  const code = codeOf(employee);
  const blob = `${employee.jobTitle} ${employee.department} ${employee.staffCategory} ${employee.employeeCategory}`.toLowerCase();
  if (/^c\d+/i.test(code)) return true;
  return /\b(fitter|fitting|welder|welding|rigger|rigging|scaffold|painter|painting|blaster|blasting|machinist|cnc|roller|rolling|galvaniz|grinder|burner|hydrotest|production|operations|workshop|maintenance)\b/.test(blob);
};

const latestAssignmentByEmployee = (rows: SupervisorAssignmentRow[]) => {
  const byEmployee = new Map<string, SupervisorAssignmentRow[]>();
  for (const row of rows) {
    const code = upper(row.employeeCode);
    if (!code) continue;
    const list = byEmployee.get(code) || [];
    list.push(row);
    byEmployee.set(code, list);
  }
  const latest = new Map<string, SupervisorAssignmentRow>();
  for (const [code, list] of byEmployee) {
    const sorted = [...list].sort((a, b) => b.assignedAt.localeCompare(a.assignedAt) || b.assignmentId - a.assignmentId);
    latest.set(code, sorted[0]);
  }
  return { byEmployee, latest };
};

const main = async () => {
  loadEnvFiles();
  const apply = process.argv.includes('--apply');
  const directory = await readEmployeeDirectoryFromDb();
  if (!directory?.length) throw new Error('Employee directory is empty or DLE_Enterprise is not configured.');
  const assignments = await readSupervisorAssignments();
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE Enterprise database is not configured.');

  const workCenterResult = await pool.request().query(`
SELECT [Name], ISNULL([Location], N'') AS [Location], ISNULL([Site], N'') AS [Site], [Status]
FROM [hris].[TimesheetWorkCenters]
ORDER BY [Name]`);
  const workCenters = workCenterResult.recordset.map((row): CatalogWorkCenter => ({
    name: clean(row.Name),
    location: clean(row.Location),
    site: clean(row.Site),
    status: clean(row.Status) || 'Active',
  }));
  const activeWorkCenters = workCenters.filter((workCenter) => workCenter.status.toLowerCase() === 'active');

  const locationResult = await pool.request().query(`
SELECT [Name], ISNULL([Site], N'') AS [Site]
FROM [hris].[TimesheetLocations]
ORDER BY [Name]`);
  const catalogLocations = locationResult.recordset.map((row): CatalogLocation => ({
    name: clean(row.Name),
    site: clean(row.Site),
  }));

  const employeesByCode = new Map(directory.map((employee) => [codeOf(employee), employee]));
  const { byEmployee: assignmentsByEmployee, latest: latestAssignment } = latestAssignmentByEmployee(assignments);

  const proposed: ProposedFix[] = [];
  const exceptions: ExceptionRow[] = [];

  const pushException = (employeeCode: string, fullName: string, issue: string, detail: string) => {
    exceptions.push({ employeeCode, fullName, issue, detail });
  };

  const supervisorCodesWithCrew = new Set(
    [...latestAssignment.values()].map((row) => upper(row.supervisorEmployeeCode)).filter(Boolean),
  );

  for (const [code, rows] of assignmentsByEmployee) {
    const employee = employeesByCode.get(code);
    const supervisors = Array.from(new Set(rows.map((row) => upper(row.supervisorEmployeeCode)).filter(Boolean)));
    if (supervisors.length > 1) {
      pushException(code, employee?.fullName || rows[0]?.employeeName || code, 'dual-supervisors', supervisors.join(', '));
    }
    const unresolved = rows.filter((row) => row.matchedStatus === 'Unresolved' || !row.employeeId);
    if (unresolved.length && !employee) {
      const source = unresolved[0]?.sourceLabel || unresolved[0]?.employeeName || code;
      const matches = directory.filter((candidate) => !isInactive(candidate.status) && compactName(candidate.fullName) === compactName(source));
      pushException(
        code,
        source,
        'unresolved-assignment',
        matches.length === 1
          ? `Unique name match ${codeOf(matches[0])} ${matches[0].fullName}`
          : unresolved[0]?.matchNote || 'No unique HRIS match',
      );
    }
    if (employee && isInactive(employee.status)) {
      pushException(code, employee.fullName, 'inactive-on-crew', `${employee.status} still assigned to ${upper(rows[0]?.supervisorEmployeeCode)}`);
    }
  }

  const momohName = directory.filter((employee) => /momoh/i.test(employee.fullName) && /mohammed/i.test(employee.fullName));
  const c1382 = employeesByCode.get('C1382');
  const c1882 = employeesByCode.get('C1882');
  if (c1382 || momohName.some((employee) => codeOf(employee) !== 'C1882')) {
    pushException(
      c1382 ? 'C1382' : momohName.map(codeOf).join(','),
      (c1382 || momohName.find((employee) => codeOf(employee) !== 'C1882'))?.fullName || 'MOMOH MOHAMMED',
      'momoh-code-mismatch',
      `C1382=${c1382 ? `${c1382.fullName} ${c1382.status}` : 'missing'}; C1882=${c1882 ? `${c1882.fullName} ${c1882.status}` : 'missing'}; name hits=${momohName.map((employee) => `${codeOf(employee)} ${employee.fullName}`).join('; ')}`,
    );
  }

  const scoped = directory.filter((employee) => {
    const code = codeOf(employee);
    if (latestAssignment.has(code)) return true;
    if (isInactive(employee.status)) return false;
    return isShopFloor(employee);
  });

  for (const employee of scoped) {
    const code = codeOf(employee);
    const assignment = latestAssignment.get(code);
    const reportedManager = managerCode(employee.managerName);
    const supervisorCode = upper(assignment?.supervisorEmployeeCode) || reportedManager;
    const supervisor = supervisorCode ? employeesByCode.get(supervisorCode) : undefined;
    const recordedLocation = rawLocation(employee);
    const employeeYard = canonicalYard(recordedLocation, catalogLocations);
    const supervisorYard = canonicalYard(rawLocation(supervisor), catalogLocations)
      || canonicalYard(assignment?.assignmentGroup || '', catalogLocations)
      || canonicalYard(assignment?.assignmentBatch || '', catalogLocations);
    const currentWorkCenter = clean(employee.workCenter);
    const supervisorWorkCenter = mapWorkCenter(
      tradeMappingText([supervisor?.jobTitle, assignment?.assignmentGroup]),
      activeWorkCenters,
    );
    const proposedWorkCenter = mapWorkCenter(
      tradeMappingText([assignment?.tradeRole, employee.jobTitle, assignment?.assignmentGroup]),
      activeWorkCenters,
    ) || supervisorWorkCenter;
    const active = !isInactive(employee.status);

    if (!assignment && isShopFloor(employee) && active && /^c\d+/i.test(code)) {
      const defaultAgegeWelder = !reportedManager && employeeYard === 'AGEGE' && /welder/i.test(employee.jobTitle);
      const assignTo = reportedManager && supervisorCodesWithCrew.has(reportedManager)
        ? reportedManager
        : defaultAgegeWelder
          ? 'C1229'
          : '';
      if (assignTo) {
        proposed.push({
          employeeCode: code,
          fullName: employee.fullName,
          field: 'assignment',
          from: reportedManager || '',
          to: assignTo,
          reason: reportedManager
            ? `Create missing crew assignment from HR manager ${employee.managerName}.`
            : 'Agege welder with no manager; assign to Agege welding supervisor C1229.',
        });
      } else {
        pushException(code, employee.fullName, 'unassigned', `${employee.jobTitle} · ${recordedLocation || 'no yard'} · manager ${employee.managerName || 'none'}`);
      }
    }

    if (assignment && reportedManager && supervisorCode && !supervisorCodesMatch(reportedManager, assignment.supervisorEmployeeCode)) {
      pushException(code, employee.fullName, 'assignment-vs-reporting-manager', `assigned ${assignment.supervisorEmployeeCode} ${assignment.supervisorName || ''} vs HR ${employee.managerName}`);
    }

    if (!active) continue;

    if (assignment && !reportedManager && supervisor) {
      proposed.push({
        employeeCode: code,
        fullName: employee.fullName,
        field: 'reportingManager',
        from: clean(employee.managerName),
        to: `${codeOf(supervisor)} - ${supervisor.fullName}`,
        reason: 'Matched assignment has no HR reporting manager.',
      });
    }

    if (employeeYard && supervisorYard && assignment && !timesheetLocationsMatch(employeeYard, supervisorYard)) {
      pushException(code, employee.fullName, 'yard-conflict', `employee ${employeeYard} vs supervisor ${upper(assignment.supervisorEmployeeCode)} ${supervisorYard}`);
    } else if (!recordedLocation && supervisorYard && (assignment || /^c\d+/i.test(code))) {
      proposed.push({
        employeeCode: code,
        fullName: employee.fullName,
        field: 'location',
        from: recordedLocation || clean(employee.location),
        to: supervisorYard,
        reason: `Copy supervisor ${supervisorCode} yard onto blank/unassigned employee location.`,
      });
    } else if (employeeYard && recordedLocation && recordedLocation !== employeeYard && (employeeYard === 'AGEGE' || employeeYard === 'IDI_ORO')) {
      proposed.push({
        employeeCode: code,
        fullName: employee.fullName,
        field: 'location',
        from: recordedLocation,
        to: employeeYard,
        reason: `Normalize yard label to timesheet catalog ${employeeYard}.`,
      });
    }

    if (currentWorkCenter && proposedWorkCenter && !timesheetWorkCentersMatch(currentWorkCenter, proposedWorkCenter)) {
      pushException(code, employee.fullName, 'work-center-conflict', `HR ${currentWorkCenter} vs trade/assignment ${proposedWorkCenter}`);
    } else if (!currentWorkCenter && proposedWorkCenter && (assignment || /^c\d+/i.test(code))) {
      proposed.push({
        employeeCode: code,
        fullName: employee.fullName,
        field: 'workCenter',
        from: currentWorkCenter,
        to: proposedWorkCenter,
        reason: `Fill blank work center from ${assignment?.tradeRole || employee.jobTitle || supervisor?.jobTitle || 'supervisor trade'}.`,
      });
    }
  }

  const supervisorSummary = new Map<string, { name: string; assigned: number; blankLocation: number; blankWorkCenter: number; yard: string; workCenter: string }>();
  for (const [code, assignment] of latestAssignment) {
    const employee = employeesByCode.get(code);
    if (employee && isInactive(employee.status)) continue;
    const supervisorCode = upper(assignment.supervisorEmployeeCode);
    if (!supervisorCode) continue;
    const supervisor = employeesByCode.get(supervisorCode);
    const row = supervisorSummary.get(supervisorCode) || {
      name: supervisor?.fullName || assignment.supervisorName || supervisorCode,
      assigned: 0,
      blankLocation: 0,
      blankWorkCenter: 0,
      yard: canonicalYard(rawLocation(supervisor), catalogLocations),
      workCenter: mapWorkCenter(tradeMappingText([supervisor?.jobTitle]), activeWorkCenters),
    };
    row.assigned += 1;
    if (!canonicalYard(rawLocation(employee), catalogLocations)) row.blankLocation += 1;
    if (!clean(employee?.workCenter)) row.blankWorkCenter += 1;
    supervisorSummary.set(supervisorCode, row);
  }

  const applied: ProposedFix[] = [];
  if (apply) {
    const locationFixes = proposed.filter((fix) => fix.field === 'location');
    const workCenterFixes = proposed.filter((fix) => fix.field === 'workCenter');
    const managerFixes = proposed.filter((fix) => fix.field === 'reportingManager');
    const assignmentFixes = proposed.filter((fix) => fix.field === 'assignment');

    for (const fix of [...locationFixes, ...workCenterFixes, ...managerFixes]) {
      const employee = employeesByCode.get(fix.employeeCode);
      if (!employee?.employeeDbId) continue;
      const request = pool.request().input('employee_id', employee.employeeDbId);
      if (fix.field === 'location') {
        await request
          .input('office_location', fix.to)
          .input('work_location', fix.to)
          .query(`
UPDATE [hris].[EmployeeJobInfo]
SET office_location = @office_location, modified_at = SYSUTCDATETIME()
WHERE employee_id = @employee_id;
UPDATE [hris].[EmployeeEmploymentInfo]
SET work_location = @work_location, modified_at = SYSUTCDATETIME()
WHERE employee_id = @employee_id;
`);
      } else if (fix.field === 'workCenter') {
        await request
          .input('work_center', fix.to)
          .query(`
UPDATE [hris].[EmployeeJobInfo]
SET work_center = @work_center, modified_at = SYSUTCDATETIME()
WHERE employee_id = @employee_id;
`);
      } else if (fix.field === 'reportingManager') {
        await request
          .input('reporting_manager', fix.to)
          .query(`
UPDATE [hris].[EmployeeJobInfo]
SET reporting_manager = @reporting_manager, modified_at = SYSUTCDATETIME()
WHERE employee_id = @employee_id;
`);
      }
      applied.push(fix);
    }

    const assignmentBySupervisor = new Map<string, ProposedFix[]>();
    for (const fix of assignmentFixes) {
      const list = assignmentBySupervisor.get(fix.to) || [];
      list.push(fix);
      assignmentBySupervisor.set(fix.to, list);
    }
    for (const [supervisorEmployeeCode, rows] of assignmentBySupervisor) {
      const supervisor = employeesByCode.get(supervisorEmployeeCode);
      await assignEmployeesToSupervisor({
        supervisorEmployeeCode,
        employeeCodes: rows.map((row) => row.employeeCode),
        assignmentBatch: '2026-09-14-timesheet-crew-alignment',
        assignmentGroup: mapWorkCenter(tradeMappingText([supervisor?.jobTitle]), activeWorkCenters) || 'TIMESHEET CREW ALIGNMENT',
        reason: 'Align missing timesheet crew assignments from live HR reporting manager / yard+trade.',
        performedBy: 'scripts/audit-timesheet-crew-alignment.mts',
        sourceRows: rows.map((row) => ({
          employeeCode: row.employeeCode,
          sourceLabel: row.fullName,
          tradeRole: employeesByCode.get(row.employeeCode)?.jobTitle,
          matchConfidence: 'TimesheetCrewAlignment',
          matchNote: row.reason,
        })),
      });
      applied.push(...rows);
    }
  }

  const byIssue = new Map<string, number>();
  for (const row of exceptions) byIssue.set(row.issue, (byIssue.get(row.issue) || 0) + 1);
  const byField = new Map<string, number>();
  for (const row of proposed) byField.set(row.field, (byField.get(row.field) || 0) + 1);

  const watch = ['C1382', 'C1882', 'C1783', 'C1001', 'C1720', 'P0442'].map((code) => {
    const employee = employeesByCode.get(code);
    const assignment = latestAssignment.get(code);
    const crew = [...latestAssignment.values()].filter((row) => upper(row.supervisorEmployeeCode) === code);
    return {
      code,
      found: Boolean(employee),
      name: employee?.fullName || null,
      status: employee?.status || null,
      title: employee?.jobTitle || null,
      location: rawLocation(employee),
      workCenter: employee?.workCenter || '',
      manager: employee?.managerName || '',
      assignedTo: assignment ? `${assignment.supervisorEmployeeCode} ${assignment.supervisorName || ''}`.trim() : null,
      crewCount: crew.length,
    };
  });

  const report = {
    mode: apply ? 'APPLY' : 'DRY RUN',
    counts: {
      directory: directory.length,
      assignments: assignments.length,
      assignedPeople: latestAssignment.size,
      shopFloorScoped: scoped.length,
      exceptions: exceptions.length,
      proposedFixes: proposed.length,
      applied: applied.length,
    },
    exceptionCounts: Object.fromEntries(byIssue),
    proposedCounts: Object.fromEntries(byField),
    workCenters: activeWorkCenters.map((workCenter) => ({
      name: workCenter.name,
      location: workCenter.location,
      site: workCenter.site,
    })),
    catalogLocations,
    watch,
    supervisors: [...supervisorSummary.entries()]
      .sort((a, b) => b[1].assigned - a[1].assigned || a[0].localeCompare(b[0]))
      .map(([code, row]) => ({ supervisor: code, ...row })),
    exceptions: exceptions.sort((a, b) => a.issue.localeCompare(b.issue) || a.employeeCode.localeCompare(b.employeeCode)),
    proposed,
    applied,
  };

  const outDir = path.resolve('scripts/database/supervisor-assignments');
  const outFile = path.join(outDir, apply ? 'alignment-apply-2026-09-14.json' : 'alignment-audit-2026-09-14.json');
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));

  console.log(apply ? 'APPLY' : 'DRY RUN');
  console.log(JSON.stringify({
    counts: report.counts,
    exceptionCounts: report.exceptionCounts,
    proposedCounts: report.proposedCounts,
    watch: report.watch,
    supervisors: report.supervisors,
    exceptionPreview: report.exceptions.slice(0, 40),
    proposedPreview: report.proposed.slice(0, 40),
    reportFile: outFile,
  }, null, 2));
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
