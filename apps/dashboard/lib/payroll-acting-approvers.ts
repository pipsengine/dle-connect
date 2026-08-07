/**
 * Named acting approvers for payroll stages.
 * Used when a person is covering a stage without (or in addition to) the formal role title.
 */
export const PAYROLL_ACTING_FINANCE_MANAGER_CODES = [
  'P0429', // RAPHEAL OLAITAN IYANDA — acting Finance Manager
] as const;

export const isPayrollActingFinanceManager = (employeeCode?: string | null, username?: string | null) => {
  const candidates = [employeeCode, username]
    .map((value) => String(value || '').trim().toUpperCase())
    .filter(Boolean);
  if (!candidates.length) return false;
  return PAYROLL_ACTING_FINANCE_MANAGER_CODES.some((code) => candidates.includes(code));
};
