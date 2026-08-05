import { hasAnyPermission } from '@/lib/auth/permission-match';
import { FINANCE_PAYMENTS_SELF_PERMISSION } from '@/lib/finance-intelligence/payment-access';

export const FINANCE_VIEW_PERMISSIONS = [
  'finance.view',
  'finance.*',
  'view_finance_intelligence',
  'view_finance_accounting',
  'budget.view',
  'treasury.view',
] as const;

export const FINANCE_PAYMENT_SELF_PERMISSIONS = [
  FINANCE_PAYMENTS_SELF_PERMISSION,
  'ess.view',
  'workflow.approve',
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
  return hasAnyPermission(permissions || [], [...FINANCE_VIEW_PERMISSIONS, ...FINANCE_PAYMENT_SELF_PERMISSIONS]);
};

/** Full Finance Intelligence (reporting, config, ops desks) — not payment self-service alone. */
export const canAccessFullFinanceIntelligence = (
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
  const fullFinance = canAccessFullFinanceIntelligence(permissions, isGlobalAdmin);
  if (sectionId === 'configuration') return canConfigureFinance(permissions, isGlobalAdmin);
  if (sectionId === 'approvals') {
    return fullFinance
      || canApproveFinance(permissions, isGlobalAdmin)
      || hasAnyPermission(permissions || [], [...FINANCE_PAYMENT_SELF_PERMISSIONS]);
  }
  if (sectionId === 'monitoring') {
    return fullFinance || canApproveFinance(permissions, isGlobalAdmin);
  }
  // Self-service users only see Payment Approvals — not reporting/overview/etc.
  if (!fullFinance) return false;
  return true;
};
