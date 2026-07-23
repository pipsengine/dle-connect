import { NextResponse } from 'next/server';
import { permissionsForRequest } from '@/lib/auth/request-permissions';
import { getUiPermissions, hasAccTimesheetStageApprove, permissionsFromRequest, resolveAccessContext } from '@/lib/hris-access';
import {
  aggregateEmployeeAttendanceForHeaders,
  advanceProjectTimesheetApproval,
  advanceTimesheetWorkflow,
  buildProjectTimesheetApprovals,
  calculateTimesheetPeriod,
  isTimesheetCountableForPayroll,
  normalizePaidWorkHours,
  normalizeTimesheetStatus,
  readProjects,
  invalidateTimesheetApprovalWorkspaceCache,
  readTimesheetApprovalPage,
  readTimesheetApprovalData,
  readTimesheetApprovalWorkspaceStats,
  readTimesheetData,
  readTimesheetDraftBookedHeaders,
  readTimesheetPayrollUpdates,
  readTimesheetPeriods,
  writeTimesheetPayrollUpdates,
  writeTimesheetHeaderLines,
  type TimesheetHeader,
  type TimesheetLine,
  type TimesheetPeriod,
  type TimesheetStatus,
  type TimesheetWorkflowStage,
  type TimesheetApprovalListMode,
} from '@/lib/timesheet-entry-store';
import { describeDleEnterpriseDatabase, invalidateTimesheetApprovalEmployeeMetaCache, readTimesheetApprovalEmployeeMeta, type TimesheetApprovalEmployeeMeta } from '@/lib/dle-enterprise-db';

const ok = <T,>(data: T, status = 200) => NextResponse.json({ status: 'success', data }, { status });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });
const round = (value: number, dp = 1) => Math.round(value * (10 ** dp)) / (10 ** dp);
const lower = (value: unknown) => String(value || '').trim().toLowerCase();
const includesAny = (value: string, terms: string[]) => terms.some((term) => value.includes(term));
const isSuperAdministrator = (role: string) => /\bsuper\b.*\badmin/i.test(role) || ['organizationadmin', 'hrbusinesspartner'].includes(lower(role));

type ApprovalAction = 'APPROVE' | 'REJECT' | 'RETURN' | 'PROCESS_PAYROLL' | 'POST_PAYROLL';
type ProjectApprovalStage = 'Supervisor' | 'Project Manager' | 'Cost Control' | 'GM Operations' | 'HR' | 'Payroll';
type BulkMode = 'HEADER' | 'PROJECT';
const activeApprovalStatuses = new Set<TimesheetStatus>([
  'Submitted',
  'Supervisor_Reviewed',
  'Project_Manager_Reviewed',
  'Cost_Control_Reviewed',
  'GM_Operations_Reviewed',
  'HR_Acknowledged',
]);

export const maxDuration = 120;

const resolvePeriod = (periods: TimesheetPeriod[], dateStr: string): TimesheetPeriod => {
  const calculated = calculateTimesheetPeriod(new Date(dateStr));
  const stored = periods.find((period) => period.id === calculated.id);
  if (stored) {
    return { ...calculated, ...stored, startDate: calculated.startDate, endDate: calculated.endDate, name: calculated.name };
  }
  return calculated;
};


const statusLabel = (status: TimesheetStatus) => normalizeTimesheetStatus(status).replace(/_/g, ' ');

const currentStageForStatus = (status: TimesheetStatus): TimesheetWorkflowStage | 'Payroll Processing' | 'Payroll Posted' | null => {
  const normalized = normalizeTimesheetStatus(status);
  if (normalized === 'Submitted') return 'Supervisor';
  if (normalized === 'Supervisor_Reviewed') return 'Project Manager';
  if (normalized === 'Project_Manager_Reviewed') return 'Cost Control';
  if (normalized === 'Cost_Control_Reviewed') return 'GM Operations';
  if (normalized === 'GM_Operations_Reviewed') return 'HR';
  if (normalized === 'HR_Acknowledged') return 'Payroll Processing';
  if (normalized === 'Locked') return 'Payroll Posted';
  return null;
};

const nextActionLabel = (status: TimesheetStatus) => {
  const stage = currentStageForStatus(status);
  if (stage === 'Supervisor') return 'Supervisor Review';
  if (stage === 'Project Manager') return 'Project Approve';
  if (stage === 'Cost Control') return 'Cost Approve';
  if (stage === 'GM Operations') return 'GM Operations Approve';
  if (stage === 'HR') return 'HR Approve';
  if (stage === 'Payroll Processing') return 'Process Payroll';
  return null;
};

const roleScope = (role: string, actor: string, request?: Request) => {
  if (request?.headers.get('x-auth-global-admin') === '1') return 'enterprise';
  const text = lower(`${role} ${actor}`);
  if (isSuperAdministrator(role) || includesAny(text, ['admin', 'hr', 'human resources', 'payroll', 'gm operations', 'general manager', 'operations'])) return 'enterprise';
  if (includesAny(text, ['cost control', 'cost controller', 'finance'])) return 'cost-control';
  if (includesAny(text, ['project manager', 'pm '])) return 'project-manager';
  if (includesAny(text, ['supervisor', 'foreman', 'site lead'])) return 'supervisor';
  return 'restricted';
};

const headerMatchesListMode = (status: TimesheetStatus, mode: TimesheetApprovalListMode) => {
  const normalized = normalizeTimesheetStatus(status);
  if (normalized === 'Draft') return false;
  if (mode === 'pending') return activeApprovalStatuses.has(normalized);
  if (mode === 'history') return !activeApprovalStatuses.has(normalized);
  return true;
};

const stageAccess = (stage: ProjectApprovalStage | null, actor: string, role: string, request?: Request, acc?: string[]) => {
  if (isSuperAdministrator(role)) return true;
  const accPerms = acc ?? (request ? permissionsFromRequest(request) : []);
  if (stage && hasAccTimesheetStageApprove(accPerms, stage)) return true;
  const text = lower(`${actor} ${role}`);
  if (stage === 'Supervisor') return includesAny(text, ['supervisor', 'foreman', 'site lead']);
  if (stage === 'Cost Control') return includesAny(text, ['cost control', 'cost controller', 'finance', 'cost']);
  if (stage === 'Project Manager') return includesAny(text, ['project manager', 'pm ']);
  if (stage === 'GM Operations') return includesAny(text, ['gm operations', 'general manager', 'gm ', 'operations']);
  if (stage === 'HR') return includesAny(text, ['hr', 'human resources']);
  if (stage === 'Payroll') return includesAny(text, ['payroll']);
  return false;
};

const requireHeaderStageAccess = (header: TimesheetHeader, action: ApprovalAction, actor: string, role: string, request?: Request, acc?: string[]) => {
  if (isSuperAdministrator(role)) return;
  const stage = currentStageForStatus(header.status);
  const actorRole = lower(`${actor} ${role}`);
  const supervisorText = lower(header.supervisorName || header.supervisorId || '');

  if (action === 'PROCESS_PAYROLL' || action === 'POST_PAYROLL') {
    if (!stageAccess('Payroll', actor, role, request, acc) && !includesAny(actorRole, ['payroll', 'hr', 'human resources'])) {
      throw new Error('Only HR or Payroll can process payroll-ready timesheets.');
    }
    return;
  }
  if (stage === 'Payroll Processing') {
    if (!stageAccess('Payroll', actor, role, request, acc) && !includesAny(actorRole, ['payroll', 'hr', 'human resources'])) {
      throw new Error('Only HR or Payroll can return or reject payroll-ready timesheets.');
    }
    return;
  }

  if (stage === 'Supervisor') {
    const isAssignedSupervisor = supervisorText && (supervisorText.includes(lower(actor)) || lower(actor).includes(supervisorText));
    if (!isAssignedSupervisor && !stageAccess('Supervisor', actor, role, request, acc)) throw new Error('Only the assigned supervisor can complete supervisor review.');
    return;
  }
  if (stage === 'GM Operations') {
    if (!stageAccess('GM Operations', actor, role, request, acc)) throw new Error('Only GM Operations can approve the consolidated timesheet pack.');
    return;
  }
  if (stage === 'HR') {
    if (!stageAccess('HR', actor, role, request, acc)) throw new Error('Only HR can approve consolidated project timesheets.');
    return;
  }
  throw new Error('This workflow stage requires project-level approval or a different role owner.');
};

const requireProjectStageAccess = (stage: ProjectApprovalStage, actor: string, role: string, request?: Request, acc?: string[]) => {
  if (isSuperAdministrator(role)) return;
  if (stage !== 'Cost Control' && stage !== 'Project Manager') return;
  if (!stageAccess(stage, actor, role, request, acc)) throw new Error(`Only ${stage} can perform this project-level approval.`);
};

const employeeMeta = (lookup: Map<string, TimesheetApprovalEmployeeMeta>, line: TimesheetLine) => {
  const match =
    lookup.get(lower(line.employeeNo)) ||
    lookup.get(lower(line.employeeId)) ||
    lookup.get(lower(line.employeeName));
  return {
    department: match?.department || 'Unassigned',
    businessUnit: match?.businessUnit || match?.payrollGroup || 'DLE',
    employmentType: match?.employmentType || 'Unassigned',
    category: match?.salaryGrade || match?.employmentType || 'Unassigned',
    costCenter: match?.costCenter || match?.department || 'Unassigned',
    location: match?.location || 'Unassigned',
    labourRate: Number(match?.ratePerHour || (match?.ratePerDay ? Number(match.ratePerDay) / 8 : 0) || 2500),
  };
};

const workflowSteps = (header: TimesheetHeader) => {
  const history = header.workflowHistory || [];
  return ([
    { id: 'Submitted', stage: 'Supervisor', owner: header.supervisorName, slaHours: 12 },
    { id: 'Supervisor_Reviewed', stage: 'Project Manager', owner: header.projectManager || 'Project Managers', slaHours: 24 },
    { id: 'Project_Manager_Reviewed', stage: 'Cost Control', owner: 'Cost Control', slaHours: 12 },
    { id: 'Cost_Control_Reviewed', stage: 'GM Operations', owner: 'GM Operations', slaHours: 24 },
    { id: 'GM_Operations_Reviewed', stage: 'HR', owner: 'HR', slaHours: 12 },
    { id: 'HR_Acknowledged', stage: 'Payroll Processing', owner: 'Payroll', slaHours: 24 },
    { id: 'Locked', stage: 'Payroll Posted', owner: 'Payroll', slaHours: 24 },
  ] as const).map((step) => {
    const eventStage = step.stage === 'Payroll Processing' || step.stage === 'Payroll Posted' ? 'HR' : step.stage;
    const event = [...history].reverse().find((item) => item.stage === eventStage);
    const actedAt = event?.actedAt || null;
    const ageSource = actedAt || header.submittedAt || header.timesheetDate;
    const agingHours = Math.max(0, round((Date.now() - new Date(ageSource).getTime()) / 36e5, 1));
    const current = currentStageForStatus(header.status) === step.stage;
    return {
      id: step.id,
      stage: step.stage,
      owner: step.owner,
      status: normalizeTimesheetStatus(header.status) === step.id || current ? 'Current' : event ? event.decision : 'Pending',
      by: event?.by || null,
      actedAt,
      comment: event?.comment || null,
      agingHours: current ? agingHours : 0,
      slaStatus: current && agingHours > step.slaHours ? 'Breached' : current && agingHours > step.slaHours * 0.75 ? 'At Risk' : 'On Track',
    };
  });
};

const canSeeHeader = (scope: string, header: TimesheetHeader, projectApprovals: ReturnType<typeof buildProjectTimesheetApprovals>, actor: string) => {
  if (scope === 'enterprise' || scope === 'cost-control') return true;
  const actorKey = lower(actor);
  const supervisorKeys = [header.supervisorName, header.supervisorId].map((value) => lower(value)).filter(Boolean);
  if (scope === 'supervisor') {
    return supervisorKeys.some((supervisorKey) => supervisorKey.includes(actorKey) || actorKey.includes(supervisorKey));
  }
  if (scope === 'project-manager') return projectApprovals.some((item) => lower(item.projectManager).includes(actorKey) || actorKey.includes(lower(item.projectManager)));
  return false;
};

const parseListRequest = (request: Request) => {
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get('page') || 1));
  const pageSize = Math.min(100, Math.max(10, Number(url.searchParams.get('pageSize') || 50)));
  const modeParam = String(url.searchParams.get('mode') || 'all').toLowerCase();
  const listMode: TimesheetApprovalListMode = modeParam === 'pending' || modeParam === 'history' ? modeParam : 'all';
  const status = String(url.searchParams.get('status') || '').trim() || null;
  const periodId = String(url.searchParams.get('periodId') || '').trim() || null;
  return { page, pageSize, listMode, status, periodId };
};

const statusForWorkflowStage = (stage: string | null) => {
  switch (stage) {
    case 'Supervisor':
      return 'Submitted';
    case 'Project Manager':
      return 'Supervisor_Reviewed';
    case 'Cost Control':
      return 'Project_Manager_Reviewed';
    case 'GM Operations':
      return 'Cost_Control_Reviewed';
    case 'HR':
      return 'GM_Operations_Reviewed';
    case 'Payroll Processing':
      return 'HR_Acknowledged';
    default:
      return null;
  }
};

const buildStatsFromWorkspace = (workspaceStats: Awaited<ReturnType<typeof readTimesheetApprovalWorkspaceStats>>) => {
  const statusCounts = workspaceStats.statusCounts;
  const count = (status: TimesheetStatus) => Number(statusCounts[status] || 0);
  const pendingSupervisorApproval = count('Submitted');
  const pendingProjectManagerApproval = count('Supervisor_Reviewed');
  const pendingCostControlReview = count('Project_Manager_Reviewed');
  const pendingGmOperationsApproval = count('Cost_Control_Reviewed');
  const pendingHrApproval = count('GM_Operations_Reviewed');
  const pendingPayrollProcessing = count('HR_Acknowledged');
  const payrollPosted = count('Locked');
  const returned = count('Returned');
  const rejected = count('Rejected');
  const pendingApprovals = pendingSupervisorApproval
    + pendingProjectManagerApproval
    + pendingCostControlReview
    + pendingGmOperationsApproval
    + pendingHrApproval;
  return {
    pendingSubmission: 0,
    pendingSupervisorApproval,
    pendingCostControlReview,
    pendingProjectManagerApproval,
    pendingGmOperationsApproval,
    pendingHrApproval,
    pendingPayrollProcessing,
    payrollReady: pendingPayrollProcessing,
    payrollProcessed: 0,
    payrollPosted,
    returned,
    rejected,
    totalHoursWorked: 0,
    overtimeHours: 0,
    labourCost: 0,
    projectCostAllocation: 0,
    payrollReadyHours: 0,
    pendingApprovals,
    approvalAgingHours: 0,
    workforceUtilization: 0,
    visibleTimesheets: workspaceStats.headerCount,
    awaitingApproval: workspaceStats.pendingCount,
    totalHeaders: workspaceStats.headerCount,
    totalLines: workspaceStats.lineCount,
  };
};

const buildTimesheetSummary = (
  header: TimesheetHeader,
  headerLines: TimesheetLine[],
  periods: TimesheetPeriod[],
  payrollUpdates: Awaited<ReturnType<typeof readTimesheetPayrollUpdates>>,
  projects: Awaited<ReturnType<typeof readProjects>>,
  employeeLookup: Map<string, TimesheetApprovalEmployeeMeta>,
  scope: string,
  actor: string,
) => {
  const status = normalizeTimesheetStatus(header.status);
  const period = resolvePeriod(periods, header.timesheetDate);
  const payrollUpdate = payrollUpdates.find((update) => update.headerIds.includes(header.id));
  const allProjectApprovals = buildProjectTimesheetApprovals(header, headerLines, projects);
  if (!canSeeHeader(scope, header, allProjectApprovals, actor)) return null;
  const visibleProjectApprovals = scope === 'project-manager' ? buildProjectTimesheetApprovals(header, headerLines, projects, actor) : allProjectApprovals;
  const employeeRows = headerLines.map((line) => {
    const meta = employeeMeta(employeeLookup, line);
    return {
      lineId: line.id,
      employeeId: line.employeeId,
      employeeNo: line.employeeNo,
      employeeName: line.employeeName,
      department: meta.department,
      businessUnit: meta.businessUnit,
      employmentType: meta.employmentType,
      location: meta.location,
      clockIn: line.clockIn,
      clockOut: line.clockOut,
      attendanceHours: normalizePaidWorkHours(line.attendanceDuration),
      productiveHours: normalizePaidWorkHours(line.usedHours),
      idleHours: round(line.idleHours),
      overtimeHours: Math.max(0, round(normalizePaidWorkHours(line.usedHours) - 8)),
      totalHours: normalizePaidWorkHours(line.totalHours),
      variance: round(line.variance),
      validationStatus: line.validationStatus,
      activities: line.projectAllocations.map((allocation) => ({
        projectCode: allocation.projectCode,
        projectName: allocation.projectName,
        activityCode: allocation.activityId || allocation.taskId || 'General',
        activityName: allocation.taskName || 'Timesheet Activity',
        hours: round(Number(allocation.hours || 0)),
        labourCost: round(Number(allocation.hours || 0) * meta.labourRate, 0),
        remarks: allocation.remarks,
      })),
    };
  });
  const projectBreakdowns = visibleProjectApprovals.map((project) => {
    const projectLines = headerLines.filter((line) => line.projectAllocations.some((allocation) => lower(allocation.projectCode) === lower(project.projectCode)));
    const labourCost = projectLines.reduce((sum, line) => {
      const meta = employeeMeta(employeeLookup, line);
      const hours = line.projectAllocations.filter((allocation) => lower(allocation.projectCode) === lower(project.projectCode)).reduce((h, allocation) => h + Number(allocation.hours || 0), 0);
      return sum + hours * meta.labourRate;
    }, 0);
    return {
      ...project,
      costCenter: project.projectCode,
      overtimeHours: round(projectLines.reduce((sum, line) => sum + Math.max(0, normalizePaidWorkHours(line.usedHours) - 8), 0)),
      labourCost: round(labourCost, 0),
      approvalStatus: project.projectManagerStatus !== 'Approved' ? `PM ${project.projectManagerStatus}` : `Cost ${project.costControlStatus}`,
    };
  });
  const totalHours = round(headerLines.reduce((sum, line) => sum + normalizePaidWorkHours(line.totalHours), 0));
  const productiveHours = round(headerLines.reduce((sum, line) => sum + normalizePaidWorkHours(line.usedHours), 0));
  const overtimeHours = round(headerLines.reduce((sum, line) => sum + Math.max(0, normalizePaidWorkHours(line.usedHours) - 8), 0));
  const labourCost = round(projectBreakdowns.reduce((sum, project) => sum + project.labourCost, 0), 0);
  const projectManagerApproved = allProjectApprovals.filter((item) => item.projectManagerStatus === 'Approved').length;
  const costControlApproved = allProjectApprovals.filter((item) => item.costControlStatus === 'Approved').length;
  const totalProjects = allProjectApprovals.length;
  return {
    id: header.id,
    timesheetDate: header.timesheetDate,
    supervisorName: header.supervisorName,
    workCenterName: header.workCenterName,
    status,
    statusLabel: statusLabel(status),
    currentStage: currentStageForStatus(status),
    currentOwner: header.currentApprover || String(currentStageForStatus(status) || '-'),
    nextActionLabel: nextActionLabel(status),
    payrollReady: status === 'HR_Acknowledged',
    payrollProcessed: Boolean(payrollUpdate),
    payrollPosted: status === 'Locked',
    payrollAcknowledgedAt: header.payrollAcknowledgedAt || payrollUpdate?.acknowledgedAt || null,
    payrollAcknowledgedBy: header.payrollAcknowledgedBy || payrollUpdate?.acknowledgedBy || null,
    totalEmployees: headerLines.length,
    totalHours,
    productiveHours,
    idleHours: round(headerLines.reduce((sum, line) => sum + line.idleHours, 0)),
    overtimeHours,
    labourCost,
    payrollReadyHours: status === 'HR_Acknowledged' || status === 'Locked' ? totalHours : 0,
    workforceUtilization: totalHours ? round((productiveHours / totalHours) * 100) : 0,
    submittedAt: header.submittedAt,
    lastSyncAt: header.lastSyncAt,
    periodName: period.name,
    periodId: period.id,
    periodStatus: period.status,
    workflowSteps: workflowSteps(header),
    projectApprovals: projectBreakdowns,
    employeeRows,
    approvalHistory: header.workflowHistory || [],
    projectApprovalSummary: {
      totalProjects,
      projectManagerApproved,
      costControlApproved,
      projectManagerPending: allProjectApprovals.filter((item) => item.projectManagerStatus === 'Pending').length,
      costControlPending: allProjectApprovals.filter((item) => item.costControlStatus === 'Pending').length,
      approvalText: `${projectManagerApproved}/${totalProjects} Projects Approved${totalProjects > 0 && projectManagerApproved === totalProjects ? ' (Ready for HR)' : ''}`,
      costControlText: `${costControlApproved}/${totalProjects} Cost Validated`,
      consolidatedForHr: status === 'Project_Manager_Reviewed' || status === 'HR_Acknowledged' || status === 'Locked',
    },
  };
};

const buildPayload = async (request: Request) => {
  const livePermissions = await permissionsForRequest(request);
  const access = resolveAccessContext(request, livePermissions);
  const uiPermissions = getUiPermissions(access);
  const dbMeta = describeDleEnterpriseDatabase();
  if (!dbMeta.configured) {
    throw new Error('DLE_ENTERPRISE_DB_* environment variables are not fully configured on this server.');
  }

  const { page, pageSize, listMode, status, periodId } = parseListRequest(request);
  const scope = roleScope(access.role, access.actor, request);

  const [workspaceStats, projects, payrollUpdates, periods, employeeLookup, draftBookedData] = await Promise.all([
    readTimesheetApprovalWorkspaceStats(),
    readProjects(),
    readTimesheetPayrollUpdates(),
    readTimesheetPeriods(),
    readTimesheetApprovalEmployeeMeta(),
    readTimesheetDraftBookedHeaders(),
  ]);

  const useSqlPagination = scope === 'enterprise' || scope === 'cost-control';
  let headers: TimesheetHeader[];
  let lines: TimesheetLine[];
  let total: number;

  if (useSqlPagination) {
    const pageData = await readTimesheetApprovalPage({
      mode: listMode,
      page,
      pageSize,
      status,
      periodId,
    });
    headers = pageData.headers;
    lines = pageData.lines;
    total = pageData.total;
  } else {
    const allData = await readTimesheetApprovalData();
    const visibleHeaders = allData.headers.filter((header) => {
      if (!headerMatchesListMode(header.status, listMode)) return false;
      if (status && normalizeTimesheetStatus(header.status) !== normalizeTimesheetStatus(status)) return false;
      if (periodId && header.periodId !== periodId) return false;
      const headerLines = allData.lines.filter((line) => line.headerId === header.id);
      const projectApprovals = buildProjectTimesheetApprovals(header, headerLines, projects);
      return canSeeHeader(scope, header, projectApprovals, access.actor);
    });
    total = visibleHeaders.length;
    const start = (page - 1) * pageSize;
    headers = visibleHeaders.slice(start, start + pageSize);
    const headerIds = new Set(headers.map((header) => header.id));
    lines = allData.lines.filter((line) => headerIds.has(line.headerId));
  }

  const { headers: draftHeaders, lines: draftLines } = draftBookedData;
  const draftLineByHeader = new Map<string, TimesheetLine[]>();
  for (const line of draftLines) draftLineByHeader.set(line.headerId, [...(draftLineByHeader.get(line.headerId) || []), line]);
  const draftBookedTimesheets = draftHeaders
    .map((header) => buildTimesheetSummary(header, draftLineByHeader.get(header.id) || [], periods, payrollUpdates, projects, employeeLookup, scope, access.actor))
    .filter(Boolean);

  const lineByHeader = new Map<string, TimesheetLine[]>();
  for (const line of lines) lineByHeader.set(line.headerId, [...(lineByHeader.get(line.headerId) || []), line]);

  const pageTimesheets = headers
    .map((header) => buildTimesheetSummary(header, lineByHeader.get(header.id) || [], periods, payrollUpdates, projects, employeeLookup, scope, access.actor))
    .filter(Boolean)
    .sort((a, b) => new Date(b!.timesheetDate).getTime() - new Date(a!.timesheetDate).getTime());

  const pendingTimesheets = pageTimesheets.filter((item) => activeApprovalStatuses.has(item!.status));
  const historyTimesheets = pageTimesheets.filter((item) => !activeApprovalStatuses.has(item!.status));
  const stats = {
    ...buildStatsFromWorkspace(workspaceStats),
    totalHoursWorked: round(pageTimesheets.reduce((sum, item) => sum + item!.totalHours, 0)),
    overtimeHours: round(pageTimesheets.reduce((sum, item) => sum + item!.overtimeHours, 0)),
    labourCost: round(pageTimesheets.reduce((sum, item) => sum + item!.labourCost, 0), 0),
    projectCostAllocation: round(pageTimesheets.reduce((sum, item) => sum + item!.projectApprovals.reduce((pSum, project) => pSum + project.labourCost, 0), 0), 0),
    payrollReadyHours: round(pageTimesheets.reduce((sum, item) => sum + item!.payrollReadyHours, 0)),
    workforceUtilization: round(pageTimesheets.reduce((sum, item) => sum + item!.workforceUtilization, 0) / Math.max(1, pageTimesheets.length)),
  };

  return {
    generatedAt: new Date().toISOString(),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      listMode,
    },
    dataSource: {
      system: 'DLE_Enterprise',
      database: dbMeta.database,
      host: dbMeta.host,
      connected: true,
      headerCount: workspaceStats.headerCount,
      lineCount: workspaceStats.lineCount,
      visibleTimesheetCount: total,
      awaitingApprovalCount: workspaceStats.pendingCount,
      historyTimesheetCount: workspaceStats.historyCount,
      draftBookedCount: draftBookedTimesheets.length,
      writeTarget: 'hris.TimesheetHeaders / hris.TimesheetLines / hris.TimesheetWorkflowEvents',
    },
    permissions: {
      actor: access.actor,
      role: access.role,
      visibilityScope: scope,
      canApprove: uiPermissions.canApproveTimesheet,
      canBulkApprove: uiPermissions.canApproveTimesheet && (scope === 'enterprise' || scope === 'cost-control'),
      canAcknowledgePayroll: uiPermissions.canApproveTimesheet || uiPermissions.canEditAttendance,
      canApproveAllLevels: isSuperAdministrator(access.role) || request.headers.get('x-auth-global-admin') === '1',
      canExport: true,
    },
    pendingTimesheets,
    historyTimesheets,
    allTimesheets: pageTimesheets,
    draftBookedTimesheets,
    stats,
    filterOptions: {
      workCenters: workspaceStats.filterOptions.workCenters,
      periods: workspaceStats.filterOptions.periods
        .map((id) => {
          const period = periods.find((item) => item.id === id);
          return period ? { id: period.id, label: period.name } : { id, label: id };
        })
        .sort((left, right) => left.label.localeCompare(right.label)),
      supervisors: workspaceStats.filterOptions.supervisors,
      projects: Array.from(new Set(pageTimesheets.flatMap((item) => item!.projectApprovals.map((project) => project.projectCode)))).sort(),
      projectManagers: Array.from(new Set(pageTimesheets.flatMap((item) => item!.projectApprovals.map((project) => project.projectManager)))).sort(),
      costCenters: Array.from(new Set(pageTimesheets.flatMap((item) => item!.projectApprovals.map((project) => project.costCenter)))).sort(),
      statuses: Array.from(new Set(Object.keys(workspaceStats.statusCounts))).sort(),
      workflowStages: ['Supervisor', 'Project Manager', 'Cost Control', 'GM Operations', 'HR', 'Payroll Processing', 'Payroll Posted'],
    },
    audit: {
      generatedBy: access.actor,
      generatedAt: new Date().toISOString(),
      sourceModule: 'Timesheet Approval Workspace',
      actionHistory: 'View, approval, return, rejection, payroll process, payroll post and export actions are recorded in workflow history.',
    },
  };
};

const processPayrollBatch = async (headerIds: string[], actor: string, post: boolean) => {
  const uniqueHeaderIds = Array.from(new Set(headerIds.filter(Boolean)));
  if (!uniqueHeaderIds.length) return { processed: 0 };

  const [{ headers, lines }, periods] = await Promise.all([readTimesheetData(), readTimesheetPeriods()]);
  let updates = await readTimesheetPayrollUpdates();
  const touchedHeaders: TimesheetHeader[] = [];

  const groupedByPeriod = new Map<string, string[]>();
  for (const headerId of uniqueHeaderIds) {
    const header = headers.find((item) => item.id === headerId);
    if (!header) throw new Error(`Timesheet ${headerId} was not found.`);
    const status = normalizeTimesheetStatus(header.status);
    if (status !== 'HR_Acknowledged' && status !== 'Locked') {
      throw new Error(`Timesheet ${header.workCenterName || headerId} is not payroll-ready.`);
    }
    const bucket = groupedByPeriod.get(header.periodId) || [];
    bucket.push(headerId);
    groupedByPeriod.set(header.periodId, bucket);
  }

  for (const [periodId, periodHeaderIds] of groupedByPeriod) {
    const sampleHeader = headers.find((item) => item.id === periodHeaderIds[0]);
    if (!sampleHeader) continue;
    const existingPeriodUpdate = updates.find((update) => update.periodId === periodId);
    const mergedHeaderIds = Array.from(new Set([...(existingPeriodUpdate?.headerIds || []), ...periodHeaderIds]));
    const allPeriodHeaderIds = headers
      .filter((item) => item.periodId === periodId && isTimesheetCountableForPayroll(item.status))
      .map((item) => item.id);
    const totals = aggregateEmployeeAttendanceForHeaders(headers, lines, {
      headerIds: allPeriodHeaderIds,
      payrollReadyOnly: false,
    });

    const period = resolvePeriod(periods, sampleHeader.timesheetDate);
    updates = [
      {
        id: existingPeriodUpdate?.id || `payroll-${periodId}-${Date.now()}`,
        periodId,
        periodName: period.name,
        acknowledgedAt: new Date().toISOString(),
        acknowledgedBy: actor,
        headerIds: mergedHeaderIds,
        employeeAttendance: Array.from(totals.values()).map((item) => ({
          employeeId: item.employeeId,
          employeeName: item.employeeName,
          daysWorked: item.daysWorked,
          attendanceHours: item.attendanceHours,
          bookedHours: item.bookedHours,
          idleHours: item.idleHours,
        })).sort((a, b) => a.employeeName.localeCompare(b.employeeName)),
      },
      ...updates.filter((update) => update.periodId !== periodId),
    ];
  }

  for (const headerId of uniqueHeaderIds) {
    const header = headers.find((item) => item.id === headerId);
    if (!header) continue;
    if (post) header.status = 'Locked';
    header.currentApprovalStage = null;
    header.currentApprover = null;
    header.workflowHistory = [
      ...(header.workflowHistory || []),
      {
        stage: 'HR',
        decision: post ? 'Approved' : 'Acknowledged',
        by: actor,
        actedAt: new Date().toISOString(),
        comment: post ? 'Payroll posted and timesheet locked.' : 'Payroll processing completed for this timesheet.',
      },
    ];
    touchedHeaders.push(header);
  }

  await writeTimesheetPayrollUpdates(updates);
  for (const header of touchedHeaders) {
    await writeTimesheetHeaderLines(header, lines.filter((line) => line.headerId === header.id));
  }

  if (post && touchedHeaders.length) {
    void import('@/lib/timesheet-workflow-notifications')
      .then(({ notifyTimesheetStageChange }) => Promise.all(
        touchedHeaders.map((header) => notifyTimesheetStageChange({
          header,
          action: 'LOCK',
          actor,
        })),
      ))
      .catch((error) => console.warn('[Timesheet] Lock notification skipped:', error instanceof Error ? error.message : error));
  }

  return { processed: touchedHeaders.length };
};

export async function GET(request: Request) {
  try {
    return ok(await buildPayload(request));
  } catch (error) {
    console.error('Approval API Error:', error);
    return err(500, error instanceof Error ? error.message : 'Internal Server Error');
  }
}

const invalidateApprovalCaches = () => {
  invalidateTimesheetApprovalWorkspaceCache();
  invalidateTimesheetApprovalEmployeeMetaCache();
};

export async function PATCH(request: Request) {
  const livePermissions = await permissionsForRequest(request);
  const access = resolveAccessContext(request, livePermissions);
  const permissions = getUiPermissions(access);
  if (!permissions.canApproveTimesheet) return err(403, 'You do not have permission to approve timesheets.');

  try {
    const payload = await request.json() as {
      action?: ApprovalAction;
      headerId?: string;
      headerIds?: string[];
      projectCode?: string;
      projectSegments?: Array<{ headerId: string; projectCode: string; stage: ProjectApprovalStage }>;
      stage?: ProjectApprovalStage;
      bulkMode?: BulkMode;
      comment?: string;
    };
    if (!payload.action || !['APPROVE', 'REJECT', 'RETURN', 'PROCESS_PAYROLL', 'POST_PAYROLL'].includes(payload.action)) return err(400, 'Invalid approval action.');
    let { headers } = await readTimesheetData();
    const requireProjectSegmentSequence = (segment: { headerId: string; projectCode: string; stage: ProjectApprovalStage }, headerList = headers) => {
      const header = headerList.find((item) => item.id === segment.headerId);
      if (!header) throw new Error(`Timesheet ${segment.headerId} was not found.`);
      const status = normalizeTimesheetStatus(header.status);
      if (segment.stage === 'Project Manager' && !['Supervisor_Reviewed', 'Project_Manager_Reviewed'].includes(status)) {
        throw new Error(`Project Manager can only approve ${segment.projectCode} after supervisor review.`);
      }
      if (segment.stage === 'Cost Control' && !['Project_Manager_Reviewed', 'Cost_Control_Reviewed'].includes(status)) {
        throw new Error(`Cost Control can only approve ${segment.projectCode} after Project Manager review is complete.`);
      }
    };
    const payrollHeaderIds: string[] = [];
    const applyHeader = async (headerId: string, headerList = headers) => {
      const header = headerList.find((item) => item.id === headerId);
      if (!header) throw new Error(`Timesheet ${headerId} was not found.`);
      requireHeaderStageAccess(header, payload.action!, access.actor, access.role, request, livePermissions);
      if (payload.action === 'PROCESS_PAYROLL' || payload.action === 'POST_PAYROLL') {
        payrollHeaderIds.push(headerId);
        return;
      }
      return advanceTimesheetWorkflow(headerId, payload.action as 'APPROVE' | 'REJECT' | 'RETURN', access.actor, payload.comment);
    };

    if (payload.projectSegments?.length) {
      for (const segment of payload.projectSegments) {
        requireProjectSegmentSequence(segment);
        requireProjectStageAccess(segment.stage, access.actor, access.role, request, livePermissions);
        await advanceProjectTimesheetApproval(segment.headerId, payload.action as 'APPROVE' | 'REJECT' | 'RETURN', access.actor, {
          projectCode: segment.projectCode,
          stage: segment.stage as 'Project Manager' | 'Cost Control',
          comment: payload.comment,
          bypassAssigneeCheck: isSuperAdministrator(access.role) || request.headers.get('x-auth-global-admin') === '1',
        });
      }
    }

    if (payload.projectCode && payload.stage && payload.stage !== 'HR' && payload.stage !== 'Payroll' && payload.stage !== 'GM Operations' && payload.stage !== 'Supervisor') {
      if (!payload.headerId) return err(400, 'Timesheet header ID is required.');
      requireProjectSegmentSequence({ headerId: payload.headerId, projectCode: payload.projectCode, stage: payload.stage });
      requireProjectStageAccess(payload.stage, access.actor, access.role, request, livePermissions);
      await advanceProjectTimesheetApproval(payload.headerId, payload.action as 'APPROVE' | 'REJECT' | 'RETURN', access.actor, {
        projectCode: payload.projectCode,
        stage: payload.stage as 'Project Manager' | 'Cost Control',
        comment: payload.comment,
        bypassAssigneeCheck: isSuperAdministrator(access.role) || request.headers.get('x-auth-global-admin') === '1',
      });
    }

    const handledSingleProjectAction = Boolean(payload.projectCode && payload.stage && payload.stage !== 'HR' && payload.stage !== 'Payroll' && payload.stage !== 'GM Operations' && payload.stage !== 'Supervisor');
    const hasHeaderAction = Boolean(payload.headerIds?.length || payload.headerId);
    if ((!payload.projectSegments?.length && !handledSingleProjectAction) || hasHeaderAction) {
      if (payload.projectSegments?.length || handledSingleProjectAction) {
        ({ headers } = await readTimesheetData());
      }
      const headerIds = [...new Set(payload.headerIds?.length ? payload.headerIds : payload.headerId ? [payload.headerId] : [])];
      if (!headerIds.length && !payload.projectSegments?.length) return err(400, 'Timesheet header ID is required.');
      for (const headerId of headerIds) await applyHeader(headerId, headers);
      if (payrollHeaderIds.length) {
        await processPayrollBatch(payrollHeaderIds, access.actor, payload.action === 'POST_PAYROLL');
      }
    }

    invalidateApprovalCaches();
    return ok(await buildPayload(request));
  } catch (error) {
    console.error('Approval API Error:', error);
    const message = error instanceof Error ? error.message : 'Unable to update approval workflow.';
    const status = /not found|not payroll-ready|permission|only/i.test(message) ? 400 : 500;
    return err(status, message);
  }
}
