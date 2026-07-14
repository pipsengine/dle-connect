/** Permissions that belong to the HRIS / HR Management security boundary. */
export const HRIS_PERMISSION_PREFIXES = [
  'hris',
  'employees',
  'leave',
  'payroll',
  'performance',
  'recruitment',
  'onboarding',
  'offboarding',
  'attendance',
  'benefits',
  'reporting-line',
  'overtime',
  'page.hris',
  'page.payroll',
  'button.payroll',
  'reports.payroll',
  'view_hris',
] as const;

/** Roles that must never inherit HRIS access from their baseline or published grants. */
export const PLATFORM_ROLES_WITHOUT_HRIS = new Set(['Admin', 'System Administrator']);

export const isHrisPermission = (permission: string) => {
  const value = String(permission || '').trim().toLowerCase();
  if (!value) return false;
  if (value === '*' || value === 'hris.*') return true;
  return HRIS_PERMISSION_PREFIXES.some((prefix) => {
    const p = prefix.toLowerCase();
    return value === p || value.startsWith(`${p}.`) || value === `${p}.*`;
  });
};

export const stripHrisPermissions = (permissions: string[]) =>
  permissions.filter((permission) => !isHrisPermission(permission));

export const rolesRequireHrisExclusion = (roles: string[]) => {
  if (roles.includes('Super Administrator')) return false;
  const elevated = roles.filter((role) => !['Employee', 'Read-Only User', 'Auditor'].includes(role));
  if (!elevated.length) return false;
  // Only strip HRIS when every elevated role is Admin / System Administrator.
  return elevated.every((role) => PLATFORM_ROLES_WITHOUT_HRIS.has(role));
};

/**
 * Platform administration outside HRIS / HR Management.
 * Covers enterprise modules, IT, ops, finance (non-payroll HRIS), and administration.
 */
export const PLATFORM_WITHOUT_HRIS_PERMISSIONS = [
  'enterprise.view',
  'dashboard.view',
  'view_dashboard',
  'view_ai_copilot',
  'admin.*',
  'admin.roles.view',
  'admin.roles.edit',
  'admin.roles.assign',
  'admin.users.view',
  'admin.users.edit',
  'security.*',
  'audit.*',
  'integration.*',
  'backup.*',
  'workflow.*',
  'reports.view',
  'reports.export',
  'view_reports_analytics',
  'finance.*',
  'view_finance_accounting',
  'procurement.*',
  'view_procurement',
  'project.*',
  'view_projects_engineering',
  'operations.*',
  'view_erp',
  'view_eam_cmms',
  'asset.*',
  'maintenance.*',
  'hse.*',
  'view_hse_management',
  'quality.*',
  'view_quality_management',
  'inventory.*',
  'view_inventory_management',
  'fleet.*',
  'logistics.*',
  'view_logistics_fleet',
  'view_sales_crm',
  'documents.*',
  'view_document_management',
  'it.*',
  'it.assets.*',
  'view_it_support',
  'view_it_assets',
  'view_itsm',
  'view_knowledge_base',
  'view_cybersecurity',
  'view_system_monitoring',
  'service-desk.view',
  'service-desk.create',
  'service-desk.edit',
  'application-support.view',
  'application-support.edit',
  'infrastructure.view',
  'infrastructure.edit',
  'page.it-support.asset-management.view',
  'button.it-support.asset-management.export',
  'page.admin.access-control.view',
  'page.admin.user-management.view',
  'page.admin.backup-disaster-recovery.view',
  'ess.view',
  'profile.view',
  'view_workforce_portal',
  'view_administration',
] as const;

export const applyHrisExclusionForRoles = (permissions: string[], roles: string[]) => {
  if (!rolesRequireHrisExclusion(roles)) return permissions;
  return stripHrisPermissions(permissions);
};

export const applyHrisExclusionForSubject = (
  permissions: string[],
  subjectType: 'role' | 'user',
  subjectId: string,
  subjectRoles?: string[],
) => {
  if (subjectType === 'role' && PLATFORM_ROLES_WITHOUT_HRIS.has(subjectId)) {
    return stripHrisPermissions(permissions);
  }
  if (subjectType === 'user' && subjectRoles?.length) {
    return applyHrisExclusionForRoles(permissions, subjectRoles);
  }
  return permissions;
};
