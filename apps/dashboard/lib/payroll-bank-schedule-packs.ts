/** Shared bank-schedule staff packs (salaried / stipend). Safe for client + server. */

const compact = (value: unknown) => String(value || '').trim();
const upper = (value: unknown) => compact(value).toUpperCase();

export type BankScheduleStaffPack = 'permanent' | 'contract-lumpsum' | 'it-nysc' | 'dle-usd';

/** NGN salaried / stipend packs — never include DLE_USD. */
export const BANK_SCHEDULE_NGN_STAFF_PACKS = [
  { id: 'permanent' as const, label: 'Permanent', sheetName: 'Permanent' },
  { id: 'contract-lumpsum' as const, label: 'Contract / Lumpsum', sheetName: 'Contract Lumpsum' },
  { id: 'it-nysc' as const, label: 'IT / NYSC', sheetName: 'IT NYSC' },
];

export const BANK_SCHEDULE_USD_STAFF_PACK = {
  id: 'dle-usd' as const,
  label: 'DLE USD',
  sheetName: 'DLE USD',
};

/** All staff packs including the separate DLE USD group. */
export const BANK_SCHEDULE_STAFF_PACKS = [
  ...BANK_SCHEDULE_NGN_STAFF_PACKS,
  BANK_SCHEDULE_USD_STAFF_PACK,
];

type BankScheduleEmployeeLike = {
  employeeCode?: string | null;
  employeeId?: string | null;
  sourceEmployeeId?: string | null;
  employmentType?: string | null;
  staffCategory?: string | null;
  employeeCategory?: string | null;
  jobTitle?: string | null;
  payrollGroup?: string | null;
  payCurrency?: string | null;
  paymentRun?: string | null;
  paymentType?: string | null;
  earningProfileId?: string | null;
  earningProfile?: string | null;
};

/**
 * DLE_USD / USD package staff must never mix into NGN Permanent / Contract / IT NYSC exports.
 */
export const isDleUsdPayrollEmployee = (employee: Pick<BankScheduleEmployeeLike, 'payCurrency' | 'payrollGroup'>) => {
  const currency = upper(employee.payCurrency);
  if (currency === 'USD' || currency === 'US$') return true;
  const group = upper(employee.payrollGroup);
  return /DLE_USD|(^|[^A-Z])USD([^A-Z]|$)/.test(group);
};

/**
 * Salaried / stipend bank-schedule pack (not daily-rate company packs).
 * Order of checks: DLE USD → IT/NYSC → Contract/Lumpsum → Permanent.
 */
export const resolveBankScheduleStaffPack = (employee: BankScheduleEmployeeLike): BankScheduleStaffPack => {
  if (isDleUsdPayrollEmployee(employee)) return 'dle-usd';

  const code = upper(employee.employeeCode || employee.employeeId || employee.sourceEmployeeId);
  const text = [
    employee.employmentType,
    employee.payrollGroup,
    employee.paymentRun,
    employee.paymentType,
    employee.staffCategory,
    employee.employeeCategory,
    employee.jobTitle,
  ].map(upper).join(' ');
  const profile = upper(`${employee.earningProfileId || ''} ${employee.earningProfile || ''}`);

  if (
    /^(P?IT|IT|I|P?NYSC|NYSC|N)\d+/.test(code)
    || /\b(INDUSTRIAL TRAINING|INDUSTRIAL TRAINEE|INTERN|NYSC|NATIONAL YOUTH SERVICE)\b/.test(text)
    || /\b(NYSC|INTERN|STIPEND-NON-TAXABLE|STIPEND)\b/.test(profile)
  ) {
    return 'it-nysc';
  }

  if (
    /^(C|L)\d+/.test(code)
    || /\b(LUMPSUM|LUMP SUM|CONTRACT)\b/.test(text)
    || /\b(CONTRACT|LUMPSUM)\b/.test(profile)
  ) {
    return 'contract-lumpsum';
  }

  return 'permanent';
};

/** Display code for bank schedule: keep/show leading P for permanent staff. */
export const bankScheduleDisplayEmployeeCode = (
  employee: { employeeCode?: string | null; employeeId?: string | null },
  pack: BankScheduleStaffPack,
) => {
  const raw = compact(employee.employeeCode || employee.employeeId);
  const code = upper(raw);
  if (pack !== 'permanent') return raw;
  if (/^P\d+$/i.test(code)) return code;
  if (/^\d{2,6}$/.test(code)) return `P${code}`;
  return raw;
};
