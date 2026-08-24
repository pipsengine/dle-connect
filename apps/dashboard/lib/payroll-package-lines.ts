import type { SagePayrollLineItem } from '@/lib/sage-payroll-line-parser';

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
