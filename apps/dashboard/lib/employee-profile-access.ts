export type EmployeeProfileRole =
  | 'Super Admin'
  | 'HR Director'
  | 'HR Manager'
  | 'HR Officer'
  | 'Admin Officer'
  | 'Legal Officer'
  | 'Department Head'
  | 'Line Manager'
  | 'Payroll Officer'
  | 'HSE Officer'
  | 'Compliance Officer'
  | 'Auditor'
  | 'IT Administrator'
  | 'Employee'
  | 'Executive Management';

export type EmployeeProfilePermissions = {
  isSelf: boolean;
  canViewProfile: boolean;
  canViewPayroll: boolean;
  canViewMedical: boolean;
  canViewDisciplinary: boolean;
  canEdit: boolean;
  canEditPayroll: boolean;
  canChangeStatus: boolean;
  canManagePayrollClassification: boolean;
  canViewAudit: boolean;
  canViewSensitivePersonal: boolean;
  canViewDocuments: boolean;
};

export type EmployeeProfileAccess = {
  role: EmployeeProfileRole;
  displayRole: string;
  viewerEmployeeId?: string;
  perms: EmployeeProfilePermissions;
};

export type EmployeeProfileAccessInput = {
  roles?: string[];
  permissions?: string[];
  isGlobalAdmin?: boolean;
  subjectEmployeeId: string;
  viewerEmployeeId?: string;
};

const KNOWN_ROLES: EmployeeProfileRole[] = [
  'Super Admin',
  'HR Director',
  'HR Manager',
  'HR Officer',
  'Admin Officer',
  'Legal Officer',
  'Department Head',
  'Line Manager',
  'Payroll Officer',
  'HSE Officer',
  'Compliance Officer',
  'Auditor',
  'IT Administrator',
  'Employee',
  'Executive Management',
];

const hasNamedPermission = (permissions: string[], required: string) => {
  if (permissions.includes('*') || permissions.includes(required)) return true;
  const [module] = required.split('.');
  return Boolean(module && permissions.includes(`${module}.*`));
};

const roleBlob = (roles: string[]) => roles.join(' ').toLowerCase();

export const resolveEmployeeProfileAccess = (input: EmployeeProfileAccessInput): EmployeeProfileAccess => {
  const roles = (input.roles || []).map((role) => String(role || '').trim()).filter(Boolean);
  const permissions = (input.permissions || []).map((item) => String(item || '').trim()).filter(Boolean);
  const text = roleBlob(roles);
  const isSuper = Boolean(input.isGlobalAdmin) || /super administrator|\bsuper admin\b/.test(text) || permissions.includes('*');

  const hasHrAdministrator = /hr administrator/.test(text);
  const hasHrDirector = /hr director/.test(text);
  const hasHrManager = /hr manager/.test(text);
  const hasHrOfficer = /hr officer|employee records/.test(text);
  const hasAdminOfficer = /admin officer/.test(text);
  const hasPayroll = /payroll officer|payroll administrator|payroll supervisor|payroll approver|payroll auditor|\bpayroll\b/.test(text);
  const hasHse = /\bhse\b/.test(text);
  const hasCompliance = /compliance/.test(text);
  const hasAuditor = /\bauditor\b|\baudit administrator\b/.test(text);
  const hasIt = /it administrator/.test(text);
  const hasDeptHead = /department head/.test(text);
  const hasLineManager = /line manager/.test(text);
  const hasExecutive = /executive/.test(text);
  const hasLegal = /legal officer/.test(text);

  const asHrDirector = isSuper || hasHrDirector || hasHrAdministrator;
  const asHrManager = asHrDirector || hasHrManager;
  const asHrOfficer = asHrManager || hasHrOfficer;
  const asPayroll = isSuper || hasPayroll || hasNamedPermission(permissions, 'payroll.edit') || hasNamedPermission(permissions, 'payroll.*');
  const asExecutive = isSuper || hasExecutive;

  const canEdit = isSuper
    || asHrDirector
    || asHrManager
    || asHrOfficer
    || hasAdminOfficer
    || hasNamedPermission(permissions, 'employees.edit')
    || hasNamedPermission(permissions, 'employees.*')
    || hasNamedPermission(permissions, 'hris.*');
  const canViewPayroll = isSuper
    || asPayroll
    || asHrDirector
    || asHrManager
    || asExecutive
    || hasNamedPermission(permissions, 'payroll.view')
    || hasNamedPermission(permissions, 'payroll.*');
  const canEditPayroll = canViewPayroll && (canEdit || asPayroll);
  const canChangeStatus = isSuper || asHrDirector || asHrManager;
  const canManagePayrollClassification = isSuper || asHrDirector || asHrManager || asPayroll;
  const canViewMedical = isSuper || asHrDirector || hasHse || hasCompliance;
  const canViewDisciplinary = isSuper || asHrDirector || asHrManager || hasCompliance;
  const elevated = asHrDirector || asHrManager || asHrOfficer || hasAdminOfficer || asPayroll || hasHse || hasCompliance || hasAuditor || hasIt || hasDeptHead || hasLineManager || asExecutive || hasLegal || canEdit;
  const viewerEmployeeId = input.viewerEmployeeId?.trim() || undefined;
  const isSelf = viewerEmployeeId ? viewerEmployeeId === input.subjectEmployeeId : false;
  const canViewProfile = elevated || isSelf;
  const canViewAudit = elevated && !hasIt;
  const canViewSensitivePersonal = canViewProfile && !hasIt && !hasAuditor;
  const canViewDocuments = canViewProfile && !hasIt;

  let role: EmployeeProfileRole = 'Employee';
  if (isSuper) role = 'Super Admin';
  else if (asHrDirector) role = 'HR Director';
  else if (asHrManager) role = 'HR Manager';
  else if (asPayroll && canEdit) role = 'HR Manager';
  else if (asPayroll) role = 'Payroll Officer';
  else if (asHrOfficer) role = 'HR Officer';
  else if (hasAdminOfficer) role = 'Admin Officer';
  else if (hasLegal) role = 'Legal Officer';
  else if (hasDeptHead) role = 'Department Head';
  else if (hasLineManager) role = 'Line Manager';
  else if (hasHse) role = 'HSE Officer';
  else if (hasCompliance) role = 'Compliance Officer';
  else if (hasAuditor) role = 'Auditor';
  else if (hasIt) role = 'IT Administrator';
  else if (asExecutive) role = 'Executive Management';
  else if (KNOWN_ROLES.includes(roles[0] as EmployeeProfileRole)) role = roles[0] as EmployeeProfileRole;

  const displayRole = roles.find((item) => /payroll administrator/i.test(item))
    || roles.find((item) => /hr administrator/i.test(item))
    || roles.find((item) => /payroll officer/i.test(item))
    || role;

  return {
    role,
    displayRole,
    viewerEmployeeId,
    perms: {
      isSelf,
      canViewProfile,
      canViewPayroll,
      canViewMedical,
      canViewDisciplinary,
      canEdit,
      canEditPayroll,
      canChangeStatus,
      canManagePayrollClassification,
      canViewAudit,
      canViewSensitivePersonal,
      canViewDocuments,
    },
  };
};
