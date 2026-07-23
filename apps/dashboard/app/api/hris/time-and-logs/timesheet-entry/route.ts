import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { appendOrganizationAuditEvent } from '@/lib/organization-audit-store';
import { getUiPermissions, hasPermission, resolveAccessContext } from '@/lib/hris-access';
import {
  calculateTimesheetPeriod,
  advanceTimesheetWorkflow,
  generateProjectCode,
  idleReasons,
  normalizePaidWorkHours,
  DAILY_BREAK_HOURS,
  STANDARD_TIMESHEET_HOURS,
  withDefaultIdleReason,
  readProjects,
  readTimesheetPeriod,
  readTimesheetData,
  readTimesheetWorkCenters,
  readSystemTimesheetDepartments,
  readSystemTimesheetLocations,
  readTimesheetRecords,
  isTimesheetEditableStatus,
  isTimesheetPayrollReadyStatus,
  syncAttendanceForTimesheet,
  normalizeTimesheetStatus,
  upsertTimesheetWorkCenter,
  deactivateTimesheetWorkCenter,
  upsertProject,
  writeTimesheetHeaderLines,
  refreshTimesheetPayrollUpdatesForHeaders,
  workflowStages,
  type TimesheetHeader,
  type TimesheetLine,
  type TimesheetPeriod,
  type IdleReason,
  type DisplayColumn,
  type TimesheetAllocation,
  type TimesheetApprovalDecision,
  type TimesheetApprovalStep,
  type TimesheetEntryMode,
  type TimesheetWorkflowEvent,
  type TimesheetRecord,
  type TimesheetStatus,
  type Project,
  type TimesheetDepartment,
  type TimesheetLocation,
  type TimesheetWorkCenter,
  type WorkflowStage,
} from '@/lib/timesheet-entry-store';
import { readBiometricDevices, type BiometricDeviceRecord } from '@/lib/biometric-attendance-store';
import { readPayrollEmployees, type PayrollEmployeeSource } from '@/lib/payroll-employee-source';
import type { StructureInsight } from '@/lib/organization-data';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { readSupervisorAssignments } from '@/lib/supervisor-assignment-store';
import { listApprovedOvertimeForSupervisor, type OvertimeAuthorizationRequest } from '@/lib/overtime-approval-workflow-store';
import {
  applyOvertimeBooking,
  validateTimesheetLine,
  type OvertimeAuthorization,
} from '@/lib/timesheet-overtime-booking';
import {
  canBookOvertimeOnTimesheet,
  isRetroOvertimeTimesheetStatus,
  resolveOvertimeAuthorizationsForBooking,
  resolveOvertimeBookingOptions,
} from '@/lib/timesheet-overtime-config';
import { applyTimesheetLineDefaults } from '@/lib/timesheet-line-defaults';
import { normalizeIdleAllocations, normalizeProjectAllocations, reconcileTimesheetLineHours, resolvePrimaryProjectCode, validateTimesheetLinesForPersist, TIMESHEET_SHIFT_LABELS, type TimesheetDayContext } from '@/lib/timesheet-entry-shared';

const dayContextFor = (date: string, holidayDates: string[], shiftLabel?: string | null): TimesheetDayContext => ({
  date,
  holidayDates,
  shiftLabel: shiftLabel || undefined,
});

type ProjectManagerOption = {
  employeeId: string;
  employeeCode: string;
  fullName: string;
  jobTitle: string;
  department: string;
  location: string;
  status: string;
};

type TimesheetPayload = {
  generatedAt: string;
  timesheetDate: string;
  holidayDates: string[];
  period: TimesheetPeriod;
  header: TimesheetHeader | null;
  lines: TimesheetLine[];
  idleReasons: IdleReason[];
  projects: Project[];
  nextProjectCode: string;
  workflowStages: WorkflowStage[];
  biometricDevices: BiometricDeviceRecord[];
  attendanceWorkCenters: Array<{
    location: string;
    site: string;
    deviceName: string;
  }>;
  workCenters: TimesheetWorkCenter[];
  departments: TimesheetDepartment[];
  locations: TimesheetLocation[];
  projectManagers: ProjectManagerOption[];
  supervisorEmployees: Array<{
    employeeId: string;
    employeeCode: string;
    fullName: string;
    jobTitle: string;
    department: string;
    location: string;
    managerEmployeeCode: string | null;
    managerName: string | null;
    status: string;
  }>;
  supervisorProfile: {
    employeeId: string;
    employeeCode: string;
    fullName: string;
    jobTitle: string;
    department: string;
    location: string;
    status: string;
  } | null;
  approvedOvertimeAuthorizations: OvertimeAuthorizationRequest[];
  overtimeBooking: {
    enabled: boolean;
    devRelaxed: boolean;
    retroCorrection: boolean;
    openBooking: boolean;
  };
  canBookOvertime: boolean;
  permissions: {
    actor: string;
    role: string;
    canEdit: boolean;
    canExport: boolean;
    canApprove: boolean;
    canManagePeriod: boolean;
    canViewCosts: boolean;
    canViewAudit: boolean;
  };
  summary: {
    totalEmployees: number;
    presentEmployees: number;
    absentEmployees: number;
    onLeaveEmployees: number;
    sickEmployees: number;
    notSyncedEmployees: number;
    bookedHours: number;
    usedHours: number;
    idleHours: number;
    productivityPct: number;
    pendingApprovals: number;
  };
  filterOptions: {
    departments: string[];
    projects: string[];
    locations: string[];
    projectSites: string[];
    supervisors: string[];
    shifts: string[];
    businessUnits: string[];
    modes: TimesheetEntryMode[];
    statuses: TimesheetStatus[];
    supervisorDirectory: Array<{ value: string; label: string; employeeCode: string; fullName: string; jobTitle: string; department: string; employeeCount: number }>;
  };
  matrixColumns: DisplayColumn[];
  projectCatalog: any[];
  aiInsights: StructureInsight[];
};

type UpdatePayload = {
  action?:
    | 'SYNC_ATTENDANCE'
    | 'SAVE_DRAFT'
    | 'SUBMIT'
    | 'APPROVE'
    | 'REJECT'
    | 'MATRIX_SAVE'
    | 'CREATE_PROJECT'
    | 'UPSERT_PROJECT'
    | 'UPSERT_WORK_CENTER'
    | 'DELETE_WORK_CENTER'
    | 'COPY_PREVIOUS_DAY'
    | 'BULK_APPLY'
    | 'BOOK_OVERTIME'
    | 'SET_SHIFT';
  date?: string;
  supervisorId?: string;
  locationName?: string;
  workCenterName?: string;
  headerId?: string;
  shiftLabel?: string;
  lines?: TimesheetLine[];
  reviewerNote?: string;
  authorizationId?: string;
  otHours?: number;
  employeeIds?: string[];
  postToPayroll?: boolean;
  projectCode?: string;
  project?: Partial<Project> & Pick<Project, 'code' | 'name' | 'site' | 'projectManager'>;
  workCenter?: Partial<TimesheetWorkCenter> & { name: string };
  mode?: 'supervisor';
  bulkAllocation?: {
    employeeIds: string[];
    projectCode: string;
    hours: number;
  };
};

const projectsFromTimesheetLines = (lines: TimesheetLine[]) =>
  Array.from(
    new Map(
      lines
        .flatMap((line) =>
          line.projectAllocations.map((alloc) => {
            const code = String(alloc.projectCode || '').trim().toUpperCase();
            if (!code) return null;
            return [code, { code, name: alloc.projectName || code }] as const;
          }),
        )
        .filter((entry): entry is readonly [string, { code: string; name: string }] => Boolean(entry)),
    ).values(),
  );

async function loadOvertimeAuthorizationsForBooking(
  header: TimesheetHeader | null,
  headerLines: TimesheetLine[],
  activeProjects: Project[],
  overtimeBooking: ReturnType<typeof resolveOvertimeBookingOptions>,
) {
  const crewSize = Math.max(headerLines.filter((line) => line.clockIn).length, 1);
  const catalog = activeProjects.map((project) => ({ code: project.code, name: project.name }));
  const lineProjects = projectsFromTimesheetLines(headerLines);
  let workflowAuthorizations: OvertimeAuthorization[] = [];
  if (overtimeBooking.enabled && header) {
    const approved = await listApprovedOvertimeForSupervisor(
      header.timesheetDate,
      header.supervisorId,
      header.workCenterName,
    ).catch(() => [] as OvertimeAuthorizationRequest[]);
    workflowAuthorizations = approved.map((item) => ({
      id: item.id,
      projectCode: item.projectCode,
      projectName: item.projectName,
      requestedHours: Number(item.requestedHours) || 0,
      requestedHeadcount: Math.max(1, Number(item.requestedHeadcount) || item.employees?.length || 1),
      workCenter: item.workCenter || undefined,
      reason: item.reason || 'Approved overtime authorization.',
    }));
  }
  return resolveOvertimeAuthorizationsForBooking(
    workflowAuthorizations,
    catalog,
    crewSize,
    overtimeBooking,
    lineProjects,
  );
}

async function handleBulkApply(request: Request, payload: UpdatePayload) {
  if (!payload.bulkAllocation || !payload.headerId) {
    throw new Error('Bulk allocation details and header ID are required.');
  }
  const { employeeIds, projectCode, hours } = payload.bulkAllocation;
  const { headers, lines: allLines } = await readTimesheetData();
  
  const header = headers.find(h => h.id === payload.headerId);
  if (!header) throw new Error('Header not found');

  const currentLines = allLines.filter(l => l.headerId === header.id);
  const overtimeBooking = resolveOvertimeBookingOptions();
  const projects = await readProjects();
  const approvedOvertimeAuthorizations = await loadOvertimeAuthorizationsForBooking(
    header,
    currentLines,
    projects.filter((project) => ['Active', 'Approved', 'Open'].includes(project.status)),
    overtimeBooking,
  );
  const holidayDates = await readPublicHolidayDates();
  const dayContext = dayContextFor(header.timesheetDate, holidayDates, header.shiftLabel);

  const updatedLines = currentLines.map(line => {
    if (!employeeIds.includes(line.employeeId)) return line;

    const allocations = [...line.projectAllocations];
    const pIdx = allocations.findIndex(p => p.projectCode === projectCode);
    if (pIdx >= 0) {
      allocations[pIdx].hours = hours;
    } else {
      allocations.push({
        projectId: projectCode,
        projectCode,
        projectName: projectCode,
        hours,
        remarks: null
      });
    }

    const draft = { ...line, projectAllocations: allocations, idleAllocations: line.idleAllocations.map(withDefaultIdleReason) };
    const validated = validateTimesheetLine(
      draft,
      approvedOvertimeAuthorizations as OvertimeAuthorization[],
      currentLines.map((item) => (item.id === line.id ? draft : item)),
      header.workCenterName,
      overtimeBooking,
      dayContext,
    );

    return {
      ...draft,
      usedHours: validated.usedHours,
      idleHours: validated.idleHours,
      totalHours: validated.totalHours,
      variance: validated.variance,
      validationStatus: validated.validationStatus,
      validationMessage: validated.validationMessage,
    } as TimesheetLine;
  });

  await writeTimesheetHeaderLines(header, updatedLines);
  return header;
}

const slug = (value: string) => value.toLowerCase().replace(/\s+/g, '-');

async function handleCopyPreviousDay(request: Request, date: string, supervisorId: string, workCenterName: string) {
  const { headers, lines: allLines } = await readTimesheetData();
  
  // 1. Find previous day's header
  const targetDate = new Date(date);
  const prevDate = new Date(targetDate);
  prevDate.setDate(targetDate.getDate() - 1);
  const prevDateStr = prevDate.toISOString().split('T')[0];

  const prevHeader = headers.find(h => h.timesheetDate === prevDateStr && h.supervisorId === supervisorId && h.workCenterName === workCenterName);
  if (!prevHeader) {
    throw new Error(`No timesheet found for previous day (${prevDateStr}) to copy from.`);
  }

  const prevLines = allLines.filter(l => l.headerId === prevHeader.id);
  if (prevLines.length === 0) {
    throw new Error('Previous day timesheet has no data lines.');
  }

  // 2. Find or create current day's header
  let currentHeader = headers.find(h => h.timesheetDate === date && h.supervisorId === supervisorId && h.workCenterName === workCenterName);
  if (!currentHeader) {
    const period = calculateTimesheetPeriod(targetDate);
    currentHeader = {
      id: `hdr-${date}-${slug(supervisorId)}-${slug(workCenterName)}`,
      periodId: period.id,
      timesheetDate: date,
      supervisorId,
      supervisorName: supervisorId,
      workCenterId: slug(workCenterName),
      workCenterName,
      status: 'Draft',
      submittedAt: null,
      submittedBy: null,
      approvedAt: null,
      approvedBy: null,
      lastSyncAt: new Date().toISOString(),
    };
    headers.push(currentHeader);
  }

  // 3. Map allocations from previous lines to current employees
  // We keep current attendance (clockIn/Out) but copy project/idle allocations
  const currentLines = allLines.filter(l => l.headerId === currentHeader!.id);

  const updatedLines = currentLines.map(line => {
    const prevLine = prevLines.find(pl => pl.employeeId === line.employeeId);
    if (!prevLine) return line;

    return {
      ...line,
      projectAllocations: [...prevLine.projectAllocations],
      idleAllocations: prevLine.idleAllocations.map(withDefaultIdleReason),
      usedHours: prevLine.usedHours,
      idleHours: prevLine.idleHours,
      totalHours: prevLine.totalHours,
      variance: round1(prevLine.totalHours - GROSS_TIMESHEET_HOURS),
      validationStatus: prevLine.usedHours > STANDARD_TIMESHEET_HOURS || prevLine.totalHours > GROSS_TIMESHEET_HOURS ? 'Error' : (prevLine.totalHours === GROSS_TIMESHEET_HOURS && prevLine.usedHours === STANDARD_TIMESHEET_HOURS ? 'Valid' : 'Incomplete'),
      validationMessage: null,
    } as TimesheetLine;
  });

  await writeTimesheetHeaderLines(currentHeader, updatedLines);
  return currentHeader;
}

const ok = <T,>(data: T, status = 200) => NextResponse.json({ status: 'success', data }, { status });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });
const round1 = (value: number) => Math.round(value * 10) / 10;
const GROSS_TIMESHEET_HOURS = STANDARD_TIMESHEET_HOURS + DAILY_BREAK_HOURS;
const clean = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const isSuperAdministrator = (role: string) => /\bsuper\b.*\badmin/i.test(role);
const lowerText = (value: unknown) => String(value ?? '').trim().toLowerCase();
const includesAny = (value: string, terms: string[]) => terms.some((term) => value.includes(term));
const tokenFrom = (request: Request) => request.headers.get('cookie')?.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${AUTH_COOKIE}=`))?.split('=').slice(1).join('=');
const sessionFrom = (request: Request) => verifySessionToken(tokenFrom(request) ? decodeURIComponent(tokenFrom(request) || '') : '');
const matchKey = (value: unknown) => {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw) return '';
  const compact = raw.replace(/[^A-Z0-9]/g, '');
  return compact.replace(/^0+/, '') || compact;
};
const matchKeys = (...values: unknown[]) => {
  const keys = new Set<string>();
  for (const value of values) {
    const base = matchKey(value);
    if (!base) continue;
    keys.add(base);
    const withoutTypePrefix = base.replace(/^[PCLNI]+(?=\d)/, '').replace(/^0+/, '');
    if (withoutTypePrefix) keys.add(withoutTypePrefix);
    const numeric = base.replace(/^[A-Z]+/, '').replace(/^0+/, '');
    if (numeric) keys.add(numeric);
  }
  return [...keys];
};

type SupervisorSourceEmployee = {
  employeeId?: string | null;
  employeeCode?: string | null;
  sourceEmployeeId?: string | null;
  fullName?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  division?: string | null;
  businessUnit?: string | null;
  costCenter?: string | null;
  projectSite?: string | null;
  workLocation?: string | null;
  officeLocation?: string | null;
  location?: string | null;
  managerName?: string | null;
  status?: string | null;
};

type SupervisorIndex<T extends SupervisorSourceEmployee> = {
  employees: T[];
  byKey: Map<string, T>;
};

const supervisorDisplay = (employee: SupervisorSourceEmployee) =>
  [clean(employee.employeeCode), clean(employee.fullName)].filter(Boolean).join(' - ') || clean(employee.fullName) || clean(employee.employeeCode);

const stripSupervisorCount = (value: string) => value.replace(/\s+\(\d+\)\s*$/, '').trim();

const supervisorNameTokens = (value: string) =>
  stripSupervisorCount(value)
    .replace(/^[^-]+-\s*/, '')
    .replace(/\b(mr|mrs|miss|ms|dr|prof)\b\.?/gi, ' ')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 1);

const buildSupervisorIndex = <T extends SupervisorSourceEmployee>(employees: T[]): SupervisorIndex<T> => {
  const byKey = new Map<string, T>();
  const prefer = (current: T | undefined, next: T) => {
    if (!current) return next;
    const currentTitle = clean(current.jobTitle).toLowerCase();
    const nextTitle = clean(next.jobTitle).toLowerCase();
    if (!currentTitle.includes('supervisor') && nextTitle.includes('supervisor')) return next;
    return current;
  };
  for (const employee of employees) {
    for (const key of matchKeys(employee.employeeCode, employee.employeeId, employee.sourceEmployeeId)) {
      byKey.set(key, prefer(byKey.get(key), employee));
    }
  }
  return { employees, byKey };
};

const canonicalSupervisorValue = (
  value: string | null | undefined,
  index: SupervisorIndex<SupervisorSourceEmployee>,
) => {
  const raw = stripSupervisorCount(clean(value));
  if (!raw) return '';
  const code = raw.includes(' - ') ? raw.split(' - ')[0]?.trim() : '';
  for (const key of matchKeys(code)) {
    const employee = index.byKey.get(key);
    const display = employee ? supervisorDisplay(employee) : '';
    if (display) return display;
  }

  const tokens = supervisorNameTokens(raw);
  if (tokens.length) {
    const candidates = index.employees.filter((employee) => {
      const name = clean(employee.fullName).toLowerCase();
      return tokens.every((token) => name.includes(token));
    });
    if (candidates.length === 1) return supervisorDisplay(candidates[0]);
    const supervisorCandidate = candidates.find((employee) => clean(employee.jobTitle).toLowerCase().includes('supervisor'));
    if (supervisorCandidate) return supervisorDisplay(supervisorCandidate);
  }

  return raw;
};

const findSupervisorEmployee = <T extends SupervisorSourceEmployee>(
  value: string | null | undefined,
  index: SupervisorIndex<T>,
): T | null => {
  const raw = stripSupervisorCount(clean(value));
  if (!raw) return null;
  const canonical = canonicalSupervisorValue(raw, index);
  const code = canonical.includes(' - ') ? canonical.split(' - ')[0]?.trim() : raw.includes(' - ') ? raw.split(' - ')[0]?.trim() : '';
  for (const key of matchKeys(code)) {
    const employee = index.byKey.get(key);
    if (employee) return employee;
  }
  const tokens = supervisorNameTokens(canonical || raw);
  if (!tokens.length) return null;
  const candidates = index.employees.filter((employee) => {
    const name = clean(employee.fullName).toLowerCase();
    return tokens.every((token) => name.includes(token));
  });
  return candidates.find((employee) => clean(employee.jobTitle).toLowerCase().includes('supervisor')) || candidates[0] || null;
};

const normalizeLineForGrossDay = (
  line: TimesheetLine,
  authorizations: OvertimeAuthorization[],
  allLines: TimesheetLine[],
  workCenter?: string | null,
  bookingOptions?: ReturnType<typeof resolveOvertimeBookingOptions>,
  dayContext?: TimesheetDayContext,
  projectCodes: string[] = [],
): TimesheetLine => {
  const withDefaults = dayContext?.date
    ? applyTimesheetLineDefaults(line, dayContext, projectCodes)
    : { ...line, idleAllocations: normalizeIdleAllocations(line.idleAllocations.map(withDefaultIdleReason)) };
  const validated = validateTimesheetLine(withDefaults, authorizations, allLines, workCenter, bookingOptions, dayContext);
  return {
    ...withDefaults,
    projectAllocations: normalizeProjectAllocations(withDefaults.projectAllocations || []),
    idleAllocations: withDefaults.idleAllocations.map(withDefaultIdleReason),
    usedHours: validated.usedHours,
    idleHours: validated.idleHours,
    totalHours: validated.totalHours,
    variance: validated.variance,
    validationStatus: validated.validationStatus,
    validationMessage: validated.validationMessage,
  };
};

const employeeDisplay = (employee: { employeeCode?: string | null; fullName?: string | null }) => {
  const code = clean(employee.employeeCode);
  const name = clean(employee.fullName);
  return [code, name].filter(Boolean).join(' - ') || code || name;
};

const managerMatches = (employee: { managerName?: string | null }, supervisor: string) => {
  const selected = clean(supervisor).toLowerCase();
  if (!selected) return false;
  const selectedCode = selected.split(' - ')[0]?.trim();
  const selectedName = selected.includes(' - ') ? selected.split(' - ').slice(1).join(' - ').trim() : selected;
  const managerName = clean(employee.managerName).toLowerCase();
  return managerName === selected || managerName === selectedName || managerName.includes(selected) || managerName.includes(selectedCode);
};

const employeeLocation = (employee: {
  location?: string | null;
  workLocation?: string | null;
  officeLocation?: string | null;
  projectSite?: string | null;
}) => clean(employee.location || employee.workLocation || employee.officeLocation || employee.projectSite);

const employeeMatchesLocation = (employee: Parameters<typeof employeeLocation>[0], locationName?: string) => {
  const selected = clean(locationName).toLowerCase();
  if (!selected) return true;
  return [employee.location, employee.workLocation, employee.officeLocation, employee.projectSite]
    .map((value) => clean(value).toLowerCase())
    .filter(Boolean)
    .some((value) => value === selected || value.includes(selected) || selected.includes(value));
};

const employeeMatchesWorkCenter = (employee: {
  department?: string | null;
  division?: string | null;
  businessUnit?: string | null;
  costCenter?: string | null;
  projectSite?: string | null;
  workLocation?: string | null;
  officeLocation?: string | null;
  location?: string | null;
}, workCenterName?: string) => {
  const selected = clean(workCenterName).toLowerCase();
  if (!selected) return true;
  return [employee.department, employee.division, employee.businessUnit, employee.costCenter, employee.projectSite, employee.workLocation, employee.officeLocation, employee.location]
    .map((value) => clean(value).toLowerCase())
    .filter(Boolean)
    .some((value) => value === selected || value.includes(selected) || selected.includes(value));
};

const supervisorMatchesSelection = (employee: {
  employeeCode?: string | null;
  employeeId?: string | null;
  fullName?: string | null;
}, supervisor: string) => {
  const selected = clean(supervisor).toLowerCase();
  if (!selected) return false;
  const selectedCode = selected.split(' - ')[0]?.replace(/[()]/g, '').trim();
  const selectedName = selected.includes(' - ') ? selected.split(' - ').slice(1).join(' - ').replace(/\(\d+\)\s*$/, '').trim() : selected.replace(/\(\d+\)\s*$/, '').trim();
  const code = clean(employee.employeeCode || employee.employeeId).toLowerCase();
  const name = clean(employee.fullName).toLowerCase();
  return Boolean((selectedCode && code === selectedCode) || (selectedName && (name === selectedName || name.includes(selectedName))));
};

const employeeSummary = (employee: {
  employeeId: string;
  employeeCode: string;
  fullName: string;
  jobTitle: string;
  department: string;
  location?: string;
  workLocation?: string;
  officeLocation?: string;
  status: string;
}) => ({
  employeeId: employee.employeeId,
  employeeCode: employee.employeeCode,
  fullName: employee.fullName,
  jobTitle: employee.jobTitle,
  department: employee.department,
  location: employee.location || employee.workLocation || employee.officeLocation || '',
  status: employee.status,
});

const timesheetRecordEmployeeSummary = (record: TimesheetRecord) => ({
  employeeId: record.employeeId,
  employeeCode: record.employeeId,
  fullName: record.employeeName,
  jobTitle: record.mode,
  department: record.department,
  location: clean(record.location || record.site),
  managerEmployeeCode: null,
  managerName: clean(record.supervisor) || null,
  status: record.status === 'Returned' ? 'Needs Review' : 'Active',
});

const resolveDashboardRoot = () => {
  const cwd = process.cwd();
  const dashboardSuffix = path.join('apps', 'dashboard');
  return cwd.endsWith(dashboardSuffix) ? cwd : path.join(cwd, dashboardSuffix);
};

const HOLIDAY_PATH = path.join(resolveDashboardRoot(), 'data', 'hris', 'payroll-public-holidays.json');

const readPublicHolidayDates = async (): Promise<string[]> => {
  try {
    const raw = await readFile(HOLIDAY_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.dates)) return parsed.dates.map(String).filter(Boolean);
  } catch {
    return [];
  }
  return [];
};

const activeText = (value: unknown) => clean(value).toLowerCase();
const isInactiveText = (value: unknown) => /exited|suspended|terminated|inactive|disabled|resigned|retired|deleted/.test(activeText(value));

const readActiveAuthProjectManagers = async (): Promise<ProjectManagerOption[]> => {
  try {
    const usersPath = path.join(resolveDashboardRoot(), 'data', 'auth', 'users.json');
    const users = JSON.parse(await readFile(usersPath, 'utf8')) as Array<Record<string, unknown>>;
    return users
      .filter((user) => !user.deleted && !isInactiveText(user.status) && !isInactiveText(user.employmentStatus))
      .map((user) => ({
        employeeId: clean(user.employeeId) || clean(user.employeeCode) || clean(user.username),
        employeeCode: clean(user.employeeCode) || clean(user.employeeId) || clean(user.username),
        fullName: clean(user.fullName) || clean(user.username),
        jobTitle: clean(user.jobTitle) || 'Unassigned Job Title',
        department: clean(user.department) || clean(user.unit) || 'Unassigned Department',
        location: clean(user.location),
        status: clean(user.employmentStatus) || clean(user.status) || 'Active',
      }))
      .filter((user) => user.employeeCode && user.fullName);
  } catch {
    return [];
  }
};

const buildProjectManagerOptions = async (employees: PayrollEmployeeSource['employees']): Promise<ProjectManagerOption[]> => {
  const byCode = new Map<string, ProjectManagerOption>();
  const add = (manager: ProjectManagerOption) => {
    const code = clean(manager.employeeCode || manager.employeeId);
    if (!code || !clean(manager.fullName)) return;
    byCode.set(code.toLowerCase(), {
      ...manager,
      employeeId: clean(manager.employeeId) || code,
      employeeCode: code,
      fullName: clean(manager.fullName),
      jobTitle: clean(manager.jobTitle) || 'Unassigned Job Title',
      department: clean(manager.department) || 'Unassigned Department',
      location: clean(manager.location),
      status: clean(manager.status) || 'Active',
    });
  };

  employees.forEach((employee) => add({
    employeeId: employee.employeeId,
    employeeCode: employee.employeeCode,
    fullName: employee.fullName,
    jobTitle: employee.jobTitle,
    department: employee.department,
    location: employee.location || employee.workLocation || employee.officeLocation,
    status: employee.status,
  }));

  (await readActiveAuthProjectManagers()).forEach(add);
  return Array.from(byCode.values()).sort((a, b) => a.fullName.localeCompare(b.fullName) || a.employeeCode.localeCompare(b.employeeCode));
};

const mostCommon = (values: unknown[]) => {
  const counts = new Map<string, number>();
  for (const value of values.map(clean).filter(Boolean)) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || '';
};

const preferredLocationFromDirectory = (
  directReports: Array<{ location?: string | null; workLocation?: string | null; officeLocation?: string | null; projectSite?: string | null }>,
  locations: TimesheetLocation[],
  workCenters: TimesheetWorkCenter[],
) => {
  const workCenterNames = new Set(workCenters.map((workCenter) => clean(workCenter.name).toLowerCase()).filter(Boolean));
  const directReportLocation = mostCommon(directReports.map(employeeLocation));
  if (directReportLocation && !workCenterNames.has(directReportLocation.toLowerCase())) return directReportLocation;

  const systemLocations = locations
    .flatMap((location) => [location.name, location.site])
    .map(clean)
    .filter((value): value is string => Boolean(value))
    .filter((value) => !workCenterNames.has(value.toLowerCase()));
  return systemLocations.find((value) => /^idi[_\-\s]?oro$/i.test(value)) || mostCommon(systemLocations);
};

const assignedEmployeesForSupervisor = async (supervisor: string, employees: SupervisorSourceEmployee[]) => {
  const supervisorCode = clean(supervisor).split(' - ')[0]?.trim();
  if (!supervisorCode) return [];
  try {
    const assignments = await readSupervisorAssignments({ supervisorEmployeeCode: supervisorCode });
    const byEmployeeCode = new Map(employees.map((employee) => [clean(employee.employeeCode).toLowerCase(), employee]));
    return assignments
      .filter((assignment) => assignment.employeeCode && assignment.matchedStatus !== 'Unresolved')
      .map((assignment) => {
        const employee = byEmployeeCode.get(clean(assignment.employeeCode).toLowerCase());
        return employee || {
          employeeId: assignment.employeeCode || '',
          employeeCode: assignment.employeeCode || '',
          sourceEmployeeId: assignment.employeeCode || '',
          fullName: assignment.employeeName || assignment.employeeCode || '',
          jobTitle: assignment.tradeRole || 'Assigned Crew',
          department: assignment.assignmentGroup || 'Operations',
          division: assignment.assignmentGroup || '',
          businessUnit: assignment.assignmentGroup || '',
          costCenter: '',
          projectSite: 'IDI_ORO',
          workLocation: 'IDI_ORO',
          officeLocation: 'IDI_ORO',
          location: 'IDI_ORO',
          managerName: supervisor,
          status: 'Active',
        } as SupervisorSourceEmployee;
      });
  } catch (error) {
    console.warn('Timesheet supervisor assignment list could not be loaded; falling back to reporting manager data:', error);
    return [];
  }
};

const defaultWorkCenterForEmployees = (
  employees: Array<{ department?: string | null; division?: string | null; businessUnit?: string | null; costCenter?: string | null; projectSite?: string | null; workLocation?: string | null; officeLocation?: string | null; location?: string | null }>,
  workCenters: TimesheetWorkCenter[],
  locationName?: string,
) => {
  const available = workCenters.filter((workCenter) => {
    const selected = clean(locationName).toLowerCase();
    if (!selected) return true;
    return [workCenter.location, workCenter.site, workCenter.name].map((value) => clean(value).toLowerCase()).filter(Boolean).some((value) => value === selected || value.includes(selected) || selected.includes(value));
  });
  const scored = available.map((workCenter) => ({
    name: workCenter.name,
    score: employees.filter((employee) => employeeMatchesWorkCenter(employee, workCenter.name)).length,
  })).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return scored.find((item) => item.score > 0)?.name || scored[0]?.name || '';
};

const workCenterFromSupervisorProfile = (profile: SupervisorSourceEmployee | null | undefined, workCenters: TimesheetWorkCenter[]) => {
  const title = clean(profile?.jobTitle).toLowerCase();
  if (!title) return '';
  const aliases: Array<[RegExp, string]> = [
    [/\bfitter|fitting\b/i, 'Fitting'],
    [/\bwelder|welding\b/i, 'Welding'],
    [/\bpainter|painting|coating\b/i, 'Painting'],
    [/\brigger|rigging\b/i, 'Rigging'],
    [/\bscaffold/i, 'Structural Assembly'],
    [/\broller|rolling|machinist|machining\b/i, 'Machining'],
  ];
  const alias = aliases.find(([pattern]) => pattern.test(title))?.[1];
  if (alias) {
    const match = workCenters.find((workCenter) => clean(workCenter.name).toLowerCase() === alias.toLowerCase());
    if (match) return match.name;
  }
  return workCenters.find((workCenter) => title.includes(clean(workCenter.name).toLowerCase()))?.name || '';
};

const resolveProjectManagerForSubmission = (lines: TimesheetLine[], projects: Project[]) => {
  const hoursByProject = new Map<string, number>();
  for (const line of lines) {
    for (const allocation of line.projectAllocations || []) {
      if (!allocation.projectCode || allocation.hours <= 0) continue;
      hoursByProject.set(allocation.projectCode, (hoursByProject.get(allocation.projectCode) || 0) + allocation.hours);
    }
  }
  const missingProjectManagers = [...hoursByProject.keys()].filter((projectCode) => {
    const project = projects.find((item) => item.code.toLowerCase() === projectCode.toLowerCase());
    return !project?.projectManager?.trim();
  });
  if (missingProjectManagers.length) {
    throw new Error(`Project Manager is required before submission for: ${missingProjectManagers.join(', ')}.`);
  }
  const primaryProjectCode = [...hoursByProject.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!primaryProjectCode) return null;
  const project = projects.find((item) => item.code.toLowerCase() === primaryProjectCode.toLowerCase());
  if (!project) {
    throw new Error(`Project ${primaryProjectCode} is not available in the project catalog.`);
  }
  return {
    projectCode: project.code,
    projectName: project.name,
    projectManager: project.projectManager.trim(),
  };
};
const todayDateInputValue = () => {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
};

const buildPayload = async (request: Request, date?: string, supervisorId?: string, workCenterName?: string, locationName?: string, mode?: 'supervisor', requestedHeaderId?: string): Promise<TimesheetPayload> => {
  const access = resolveAccessContext(request);
  const uiPermissions = getUiPermissions(access);
  const session = await sessionFrom(request);
  const supervisorMode = mode === 'supervisor';
  const [
    timesheetData,
    departments,
    locations,
    workCenters,
    projects,
    nextProjectCode,
    biometricDevices,
    timesheetRecords,
    payrollEmployeeSource,
    assignmentRows,
    holidayDates,
  ] = await Promise.all([
    readTimesheetData(),
    readSystemTimesheetDepartments(),
    readSystemTimesheetLocations(),
    readTimesheetWorkCenters(),
    readProjects(),
    generateProjectCode(),
    readBiometricDevices(),
    readTimesheetRecords(),
    readPayrollEmployees(),
    readSupervisorAssignments().catch(() => []),
    readPublicHolidayDates(),
  ]);
  const { headers, lines: allLines } = timesheetData;
  const employees = payrollEmployeeSource.employees;
  const activeEmployees = employees.filter((employee) => !['Resigned', 'Terminated', 'Retired'].includes(employee.status));
  const supervisorIndex = buildSupervisorIndex(activeEmployees);
  const projectManagers = await buildProjectManagerOptions(activeEmployees);

  const requestedHeader = requestedHeaderId ? headers.find((item) => item.id === requestedHeaderId) : null;
  const targetDate = requestedHeader?.timesheetDate || date || todayDateInputValue();
  const dayContext = dayContextFor(targetDate, holidayDates, requestedHeader?.shiftLabel);
  if (supervisorMode && !session) throw new Error('Authenticated supervisor session is required.');
  let requestedSupervisor = clean(requestedHeader?.supervisorId || supervisorId);
  let targetWorkCenter = clean(requestedHeader?.workCenterName || workCenterName);
  let targetLocation = clean(locationName);
  const period = await readTimesheetPeriod(new Date(targetDate));
  const recordSupervisors = Array.from(new Set(timesheetRecords.map((record) => record.supervisor).map(clean).filter(Boolean)));
  const employeesBySupervisor = new Map<string, typeof activeEmployees>();
  for (const employee of activeEmployees) {
    const keys = [canonicalSupervisorValue(employee.managerName, supervisorIndex)].map(clean).filter(Boolean);
    for (const key of keys) {
      const existing = employeesBySupervisor.get(key) || [];
      existing.push(employee);
      employeesBySupervisor.set(key, existing);
    }
  }
  const assignmentSupervisors = new Map<string, {
    value: string;
    label: string;
    employeeCode: string;
    fullName: string;
    jobTitle: string;
    department: string;
    employeeCount: number;
  }>();
  for (const assignment of assignmentRows) {
    const supervisorCode = clean(assignment.supervisorEmployeeCode);
    const supervisorName = clean(assignment.supervisorName);
    if (!supervisorCode || assignment.matchedStatus === 'Unresolved') continue;
    const supervisorEmployee = supervisorIndex.byKey.get(supervisorCode.toLowerCase());
    const value = canonicalSupervisorValue(`${supervisorCode} - ${supervisorName || supervisorEmployee?.fullName || supervisorCode}`, supervisorIndex);
    if (!value) continue;
    const existing = assignmentSupervisors.get(value);
    assignmentSupervisors.set(value, {
      value,
      label: value,
      employeeCode: supervisorCode,
      fullName: supervisorName || clean(supervisorEmployee?.fullName) || supervisorCode,
      jobTitle: clean(supervisorEmployee?.jobTitle),
      department: clean(supervisorEmployee?.department) || clean(assignment.assignmentGroup),
      employeeCount: (existing?.employeeCount || 0) + (assignment.employeeCode ? 1 : 0),
    });
  }
  const supervisorDirectoryByValue = new Map<string, {
    value: string;
    label: string;
    employeeCode: string;
    fullName: string;
    jobTitle: string;
    department: string;
    employeeCount: number;
  }>();
  for (const item of assignmentSupervisors.values()) supervisorDirectoryByValue.set(item.value, item);
  for (const item of Array.from(employeesBySupervisor.entries())
    .map(([manager, directReports]) => {
      const employeeCount = new Set(directReports.map((item) => item.employeeCode)).size;
      const supervisorEmployee = findSupervisorEmployee(manager, supervisorIndex);
      return {
        value: manager,
        label: `${manager}${employeeCount ? ` (${employeeCount})` : ''}`,
        employeeCode: manager.split(' - ')[0] || manager,
        fullName: manager.includes(' - ') ? manager.split(' - ').slice(1).join(' - ') : manager,
        jobTitle: clean(supervisorEmployee?.jobTitle),
        department: clean(supervisorEmployee?.department),
        employeeCount,
      };
    })
    .filter((item) => item.employeeCount > 0)) {
    const assignmentItem = supervisorDirectoryByValue.get(item.value);
    supervisorDirectoryByValue.set(item.value, assignmentItem ? { ...item, employeeCount: Math.max(item.employeeCount, assignmentItem.employeeCount) } : item);
  }
  const supervisorDirectory = Array.from(supervisorDirectoryByValue.values())
    .map((item) => ({ ...item, label: `${item.value}${item.employeeCount ? ` (${item.employeeCount})` : ''}` }))
    .filter((item) => item.employeeCount > 0)
    .sort((a, b) => a.label.localeCompare(b.label));
  const targetSupervisor = canonicalSupervisorValue(requestedSupervisor || supervisorDirectory[0]?.value || recordSupervisors[0] || access.actor, supervisorIndex);
  const selectedSupervisorProfile = findSupervisorEmployee(targetSupervisor, supervisorIndex) || activeEmployees.find((employee) => supervisorMatchesSelection(employee, targetSupervisor));
  const targetSupervisorCode = clean(targetSupervisor).split(' - ')[0]?.trim().toLowerCase();
  const employeesByCode = new Map(activeEmployees.map((employee) => [clean(employee.employeeCode).toLowerCase(), employee]));
  const assignedSupervisorEmployees = assignmentRows
    .filter((assignment) => clean(assignment.supervisorEmployeeCode).toLowerCase() === targetSupervisorCode && assignment.employeeCode && assignment.matchedStatus !== 'Unresolved')
    .map((assignment) => {
      const employee = employeesByCode.get(clean(assignment.employeeCode).toLowerCase());
      return employee || {
        employeeId: assignment.employeeCode || '',
        employeeCode: assignment.employeeCode || '',
        sourceEmployeeId: assignment.employeeCode || '',
        fullName: assignment.employeeName || assignment.employeeCode || '',
        jobTitle: assignment.tradeRole || 'Assigned Crew',
        department: assignment.assignmentGroup || 'Operations',
        division: assignment.assignmentGroup || '',
        businessUnit: assignment.assignmentGroup || '',
        costCenter: '',
        projectSite: 'IDI_ORO',
        workLocation: 'IDI_ORO',
        officeLocation: 'IDI_ORO',
        location: 'IDI_ORO',
        managerName: targetSupervisor,
        status: 'Active',
      };
    });
  const reportingManagerEmployees = activeEmployees.filter((employee) => {
    const canonicalManager = canonicalSupervisorValue(employee.managerName, supervisorIndex);
    return canonicalManager === targetSupervisor || managerMatches({ managerName: canonicalManager || employee.managerName }, targetSupervisor);
  });
  const selectedSupervisorAllDirectReports = assignedSupervisorEmployees.length ? assignedSupervisorEmployees : reportingManagerEmployees;
  if (supervisorMode) {
    const supervisorRecordsForDefault = timesheetRecords.filter((record) => managerMatches({ managerName: record.supervisor }, targetSupervisor));
    targetLocation = targetLocation ||
      preferredLocationFromDirectory(selectedSupervisorAllDirectReports, locations, workCenters) ||
      mostCommon(supervisorRecordsForDefault.flatMap((record) => [record.location, record.site]));
    targetWorkCenter = targetWorkCenter ||
      workCenterFromSupervisorProfile(selectedSupervisorProfile, workCenters) ||
      defaultWorkCenterForEmployees(selectedSupervisorAllDirectReports, workCenters, targetLocation) ||
      mostCommon(supervisorRecordsForDefault.flatMap((record) => [record.department, record.businessUnit, record.site, record.location]));
    targetLocation =
      targetLocation ||
      preferredLocationFromDirectory([], locations, workCenters) ||
      clean(workCenters.find((workCenter) => workCenter.name === targetWorkCenter)?.site || workCenters.find((workCenter) => workCenter.name === targetWorkCenter)?.location) ||
      mostCommon(locations.flatMap((location) => [location.name, location.site]));
  }
  const selectedSupervisorDirectReports = targetLocation
    ? selectedSupervisorAllDirectReports.filter((employee) => employeeMatchesLocation(employee, targetLocation))
    : selectedSupervisorAllDirectReports;
  const selectedSupervisorWorkCenterReports = targetWorkCenter
    ? selectedSupervisorDirectReports.filter((employee) => employeeMatchesWorkCenter(employee, targetWorkCenter))
    : [];
  const selectedSupervisorEmployeesFromDirectory = (selectedSupervisorWorkCenterReports.length ? selectedSupervisorWorkCenterReports : selectedSupervisorDirectReports)
    .map((employee) => ({
      employeeId: clean(employee.employeeId),
      employeeCode: clean(employee.employeeCode),
      fullName: clean(employee.fullName) || clean(employee.employeeCode),
      jobTitle: clean(employee.jobTitle),
      department: clean(employee.department),
      location: employeeLocation(employee),
      managerEmployeeCode: null,
      managerName: clean(employee.managerName) || null,
      status: clean(employee.status) || 'Active',
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
  const selectedSupervisorEmployeesFromRecords = timesheetRecords
    .filter((record) => {
      if (!managerMatches({ managerName: record.supervisor }, targetSupervisor)) return false;
      if (targetLocation && !employeeMatchesLocation({ location: record.location, workLocation: record.location, officeLocation: record.site, projectSite: record.site }, targetLocation)) return false;
      if (targetWorkCenter && !employeeMatchesWorkCenter({ department: record.department, businessUnit: record.businessUnit, projectSite: record.site, workLocation: record.location, officeLocation: record.site, location: record.location }, targetWorkCenter)) return false;
      return true;
    })
    .map(timesheetRecordEmployeeSummary)
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
  const selectedSupervisorEmployees = selectedSupervisorEmployeesFromDirectory.length ? selectedSupervisorEmployeesFromDirectory : selectedSupervisorEmployeesFromRecords;
  const overtimeBooking = resolveOvertimeBookingOptions();
  const activeProjects = projects.filter((project) => ['Active', 'Approved', 'Open'].includes(project.status));
  let approvedOvertimeAuthorizations: OvertimeAuthorizationRequest[] = [];
  const attendanceWorkCenters = workCenters.map((workCenter) => ({
    location: workCenter.location || workCenter.name,
    site: workCenter.site || workCenter.location || workCenter.name,
    deviceName: workCenter.name,
  }));

  let header =
    requestedHeader ||
    (targetWorkCenter
      ? headers.find((h) => h.timesheetDate === targetDate && canonicalSupervisorValue(h.supervisorId, supervisorIndex) === targetSupervisor && h.workCenterName === targetWorkCenter)
      : headers.find((h) => h.timesheetDate === targetDate && canonicalSupervisorValue(h.supervisorId, supervisorIndex) === targetSupervisor)) ||
    null;
  const selectedEmployeeKeys = new Set(selectedSupervisorEmployees.flatMap((employee) => matchKeys(employee.employeeCode, employee.fullName)).filter(Boolean));
  const lineBelongsToSelectedCrew = (line: TimesheetLine) =>
    selectedEmployeeKeys.size > 0
      ? matchKeys(line.employeeNo, line.employeeId, line.employeeName).some((key) => selectedEmployeeKeys.has(key))
      : !supervisorMode;
  const selectedHeaderId = header?.id;
  const headerLines = selectedHeaderId ? allLines.filter((line) => line.headerId === selectedHeaderId) : [];
  approvedOvertimeAuthorizations = (await loadOvertimeAuthorizationsForBooking(
    header,
    headerLines,
    activeProjects,
    overtimeBooking,
  )) as OvertimeAuthorizationRequest[];
  let lines = headerLines
    .map((line) =>
      normalizeLineForGrossDay(
        line,
        approvedOvertimeAuthorizations as OvertimeAuthorization[],
        headerLines,
        targetWorkCenter,
        overtimeBooking,
        dayContext,
        activeProjects.map((project) => project.code),
      ),
    )
    .filter(lineBelongsToSelectedCrew);

  // Keep the initial page load lightweight. Attendance sync can involve biometric
  // and Sage enrichment calls, so it is only run from the explicit Fetch Punches action.

  const projectSiteOptions = Array.from(
    new Set(
      locations
        .flatMap((location) => [location.site, location.name])
        .map(clean)
        .filter((site) => site && site !== 'Unassigned Location'),
    ),
  ).sort((a, b) => a.localeCompare(b));
  const systemLocationNames = Array.from(
    new Set(
      [
        ...timesheetRecords.flatMap((record) => [record.location, record.site]),
        ...activeEmployees.map(employeeLocation),
        ...locations.flatMap((location) => [location.name, location.site]),
      ].map(clean).filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));
  const summary = {
    totalEmployees: lines.length,
    presentEmployees: lines.filter((l) => l.clockIn).length,
    absentEmployees: lines.filter((l) => !l.clockIn).length,
    onLeaveEmployees: lines.filter((l) =>
      l.idleAllocations.some((item) => item.reasonName.toLowerCase().includes('leave')) ||
      l.projectAllocations.some((item) => item.projectCode.toUpperCase() === 'LEAVE' && Number(item.hours || 0) > 0),
    ).length,
    sickEmployees: 0,
    notSyncedEmployees: 0,
    bookedHours: round1(lines.reduce((sum, l) => sum + normalizePaidWorkHours(l.totalHours), 0)),
    usedHours: round1(lines.reduce((sum, l) => sum + normalizePaidWorkHours(l.usedHours), 0)),
    idleHours: round1(lines.reduce((sum, l) => sum + l.idleHours, 0)),
    productivityPct: lines.reduce((sum, l) => sum + normalizePaidWorkHours(l.totalHours), 0) > 0 
      ? round1((lines.reduce((sum, l) => sum + normalizePaidWorkHours(l.usedHours), 0) / lines.reduce((sum, l) => sum + normalizePaidWorkHours(l.totalHours), 0)) * 100)
      : 0,
    pendingApprovals: headers.filter((h) => ['Submitted', 'Supervisor_Reviewed', 'Project_Manager_Reviewed', 'Cost_Control_Reviewed', 'GM_Operations_Reviewed'].includes(h.status)).length,
  };

  return {
    generatedAt: new Date().toISOString(),
    timesheetDate: targetDate,
    holidayDates,
    period,
    header,
    lines,
    idleReasons,
    projects: activeProjects,
    nextProjectCode,
    workflowStages,
    biometricDevices,
    attendanceWorkCenters,
    workCenters,
    departments,
    locations,
    projectManagers,
    supervisorEmployees: selectedSupervisorEmployees,
    supervisorProfile: selectedSupervisorProfile ? employeeSummary(selectedSupervisorProfile) : null,
    approvedOvertimeAuthorizations,
    overtimeBooking,
    canBookOvertime: canBookOvertimeOnTimesheet(header, period, overtimeBooking),
    permissions: {
      actor: session?.fullName || uiPermissions.actor,
      role: uiPermissions.role,
      canEdit: uiPermissions.canEditAttendance || uiPermissions.canEditWorkforce,
      canExport: uiPermissions.canViewAudit || uiPermissions.canApproveTimesheet || uiPermissions.canEditWorkforce,
      canApprove: uiPermissions.canApproveTimesheet,
      canManagePeriod: uiPermissions.canManageTimesheetPeriods,
      canViewCosts: uiPermissions.canApproveTimesheet || uiPermissions.canViewAudit,
      canViewAudit: uiPermissions.canViewAudit,
    },
    summary,
    filterOptions: {
      departments: departments.map((department) => department.name),
      projects: activeProjects.map(p => p.code),
      locations: systemLocationNames,
      projectSites: projectSiteOptions,
      supervisors: Array.from(new Set([targetSupervisor, ...supervisorDirectory.map((item) => item.value), ...recordSupervisors].map(clean).filter(Boolean))).sort((a, b) => {
        const aLabel = supervisorDirectory.find((item) => item.value === a)?.label || a;
        const bLabel = supervisorDirectory.find((item) => item.value === b)?.label || b;
        return aLabel.localeCompare(bLabel);
      }),
      shifts: TIMESHEET_SHIFT_LABELS,
      businessUnits: [],
      modes: ['Supervisor Entry'],
      statuses: ['Draft', 'Submitted', 'Supervisor_Reviewed', 'Project_Manager_Reviewed', 'Cost_Control_Reviewed', 'GM_Operations_Reviewed', 'HR_Acknowledged', 'Rejected', 'Returned', 'Locked'],
      supervisorDirectory,
    },
    matrixColumns: activeProjects.slice(0, 4).map(p => ({ code: p.code, label: p.code, kind: 'project' })),
    projectCatalog: activeProjects,
    aiInsights: [
      {
        id: 'ts-ins-1',
        severity: summary.idleHours > summary.usedHours * 0.2 ? 'high' : 'low',
        title: 'High Idle Time Detected',
        recommendation: 'Review work center assignments and check for material or equipment delays.',
      },
      {
        id: 'ts-ins-2',
        severity: summary.notSyncedEmployees > 0 ? 'medium' : 'low',
        title: 'Attendance Sync Coverage',
        recommendation: summary.notSyncedEmployees > 0
          ? 'Some biometric clock-ins for this work center are not yet on the timesheet. Sync attendance to refresh.'
          : 'Timesheet rows are aligned with the selected biometric work center.',
      },
    ],
  };
};

const requireOpenPeriod = async (date: string) => {
  const period = await readTimesheetPeriod(new Date(date));
  if (period.status !== 'Open') {
    throw new Error(`Timesheet period ${period.name} is ${period.status}. Reopen the period before changing timesheets.`);
  }
  return period;
};

const requireEditableTimesheet = (header: TimesheetHeader) => {
  const status = normalizeTimesheetStatus(header.status);
  if (isTimesheetPayrollReadyStatus(header.status)) {
    throw new Error('This timesheet has been acknowledged by HR and is payroll-ready. It cannot be edited.');
  }
  if (!isTimesheetEditableStatus(header.status)) {
    throw new Error(`This timesheet is currently ${status.replace(/_/g, ' ')} and cannot be edited unless it is still in supervisor review or has been returned/rejected.`);
  }
};

const requireApprovalActionAccess = (header: TimesheetHeader, actor: string, role: string) => {
  if (isSuperAdministrator(role)) return;
  const status = normalizeTimesheetStatus(header.status);
  const combined = lowerText(`${actor} ${role}`);
  if (!['Submitted', 'Cost_Control_Reviewed', 'GM_Operations_Reviewed'].includes(status)) {
    throw new Error('This workflow stage requires project-level approval. Only the Super Administrator can approve all levels at once.');
  }
  if (status === 'Submitted') {
    const supervisorText = lowerText(header.supervisorName || header.supervisorId);
    const actorValue = lowerText(actor);
    const isAssignedSupervisor = supervisorText && (supervisorText.includes(actorValue) || actorValue.includes(supervisorText));
    if (!isAssignedSupervisor && !includesAny(combined, ['supervisor', 'site lead', 'foreman'])) {
      throw new Error('Only the assigned supervisor can complete supervisor review.');
    }
  }
  if (status === 'Cost_Control_Reviewed' && !includesAny(combined, ['gm operations', 'general manager', 'gm ', 'operations', 'admin'])) {
    throw new Error('Only GM Operations can approve the consolidated timesheet pack.');
  }
  if (status === 'GM_Operations_Reviewed' && !includesAny(combined, ['hr', 'human resources', 'payroll'])) {
    throw new Error('Only HR or Payroll can acknowledge a fully approved timesheet for payroll.');
  }
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const headerId = searchParams.get('headerId') || undefined;
    const date = searchParams.get('date') || undefined;
    const supervisorId = searchParams.get('supervisorId') || undefined;
    const locationName = searchParams.get('locationName') || undefined;
    const workCenterName = searchParams.get('workCenterName') || undefined;
    const mode = searchParams.get('mode') === 'supervisor' ? 'supervisor' : undefined;
    return ok(await buildPayload(request, date, supervisorId, workCenterName, locationName, mode, headerId));
  } catch (error) {
    console.error('Timesheet entry API Error:', error);
    return err(500, error instanceof Error ? error.message : 'Unable to load timesheet entry.');
  }
}

export async function PATCH(request: Request) {
  const access = resolveAccessContext(request);
  const session = await sessionFrom(request);
  const actor = session?.fullName || access.actor;

  try {
    let payload: UpdatePayload;
    try {
      const raw = await request.text();
      if (!raw.trim()) return err(400, 'Request body is required.');
      payload = JSON.parse(raw) as UpdatePayload;
    } catch {
      return err(400, 'Invalid JSON in request body.');
    }

    const { action, date, supervisorId, locationName, workCenterName, headerId, lines: updatedLines } = payload;
    const mode = payload.mode === 'supervisor' ? 'supervisor' : undefined;
    const isSupervisorMode = mode === 'supervisor';

    if (action === 'CREATE_PROJECT' || action === 'UPSERT_PROJECT') {
      if (!payload.project) return err(400, 'Project details are required.');
      const projectCode = payload.project.code?.trim().toUpperCase();
      if (!projectCode) return err(400, 'Project code is required.');
      if (!payload.project.name?.trim()) return err(400, 'Project name is required.');
      if (!payload.project.clientName?.trim()) return err(400, 'Client name is required.');
      if (!payload.project.site?.trim()) return err(400, 'Site location is required.');
      if (!payload.project.projectManager?.trim()) return err(400, 'Project Manager is required.');
      const projectId = payload.project.id || `prj-${Date.now()}`;
      await upsertProject({
        ...payload.project,
        code: projectCode,
        name: payload.project.name.trim(),
        clientName: payload.project.clientName.trim(),
        site: payload.project.site.trim(),
        projectManager: payload.project.projectManager.trim(),
        id: projectId,
        status: payload.project.status || 'Active',
        tasks: payload.project.tasks?.length ? payload.project.tasks : [{ id: `task-${projectId}`, name: 'General Project Work' }],
      });
      return ok(await buildPayload(request, date, supervisorId, workCenterName, locationName, mode));
    }

    if (action === 'UPSERT_WORK_CENTER') {
      if (!payload.workCenter?.name?.trim()) return err(400, 'Work center name is required.');
      await upsertTimesheetWorkCenter(payload.workCenter);
      return ok(await buildPayload(request, date, supervisorId, payload.workCenter.name, locationName, mode));
    }

    if (action === 'DELETE_WORK_CENTER') {
      if (!payload.workCenter?.id) return err(400, 'Work center ID is required.');
      await deactivateTimesheetWorkCenter(payload.workCenter.id);
      return ok(await buildPayload(request, date, supervisorId, workCenterName, locationName, mode));
    }

    if (action === 'SET_SHIFT') {
      if (!payload.headerId) return err(400, 'Header ID is required.');
      if (!payload.shiftLabel) return err(400, 'Shift label is required.');
      const { headers, lines } = await readTimesheetData();
      const header = headers.find((item) => item.id === payload.headerId);
      if (!header) return err(404, 'Timesheet header not found.');
      requireEditableTimesheet(header);
      header.shiftLabel = String(payload.shiftLabel);
      await writeTimesheetHeaderLines(header, lines.filter((line) => line.headerId === header.id));
      return ok(await buildPayload(request, header.timesheetDate, header.supervisorId, header.workCenterName, locationName, mode));
    }

    if (action === 'COPY_PREVIOUS_DAY') {
      let scopedDate = date;
      let scopedSupervisorId = supervisorId;
      let scopedWorkCenterName = workCenterName;
      let scopedLocationName = locationName;
      if (isSupervisorMode) {
        const scoped = await buildPayload(request, date, undefined, workCenterName, locationName, mode);
        scopedDate = scoped.timesheetDate;
        scopedSupervisorId = supervisorId || scoped.filterOptions.supervisors[0];
        scopedLocationName = locationName || scoped.supervisorProfile?.location || scoped.filterOptions.locations[0];
        scopedWorkCenterName = workCenterName || scoped.header?.workCenterName || scoped.workCenters[0]?.name || '';
      }
      if (!scopedDate || !scopedSupervisorId || !scopedWorkCenterName) return err(400, 'Date, supervisor, and work center are required for copy.');
      await requireOpenPeriod(scopedDate);
      const { headers } = await readTimesheetData();
      const currentHeader = headers.find(h => h.timesheetDate === scopedDate && h.supervisorId === scopedSupervisorId && h.workCenterName === scopedWorkCenterName);
      if (currentHeader) requireEditableTimesheet(currentHeader);
      await handleCopyPreviousDay(request, scopedDate, scopedSupervisorId, scopedWorkCenterName);
      return ok(await buildPayload(request, scopedDate, scopedSupervisorId, scopedWorkCenterName, scopedLocationName, mode));
    }

    if (action === 'BULK_APPLY') {
      if (!payload.headerId) return err(400, 'Header ID is required for bulk allocation.');
      const { headers } = await readTimesheetData();
      const header = headers.find(h => h.id === payload.headerId);
      if (!header) return err(404, 'Timesheet header not found.');
      await requireOpenPeriod(header.timesheetDate);
      requireEditableTimesheet(header);
      await handleBulkApply(request, payload);
      return ok(await buildPayload(request, header.timesheetDate, header.supervisorId, header.workCenterName, locationName, mode));
    }

    if (action === 'BOOK_OVERTIME') {
      const overtimeBooking = resolveOvertimeBookingOptions();
      if (!overtimeBooking.enabled) return err(400, 'Overtime booking is disabled in this environment.');

      const { headerId, authorizationId, otHours, employeeIds, postToPayroll } = payload;
      if (!headerId || !authorizationId || !otHours || otHours <= 0) {
        return err(400, 'Header ID, authorization ID, and overtime hours are required.');
      }

      const { headers, lines: allLines } = await readTimesheetData();
      const header = headers.find((item) => item.id === headerId);
      if (!header) return err(404, 'Timesheet header not found.');

      const retro = overtimeBooking.retroCorrection;
      if (retro) {
        if (!isTimesheetEditableStatus(header.status) && !isRetroOvertimeTimesheetStatus(header.status)) {
          return err(400, 'This timesheet cannot receive overtime corrections in its current status.');
        }
      } else {
        await requireOpenPeriod(header.timesheetDate);
        requireEditableTimesheet(header);
      }

      const projects = await readProjects();
      const currentLines = allLines.filter((line) => line.headerId === header.id);
      const authorizations = await loadOvertimeAuthorizationsForBooking(
        header,
        currentLines,
        projects.filter((project) => ['Active', 'Approved', 'Open'].includes(project.status)),
        overtimeBooking,
      );
      const auth =
        authorizations.find((item) => item.id === authorizationId) ||
        authorizations.find((item) => item.projectCode === payload.projectCode) ||
        authorizations[0];
      if (!auth) return err(404, 'No project is available for overtime booking on this timesheet.');

      const targets = employeeIds?.length
        ? currentLines.filter((line) => employeeIds.includes(line.employeeId) && line.clockIn)
        : currentLines.filter((line) => line.clockIn);
      if (!targets.length) return err(400, 'Select present employees to book approved overtime.');

      const holidayDates = await readPublicHolidayDates();
      const dayContext = dayContextFor(header.timesheetDate, holidayDates, header.shiftLabel || payload.shiftLabel);
      if (String(dayContext.shiftLabel || '').toLowerCase().includes('night')) {
        return err(400, 'Night shift is paid as normal 8-hour work plus ₦1,500 inconvenience allowance. Overtime cannot be booked for night work.');
      }
      const saveProjects = await readProjects();
      const primaryProjectCode = resolvePrimaryProjectCode(
        saveProjects.filter((project) => ['Active', 'Approved', 'Open'].includes(project.status)).map((project) => project.code),
      );

      let nextLines = [...currentLines];
      for (const line of targets) {
        const index = nextLines.findIndex((item) => item.id === line.id);
        if (index < 0) continue;
        nextLines[index] = applyOvertimeBooking(
          nextLines[index],
          auth,
          otHours,
          nextLines,
          header.workCenterName,
          overtimeBooking,
          dayContext,
          primaryProjectCode,
        );
        const validated = validateTimesheetLine(
          nextLines[index],
          authorizations,
          nextLines,
          header.workCenterName,
          overtimeBooking,
          dayContext,
        );
        if (validated.validationStatus === 'Error') {
          return err(400, validated.validationMessage || `Invalid overtime booking for ${line.employeeName}.`);
        }
        nextLines[index] = {
          ...nextLines[index],
          usedHours: validated.usedHours,
          idleHours: validated.idleHours,
          totalHours: validated.totalHours,
          variance: validated.variance,
          validationStatus: validated.validationStatus,
          validationMessage: validated.validationMessage,
        };
      }

      const preservedHeader = { ...header };
      if (retro && !isTimesheetEditableStatus(header.status)) {
        const overtimeBookedEvent: TimesheetWorkflowEvent = {
          stage: 'Supervisor',
          decision: 'Overtime Booked',
          by: actor,
          actedAt: new Date().toISOString(),
          comment: `Retroactive ${otHours}h overtime booked on ${auth.projectCode} for ${targets.length} employee(s).`,
        };
        preservedHeader.workflowHistory = [...(header.workflowHistory || []), overtimeBookedEvent];
      }

      await writeTimesheetHeaderLines(preservedHeader, nextLines.map((line) => ({
        ...line,
        idleAllocations: line.idleAllocations.map(withDefaultIdleReason),
      })));

      const shouldPost = Boolean(postToPayroll) || (retro && isTimesheetPayrollReadyStatus(header.status));
      if (shouldPost && isTimesheetPayrollReadyStatus(header.status)) {
        const payrollPostedEvent: TimesheetWorkflowEvent = {
          stage: 'Payroll',
          decision: 'Overtime Correction Posted',
          by: actor,
          actedAt: new Date().toISOString(),
          comment: `Payroll feed refreshed after ${otHours}h overtime booking on ${auth.projectCode}.`,
        };
        const payrollHeader: TimesheetHeader = {
          ...preservedHeader,
          workflowHistory: [...(preservedHeader.workflowHistory || []), payrollPostedEvent],
        };
        await writeTimesheetHeaderLines(payrollHeader, nextLines.map((line) => ({
          ...line,
          idleAllocations: line.idleAllocations.map(withDefaultIdleReason),
        })));
        await refreshTimesheetPayrollUpdatesForHeaders([header.id], actor);
      }

      return ok(await buildPayload(request, header.timesheetDate, header.supervisorId, header.workCenterName, locationName, mode));
    }

    const { headers, lines: allLines } = await readTimesheetData();

    if (action === 'SYNC_ATTENDANCE') {
      let scopedDate = date;
      let scopedSupervisorId = supervisorId;
      let scopedWorkCenterName = workCenterName;
      let scopedLocationName = locationName;
      if (isSupervisorMode) {
        const scoped = await buildPayload(request, date, undefined, workCenterName, locationName, mode);
        scopedDate = scoped.timesheetDate;
        scopedSupervisorId = supervisorId || scoped.filterOptions.supervisors[0];
        scopedLocationName = locationName || scoped.supervisorProfile?.location || scoped.filterOptions.locations[0];
        scopedWorkCenterName = workCenterName || scoped.header?.workCenterName || scoped.workCenters[0]?.name || '';
      }
      if (!scopedDate || !scopedSupervisorId || !scopedWorkCenterName) return err(400, 'Date, Supervisor ID, and Work Center Name are required.');
      await requireOpenPeriod(scopedDate);
      const existingHeader = headers.find(h => h.timesheetDate === scopedDate && h.supervisorId === scopedSupervisorId && h.workCenterName === scopedWorkCenterName);
      if (existingHeader) requireEditableTimesheet(existingHeader);
      await syncAttendanceForTimesheet(scopedDate, scopedSupervisorId, scopedWorkCenterName, scopedLocationName);
      return ok(await buildPayload(request, scopedDate, scopedSupervisorId, scopedWorkCenterName, scopedLocationName, mode));
    }

    if (action === 'MATRIX_SAVE' || action === 'SAVE_DRAFT' || action === 'SUBMIT') {
      if (!headerId || !updatedLines) return err(400, 'Header ID and Lines are required.');
      
      const header = headers.find(h => h.id === headerId);
      if (!header) return err(404, 'Timesheet header not found.');
      await requireOpenPeriod(header.timesheetDate);
      requireEditableTimesheet(header);

      // Validate gross day separately from payroll/productive hours.
      const overtimeBooking = resolveOvertimeBookingOptions();
      const saveProjects = await readProjects();
      const approvedOvertimeAuthorizations = overtimeBooking.enabled
        ? await loadOvertimeAuthorizationsForBooking(
            header,
            updatedLines,
            saveProjects.filter((project) => ['Active', 'Approved', 'Open'].includes(project.status)),
            overtimeBooking,
          )
        : [];
      const holidayDates = await readPublicHolidayDates();
      const dayContext = dayContextFor(header.timesheetDate, holidayDates, header.shiftLabel || payload.shiftLabel);
      if (payload.shiftLabel) header.shiftLabel = String(payload.shiftLabel);
      const reconciledLines = updatedLines.map(reconcileTimesheetLineHours);
      for (const line of reconciledLines) {
        const projectHours = (line.projectAllocations || []).reduce((sum, allocation) => sum + Number(allocation.hours || 0), 0);
        if (!line.clockIn && projectHours > 0.001) {
          return err(400, `Absent employee ${line.employeeName} cannot receive project/productive hours.`);
        }
        const validated = validateTimesheetLine(
          line,
          approvedOvertimeAuthorizations as OvertimeAuthorization[],
          reconciledLines,
          header.workCenterName,
          overtimeBooking,
          dayContext,
        );
        if (validated.validationStatus === 'Error') {
          return err(400, validated.validationMessage || `Invalid timesheet line for ${line.employeeName}.`);
        }
        if (Math.abs(line.usedHours + line.idleHours - line.totalHours) > 0.01) {
          return err(400, `Hours mismatch for ${line.employeeName}: Used + Idle must equal Total.`);
        }
      }

      const normalizedLines = reconciledLines.map((line) => ({
        ...line,
        idleAllocations: line.idleAllocations.map(withDefaultIdleReason),
      }));
      if (action === 'SUBMIT') {
        const projects = await readProjects();
        let projectManagerAssignment: ReturnType<typeof resolveProjectManagerForSubmission>;
        try {
          projectManagerAssignment = resolveProjectManagerForSubmission(normalizedLines, projects);
        } catch (error) {
          return err(400, error instanceof Error ? error.message : 'Unable to resolve project manager for submission.');
        }
        if (!projectManagerAssignment) return err(400, 'At least one project allocation is required before submitting this timesheet.');
        header.status = 'Submitted';
        header.submittedAt = new Date().toISOString();
        header.submittedBy = actor;
        header.projectManager = projectManagerAssignment.projectManager;
        header.projectManagerProjectCode = projectManagerAssignment.projectCode;
        header.currentApprovalStage = 'Supervisor';
        header.currentApprover = header.supervisorName;
        header.workflowHistory = [
          ...(header.workflowHistory || []),
          {
            stage: 'Supervisor',
            decision: 'Submitted',
            by: actor,
            actedAt: header.submittedAt,
            comment: payload.reviewerNote?.trim() || `Submitted for supervisor review before release to ${projectManagerAssignment.projectManager} on ${projectManagerAssignment.projectCode} - ${projectManagerAssignment.projectName}.`,
          },
        ];
      } else if (action === 'SAVE_DRAFT') {
        header.status = 'Draft';
        header.currentApprovalStage = null;
        header.currentApprover = null;
      } else {
        header.status = normalizeTimesheetStatus(header.status);
      }

      const persistCheck = validateTimesheetLinesForPersist(normalizedLines);
      if (persistCheck.issues.some((issue) => /duplicate project code/i.test(issue))) {
        return err(400, persistCheck.issues.join(' '));
      }

      await writeTimesheetHeaderLines(header, persistCheck.lines);
      if (action === 'SUBMIT') {
        void import('@/lib/timesheet-workflow-notifications')
          .then(({ notifyTimesheetStageChange }) => notifyTimesheetStageChange({
            header,
            action: 'SUBMIT',
            actor,
            comment: payload.reviewerNote,
          }))
          .catch((error) => console.warn('[Timesheet] Submit notification skipped:', error instanceof Error ? error.message : error));
      }
      return ok(await buildPayload(request, header.timesheetDate, header.supervisorId, header.workCenterName, locationName, mode));
    }

    if (action === 'APPROVE' || action === 'REJECT') {
      if (!headerId) return err(400, 'Header ID is required.');
      const header = headers.find(h => h.id === headerId);
      if (!header) return err(404, 'Timesheet header not found.');
      const uiPermissions = getUiPermissions(access);
      if (!uiPermissions.canApproveTimesheet) {
        return err(403, 'You do not have permission to approve timesheets.');
      }
      requireApprovalActionAccess(header, actor, uiPermissions.role);

      if (action === 'APPROVE') {
        await advanceTimesheetWorkflow(header.id, 'APPROVE', actor, payload.reviewerNote);
      } else {
        await advanceTimesheetWorkflow(header.id, 'REJECT', actor, payload.reviewerNote);
      }

      return ok(await buildPayload(request, header.timesheetDate, header.supervisorId, header.workCenterName, locationName, mode));
    }

    return err(400, 'Invalid action.');
  } catch (error) {
    console.error('Timesheet Action Error:', error);
    return err(500, error instanceof Error ? error.message : 'Internal Server Error');
  }
}
