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

/** Stage / page grants held by payroll workflow approvers who must review salary. */
export const PAYROLL_WORKFLOW_REVIEW_PERMISSIONS = [
  'page.hris.payroll.approval.view',
  'page.payroll.management.approval.view',
  'page.hris.payroll.salary-management.view',
  'page.hris.payroll.salary-structure.view',
  'page.hris.payroll.employee-salary-setup.view',
  'payroll.workflow.hr-review.view',
  'payroll.workflow.hr-review.approve',
  'payroll.workflow.finance-review.view',
  'payroll.workflow.finance-review.approve',
  'payroll.workflow.cfo-approval.view',
  'payroll.workflow.cfo-approval.approve',
  'payroll.workflow.md-approval.view',
  'payroll.workflow.md-approval.approve',
  'payroll.workflow.global-override.view',
  'payroll.approve',
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

export const hasPayrollWorkflowReviewAccess = (permissions: string[]) =>
  hasAnyPermission(permissions, PAYROLL_WORKFLOW_REVIEW_PERMISSIONS);

/** Approvers may open salary review + approval workspaces without full payroll admin rights. */
export const hasPayrollSalaryReviewAccess = (permissions: string[]) =>
  hasFullPayrollManagementAccess(permissions) || hasPayrollWorkflowReviewAccess(permissions);

export const isFinancePayrollOnlyUser = (
  permissions: string[],
  options?: { isGlobalAdmin?: boolean },
) => {
  if (options?.isGlobalAdmin) return false;
  if (hasFullPayrollManagementAccess(permissions)) return false;
  return hasBankFinanceAccess(permissions);
};

/** Salary / Pay Setup surfaces that every workflow approver must be able to open. */
export const isPayrollSalaryReviewPath = (pathname: string) => {
  const path = normalizePath(pathname.split('?')[0] || pathname);
  return (
    path.includes('/pay-setup')
    || path.includes('/salary-management')
    || path.includes('/employee-salary-setup')
    || path.includes('/salary-structure')
  );
};

export const isPayrollApprovalPath = (pathname: string) => {
  const path = normalizePath(pathname.split('?')[0] || pathname);
  return path.startsWith('/hris/payroll/payroll-approval')
    || path.includes('/payroll-approval');
};

/** Paths workflow approvers may open without full payroll administration rights. */
export const isPayrollApproverAccessiblePath = (pathname: string) => {
  const path = normalizePath(pathname.split('?')[0] || pathname);
  if (path === '/hris/payroll-management' || path === '/hris/payroll-management/dashboard') return true;
  return isPayrollSalaryReviewPath(path) || isPayrollApprovalPath(path);
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

  if (isPayrollApproverAccessiblePath(path)) {
    return [
      ...PAYROLL_WORKFLOW_REVIEW_PERMISSIONS,
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
    && !isPayrollApproverAccessiblePath(path)
    && isFinancePayrollOnlyUser(permissions, options)
  ) {
    return false;
  }
  return true;
};

export const FINANCE_ONLY_PAYROLL_SECTION = 'finance-integration' as const;
export const APPROVER_REVIEW_PAYROLL_SECTIONS = new Set([
  'salary-management',
  'payroll-approval',
  FINANCE_ONLY_PAYROLL_SECTION,
]);

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
