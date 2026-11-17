/**
 * Where project labour cost rates come from.
 *
 * 1. Payroll seed — every employee's day rate from [hris].[EmployeePayrollSetup], priced the way the
 *    day-rate payroll schedule pays it (hourly = daily ÷ 8; weekday OVT ×1.5, Saturday ×1.5,
 *    Sunday ×2, public holiday ×2). An optional on-cost % loads the rate for employer costs.
 * 2. Rate sheet — Finance downloads the sheet, edits rows, and uploads it. Uploaded rows are
 *    marked MANUAL and are never overwritten by a later payroll seed.
 */

export const PAYROLL_SEED_MARKER = 'PAYROLL_SEED';
export const MANUAL_RATE_MARKER = 'MANUAL';

/** Multipliers the day-rate payroll schedule applies (dayrate-schedule-template-export.ts). */
export const PAYROLL_MULTIPLIERS = {
  weekdayOvt: 1.5,
  saturday: 1.5,
  saturdayOvt: 1.5,
  sunday: 2,
  sundayOvt: 2,
  publicHoliday: 2,
  publicHolidayOvt: 2,
} as const;

export const PAYROLL_HOURS_PER_DAY = 8;

export type RateMethod = 'hourly' | 'daily' | 'monthly' | 'lumpsum' | 'expatriate';

export type LabourRateInput = {
  employeeCode: string;
  method: RateMethod;
  amount: number;
  currency: string;
  exchangeRate: number | null;
  effectiveFrom: string;
  workingDays: number | null;
  standardHours: number;
  weekdayOvt: number | null;
  saturday: number | null;
  saturdayOvt: number | null;
  sunday: number | null;
  sundayOvt: number | null;
  publicHoliday: number | null;
  publicHolidayOvt: number | null;
  rateVersion: string;
  notes: string;
};

export type PayrollRateSource = {
  employeeCode: string;
  ratePerDay: number | null;
  currency: string | null;
};

const round4 = (value: number) => Math.round(value * 10000) / 10000;
const text = (value: unknown) => String(value ?? '').replace(/ /g, ' ').trim();

export const isManualRateNote = (notes: unknown) => text(notes).toUpperCase().startsWith(MANUAL_RATE_MARKER);
export const isPayrollSeedNote = (notes: unknown) => text(notes).toUpperCase().startsWith(PAYROLL_SEED_MARKER);

/** Payroll day rate → hourly project rate, with the payroll multipliers and an optional on-cost load. */
export const payrollSeedRate = (
  source: PayrollRateSource,
  options: { effectiveFrom: string; onCostPercent?: number; seededOn: string },
): LabourRateInput | null => {
  const daily = Number(source.ratePerDay);
  if (!Number.isFinite(daily) || daily <= 0) return null;
  const onCost = Math.max(0, Number(options.onCostPercent) || 0);
  const hourly = round4((daily / PAYROLL_HOURS_PER_DAY) * (1 + onCost / 100));
  const currency = text(source.currency).toUpperCase() || 'NGN';
  const version = `payroll-${options.seededOn}${onCost ? `-oc${onCost}` : ''}`.slice(0, 40);
  return {
    employeeCode: text(source.employeeCode).toUpperCase(),
    method: 'hourly',
    amount: hourly,
    currency,
    exchangeRate: null,
    effectiveFrom: options.effectiveFrom,
    workingDays: null,
    standardHours: PAYROLL_HOURS_PER_DAY,
    ...PAYROLL_MULTIPLIERS,
    rateVersion: version,
    notes: `${PAYROLL_SEED_MARKER} | EmployeePayrollSetup day rate ${daily} ${currency} / ${PAYROLL_HOURS_PER_DAY}h${onCost ? ` + ${onCost}% on-cost` : ''}`.slice(0, 400),
  };
};

/** True when two rates would price the same hours identically (version and notes ignored). */
export const sameRate = (left: Partial<LabourRateInput>, right: Partial<LabourRateInput>) => {
  const num = (value: unknown) => (value == null || value === '' ? null : round4(Number(value)));
  return text(left.method).toLowerCase() === text(right.method).toLowerCase()
    && num(left.amount) === num(right.amount)
    && text(left.currency).toUpperCase() === text(right.currency).toUpperCase()
    && num(left.exchangeRate) === num(right.exchangeRate)
    && num(left.workingDays) === num(right.workingDays)
    && (['weekdayOvt', 'saturday', 'saturdayOvt', 'sunday', 'sundayOvt', 'publicHoliday', 'publicHolidayOvt'] as const)
      .every((key) => num(left[key]) === num(right[key]));
};

/* ---------------------------------------------------------------- rate sheet */

export const RATE_SHEET_COLUMNS = [
  'Employee Code', 'Employee Name', 'Method', 'Amount', 'Currency', 'Exchange Rate', 'Effective From',
  'Weekday OVT x', 'Saturday x', 'Saturday OVT x', 'Sunday x', 'Sunday OVT x', 'PH x', 'PH OVT x', 'Working Days', 'Notes',
  'Current Source', 'Payroll Day Rate',
] as const;

export type RateSheetEmployee = {
  employeeCode: string;
  employeeName: string;
  payrollDayRate: number | null;
  current: (Partial<LabourRateInput> & { notes?: string; effectiveFrom?: string }) | null;
};

/** Sheet Finance edits: one row per employee, prefilled with the current rate (or the payroll basis). */
export const rateSheetRows = (employees: RateSheetEmployee[]): Array<Array<string | number | null>> => [
  [...RATE_SHEET_COLUMNS],
  ...employees.map((employee) => {
    const current = employee.current;
    const source = !current ? 'No rate' : isManualRateNote(current.notes) ? 'Manual' : isPayrollSeedNote(current.notes) ? 'Payroll' : 'Manual';
    return [
      employee.employeeCode,
      employee.employeeName,
      current?.method || '',
      current?.amount ?? null,
      current?.currency || '',
      current?.exchangeRate ?? null,
      current?.effectiveFrom || '',
      current?.weekdayOvt ?? null,
      current?.saturday ?? null,
      current?.saturdayOvt ?? null,
      current?.sunday ?? null,
      current?.sundayOvt ?? null,
      current?.publicHoliday ?? null,
      current?.publicHolidayOvt ?? null,
      current?.workingDays ?? null,
      '',
      source,
      employee.payrollDayRate,
    ];
  }),
];

const HEADER_KEYS: Record<string, keyof LabourRateInput | 'employeeName' | 'ignore'> = {
  'employee code': 'employeeCode',
  'employee name': 'employeeName',
  method: 'method',
  amount: 'amount',
  currency: 'currency',
  'exchange rate': 'exchangeRate',
  'effective from': 'effectiveFrom',
  'weekday ovt x': 'weekdayOvt',
  'saturday x': 'saturday',
  'saturday ovt x': 'saturdayOvt',
  'sunday x': 'sunday',
  'sunday ovt x': 'sundayOvt',
  'ph x': 'publicHoliday',
  'ph ovt x': 'publicHolidayOvt',
  'working days': 'workingDays',
  notes: 'notes',
  'current source': 'ignore',
  'payroll day rate': 'ignore',
};

const METHODS = new Set<RateMethod>(['hourly', 'daily', 'monthly', 'lumpsum', 'expatriate']);

/** Accepts 2026-10-01, 01/10/2026 (day first), or an Excel serial date. */
export const parseSheetDate = (value: unknown): string => {
  const raw = text(value);
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(raw);
  if (dmy) {
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    const iso = `${year}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    return Number.isNaN(new Date(`${iso}T00:00:00Z`).getTime()) ? '' : iso;
  }
  const serial = Number(raw);
  if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
    return new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000).toISOString().slice(0, 10);
  }
  return '';
};

const optionalNumber = (value: unknown, label: string, errors: string[]) => {
  const raw = text(value).replace(/,/g, '');
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    errors.push(`${label} "${text(value)}" is not a valid number`);
    return null;
  }
  return parsed;
};

export type RateSheetParseResult = {
  rates: LabourRateInput[];
  errors: Array<{ row: number; employeeCode: string; message: string }>;
  blankRows: number;
};

/**
 * Reads an uploaded rate sheet. Rows with no Amount are skipped (left unchanged). Blank multipliers
 * default to the payroll multipliers so an hourly or daily rate still prices OVT and weekend work.
 */
export const parseRateSheet = (
  rows: string[][],
  options: { defaultEffectiveFrom: string; importedOn: string },
): RateSheetParseResult => {
  const headerIndex = rows.findIndex((row) => row.some((cell) => text(cell).toLowerCase() === 'employee code'));
  if (headerIndex < 0) throw new Error('The rate sheet needs an "Employee Code" header row. Download the rate sheet to get the expected layout.');
  const columns = rows[headerIndex].map((cell) => HEADER_KEYS[text(cell).toLowerCase()] || null);
  if (!columns.includes('amount')) throw new Error('The rate sheet needs an "Amount" column.');

  const result: RateSheetParseResult = { rates: [], errors: [], blankRows: 0 };
  const seen = new Map<string, number>();
  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index] || [];
    const cell: Partial<Record<string, string>> = {};
    columns.forEach((key, column) => { if (key && key !== 'ignore') cell[key] = text(row[column]); });
    const employeeCode = text(cell.employeeCode).toUpperCase();
    const sheetRow = index + 1;
    if (!employeeCode && !text(cell.amount)) continue;
    if (!text(cell.amount)) { result.blankRows += 1; continue; }
    const errors: string[] = [];
    if (!employeeCode) errors.push('Employee Code is empty');
    const method = (text(cell.method).toLowerCase() || 'hourly') as RateMethod;
    if (!METHODS.has(method)) errors.push(`Method "${cell.method}" must be hourly, daily, monthly, lumpsum or expatriate`);
    const amount = optionalNumber(cell.amount, 'Amount', errors);
    const currency = (text(cell.currency) || 'NGN').toUpperCase();
    const exchangeRate = optionalNumber(cell.exchangeRate, 'Exchange Rate', errors);
    if (currency !== 'NGN' && !exchangeRate) errors.push(`Exchange Rate is required for ${currency}`);
    const effectiveFrom = cell.effectiveFrom ? parseSheetDate(cell.effectiveFrom) : options.defaultEffectiveFrom;
    if (!effectiveFrom) errors.push(`Effective From "${cell.effectiveFrom}" is not a date (use YYYY-MM-DD or DD/MM/YYYY)`);
    const workingDays = optionalNumber(cell.workingDays, 'Working Days', errors);
    if (method === 'monthly' && !workingDays) errors.push('Working Days is required for a monthly rate');
    const multiplier = (key: keyof typeof PAYROLL_MULTIPLIERS, label: string) => {
      const value = optionalNumber(cell[key], label, errors);
      return value ?? PAYROLL_MULTIPLIERS[key];
    };
    const rate: LabourRateInput = {
      employeeCode,
      method,
      amount: amount ?? 0,
      currency,
      exchangeRate: currency === 'NGN' ? null : exchangeRate,
      effectiveFrom,
      workingDays,
      standardHours: PAYROLL_HOURS_PER_DAY,
      weekdayOvt: multiplier('weekdayOvt', 'Weekday OVT x'),
      saturday: multiplier('saturday', 'Saturday x'),
      saturdayOvt: multiplier('saturdayOvt', 'Saturday OVT x'),
      sunday: multiplier('sunday', 'Sunday x'),
      sundayOvt: multiplier('sundayOvt', 'Sunday OVT x'),
      publicHoliday: multiplier('publicHoliday', 'PH x'),
      publicHolidayOvt: multiplier('publicHolidayOvt', 'PH OVT x'),
      rateVersion: `manual-${options.importedOn}`.slice(0, 40),
      notes: `${MANUAL_RATE_MARKER} | rate sheet${cell.notes ? ` | ${cell.notes}` : ''}`.slice(0, 400),
    };
    const duplicateKey = `${employeeCode}|${effectiveFrom}`;
    if (seen.has(duplicateKey)) errors.push(`Duplicate of row ${seen.get(duplicateKey)} for the same effective date`);
    seen.set(duplicateKey, sheetRow);
    if (errors.length) {
      result.errors.push({ row: sheetRow, employeeCode, message: errors.join('; ') });
      continue;
    }
    result.rates.push(rate);
  }
  return result;
};
