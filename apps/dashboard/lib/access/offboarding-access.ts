/**
 * Offboarding visibility: full module = HR only.
 * Exit Clearance form / section approval = HR + line managers.
 */
import { hasAnyPermission, hasPermission } from '@/lib/auth/permission-match';

export type OffboardingSession = {
  department?: string | null;
  unit?: string | null;
  roles?: string[] | null;
  permissions?: string[] | null;
  isGlobalAdmin?: boolean;
  fullName?: string | null;
  employeeCode?: string | null;
  employeeId?: string | null;
  username?: string | null;
  sub?: string | null;
};

const compact = (value: unknown) => String(value || '').trim();
const lower = (value: unknown) => compact(value).toLowerCase();

/** Local HR check — avoid importing route-access (circular). */
const isHrUser = (session: OffboardingSession) => {
  if (session.isGlobalAdmin || (session.roles || []).includes('Super Administrator')) return true;
  const roles = session.roles || [];
  if (roles.some((role) =>
    /^(HR |Human Resource|HRIS)/i.test(role)
    || /HR Administrator|HR Manager|HR Director|HR Officer|Recruitment Officer|Onboarding Officer|Offboarding Officer|Employee Records Officer/i.test(role),
  )) {
    return true;
  }
  const text = `${session.department || ''} ${session.unit || ''}`.toLowerCase();
  return /\bhr\b/.test(text) || text.includes('human resources') || text.includes('human resource') || text.includes('human capital');
};

export const isOffboardingSuper = (session: OffboardingSession) =>
  Boolean(session.isGlobalAdmin || (session.roles || []).includes('Super Administrator'));

/** Full Offboarding Management (resignation → final payroll): HR portal users only. */
export const canAccessOffboardingManagement = (session: OffboardingSession) => {
  if (isOffboardingSuper(session)) return true;
  if (isHrUser(session)) return true;
  return hasAnyPermission(session.permissions || [], [
    'offboarding.*',
    'offboarding.view',
    'offboarding.manage',
    'offboarding.create',
    'offboarding.edit',
  ]);
};

/**
 * Line managers / department approvers who may open Exit Clearance to approve
 * their assigned department section — not the rest of Offboarding Management.
 */
export const isLineManagerApprover = (session: OffboardingSession) => {
  if (isOffboardingSuper(session) || isHrUser(session)) return true;
  const roles = session.roles || [];
  if (roles.some((role) =>
    /^(Manager|Department Head|Supervisor)$/i.test(role)
    || /\b(Line Manager|Department Manager|Unit Head|HOD)\b/i.test(role),
  )) {
    return true;
  }
  return hasAnyPermission(session.permissions || [], [
    'offboarding.clearance.approve',
    'leave.approve',
    'timesheet.supervisor.approve',
  ]);
};

/** Exit Clearance register + form + section approvals. */
export const canAccessExitClearance = (session: OffboardingSession) =>
  canAccessOffboardingManagement(session) || isLineManagerApprover(session);

export const isExitClearanceHrMode = (session: OffboardingSession) =>
  canAccessOffboardingManagement(session);

export type ClearanceAssigneeViewer = {
  fullName?: string | null;
  employeeCode?: string | null;
  employeeId?: string | null;
  email?: string | null;
  emails?: string[] | null;
};

const emailsOf = (viewer: ClearanceAssigneeViewer) => {
  const set = new Set<string>();
  for (const value of [viewer.email, ...(viewer.emails || [])]) {
    const email = lower(value);
    if (email) set.add(email);
  }
  return set;
};

/** True when this viewer is the auto-resolved assignee for a clearance section. */
export const isClearanceSectionAssignee = (
  section: { assigneeName?: string | null; assigneeEmail?: string | null },
  viewer: ClearanceAssigneeViewer,
) => {
  const name = lower(viewer.fullName);
  const assigneeName = lower(section.assigneeName);
  if (name && assigneeName && name === assigneeName) return true;

  const email = lower(section.assigneeEmail);
  if (email && emailsOf(viewer).has(email)) return true;

  return false;
};

export const caseHasClearanceAssignmentFor = <
  T extends { sections: Array<{ assigneeName?: string | null; assigneeEmail?: string | null }> },
>(
  row: T,
  viewer: ClearanceAssigneeViewer,
) => row.sections.some((section) => isClearanceSectionAssignee(section, viewer));

export const assertOffboardingManagementAccess = (session: OffboardingSession | null) => {
  if (!session || !canAccessOffboardingManagement(session)) {
    throw new Error('Offboarding Management is restricted to HR.');
  }
};

export const assertExitClearanceAccess = (session: OffboardingSession | null) => {
  if (!session || !canAccessExitClearance(session)) {
    throw new Error('Exit Clearance is restricted to HR and line managers.');
  }
};

/** HR actions that line managers must not perform. */
export const assertExitClearanceHrAction = (
  session: OffboardingSession | null,
  action: string | null | undefined,
) => {
  assertExitClearanceAccess(session);
  if (isExitClearanceHrMode(session!)) return;
  const hrOnly = new Set([
    'request_approvals',
    'resolve_assignees',
    'complete',
    'sign_hr_final',
    'sign_finance_final',
    'save',
  ]);
  // Line managers may only approve/reject their section (or read).
  if (!action || action === 'approve_section' || action === 'reject_section') return;
  if (hrOnly.has(action) || action === 'sign_section') {
    throw new Error('Only HR can manage the clearance form. Line managers may approve or reject their assigned section.');
  }
};

export const hasOffboardingPermission = (permissions: string[], key: string) =>
  hasPermission(permissions, key);
