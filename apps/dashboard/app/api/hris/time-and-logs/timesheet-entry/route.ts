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
  isTimesheetEditableStatus,
  isTimesheetPayrollReadyStatus,
  syncAttendanceForTimesheet,
  normalizeTimesheetStatus,
  upsertTimesheetWorkCenter,
  deactivateTimesheetWorkCenter,
  writeProjects,
  writeTimesheetData,
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
  type TimesheetRecord,
  type TimesheetStatus,
  type Project,
  type TimesheetDepartment,
  type TimesheetLocation,
  type TimesheetWorkCenter,
  type WorkflowStage,
} from '@/lib/timesheet-entry-store';
import { readBiometricDevices, type BiometricDeviceRecord } from '@/lib/biometric-attendance-store';
import { readPayrollEmployees } from '@/lib/payroll-employee-source';
import type { StructureInsight } from '@/lib/organization-data';

type TimesheetPayload = {
  generatedAt: string;
  timesheetDate: string;
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
  projectManagers: Array<{
    employeeId: string;
    employeeCode: string;
    fullName: string;
    jobTitle: string;
    department: string;
    location: string;
    status: string;
  }>;
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
    supervisors: string[];
    shifts: string[];
    businessUnits: string[];
    modes: TimesheetEntryMode[];
    statuses: TimesheetStatus[];
    supervisorDirectory: Array<{ value: string; label: string; employeeCode: string; fullName: string; employeeCount: number }>;
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
    | 'UPSERT_WORK_CENTER'
    | 'DELETE_WORK_CENTER'
    | 'COPY_PREVIOUS_DAY'
    | 'BULK_APPLY';
  date?: string;
  supervisorId?: string;
  locationName?: string;
  workCenterName?: string;
  headerId?: string;
  lines?: TimesheetLine[];
  reviewerNote?: string;
  project?: Omit<Project, 'id'>;
  workCenter?: Partial<TimesheetWorkCenter> & { name: string };
  bulkAllocation?: {
    employeeIds: string[];
    projectCode: string;
    hours: number;
  };
};

async function handleBulkApply(request: Request, payload: UpdatePayload) {
  if (!payload.bulkAllocation || !payload.headerId) {
    throw new Error('Bulk allocation details and header ID are required.');
  }
  const { employeeIds, projectCode, hours } = payload.bulkAllocation;
  const { headers, lines: allLines } = await readTimesheetData();
  
  const header = headers.find(h => h.id === payload.headerId);
  if (!header) throw new Error('Header not found');

  const otherLines = allLines.filter(l => l.headerId !== header.id);
  const currentLines = allLines.filter(l => l.headerId === header.id);

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

    const usedHours = round1(allocations.reduce((sum, p) => sum + p.hours, 0));
    const totalHours = round1(usedHours + line.idleHours);

    return {
      ...line,
      projectAllocations: allocations,
      idleAllocations: line.idleAllocations.map(withDefaultIdleReason),
      usedHours,
      totalHours,
      variance: round1(totalHours - GROSS_TIMESHEET_HOURS),
      validationStatus: usedHours > STANDARD_TIMESHEET_HOURS || totalHours > GROSS_TIMESHEET_HOURS ? 'Error' : (totalHours === GROSS_TIMESHEET_HOURS && usedHours === STANDARD_TIMESHEET_HOURS ? 'Valid' : 'Incomplete'),
    } as TimesheetLine;
  });

  await writeTimesheetData({ headers, lines: [...otherLines, ...updatedLines] });
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
  const otherLines = allLines.filter(l => l.headerId !== currentHeader!.id);

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

  await writeTimesheetData({ headers, lines: [...otherLines, ...updatedLines] });
  return currentHeader;
}

const ok = <T,>(data: T, status = 200) => NextResponse.json({ status: 'success', data }, { status });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });
const round1 = (value: number) => Math.round(value * 10) / 10;
const GROSS_TIMESHEET_HOURS = STANDARD_TIMESHEET_HOURS + DAILY_BREAK_HOURS;
const clean = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
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

const normalizeLineForGrossDay = (line: TimesheetLine): TimesheetLine => {
  const usedHours = round1(line.projectAllocations.reduce((sum, item) => sum + Number(item.hours || 0), 0));
  const idleHours = round1((line.idleAllocations || []).reduce((sum, item) => sum + Number(item.hours || 0), 0));
  const totalHours = round1(usedHours + idleHours);
  const variance = round1(totalHours - GROSS_TIMESHEET_HOURS);
  const validationStatus =
    usedHours > STANDARD_TIMESHEET_HOURS + 0.001 || totalHours > GROSS_TIMESHEET_HOURS + 0.001
      ? 'Error'
      : totalHours === GROSS_TIMESHEET_HOURS && usedHours === STANDARD_TIMESHEET_HOURS
        ? 'Valid'
        : line.validationStatus === 'Warning'
          ? 'Warning'
          : 'Incomplete';
  const validationMessage =
    validationStatus === 'Valid'
      ? null
      : validationStatus === 'Error'
        ? usedHours > STANDARD_TIMESHEET_HOURS + 0.001
          ? `Productive/payroll hours cannot exceed ${STANDARD_TIMESHEET_HOURS} hours per day.`
          : `Total timesheet hours cannot exceed ${GROSS_TIMESHEET_HOURS} hours including break time.`
        : line.validationMessage;
  return { ...line, idleAllocations: line.idleAllocations.map(withDefaultIdleReason), usedHours, idleHours, totalHours, variance, validationStatus, validationMessage };
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
  location: employee.location || employee.workLocation || employee.officeLocation,
  status: employee.status,
});
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

const buildPayload = async (request: Request, date?: string, supervisorId?: string, workCenterName?: string, locationName?: string): Promise<TimesheetPayload> => {
  const access = resolveAccessContext(request);
  const uiPermissions = getUiPermissions(access);
  const { headers, lines: allLines } = await readTimesheetData();
  const [departments, locations] = await Promise.all([
    readSystemTimesheetDepartments(),
    readSystemTimesheetLocations(),
  ]);
  const workCenters = await readTimesheetWorkCenters();
  const projects = await readProjects();
  const nextProjectCode = await generateProjectCode();
  const biometricDevices = await readBiometricDevices();
  const employees = (await readPayrollEmployees()).employees;
  const activeEmployees = employees.filter((employee) => !['Resigned', 'Terminated', 'Retired'].includes(employee.status));
  const projectManagers = activeEmployees
    .map((employee) => ({
      employeeId: employee.employeeId,
      employeeCode: employee.employeeCode,
      fullName: employee.fullName,
      jobTitle: employee.jobTitle,
      department: employee.department,
      location: employee.location || employee.workLocation || employee.officeLocation,
      status: employee.status,
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  const targetDate = date || todayDateInputValue();
  const targetSupervisor = supervisorId || access.actor;
  const targetWorkCenter = workCenterName?.trim();
  const targetLocation = locationName?.trim();
  const period = await readTimesheetPeriod(new Date(targetDate));
  const employeesBySupervisor = new Map<string, typeof activeEmployees>();
  for (const employee of activeEmployees) {
    const keys = [employee.managerName].map(clean).filter(Boolean);
    for (const key of keys) {
      const existing = employeesBySupervisor.get(key) || [];
      existing.push(employee);
      employeesBySupervisor.set(key, existing);
    }
  }
  const supervisorDirectory = Array.from(employeesBySupervisor.entries())
    .map(([manager, directReports]) => {
      const employeeCount = new Set(directReports.map((item) => item.employeeCode)).size;
      return {
        value: manager,
        label: `${manager}${employeeCount ? ` (${employeeCount})` : ''}`,
        employeeCode: manager.split(' - ')[0] || manager,
        fullName: manager.includes(' - ') ? manager.split(' - ').slice(1).join(' - ') : manager,
        employeeCount,
      };
    })
    .filter((item) => item.employeeCount > 0)
    .sort((a, b) => a.label.localeCompare(b.label));
  const selectedSupervisorProfile = activeEmployees.find((employee) => supervisorMatchesSelection(employee, targetSupervisor));
  const selectedSupervisorDirectReports = activeEmployees
    .filter((employee) => managerMatches(employee, targetSupervisor))
    .filter((employee) => employeeMatchesLocation(employee, targetLocation));
  const selectedSupervisorWorkCenterReports = targetWorkCenter
    ? selectedSupervisorDirectReports.filter((employee) => employeeMatchesWorkCenter(employee, targetWorkCenter))
    : [];
  const selectedSupervisorEmployees = (selectedSupervisorWorkCenterReports.length ? selectedSupervisorWorkCenterReports : selectedSupervisorDirectReports)
    .map((employee) => ({
      employeeId: employee.employeeId,
      employeeCode: employee.employeeCode,
      fullName: employee.fullName,
      jobTitle: employee.jobTitle,
      department: employee.department,
      location: employeeLocation(employee),
      managerEmployeeCode: null,
      managerName: clean(employee.managerName) || null,
      status: employee.status,
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
  const attendanceWorkCenters = workCenters.map((workCenter) => ({
    location: workCenter.location || workCenter.name,
    site: workCenter.site || workCenter.location || workCenter.name,
    deviceName: workCenter.name,
  }));

  let header =
    (targetWorkCenter
      ? headers.find((h) => h.timesheetDate === targetDate && h.supervisorId === targetSupervisor && h.workCenterName === targetWorkCenter)
      : headers.find((h) => h.timesheetDate === targetDate && h.supervisorId === targetSupervisor)) ||
    null;
  const selectedEmployeeKeys = new Set(selectedSupervisorEmployees.flatMap((employee) => matchKeys(employee.employeeCode, employee.fullName)).filter(Boolean));
  let lines = header
    ? allLines
        .filter((l) => l.headerId === header.id)
        .map(normalizeLineForGrossDay)
        .filter((line) => selectedEmployeeKeys.size === 0 || matchKeys(line.employeeNo, line.employeeId, line.employeeName).some((key) => selectedEmployeeKeys.has(key)))
    : [];

  if ((!header || lines.length === 0) && targetSupervisor && targetWorkCenter) {
    try {
      const preview = await syncAttendanceForTimesheet(targetDate, targetSupervisor, targetWorkCenter, targetLocation, { persist: period.status === 'Open' });
      header = preview.header;
      lines = preview.lines
        .map(normalizeLineForGrossDay)
        .filter((line) => selectedEmployeeKeys.size === 0 || matchKeys(line.employeeNo, line.employeeId, line.employeeName).some((key) => selectedEmployeeKeys.has(key)));
    } catch (error) {
      console.warn('Timesheet attendance preview could not be loaded:', error);
    }
  }

  const activeProjects = projects.filter(p => ['Active', 'Approved', 'Open'].includes(p.status));

  const summary = {
    totalEmployees: lines.length,
    presentEmployees: lines.filter((l) => l.clockIn).length,
    absentEmployees: lines.filter((l) => !l.clockIn).length,
    onLeaveEmployees: lines.filter((l) => l.idleAllocations.some((item) => item.reasonName.toLowerCase().includes('leave'))).length,
    sickEmployees: 0,
    notSyncedEmployees: 0,
    bookedHours: round1(lines.reduce((sum, l) => sum + normalizePaidWorkHours(l.totalHours), 0)),
    usedHours: round1(lines.reduce((sum, l) => sum + normalizePaidWorkHours(l.usedHours), 0)),
    idleHours: round1(lines.reduce((sum, l) => sum + l.idleHours, 0)),
    productivityPct: lines.reduce((sum, l) => sum + normalizePaidWorkHours(l.totalHours), 0) > 0 
      ? round1((lines.reduce((sum, l) => sum + normalizePaidWorkHours(l.usedHours), 0) / lines.reduce((sum, l) => sum + normalizePaidWorkHours(l.totalHours), 0)) * 100)
      : 0,
    pendingApprovals: headers.filter((h) => ['Submitted', 'Project_Manager_Reviewed', 'Cost_Control_Reviewed'].includes(h.status)).length,
  };

  return {
    generatedAt: new Date().toISOString(),
    timesheetDate: targetDate,
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
    permissions: {
      actor: uiPermissions.actor,
      role: uiPermissions.role,
      canEdit: uiPermissions.canEditAttendance,
      canExport: true,
      canApprove: uiPermissions.canApproveTimesheet || uiPermissions.role === 'OrganizationAdmin',
      canManagePeriod: uiPermissions.canManageTimesheetPeriods || uiPermissions.role === 'OrganizationAdmin',
      canViewCosts: true,
      canViewAudit: uiPermissions.canViewAudit,
    },
    summary,
    filterOptions: {
      departments: departments.map((department) => department.name),
      projects: activeProjects.map(p => p.code),
      locations: locations.map((location) => location.name),
      supervisors: Array.from(new Set([targetSupervisor, uiPermissions.actor, ...supervisorDirectory.map((item) => item.value)].map(clean).filter(Boolean))).sort((a, b) => {
        const aLabel = supervisorDirectory.find((item) => item.value === a)?.label || a;
        const bLabel = supervisorDirectory.find((item) => item.value === b)?.label || b;
        return aLabel.localeCompare(bLabel);
      }),
      shifts: [],
      businessUnits: [],
      modes: ['Supervisor Entry'],
      statuses: ['Draft', 'Submitted', 'Project_Manager_Reviewed', 'Cost_Control_Reviewed', 'HR_Acknowledged', 'Rejected', 'Returned', 'Locked'],
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
    throw new Error(`This timesheet is currently ${status.replace(/_/g, ' ')} and cannot be edited unless it is returned or rejected.`);
  }
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date') || undefined;
  const supervisorId = searchParams.get('supervisorId') || undefined;
  const locationName = searchParams.get('locationName') || undefined;
  const workCenterName = searchParams.get('workCenterName') || undefined;
  return ok(await buildPayload(request, date, supervisorId, workCenterName, locationName));
}

export async function PATCH(request: Request) {
  const access = resolveAccessContext(request);
  const payload = (await request.json()) as UpdatePayload;
  const { action, date, supervisorId, locationName, workCenterName, headerId, lines: updatedLines } = payload;

  try {
    if (action === 'CREATE_PROJECT') {
      if (!payload.project) return err(400, 'Project details are required.');
      const projectCode = payload.project.code?.trim();
      if (!projectCode) return err(400, 'Project code is required.');
      if (!payload.project.projectManager?.trim()) return err(400, 'Project Manager is required.');
      const projects = await readProjects();
      if (projects.some((project) => project.code.toLowerCase() === projectCode.toLowerCase())) {
        return err(409, `Project code ${projectCode} already exists.`);
      }
      const newProject: Project = {
        ...payload.project,
        code: projectCode,
        projectManager: payload.project.projectManager.trim(),
        id: `prj-${Date.now()}`,
      };
      projects.push(newProject);
      await writeProjects(projects);
      return ok(await buildPayload(request, date, supervisorId, workCenterName, locationName));
    }

    if (action === 'UPSERT_WORK_CENTER') {
      if (!payload.workCenter?.name?.trim()) return err(400, 'Work center name is required.');
      await upsertTimesheetWorkCenter(payload.workCenter);
      return ok(await buildPayload(request, date, supervisorId, payload.workCenter.name, locationName));
    }

    if (action === 'DELETE_WORK_CENTER') {
      if (!payload.workCenter?.id) return err(400, 'Work center ID is required.');
      await deactivateTimesheetWorkCenter(payload.workCenter.id);
      return ok(await buildPayload(request, date, supervisorId, workCenterName, locationName));
    }

    if (action === 'COPY_PREVIOUS_DAY') {
      if (!date || !supervisorId || !workCenterName) return err(400, 'Date, supervisor, and work center are required for copy.');
      await requireOpenPeriod(date);
      const { headers } = await readTimesheetData();
      const currentHeader = headers.find(h => h.timesheetDate === date && h.supervisorId === supervisorId && h.workCenterName === workCenterName);
      if (currentHeader) requireEditableTimesheet(currentHeader);
      await handleCopyPreviousDay(request, date, supervisorId, workCenterName);
      return ok(await buildPayload(request, date, supervisorId, workCenterName, locationName));
    }

    if (action === 'BULK_APPLY') {
      if (!payload.headerId) return err(400, 'Header ID is required for bulk allocation.');
      const { headers } = await readTimesheetData();
      const header = headers.find(h => h.id === payload.headerId);
      if (!header) return err(404, 'Timesheet header not found.');
      await requireOpenPeriod(header.timesheetDate);
      requireEditableTimesheet(header);
      await handleBulkApply(request, payload);
      return ok(await buildPayload(request, header.timesheetDate, header.supervisorId, header.workCenterName, locationName));
    }

    const { headers, lines: allLines } = await readTimesheetData();

    if (action === 'SYNC_ATTENDANCE') {
      if (!date || !supervisorId || !workCenterName) return err(400, 'Date, Supervisor ID, and Work Center Name are required.');
      await requireOpenPeriod(date);
      const existingHeader = headers.find(h => h.timesheetDate === date && h.supervisorId === supervisorId && h.workCenterName === workCenterName);
      if (existingHeader) requireEditableTimesheet(existingHeader);
      await syncAttendanceForTimesheet(date, supervisorId, workCenterName, locationName);
      return ok(await buildPayload(request, date, supervisorId, workCenterName, locationName));
    }

    if (action === 'MATRIX_SAVE' || action === 'SAVE_DRAFT' || action === 'SUBMIT') {
      if (!headerId || !updatedLines) return err(400, 'Header ID and Lines are required.');
      
      const header = headers.find(h => h.id === headerId);
      if (!header) return err(404, 'Timesheet header not found.');
      await requireOpenPeriod(header.timesheetDate);
      requireEditableTimesheet(header);

      // Validate gross day separately from payroll/productive hours.
      for (const line of updatedLines) {
        if (line.usedHours > STANDARD_TIMESHEET_HOURS + 0.001) {
          return err(400, `Productive/payroll hours for ${line.employeeName} cannot exceed ${STANDARD_TIMESHEET_HOURS} hours.`);
        }
        if (line.totalHours > GROSS_TIMESHEET_HOURS + 0.001) {
          return err(400, `Total timesheet hours for ${line.employeeName} cannot exceed ${GROSS_TIMESHEET_HOURS} hours including break time.`);
        }
        if (Math.abs(line.usedHours + line.idleHours - line.totalHours) > 0.01) {
          return err(400, `Hours mismatch for ${line.employeeName}: Used + Idle must equal Total.`);
        }
      }

      const normalizedLines = updatedLines.map((line) => ({
        ...line,
        idleAllocations: line.idleAllocations.map(withDefaultIdleReason),
      }));
      const otherLines = allLines.filter(l => l.headerId !== headerId);
      
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
        header.submittedBy = access.actor;
        header.projectManager = projectManagerAssignment.projectManager;
        header.projectManagerProjectCode = projectManagerAssignment.projectCode;
        header.currentApprovalStage = 'Project Manager';
        header.currentApprover = projectManagerAssignment.projectManager;
        header.workflowHistory = [
          ...(header.workflowHistory || []),
          {
            stage: 'Supervisor',
            decision: 'Submitted',
            by: access.actor,
            actedAt: header.submittedAt,
            comment: payload.reviewerNote?.trim() || `Submitted to ${projectManagerAssignment.projectManager} for Project Manager review on ${projectManagerAssignment.projectCode} - ${projectManagerAssignment.projectName}.`,
          },
        ];
      } else {
        header.status = 'Draft';
        header.currentApprovalStage = null;
        header.currentApprover = null;
      }

      await writeTimesheetData({ headers, lines: [...otherLines, ...normalizedLines] });
      return ok(await buildPayload(request, header.timesheetDate, header.supervisorId, header.workCenterName, locationName));
    }

    if (action === 'APPROVE' || action === 'REJECT') {
      if (!headerId) return err(400, 'Header ID is required.');
      const header = headers.find(h => h.id === headerId);
      if (!header) return err(404, 'Timesheet header not found.');

      if (action === 'APPROVE') {
        await advanceTimesheetWorkflow(header.id, 'APPROVE', access.actor, payload.reviewerNote);
      } else {
        await advanceTimesheetWorkflow(header.id, 'REJECT', access.actor, payload.reviewerNote);
      }

      return ok(await buildPayload(request, header.timesheetDate, header.supervisorId, header.workCenterName, locationName));
    }

    return err(400, 'Invalid action.');
  } catch (error) {
    console.error('Timesheet Action Error:', error);
    return err(500, error instanceof Error ? error.message : 'Internal Server Error');
  }
}
