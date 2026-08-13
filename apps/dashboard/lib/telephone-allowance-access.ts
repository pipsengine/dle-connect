import { hasAnyPermission } from '@/lib/auth/permission-match';

const VIEW = [
  'telephone-allowance.view',
  'page.it-support.telephone-allowance.view',
  'telephone-allowance.hr-review',
  'telephone-allowance.hr-approve',
  'telephone-allowance.md-approve',
  'telephone-allowance.cfo-authorize',
  'telephone-allowance.treasury',
  'telephone-allowance.export',
] as const;

export type TelephoneAllowanceCapabilities = {
  canView: boolean;
  /** Cycle prepare / initiate / import — Global Super Administrator only. */
  canPrepare: boolean;
  canHrReview: boolean;
  canHrApprove: boolean;
  canMdApprove: boolean;
  canCfoAuthorize: boolean;
  canTreasury: boolean;
  canExport: boolean;
  /** Same gate as prepare — Global Super Administrator only. */
  canImport: boolean;
  canSeeFullBank: boolean;
  isGlobalAdmin: boolean;
};

const isGlobalSuperAdmin = (permissions: string[], isGlobalAdmin?: boolean, roles?: string[]) =>
  Boolean(
    isGlobalAdmin
    || permissions.includes('*')
    || (roles || []).some((role) => /^(global\s+)?super\s+administrator$/i.test(role.trim())),
  );

export const telephoneAllowanceCapabilities = (
  permissions: string[],
  isGlobalAdmin?: boolean,
  roles?: string[],
): TelephoneAllowanceCapabilities => {
  const global = isGlobalSuperAdmin(permissions, isGlobalAdmin, roles);
  if (global) {
    return {
      canView: true,
      canPrepare: true,
      canHrReview: true,
      canHrApprove: true,
      canMdApprove: true,
      canCfoAuthorize: true,
      canTreasury: true,
      canExport: true,
      canImport: true,
      canSeeFullBank: true,
      isGlobalAdmin: true,
    };
  }

  // Non–Global Super Admin: stage-only access. Never grant prepare/import via role wildcards.
  const canHrReview = hasAnyPermission(permissions, ['telephone-allowance.hr-review']);
  const canHrApprove = hasAnyPermission(permissions, ['telephone-allowance.hr-approve']);
  const canMdApprove = hasAnyPermission(permissions, ['telephone-allowance.md-approve']);
  const canCfoAuthorize = hasAnyPermission(permissions, ['telephone-allowance.cfo-authorize']);
  const canTreasury = hasAnyPermission(permissions, [
    'telephone-allowance.treasury',
    'finance.treasury.operate',
  ]);
  const canExport = hasAnyPermission(permissions, [
    'telephone-allowance.export',
    'reports.export',
  ]) || canTreasury;
  const canView = hasAnyPermission(permissions, [...VIEW, 'finance.view', 'treasury.view', 'hris.view'])
    || canHrReview
    || canHrApprove
    || canMdApprove
    || canCfoAuthorize
    || canTreasury;

  return {
    canView,
    canPrepare: false,
    canHrReview,
    canHrApprove,
    canMdApprove,
    canCfoAuthorize,
    canTreasury,
    canExport,
    canImport: false,
    canSeeFullBank: canTreasury || canCfoAuthorize || hasAnyPermission(permissions, ['data.employee.bank.view', 'finance.*']),
    isGlobalAdmin: false,
  };
};

/** SoD: preparer cannot formally approve their own cycle. */
export const canFormallyApproveOwnPrep = (
  cyclePreparedBy: string,
  actorName: string,
  actorUsername: string,
) => {
  const prep = cyclePreparedBy.trim().toLowerCase();
  const actors = [actorName, actorUsername].map((v) => v.trim().toLowerCase()).filter(Boolean);
  return !actors.some((a) => a && a === prep);
};
