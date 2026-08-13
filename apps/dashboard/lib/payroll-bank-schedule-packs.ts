/** Shared bank-schedule staff packs (salaried / stipend). Safe for client + server. */

const compact = (value: unknown) => String(value || '').trim();
const upper = (value: unknown) => compact(value).toUpperCase();

export type BankScheduleStaffPack = 'permanent' | 'contract-lumpsum' | 'it-nysc';

export const BANK_SCHEDULE_STAFF_PACKS = [
  { id: 'permanent' as const, label: 'Permanent', sheetName: 'Permanent' },
  { id: 'contract-lumpsum' as const, label: 'Contract / Lumpsum', sheetName: 'Contract Lumpsum' },
  { id: 'it-nysc' as const, label: 'IT / NYSC', sheetName: 'IT NYSC' },
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
  paymentRun?: string | null;
  paymentType?: string | null;
  earningProfileId?: string | null;
  earningProfile?: string | null;
};

/**
 * Salaried / stipend bank-schedule pack (not daily-rate company packs).
 * Order of checks: IT/NYSC → Contract/Lumpsum → Permanent.
 */
export const resolveBankScheduleStaffPack = (employee: BankScheduleEmployeeLike): BankScheduleStaffPack => {
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
