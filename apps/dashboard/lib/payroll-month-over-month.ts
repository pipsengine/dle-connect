const previousPayrollPeriod = (period: string) => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(period || '').trim());
  if (!match) return '';
  let year = Number(match[1]);
  let month = Number(match[2]) - 1;
  if (month < 1) {
    month = 12;
    year -= 1;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
};

export type PayrollMomTotals = {
  period: string;
  periodLabel: string;
  employees: number;
  grossPay: number;
  deductions: number;
  netPay: number;
  employerCost: number;
};

export type PayrollMomMetricKey = 'grossPay' | 'deductions' | 'netPay' | 'employerCost' | 'employees';

export type PayrollMomMetric = {
  key: PayrollMomMetricKey;
  label: string;
  current: number;
  previous: number;
  variance: number;
  pctChange: number;
  direction: 'up' | 'down' | 'flat';
  kind: 'money' | 'count';
};

export type PayrollMonthOverMonth = {
  available: boolean;
  previousPeriod: string;
  previousPeriodLabel: string;
  currentPeriod: string;
  currentPeriodLabel: string;
  previous: PayrollMomTotals | null;
  current: PayrollMomTotals;
  metrics: PayrollMomMetric[];
};

const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

const METRIC_DEFS: Array<{ key: PayrollMomMetricKey; label: string; kind: 'money' | 'count' }> = [
  { key: 'grossPay', label: 'Gross Pay', kind: 'money' },
  { key: 'deductions', label: 'Deductions', kind: 'money' },
  { key: 'netPay', label: 'Net Pay', kind: 'money' },
  { key: 'employerCost', label: 'Employer Cost', kind: 'money' },
  { key: 'employees', label: 'Headcount', kind: 'count' },
];

export const shortPayrollPeriodLabel = (period: string) => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(period || '').trim());
  if (!match) return period || '';
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)).toLocaleDateString('en-GB', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
};

export const payrollMomPctChange = (previous: number, current: number) => {
  if (previous === 0 && current === 0) return 0;
  if (previous === 0) return current > 0 ? 100 : current < 0 ? -100 : 0;
  return roundMoney(((current - previous) / Math.abs(previous)) * 100);
};

export const payrollMomDirection = (variance: number): PayrollMomMetric['direction'] => {
  if (Math.abs(variance) < 0.005) return 'flat';
  return variance > 0 ? 'up' : 'down';
};

export const totalsHaveFigures = (totals: PayrollMomTotals | null | undefined) => {
  if (!totals) return false;
  return [totals.grossPay, totals.deductions, totals.netPay, totals.employerCost, totals.employees]
    .some((value) => Number(value || 0) !== 0);
};

export const buildPayrollMonthOverMonth = (input: {
  currentPeriod: string;
  currentPeriodLabel?: string;
  current: PayrollMomTotals;
  previous: PayrollMomTotals | null;
}): PayrollMonthOverMonth => {
  const previousPeriod = previousPayrollPeriod(input.currentPeriod);
  const previous = totalsHaveFigures(input.previous) ? input.previous : null;
  const metrics = METRIC_DEFS.map((def) => {
    const current = Number(input.current[def.key] || 0);
    const prior = Number(previous?.[def.key] || 0);
    const variance = def.kind === 'count' ? current - prior : roundMoney(current - prior);
    return {
      ...def,
      current,
      previous: prior,
      variance,
      pctChange: payrollMomPctChange(prior, current),
      direction: payrollMomDirection(variance),
    };
  });
  return {
    available: Boolean(previous),
    previousPeriod,
    previousPeriodLabel: previous?.periodLabel || shortPayrollPeriodLabel(previousPeriod),
    currentPeriod: input.currentPeriod,
    currentPeriodLabel: input.currentPeriodLabel || input.current.periodLabel || shortPayrollPeriodLabel(input.currentPeriod),
    previous,
    current: input.current,
    metrics,
  };
};

export const payrollMomMetric = (mom: PayrollMonthOverMonth | null | undefined, key: PayrollMomMetricKey) =>
  mom?.available ? mom.metrics.find((item) => item.key === key) || null : null;
