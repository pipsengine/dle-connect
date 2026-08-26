import { isHrisConfiguredPayrollLine, type SagePayrollLineItem } from '@/lib/sage-payroll-line-parser';

export type PayrollLineFrequency = 'weekly' | 'monthly' | 'one-off';

export type FlexiblePayrollLineDraft = {
  id: string;
  code: string;
  name: string;
  amount: string;
  taxable: boolean;
  frequency: PayrollLineFrequency;
};

export type StoredPayrollPackageLine = SagePayrollLineItem & {
  runFrequency?: PayrollLineFrequency;
  sourceAmount?: number;
  includeInMonthlyPayroll?: boolean;
};

export const WEEKS_PER_MONTH = 52 / 12;

export const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

export const payrollLineCodeFromName = (name: string) =>
  String(name || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 24) || 'EARNING';

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
  const frequency = line.frequency || 'monthly';
  const taxable = typeof line.taxable === 'boolean' ? line.taxable : taxableDefault;
  const includeInMonthly = includeLineInMonthlyPayroll(frequency);
  const monthlyAmount = monthlyPayrollAmountFromLine(sourceAmount, frequency);
  const amount = frequency === 'one-off' ? sourceAmount : monthlyAmount;
  return {
    code,
    name,
    amount,
    sourceAmount,
    runFrequency: frequency,
    includeInMonthlyPayroll: includeInMonthly,
    taxableAmount: taxable ? amount : 0,
    ytdTotal: 0,
  };
};

export const storedLinesToDraft = (lines: StoredPayrollPackageLine[]): FlexiblePayrollLineDraft[] =>
  lines.map((line, index) => ({
    id: `line-${index}-${line.code}`,
    code: line.code,
    name: line.name,
    amount: String(line.sourceAmount ?? line.amount ?? ''),
    taxable: Number(line.taxableAmount ?? line.amount ?? 0) > 0,
    frequency: line.runFrequency || 'monthly',
  }));

export const sumMonthlyPackageGross = (lines: StoredPayrollPackageLine[]) =>
  roundMoney(lines.reduce((sum, line) => sum + payrollLineMonthlyAmount(line), 0));

export const EARNING_LINE_PRESETS: Array<Omit<FlexiblePayrollLineDraft, 'id' | 'amount'>> = [
  { code: 'BASIC', name: 'Basic Salary', taxable: true, frequency: 'monthly' },
  { code: 'HOUSING', name: 'Housing Allowance', taxable: true, frequency: 'monthly' },
  { code: 'OUTSTATION', name: 'Outstation Allowance', taxable: true, frequency: 'monthly' },
  { code: 'TRANSPORT_WK', name: 'Weekly Transport Claim', taxable: true, frequency: 'weekly' },
  { code: 'MEAL', name: 'Meal Allowance', taxable: true, frequency: 'monthly' },
  { code: 'SITE', name: 'Site Allowance', taxable: true, frequency: 'monthly' },
  { code: 'UTILITY', name: 'Utility Allowance', taxable: true, frequency: 'monthly' },
  { code: 'WEEKDAYOVT', name: 'Weekday Overtime', taxable: true, frequency: 'one-off' },
  { code: 'OVERTIME', name: 'Overtime Pay', taxable: true, frequency: 'one-off' },
];

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
  const code = String(line.code || '').toUpperCase();
  if (/WEEKDAYOVT|OVERTIME|\bOT\b/.test(code)) return 'one-off';
  if (/TRANSPORT|WEEKLY/.test(code)) return 'weekly';
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

/** HRIS-configured lines plus promotable legacy supplements (overtime, transport, etc.). */
export const effectiveHrisPayrollLines = (lines: SagePayrollLineItem[] | null | undefined): StoredPayrollPackageLine[] => {
  const all = lines || [];
  const configured = hrisConfiguredPayrollLines(all) as StoredPayrollPackageLine[];
  const configuredCodes = new Set(configured.map((line) => String(line.code || '').toUpperCase()));
  const promoted = all
    .filter(isLegacySupplementLine)
    .filter((line) => !configuredCodes.has(String(line.code || '').toUpperCase()))
    .map(promoteLegacySupplementLine);
  return [...configured, ...promoted];
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
  const next = [...incoming];
  const incomingCodes = new Set(next.map((line) => String(line.code || '').toUpperCase()).filter(Boolean));
  const editorHasStructural = next.some((line) => isStructuralPayrollPackageCode(line.code));
  for (const line of existing || []) {
    const code = String(line.code || '').trim().toUpperCase();
    if (!code || incomingCodes.has(code)) continue;
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
