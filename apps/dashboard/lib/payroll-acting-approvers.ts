/**
 * Named approvers for payroll stages.
 * Used when a person is the stage owner by job title / designation
 * without (or in addition to) the formal auth role title.
 */
export const PAYROLL_ACTING_FINANCE_MANAGER_CODES = [
  'P0429', // RAPHEAL OLAITAN IYANDA — acting Finance Manager
] as const;

export const PAYROLL_NAMED_CFO_CODES = [
  'P0458', // Mrs ABIODUN OLUWAFUNMI MAMORA — Chief Financial Officer
] as const;

export const PAYROLL_NAMED_MD_CEO_CODES = [
  'P0413', // Mr CHRIS IJELI — Managing Director
] as const;

const candidateCodes = (employeeCode?: string | null, username?: string | null) =>
  [employeeCode, username]
    .map((value) => String(value || '').trim().toUpperCase())
    .filter(Boolean);

const matchesNamedCodes = (
  codes: readonly string[],
  employeeCode?: string | null,
  username?: string | null,
) => {
  const candidates = candidateCodes(employeeCode, username);
  if (!candidates.length) return false;
  return codes.some((code) => candidates.includes(code));
};

export const isPayrollActingFinanceManager = (employeeCode?: string | null, username?: string | null) =>
  matchesNamedCodes(PAYROLL_ACTING_FINANCE_MANAGER_CODES, employeeCode, username);

export const isPayrollNamedCfo = (employeeCode?: string | null, username?: string | null) =>
  matchesNamedCodes(PAYROLL_NAMED_CFO_CODES, employeeCode, username);

export const isPayrollNamedMdCeo = (employeeCode?: string | null, username?: string | null) =>
  matchesNamedCodes(PAYROLL_NAMED_MD_CEO_CODES, employeeCode, username);
