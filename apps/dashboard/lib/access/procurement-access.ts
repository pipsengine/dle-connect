import { hasAnyPermission, hasUnrestrictedAccess } from '@/lib/auth/permission-match';
import { MD_CEO_EMPLOYEE_CODE } from '@/lib/finance-intelligence/payment-access';
import { PROCUREMENT_NAV, type ProcurementNavItem } from '@/lib/procurement/nav';

export const PROCUREMENT_VIEW_PERMISSIONS = [
  'view_procurement',
  'procurement.view',
  'procurement.*',
  'vendor.view',
] as const;

export const PROCUREMENT_CREATE_PERMISSIONS = [
  'procurement.create',
  'procurement.*',
  'vendor.create',
] as const;

export const PROCUREMENT_EDIT_PERMISSIONS = [
  'procurement.edit',
  'procurement.*',
  'vendor.edit',
] as const;

export const PROCUREMENT_APPROVE_PERMISSIONS = [
  'procurement.approve',
  'procurement.reject',
  'procurement.*',
] as const;

/** Line managers / executives who approve PRs or SSJs without full procurement ops access. */
export const PROCUREMENT_APPROVER_SURFACE_PERMISSIONS = [
  ...PROCUREMENT_VIEW_PERMISSIONS,
  ...PROCUREMENT_APPROVE_PERMISSIONS,
  'workflow.approve',
] as const;

const compact = (value: unknown) => String(value ?? '').trim();
const upper = (value: unknown) => compact(value).toUpperCase().replace(/[^A-Z0-9]/g, '');

export const canAccessProcurementPortal = (permissions: string[], isGlobalAdmin?: boolean) =>
  hasUnrestrictedAccess(permissions, isGlobalAdmin) || hasAnyPermission(permissions, [...PROCUREMENT_VIEW_PERMISSIONS]);

export const canViewProcurement = canAccessProcurementPortal;

export const canCreateProcurement = (permissions: string[], isGlobalAdmin?: boolean) =>
  hasUnrestrictedAccess(permissions, isGlobalAdmin) ||
  hasAnyPermission(permissions, [...PROCUREMENT_VIEW_PERMISSIONS, ...PROCUREMENT_CREATE_PERMISSIONS]);

export const canEditProcurement = (permissions: string[], isGlobalAdmin?: boolean) =>
  hasUnrestrictedAccess(permissions, isGlobalAdmin) ||
  hasAnyPermission(permissions, [
    ...PROCUREMENT_VIEW_PERMISSIONS,
    ...PROCUREMENT_CREATE_PERMISSIONS,
    ...PROCUREMENT_EDIT_PERMISSIONS,
  ]);

export const canApproveProcurement = (permissions: string[], isGlobalAdmin?: boolean) =>
  hasUnrestrictedAccess(permissions, isGlobalAdmin) ||
  hasAnyPermission(permissions, [...PROCUREMENT_APPROVE_PERMISSIONS]);

/** Portal surfaces used for PR / SSJ approval (not the full procurement command centre). */
export const canAccessProcurementApproverSurface = (permissions: string[], isGlobalAdmin?: boolean) =>
  hasUnrestrictedAccess(permissions, isGlobalAdmin)
  || hasAnyPermission(permissions, [...PROCUREMENT_APPROVER_SURFACE_PERMISSIONS]);

export const sessionLooksLikeManagingDirector = (session: {
  employeeCode?: string | null;
  roles?: string[] | null;
}) => {
  if (upper(session.employeeCode) === upper(MD_CEO_EMPLOYEE_CODE)) return true;
  return (session.roles || []).some((role) =>
    /managing\s*director|md\s*\/?\s*ceo|chief\s*executive|^executive director$|^executive management$/i.test(compact(role)),
  );
};

/** GET/POST gates for PR + SSJ workflow without opening the whole procurement module. */
export const canAccessProcurementWorkflowApis = (
  permissions: string[],
  session: { employeeCode?: string | null; roles?: string[] | null; isGlobalAdmin?: boolean },
) =>
  canViewProcurement(permissions, session.isGlobalAdmin)
  || canAccessProcurementApproverSurface(permissions, session.isGlobalAdmin)
  || sessionLooksLikeManagingDirector(session);

export const filterProcurementNav = (permissions: string[], isGlobalAdmin?: boolean): ProcurementNavItem[] =>
  PROCUREMENT_NAV.filter(
    (item) =>
      hasUnrestrictedAccess(permissions, isGlobalAdmin) || hasAnyPermission(permissions, item.permissionKeys),
  );
