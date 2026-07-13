import type { SessionPayload } from '@/lib/auth/session';
import { canAccessAdministrationCentre, hasAnyPermission, hasPermission } from '@/lib/auth/permission-match';
import { canAccessPayrollPath, payrollRoutePermissionOptions } from '@/lib/access/payroll-access';

type SessionLike = Pick<SessionPayload, 'department' | 'unit' | 'roles' | 'permissions' | 'isGlobalAdmin'>;

const normalizePath = (pathname: string) => pathname.replace(/\/+$/, '') || '/';
const routePathFromRequestPath = (pathname: string) => {
  const path = normalizePath(pathname);
  if (path.startsWith('/api/hris/')) return path.replace(/^\/api\/hris/, '/hris');
  if (path === '/api/hris') return '/hris';
  if (path.startsWith('/api/it-support/asset-management')) return '/it-support/asset-management';
  return path;
};

const administrationRoutePermissions = (pathname: string): string[] => {
  const path = normalizePath(pathname);
  if (path.startsWith('/administration/user-management')) return ['admin.users.view'];
  if (path.startsWith('/administration/access-control')) return ['admin.roles.view'];
  if (path.startsWith('/administration/audit-trail') || path.startsWith('/administration/compliance-and-governance')) return ['audit.view'];
  if (path.startsWith('/administration/approval-workflow')) return ['workflow.configure'];
  if (path.startsWith('/administration/system-settings')) return ['security.configure'];
  if (path.startsWith('/administration/backup-disaster-recovery')) return ['backup.view', 'backup.configure'];
  if (path.startsWith('/administration/integrations')) return ['integration.view'];
  if (path.startsWith('/administration/ai-and-automation')) return ['it.view'];
  return ['admin.roles.view', 'admin.users.view'];
};

export const isHrPortalUser = (session: SessionLike) => {
  if (session.isGlobalAdmin || (session.roles || []).includes('Super Administrator')) return true;
  const text = `${session.department || ''} ${session.unit || ''} ${(session.roles || []).join(' ')}`.toLowerCase();
  return /\bhr\b/.test(text) || text.includes('human resources') || text.includes('human resource') || text.includes('human capital');
};

export const hrisRoutePermissionOptions = (pathname: string): string[] | null => {
  const path = normalizePath(pathname);
  if (path.startsWith('/hris/workforce-management/overtime-management')) {
    return [
      'page.hris.workforce-management.overtime-management.view',
      'overtime.authorization.view',
      'overtime.authorization.create',
      'overtime.authorization.approve',
      'overtime.authorization.project-manager.approve',
      'overtime.authorization.md.approve',
      'overtime.authorization.override.override',
      'workforce.view',
      'workforce.manage',
      'operations.view',
      'operations.timesheets.view',
      'operations.timesheets.submit',
      'operations.timesheets.approve',
      'operations.timesheets.export',
    ];
  }
  if (path.startsWith('/hris/reporting-line') || path.startsWith('/hris/employees/reporting-line')) {
    return [
      'reporting-line.bulk-reassignment.assign',
      'reporting-line.maintenance-assignment.assign',
      'employees.edit',
      'employees.assign',
      'hris.view',
    ];
  }
  if (path === '/hris/workforce-management/timesheet-entry' || path === '/hris/time-and-logs/timesheet-entry' || path === '/hris/time-and-logs/project-sites') {
    return [
      'page.hris.time-and-logs.timesheet-entry.view',
      'timesheet.entry.view',
      'timesheet.controls.supervisor-search.view',
      'timesheet.controls.location-search.view',
      'timesheet.controls.work-center-search.view',
      'timesheet.work-center.view',
      'operations.timesheets.view',
      'operations.timesheets.create',
      'operations.timesheets.edit',
      'operations.timesheets.submit',
      'operations.timesheets.approve',
      'timesheet.view',
      'timesheet.create',
      'timesheet.edit',
      'timesheet.submit',
      'timesheet.approve',
    ];
  }
  if (path === '/hris/workforce-management/timesheet-approval' || path === '/hris/time-and-logs/timesheet-approval') {
    return [
      'page.hris.time-and-logs.timesheet-approval.view',
      'timesheet.supervisor.approve',
      'timesheet.cost-control.approve',
      'timesheet.project-manager.approve',
      'timesheet.hr.approve',
      'timesheet.payroll.approve',
      'operations.timesheets.approve',
      'timesheet.approve',
    ];
  }
  if (path === '/hris/workforce-management/timesheet-reports' || path === '/hris/time-and-logs/timesheet-reports') {
    return ['operations.timesheets.view', 'operations.timesheets.export', 'timesheet.view', 'timesheet.export'];
  }
  if (path === '/hris/workforce-management/reports-and-analytics' || path.startsWith('/hris/workforce-management/reports-and-analytics/')) {
    return ['operations.timesheets.view', 'operations.timesheets.export', 'timesheet.view', 'timesheet.export', 'payroll.view'];
  }
  if (path === '/hris/workforce-management/timesheet-period' || path === '/hris/time-and-logs/timesheet-period') {
    return ['timesheet.period.manage', 'timesheet.period.view', 'timesheet.period.configure', 'timesheet.manage', 'timesheet.work-center.configure'];
  }
  if (path === '/hris/organization/work-centers') {
    return [
      'page.hris.organization.work-centers.view',
      'timesheet.work-center.view',
      'timesheet.work-center.create',
      'timesheet.work-center.edit',
      'timesheet.work-center.configure',
      'positions.view',
      'workforce.view',
      'hris.view',
    ];
  }
  const payrollOptions = payrollRoutePermissionOptions(path);
  if (payrollOptions) return payrollOptions;
  if (path.startsWith('/hris/performance-management')) {
    return ['performance.view', 'hris.performance-management', 'hris.view', 'page.hris.management.view'];
  }
  return null;
};

export const canAccessHrisPath = (session: SessionLike, pathname: string) => {
  const roles = session.roles || [];
  const permissions = session.permissions || [];
  if (session.isGlobalAdmin || roles.includes('Super Administrator')) return true;
  const path = normalizePath(pathname);
  if (path.includes('/authorize') || path.includes('/email-action')) return true;
  const explicitOptions = hrisRoutePermissionOptions(path);
  if (explicitOptions) {
    if (!hasAnyPermission(permissions, explicitOptions)) return false;
    if ((path.startsWith('/hris/payroll') || path.startsWith('/hris/payroll-management'))
      && !canAccessPayrollPath(permissions, path, { isGlobalAdmin: session.isGlobalAdmin })) {
      return false;
    }
    return true;
  }
  if (!isHrPortalUser(session)) return false;
  if (path === '/hris') return hasAnyPermission(permissions, ['page.hris.management.view', 'hris.view']);
  if (path.startsWith('/hris/employees')) return hasAnyPermission(permissions, ['employees.view', 'hris.view']);
  if (path.startsWith('/hris/leave-management')) return hasAnyPermission(permissions, ['leave.view', 'hris.view']);
  if (path.startsWith('/hris/performance-management')) return hasAnyPermission(permissions, ['performance.view', 'hris.performance-management', 'hris.view', 'page.hris.management.view']);
  if (path.startsWith('/hris/attendance')) return hasAnyPermission(permissions, ['attendance.view', 'attendance.manage', 'hris.view']);
  if (path.startsWith('/hris/organization')) {
    return hasAnyPermission(permissions, [
      'positions.view',
      'workforce.view',
      'hris.view',
      'page.hris.organization.work-centers.view',
      'timesheet.work-center.view',
      'timesheet.work-center.configure',
      'timesheet.work-center.create',
      'timesheet.work-center.edit',
    ]);
  }
  if (path.startsWith('/hris/administration/backup-disaster-recovery')) return hasAnyPermission(permissions, ['backup.view', 'backup.configure', 'page.admin.backup-disaster-recovery.view', 'security.configure']);
  if (path.startsWith('/hris/administration')) return hasAnyPermission(permissions, ['admin.roles.view', 'admin.users.view', 'audit.view', 'backup.view', 'backup.configure']);
  return hasAnyPermission(permissions, ['page.hris.management.view', 'hris.view']);
};

export const itSupportRoutePermissionOptions = (pathname: string): string[] | null => {
  const path = normalizePath(pathname);
  if (path.startsWith('/it-support/asset-management')) {
    return ['view_it_assets', 'view_it_support', 'it.view'];
  }
  if (path.startsWith('/it-support')) {
    return ['view_it_support', 'it.view'];
  }
  return null;
};

export const canAccessRoute = (session: SessionLike, pathname: string) => {
  const path = routePathFromRequestPath(pathname);
  if (path.startsWith('/hris')) return canAccessHrisPath(session, path);
  if (path.startsWith('/administration')) {
    if (!canAccessAdministrationCentre(session)) return false;
    return hasAnyPermission(session.permissions || [], administrationRoutePermissions(path));
  }
  const itOptions = itSupportRoutePermissionOptions(path);
  if (itOptions) {
    if (session.isGlobalAdmin || (session.roles || []).includes('Super Administrator')) return true;
    return hasAnyPermission(session.permissions || [], itOptions);
  }
  return true;
};
