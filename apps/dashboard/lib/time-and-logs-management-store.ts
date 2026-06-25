import { readPayrollEmployees } from '@/lib/payroll-employee-source';
import { readTimesheetData, readTimesheetPeriod, readTimesheetPeriodSummaries, type TimesheetHeader, type TimesheetLine } from '@/lib/timesheet-entry-store';

export type TimeRole = 'Payroll Officer' | 'HR Officer' | 'HR Manager' | 'Supervisor' | 'Department Manager' | 'Project Manager' | 'Site Manager' | 'Employee' | 'Finance Team' | 'System Administrator';
export type TimeActionId =
  | 'create'
  | 'edit'
  | 'save-draft'
  | 'submit'
  | 'approve'
  | 'reject'
  | 'recall'
  | 'cancel'
  | 'assign'
  | 'schedule'
  | 'validate'
  | 'recalculate'
  | 'import'
  | 'export'
  | 'generate'
  | 'publish'
  | 'lock'
  | 'unlock'
  | 'archive'
  | 'reopen'
  | 'view-history'
  | 'view-audit-trail'
  | 'withdraw'
  | 'copy-previous-week'
  | 'bulk-upload'
  | 'request-correction'
  | 'escalate'
  | 'delegate'
  | 'bulk-approve'
  | 'bulk-reject'
  | 'check-in'
  | 'check-out'
  | 'capture-site-activity'
  | 'upload-evidence'
  | 'post-to-payroll'
  | 'synchronize-attendance'
  | 'reconcile-payroll-hours'
  | 'allocate-labor-cost';

export type TimeAction = {
  id: TimeActionId;
  label: string;
  roles: TimeRole[];
  requiresReason?: boolean;
  sensitive?: boolean;
};

export type TimeAuditEntry = {
  id: string;
  at: string;
  user: string;
  role: TimeRole;
  action: string;
  record: string;
  oldValue: string | null;
  newValue: string | null;
  comments?: string;
  reason?: string;
};

export type TimeOperationalRecord = {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  projectCode: string;
  projectName: string;
  workPackage: string;
  costCenter: string;
  site: string;
  task: string;
  hoursWorked: number;
  overtimeHours: number;
  billableHours: number;
  nonBillableHours: number;
  status: string;
  workflowStage: string;
  approvalStatus: string;
  payrollStatus: string;
  validationStatus: 'Valid' | 'Warning' | 'Blocked';
  exceptions: string[];
};

export type TimePayload = {
  generatedAt: string;
  source: string;
  role: TimeRole;
  section: string;
  period: { id: string; name: string; startDate: string; endDate: string; status: string };
  permissions: {
    canCreate: boolean;
    canSubmit: boolean;
    canApprove: boolean;
    canSchedule: boolean;
    canPostPayroll: boolean;
    canConfigure: boolean;
    canExport: boolean;
    canViewAudit: boolean;
  };
  summary: {
    totalEmployees: number;
    timesheets: number;
    submittedTimesheets: number;
    approvedTimesheets: number;
    lockedTimesheets: number;
    totalHours: number;
    overtimeHours: number;
    billableHours: number;
    nonBillableHours: number;
    missingHours: number;
    attendanceExceptions: number;
    payrollReadyHours: number;
    blockedTransactions: number;
    pendingApprovals: number;
  };
  current: {
    timeStatus: string;
    availableActions: string[];
    nextRequiredAction: string;
    approvalStatus: string;
    validationStatus: string;
    payrollImpact: string;
    auditHistory: string;
    workflowProgress: string;
    exceptionIndicators: string[];
  };
  actions: TimeAction[];
  records: TimeOperationalRecord[];
  sections: Array<{ id: string; label: string; description: string; actions: TimeActionId[]; controls: string[]; reports?: string[] }>;
  workflowMatrix: Array<Record<string, string>>;
  schedules: Array<Record<string, string | number>>;
  reports: Array<Record<string, string>>;
  notifications: Array<Record<string, string>>;
  integrations: Array<Record<string, string>>;
  auditTrail: TimeAuditEntry[];
};

const nowIso = () => new Date().toISOString();
const allRoles: TimeRole[] = ['Payroll Officer', 'HR Officer', 'HR Manager', 'Supervisor', 'Department Manager', 'Project Manager', 'Site Manager', 'Employee', 'Finance Team', 'System Administrator'];
const approvalRoles: TimeRole[] = ['Supervisor', 'Department Manager', 'Project Manager', 'Site Manager', 'HR Manager', 'Payroll Officer', 'System Administrator'];
const adminRoles: TimeRole[] = ['HR Officer', 'HR Manager', 'Payroll Officer', 'System Administrator'];
const scheduleRoles: TimeRole[] = ['Supervisor', 'Department Manager', 'Project Manager', 'Site Manager', 'HR Manager', 'System Administrator'];
const payrollRoles: TimeRole[] = ['Payroll Officer', 'Finance Team', 'HR Manager', 'System Administrator'];
const auditStore: TimeAuditEntry[] = [];

const action = (id: TimeActionId, label: string, roles: TimeRole[] = allRoles, requiresReason = false, sensitive = false): TimeAction => ({ id, label, roles, requiresReason, sensitive });
const actions: TimeAction[] = [
  action('create', 'Create', ['Employee', 'Supervisor', 'Project Manager', 'Site Manager', ...adminRoles]),
  action('edit', 'Edit', ['Employee', 'Supervisor', ...adminRoles]),
  action('save-draft', 'Save Draft'),
  action('submit', 'Submit', ['Employee', 'Supervisor', 'Project Manager', 'Site Manager', ...adminRoles]),
  action('approve', 'Approve', approvalRoles, false, true),
  action('reject', 'Reject', approvalRoles, true, true),
  action('recall', 'Recall', adminRoles, true, true),
  action('cancel', 'Cancel', allRoles, true),
  action('assign', 'Assign', scheduleRoles),
  action('schedule', 'Schedule', scheduleRoles),
  action('validate', 'Validate', [...approvalRoles, ...adminRoles]),
  action('recalculate', 'Recalculate', [...adminRoles, 'Finance Team']),
  action('import', 'Import', adminRoles, false, true),
  action('export', 'Export', allRoles),
  action('generate', 'Generate', [...approvalRoles, ...payrollRoles]),
  action('publish', 'Publish', scheduleRoles, false, true),
  action('lock', 'Lock', ['Payroll Officer', 'HR Manager', 'System Administrator'], false, true),
  action('unlock', 'Unlock', ['HR Manager', 'System Administrator'], true, true),
  action('archive', 'Archive', ['HR Manager', 'System Administrator'], true, true),
  action('reopen', 'Reopen', ['HR Manager', 'System Administrator'], true, true),
  action('view-history', 'View History'),
  action('view-audit-trail', 'View Audit Trail', [...adminRoles, 'Finance Team']),
  action('withdraw', 'Withdraw', ['Employee', ...adminRoles], true),
  action('copy-previous-week', 'Copy Previous Week', ['Employee', 'Supervisor', ...adminRoles]),
  action('bulk-upload', 'Bulk Upload', adminRoles, false, true),
  action('request-correction', 'Request Correction', allRoles, true),
  action('escalate', 'Escalate', approvalRoles, true),
  action('delegate', 'Delegate', approvalRoles, true),
  action('bulk-approve', 'Bulk Approve', approvalRoles, false, true),
  action('bulk-reject', 'Bulk Reject', approvalRoles, true, true),
  action('check-in', 'Check-In', ['Employee', 'Site Manager', 'Supervisor']),
  action('check-out', 'Check-Out', ['Employee', 'Site Manager', 'Supervisor']),
  action('capture-site-activity', 'Capture Site Activity', ['Employee', 'Site Manager', 'Supervisor', 'Project Manager']),
  action('upload-evidence', 'Upload Evidence', ['Employee', 'Site Manager', 'Supervisor']),
  action('post-to-payroll', 'Post to Payroll', payrollRoles, false, true),
  action('synchronize-attendance', 'Synchronize Attendance', [...adminRoles, 'Supervisor']),
  action('reconcile-payroll-hours', 'Reconcile Payroll Hours', payrollRoles, false, true),
  action('allocate-labor-cost', 'Allocate Labor Cost', ['Finance Team', 'Project Manager', 'Payroll Officer', 'System Administrator']),
];

const sections: TimePayload['sections'] = [
  { id: 'timesheet-entry', label: 'Timesheet Entry', description: 'Production time capture for project, cost center, task, site, activities, daily hours, overtime, billable, and non-billable hours.', actions: ['create', 'edit', 'save-draft', 'submit', 'withdraw', 'copy-previous-week', 'import', 'bulk-upload', 'validate', 'lock', 'reopen', 'view-history'], controls: ['Duplicate entries', 'Missing hours', 'Invalid project codes', 'Overtime threshold violations', 'Future date restrictions', 'Closed period restrictions'] },
  { id: 'timesheet-approval', label: 'Timesheet Approval', description: 'Workflow-driven approval from employee to supervisor, department manager, project manager, and HR/payroll.', actions: ['approve', 'reject', 'request-correction', 'escalate', 'delegate', 'bulk-approve', 'bulk-reject', 'view-history'], controls: ['Configurable routing', 'Approval comments', 'Approval history', 'Bulk decisions'] },
  { id: 'project-time-logs', label: 'Project Time Logs', description: 'Project-based time, work package, cost center, site, task, labor cost, productivity, and attendance tracking.', actions: ['create', 'assign', 'import', 'validate', 'approve', 'lock', 'export'], controls: ['Project Code', 'Project Name', 'Work Package', 'Cost Center', 'Site', 'Task', 'Hours Worked', 'Overtime Hours'], reports: ['Project Utilization', 'Project Labor Cost', 'Project Productivity', 'Project Attendance'] },
  { id: 'department-time-logs', label: 'Department Time Logs', description: 'Department productivity, utilization, overtime, absence, and summary reporting.', actions: ['validate', 'approve', 'export', 'generate'], controls: ['Total Hours', 'Overtime Hours', 'Absence Hours', 'Productivity Hours', 'Department Utilization'] },
  { id: 'field-work-logs', label: 'Field Work Logs', description: 'Mobile/site field logging with GPS, offline capture, site evidence, equipment usage, travel time, and supervisor confirmation.', actions: ['create', 'check-in', 'check-out', 'capture-site-activity', 'upload-evidence', 'approve', 'export'], controls: ['GPS Coordinates', 'Site Locations', 'Project Sites', 'Mobile Entry', 'Offline Capture', 'Arrival Time', 'Departure Time', 'Work Performed', 'Site Conditions'] },
  { id: 'overtime-logs', label: 'Overtime Logs', description: 'Overtime request, validation, approval, recalculation, export, and payroll posting.', actions: ['create', 'submit', 'approve', 'reject', 'validate', 'recalculate', 'export', 'post-to-payroll'], controls: ['Overtime policy compliance', 'Maximum daily overtime', 'Maximum monthly overtime', 'Grade eligibility', 'Shift overlap validation'], reports: ['Overtime Cost', 'Overtime Utilization', 'Employee Overtime Summary'] },
  { id: 'shift-logs', label: 'Shift Logs', description: 'Day, night, rotational, project, and emergency shift assignment, swaps, publishing, locking, and archiving.', actions: ['create', 'assign', 'reopen', 'approve', 'lock', 'publish', 'archive'], controls: ['Shift Start', 'Shift End', 'Break Hours', 'Shift Type', 'Shift Category', 'Employee Assignment'] },
  { id: 'work-schedule', label: 'Work Schedule', description: 'Weekly, monthly, rotational, site-based, and project-based schedules.', actions: ['create', 'edit', 'assign', 'publish', 'lock', 'reopen'], controls: ['Weekly', 'Monthly', 'Rotational', 'Site-Based', 'Project-Based'] },
  { id: 'roster-management', label: 'Roster Management', description: 'Department, site, project, and shift roster management with conflict prevention.', actions: ['create', 'assign', 'publish', 'approve', 'lock', 'reopen'], controls: ['Department Rosters', 'Site Rosters', 'Project Rosters', 'Shift Rosters', 'Roster conflicts'] },
  { id: 'time-correction-requests', label: 'Time Correction Requests', description: 'Missed clock-in, missed clock-out, wrong hours, wrong project allocation, and wrong shift correction workflow.', actions: ['submit', 'approve', 'reject', 'escalate', 'recalculate', 'view-history'], controls: ['Employee -> Supervisor -> HR -> Payroll', 'Correction reason', 'Recalculated hours'] },
  { id: 'supervisor-review', label: 'Supervisor Review', description: 'Team hours, overtime, attendance exceptions, field logs, corrections, and productivity review.', actions: ['approve', 'validate', 'export', 'generate'], controls: ['Pending Reviews', 'Pending Approvals', 'Team Productivity', 'Attendance Exceptions'] },
  { id: 'timesheet-reports', label: 'Timesheet Reports', description: 'Summary, employee, project, department, overtime, shift, roster, productivity, payroll hours, and attendance reconciliation reports.', actions: ['generate', 'export', 'view-history'], controls: ['Schedule report', 'Email report', 'Save report view'], reports: ['Timesheet Summary', 'Employee Hours Report', 'Project Hours Report', 'Department Hours Report', 'Overtime Report', 'Shift Report', 'Roster Report', 'Productivity Report', 'Payroll Hours Report', 'Attendance Reconciliation Report'] },
];

const normalizeRole = (role?: string | null): TimeRole => allRoles.find((item) => item.toLowerCase() === String(role || '').toLowerCase()) || 'HR Manager';
const sum = (rows: TimesheetLine[], getter: (row: TimesheetLine) => number) => rows.reduce((total, row) => total + getter(row), 0);
const round = (value: number) => Math.round(value * 100) / 100;

const buildRecords = (headers: TimesheetHeader[], lines: TimesheetLine[]): TimeOperationalRecord[] => {
  const headerById = new Map(headers.map((header) => [header.id, header]));
  return lines.slice(0, 120).map((line) => {
    const header = headerById.get(line.headerId);
    const project = line.projectAllocations[0];
    const overtimeHours = Math.max(0, line.totalHours - 8);
    const exceptions = [
      ...(line.validationStatus === 'Error' || line.validationStatus === 'Incomplete' ? [line.validationMessage || 'Timesheet validation failed'] : []),
      ...(Math.abs(line.variance) > 1 ? ['Attendance vs timesheet variance detected'] : []),
      ...(overtimeHours > 2 ? ['Overtime threshold requires approval'] : []),
      ...(!project?.projectCode ? ['Project allocation missing'] : []),
      ...(header?.status === 'Locked' ? ['Timesheet is locked'] : []),
    ].filter(Boolean);
    return {
      id: line.id,
      employeeId: line.employeeNo || line.employeeId,
      employeeName: line.employeeName,
      department: header?.workCenterName || 'Unassigned',
      projectCode: project?.projectCode || 'Unassigned',
      projectName: project?.projectName || 'No project allocation',
      workPackage: project?.activityId || 'General',
      costCenter: header?.workCenterId || 'Unassigned',
      site: header?.workCenterName || 'Unassigned',
      task: project?.taskName || 'Timesheet task',
      hoursWorked: round(line.totalHours),
      overtimeHours: round(overtimeHours),
      billableHours: round(line.projectAllocations.reduce((total, item) => total + Number(item.hours || 0), 0)),
      nonBillableHours: round(line.idleHours),
      status: header?.status || 'Draft',
      workflowStage: header?.currentApprovalStage || (header?.status === 'Submitted' ? 'Supervisor' : header?.status === 'Approved' ? 'HR/Payroll' : 'Employee'),
      approvalStatus: header?.status === 'Approved' || header?.status === 'Locked' ? 'Approved' : header?.status === 'Rejected' ? 'Rejected' : 'Pending',
      payrollStatus: header?.payrollAcknowledgedAt ? 'Posted to Payroll' : header?.status === 'Approved' || header?.status === 'Locked' ? 'Payroll Ready' : 'Not Ready',
      validationStatus: exceptions.some((item) => item.includes('missing') || item.includes('failed')) ? 'Blocked' : exceptions.length ? 'Warning' : 'Valid',
      exceptions,
    };
  });
};

const permissionsFor = (role: TimeRole): TimePayload['permissions'] => ({
  canCreate: role !== 'Finance Team',
  canSubmit: role !== 'Finance Team',
  canApprove: approvalRoles.includes(role),
  canSchedule: scheduleRoles.includes(role),
  canPostPayroll: payrollRoles.includes(role),
  canConfigure: ['HR Manager', 'System Administrator'].includes(role),
  canExport: true,
  canViewAudit: role !== 'Employee',
});

export async function readTimeAndLogsPayload(section = 'timesheet-entry', roleInput?: string | null): Promise<TimePayload> {
  const role = normalizeRole(roleInput);
  const [period, summaries, data] = await Promise.all([
    readTimesheetPeriod().catch(() => ({ id: 'current', name: 'Current Period', startDate: new Date().toISOString().slice(0, 10), endDate: new Date().toISOString().slice(0, 10), status: 'Open' })),
    readTimesheetPeriodSummaries(6).catch(() => []),
    readTimesheetData({ softFail: true }).catch(() => ({ headers: [], lines: [] })),
  ]);
  const employeeSource = await readPayrollEmployees().catch(() => ({ employees: [] as Awaited<ReturnType<typeof readPayrollEmployees>>['employees'] }));
  const records = data.lines.length ? buildRecords(data.headers, data.lines) : [];
  const currentSection = sections.find((item) => item.id === section) || sections[0];
  const availableActions = actions.filter((item) => currentSection.actions.includes(item.id) && item.roles.includes(role));
  const blocked = records.filter((item) => item.validationStatus === 'Blocked');
  const warning = records.filter((item) => item.validationStatus === 'Warning');
  const totalHours = round(records.reduce((total, item) => total + item.hoursWorked, 0));
  const overtimeHours = round(records.reduce((total, item) => total + item.overtimeHours, 0));
  const approved = records.filter((item) => item.approvalStatus === 'Approved');
  const pendingApprovals = records.filter((item) => item.approvalStatus === 'Pending' && item.status !== 'Draft').length;
  const sourceText = data.lines.length ? 'DLE Timesheet database' : 'DLE Timesheet database: no timesheet transactions found';

  return {
    generatedAt: nowIso(),
    source: sourceText,
    role,
    section: currentSection.id,
    period,
    permissions: permissionsFor(role),
    summary: {
      totalEmployees: data.lines.length ? new Set(records.map((item) => item.employeeId)).size : employeeSource.employees.length,
      timesheets: data.headers.length || records.length,
      submittedTimesheets: records.filter((item) => item.status === 'Submitted').length,
      approvedTimesheets: approved.length,
      lockedTimesheets: records.filter((item) => item.status === 'Locked').length,
      totalHours,
      overtimeHours,
      billableHours: round(records.reduce((total, item) => total + item.billableHours, 0)),
      nonBillableHours: round(records.reduce((total, item) => total + item.nonBillableHours, 0)),
      missingHours: records.filter((item) => item.hoursWorked <= 0).length,
      attendanceExceptions: warning.length + blocked.length,
      payrollReadyHours: round(approved.reduce((total, item) => total + item.hoursWorked, 0)),
      blockedTransactions: blocked.length,
      pendingApprovals,
    },
    current: {
      timeStatus: period.status === 'Open' ? 'Open period accepting time transactions' : `${period.status} period controls active`,
      availableActions: availableActions.map((item) => item.label),
      nextRequiredAction: blocked.length ? 'Resolve blocked time validation exceptions' : pendingApprovals ? 'Approve pending time transactions' : 'Generate payroll hours',
      approvalStatus: pendingApprovals ? `${pendingApprovals} approval actions pending` : 'Approval queue clear',
      validationStatus: blocked.length ? `${blocked.length} blocked transactions` : warning.length ? `${warning.length} warnings to review` : 'Validation clear',
      payrollImpact: `${round(approved.reduce((total, item) => total + item.hoursWorked, 0))} approved hours ready for payroll`,
      auditHistory: `${auditStore.length} action logs captured this session`,
      workflowProgress: 'Employee -> Supervisor -> Department Manager -> Project Manager -> HR/Payroll',
      exceptionIndicators: blocked.concat(warning).flatMap((item) => item.exceptions).slice(0, 6),
    },
    actions: availableActions,
    records,
    sections,
    workflowMatrix: [
      { dimension: 'Employee Type', rule: 'Daily-rate and site workers require supervisor/site manager confirmation' },
      { dimension: 'Project', rule: 'Project hours route to Project Manager before HR/Payroll' },
      { dimension: 'Department', rule: 'Department logs route to Department Manager' },
      { dimension: 'Overtime', rule: 'Overtime requires policy validation and approval before payroll posting' },
      { dimension: 'Payroll Period', rule: 'Closed or locked periods block edits and postings' },
    ],
    schedules: [
      { id: 'sch-day', name: 'Day Shift', start: '08:00', end: '17:00', category: 'Office / Site', status: 'Published' },
      { id: 'sch-night', name: 'Night Shift', start: '18:00', end: '06:00', category: 'Operations', status: 'Published' },
      { id: 'sch-rot', name: 'Rotational Shift', start: 'Variable', end: 'Variable', category: 'Project', status: 'Draft' },
      ...summaries.slice(0, 3).map((item) => ({ id: item.id, name: item.name, start: item.startDate, end: item.endDate, category: 'Timesheet Period', status: item.status })),
    ],
    reports: ['Timesheet Summary', 'Employee Hours Report', 'Project Hours Report', 'Department Hours Report', 'Overtime Report', 'Shift Report', 'Roster Report', 'Productivity Report', 'Payroll Hours Report', 'Attendance Reconciliation Report'].map((name, index) => ({ id: `rpt-${index + 1}`, name, format: 'Excel, PDF, CSV', status: index % 3 === 0 ? 'Scheduled' : 'Ready' })),
    notifications: ['Timesheet submitted', 'Timesheet approved', 'Timesheet rejected', 'Overtime approved', 'Overtime rejected', 'Shift assigned', 'Shift changed', 'Correction approved', 'Correction rejected', 'Payroll posting completed'].map((event, index) => ({ id: `ntf-${index + 1}`, event, channels: 'Email, In-App, ESS', status: 'Enabled' })),
    integrations: [
      { system: 'Attendance', status: 'Ready', purpose: 'Synchronize attendance, compare attendance vs timesheet, validate exceptions, reconcile records' },
      { system: 'Payroll Management', status: 'Ready', purpose: 'Validate, generate, export, post overtime, post daily-rate hours, and reconcile payroll hours' },
      { system: 'Projects / Costing', status: 'Ready', purpose: 'Allocate labor cost, export labor allocations, reconcile project labor' },
      { system: 'ESS Portal', status: 'Ready', purpose: 'Employee time entry, correction requests, status tracking, notifications' },
      { system: 'Reporting', status: 'Ready', purpose: 'Scheduled reports, saved views, Excel, PDF, and CSV exports' },
    ],
    auditTrail: auditStore.slice(0, 50),
  };
}

export function auditTimeAction(input: Omit<TimeAuditEntry, 'id' | 'at'>) {
  auditStore.unshift({ id: `time-aud-${Date.now()}-${Math.random().toString(16).slice(2)}`, at: nowIso(), ...input });
  if (auditStore.length > 300) auditStore.length = 300;
}

export function validateTimeAction(actionId: TimeActionId, roleInput: string | null | undefined, payload: TimePayload, body: any = {}) {
  const role = normalizeRole(roleInput);
  const actionDef = actions.find((item) => item.id === actionId);
  if (!actionDef) return { ok: false, status: 400, message: 'Unknown Time & Logs action.' };
  if (!actionDef.roles.includes(role)) return { ok: false, status: 403, message: `${role} is not permitted to perform ${actionDef.label}.` };
  if (actionDef.requiresReason && !String(body.reason || '').trim()) return { ok: false, status: 400, message: 'Reason is required for this time action.' };
  if (['submit', 'approve', 'post-to-payroll'].includes(actionId) && payload.period.status !== 'Open') return { ok: false, status: 409, message: 'This action cannot proceed outside an open period.' };
  if (['approve', 'bulk-approve'].includes(actionId) && payload.summary.blockedTransactions > 0) return { ok: false, status: 409, message: 'Resolve blocked time validation exceptions before approval.' };
  if (actionId === 'post-to-payroll' && payload.summary.pendingApprovals > 0) return { ok: false, status: 409, message: 'Payroll posting requires approved hours only.' };
  if (actionId === 'lock' && payload.summary.pendingApprovals > 0) return { ok: false, status: 409, message: 'Cannot lock timesheets while approvals are pending.' };
  if (actionId === 'edit' && body.locked) return { ok: false, status: 409, message: 'Locked timesheets cannot be edited.' };
  if (['schedule', 'assign', 'publish'].includes(actionId) && body.conflict) return { ok: false, status: 409, message: 'Schedule, shift, or roster conflict detected.' };
  if (actionId === 'submit' && body.duplicate) return { ok: false, status: 409, message: 'Duplicate timesheet detected.' };
  return { ok: true, status: 200, message: `${actionDef.label} completed and audit logged.` };
}
