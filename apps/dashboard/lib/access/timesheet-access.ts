/**
 * Timesheet Entry + Approval visibility.
 * Restricted to supervisors, line managers, IT department, and admins — not ordinary employees.
 */
import { isItDepartmentEmployee } from '@/lib/access/projects-engineering-access';
import { hasAnyPermission } from '@/lib/auth/permission-match';

export type TimesheetAccessSession = {
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

const isTimesheetAdmin = (session: TimesheetAccessSession) => {
  if (session.isGlobalAdmin || (session.roles || []).includes('Super Administrator')) return true;
  return (session.roles || []).some((role) =>
    /^(Application Administrator|HR Administrator)$/i.test(role)
    || /\bSuper Admin\b/i.test(role),
  );
};

const isSupervisorOrLineManager = (session: TimesheetAccessSession) => {
  const roles = session.roles || [];
  if (roles.some((role) =>
    /^(Manager|Department Head|Supervisor)$/i.test(role)
    || /\b(Line Manager|Department Manager|Unit Head|HOD|Site Manager)\b/i.test(role),
  )) {
    return true;
  }
  // Approver grants used by line managers / supervisors (not bare timesheet.submit).
  return hasAnyPermission(session.permissions || [], [
    'timesheet.supervisor.approve',
    'timesheet.supervisor.reject',
    'timesheet.supervisor.return',
    'page.hris.time-and-logs.timesheet-approval.view',
    'page.hris.time-and-logs.timesheet-entry.view',
    'operations.timesheets.approve',
  ]);
};

const isItRole = (session: TimesheetAccessSession) =>
  (session.roles || []).some((role) =>
    /^(IT |Information Technology)/i.test(role)
    || /IT Administrator|IT Support Officer|Service Desk Agent|Infrastructure Officer|Application Support Officer/i.test(role),
  )
  || hasAnyPermission(session.permissions || [], ['it.view', 'it.*', 'view_it_support', 'view_it_assets']);

/** True when the actor may open Timesheet Entry / Approval (HRIS Time & Logs). */
export const canAccessTimesheetEntryAndApproval = (session: TimesheetAccessSession | null | undefined) => {
  if (!session) return false;
  if (isTimesheetAdmin(session)) return true;
  if (isItDepartmentEmployee(session as Parameters<typeof isItDepartmentEmployee>[0])) return true;
  if (isItRole(session)) return true;
  if (isSupervisorOrLineManager(session)) return true;
  return false;
};

export const isTimesheetEntryOrApprovalPath = (pathname: string) => {
  const path = compact(pathname).replace(/\/+$/, '') || '/';
  return (
    path === '/hris/workforce-management/timesheet-entry'
    || path === '/hris/time-and-logs/timesheet-entry'
    || path === '/hris/time-and-logs/project-sites'
    || path === '/api/hris/time-and-logs/timesheet-entry'
    || path === '/api/hris/time-and-logs/project-sites'
    || path === '/hris/workforce-management/timesheet-approval'
    || path.startsWith('/hris/workforce-management/timesheet-approval-')
    || path === '/hris/time-and-logs/timesheet-approval'
    || path.startsWith('/hris/time-and-logs/timesheet-approval-')
    || path === '/api/hris/time-and-logs/timesheet-approval'
    || path.startsWith('/api/hris/time-and-logs/timesheet-approval')
  );
};

export const assertTimesheetEntryAndApprovalAccess = (session: TimesheetAccessSession | null | undefined) => {
  if (!canAccessTimesheetEntryAndApproval(session)) {
    throw new Error('Timesheet Entry and Approval are restricted to supervisors, line managers, IT, and admins.');
  }
};
