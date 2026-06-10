export type HrisRole =
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

const rolePermissions: Record<HrisRole, HrisPermission[]> = {
  OrganizationAdmin: ['organization.view', 'attendance.manage', 'timesheet.approve', 'timesheet.period.manage', 'positions.manage', 'vacancy.manage', 'workforce.manage', 'audit.view'],
  HRBusinessPartner: ['organization.view', 'attendance.manage', 'timesheet.approve', 'timesheet.period.manage', 'positions.manage', 'vacancy.manage', 'workforce.manage', 'audit.view'],
  Recruiter: ['organization.view', 'vacancy.manage', 'audit.view'],
  WorkforcePlanner: ['organization.view', 'workforce.manage', 'audit.view'],
  Auditor: ['organization.view', 'audit.view'],
  Viewer: ['organization.view'],
};

const knownRoles: HrisRole[] = ['OrganizationAdmin', 'HRBusinessPartner', 'Recruiter', 'WorkforcePlanner', 'Auditor', 'Viewer'];

export type HrisAccessContext = {
  actor: string;
  role: HrisRole;
  permissions: HrisPermission[];
};

export const resolveAccessContext = (request: Request): HrisAccessContext => {
  const roleHeader = request.headers.get('x-hris-role')?.trim() as HrisRole | undefined;
  const role = roleHeader && knownRoles.includes(roleHeader) ? roleHeader : 'OrganizationAdmin';
  const actor = request.headers.get('x-hris-actor')?.trim() || 'HRIS Administrator';
  return {
    actor,
    role,
    permissions: rolePermissions[role],
  };
};

export const hasPermission = (context: HrisAccessContext, permission: HrisPermission) => context.permissions.includes(permission);

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
});
