/** Shared bank-schedule staff packs (salaried / stipend). Safe for client + server. */

const compact = (value: unknown) => String(value || '').trim();
const upper = (value: unknown) => compact(value).toUpperCase();

export type BankScheduleStaffPack = 'permanent' | 'contract-lumpsum' | 'it-nysc' | 'dle-usd';

/**
 * Sub-sections inside the DLE USD pack (same tab / sheet, clearly labelled).
 * Matches August salary-schedule Summary / USD REPORT / MD / Expatriate tabs:
 * Permanent (GM Ops, Mgr SP & CFO) · Contract (MD) · Expatriate (Nayak).
 */
export type DleUsdSectionId = 'permanent' | 'contract-md' | 'expatriate';

export const DLE_USD_SECTIONS = [
  {
    id: 'permanent' as const,
    label: 'Permanent',
    summaryLabel: 'GM Ops, Mgr SP & CFO',
    detail: 'USD senior management permanent staff',
  },
  {
    id: 'contract-md' as const,
    label: 'Contract — MD',
    summaryLabel: 'MD',
    detail: 'Managing Director USD contract package',
  },
  {
    id: 'expatriate' as const,
    label: 'Expatriate — Nayak',
    summaryLabel: 'Nayak',
    detail: 'Expatriate USD package',
  },
] as const;

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

export type BankScheduleEmployeeLike = {
  employeeCode?: string | null;
  employeeId?: string | null;
  sourceEmployeeId?: string | null;
  fullName?: string | null;
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

const roleBlob = (employee: Pick<BankScheduleEmployeeLike, 'jobTitle' | 'fullName' | 'employmentType' | 'payrollGroup'>) =>
  `${employee.jobTitle || ''} ${employee.fullName || ''} ${employee.employmentType || ''} ${employee.payrollGroup || ''}`;

/** Managing Director / MD-CEO (Chris Ijeli) — DLE USD Contract section. */
export const isDleUsdMdEmployee = (
  employee: Pick<BankScheduleEmployeeLike, 'jobTitle' | 'fullName' | 'employeeCode' | 'employeeId' | 'sourceEmployeeId'>,
) => {
  const code = upper(employee.employeeCode || employee.employeeId || employee.sourceEmployeeId).replace(/[^A-Z0-9]/g, '');
  if (/^(P?0413|00MD01|MD01|MD)$/.test(code) || /MD01/.test(code)) return true;
  const blob = upper(roleBlob(employee));
  if (/\bIJELI\b/.test(blob)) return true;
  return /\bMANAGING DIRECTOR\b|\bMD\s*\/\s*CEO\b|\bCHIEF EXECUTIVE\b/.test(blob);
};

/** Expatriate Nayak — DLE USD Expatriate section. */
export const isDleUsdExpatriateEmployee = (
  employee: Pick<BankScheduleEmployeeLike, 'fullName' | 'jobTitle' | 'employeeCode' | 'employeeId' | 'sourceEmployeeId'>,
) => {
  const code = upper(employee.employeeCode || employee.employeeId || employee.sourceEmployeeId).replace(/[^A-Z0-9]/g, '');
  if (/^(P?EX001|EX001)$/.test(code)) return true;
  return /NAYAK|SUSHIL/.test(upper(`${employee.fullName || ''} ${employee.jobTitle || ''}`));
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

/** True when the Pay Setup / filter selection is the DLE USD group. */
export const isDleUsdPayrollGroupFilter = (group?: string | null) => {
  const value = upper(group);
  return value === 'DLE_USD' || value === 'DLE USD' || value === 'USD';
};

/**
 * Classify a DLE USD employee into Permanent / Contract (MD) / Expatriate (Nayak).
 * Order: MD → Nayak → Permanent (remaining USD senior staff).
 */
export const resolveDleUsdSection = (employee: BankScheduleEmployeeLike): DleUsdSectionId => {
  if (isDleUsdMdEmployee(employee)) return 'contract-md';
  if (isDleUsdExpatriateEmployee(employee)) return 'expatriate';
  return 'permanent';
};

export const dleUsdSectionMeta = (id: DleUsdSectionId) =>
  DLE_USD_SECTIONS.find((section) => section.id === id) || DLE_USD_SECTIONS[0];

/** Group DLE USD records into ordered sections (empty sections omitted unless `includeEmpty`). */
export const groupDleUsdRecords = <T extends BankScheduleEmployeeLike>(
  records: T[] | null | undefined,
  options?: { includeEmpty?: boolean },
) => {
  const usd = (records || []).filter((record) => isDleUsdPayrollEmployee(record));
  return DLE_USD_SECTIONS.map((section) => {
    const rows = usd.filter((record) => resolveDleUsdSection(record) === section.id);
    return { ...section, rows };
  }).filter((section) => options?.includeEmpty || section.rows.length > 0);
};

/** NGN salary KPIs and headcount — same population as official Excel `currency=ngn`. */
export const ngnPayrollKpiRecords = <T extends Pick<BankScheduleEmployeeLike, 'payCurrency' | 'payrollGroup'>>(
  records: T[] | null | undefined,
) => (records || []).filter((record) => !isDleUsdPayrollEmployee(record));

/** Filter register / pack records for a schedule currency slice. */
export const filterPayrollRecordsByCurrencySlice = <T extends Pick<BankScheduleEmployeeLike, 'payCurrency' | 'payrollGroup'>>(
  records: T[] | null | undefined,
  slice?: 'all' | 'ngn' | 'usd' | null,
) => {
  const list = records || [];
  if (slice === 'usd') return list.filter((record) => isDleUsdPayrollEmployee(record));
  if (slice === 'ngn') return list.filter((record) => !isDleUsdPayrollEmployee(record));
  return list;
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

/** Register / employees table sections for Process Payroll & Payroll Approval. */
export type PayrollRegisterSectionId =
  | 'ngn-permanent'
  | 'ngn-contract-lumpsum'
  | 'ngn-it-nysc'
  | 'dle-usd-permanent'
  | 'dle-usd-contract-md'
  | 'dle-usd-expatriate';

export const PAYROLL_REGISTER_SECTIONS = [
  { id: 'ngn-permanent' as const, label: 'Permanent', detail: 'NGN permanent staff', chip: 'Permanent' },
  { id: 'ngn-contract-lumpsum' as const, label: 'Contract / Lumpsum', detail: 'NGN contract and lumpsum', chip: 'Contract' },
  { id: 'ngn-it-nysc' as const, label: 'IT / NYSC', detail: 'Industrial trainees and NYSC', chip: 'IT / NYSC' },
  { id: 'dle-usd-permanent' as const, label: 'DLE USD — Permanent', detail: 'USD senior management (GM Ops, Mgr SP & CFO)', chip: 'DLE USD' },
  { id: 'dle-usd-contract-md' as const, label: 'DLE USD — Contract (MD)', detail: 'Managing Director USD contract package', chip: 'DLE USD' },
  { id: 'dle-usd-expatriate' as const, label: 'DLE USD — Expatriate (Nayak)', detail: 'Expatriate USD package', chip: 'DLE USD' },
] as const;

export const resolvePayrollRegisterSection = (employee: BankScheduleEmployeeLike): PayrollRegisterSectionId => {
  if (isDleUsdPayrollEmployee(employee)) {
    const usd = resolveDleUsdSection(employee);
    if (usd === 'contract-md') return 'dle-usd-contract-md';
    if (usd === 'expatriate') return 'dle-usd-expatriate';
    return 'dle-usd-permanent';
  }
  const pack = resolveBankScheduleStaffPack(employee);
  if (pack === 'contract-lumpsum') return 'ngn-contract-lumpsum';
  if (pack === 'it-nysc') return 'ngn-it-nysc';
  return 'ngn-permanent';
};

export const groupPayrollRegisterSections = <T extends BankScheduleEmployeeLike>(
  records: T[] | null | undefined,
  options?: { includeEmpty?: boolean; onlyDleUsd?: boolean },
) => {
  const list = records || [];
  const defs = options?.onlyDleUsd
    ? PAYROLL_REGISTER_SECTIONS.filter((section) => section.id.startsWith('dle-usd-'))
    : PAYROLL_REGISTER_SECTIONS;
  return defs
    .map((section) => ({
      ...section,
      rows: list.filter((record) => resolvePayrollRegisterSection(record) === section.id),
    }))
    .filter((section) => options?.includeEmpty || section.rows.length > 0);
};
