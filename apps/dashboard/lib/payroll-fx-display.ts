import { roundMoney, type FlexiblePayrollLineDraft } from '@/lib/payroll-package-lines';

export type PayrollRunFx = {
  rate: number;
  /** Calendar day the rate applies to — the payroll-run lock date, or the CBN date on the salary schedule. */
  rateDate: string;
  source: string;
  /** Salary-schedule CBN rate, or the USD/NGN rate stored for the payroll-run day. */
  kind: 'cbn' | 'market';
  period: string;
};

export const convertPayrollMoney = (
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rate: number,
) => {
  const from = String(fromCurrency || '').toUpperCase() === 'USD' ? 'USD' : 'NGN';
  const to = String(toCurrency || '').toUpperCase() === 'USD' ? 'USD' : 'NGN';
  const value = Number(amount);
  if (!Number.isFinite(value)) return 0;
  if (from === to) return roundMoney(value);
  if (!(Number(rate) > 0)) return roundMoney(value);
  if (from === 'USD' && to === 'NGN') return roundMoney(value * Number(rate));
  if (from === 'NGN' && to === 'USD') return roundMoney(value / Number(rate));
  return roundMoney(value);
};

/** Keep incomplete input (blank, lone dot) so a money field can be edited without jumping. */
export const convertAmountText = (
  value: string,
  fromCurrency: string,
  toCurrency: string,
  rate: number,
) => {
  const trimmed = String(value ?? '').trim();
  if (!trimmed || trimmed === '.' || trimmed === '-' || trimmed === '-.') return String(value ?? '');
  const amount = Number(trimmed);
  if (!Number.isFinite(amount)) return String(value ?? '');
  return String(convertPayrollMoney(amount, fromCurrency, toCurrency, rate));
};

export const payrollAmountForDisplay = (
  amount: number | null | undefined,
  packageCurrency: string,
  displayCurrency: string,
  rate: number | null | undefined,
) => {
  if (amount == null || !Number.isFinite(Number(amount))) return amount ?? null;
  return convertPayrollMoney(Number(amount), packageCurrency, displayCurrency, Number(rate || 0));
};

export const payrollLinesForDisplay = (
  lines: FlexiblePayrollLineDraft[] | null | undefined,
  packageCurrency: string,
  displayCurrency: string,
  rate: number | null | undefined,
): FlexiblePayrollLineDraft[] => {
  const source = lines || [];
  if (String(packageCurrency).toUpperCase() === String(displayCurrency).toUpperCase()) return source;
  return source.map((line) => ({
    ...line,
    amount: convertAmountText(line.amount, packageCurrency, displayCurrency, Number(rate || 0)),
  }));
};

export const payrollLinesFromDisplay = (
  lines: FlexiblePayrollLineDraft[],
  packageCurrency: string,
  displayCurrency: string,
  rate: number | null | undefined,
): FlexiblePayrollLineDraft[] => {
  if (String(packageCurrency).toUpperCase() === String(displayCurrency).toUpperCase()) return lines;
  return lines.map((line) => ({
    ...line,
    amount: convertAmountText(line.amount, displayCurrency, packageCurrency, Number(rate || 0)),
  }));
};

const fxDateLabel = (iso: string) => {
  const day = String(iso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '';
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
};

const periodLabel = (period: string) => {
  if (!/^\d{4}-\d{2}$/.test(period)) return period;
  return new Date(`${period}-01T00:00:00Z`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
};

export const formatPayrollRunFxCaption = (fx: PayrollRunFx) => {
  const rateText = new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(fx.rate);
  const asAt = fxDateLabel(fx.rateDate);
  const basis = fx.kind === 'cbn' ? 'CBN rate' : 'USD/NGN rate';
  const when = asAt ? ` as at ${asAt}` : '';
  return `Naira equivalent at the ${basis} for the ${periodLabel(fx.period)} payroll run: ${rateText} = $1${when}. Dollar amounts stay saved on the package.`;
};
