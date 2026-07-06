import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sql from 'mssql';
import type { SessionPayload } from '@/lib/auth/session';
import { getDleEnterpriseDbPool, type DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import {
  dormantLongPolicy,
  isConfirmedPermanent,
  isFourteenDayPaidLeaveEmployee,
  auditLeaveAction,
  readLeaveApplicationsForReconciliation,
  readLeaveManagementPayload,
  validateLeaveAction,
  type LeaveActionId,
  type LeaveRole,
  type LeaveStatus,
  type WorkflowStage,
} from '@/lib/leave-management-store';
import { postLeaveAllowanceOnAnnualLeaveApproval } from '@/lib/payroll-leave-allowance-store';
import { readPayrollEmployees } from '@/lib/payroll-employee-source';
import { activePayrollPeriod } from '@/lib/payroll-periods';
import { sendLeaveApprovalRequestEmail, sendLeaveRelieverAssignmentEmail, sendLeaveWorkflowEmail } from '@/lib/mail-service';
import { buildEssEmployeeLookupKeys } from '@/lib/ess-dashboard-store';
import { normalizePayrollMatchKey } from '@/lib/sage-people-payroll-store';
import { createEnterpriseNotification } from '@/lib/enterprise-notifications-store';
import { invalidateEssPortalCache } from '@/lib/ess-portal-cache';

export type EssLeaveRequestStatus =
  | 'Draft'
  | 'Submitted'
  | 'Line Manager Review'
  | 'HR Review'
  | 'Finance Review'
  | 'Approved'
  | 'Rejected'
  | 'Terminated'
  | 'Closed';

export type EssLeaveRequest = {
  id: string;
  employeeId: string;
  category: string;
  title: string;
  status: EssLeaveRequestStatus;
  priority: 'Low' | 'Normal' | 'High';
  submittedAt: string;
  updatedAt: string;
  approvers: string[];
  comments: Array<{ at: string; actor: string; comment: string }>;
  leaveType?: string;
  startDate?: string;
  endDate?: string;
  days?: number;
  payrollPeriod?: string;
  paidLeave?: boolean;
  reason?: string;
  relieverEmployeeId?: string;
  relieverName?: string;
  lineManagerEmployeeId?: string;
  lineManagerName?: string;
  handover?: string;
  attachmentNames?: string[];
  workflow?: Array<{ stage: string; owner: string; status: string; actedAt?: string | null; comment?: string | null }>;
};

const resolveDashboardRoot = () => {
  const cwd = process.cwd();
  const dashboardSuffix = path.join('apps', 'dashboard');
  return cwd.endsWith(dashboardSuffix) ? cwd : path.join(cwd, dashboardSuffix);
};

export const ESS_REQUESTS_PATH = path.join(resolveDashboardRoot(), 'data', 'hris', 'ess-requests.json');
export const LEAVE_ATTACHMENTS_ROOT = path.join(resolveDashboardRoot(), 'data', 'hris', 'leave-attachments');
export const LEAVE_CALENDAR_CONFIG_PATH = path.join(resolveDashboardRoot(), 'data', 'hris', 'leave-calendar-config.json');

const compact = (value: unknown) => String(value || '').trim();
const clean = compact;
const round2 = (value: number) => Math.round(value * 100) / 100;
const workflowDeadlineDays = 5;

export { workflowDeadlineDays };

const isWorkingDate = (date: Date) => {
  const day = date.getUTCDay();
  return day !== 0 && day !== 6;
};

export const workingDaysSince = (fromIso: string, toIso = new Date().toISOString()) => {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) return 0;
  let days = 0;
  for (let d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + 1)); d <= to; d = new Date(d.getTime() + 24 * 60 * 60 * 1000)) {
    if (isWorkingDate(d)) days += 1;
  }
  return days;
};

export const readAllEssRequests = async (): Promise<EssLeaveRequest[]> => {
  try {
    const parsed = JSON.parse(await readFile(ESS_REQUESTS_PATH, 'utf8'));
    return Array.isArray(parsed) ? parsed as EssLeaveRequest[] : [];
  } catch {
    return [];
  }
};

export const writeAllEssRequests = async (requests: EssLeaveRequest[]) => {
  await mkdir(path.dirname(ESS_REQUESTS_PATH), { recursive: true });
  await writeFile(ESS_REQUESTS_PATH, JSON.stringify(requests, null, 2), 'utf8');
};

export const readEssLeaveRequests = async () =>
  (await readAllEssRequests()).filter((item) => /leave/i.test(item.category) && item.startDate && item.endDate);

export const expireStaleLeaveRequests = async (requests: EssLeaveRequest[]) => {
  let changed = false;
  const now = new Date().toISOString();
  const next = requests.map((item) => {
    if (!/leave/i.test(item.category) || !['Line Manager Review', 'HR Review', 'Submitted'].includes(item.status)) return item;
    if (workingDaysSince(item.updatedAt || item.submittedAt) <= workflowDeadlineDays) return item;
    changed = true;
    return {
      ...item,
      status: 'Terminated' as EssLeaveRequestStatus,
      updatedAt: now,
      comments: [
        ...(item.comments || []),
        {
          at: now,
          actor: 'Leave Workflow Engine',
          comment: `Leave request automatically terminated because it was not approved within ${workflowDeadlineDays} working days.`,
        },
      ],
      workflow: (item.workflow || []).map((step) =>
        ['Pending', 'Current'].includes(step.status)
          ? { ...step, status: 'Terminated', actedAt: now, comment: `Auto-terminated after ${workflowDeadlineDays} working days.` }
          : step,
      ),
    };
  });
  if (changed) await writeAllEssRequests(next);
  return next;
};

const normalizeLeaveStatus = (status: string): LeaveStatus => {
  const normalized = clean(status).toLowerCase();
  if (['approved', 'closed'].includes(normalized)) return normalized === 'closed' ? 'Completed' : 'Approved';
  if (['submitted', 'pending'].includes(normalized)) return 'Submitted';
  if (['line manager review', 'hr review', 'finance review'].includes(normalized)) return 'Under Review';
  if (['under review', 'review'].includes(normalized)) return 'Under Review';
  if (['rejected', 'declined'].includes(normalized)) return 'Rejected';
  if (['withdrawn'].includes(normalized)) return 'Withdrawn';
  if (['cancelled', 'canceled'].includes(normalized)) return 'Cancelled';
  if (['terminated', 'expired'].includes(normalized)) return 'Terminated';
  if (['completed'].includes(normalized)) return 'Completed';
  return 'Draft';
};

const workflowStageForEssStatus = (rawStatus: string, normalized: LeaveStatus): WorkflowStage => {
  const lower = clean(rawStatus).toLowerCase();
  if (lower === 'line manager review') return 'Supervisor';
  if (lower === 'hr review') return 'HR';
  return normalized === 'Draft' ? 'Employee' : normalized === 'Submitted' ? 'Supervisor' : normalized === 'Under Review' ? 'HR' : normalized === 'Approved' ? 'Final Approval' : 'Closed';
};

const approvalStatusFor = (status: LeaveStatus, rawStatus: string) => {
  const lower = clean(rawStatus).toLowerCase();
  if (lower === 'line manager review') return 'Awaiting Line Manager';
  if (lower === 'hr review') return 'Awaiting HR';
  if (['Approved', 'Completed'].includes(status)) return 'Approved';
  if (status === 'Rejected') return 'Rejected';
  if (['Cancelled', 'Withdrawn', 'Terminated'].includes(status)) return status;
  return 'Pending';
};

const dateOnly = (value: unknown) => {
  const text = compact(value);
  if (!text) return '';
  return text.slice(0, 10);
};

export const managerOwnerFor = (employee: DleEmployeeDirectoryRow) =>
  compact(employee.managerName) || compact((employee as Record<string, unknown>).supervisor) || 'Line Manager / Lead / Supervisor';

export const leaveWorkflowFor = (
  employee: DleEmployeeDirectoryRow,
  relieverName: string,
  status: EssLeaveRequestStatus,
  now: string,
  lineManagerName?: string,
) => [
  { stage: 'Employee Request', owner: employee.fullName, status: 'Completed', actedAt: now, comment: 'Submitted from Employee Self-Service.' },
  {
    stage: 'Line Manager / Lead / Supervisor',
    owner: lineManagerName || managerOwnerFor(employee),
    status: status === 'Line Manager Review' ? 'Current' : status === 'HR Review' || status === 'Approved' ? 'Completed' : 'Pending',
    actedAt: status === 'Line Manager Review' ? null : status === 'HR Review' || status === 'Approved' ? now : null,
    comment: 'Approval validity: 5 working days.',
  },
  {
    stage: 'HR Manager / Head',
    owner: 'HR Manager / Head',
    status: status === 'HR Review' ? 'Current' : status === 'Approved' ? 'Completed' : 'Pending',
    actedAt: status === 'Approved' ? now : null,
    comment: 'Final HR approval and leave balance confirmation.',
  },
  {
    stage: 'Requester Notification',
    owner: employee.fullName,
    status: status === 'Approved' ? 'Delivered' : 'Pending',
    actedAt: status === 'Approved' ? now : null,
    comment: 'Requester notified after final approval.',
  },
  {
    stage: 'Reliever Notification',
    owner: relieverName || 'Selected reliever',
    status: status === 'Approved' ? 'Delivered' : 'Pending',
    actedAt: status === 'Approved' ? now : null,
    comment: 'Reliever notified after final approval.',
  },
];

const employeeKeys = (employee: DleEmployeeDirectoryRow) =>
  buildEssEmployeeLookupKeys(employee).map((key) => normalizePayrollMatchKey(key)).filter(Boolean);

const namesMatch = (left: string, right: string) => {
  const a = clean(left).toLowerCase();
  const b = clean(right).toLowerCase();
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
};

const employeeCodeFromReference = (reference: string) => {
  const value = clean(reference);
  if (!value) return '';
  const prefixed = value.match(/^([A-Z]{0,5}0*\d+)\s*-/i);
  if (prefixed?.[1]) return prefixed[1].toUpperCase();
  const embedded = value.match(/\b(P\d+|L\d+|NYSC\d+|C\d+)\b/i);
  return embedded?.[1]?.toUpperCase() || '';
};

const referenceMatchesEmployee = (employee: DleEmployeeDirectoryRow, reference: string) => {
  if (!reference) return false;
  if (employeeRequestMatches(employee, reference) || namesMatch(employee.fullName, reference)) return true;
  const embeddedCode = employeeCodeFromReference(reference);
  if (embeddedCode && employeeRequestMatches(employee, embeddedCode)) return true;
  const embeddedName = reference.includes(' - ') ? clean(reference.split(' - ').slice(1).join(' - ')) : '';
  return Boolean(embeddedName && namesMatch(employee.fullName, embeddedName));
};

export const employeeRequestMatches = (employee: DleEmployeeDirectoryRow, requestEmployeeId: string) => {
  const lookup = new Set(employeeKeys(employee));
  return lookup.has(normalizePayrollMatchKey(requestEmployeeId));
};

export const resolveEmployeeReference = (employees: DleEmployeeDirectoryRow[], reference: string) =>
  employees.find((employee) => employeeRequestMatches(employee, reference)) || null;

export const employeeNotificationCode = (employee: DleEmployeeDirectoryRow) =>
  compact(employee.employeeCode) || compact(employee.employeeId);

const leaveSystemSession = (actor: string): SessionPayload => ({
  sub: 'system-leave-workflow',
  username: 'system-leave-workflow',
  fullName: actor || 'Leave Workflow',
  roles: ['System'],
  permissions: ['*'],
  status: 'Active',
  firstLoginRequired: false,
  passwordResetRequired: false,
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600,
});

const resolveReliever = (request: EssLeaveRequest, employees: DleEmployeeDirectoryRow[]) => {
  if (request.relieverEmployeeId) {
    return resolveEmployeeReference(employees, request.relieverEmployeeId);
  }
  const relieverName = compact(request.relieverName);
  if (!relieverName) return null;
  return employees.find((employee) => namesMatch(employee.fullName, relieverName)) || null;
};

const safeLeaveNotification = async (label: string, task: () => Promise<unknown>) => {
  try {
    await task();
  } catch (error) {
    console.error(`[leave-workflow] ${label} failed`, error);
  }
};

const deliverLeaveEmployeeNotification = async (input: {
  session: SessionPayload;
  employee: DleEmployeeDirectoryRow;
  title: string;
  body: string;
  severity?: 'info' | 'success' | 'warning' | 'critical';
  requestId: string;
  kind?: 'Approval' | 'Workflow' | 'Notification';
  sendEmail?: () => Promise<unknown>;
  href?: string;
}) => {
  await createEnterpriseNotification(input.session, {
    kind: input.kind || 'Workflow',
    module: 'Leave Management',
    title: input.title,
    body: input.body,
    severity: input.severity || 'info',
    recipientEmployeeCode: employeeNotificationCode(input.employee),
    href: input.href || '/workforce-portal?tab=leave',
    channels: ['In-App', 'Email'],
    metadata: { requestId: input.requestId },
    actor: input.session.fullName,
  });
  if (input.sendEmail) await input.sendEmail();
};

export const notifyLeaveFinalApproval = async (input: {
  request: EssLeaveRequest;
  requester: DleEmployeeDirectoryRow;
  actorName: string;
  baseUrl?: string | null;
}) => {
  const session = leaveSystemSession(input.actorName);
  const { employees } = await readPayrollEmployees();
  const requestLabel = input.request.title || `${input.request.leaveType} leave`;
  const requesterBody = `${requestLabel} (${input.request.startDate} to ${input.request.endDate}) has received final HR approval.`;

  await safeLeaveNotification('requester final-approval notification', () =>
    deliverLeaveEmployeeNotification({
      session,
      employee: input.requester,
      title: 'Leave request approved',
      body: requesterBody,
      severity: 'success',
      requestId: input.request.id,
      href: '/workforce-portal?tab=leave&leaveSection=applications',
      sendEmail: () => sendLeaveWorkflowEmail({
        event: 'approved',
        request: input.request,
        requester: input.requester,
        recipient: input.requester,
        actorName: input.actorName,
        baseUrl: input.baseUrl,
      }),
    }));

  const reliever = resolveReliever(input.request, employees);
  if (!reliever) return;

  const relieverBody = `You have been assigned as reliever for ${input.requester.fullName}: ${requestLabel} (${input.request.startDate} to ${input.request.endDate}).`;
  await safeLeaveNotification('reliever final-approval notification', () =>
    deliverLeaveEmployeeNotification({
      session,
      employee: reliever,
      title: 'Leave reliever assignment confirmed',
      body: relieverBody,
      severity: 'info',
      requestId: input.request.id,
      sendEmail: () => sendLeaveRelieverAssignmentEmail({
        request: input.request,
        requester: input.requester,
        reliever,
        actorName: input.actorName,
        baseUrl: input.baseUrl,
      }),
    }));
};

export const notifyLeaveRejected = async (input: {
  request: EssLeaveRequest;
  requester: DleEmployeeDirectoryRow;
  actorName: string;
  reason?: string;
  baseUrl?: string | null;
}) => {
  const session = leaveSystemSession(input.actorName);
  const requestLabel = input.request.title || `${input.request.leaveType} leave`;
  const body = `${requestLabel} was rejected by ${input.actorName}.${input.reason ? ` Reason: ${input.reason}` : ''}`;

  await safeLeaveNotification('leave rejection notification', () =>
    deliverLeaveEmployeeNotification({
      session,
      employee: input.requester,
      title: 'Leave request rejected',
      body,
      severity: 'warning',
      requestId: input.request.id,
      kind: 'Approval',
      href: '/workforce-portal?tab=leave&leaveSection=applications',
      sendEmail: () => sendLeaveWorkflowEmail({
        event: 'rejected',
        request: input.request,
        requester: input.requester,
        recipient: input.requester,
        actorName: input.actorName,
        extra: input.reason,
        baseUrl: input.baseUrl,
      }),
    }));
};

export const notifyLeaveAwaitingHrApproval = async (input: {
  request: EssLeaveRequest;
  requester: DleEmployeeDirectoryRow;
  actorName: string;
  baseUrl?: string | null;
}) => {
  const session = leaveSystemSession(input.actorName);
  const requestLabel = input.request.title || `${input.request.leaveType} leave`;

  await safeLeaveNotification('requester manager-approved notification', () =>
    deliverLeaveEmployeeNotification({
      session,
      employee: input.requester,
      title: 'Leave request awaiting HR approval',
      body: `${requestLabel} has been approved by the line manager and is awaiting HR Manager / Head approval.`,
      severity: 'info',
      requestId: input.request.id,
      href: '/workforce-portal?tab=leave&leaveSection=applications',
      sendEmail: () => sendLeaveWorkflowEmail({
        event: 'manager-approved',
        request: input.request,
        requester: input.requester,
        recipient: input.requester,
        actorName: input.actorName,
        baseUrl: input.baseUrl,
      }),
    }));

  await safeLeaveNotification('hr approval queue notification', () =>
    createEnterpriseNotification(session, {
      kind: 'Approval',
      module: 'Leave Management',
      title: 'Leave request awaiting HR approval',
      body: `${requestLabel} has been approved by the line manager and is awaiting HR Manager / Head approval.`,
      severity: 'warning',
      recipientRoles: ['HR Manager', 'HR Head', 'HR Officer', 'Leave Administrator'],
      href: '/workforce-portal?tab=leave&leaveSection=Approvals',
      channels: ['In-App', 'Email'],
      metadata: { requestId: input.request.id },
      actor: input.actorName,
    }));

  await safeLeaveNotification('hr approver email', () =>
    emailLeaveApproversForRequest({ request: input.request, requester: input.requester, baseUrl: input.baseUrl }));
};

const essLeaveRequestFromDbRow = (row: Record<string, unknown>, employees: DleEmployeeDirectoryRow[]): EssLeaveRequest | null => {
  const id = compact(row.Id);
  const employeeId = compact(row.EmployeeId);
  if (!id || !employeeId) return null;
  const actingOfficer = compact(row.ActingOfficer);
  const reliever = actingOfficer
    ? employees.find((employee) => namesMatch(employee.fullName, actingOfficer) || employeeRequestMatches(employee, actingOfficer))
    : null;
  const startDate = dateOnly(row.StartDate);
  const endDate = dateOnly(row.EndDate);
  return {
    id,
    employeeId,
    category: 'Leave Application',
    title: `${compact(row.LeaveType) || 'Leave'} — ${compact(row.FullName) || employeeId}`,
    status: normalizeEssStatus(compact(row.StatusName)),
    priority: 'Normal',
    submittedAt: compact(row.CreatedAt) || new Date().toISOString(),
    updatedAt: compact(row.UpdatedAt) || new Date().toISOString(),
    approvers: ['Line Manager / Lead / Supervisor', 'HR Manager / Head'],
    comments: [],
    leaveType: compact(row.LeaveType) || 'Annual Leave',
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    days: Number(row.Days || 0) || undefined,
    relieverEmployeeId: reliever ? (reliever.employeeCode || reliever.employeeId) : undefined,
    relieverName: reliever?.fullName || actingOfficer || undefined,
  };
};

const normalizeEssStatus = (status: string): EssLeaveRequestStatus => {
  if (status === 'Under Review') return 'HR Review';
  if (status === 'Completed') return 'Approved';
  if (status === 'Cancelled' || status === 'Withdrawn') return 'Rejected';
  if (['Approved', 'Rejected', 'Terminated', 'Submitted', 'Draft', 'Line Manager Review', 'HR Review', 'Finance Review', 'Closed'].includes(status)) {
    return status as EssLeaveRequestStatus;
  }
  return 'Submitted';
};

const loadLeaveRequestSnapshot = async (applicationId: string, employees: DleEmployeeDirectoryRow[]) => {
  const fromEss = (await readAllEssRequests()).find((item) => item.id === applicationId && /leave/i.test(item.category));
  if (fromEss) {
    const requester = resolveEmployeeReference(employees, fromEss.employeeId);
    if (requester) return { request: fromEss, requester };
  }
  const pool = await getDleEnterpriseDbPool();
  if (!pool) return null;
  const result = await pool.request()
    .input('Id', sql.NVarChar(120), applicationId)
    .query(`
SELECT TOP 1 [Id],[EmployeeId],[FullName],[LeaveType],[StartDate],[EndDate],[Days],[StatusName],[ActingOfficer],[CreatedAt],[UpdatedAt]
FROM [hris].[LeaveApplications]
WHERE [Id]=@Id;`);
  const request = essLeaveRequestFromDbRow(result.recordset[0] as Record<string, unknown>, employees);
  if (!request) return null;
  const requester = resolveEmployeeReference(employees, request.employeeId);
  if (!requester) return null;
  return { request, requester };
};

const resolveLineManagerRecipient = (requester: DleEmployeeDirectoryRow, employees: DleEmployeeDirectoryRow[]) =>
  resolveLineManagerForEmployee(requester, employees)?.employee || null;

export type ResolvedLineManager = {
  employee: DleEmployeeDirectoryRow;
  label: string;
  source: 'reporting-manager' | 'functional-manager' | 'department-head';
};

export const resolveLineManagerForEmployee = (
  requester: DleEmployeeDirectoryRow,
  employees: DleEmployeeDirectoryRow[],
): ResolvedLineManager | null => {
  const inactive = /inactive|terminated|resigned|retired|deceased|suspend/i;
  const activeEmployees = employees.filter((employee) => !inactive.test(compact(employee.status)));
  const isSelf = (candidate: DleEmployeeDirectoryRow) =>
    employeeRequestMatches(candidate, requester.employeeId)
    || (requester.employeeCode && employeeRequestMatches(candidate, requester.employeeCode));

  const matchReference = (reference: string, source: ResolvedLineManager['source']) => {
    if (!reference) return null;
    const found = activeEmployees.find((employee) => !isSelf(employee) && referenceMatchesEmployee(employee, reference));
    return found ? { employee: found, label: found.fullName, source } : null;
  };

  const reportingManager = matchReference(compact(requester.managerName), 'reporting-manager');
  if (reportingManager) return reportingManager;

  const functionalManager = matchReference(compact(requester.functionalManager), 'functional-manager');
  if (functionalManager) return functionalManager;

  const departmentHead = matchReference(compact(requester.departmentHead), 'department-head');
  if (departmentHead) return departmentHead;

  const department = compact(requester.department).toLowerCase();
  if (!department) return null;

  const departmentHeadName = activeEmployees
    .filter((employee) => compact(employee.department).toLowerCase() === department && compact(employee.departmentHead))
    .map((employee) => compact(employee.departmentHead))[0];
  if (departmentHeadName) {
    const inferredHead = activeEmployees.find((employee) => !isSelf(employee) && namesMatch(employee.fullName, departmentHeadName));
    if (inferredHead) return { employee: inferredHead, label: inferredHead.fullName, source: 'department-head' };
  }

  return null;
};

export const notifyLineManagerLeaveSubmitted = async (input: {
  request: EssLeaveRequest;
  requester: DleEmployeeDirectoryRow;
  manager: DleEmployeeDirectoryRow;
  actorName: string;
  baseUrl?: string | null;
}) => {
  const session = leaveSystemSession(input.actorName);
  const requestLabel = input.request.title || `${input.request.leaveType} leave`;
  await safeLeaveNotification('line manager submission notification', () =>
    deliverLeaveEmployeeNotification({
      session,
      employee: input.manager,
      title: 'Leave request awaiting your approval',
      body: `${input.requester.fullName} submitted ${requestLabel} (${input.request.startDate} to ${input.request.endDate}). Review in ESS Approvals within ${workflowDeadlineDays} working days.`,
      severity: 'warning',
      requestId: input.request.id,
      kind: 'Approval',
      href: '/workforce-portal?tab=leave&leaveSection=Approvals',
      sendEmail: () => sendLeaveApprovalRequestEmail({
        request: input.request,
        requester: input.requester,
        recipient: input.manager,
        approverKind: 'line-manager',
        baseUrl: input.baseUrl,
      }),
    }));
};

const resolveHrRecipients = (employees: DleEmployeeDirectoryRow[]) =>
  employees.filter((employee) => /hr manager|hr head|hr officer|leave administrator/i.test(`${employee.jobTitle || ''} ${employee.designation || ''}`));

export const emailLeaveApproversForRequest = async (input: {
  request: EssLeaveRequest;
  requester: DleEmployeeDirectoryRow;
  baseUrl?: string | null;
}) => {
  const { employees } = await readPayrollEmployees();
  if (input.request.status === 'Line Manager Review') {
    const recipient = resolveLineManagerRecipient(input.requester, employees);
    if (recipient) {
      await sendLeaveApprovalRequestEmail({
        request: input.request,
        requester: input.requester,
        recipient,
        approverKind: 'line-manager',
        baseUrl: input.baseUrl,
      });
    }
    return;
  }
  if (input.request.status === 'HR Review') {
    const recipients = resolveHrRecipients(employees);
    for (const recipient of recipients.slice(0, 5)) {
      await sendLeaveApprovalRequestEmail({
        request: input.request,
        requester: input.requester,
        recipient,
        approverKind: 'hr',
        baseUrl: input.baseUrl,
      });
    }
  }
};

const hrRoles = new Set(['hr manager', 'hr head', 'hr officer', 'leave administrator', 'system administrator', 'super administrator']);
const managerRoles = new Set(['supervisor', 'department manager', 'line manager', 'manager', 'head of department']);

export type LeaveApproverKind = 'line-manager' | 'hr' | null;

export const resolveLeaveApproverKind = (input: {
  actor: DleEmployeeDirectoryRow;
  requester: DleEmployeeDirectoryRow;
  request: EssLeaveRequest;
  roles?: string[];
  isGlobalAdmin?: boolean;
  employees?: DleEmployeeDirectoryRow[];
}): LeaveApproverKind => {
  const { actor, requester, request, roles = [], isGlobalAdmin, employees = [] } = input;
  if (!['Line Manager Review', 'HR Review'].includes(request.status)) return null;
  const roleText = roles.map((role) => role.toLowerCase());
  const isHr = isGlobalAdmin || roleText.some((role) => hrRoles.has(role) || /hr/.test(role));
  if (request.status === 'HR Review' && isHr) return 'hr';

  const resolvedManager = employees.length ? resolveLineManagerForEmployee(requester, employees) : null;
  const isAssignedManager = resolvedManager ? employeeRequestMatches(actor, resolvedManager.employee.employeeId) : false;
  if (request.lineManagerEmployeeId && employeeRequestMatches(actor, request.lineManagerEmployeeId)) {
    if (request.status === 'Line Manager Review') return 'line-manager';
  }

  const managerName = resolvedManager?.label || managerOwnerFor(requester);
  const isManagerRole = roleText.some((role) => managerRoles.has(role) || /manager|supervisor|head/.test(role));
  const isNamedManager = namesMatch(actor.fullName, managerName)
    || namesMatch(actor.fullName, requester.managerName || '')
    || namesMatch(actor.fullName, requester.departmentHead || '')
    || namesMatch(actor.fullName, requester.functionalManager || '');
  const sameDepartmentHead = compact(actor.departmentHead).toLowerCase() === compact(actor.fullName).toLowerCase()
    && compact(actor.department).toLowerCase() === compact(requester.department).toLowerCase();
  if (request.status === 'Line Manager Review' && (isAssignedManager || isNamedManager || isManagerRole || sameDepartmentHead || isGlobalAdmin)) {
    return 'line-manager';
  }
  return null;
};

export const pendingLeaveApprovalsForActor = (
  actor: DleEmployeeDirectoryRow,
  requests: EssLeaveRequest[],
  employees: DleEmployeeDirectoryRow[],
  roles: string[] = [],
  isGlobalAdmin = false,
) => {
  const employeeById = new Map(employees.flatMap((employee) => [
    [employee.employeeId, employee],
    [employee.employeeCode || '', employee],
  ].filter(([key]) => Boolean(key)) as Array<[string, DleEmployeeDirectoryRow]>));

  return requests
    .filter((request) => /leave/i.test(request.category))
    .filter((request) => ['Line Manager Review', 'HR Review'].includes(request.status))
    .map((request) => {
      const requester = employeeById.get(request.employeeId) || employees.find((employee) => employeeRequestMatches(employee, request.employeeId)) || null;
      if (!requester) return null;
      const approverKind = resolveLeaveApproverKind({ actor, requester, request, roles, isGlobalAdmin, employees });
      if (!approverKind) return null;
      const requesterAny = requester as DleEmployeeDirectoryRow & { designation?: string; jobTitle?: string; costCenter?: string; salaryGrade?: string };
      const elapsedWorkingDays = request.submittedAt ? workingDaysSince(request.submittedAt) : 0;
      const slaStatus = elapsedWorkingDays > workflowDeadlineDays
        ? 'Overdue'
        : elapsedWorkingDays >= Math.ceil(workflowDeadlineDays * 0.75)
          ? 'At Risk'
          : 'On Track';
      return {
        id: request.id,
        requestId: request.id,
        title: request.title || `${request.leaveType || 'Leave'} Request`,
        employee: requester.fullName,
        employeeId: requester.employeeId,
        employeeCode: requesterAny.employeeCode || requester.employeeId,
        type: request.leaveType || 'Leave',
        days: request.days || 0,
        startDate: request.startDate || '',
        endDate: request.endDate || '',
        stage: approverKind === 'line-manager' ? 'Line Manager Review' : 'HR Review',
        status: request.status,
        reliever: request.relieverName || 'Not configured',
        handover: request.handover || 'Required',
        conflict: 'No conflict',
        approverKind,
        department: requesterAny.department || 'Unassigned',
        designation: requesterAny.jobTitle || requesterAny.designation || 'Employee',
        costCentre: requesterAny.costCenter || requesterAny.department || 'Unassigned',
        appliedOn: request.submittedAt || '',
        priority: request.priority || 'Normal',
        reason: request.reason || '',
        slaStatus,
        elapsedWorkingDays,
        slaWorkingDays: workflowDeadlineDays,
        attachmentNames: request.attachmentNames || [],
        comments: (request.comments || []).map((entry) => ({ at: entry.at, actor: entry.actor, comment: entry.comment })),
      };
    })
    .filter(Boolean) as Array<{
      id: string;
      requestId: string;
      title: string;
      employee: string;
      employeeId: string;
      employeeCode: string;
      type: string;
      days: number;
      startDate: string;
      endDate: string;
      stage: string;
      status: string;
      reliever: string;
      handover: string;
      conflict: string;
      approverKind: LeaveApproverKind;
      department: string;
      designation: string;
      costCentre: string;
      appliedOn: string;
      priority: string;
      reason: string;
      slaStatus: string;
      elapsedWorkingDays: number;
      slaWorkingDays: number;
      attachmentNames: string[];
      comments: Array<{ at: string; actor: string; comment: string }>;
    }>;
};

export const listLiveLeaveApprovalNotifications = async (input: {
  actor: DleEmployeeDirectoryRow;
  employees: DleEmployeeDirectoryRow[];
  roles?: string[];
  isGlobalAdmin?: boolean;
}) => {
  const requests = await readAllEssRequests();
  const queue = pendingLeaveApprovalsForActor(
    input.actor,
    requests.filter((item) => /leave/i.test(item.category) && item.startDate && item.endDate),
    input.employees,
    input.roles || [],
    input.isGlobalAdmin,
  );
  return queue.map((item) => ({
    id: `live-leave-${item.id}`,
    kind: 'Approval' as const,
    module: 'Leave Management',
    title: `Leave approval required: ${item.employee}`,
    body: `${item.type} · ${item.startDate} to ${item.endDate} · ${item.days} day(s) · ${item.stage}`,
    severity: 'warning' as const,
    status: 'Unread' as const,
    href: '/workforce-portal?tab=leave&leaveSection=Approvals',
    createdAt: new Date().toISOString(),
    actor: 'Leave Workflow',
    channels: ['In-App'] as Array<'In-App' | 'Email' | 'SMS'>,
    metadata: { requestId: item.id, live: true },
  }));
};

export type LeaveCalendarConfig = {
  blockedPeriods: Array<{ id: string; label: string; startDate: string; endDate: string; reason: string }>;
  holidays: Array<{ id: string; label: string; date: string }>;
};

export const readLeaveCalendarConfig = async (): Promise<LeaveCalendarConfig> => {
  try {
    const parsed = JSON.parse(await readFile(LEAVE_CALENDAR_CONFIG_PATH, 'utf8')) as LeaveCalendarConfig;
    return {
      blockedPeriods: Array.isArray(parsed.blockedPeriods) ? parsed.blockedPeriods : [],
      holidays: Array.isArray(parsed.holidays) ? parsed.holidays : [],
    };
  } catch {
    return { blockedPeriods: [], holidays: [] };
  }
};

const overlapsBlockedPeriod = (startDate: string, endDate: string, config: LeaveCalendarConfig) =>
  config.blockedPeriods.some((period) => startDate <= period.endDate && endDate >= period.startDate);

const leaveDatesOverlap = (startDate: string, endDate: string, otherStart: string, otherEnd: string) =>
  startDate <= otherEnd && endDate >= otherStart;

const employeeLeaveLookupKeys = (employee: DleEmployeeDirectoryRow) =>
  new Set(
    buildEssEmployeeLookupKeys(employee)
      .flatMap((key) => [key, normalizePayrollMatchKey(key)])
      .map((key) => compact(key).toUpperCase())
      .filter(Boolean),
  );

const recordMatchesEmployeeKeys = (recordEmployeeId: string, keys: Set<string>) => {
  const candidates = [recordEmployeeId, normalizePayrollMatchKey(recordEmployeeId)]
    .map((key) => compact(key).toUpperCase())
    .filter(Boolean);
  return candidates.some((key) => keys.has(key));
};

const blockingLeaveStatuses = new Set([
  'Draft',
  'Submitted',
  'Under Review',
  'Approved',
  'Line Manager Review',
  'HR Review',
  'Finance Review',
]);

const formatConflictMessage = (input: {
  leaveType: string;
  startDate: string;
  endDate: string;
  status: string;
  source?: string;
  id?: string;
}) => {
  const reference = input.id ? ` (${input.id})` : '';
  const source = input.source ? ` from ${input.source}` : '';
  return `Overlapping leave request detected${reference}: ${input.leaveType} ${input.startDate} to ${input.endDate} is ${input.status}${source}. Check My Applications or ask HR to clear the existing record before applying again.`;
};

export const findConflictingLeaveApplication = async (input: {
  employee: DleEmployeeDirectoryRow;
  startDate: string;
  endDate: string;
  excludeRequestId?: string;
}) => {
  const keys = employeeLeaveLookupKeys(input.employee);
  await readLeaveApplicationsForReconciliation({ syncEss: true });
  const payload = await readLeaveManagementPayload('applications', 'Leave Administrator');

  const hrisConflict = payload.applications.find((item) =>
    recordMatchesEmployeeKeys(item.employeeId, keys)
    && item.id !== input.excludeRequestId
    && blockingLeaveStatuses.has(item.status)
    && leaveDatesOverlap(input.startDate, input.endDate, item.startDate, item.endDate),
  );
  if (hrisConflict) {
    return {
      id: hrisConflict.id,
      leaveType: hrisConflict.leaveType,
      startDate: hrisConflict.startDate,
      endDate: hrisConflict.endDate,
      status: hrisConflict.status,
      source: hrisConflict.sourceSystem || 'HRIS',
      message: formatConflictMessage({
        id: hrisConflict.id,
        leaveType: hrisConflict.leaveType,
        startDate: hrisConflict.startDate,
        endDate: hrisConflict.endDate,
        status: hrisConflict.status,
        source: hrisConflict.sourceSystem || 'HRIS',
      }),
    };
  }

  const closedRequestIds = new Set(
    payload.applications
      .filter((item) => ['Cancelled', 'Rejected', 'Terminated', 'Withdrawn', 'Completed'].includes(item.status))
      .map((item) => item.id),
  );

  const essConflict = (await readEssLeaveRequests()).find((item) =>
    employeeRequestMatches(input.employee, item.employeeId)
    && item.id !== input.excludeRequestId
    && !closedRequestIds.has(item.id)
    && blockingLeaveStatuses.has(item.status)
    && item.startDate
    && item.endDate
    && leaveDatesOverlap(input.startDate, input.endDate, item.startDate, item.endDate),
  );
  if (essConflict) {
    return {
      id: essConflict.id,
      leaveType: essConflict.leaveType || 'Leave',
      startDate: essConflict.startDate || input.startDate,
      endDate: essConflict.endDate || input.endDate,
      status: essConflict.status,
      source: 'ESS',
      message: formatConflictMessage({
        id: essConflict.id,
        leaveType: essConflict.leaveType || 'Leave',
        startDate: essConflict.startDate || input.startDate,
        endDate: essConflict.endDate || input.endDate,
        status: essConflict.status,
        source: 'ESS',
      }),
    };
  }

  return null;
};

export const validateEssLeaveApplication = async (input: {
  employee: DleEmployeeDirectoryRow;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  relieverEmployeeId: string;
  excludeRequestId?: string;
}) => {
  const { employee, leaveType, startDate, endDate, days, relieverEmployeeId } = input;
  const employeeSource = await readPayrollEmployees();
  const reliever = employeeSource.employees.find((item) => item.employeeId === relieverEmployeeId || item.employeeCode === relieverEmployeeId);
  if (!reliever) return { ok: false as const, status: 400, message: 'A department reliever must be selected.' };
  if (compact(reliever.department).toLowerCase() !== compact(employee.department).toLowerCase()) {
    return { ok: false as const, status: 400, message: 'Reliever must be selected from the same department.' };
  }
  if ((reliever.employeeCode || reliever.employeeId) === (employee.employeeCode || employee.employeeId)) {
    return { ok: false as const, status: 400, message: 'Employee cannot be selected as own reliever.' };
  }

  const calendar = await readLeaveCalendarConfig();
  if (overlapsBlockedPeriod(startDate, endDate, calendar)) {
    return { ok: false as const, status: 409, message: 'Leave application falls within a blocked period.' };
  }

  const payload = await readLeaveManagementPayload('applications', 'Leave Administrator');
  const conflict = await findConflictingLeaveApplication({
    employee,
    startDate,
    endDate,
    excludeRequestId: input.excludeRequestId,
  });
  if (conflict) return { ok: false as const, status: 409, message: conflict.message };

  const balanceKeys = [...employeeLeaveLookupKeys(employee)];
  const employeeBalance = payload.balances.find((balance) =>
    balanceKeys.includes(compact(balance.employeeId).toUpperCase()) && balance.leaveType === leaveType,
  ) || payload.balances.find((balance) =>
    balanceKeys.includes(compact(balance.employeeId).toUpperCase()),
  );

  const validation = validateLeaveAction('apply', 'Employee', payload, {
    employeeId: employee.employeeId,
    employeeCode: employee.employeeCode,
    employeeCategory: employee.employeeCategory || employee.employmentType,
    leaveType,
    days,
    startDate,
    endDate,
    confirmed: isConfirmedPermanent(employee),
    usesCarryForward: /carry forward/i.test(leaveType),
    overlaps: false,
    blockedPeriod: false,
    availableBalance: employeeBalance?.currentBalance,
  });
  if (!validation.ok) return { ok: false as const, status: validation.status, message: validation.message };
  return { ok: true as const };
};

export const upsertEssLeaveRequestToDb = async (item: EssLeaveRequest, employees: DleEmployeeDirectoryRow[]) => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) return;
  const employeeById = new Map(employees.flatMap((employee) => [
    [employee.employeeId, employee],
    [employee.employeeCode, employee],
  ].filter(([key]) => Boolean(key)) as Array<[string, DleEmployeeDirectoryRow]>));
  const employee = employeeById.get(item.employeeId);
  const rawStatus = item.status;
  const initialStatus = normalizeLeaveStatus(rawStatus);
  const status = ['Submitted', 'Under Review'].includes(initialStatus) && workingDaysSince(item.updatedAt || item.submittedAt || new Date().toISOString()) > workflowDeadlineDays
    ? 'Terminated'
    : initialStatus;
  const leaveType = clean(item.leaveType) || 'Annual Leave';
  const startDate = dateOnly(item.startDate);
  const endDate = dateOnly(item.endDate);
  if (!startDate || !endDate) return;
  const days = Number(item.days || 0);
  const exceptions = [
    ...(days <= 0 ? ['Leave request has no calculated duration'] : []),
    ...(!employee ? ['Employee record not found in HRIS employee master'] : []),
    ...(leaveType === 'Annual Leave' && employee && !isFourteenDayPaidLeaveEmployee(employee) && !isConfirmedPermanent(employee) ? ['Annual Leave locked pending confirmation of appointment'] : []),
  ];
  const blocked = exceptions.some((entry) => entry.includes('not found') || entry.includes('locked'));
  await pool.request()
    .input('Id', sql.NVarChar(120), item.id)
    .input('SourceSystem', sql.NVarChar(80), 'ESS Leave Request')
    .input('EmployeeId', sql.NVarChar(80), employee?.employeeId || item.employeeId)
    .input('FullName', sql.NVarChar(220), employee?.fullName || item.employeeId)
    .input('Department', sql.NVarChar(180), employee?.department || 'Unassigned')
    .input('ManagerName', sql.NVarChar(180), employee?.managerName || employee?.departmentHead || 'Unassigned')
    .input('Location', sql.NVarChar(180), employee?.location || employee?.workLocation || 'Unassigned')
    .input('EmployeeCategory', sql.NVarChar(120), employee?.employeeCategory || employee?.employmentType || 'Unassigned')
    .input('LeaveType', sql.NVarChar(120), leaveType)
    .input('StartDate', sql.Date, startDate)
    .input('EndDate', sql.Date, endDate)
    .input('Days', sql.Decimal(9, 2), round2(days))
    .input('StatusName', sql.NVarChar(40), status)
    .input('WorkflowStage', sql.NVarChar(40), workflowStageForEssStatus(rawStatus, status))
    .input('ApprovalStatus', sql.NVarChar(60), approvalStatusFor(status, rawStatus))
    .input('PolicyComplianceStatus', sql.NVarChar(40), blocked ? 'Blocked' : exceptions.length ? 'Attention Required' : 'Compliant')
    .input('BalanceImpact', sql.Decimal(9, 2), leaveType === 'Unpaid Leave' ? 0 : round2(days))
    .input('AvailableBalance', sql.Decimal(9, 2), 0)
    .input('ActingOfficer', sql.NVarChar(180), clean(item.relieverName) || clean(item.relieverEmployeeId) || 'Not configured')
    .input('SupportingDocuments', sql.Int, Number(item.attachmentNames?.length || 0))
    .input('ExceptionsJson', sql.NVarChar(sql.MAX), JSON.stringify(exceptions))
    .input('WorkflowJson', sql.NVarChar(sql.MAX), JSON.stringify(item.workflow || []))
    .input('CommentsJson', sql.NVarChar(sql.MAX), JSON.stringify(item.comments || []))
    .query(`
MERGE [hris].[LeaveApplications] AS target
USING (SELECT @Id AS [Id]) AS source
ON target.[Id] = source.[Id]
WHEN MATCHED AND target.[StatusName] NOT IN (N'Cancelled', N'Rejected', N'Terminated', N'Completed', N'Withdrawn') THEN UPDATE SET
  [SourceSystem]=@SourceSystem,[EmployeeId]=@EmployeeId,[FullName]=@FullName,[Department]=@Department,[ManagerName]=@ManagerName,
  [Location]=@Location,[EmployeeCategory]=@EmployeeCategory,[LeaveType]=@LeaveType,[StartDate]=@StartDate,[EndDate]=@EndDate,
  [Days]=@Days,[StatusName]=@StatusName,[WorkflowStage]=@WorkflowStage,[ApprovalStatus]=@ApprovalStatus,
  [PolicyComplianceStatus]=@PolicyComplianceStatus,[BalanceImpact]=@BalanceImpact,[ActingOfficer]=@ActingOfficer,
  [SupportingDocuments]=@SupportingDocuments,[ExceptionsJson]=@ExceptionsJson,[WorkflowJson]=@WorkflowJson,[CommentsJson]=@CommentsJson,[UpdatedAt]=SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT
  ([Id],[SourceSystem],[EmployeeId],[FullName],[Department],[ManagerName],[Location],[EmployeeCategory],[LeaveType],[StartDate],[EndDate],
   [Days],[StatusName],[WorkflowStage],[ApprovalStatus],[PolicyComplianceStatus],[BalanceImpact],[AvailableBalance],[ActingOfficer],[SupportingDocuments],[ExceptionsJson],[WorkflowJson],[CommentsJson])
VALUES
  (@Id,@SourceSystem,@EmployeeId,@FullName,@Department,@ManagerName,@Location,@EmployeeCategory,@LeaveType,@StartDate,@EndDate,
   @Days,@StatusName,@WorkflowStage,@ApprovalStatus,@PolicyComplianceStatus,@BalanceImpact,@AvailableBalance,@ActingOfficer,@SupportingDocuments,@ExceptionsJson,@WorkflowJson,@CommentsJson);`);
};

export const cancelEssLeaveRequest = async (input: {
  requestId: string;
  actorName: string;
  reason?: string;
  employee?: DleEmployeeDirectoryRow;
}) => {
  const requests = await readAllEssRequests();
  const found = requests.find((item) => item.id === input.requestId && /leave/i.test(item.category));
  if (!found) {
    const pool = await getDleEnterpriseDbPool();
    if (!pool) throw new Error('Leave request not found.');
    const existing = await pool.request()
      .input('Id', sql.NVarChar(120), input.requestId)
      .query(`SELECT TOP 1 [Id],[EmployeeId] FROM [hris].[LeaveApplications] WHERE [Id]=@Id;`);
    if (!existing.recordset[0]) throw new Error('Leave request not found.');
    if (input.employee) {
      const employeeId = String(existing.recordset[0].EmployeeId || '');
      if (!employeeRequestMatches(input.employee, employeeId)) {
        throw new Error('You can only withdraw your own leave request.');
      }
    }
  } else if (input.employee && !employeeRequestMatches(input.employee, found.employeeId)) {
    throw new Error('You can only withdraw your own leave request.');
  }

  const now = new Date().toISOString();
  if (found) {
    await writeAllEssRequests(requests.map((item) => item.id === input.requestId
      ? {
          ...item,
          status: 'Rejected',
          updatedAt: now,
          comments: [
            ...(item.comments || []),
            {
              at: now,
              actor: input.actorName,
              comment: input.reason || 'Leave request withdrawn to allow re-application.',
            },
          ],
        }
      : item));
  }

  const pool = await getDleEnterpriseDbPool();
  if (pool) {
    await pool.request()
      .input('Id', sql.NVarChar(120), input.requestId)
      .query(`
UPDATE [hris].[LeaveApplications]
SET [StatusName]=N'Cancelled',
    [WorkflowStage]=N'Closed',
    [ApprovalStatus]=N'Cancelled',
    [UpdatedAt]=SYSUTCDATETIME()
WHERE [Id]=@Id;`);
  }
  invalidateEssPortalCache();
  return { requestId: input.requestId, status: 'Cancelled' as const };
};

export const syncEssLeaveRequestById = async (requestId: string) => {
  const requests = await readEssLeaveRequests();
  const item = requests.find((request) => request.id === requestId);
  if (!item) return;
  const { employees } = await readPayrollEmployees();
  await upsertEssLeaveRequestToDb(item, employees);
};

export const saveLeaveAttachment = async (requestId: string, fileName: string, bytes: Buffer) => {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  const directory = path.join(LEAVE_ATTACHMENTS_ROOT, requestId);
  await mkdir(directory, { recursive: true });
  const target = path.join(directory, safeName);
  await writeFile(target, bytes);
  return safeName;
};

export const listLeaveAttachments = async (requestId: string) => {
  try {
    const directory = path.join(LEAVE_ATTACHMENTS_ROOT, requestId);
    const { readdir } = await import('node:fs/promises');
    return await readdir(directory);
  } catch {
    return [];
  }
};

export const transitionEssLeaveRequest = async (input: {
  requestId: string;
  action: 'approve' | 'reject';
  actorName: string;
  actor: DleEmployeeDirectoryRow;
  roles?: string[];
  isGlobalAdmin?: boolean;
  comment?: string;
  baseUrl?: string | null;
  emailAction?: boolean;
  approverKind?: LeaveApproverKind;
}) => {
  const requests = await expireStaleLeaveRequests(await readAllEssRequests());
  const found = requests.find((item) => item.id === input.requestId && /leave/i.test(item.category));
  if (!found) throw new Error('Leave request not found.');
  if (['Approved', 'Rejected', 'Terminated', 'Closed'].includes(found.status)) {
    throw new Error(`Leave request is already ${found.status}.`);
  }

  const { employees } = await readPayrollEmployees();
  const requester = employees.find((employee) => employeeRequestMatches(employee, found.employeeId));
  if (!requester) throw new Error('Requester employee record not found.');

  const approverKind = input.emailAction
    ? input.approverKind || null
    : resolveLeaveApproverKind({
      actor: input.actor,
      requester,
      request: found,
      roles: input.roles,
      isGlobalAdmin: input.isGlobalAdmin,
      employees,
    });
  if (!approverKind) throw new Error('You are not authorized to action this leave request.');
  if (input.action === 'approve' && approverKind === 'line-manager' && found.status !== 'Line Manager Review') {
    throw new Error('This request is not awaiting line manager approval.');
  }
  if (input.action === 'approve' && approverKind === 'hr' && found.status !== 'HR Review') {
    throw new Error('This request is not awaiting HR approval.');
  }

  const now = new Date().toISOString();
  const approved = input.action === 'approve';
  const nextStatus: EssLeaveRequestStatus = !approved
    ? 'Rejected'
    : found.status === 'Line Manager Review'
      ? 'HR Review'
      : 'Approved';

  const nextRequests = requests.map((item) =>
    item.id === input.requestId
      ? {
          ...item,
          status: nextStatus,
          updatedAt: now,
          workflow: leaveWorkflowFor(requester, item.relieverName || 'Selected reliever', nextStatus, now),
          comments: [
            ...(item.comments || []),
            {
              at: now,
              actor: input.actorName,
              comment: !approved
                ? input.comment || 'Leave request rejected.'
                : nextStatus === 'HR Review'
                  ? 'Line manager / supervisor approval completed. Routed to HR Manager / Head.'
                  : 'HR Manager / Head final approval completed.',
            },
          ],
        }
      : item,
  );
  await writeAllEssRequests(nextRequests);
  invalidateEssPortalCache();

  const updated = nextRequests.find((item) => item.id === input.requestId)!;
  await upsertEssLeaveRequestToDb(updated, employees);
  await auditLeaveAction({
    user: input.actorName,
    role: (approverKind === 'hr' ? 'HR Manager' : 'Supervisor') as LeaveRole,
    action: approved ? 'approve' : 'reject',
    record: input.requestId,
    oldValue: found.status,
    newValue: nextStatus,
    comments: input.comment || undefined,
    reason: input.comment || undefined,
  }).catch(() => undefined);

  let allowanceMessage: string | undefined;
  if (approved && nextStatus === 'Approved'
    && found.leaveType === 'Annual Leave'
    && Number(found.days || 0) >= dormantLongPolicy.allowanceMinimumAnnualDays
    && found.startDate) {
    const applications = await readLeaveApplicationsForReconciliation({ syncEss: true });
    const result = await postLeaveAllowanceOnAnnualLeaveApproval({
      employee: requester,
      applications,
      leaveType: found.leaveType,
      days: Number(found.days || 0),
      startDate: found.startDate,
      period: found.payrollPeriod || activePayrollPeriod(),
      requestId: found.id,
      source: 'ESS Leave Approval',
      actor: input.actorName,
    });
    if (result.posted) allowanceMessage = result.message;
  }

  if (!approved) {
    await notifyLeaveRejected({
      request: updated,
      requester,
      actorName: input.actorName,
      reason: input.comment,
      baseUrl: input.baseUrl,
    });
  } else if (nextStatus === 'HR Review') {
    await notifyLeaveAwaitingHrApproval({
      request: updated,
      requester,
      actorName: input.actorName,
      baseUrl: input.baseUrl,
    });
  } else if (nextStatus === 'Approved') {
    await notifyLeaveFinalApproval({
      request: updated,
      requester,
      actorName: input.actorName,
      baseUrl: input.baseUrl,
    });
  }

  return { request: updated, allowanceMessage };
};

const mapHrisActionToEssStatus = (action: LeaveActionId, currentRaw?: string): EssLeaveRequestStatus | null => {
  if (['approve', 'bulk-approve'].includes(action)) {
    if (currentRaw === 'Line Manager Review') return 'HR Review';
    return 'Approved';
  }
  if (['reject', 'bulk-reject'].includes(action)) return 'Rejected';
  if (action === 'cancel') return 'Rejected';
  if (action === 'withdraw') return 'Rejected';
  if (action === 'recall') return 'Submitted';
  return null;
};

export const applyHrisLeaveWorkflowAction = async (input: {
  action: LeaveActionId;
  applicationId: string;
  actor: string;
  role: LeaveRole;
  reason?: string;
}) => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE_Enterprise database is not available.');

  const requests = await readAllEssRequests();
  const essRequest = requests.find((item) => item.id === input.applicationId);
  const currentRaw = essRequest?.status;
  const nextEssStatus = mapHrisActionToEssStatus(input.action, currentRaw);

  const statusMap: Record<string, LeaveStatus> = {
    Approved: 'Approved',
    'HR Review': 'Under Review',
    'Line Manager Review': 'Under Review',
    Rejected: 'Rejected',
    Submitted: 'Submitted',
    Terminated: 'Terminated',
    Cancelled: 'Cancelled',
    Withdrawn: 'Withdrawn',
  };

  const hrisStatus: LeaveStatus = nextEssStatus
    ? statusMap[nextEssStatus] || normalizeLeaveStatus(nextEssStatus)
    : input.action === 'approve' || input.action === 'bulk-approve'
      ? 'Approved'
      : input.action === 'reject' || input.action === 'bulk-reject'
        ? 'Rejected'
        : 'Under Review';

  await pool.request()
    .input('Id', sql.NVarChar(120), input.applicationId)
    .input('StatusName', sql.NVarChar(40), hrisStatus)
    .input('WorkflowStage', sql.NVarChar(40), nextEssStatus ? workflowStageForEssStatus(nextEssStatus, hrisStatus) : 'HR')
    .input('ApprovalStatus', sql.NVarChar(60), nextEssStatus ? approvalStatusFor(hrisStatus, nextEssStatus) : approvalStatusFor(hrisStatus, hrisStatus))
    .query(`
UPDATE [hris].[LeaveApplications]
SET [StatusName]=@StatusName,[WorkflowStage]=@WorkflowStage,[ApprovalStatus]=@ApprovalStatus,[UpdatedAt]=SYSUTCDATETIME()
WHERE [Id]=@Id;`);

  await auditLeaveAction({
    user: input.actor,
    role: input.role,
    action: input.action,
    record: input.applicationId,
    oldValue: currentRaw || null,
    newValue: nextEssStatus || hrisStatus,
    comments: input.reason || undefined,
    reason: input.reason || undefined,
  }).catch(() => undefined);

  const { employees } = await readPayrollEmployees();

  if (essRequest && nextEssStatus) {
    const now = new Date().toISOString();
    const requester = resolveEmployeeReference(employees, essRequest.employeeId);
    const next = requests.map((item) => item.id === input.applicationId
      ? {
          ...item,
          status: nextEssStatus,
          updatedAt: now,
          workflow: requester
            ? leaveWorkflowFor(requester, item.relieverName || 'Selected reliever', nextEssStatus, now)
            : item.workflow,
          comments: [
            ...(item.comments || []),
            { at: now, actor: input.actor, comment: input.reason || `${input.action} recorded from HRIS Leave Management.` },
          ],
        }
      : item);
    await writeAllEssRequests(next);
    invalidateEssPortalCache();
  }

  const synced = (await readEssLeaveRequests()).find((item) => item.id === input.applicationId);
  if (synced) await upsertEssLeaveRequestToDb(synced, employees);

  const snapshot = await loadLeaveRequestSnapshot(input.applicationId, employees);
  if (snapshot) {
    const refreshedRequest = (await readAllEssRequests()).find((item) => item.id === input.applicationId) || snapshot.request;
    if (nextEssStatus === 'Approved') {
      await notifyLeaveFinalApproval({
        request: { ...refreshedRequest, status: 'Approved' },
        requester: snapshot.requester,
        actorName: input.actor,
      });
    } else if (nextEssStatus === 'Rejected') {
      await notifyLeaveRejected({
        request: { ...refreshedRequest, status: 'Rejected' },
        requester: snapshot.requester,
        actorName: input.actor,
        reason: input.reason,
      });
    } else if (nextEssStatus === 'HR Review') {
      await notifyLeaveAwaitingHrApproval({
        request: { ...refreshedRequest, status: 'HR Review' },
        requester: snapshot.requester,
        actorName: input.actor,
      });
    }
  }

  return { applicationId: input.applicationId, status: hrisStatus, essStatus: nextEssStatus };
};

export const processLeaveAccrualRun = async (actor: string) => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE_Enterprise database is not available.');
  const { employees } = await readPayrollEmployees();
  let updated = 0;
  for (const employee of employees) {
    const entitlement = employee.employeeCategory?.toLowerCase().includes('junior') ? 25 : 30;
    await pool.request()
      .input('EmployeeId', sql.NVarChar(80), employee.employeeId)
      .input('FullName', sql.NVarChar(220), employee.fullName)
      .input('Department', sql.NVarChar(180), employee.department || 'Unassigned')
      .input('LeaveType', sql.NVarChar(120), 'Annual Leave')
      .input('Accrued', sql.Decimal(9, 2), entitlement / 12)
      .query(`
MERGE [hris].[LeaveBalances] AS target
USING (SELECT @EmployeeId AS EmployeeId, @LeaveType AS LeaveType) AS source
ON target.EmployeeId = source.EmployeeId AND target.LeaveType = source.LeaveType
WHEN MATCHED THEN UPDATE SET
  [AccruedBalance] = ISNULL(target.[AccruedBalance],0) + @Accrued,
  [CurrentBalance] = ISNULL(target.[CurrentBalance],0) + @Accrued,
  [UpdatedAt] = SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT
  ([EmployeeId],[FullName],[Department],[LeaveType],[SourceSystem],[AccruedBalance],[UsedBalance],[PendingBalance],[CurrentBalance],[CarryForwardBalance],[ForfeitedBalance],[LiabilityValue],[StatusName])
VALUES
  (@EmployeeId,@FullName,@Department,@LeaveType,N'Accrual Engine',@Accrued,0,0,@Accrued,0,0,0,N'Healthy');`);
    updated += 1;
  }
  return { actor, updated, message: `Monthly accrual processed for ${updated} employees.` };
};

export const processLeaveCarryForwardRun = async (actor: string) => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE_Enterprise database is not available.');
  const cap = dormantLongPolicy.carryForwardCap;
  const result = await pool.request()
    .input('Cap', sql.Decimal(9, 2), cap)
    .query(`
UPDATE [hris].[LeaveBalances]
SET [CarryForwardBalance] = CASE WHEN [CurrentBalance] > @Cap THEN @Cap ELSE [CurrentBalance] END,
    [ForfeitedBalance] = CASE WHEN [CurrentBalance] > @Cap THEN [CurrentBalance] - @Cap ELSE 0 END,
    [UpdatedAt] = SYSUTCDATETIME()
WHERE [LeaveType] = N'Annual Leave';`);
  return { actor, rows: result.rowsAffected?.[0] || 0, message: `Carry-forward capped at ${cap} days.` };
};

export const closeLeaveYearRun = async (actor: string) => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE_Enterprise database is not available.');
  await pool.request().query(`
UPDATE [hris].[LeaveBalances]
SET [UsedBalance]=0,[PendingBalance]=0,[AccruedBalance]=0,[CurrentBalance]=[CarryForwardBalance],[UpdatedAt]=SYSUTCDATETIME()
WHERE [LeaveType]=N'Annual Leave';`);
  return { actor, message: 'Leave year closed. Balances reset to carry-forward values.' };
};

export const notifyLeaveWorkflow = async (
  session: SessionPayload,
  input: {
    title: string;
    body: string;
    severity?: 'info' | 'success' | 'warning' | 'critical';
    recipientEmployeeCode?: string;
    recipient?: DleEmployeeDirectoryRow;
    recipientRoles?: string[];
    requestId: string;
    request?: EssLeaveRequest;
    requester?: DleEmployeeDirectoryRow;
    emailEvent?: 'submitted' | 'manager-approved' | 'approved' | 'rejected';
    sendEmail?: boolean;
    baseUrl?: string | null;
  },
  createNotification: typeof createEnterpriseNotification = createEnterpriseNotification,
) => {
  const recipientCode = input.recipient
    ? employeeNotificationCode(input.recipient)
    : input.recipientEmployeeCode;

  await createNotification(session, {
    kind: 'Approval',
    module: 'Leave Management',
    title: input.title,
    body: input.body,
    severity: input.severity || 'info',
    recipientEmployeeCode: recipientCode,
    recipientRoles: input.recipientRoles || [],
    href: `/workforce-portal?tab=leave`,
    channels: ['In-App', 'Email'],
    metadata: { requestId: input.requestId },
  });

  const shouldEmail = input.sendEmail ?? Boolean(input.recipient || input.emailEvent);
  if (!shouldEmail || !input.request || !input.requester) return;

  const emailRecipient = input.recipient || input.requester;
  const emailEvent = input.emailEvent
    || (input.title.toLowerCase().includes('reject') ? 'rejected'
      : input.title.toLowerCase().includes('approved') ? 'approved'
        : input.title.toLowerCase().includes('awaiting hr') ? 'manager-approved'
          : 'submitted');

  await safeLeaveNotification('workflow email', () => sendLeaveWorkflowEmail({
    event: emailEvent,
    request: input.request!,
    requester: input.requester!,
    recipient: emailRecipient,
    actorName: session.fullName || session.username,
    extra: input.body,
    baseUrl: input.baseUrl,
  }));
};
