const normalizePath = (pathname: string) => pathname.replace(/\/+$/, '') || '/';

const BANK_FINANCE_SECTIONS = new Set([
  'bank-finance',
  'bank-and-finance',
  'finance-integration',
  'bank-payments-and-finance-integration',
]);

export const BANK_FINANCE_PERMISSIONS = [
  'page.payroll.management.bank-finance.view',
  'reports.payroll.bank-schedule.view',
  'button.payroll.post.view',
  'payroll.workflow.finance-review.view',
];

export const FULL_PAYROLL_MANAGEMENT_PERMISSIONS = [
  'payroll.view',
  'page.payroll.management.view',
  'payroll.*',
  'page.payroll.management.*',
  'page.hris.payroll.*',
];

export const hasPermission = (permissions: string[], required: string) => {
  if (permissions.includes('*')) return true;
  if (permissions.includes(required)) return true;
  const [module] = required.split('.');
  return permissions.includes(`${module}.*`);
};

export const hasAnyPermission = (permissions: string[], required: string[]) =>
  required.some((permission) => hasPermission(permissions, permission));

export const isBankFinancePayrollPath = (pathname: string) => {
  const path = normalizePath(pathname.split('?')[0] || pathname);
  if (path === '/hris/payroll-management/bank-finance') return true;
  const match = path.match(/^\/hris\/payroll-management\/([^/]+)/);
  return Boolean(match && BANK_FINANCE_SECTIONS.has(match[1]));
};

export const hasFullPayrollManagementAccess = (permissions: string[]) =>
  hasAnyPermission(permissions, FULL_PAYROLL_MANAGEMENT_PERMISSIONS);

export const hasBankFinanceAccess = (permissions: string[]) =>
  hasAnyPermission(permissions, [...BANK_FINANCE_PERMISSIONS, 'finance.view']);

export const isFinancePayrollOnlyUser = (
  permissions: string[],
  options?: { isGlobalAdmin?: boolean },
) => {
  if (options?.isGlobalAdmin) return false;
  if (hasFullPayrollManagementAccess(permissions)) return false;
  return hasBankFinanceAccess(permissions);
};

export const payrollRoutePermissionOptions = (pathname: string): string[] | null => {
  const path = normalizePath(pathname.split('?')[0] || pathname);

  if (isBankFinancePayrollPath(path)) {
    return [
      ...BANK_FINANCE_PERMISSIONS,
      'payroll.view',
      'page.payroll.management.view',
      'finance.view',
    ];
  }

  if (path.startsWith('/hris/payroll/payroll-approval') || path.includes('/payroll-approval')) {
    return [
      'page.hris.payroll.approval.view',
      'page.payroll.management.approval.view',
      'payroll.workflow.hr-review.view',
      'payroll.workflow.finance-review.view',
      'payroll.workflow.cfo-approval.view',
      'payroll.workflow.global-override.view',
      'payroll.view',
      'page.payroll.management.view',
    ];
  }

  if (path.startsWith('/hris/payroll') || path.startsWith('/hris/payroll-management')) {
    return ['payroll.view', 'page.payroll.management.view'];
  }

  return null;
};

export const canAccessPayrollPath = (
  permissions: string[],
  pathname: string,
  options?: { isGlobalAdmin?: boolean },
) => {
  if (options?.isGlobalAdmin) return true;
  const path = normalizePath(pathname.split('?')[0] || pathname);
  const optionsList = payrollRoutePermissionOptions(path);
  if (!optionsList) return true;
  if (!hasAnyPermission(permissions, optionsList)) return false;
  if (
    (path.startsWith('/hris/payroll') || path.startsWith('/hris/payroll-management'))
    && !isBankFinancePayrollPath(path)
    && isFinancePayrollOnlyUser(permissions, options)
  ) {
    return false;
  }
  return true;
};

export const FINANCE_ONLY_PAYROLL_SECTION = 'finance-integration' as const;

export const FINANCE_ONLY_PAYROLL_ACTIONS = new Set([
  'generate-bank-schedule',
  'validate-bank-accounts',
  'export-bank-file',
  'mark-payment-sent',
  'mark-payment-confirmed',
  'reconcile-bank-payment',
  'post-run',
  'export-journal-sage',
  'finance-manager-approve',
  'generate-report',
  'export-pdf',
  'export-csv',
  'export-excel',
]);
