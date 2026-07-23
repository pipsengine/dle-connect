import { hasPermission as hasAccPermission } from '@/lib/auth/session';

export type HrisRole =
  | 'Super Administrator'
  | 'OrganizationAdmin'
  | 'HRBusinessPartner'
  | 'Recruiter'
  | 'WorkforcePlanner'
  | 'Auditor'
  | 'Viewer';

export type HrisPermission =
  | 'organization.view'
  | 'attendance.manage'
  | 'timesheet.approve'
  | 'timesheet.period.manage'
  | 'positions.manage'
  | 'vacancy.manage'
  | 'workforce.manage'
  | 'audit.view';

const allHrisPermissions: HrisPermission[] = [
  'organization.view',
  'attendance.manage',
  'timesheet.approve',
  'timesheet.period.manage',
  'positions.manage',
  'vacancy.manage',
  'workforce.manage',
  'audit.view',
];

const rolePermissions: Record<HrisRole, HrisPermission[]> = {
  'Super Administrator': allHrisPermissions,
  OrganizationAdmin: allHrisPermissions,
  HRBusinessPartner: allHrisPermissions,
  Recruiter: ['organization.view', 'vacancy.manage', 'audit.view'],
  WorkforcePlanner: ['organization.view', 'workforce.manage', 'audit.view'],
  Auditor: ['organization.view', 'audit.view'],
  Viewer: ['organization.view'],
};

const knownRoles: HrisRole[] = ['Super Administrator', 'OrganizationAdmin', 'HRBusinessPartner', 'Recruiter', 'WorkforcePlanner', 'Auditor', 'Viewer'];

export type HrisAccessContext = {
  actor: string;
  role: HrisRole;
  permissions: HrisPermission[];
  accPermissions: string[];
};

export const permissionsFromRequest = (request: Request) =>
  (request.headers.get('x-auth-permissions') || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const accGrantsHrisPermission = (acc: string[], permission: HrisPermission) => {
  if (hasAccPermission(acc, '*')) return true;
  switch (permission) {
    case 'organization.view':
      return hasAccPermission(acc, 'organization.view')
        || hasAccPermission(acc, 'hris.view')
        || hasAccPermission(acc, 'employees.view')
        || hasAccPermission(acc, 'page.hris.management.view');
    case 'attendance.manage':
      return hasAccPermission(acc, 'attendance.manage')
        || hasAccPermission(acc, 'attendance.edit')
        || hasAccPermission(acc, 'attendance.*');
    case 'timesheet.approve':
      return hasAccPermission(acc, 'timesheet.approve')
        || hasAccPermission(acc, 'timesheet.supervisor.approve')
        || hasAccPermission(acc, 'timesheet.cost-control.approve')
        || hasAccPermission(acc, 'timesheet.project-manager.approve')
        || hasAccPermission(acc, 'timesheet.gm-operations.approve')
        || hasAccPermission(acc, 'timesheet.hr.approve')
        || hasAccPermission(acc, 'timesheet.payroll.approve')
        || hasAccPermission(acc, 'operations.timesheets.approve')
        || hasAccPermission(acc, 'timesheet.*');
    case 'timesheet.period.manage':
      return hasAccPermission(acc, 'timesheet.period.manage')
        || hasAccPermission(acc, 'timesheet.work-center.configure')
        || hasAccPermission(acc, 'timesheet.work-center.edit')
        || hasAccPermission(acc, 'timesheet.manage');
    case 'positions.manage':
      return hasAccPermission(acc, 'positions.manage')
        || hasAccPermission(acc, 'positions.edit')
        || hasAccPermission(acc, 'positions.*');
    case 'vacancy.manage':
      return hasAccPermission(acc, 'vacancy.manage')
        || hasAccPermission(acc, 'recruitment.edit')
        || hasAccPermission(acc, 'recruitment.*');
    case 'workforce.manage':
      return hasAccPermission(acc, 'workforce.manage')
        || hasAccPermission(acc, 'overtime.authorization.create')
        || hasAccPermission(acc, 'overtime.authorization.approve')
        || hasAccPermission(acc, 'overtime.authorization.project-manager.approve')
        || hasAccPermission(acc, 'overtime.authorization.md.approve')
        || hasAccPermission(acc, 'overtime.authorization.override.override')
        || hasAccPermission(acc, 'overtime.authorization.*');
    case 'audit.view':
      return hasAccPermission(acc, 'audit.view') || hasAccPermission(acc, 'audit.*');
    default:
      return hasAccPermission(acc, permission);
  }
};

const deriveHrisPermissions = (acc: string[], role: HrisRole, isGlobalAdmin: boolean): HrisPermission[] => {
  if (isGlobalAdmin || acc.includes('*')) return allHrisPermissions;
  const fromAcc = allHrisPermissions.filter((permission) => accGrantsHrisPermission(acc, permission));
  if (fromAcc.length) return Array.from(new Set(fromAcc));
  return rolePermissions[role];
};

export const deriveHrisRole = (roles: string[]): HrisRole => {
  const text = roles.join(' ').toLowerCase();
  if (roles.includes('Super Administrator')) return 'Super Administrator';
  if (/organization\s*admin|hr administrator|hr manager|application administrator/i.test(text)) return 'OrganizationAdmin';
  if (/hr business partner/i.test(text)) return 'HRBusinessPartner';
  if (/recruit/i.test(text)) return 'Recruiter';
  if (/workforce planner|workforce officer/i.test(text)) return 'WorkforcePlanner';
  if (/auditor/i.test(text)) return 'Auditor';
  return 'Viewer';
};

export const resolveAccessContext = (request: Request, accPermissionsOverride?: string[]): HrisAccessContext => {
  const accPermissions = accPermissionsOverride ?? permissionsFromRequest(request);
  const isGlobalAdmin = request.headers.get('x-auth-global-admin') === '1';
  const roleHeader = request.headers.get('x-hris-role')?.trim() as HrisRole | undefined;
  const role = roleHeader && knownRoles.includes(roleHeader) ? roleHeader : deriveHrisRole((request.headers.get('x-auth-roles') || '').split(',').map((item) => item.trim()).filter(Boolean));
  const actor = request.headers.get('x-hris-actor')?.trim() || 'HRIS User';
  return {
    actor,
    role,
    accPermissions,
    permissions: deriveHrisPermissions(accPermissions, role, isGlobalAdmin),
  };
};

export const hasPermission = (context: HrisAccessContext, permission: HrisPermission) => context.permissions.includes(permission);

export const hasAccTimesheetStageApprove = (acc: string[], stage: 'Supervisor' | 'Cost Control' | 'Project Manager' | 'GM Operations' | 'HR' | 'Payroll') => {
  if (hasAccPermission(acc, '*')) return true;
  const stageMap: Record<typeof stage, string[]> = {
    Supervisor: ['timesheet.supervisor.approve', 'timesheet.approve', 'operations.timesheets.approve'],
    'Cost Control': ['timesheet.cost-control.approve', 'timesheet.approve', 'operations.timesheets.approve'],
    'Project Manager': ['timesheet.project-manager.approve', 'timesheet.approve', 'operations.timesheets.approve'],
    'GM Operations': ['timesheet.gm-operations.approve', 'timesheet.approve', 'operations.timesheets.approve'],
    HR: ['timesheet.hr.approve', 'timesheet.approve', 'operations.timesheets.approve'],
    Payroll: ['timesheet.payroll.approve', 'timesheet.payroll-posting.post', 'timesheet.approve', 'operations.timesheets.approve'],
  };
  return stageMap[stage].some((permission) => hasAccPermission(acc, permission));
};

export const hasAccOvertimeApprove = (acc: string[], stage: 'project-manager' | 'md' | 'supervisor' | 'hr' | 'override') => {
  if (hasAccPermission(acc, '*')) return true;
  if (stage === 'override') return hasAccPermission(acc, 'overtime.authorization.override.override');
  const stageMap: Record<typeof stage, string[]> = {
    'project-manager': ['overtime.authorization.project-manager.approve', 'overtime.authorization.approve', 'workforce.manage'],
    md: ['overtime.authorization.md.approve', 'overtime.authorization.approve', 'workforce.manage'],
    supervisor: ['overtime.authorization.approve', 'workforce.manage', 'operations.timesheets.approve'],
    hr: ['overtime.authorization.approve', 'workforce.manage', 'operations.timesheets.approve'],
  };
  return stageMap[stage].some((permission) => hasAccPermission(acc, permission));
};

export const getUiPermissions = (context: HrisAccessContext) => ({
  actor: context.actor,
  role: context.role,
  canEditAttendance: hasPermission(context, 'attendance.manage'),
  canApproveTimesheet: hasPermission(context, 'timesheet.approve'),
  canManageTimesheetPeriods: hasPermission(context, 'timesheet.period.manage'),
  canEditPositions: hasPermission(context, 'positions.manage'),
  canEditVacancies: hasPermission(context, 'vacancy.manage'),
  canEditWorkforce: hasPermission(context, 'workforce.manage'),
  canViewAudit: hasPermission(context, 'audit.view'),
  canApproveOvertimeProjectManager: hasAccOvertimeApprove(context.accPermissions, 'project-manager'),
  canApproveOvertimeMd: hasAccOvertimeApprove(context.accPermissions, 'md'),
  canOverrideOvertime: hasAccOvertimeApprove(context.accPermissions, 'override'),
});
