import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sql from 'mssql';
import type { SessionPayload } from '@/lib/auth/session';
import { getDleEnterpriseDbPool, type DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import {
  dormantLongPolicy,
  isConfirmedPermanent,
  isFourteenDayPaidLeaveEmployee,
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
import { sendLeaveApprovalRequestEmail, sendLeaveWorkflowEmail } from '@/lib/mail-service';
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
) => [
  { stage: 'Employee Request', owner: employee.fullName, status: 'Completed', actedAt: now, comment: 'Submitted from Employee Self-Service.' },
  {
    stage: 'Line Manager / Lead / Supervisor',
    owner: managerOwnerFor(employee),
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

export const employeeRequestMatches = (employee: DleEmployeeDirectoryRow, requestEmployeeId: string) => {
  const lookup = new Set(employeeKeys(employee));
  return lookup.has(normalizePayrollMatchKey(requestEmployeeId));
};

const namesMatch = (left: string, right: string) => {
  const a = clean(left).toLowerCase();
  const b = clean(right).toLowerCase();
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
};

const resolveLineManagerRecipient = (requester: DleEmployeeDirectoryRow, employees: DleEmployeeDirectoryRow[]) => {
  const managerName = managerOwnerFor(requester);
  return employees.find((employee) => namesMatch(employee.fullName, managerName)
    || namesMatch(employee.fullName, requester.managerName || '')
    || namesMatch(employee.fullName, requester.departmentHead || '')) || null;
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
}): LeaveApproverKind => {
  const { actor, requester, request, roles = [], isGlobalAdmin } = input;
  if (!['Line Manager Review', 'HR Review'].includes(request.status)) return null;
  const roleText = roles.map((role) => role.toLowerCase());
  const isHr = isGlobalAdmin || roleText.some((role) => hrRoles.has(role) || /hr/.test(role));
  if (request.status === 'HR Review' && isHr) return 'hr';
  const managerName = managerOwnerFor(requester);
  const isManagerRole = roleText.some((role) => managerRoles.has(role) || /manager|supervisor|head/.test(role));
  const isNamedManager = namesMatch(actor.fullName, managerName)
    || namesMatch(actor.fullName, requester.managerName || '')
    || namesMatch(actor.fullName, requester.departmentHead || '');
  const sameDepartmentHead = compact(actor.departmentHead).toLowerCase() === compact(actor.fullName).toLowerCase()
    && compact(actor.department).toLowerCase() === compact(requester.department).toLowerCase();
  if (request.status === 'Line Manager Review' && (isNamedManager || isManagerRole || sameDepartmentHead || isGlobalAdmin)) return 'line-manager';
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
      const approverKind = resolveLeaveApproverKind({ actor, requester, request, roles, isGlobalAdmin });
      if (!approverKind) return null;
      return {
        id: request.id,
        employee: requester.fullName,
        employeeId: requester.employeeId,
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
      };
    })
    .filter(Boolean) as Array<{
      id: string;
      employee: string;
      employeeId: string;
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
    }>;
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

export const validateEssLeaveApplication = async (input: {
  employee: DleEmployeeDirectoryRow;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  relieverEmployeeId: string;
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
  const overlap = payload.applications.some((item) =>
    item.employeeId === employee.employeeId
    && !['Rejected', 'Cancelled', 'Terminated', 'Withdrawn', 'Completed'].includes(item.status)
    && startDate <= item.endDate
    && endDate >= item.startDate,
  );
  if (overlap) return { ok: false as const, status: 409, message: 'Overlapping leave request detected.' };

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
    .query(`
MERGE [hris].[LeaveApplications] AS target
USING (SELECT @Id AS [Id]) AS source
ON target.[Id] = source.[Id]
WHEN MATCHED THEN UPDATE SET
  [SourceSystem]=@SourceSystem,[EmployeeId]=@EmployeeId,[FullName]=@FullName,[Department]=@Department,[ManagerName]=@ManagerName,
  [Location]=@Location,[EmployeeCategory]=@EmployeeCategory,[LeaveType]=@LeaveType,[StartDate]=@StartDate,[EndDate]=@EndDate,
  [Days]=@Days,[StatusName]=@StatusName,[WorkflowStage]=@WorkflowStage,[ApprovalStatus]=@ApprovalStatus,
  [PolicyComplianceStatus]=@PolicyComplianceStatus,[BalanceImpact]=@BalanceImpact,[ActingOfficer]=@ActingOfficer,
  [SupportingDocuments]=@SupportingDocuments,[ExceptionsJson]=@ExceptionsJson,[UpdatedAt]=SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT
  ([Id],[SourceSystem],[EmployeeId],[FullName],[Department],[ManagerName],[Location],[EmployeeCategory],[LeaveType],[StartDate],[EndDate],
   [Days],[StatusName],[WorkflowStage],[ApprovalStatus],[PolicyComplianceStatus],[BalanceImpact],[AvailableBalance],[ActingOfficer],[SupportingDocuments],[ExceptionsJson])
VALUES
  (@Id,@SourceSystem,@EmployeeId,@FullName,@Department,@ManagerName,@Location,@EmployeeCategory,@LeaveType,@StartDate,@EndDate,
   @Days,@StatusName,@WorkflowStage,@ApprovalStatus,@PolicyComplianceStatus,@BalanceImpact,@AvailableBalance,@ActingOfficer,@SupportingDocuments,@ExceptionsJson);`);
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

  await sendLeaveWorkflowEmail({
    event: !approved ? 'rejected' : nextStatus === 'HR Review' ? 'manager-approved' : 'approved',
    request: updated,
    requester,
    actorName: input.actorName,
    baseUrl: input.baseUrl,
  });

  if (approved && nextStatus === 'HR Review') {
    await emailLeaveApproversForRequest({ request: updated, requester, baseUrl: input.baseUrl });
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

  if (essRequest && nextEssStatus) {
    const now = new Date().toISOString();
    const next = requests.map((item) => item.id === input.applicationId
      ? {
          ...item,
          status: nextEssStatus,
          updatedAt: now,
          comments: [
            ...(item.comments || []),
            { at: now, actor: input.actor, comment: input.reason || `${input.action} recorded from HRIS Leave Management.` },
          ],
        }
      : item);
    await writeAllEssRequests(next);
    invalidateEssPortalCache();
  }

  const { employees } = await readPayrollEmployees();
  const synced = (await readEssLeaveRequests()).find((item) => item.id === input.applicationId);
  if (synced) await upsertEssLeaveRequestToDb(synced, employees);

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
    recipientRoles?: string[];
    requestId: string;
    request?: EssLeaveRequest;
    requester?: DleEmployeeDirectoryRow;
  },
  createNotification: typeof createEnterpriseNotification = createEnterpriseNotification,
) => {
  await createNotification(session, {
    kind: 'Approval',
    module: 'Leave Management',
    title: input.title,
    body: input.body,
    severity: input.severity || 'info',
    recipientEmployeeCode: input.recipientEmployeeCode,
    recipientRoles: input.recipientRoles || [],
    href: `/workforce-portal?tab=leave`,
    channels: ['In-App', 'Email'],
    metadata: { requestId: input.requestId },
  });
  if (input.request && input.requester) {
    await sendLeaveWorkflowEmail({
      event: input.title.toLowerCase().includes('reject') ? 'rejected' : input.title.toLowerCase().includes('approved') ? 'approved' : 'submitted',
      request: input.request,
      requester: input.requester,
      actorName: session.fullName || session.username,
      extra: input.body,
    });
  }
};
