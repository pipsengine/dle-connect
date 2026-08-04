import { hasAnyPermission } from '@/lib/auth/permission-match';

export const FINANCE_VIEW_PERMISSIONS = [
  'finance.view',
  'finance.*',
  'view_finance_intelligence',
  'view_finance_accounting',
  'budget.view',
  'treasury.view',
] as const;

export const FINANCE_APPROVE_PERMISSIONS = [
  'finance.approve',
  'finance.*',
  'finance.ap.approve',
  'finance.ar.approve',
] as const;

export const FINANCE_CONFIG_PERMISSIONS = [
  'finance.configure',
  'finance.*',
  'admin.access',
  'platform.admin',
] as const;

export const canAccessFinanceModule = (
  permissions: string[] | undefined | null,
  isGlobalAdmin = false,
) => {
  if (isGlobalAdmin) return true;
  return hasAnyPermission(permissions || [], [...FINANCE_VIEW_PERMISSIONS]);
};

export const canApproveFinance = (
  permissions: string[] | undefined | null,
  isGlobalAdmin = false,
) => {
  if (isGlobalAdmin) return true;
  return hasAnyPermission(permissions || [], [...FINANCE_APPROVE_PERMISSIONS, ...FINANCE_VIEW_PERMISSIONS]);
};

export const canConfigureFinance = (
  permissions: string[] | undefined | null,
  isGlobalAdmin = false,
) => {
  if (isGlobalAdmin) return true;
  return hasAnyPermission(permissions || [], [...FINANCE_CONFIG_PERMISSIONS]);
};

export const canAccessFinanceSection = (
  sectionId: string,
  permissions: string[] | undefined | null,
  isGlobalAdmin = false,
) => {
  if (!canAccessFinanceModule(permissions, isGlobalAdmin)) return false;
  if (sectionId === 'configuration') return canConfigureFinance(permissions, isGlobalAdmin);
  if (sectionId === 'approvals' || sectionId === 'monitoring') {
    return canApproveFinance(permissions, isGlobalAdmin) || canAccessFinanceModule(permissions, isGlobalAdmin);
  }
  return true;
};
