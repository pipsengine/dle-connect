import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sql from 'mssql';
import type { SessionPayload } from '@/lib/auth/session';
import { getDleEnterpriseDbPool, type DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import {
  dormantLongPolicy,
  isConfirmedPermanent,
  isFourteenDayPaidLeaveEmployee,
  annualLeaveEntitlementForEmployee,
  auditLeaveAction,
  readLeaveApplicationsForReconciliation,
  validateLeaveAction,
  type LeaveActionId,
  type LeavePayload,
  type LeaveRole,
  type LeaveStatus,
  type WorkflowStage,
} from '@/lib/leave-management-store';
import { postLeaveAllowanceOnAnnualLeaveApproval } from '@/lib/payroll-leave-allowance-store';
import {
  approvalStatusForEss,
  isLeaveEssRequest,
  workflowStageForEssStatus,
} from '@/lib/leave-request-shared';
import { readPayrollEmployees } from '@/lib/payroll-employee-source';
import { activePayrollPeriod } from '@/lib/payroll-periods';
import { sendLeaveApprovalRequestEmail, sendLeaveRelieverAssignmentEmail, sendLeaveWorkflowEmail } from '@/lib/mail-service';
import { buildEssEmployeeLookupKeys } from '@/lib/ess-dashboard-store';
import { normalizePayrollMatchKey } from '@/lib/sage-people-payroll-store';
import { HRIS_LEAVE_SOURCE, isLegacySageLeaveImport, normalizeLeaveTypeName } from '@/lib/hris-leave-read';
import { createEnterpriseNotification } from '@/lib/enterprise-notifications-store';
import { invalidateEssPortalCache } from '@/lib/ess-portal-cache';
import { explicitDepartmentSupervisorCode } from '@/lib/department-reporting-manager-sync';

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

const DATA_DIR = process.env.DLE_HRIS_DATA_DIR
  ? path.resolve(process.env.DLE_HRIS_DATA_DIR)
  : path.join(resolveDashboardRoot(), 'data', 'hris');
const uniquePaths = (paths: Array<string | null | undefined>) => Array.from(new Set(paths.reduce<string[]>((items, item) => {
  if (item) items.push(path.normalize(item));
  return items;
}, [])));
const repoMirrorPath = (file: string) => {
  const normalizedFile = path.normalize(file);
  const markers = [
    path.normalize(path.join('deployment', 'iis', 'site', 'apps', 'dashboard', 'data', 'hris')),
    path.normalize(path.join('deployment', 'iis', 'site-publish', 'apps', 'dashboard', 'data', 'hris')),
  ];
  const marker = markers.find((candidate) => normalizedFile.toLowerCase().lastIndexOf(candidate.toLowerCase()) !== -1);
  if (!marker) return null;
  const markerIndex = normalizedFile.toLowerCase().lastIndexOf(marker.toLowerCase());
  const repoRoot = normalizedFile.slice(0, markerIndex);
  return path.join(repoRoot, 'apps', 'dashboard', 'data', 'hris', path.basename(normalizedFile));
};
const essRequestsFile = path.join(DATA_DIR, 'ess-requests.json');
const ESS_REQUESTS_PATHS = uniquePaths([
  essRequestsFile,
  repoMirrorPath(essRequestsFile),
  path.join(resolveDashboardRoot(), 'data', 'hris', 'ess-requests.json'),
  path.join(process.cwd(), 'apps', 'dashboard', 'data', 'hris', 'ess-requests.json'),
]);

export const ESS_REQUESTS_PATH = essRequestsFile;
export const LEAVE_ATTACHMENTS_ROOT = path.join(DATA_DIR, 'leave-attachments');
export const LEAVE_CALENDAR_CONFIG_PATH = path.join(DATA_DIR, 'leave-calendar-config.json');

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

const essRequestTimestamp = (item: EssLeaveRequest) => {
  const raw = compact(item.updatedAt) || compact(item.submittedAt);
  const time = new Date(raw).getTime();
  return Number.isNaN(time) ? 0 : time;
};

/** Merge every known ESS JSON store so IIS read-only deploy copies cannot hide new submissions. */
export const readAllEssRequests = async (): Promise<EssLeaveRequest[]> => {
  const merged = new Map<string, EssLeaveRequest>();
  for (const file of ESS_REQUESTS_PATHS) {
    try {
      const parsed = JSON.parse(await readFile(file, 'utf8'));
      if (!Array.isArray(parsed)) continue;
      for (const item of parsed as EssLeaveRequest[]) {
        if (!item?.id) continue;
        const existing = merged.get(item.id);
        if (!existing || essRequestTimestamp(item) >= essRequestTimestamp(existing)) {
          merged.set(item.id, item);
        }
      }
    } catch {
      // Try the next candidate path.
    }
  }
  return [...merged.values()].sort((left, right) => essRequestTimestamp(right) - essRequestTimestamp(left));
};

export const writeAllEssRequests = async (requests: EssLeaveRequest[]) => {
  const content = JSON.stringify(requests, null, 2);
  let lastError: unknown = null;
  let wrote = false;
  for (const file of ESS_REQUESTS_PATHS) {
    try {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, content, 'utf8');
      wrote = true;
    } catch (error) {
      lastError = error;
      console.warn('[leave-workflow] unable to write ESS requests store', { file, error });
    }
  }
  if (!wrote && lastError) throw lastError;
  invalidateEssPortalCache();
};

export const readEssLeaveRequests = async () =>
  (await loadWorkflowLeaveRequests()).filter((item) => isLeaveEssRequest(item));

const PENDING_WORKFLOW_STATUSES = new Set<EssLeaveRequestStatus>(['Submitted', 'Line Manager Review', 'HR Review']);

const readPendingLeaveRequestsFromDb = async (employees: DleEmployeeDirectoryRow[]) => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) return [] as EssLeaveRequest[];
  try {
    const result = await pool.request().query(`
SELECT [Id],[EmployeeId],[FullName],[LeaveType],[StartDate],[EndDate],[Days],[StatusName],[WorkflowStage],[ManagerName],[ActingOfficer],[CreatedAt],[UpdatedAt]
FROM [hris].[LeaveApplications]
WHERE ([StatusName] IN (N'Under Review', N'Submitted', N'Line Manager Review', N'HR Review')
   OR [WorkflowStage] IN (N'Supervisor', N'HR'))
  AND [Id] NOT LIKE N'sage-leave-tx-%';`);
    return (result.recordset || [])
      .map((row: Record<string, unknown>) => essLeaveRequestFromDbRow(row, employees))
      .filter((item: EssLeaveRequest | null): item is EssLeaveRequest => Boolean(item))
      .filter((item) => PENDING_WORKFLOW_STATUSES.has(item.status));
  } catch {
    return [] as EssLeaveRequest[];
  }
};

const managerNotificationAlreadySent = (request: EssLeaveRequest) =>
  (request.comments || []).some((entry) => /line manager (notified|notification sent)/i.test(entry.comment));

const appendManagerNotificationComment = async (requestId: string, managerLabel: string, actorName: string) => {
  const requests = await readAllEssRequests();
  const now = new Date().toISOString();
  const next = requests.map((item) => item.id === requestId
    ? {
        ...item,
        updatedAt: now,
        comments: [
          ...(item.comments || []),
          {
            at: now,
            actor: actorName,
            comment: `Line manager notification sent to ${managerLabel}.`,
          },
        ],
      }
    : item);
  await writeAllEssRequests(next);
  invalidateEssPortalCache();
};

export const resolveLeaveApproverEmployee = (
  request: EssLeaveRequest,
  requester: DleEmployeeDirectoryRow,
  employees: DleEmployeeDirectoryRow[],
): DleEmployeeDirectoryRow | null => {
  if (request.lineManagerEmployeeId) {
    const assigned = resolveEmployeeReference(employees, request.lineManagerEmployeeId);
    if (assigned) return assigned;
  }
  return resolveLineManagerRecipient(requester, employees);
};

export const repairPendingLeaveManagerNotifications = async (input?: {
  baseUrl?: string | null;
  actorName?: string;
}) => {
  const { employees } = await readPayrollEmployees();
  const requests = await readAllEssRequests();
  for (const request of requests) {
    if (!/leave/i.test(request.category) || !PENDING_WORKFLOW_STATUSES.has(request.status)) continue;
    if (managerNotificationAlreadySent(request)) continue;
    const requester = resolveEmployeeReference(employees, request.employeeId);
    if (!requester) continue;
    const manager = resolveLeaveApproverEmployee(request, requester, employees);
    if (!manager) continue;
    await notifyLineManagerLeaveSubmitted({
      request,
      requester,
      manager,
      actorName: input?.actorName || 'Leave Workflow',
      baseUrl: input?.baseUrl,
    }).catch((error) => {
      console.error('[leave-workflow] failed to repair pending manager notification', { requestId: request.id, error });
    });
    await appendManagerNotificationComment(request.id, manager.fullName, input?.actorName || 'Leave Workflow').catch(() => undefined);
  }
};

export const persistEssLeaveRequest = async (item: EssLeaveRequest) => {
  const { employees } = await readPayrollEmployees();
  await upsertEssLeaveRequestToDb(item, employees);
};

export const runLeaveSubmitFollowUp = async (input: {
  request: EssLeaveRequest;
  requester: DleEmployeeDirectoryRow;
  actorName: string;
  baseUrl?: string | null;
  leaveType: string;
  leaveDays: number;
  title: string;
  lineManagerLabel: string;
  resolvedManager?: DleEmployeeDirectoryRow | null;
  session: SessionPayload;
}) => {
  const { employees } = await readPayrollEmployees();
  const manager = input.resolvedManager || resolveLeaveApproverEmployee(input.request, input.requester, employees);

  try {
    await persistEssLeaveRequest(input.request);
  } catch (error) {
    console.error('[leave-workflow] leave database sync failed after submit', error);
    throw error;
  }

  if (manager && input.request.status === 'Line Manager Review' && !managerNotificationAlreadySent(input.request)) {
    try {
      await notifyLineManagerLeaveSubmitted({
        request: input.request,
        requester: input.requester,
        manager,
        actorName: input.actorName,
        baseUrl: input.baseUrl,
      });
      await appendManagerNotificationComment(input.request.id, manager.fullName, input.actorName);
    } catch (error) {
      console.error('[leave-workflow] line manager notification failed after leave submit', error);
    }
  }

  try {
    await applyLeaveBalanceImpact({
      employee: input.requester,
      leaveType: input.leaveType,
      days: input.leaveDays,
      mode: 'reserve-pending',
      required: true,
    });
    invalidateEssPortalCache();
  } catch (error) {
    console.error('[leave-workflow] leave balance reservation failed after submit', error);
  }

  try {
    await notifyLeaveWorkflow(input.session, {
      requestId: input.request.id,
      recipient: input.requester,
      title: 'Leave request submitted',
      body: `${input.title} has been submitted and routed to ${input.lineManagerLabel}. It must be approved within ${workflowDeadlineDays} working days.`,
      severity: 'success',
      request: input.request,
      requester: input.requester,
      emailEvent: 'submitted',
      baseUrl: input.baseUrl,
    });
  } catch (error) {
    console.error('[leave-workflow] requester notification failed after leave submit', error);
  }
};

export const repairLeaveRequestApproverRouting = async (
  request: EssLeaveRequest,
  employees: DleEmployeeDirectoryRow[],
  options?: { notify?: boolean; baseUrl?: string | null; actorName?: string },
): Promise<EssLeaveRequest> => {
  if (!PENDING_WORKFLOW_STATUSES.has(request.status)) return request;
  const requester = resolveEmployeeReference(employees, request.employeeId);
  if (!requester) return request;

  const lineManager = resolveLineManagerForEmployee(requester, employees);
  const managerCode = lineManager ? compact(lineManager.employee.employeeCode || lineManager.employee.employeeId) : '';
  const managerLabel = lineManager?.label || compact(request.lineManagerName) || managerOwnerFor(requester);
  const now = new Date().toISOString();
  const needsManagerAssignment = Boolean(managerCode) && !compact(request.lineManagerEmployeeId);
  const updated: EssLeaveRequest = needsManagerAssignment
    ? {
        ...request,
        lineManagerEmployeeId: managerCode,
        lineManagerName: managerLabel,
        updatedAt: now,
      }
    : request;

  const manager = lineManager?.employee
    || (compact(updated.lineManagerEmployeeId) ? resolveEmployeeReference(employees, updated.lineManagerEmployeeId!) : null)
    || resolveLeaveApproverEmployee(updated, requester, employees);

  if (manager && options?.notify && !managerNotificationAlreadySent(updated) && PENDING_WORKFLOW_STATUSES.has(updated.status)) {
    await notifyLineManagerLeaveSubmitted({
      request: updated,
      requester,
      manager,
      actorName: options.actorName || 'Leave Workflow',
      baseUrl: options.baseUrl,
    }).catch(() => undefined);
    return {
      ...updated,
      comments: [
        ...(updated.comments || []),
        {
          at: now,
          actor: options.actorName || 'Leave Workflow',
          comment: `Line manager notification sent to ${manager.fullName}.`,
        },
      ],
    };
  }

  return updated;
};

export const loadWorkflowLeaveRequests = async (options?: {
  repair?: boolean;
  notifyMissingManagers?: boolean;
  baseUrl?: string | null;
  actorName?: string;
}) => {
  const { employees } = await readPayrollEmployees();
  const jsonRequests = await readAllEssRequests();
  const dbPending = await readPendingLeaveRequestsFromDb(employees);
  const merged = new Map<string, EssLeaveRequest>();
  for (const item of dbPending) merged.set(item.id, item);
  for (const item of jsonRequests) {
    const existing = merged.get(item.id);
    merged.set(item.id, existing ? { ...existing, ...item } : item);
  }

  let requests = [...merged.values()]
    .filter((item) => !isLegacySageLeaveImport(item.id))
    .map((item) => {
    const startDate = normalizeLeaveDate(item.startDate);
    const endDate = normalizeLeaveDate(item.endDate);
    if ((!item.startDate || startDate === item.startDate) && (!item.endDate || endDate === item.endDate)) return item;
    return {
      ...item,
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
    };
  });
  const requestById = new Map(requests.map((item) => [item.id, item]));
  const jsonAfterDateRepair = jsonRequests.map((item) => requestById.get(item.id) || item);
  if (JSON.stringify(jsonRequests) !== JSON.stringify(jsonAfterDateRepair)) {
    await writeAllEssRequests(jsonAfterDateRepair).catch(() => undefined);
    invalidateEssPortalCache();
  }
  if (options?.repair) {
    const repaired = await Promise.all(requests.map((request) => repairLeaveRequestApproverRouting(request, employees, {
      notify: options.notifyMissingManagers,
      baseUrl: options.baseUrl,
      actorName: options.actorName,
    })));
    const changed = repaired.some((item, index) => JSON.stringify(item) !== JSON.stringify(requests[index]));
    requests = repaired;
    if (changed) {
      const repairedById = new Map(repaired.map((item) => [item.id, item]));
      const nextJson = jsonAfterDateRepair.map((item) => repairedById.get(item.id) || item);
      for (const item of repaired) {
        if (!jsonAfterDateRepair.some((existing) => existing.id === item.id)) nextJson.unshift(item);
      }
      await writeAllEssRequests(nextJson).catch(() => undefined);
      invalidateEssPortalCache();
    }
  }

  return requests;
};

export const expireStaleLeaveRequests = async (requests: EssLeaveRequest[]) => {
  let changed = false;
  const now = new Date().toISOString();
  const next = requests.map((item) => {
    if (!/leave/i.test(item.category) || !['Line Manager Review', 'HR Review', 'Submitted'].includes(item.status)) return item;
    const slaAnchor = item.submittedAt || item.updatedAt;
    if (!slaAnchor || workingDaysSince(slaAnchor) <= workflowDeadlineDays) return item;
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

const dateOnly = (value: unknown) => normalizeLeaveDate(value);

export const normalizeLeaveDate = (value: unknown) => {
  const text = compact(value);
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const direct = new Date(text);
  if (!Number.isNaN(direct.getTime())) return direct.toISOString().slice(0, 10);
  const year = new Date().getFullYear();
  const withYear = new Date(`${text} ${year}`);
  if (!Number.isNaN(withYear.getTime())) return withYear.toISOString().slice(0, 10);
  return '';
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

const employeeKeys = (employee: DleEmployeeDirectoryRow) => {
  const keys = new Set<string>();
  for (const raw of buildEssEmployeeLookupKeys(employee)) {
    const normalized = normalizePayrollMatchKey(raw);
    if (normalized) keys.add(normalized);
    const embeddedCode = employeeCodeFromReference(raw);
    if (embeddedCode) {
      const codeKey = normalizePayrollMatchKey(embeddedCode);
      if (codeKey) keys.add(codeKey);
    }
  }
  return [...keys];
};

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
  const candidates = [
    normalizePayrollMatchKey(requestEmployeeId),
    normalizePayrollMatchKey(employeeCodeFromReference(requestEmployeeId)),
  ].filter(Boolean);
  return candidates.some((key) => lookup.has(key));
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

export const notifyLeaveWithdrawn = async (input: {
  request: EssLeaveRequest;
  requester: DleEmployeeDirectoryRow;
  actorName: string;
  reason?: string;
  baseUrl?: string | null;
  previousStatus: EssLeaveRequest['status'];
}) => {
  if (!['Line Manager Review', 'HR Review'].includes(input.previousStatus)) return;

  const { employees } = await readPayrollEmployees();
  const session = leaveSystemSession(input.actorName);
  const requestLabel = input.request.title || `${input.request.leaveType} leave`;
  const withdrawnRequest = { ...input.request, status: 'Cancelled' as EssLeaveRequest['status'] };
  const body = `${input.requester.fullName} withdrew ${requestLabel} (${input.request.startDate} to ${input.request.endDate}).${input.reason ? ` Note: ${input.reason}` : ''} No further approval action is required.`;

  const notifyApprover = async (approver: DleEmployeeDirectoryRow) => {
    await safeLeaveNotification('leave withdrawal approver notification', () =>
      deliverLeaveEmployeeNotification({
        session,
        employee: approver,
        title: 'Leave request withdrawn',
        body,
        severity: 'info',
        requestId: input.request.id,
        kind: 'Approval',
        href: '/workforce-portal?tab=leave&leaveSection=Approvals',
        sendEmail: () => sendLeaveWorkflowEmail({
          event: 'withdrawn',
          request: withdrawnRequest,
          requester: input.requester,
          recipient: approver,
          actorName: input.actorName,
          extra: input.reason,
          baseUrl: input.baseUrl,
        }),
      }));
  };

  if (input.previousStatus === 'Line Manager Review') {
    const manager = input.request.lineManagerEmployeeId
      ? resolveEmployeeReference(employees, input.request.lineManagerEmployeeId)
      : resolveLineManagerRecipient(input.requester, employees);
    if (manager) await notifyApprover(manager);
    return;
  }

  const hrRecipients = resolveHrRecipients(employees);
  const notified = new Set<string>();
  for (const recipient of hrRecipients.slice(0, 5)) {
    const key = compact(recipient.employeeCode || recipient.employeeId);
    if (!key || notified.has(key)) continue;
    notified.add(key);
    await notifyApprover(recipient);
  }

  await safeLeaveNotification('leave withdrawal hr in-app notification', () =>
    createEnterpriseNotification(session, {
      kind: 'Approval',
      module: 'Leave Management',
      title: 'Leave request withdrawn',
      body,
      severity: 'info',
      recipientRoles: ['HR Manager', 'HR Head', 'HR Officer', 'Leave Administrator'],
      href: '/workforce-portal?tab=leave&leaveSection=Approvals',
      channels: ['In-App'],
      metadata: { requestId: input.request.id },
      actor: input.actorName,
    }));
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
  const workflowStage = compact(row.WorkflowStage).toLowerCase();
  const statusName = compact(row.StatusName);
  const essStatus: EssLeaveRequestStatus = (() => {
    if (statusName === 'Line Manager Review' || statusName === 'HR Review') return statusName as EssLeaveRequestStatus;
    if (statusName === 'Under Review') {
      if (workflowStage === 'supervisor') return 'Line Manager Review';
      if (workflowStage === 'hr') return 'HR Review';
      return 'Line Manager Review';
    }
    return normalizeEssStatus(statusName);
  })();
  const managerName = compact(row.ManagerName);
  const manager = managerName
    ? employees.find((employee) => referenceMatchesEmployee(employee, managerName))
    : null;
  return {
    id,
    employeeId,
    category: 'Leave Application',
    title: `${compact(row.LeaveType) || 'Leave'} — ${compact(row.FullName) || employeeId}`,
    status: essStatus,
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
    lineManagerEmployeeId: manager ? (manager.employeeCode || manager.employeeId) : undefined,
    lineManagerName: manager?.fullName || managerName || undefined,
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

  const departmentSupervisorCode = explicitDepartmentSupervisorCode(requester.department || '');
  if (departmentSupervisorCode) {
    const departmentSupervisor = activeEmployees.find((employee) => !isSelf(employee) && employeeRequestMatches(employee, departmentSupervisorCode));
    if (departmentSupervisor) {
      return { employee: departmentSupervisor, label: departmentSupervisor.fullName, source: 'reporting-manager' };
    }
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
    const recipient = resolveLeaveApproverEmployee(input.request, input.requester, employees);
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

const hrRoles = new Set(['hr manager', 'hr head', 'hr officer', 'hr director', 'leave administrator', 'system administrator', 'super administrator', 'super admin']);
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
  const isSuperAdmin = Boolean(isGlobalAdmin) || roleText.some((role) => /super\s*admin|system\s*admin|emergency system administration/.test(role));
  const isHr = isSuperAdmin || roleText.some((role) => hrRoles.has(role) || /\bhr\b/.test(role));

  // Super Administrator / System Administrator can action any pending leave approval stage.
  if (isSuperAdmin) {
    if (request.status === 'HR Review') return 'hr';
    if (request.status === 'Line Manager Review') return 'line-manager';
  }

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
  if (request.status === 'Line Manager Review' && (isAssignedManager || isNamedManager || isManagerRole || sameDepartmentHead)) {
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
      const requester = resolveEmployeeReference(employees, request.employeeId)
        || employeeById.get(request.employeeId)
        || null;
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

const blockingLeaveStatusSql = [...blockingLeaveStatuses]
  .map((status) => `N'${status.replace(/'/g, "''")}'`)
  .join(', ');

const readEmployeeLeaveBalanceForValidation = async (
  employee: DleEmployeeDirectoryRow,
  leaveType: string,
) => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) return null;
  const keys = [...employeeLeaveLookupKeys(employee)];
  if (!keys.length) return null;
  const request = pool.request();
  request.input('LeaveType', sql.NVarChar(120), normalizeLeaveTypeName(leaveType));
  keys.forEach((key, index) => request.input(`EmployeeKey${index}`, sql.NVarChar(120), key));
  const keySql = keys.map((_, index) => `@EmployeeKey${index}`).join(', ');
  const result = await request.query(`
SELECT TOP 1 [EmployeeId],[LeaveType],[CurrentBalance],[AccruedBalance]
FROM [hris].[LeaveBalances]
WHERE [EmployeeId] IN (${keySql})
  AND [LeaveType]=@LeaveType
ORDER BY [UpdatedAt] DESC;`);
  const row = result.recordset[0] as {
    EmployeeId?: string;
    LeaveType?: string;
    CurrentBalance?: number;
    AccruedBalance?: number;
  } | undefined;
  if (!row) return null;
  return {
    employeeId: String(row.EmployeeId || keys[0]),
    leaveType: String(row.LeaveType || leaveType),
    currentBalance: Number(row.CurrentBalance ?? row.AccruedBalance ?? 0),
  };
};

const readHrisLeaveConflictForEmployee = async (input: {
  employee: DleEmployeeDirectoryRow;
  startDate: string;
  endDate: string;
  excludeRequestId?: string;
}) => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) return null;
  const keys = [...employeeLeaveLookupKeys(input.employee)];
  if (!keys.length) return null;
  const request = pool.request();
  request.input('StartDate', sql.Date, input.startDate);
  request.input('EndDate', sql.Date, input.endDate);
  keys.forEach((key, index) => request.input(`EmployeeKey${index}`, sql.NVarChar(120), key));
  const keySql = keys.map((_, index) => `@EmployeeKey${index}`).join(', ');
  const excludeSql = input.excludeRequestId ? 'AND [Id] <> @ExcludeId' : '';
  if (input.excludeRequestId) request.input('ExcludeId', sql.NVarChar(120), input.excludeRequestId);
  const result = await request.query(`
SELECT TOP 1 [Id],[EmployeeId],[LeaveType],[StartDate],[EndDate],[StatusName]
FROM [hris].[LeaveApplications]
WHERE [EmployeeId] IN (${keySql})
  AND [StatusName] IN (${blockingLeaveStatusSql})
  AND CAST([StartDate] AS date) <= @EndDate
  AND CAST([EndDate] AS date) >= @StartDate
  ${excludeSql};`);
  const row = result.recordset[0] as {
    Id?: string;
    LeaveType?: string;
    StartDate?: string | Date;
    EndDate?: string | Date;
    StatusName?: string;
  } | undefined;
  if (!row) return null;
  const startDate = normalizeLeaveDate(row.StartDate);
  const endDate = normalizeLeaveDate(row.EndDate);
  if (!startDate || !endDate || !leaveDatesOverlap(input.startDate, input.endDate, startDate, endDate)) return null;
  return {
    id: String(row.Id || ''),
    leaveType: String(row.LeaveType || 'Leave'),
    startDate,
    endDate,
    status: String(row.StatusName || 'Submitted'),
    source: 'HRIS',
  };
};

export const findConflictingLeaveApplication = async (input: {
  employee: DleEmployeeDirectoryRow;
  startDate: string;
  endDate: string;
  excludeRequestId?: string;
}) => {
  const hrisConflict = await readHrisLeaveConflictForEmployee(input);
  if (hrisConflict) {
    return {
      ...hrisConflict,
      message: formatConflictMessage(hrisConflict),
    };
  }

  const essConflict = (await readAllEssRequests()).find((item) =>
    /leave/i.test(item.category)
    && employeeRequestMatches(input.employee, item.employeeId)
    && item.id !== input.excludeRequestId
    && blockingLeaveStatuses.has(item.status)
    && item.startDate
    && item.endDate
    && leaveDatesOverlap(
      input.startDate,
      input.endDate,
      normalizeLeaveDate(item.startDate),
      normalizeLeaveDate(item.endDate),
    ),
  );
  if (essConflict) {
    return {
      id: essConflict.id,
      leaveType: essConflict.leaveType || 'Leave',
      startDate: normalizeLeaveDate(essConflict.startDate) || input.startDate,
      endDate: normalizeLeaveDate(essConflict.endDate) || input.endDate,
      status: essConflict.status,
      source: 'ESS',
      message: formatConflictMessage({
        id: essConflict.id,
        leaveType: essConflict.leaveType || 'Leave',
        startDate: normalizeLeaveDate(essConflict.startDate) || input.startDate,
        endDate: normalizeLeaveDate(essConflict.endDate) || input.endDate,
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
  try {
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

  const conflict = await findConflictingLeaveApplication({
    employee,
    startDate,
    endDate,
    excludeRequestId: input.excludeRequestId,
  });
  if (conflict) return { ok: false as const, status: 409, message: conflict.message };

  const employeeBalance = await readEmployeeLeaveBalanceForValidation(employee, leaveType);
  const availableBalance = employeeBalance?.currentBalance
    ?? (leaveType === 'Annual Leave' ? annualLeaveEntitlementForEmployee(employee) : 0);
  const validationPayload = {
    balances: employeeBalance
      ? [{
          employeeId: employeeBalance.employeeId,
          leaveType: employeeBalance.leaveType,
          currentBalance: employeeBalance.currentBalance,
        }]
      : [],
    applications: [],
    summary: { pendingApplications: 0, pendingApprovals: 0 },
  } as unknown as LeavePayload;

  const validation = validateLeaveAction('apply', 'Employee', validationPayload, {
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
    availableBalance,
  });
  if (!validation.ok) return { ok: false as const, status: validation.status, message: validation.message };
  return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      status: 500,
      message: error instanceof Error ? error.message : 'Unable to validate leave application.',
    };
  }
};

export const applyLeaveBalanceImpact = async (input: {
  employee: DleEmployeeDirectoryRow;
  leaveType?: string;
  days: number;
  mode: 'reserve-pending' | 'release-pending' | 'confirm-used';
  required?: boolean;
}) => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) {
    if (input.required) throw new Error('Leave balance could not be updated because HRIS database is unavailable.');
    return;
  }
  const lookupKeys = [...new Set([
    ...buildEssEmployeeLookupKeys(input.employee),
    compact(input.employee.employeeCode),
    compact(input.employee.employeeId),
  ].map((key) => compact(key)).filter(Boolean))];
  const leaveType = normalizeLeaveTypeName(clean(input.leaveType) || 'Annual Leave');
  const days = round2(Math.max(0, Number(input.days || 0)));
  if (!lookupKeys.length || !leaveType || days <= 0) return;

  const resolveRequest = pool.request();
  lookupKeys.forEach((key, index) => resolveRequest.input(`EmployeeKey${index}`, sql.NVarChar(80), key));
  resolveRequest.input('LeaveType', sql.NVarChar(120), leaveType);
  const keySql = lookupKeys.map((_, index) => `@EmployeeKey${index}`).join(', ');
  const existing = await resolveRequest.query(`
SELECT TOP 1 [EmployeeId]
FROM [hris].[LeaveBalances]
WHERE [EmployeeId] IN (${keySql}) AND [LeaveType]=@LeaveType
ORDER BY [UpdatedAt] DESC;`);
  const employeeId = compact((existing.recordset[0] as { EmployeeId?: string } | undefined)?.EmployeeId)
    || compact(input.employee.employeeCode || input.employee.employeeId);
  if (!employeeId) {
    if (input.required) throw new Error('Leave balance could not be updated because employee leave record was not found.');
    return;
  }
  const entitlement = leaveType === 'Annual Leave' ? annualLeaveEntitlementForEmployee(input.employee) : days;

  if (input.mode === 'reserve-pending') {
    await pool.request()
      .input('EmployeeId', sql.NVarChar(80), employeeId)
      .input('LeaveType', sql.NVarChar(120), leaveType)
      .input('FullName', sql.NVarChar(220), input.employee.fullName)
      .input('Department', sql.NVarChar(180), input.employee.department || 'Unassigned')
      .input('Days', sql.Decimal(9, 2), days)
      .input('Entitlement', sql.Decimal(9, 2), round2(entitlement))
      .input('SourceSystem', sql.NVarChar(80), HRIS_LEAVE_SOURCE)
      .query(`
MERGE [hris].[LeaveBalances] AS target
USING (SELECT @EmployeeId AS [EmployeeId], @LeaveType AS [LeaveType]) AS source
ON target.[EmployeeId] = source.[EmployeeId] AND target.[LeaveType] = source.[LeaveType]
WHEN MATCHED THEN UPDATE SET
  [PendingBalance] = ISNULL(target.[PendingBalance], 0) + @Days,
  [CurrentBalance] = CASE WHEN ISNULL(target.[CurrentBalance], target.[AccruedBalance]) - @Days < 0 THEN 0 ELSE ISNULL(target.[CurrentBalance], target.[AccruedBalance]) - @Days END,
  [SourceSystem] = CASE WHEN ISNULL(target.[PendingBalance], 0) + @Days > 0 THEN @SourceSystem ELSE target.[SourceSystem] END,
  [UpdatedAt] = SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT
  ([EmployeeId],[LeaveType],[FullName],[Department],[CurrentBalance],[AccruedBalance],[UsedBalance],[PendingBalance],[ForfeitedBalance],[CarryForwardBalance],[LiabilityValue],[StatusName],[ExceptionsJson],[SourceSystem])
VALUES
  (@EmployeeId,@LeaveType,@FullName,@Department,@Entitlement - @Days,@Entitlement,0,@Days,0,0,0,N'Healthy',N'[]',@SourceSystem);`);
    return;
  }

  if (input.mode === 'release-pending') {
    await pool.request()
      .input('EmployeeId', sql.NVarChar(80), employeeId)
      .input('LeaveType', sql.NVarChar(120), leaveType)
      .input('Days', sql.Decimal(9, 2), days)
      .query(`
UPDATE [hris].[LeaveBalances]
SET [PendingBalance] = CASE WHEN ISNULL([PendingBalance],0) - @Days < 0 THEN 0 ELSE ISNULL([PendingBalance],0) - @Days END,
    [CurrentBalance] = ISNULL([CurrentBalance],0) + @Days,
    [UpdatedAt] = SYSUTCDATETIME()
WHERE [EmployeeId]=@EmployeeId AND [LeaveType]=@LeaveType;`);
    return;
  }

  await pool.request()
    .input('EmployeeId', sql.NVarChar(80), employeeId)
    .input('LeaveType', sql.NVarChar(120), leaveType)
    .input('Days', sql.Decimal(9, 2), days)
    .query(`
UPDATE [hris].[LeaveBalances]
SET [PendingBalance] = CASE WHEN ISNULL([PendingBalance],0) - @Days < 0 THEN 0 ELSE ISNULL([PendingBalance],0) - @Days END,
    [UsedBalance] = ISNULL([UsedBalance],0) + @Days,
    [UpdatedAt] = SYSUTCDATETIME()
  WHERE [EmployeeId]=@EmployeeId AND [LeaveType]=@LeaveType;`);
};

const ESS_PENDING_LEAVE_STATUSES = new Set(['Submitted', 'Draft', 'Line Manager Review', 'HR Review']);

export const adjustLeavePolicyCardsForEssPending = (
  policyCards: Array<Record<string, string | number>>,
  requests: EssLeaveRequest[],
) => {
  const pendingByType = new Map<string, number>();
  for (const request of requests) {
    if (!/leave/i.test(request.category)) continue;
    if (!ESS_PENDING_LEAVE_STATUSES.has(request.status)) continue;
    const leaveType = normalizeLeaveTypeName(request.leaveType || 'Annual Leave');
    pendingByType.set(leaveType, round2((pendingByType.get(leaveType) || 0) + Number(request.days || 0)));
  }
  return policyCards.map((card) => {
    const leaveType = normalizeLeaveTypeName(String(card.type || ''));
    if (!leaveType) return card;
    const pendingFromEss = pendingByType.get(leaveType) || 0;
    const currentPending = Number(card.pending || 0);
    const currentBalance = Number(card.balance ?? card.entitlement ?? 0);
    if (pendingFromEss <= currentPending) return card;
    const extraPending = round2(pendingFromEss - currentPending);
    return {
      ...card,
      pending: round2(currentPending + extraPending),
      balance: Math.max(0, round2(currentBalance - extraPending)),
    };
  });
};

export const upsertEssLeaveRequestToDb = async (item: EssLeaveRequest, employees: DleEmployeeDirectoryRow[]) => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) return;
  const employeeById = new Map(employees.flatMap((employee) => [
    [employee.employeeId, employee],
    [employee.employeeCode, employee],
  ].filter(([key]) => Boolean(key)) as Array<[string, DleEmployeeDirectoryRow]>));
  const employee = employeeById.get(item.employeeId) || resolveEmployeeReference(employees, item.employeeId);
  const employeeKey = compact(employee?.employeeCode || employee?.employeeId || item.employeeId);
  const rawStatus = item.status;
  const normalizedStatus = normalizeLeaveStatus(rawStatus);
  const status = (() => {
    if (rawStatus === 'Line Manager Review' || rawStatus === 'HR Review') return rawStatus;
    if (['Submitted', 'Under Review'].includes(normalizedStatus)
      && workingDaysSince(item.updatedAt || item.submittedAt || new Date().toISOString()) > workflowDeadlineDays) {
      return 'Terminated';
    }
    return normalizedStatus;
  })();
  const leaveType = clean(item.leaveType) || 'Annual Leave';
  const startDate = normalizeLeaveDate(item.startDate);
  const endDate = normalizeLeaveDate(item.endDate);
  if (!startDate || !endDate) {
    throw new Error(`Leave request ${item.id} has invalid dates (${String(item.startDate || '')} to ${String(item.endDate || '')}).`);
  }
  const days = Number(item.days || 0);
  const exceptions = [
    ...(days <= 0 ? ['Leave request has no calculated duration'] : []),
    ...(!employee ? ['Employee record not found in HRIS employee master'] : []),
    ...(leaveType === 'Annual Leave' && employee && !isFourteenDayPaidLeaveEmployee(employee) && !isConfirmedPermanent(employee) ? ['Annual Leave locked pending confirmation of appointment'] : []),
  ];
  const blocked = exceptions.some((entry) => entry.includes('not found') || entry.includes('locked'));
  const requester = employee || resolveEmployeeReference(employees, item.employeeId);
  const resolvedManager = requester ? resolveLineManagerForEmployee(requester, employees) : null;
  const managerName = compact(item.lineManagerName)
    || (resolvedManager ? `${compact(resolvedManager.employee.employeeCode || resolvedManager.employee.employeeId)} - ${resolvedManager.label}` : '')
    || compact(employee?.managerName)
    || compact(employee?.departmentHead)
    || 'Unassigned';
  await pool.request()
    .input('Id', sql.NVarChar(120), item.id)
    .input('SourceSystem', sql.NVarChar(80), 'ESS Leave Request')
    .input('EmployeeId', sql.NVarChar(80), employeeKey)
    .input('FullName', sql.NVarChar(220), employee?.fullName || item.employeeId)
    .input('Department', sql.NVarChar(180), employee?.department || 'Unassigned')
    .input('ManagerName', sql.NVarChar(180), managerName)
    .input('Location', sql.NVarChar(180), employee?.location || employee?.workLocation || 'Unassigned')
    .input('EmployeeCategory', sql.NVarChar(120), employee?.employeeCategory || employee?.employmentType || 'Unassigned')
    .input('LeaveType', sql.NVarChar(120), leaveType)
    .input('StartDate', sql.Date, startDate)
    .input('EndDate', sql.Date, endDate)
    .input('Days', sql.Decimal(9, 2), round2(days))
    .input('StatusName', sql.NVarChar(40), status)
    .input('WorkflowStage', sql.NVarChar(40), workflowStageForEssStatus(rawStatus, normalizedStatus))
    .input('ApprovalStatus', sql.NVarChar(60), approvalStatusForEss(normalizedStatus, rawStatus))
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
  baseUrl?: string | null;
}) => {
  const requests = await readAllEssRequests();
  const found = requests.find((item) => item.id === input.requestId && /leave/i.test(item.category));
  const previousStatus = found?.status;
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
    invalidateEssPortalCache();
    const { employees } = await readPayrollEmployees();
    const requester = input.employee || resolveEmployeeReference(employees, found.employeeId);
    if (requester) {
      try {
        await applyLeaveBalanceImpact({
          employee: requester,
          leaveType: found.leaveType,
          days: Number(found.days || 0),
          mode: 'release-pending',
        });
      } catch (error) {
        console.error('[leave-workflow] failed to release pending leave balance on cancel', error);
      }
      if (previousStatus && ['Line Manager Review', 'HR Review'].includes(previousStatus)) {
        try {
          await notifyLeaveWithdrawn({
            request: found,
            requester,
            actorName: input.actorName,
            reason: input.reason,
            baseUrl: input.baseUrl,
            previousStatus,
          });
        } catch (error) {
          console.error('[leave-workflow] failed to notify approver after leave withdrawal', error);
        }
      }
    }
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

export const syncEssLeaveRequestById = async (requestId: string, fallback?: EssLeaveRequest) => {
  const item = (await readAllEssRequests()).find((request) => request.id === requestId) || fallback;
  if (!item) return;
  await persistEssLeaveRequest(item);
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
  const requests = await expireStaleLeaveRequests(await loadWorkflowLeaveRequests());
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
  try {
    await upsertEssLeaveRequestToDb(updated, employees);
  } catch (error) {
    console.error('[leave-workflow] failed to sync approved leave request to database', error);
  }
  try {
    if (!approved) {
      await applyLeaveBalanceImpact({
        employee: requester,
        leaveType: found.leaveType,
        days: Number(found.days || 0),
        mode: 'release-pending',
      });
    } else if (nextStatus === 'Approved') {
      await applyLeaveBalanceImpact({
        employee: requester,
        leaveType: found.leaveType,
        days: Number(found.days || 0),
        mode: 'confirm-used',
      });
    }
  } catch (error) {
    console.error('[leave-workflow] failed to update leave balance after approval action', error);
  }
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
    try {
      const applications = await readLeaveApplicationsForReconciliation({ syncEss: false });
      const result = await postLeaveAllowanceOnAnnualLeaveApproval({
        employee: requester,
        applications,
        leaveType: found.leaveType,
        days: Number(found.days || 0),
        startDate: normalizeLeaveDate(found.startDate),
        period: found.payrollPeriod || activePayrollPeriod(),
        requestId: found.id,
        source: 'ESS Leave Approval',
        actor: input.actorName,
      });
      if (result.posted) allowanceMessage = result.message;
    } catch (error) {
      console.error('[leave-workflow] leave allowance posting failed after approval', error);
    }
  }

  const result = { request: updated, allowanceMessage };
  void runLeaveApprovalFollowUp({
    approved,
    nextStatus,
    updated,
    requester,
    actorName: input.actorName,
    reason: input.comment,
    baseUrl: input.baseUrl,
  }).catch((error) => {
    console.error('[leave-workflow] post-approval follow-up failed', error);
  });

  return result;
};

const runLeaveApprovalFollowUp = async (input: {
  approved: boolean;
  nextStatus: EssLeaveRequestStatus;
  updated: EssLeaveRequest;
  requester: DleEmployeeDirectoryRow;
  actorName: string;
  reason?: string;
  baseUrl?: string | null;
}) => {
  if (!input.approved) {
    await notifyLeaveRejected({
      request: input.updated,
      requester: input.requester,
      actorName: input.actorName,
      reason: input.reason,
      baseUrl: input.baseUrl,
    });
    return;
  }
  if (input.nextStatus === 'HR Review') {
    await notifyLeaveAwaitingHrApproval({
      request: input.updated,
      requester: input.requester,
      actorName: input.actorName,
      baseUrl: input.baseUrl,
    });
    return;
  }
  if (input.nextStatus === 'Approved') {
    await notifyLeaveFinalApproval({
      request: input.updated,
      requester: input.requester,
      actorName: input.actorName,
      baseUrl: input.baseUrl,
    });
  }
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
    .input('ApprovalStatus', sql.NVarChar(60), nextEssStatus ? approvalStatusForEss(hrisStatus, nextEssStatus) : approvalStatusForEss(hrisStatus, hrisStatus))
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
