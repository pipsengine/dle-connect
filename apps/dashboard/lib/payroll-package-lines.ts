import { isHrisConfiguredPayrollLine, type SagePayrollLineItem } from '@/lib/sage-payroll-line-parser';

export type PayrollLineFrequency = 'weekly' | 'monthly' | 'one-off';

export type FlexiblePayrollLineDraft = {
  id: string;
  code: string;
  name: string;
  amount: string;
  taxable: boolean;
  frequency: PayrollLineFrequency;
  /** YYYY-MM. Required for this-period-only lines; leftover one-offs have none and must not pay. */
  payrollPeriod?: string;
};

export type StoredPayrollPackageLine = SagePayrollLineItem & {
  runFrequency?: PayrollLineFrequency;
  sourceAmount?: number;
  includeInMonthlyPayroll?: boolean;
  payrollPeriod?: string;
};

export const WEEKS_PER_MONTH = 52 / 12;

export const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

export const payrollLineCodeFromName = (name: string) =>
  String(name || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 24) || 'EARNING';

const compactPayrollCode = (value?: string | null) =>
  String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

export const normalizePackagePayrollPeriod = (value?: string | null) => {
  const match = /^(\d{4})-(\d{2})/.exec(String(value || '').trim());
  return match ? `${match[1]}-${match[2]}` : '';
};

/** Client-safe YYYY-MM. Do not import payroll-periods / payroll-period-store from UI modules. */
export const clientSafePayrollPeriod = (value?: string | null) => {
  const stamped = normalizePackagePayrollPeriod(value);
  if (stamped) return stamped;
  const env = normalizePackagePayrollPeriod(process.env.HRIS_ACTIVE_PAYROLL_PERIOD);
  if (env) return env;
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
};

/** Timesheet / one-off codes that must never sit on the standing monthly package. */
const PERIOD_ONLY_PACKAGE_CODES = new Set([
  'OVERTIME',
  'OVT',
  'OT',
  'WEEKDAYOVT',
  'WKDAYOVT',
  'JRWKDAYOVT',
  'SATURDAYOVT',
  'SUNDAYOVT',
  'PUBHOL',
  'PUBLICOVT',
  'SATEARN',
  'SUNDAYEARN',
  'PARSATOVT',
  'PERSUNOVT',
  'ARREARS',
  'STOCKCOUNT',
  'NIGHTALL',
  'NIGHTALLOW',
  'MISC',
  'OTHERPAY',
  'LEAVEALLOW',
  'REFUND',
  'GRATUITY',
  'LONGSERVICE',
  'SPECIALALLOW',
  'WEEKENDALLOW',
  'JCWEEKDAY',
  'JCWEEKDAYNT',
]);

/**
 * Overtime, arrears, stock count, night, misc, and other this-month-only items.
 * Standing monthly SITE / meal / lumpsum / housing stay on the package.
 */
export const isPeriodOnlyPackageEarningLine = (line: {
  code?: string;
  name?: string;
  frequency?: PayrollLineFrequency;
  runFrequency?: PayrollLineFrequency;
  includeInMonthlyPayroll?: boolean;
}) => {
  const frequency = line.runFrequency || line.frequency || 'monthly';
  if (frequency === 'one-off' || line.includeInMonthlyPayroll === false) return true;
  const code = compactPayrollCode(line.code);
  if (PERIOD_ONLY_PACKAGE_CODES.has(code)) return true;
  const name = String(line.name || '').trim().toUpperCase();
  return /\b(OVERTIME|ARREARS|STOCK\s*COUNT|NIGHT\s*ALLOW|OTHER\s*PAY|LEAVE\s*ALLOWANCE|WEEKDAY\s*OVT|SATURDAY\s*OVERTIME|SUNDAY\s*OVERTIME|PUBLIC\s*HOLIDAY|GRATUITY|LONG\s*SERVICE)\b/.test(name);
};

/** Standing package pays every month. Period-only pays only when stamped to the run period. */
export const packageLinePaysInPeriod = (
  line: {
    code?: string;
    name?: string;
    frequency?: PayrollLineFrequency;
    runFrequency?: PayrollLineFrequency;
    includeInMonthlyPayroll?: boolean;
    payrollPeriod?: string | null;
  },
  period?: string | null,
) => {
  if (!isPeriodOnlyPackageEarningLine(line)) return true;
  const stamped = normalizePackagePayrollPeriod(line.payrollPeriod);
  const current = normalizePackagePayrollPeriod(period);
  return Boolean(stamped && current && stamped === current);
};

export const splitDraftEarningLinesByScope = (
  lines: FlexiblePayrollLineDraft[] | null | undefined,
  period?: string | null,
) => {
  const standing: FlexiblePayrollLineDraft[] = [];
  const thisPeriod: FlexiblePayrollLineDraft[] = [];
  const leftover: FlexiblePayrollLineDraft[] = [];
  const current = normalizePackagePayrollPeriod(period);
  for (const line of lines || []) {
    if (!isPeriodOnlyPackageEarningLine(line)) {
      standing.push(line);
      continue;
    }
    if (current && normalizePackagePayrollPeriod(line.payrollPeriod) === current) thisPeriod.push(line);
    else leftover.push(line);
  }
  return { standing, thisPeriod, leftover };
};

export const stampPeriodOnlyDraftLine = (
  line: FlexiblePayrollLineDraft,
  period?: string | null,
): FlexiblePayrollLineDraft => {
  if (!isPeriodOnlyPackageEarningLine(line)) {
    return {
      ...line,
      frequency: line.frequency === 'weekly' ? 'weekly' : 'monthly',
      payrollPeriod: undefined,
    };
  }
  const payrollPeriod = normalizePackagePayrollPeriod(period) || normalizePackagePayrollPeriod(line.payrollPeriod);
  return { ...line, frequency: 'one-off', payrollPeriod: payrollPeriod || undefined };
};

export const includeLineInMonthlyPayroll = (frequency: PayrollLineFrequency) => frequency !== 'one-off';

/** Convert a line amount at its native frequency into a monthly payroll equivalent. */
export const monthlyPayrollAmountFromLine = (amount: number, frequency: PayrollLineFrequency) => {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (frequency === 'weekly') return roundMoney(amount * WEEKS_PER_MONTH);
  if (frequency === 'monthly') return roundMoney(amount);
  return 0;
};

export const payrollLineMonthlyAmount = (line: Pick<StoredPayrollPackageLine, 'amount' | 'sourceAmount' | 'runFrequency' | 'includeInMonthlyPayroll'>) => {
  const frequency = line.runFrequency || 'monthly';
  if (line.includeInMonthlyPayroll === false || frequency === 'one-off') return 0;
  const sourceAmount = line.sourceAmount ?? Number(line.amount || 0);
  if (frequency === 'weekly') return monthlyPayrollAmountFromLine(sourceAmount, 'weekly');
  return roundMoney(Number(line.amount || sourceAmount || 0));
};

export const draftPayrollLineToStored = (
  line: FlexiblePayrollLineDraft,
  taxableDefault = true,
): StoredPayrollPackageLine | null => {
  const sourceAmount = roundMoney(Number(line.amount));
  if (sourceAmount <= 0) return null;
  const code = String(line.code || '').trim() || payrollLineCodeFromName(line.name);
  const name = String(line.name || '').trim() || code;
  const frequency = isPeriodOnlyPackageEarningLine(line) ? 'one-off' : (line.frequency || 'monthly');
  const taxable = typeof line.taxable === 'boolean' ? line.taxable : taxableDefault;
  const includeInMonthly = includeLineInMonthlyPayroll(frequency);
  const monthlyAmount = monthlyPayrollAmountFromLine(sourceAmount, frequency);
  const amount = frequency === 'one-off' ? sourceAmount : monthlyAmount;
  const payrollPeriod = frequency === 'one-off' ? normalizePackagePayrollPeriod(line.payrollPeriod) : '';
  return {
    code,
    name,
    amount,
    sourceAmount,
    runFrequency: frequency,
    includeInMonthlyPayroll: includeInMonthly,
    taxableAmount: taxable ? amount : 0,
    ytdTotal: 0,
    ...(payrollPeriod ? { payrollPeriod } : {}),
  };
};

export const storedLinesToDraft = (lines: StoredPayrollPackageLine[]): FlexiblePayrollLineDraft[] =>
  lines.map((line, index) => {
    const payrollPeriod = normalizePackagePayrollPeriod(line.payrollPeriod);
    return {
      id: `line-${index}-${line.code}`,
      code: line.code,
      name: line.name,
      amount: String(line.sourceAmount ?? line.amount ?? ''),
      taxable: Number(line.taxableAmount ?? line.amount ?? 0) > 0,
      frequency: line.runFrequency || (isPeriodOnlyPackageEarningLine(line) ? 'one-off' : 'monthly'),
      ...(payrollPeriod ? { payrollPeriod } : {}),
    };
  });

export const sumMonthlyPackageGross = (lines: StoredPayrollPackageLine[]) =>
  roundMoney(lines.reduce((sum, line) => sum + payrollLineMonthlyAmount(line), 0));

export const STANDING_EARNING_LINE_PRESETS: Array<Omit<FlexiblePayrollLineDraft, 'id' | 'amount'>> = [
  { code: 'BASIC', name: 'Basic Salary', taxable: true, frequency: 'monthly' },
  { code: 'HOUSING', name: 'Housing Allowance', taxable: true, frequency: 'monthly' },
  { code: 'OUTSTATION', name: 'Outstation Allowance', taxable: true, frequency: 'monthly' },
  { code: 'TRANSPORT_WK', name: 'Weekly Transport Claim', taxable: true, frequency: 'weekly' },
  { code: 'MEAL', name: 'Meal Allowance', taxable: true, frequency: 'monthly' },
  { code: 'TCMMEAL', name: 'TCM Meal', taxable: true, frequency: 'monthly' },
  { code: 'TCMTRANS', name: 'TCM Transport', taxable: true, frequency: 'monthly' },
  { code: 'SITE', name: 'Site Allowance', taxable: true, frequency: 'monthly' },
  { code: 'UTILITY', name: 'Utility Allowance', taxable: true, frequency: 'monthly' },
];

export const PERIOD_EARNING_LINE_PRESETS: Array<Omit<FlexiblePayrollLineDraft, 'id' | 'amount'>> = [
  { code: 'OVERTIME', name: 'Overtime Pay', taxable: true, frequency: 'one-off' },
  { code: 'WEEKDAYOVT', name: 'Weekday Overtime', taxable: true, frequency: 'one-off' },
  { code: 'ARREARS', name: 'Arrears', taxable: true, frequency: 'one-off' },
  { code: 'STOCKCOUNT', name: 'Stock Count', taxable: true, frequency: 'one-off' },
  { code: 'NIGHTALL', name: 'Night Allowance', taxable: true, frequency: 'one-off' },
  { code: 'MISC', name: 'Other Pay', taxable: true, frequency: 'one-off' },
];

/** Standing monthly/weekly package presets. Overtime belongs on this-period lines. */
export const EARNING_LINE_PRESETS = STANDING_EARNING_LINE_PRESETS;

export const DEDUCTION_LINE_PRESETS: Array<Omit<FlexiblePayrollLineDraft, 'id' | 'amount'>> = [
  { code: 'LOAN', name: 'Loan Recovery', taxable: false, frequency: 'monthly' },
  { code: 'COOP', name: 'Cooperative Deduction', taxable: false, frequency: 'monthly' },
  { code: 'UNION', name: 'Union Dues', taxable: false, frequency: 'monthly' },
  { code: 'OTHER_DED', name: 'Other Deduction', taxable: false, frequency: 'monthly' },
];

export const newDraftPayrollLineId = () => `pl-${Math.random().toString(16).slice(2, 10)}`;

export const buildStoredPayrollLinesFromDrafts = (
  lines: FlexiblePayrollLineDraft[],
  taxableDefault = true,
): StoredPayrollPackageLine[] =>
  lines
    .map((line) => draftPayrollLineToStored(line, taxableDefault))
    .filter((line): line is StoredPayrollPackageLine => line !== null);

export const hrisConfiguredPayrollLines = (lines: SagePayrollLineItem[] | null | undefined) =>
  (lines || []).filter(isHrisConfiguredPayrollLine);

/** Structural base lines saved from Edit Profile — not legacy imported payslip snapshots. */
export const isStructuralPayrollPackageCode = (code: string) =>
  /^(LUMPSUMTAX|BASIC1_LUMPSUM|STIPEND|BASIC|JNR_|SNR_|MGT_|SNM_|EXP_)/i.test(String(code || '').trim());

const inferredFrequencyForLegacyLine = (line: SagePayrollLineItem): PayrollLineFrequency => {
  if (isPeriodOnlyPackageEarningLine(line)) return 'one-off';
  const code = compactPayrollCode(line.code);
  if (/^TCM(TRNSPT|TRANS|TRANSPORT|TRANSP)$/.test(code)) return 'monthly';
  if (/^(TRANSPORTWK|TRANSPORT_WK)$/.test(code) || (code === 'TRANSPORT' && /WEEKLY/i.test(String(line.name || '')))) return 'weekly';
  if (code === 'TRANSPORT') return 'monthly';
  if (/WEEKLY/.test(code)) return 'weekly';
  return 'monthly';
};

export const promoteLegacySupplementLine = (line: SagePayrollLineItem): StoredPayrollPackageLine => {
  const frequency = inferredFrequencyForLegacyLine(line);
  const sourceAmount = roundMoney(Number(line.sourceAmount ?? line.amount ?? 0));
  return {
    ...line,
    sourceAmount,
    runFrequency: frequency,
    includeInMonthlyPayroll: frequency !== 'one-off',
    amount: frequency === 'one-off' ? sourceAmount : roundMoney(Number(line.amount || sourceAmount)),
  };
};

export const isLegacySupplementLine = (line: SagePayrollLineItem) =>
  !isHrisConfiguredPayrollLine(line)
  && !isStructuralPayrollPackageCode(line.code)
  && Number(line.amount || 0) !== 0;

/** Sage leftovers that are actually standing allowances (transport, meal, site) — never OT/arrears. */
export const isPromotableStandingLegacySupplement = (line: SagePayrollLineItem) =>
  isLegacySupplementLine(line) && !isPeriodOnlyPackageEarningLine(line);

/** HRIS-configured standing lines plus this-period stamped lines, and standing Sage leftovers. */
export const effectiveHrisPayrollLines = (lines: SagePayrollLineItem[] | null | undefined): StoredPayrollPackageLine[] => {
  const all = lines || [];
  const configured = (hrisConfiguredPayrollLines(all) as StoredPayrollPackageLine[])
    .filter((line) => !isPeriodOnlyPackageEarningLine(line) || Boolean(normalizePackagePayrollPeriod(line.payrollPeriod)));
  const configuredCodes = new Set(configured.map((line) => String(line.code || '').toUpperCase()));
  const promoted = all
    .filter(isPromotableStandingLegacySupplement)
    .filter((line) => !configuredCodes.has(String(line.code || '').toUpperCase()))
    .map(promoteLegacySupplementLine);
  return [...configured, ...promoted];
};

/** Previous-month one-offs still sitting on the package JSON — must not pay. */
export const leftoverStoredPeriodOnlyLines = <T extends {
  code?: string;
  name?: string;
  runFrequency?: PayrollLineFrequency;
  includeInMonthlyPayroll?: boolean;
  payrollPeriod?: string | null;
}>(lines: T[] | null | undefined, period?: string | null) =>
  (lines || []).filter((line) => isPeriodOnlyPackageEarningLine(line) && !packageLinePaysInPeriod(line, period));

const standingPackageCodeKey = (code?: string | null) => {
  const compact = compactPayrollCode(code);
  if (/^TCM(TRNSPT|TRANS|TRANSPORT|TRANSP)$/.test(compact)) return 'TCMTRANS';
  if (compact === 'MEAL' || compact === 'TCMMEAL') return 'TCMMEAL';
  return compact;
};

/** One plain meal line. A TCMMEAL capture replaces a leftover MEAL row instead of stacking. */
const collapseStandingPackageLines = (lines: StoredPayrollPackageLine[]) => {
  const next: StoredPayrollPackageLine[] = [];
  let meal: StoredPayrollPackageLine | null = null;
  for (const line of lines) {
    if (standingPackageCodeKey(line.code) !== 'TCMMEAL') {
      next.push(line);
      continue;
    }
    if (!meal) {
      meal = line;
      continue;
    }
    const mealCode = compactPayrollCode(meal.code);
    const lineCode = compactPayrollCode(line.code);
    if (lineCode === 'TCMMEAL' && mealCode !== 'TCMMEAL') meal = line;
    else if (lineCode === mealCode && Number(line.amount || 0) > Number(meal.amount || 0)) meal = line;
  }
  return meal ? [...next, meal] : next;
};

/** Keep HRIS TCM / standing supplements when an Excel salary schedule is written back to the package. */
export const keepUnscheduledStandingPackageLines = (
  scheduleLines: StoredPayrollPackageLine[],
  existing: SagePayrollLineItem[] | null | undefined,
): StoredPayrollPackageLine[] => {
  const next = [...scheduleLines];
  const codes = new Set(next.map((line) => standingPackageCodeKey(line.code)).filter(Boolean));
  for (const line of existing || []) {
    const key = standingPackageCodeKey(line.code);
    if (!key || codes.has(key)) continue;
    if (isPeriodOnlyPackageEarningLine(line)) continue;
    const amount = roundMoney(Number(line.sourceAmount ?? line.amount ?? 0));
    if (!(amount > 0)) continue;
    next.push({
      code: String(line.code || '').trim(),
      name: String(line.name || line.code || '').trim(),
      amount: roundMoney(Number(line.amount || amount)),
      sourceAmount: amount,
      runFrequency: line.runFrequency || 'monthly',
      includeInMonthlyPayroll: line.includeInMonthlyPayroll ?? true,
      taxableAmount: line.taxableAmount,
      ytdTotal: line.ytdTotal,
      payrollPeriod: line.payrollPeriod,
    });
    codes.add(key);
  }
  return next;
};

/** Keep standing lines plus one-offs stamped to this payroll period; drop leftover variable pay. */
export const storedPackageLinesForPayrollSave = (
  lines: StoredPayrollPackageLine[],
  period?: string | null,
): StoredPayrollPackageLine[] => {
  const current = normalizePackagePayrollPeriod(period);
  return lines.filter((line) => !isPeriodOnlyPackageEarningLine(line) || packageLinePaysInPeriod(line, current));
};

export const hasHrisPayrollSupplements = (lines: SagePayrollLineItem[] | null | undefined) =>
  effectiveHrisPayrollLines(lines).some((line) => !isStructuralPayrollPackageCode(line.code));

export const hasFullHrisPackageSetup = (
  employee: { sagePayrollEarnings?: SagePayrollLineItem[] | null },
  profileId?: string,
) => {
  if (profileId === 'stipend-non-taxable') return false;
  const hrisLines = hrisConfiguredPayrollLines(employee.sagePayrollEarnings);
  return hrisLines.some((line) => isStructuralPayrollPackageCode(line.code));
};

export const hasLegacyStructuralPackageLines = (
  employee: { sagePayrollEarnings?: SagePayrollLineItem[] | null },
) =>
  (employee.sagePayrollEarnings || []).some(
    (line) => isStructuralPayrollPackageCode(line.code) && !isHrisConfiguredPayrollLine(line),
  );

/**
 * Merge editor/HRIS lines onto existing DB lines without wiping legacy structural package lines.
 * Incoming codes replace existing codes; HRIS supplements not re-submitted are removed;
 * legacy structural snapshot lines are kept unless the editor supplies a full structural package.
 */
export const mergePayrollEarningLinesForSave = (
  existing: SagePayrollLineItem[] | null | undefined,
  incoming: StoredPayrollPackageLine[],
): StoredPayrollPackageLine[] => {
  const next = collapseStandingPackageLines([...incoming]);
  const incomingCodes = new Set(next.map((line) => standingPackageCodeKey(line.code)).filter(Boolean));
  const editorHasStructural = next.some((line) => isStructuralPayrollPackageCode(line.code));
  for (const line of existing || []) {
    const code = standingPackageCodeKey(line.code);
    if (!code || incomingCodes.has(code)) continue;
    if (isPeriodOnlyPackageEarningLine(line)) continue;
    if (isHrisConfiguredPayrollLine(line)) {
      // Drop prior HRIS supplements/package lines not present in this save (editor is authority for HRIS lines).
      continue;
    }
    if (isStructuralPayrollPackageCode(line.code) && editorHasStructural) continue;
    next.push({
      code: line.code,
      name: line.name,
      amount: Number(line.amount || 0),
      taxableAmount: line.taxableAmount,
      ytdTotal: line.ytdTotal,
    });
  }
  return next;
};
