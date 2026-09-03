import type { PayrollCalculationRecord } from '@/lib/payroll-calculation-service';

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
  detail: PayrollMomMetricDetail | null;
};

export type PayrollMomDetailBucket = {
  id: string;
  label: string;
  value: number;
  kind: 'money' | 'count';
};

export type PayrollMomContributor = {
  employeeId: string;
  employeeCode: string;
  fullName: string;
  variance: number;
  current: number;
  previous: number;
  reason: string;
};

export type PayrollMomMetricDetail = {
  key: PayrollMomMetricKey;
  kind: 'money' | 'count';
  summary: string;
  buckets: PayrollMomDetailBucket[];
  contributors: PayrollMomContributor[];
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
const compact = (value: unknown) => String(value || '').trim();
const upper = (value: unknown) => compact(value).toUpperCase();

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

const recordMatchKey = (record: PayrollCalculationRecord) =>
  upper(record.employeeCode || record.employeeId || record.fullName);

const metricRecordValue = (record: PayrollCalculationRecord, key: PayrollMomMetricKey) => {
  switch (key) {
    case 'grossPay':
      return Number(record.grossPay || 0);
    case 'deductions':
      return Number(record.totalDeductions || record.deductions || 0);
    case 'netPay':
      return Number(record.netPay || 0);
    case 'employerCost':
      return Number(record.employerCost || 0);
    case 'employees':
      return 1;
    default:
      return 0;
  }
};

const sortBuckets = (buckets: PayrollMomDetailBucket[]) =>
  buckets.filter((bucket) => Math.abs(bucket.value) >= (bucket.kind === 'count' ? 1 : 0.005))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

const topSummary = (buckets: PayrollMomDetailBucket[], metric: PayrollMomMetric) => {
  if (!buckets.length) return `${metric.label} had no material movement.`;
  const top = buckets.slice(0, 2).map((bucket) => bucket.label).join(' and ');
  return `${metric.label} changed mainly because of ${top}.`;
};

const contributorReason = (
  key: PayrollMomMetricKey,
  current: PayrollCalculationRecord | undefined,
  previous: PayrollCalculationRecord | undefined,
) => {
  if (current && !previous) return 'New in current period';
  if (!current && previous) return 'Present in previous period only';
  if (!current || !previous) return 'No comparable record';
  if (key === 'employees') return 'Retained across both periods';
  if (key === 'grossPay') {
    const baseDelta = roundMoney(Number(current.basePay || 0) - Number(previous.basePay || 0));
    const allowanceDelta = roundMoney(Number(current.allowances || 0) - Number(previous.allowances || 0));
    if (Math.abs(baseDelta) >= Math.abs(allowanceDelta) && Math.abs(baseDelta) >= 0.005) return 'Base salary changed';
    if (Math.abs(allowanceDelta) >= 0.005) return 'Allowances changed';
    return 'Gross pay changed';
  }
  if (key === 'deductions') {
    const deltas: Array<[string, number]> = [
      ['PAYE changed', roundMoney(Number(current.paye || 0) - Number(previous.paye || 0))],
      ['Employee pension changed', roundMoney(Number(current.pensionEmployee || 0) - Number(previous.pensionEmployee || previous.pension || 0))],
      ['Loan recovery changed', roundMoney(Number(current.loanRecovery || 0) - Number(previous.loanRecovery || 0))],
      ['Other deductions changed', roundMoney(Number(current.otherDeductions || 0) - Number(previous.otherDeductions || 0))],
    ].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    return Math.abs(deltas[0][1]) >= 0.005 ? deltas[0][0] : 'Deduction mix changed';
  }
  if (key === 'netPay') {
    const grossDelta = roundMoney(Number(current.grossPay || 0) - Number(previous.grossPay || 0));
    const deductionDelta = roundMoney(Number(current.totalDeductions || current.deductions || 0) - Number(previous.totalDeductions || previous.deductions || 0));
    if (Math.abs(grossDelta) >= Math.abs(deductionDelta) && Math.abs(grossDelta) >= 0.005) return 'Gross pay changed';
    if (Math.abs(deductionDelta) >= 0.005) return 'Deductions changed';
    return 'Net pay changed';
  }
  const deltas: Array<[string, number]> = [
    ['Employer pension changed', roundMoney(Number(current.pensionEmployer || 0) - Number(previous.pensionEmployer || 0))],
    ['Employer statutory changed', roundMoney(Number(current.statutoryEmployer || 0) - Number(previous.statutoryEmployer || 0))],
    ['Gross-pay-linked cost changed', roundMoney(Number(current.grossPay || 0) - Number(previous.grossPay || 0))],
  ].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  return Math.abs(deltas[0][1]) >= 0.005 ? deltas[0][0] : 'Employer cost changed';
};

const buildPayrollMomMetricDetail = (
  metric: { key: PayrollMomMetricKey; label: string; kind: 'money' | 'count' },
  currentRecords: PayrollCalculationRecord[],
  previousRecords: PayrollCalculationRecord[],
): PayrollMomMetricDetail => {
  const currentByKey = new Map(currentRecords.map((record) => [recordMatchKey(record), record]));
  const previousByKey = new Map(previousRecords.map((record) => [recordMatchKey(record), record]));
  const joined = currentRecords.filter((record) => !previousByKey.has(recordMatchKey(record)));
  const exited = previousRecords.filter((record) => !currentByKey.has(recordMatchKey(record)));
  const retainedPairs = currentRecords
    .map((record) => [record, previousByKey.get(recordMatchKey(record))] as const)
    .filter((pair): pair is readonly [PayrollCalculationRecord, PayrollCalculationRecord] => Boolean(pair[1]));

  if (metric.kind === 'count') {
    const buckets = sortBuckets([
      { id: 'joined', label: 'new employees in current month', value: joined.length, kind: 'count' },
      { id: 'exited', label: 'employees no longer in current month', value: -exited.length, kind: 'count' },
      { id: 'retained', label: 'employees retained across both months', value: retainedPairs.length, kind: 'count' },
    ]);
    const contributors = [
      ...joined.map((record) => ({
        employeeId: record.employeeId,
        employeeCode: record.employeeCode,
        fullName: record.fullName,
        variance: 1,
        current: 1,
        previous: 0,
        reason: 'New in current period',
      })),
      ...exited.map((record) => ({
        employeeId: record.employeeId,
        employeeCode: record.employeeCode,
        fullName: record.fullName,
        variance: -1,
        current: 0,
        previous: 1,
        reason: 'Present in previous period only',
      })),
    ].slice(0, 12);
    return {
      key: metric.key,
      kind: 'count',
      summary: topSummary(buckets.filter((bucket) => bucket.id !== 'retained'), { ...metric, current: 0, previous: 0, variance: 0, pctChange: 0, direction: 'flat', detail: null }),
      buckets,
      contributors,
    };
  }

  const headcountMovement = roundMoney(
    joined.reduce((sum, record) => sum + metricRecordValue(record, metric.key), 0)
      - exited.reduce((sum, record) => sum + metricRecordValue(record, metric.key), 0),
  );
  const retainedDelta = roundMoney(retainedPairs.reduce(
    (sum, [current, previous]) => sum + metricRecordValue(current, metric.key) - metricRecordValue(previous, metric.key),
    0,
  ));

  const buckets: PayrollMomDetailBucket[] = [
    { id: 'headcount', label: 'headcount movement', value: headcountMovement, kind: 'money' },
  ];
  if (metric.key === 'grossPay') {
    buckets.push(
      { id: 'base-pay', label: 'base salary changes on retained staff', value: roundMoney(retainedPairs.reduce((sum, [current, previous]) => sum + Number(current.basePay || 0) - Number(previous.basePay || 0), 0)), kind: 'money' },
      { id: 'allowances', label: 'allowance changes on retained staff', value: roundMoney(retainedPairs.reduce((sum, [current, previous]) => sum + Number(current.allowances || 0) - Number(previous.allowances || 0), 0)), kind: 'money' },
    );
  } else if (metric.key === 'deductions') {
    buckets.push(
      { id: 'paye', label: 'PAYE movement on retained staff', value: roundMoney(retainedPairs.reduce((sum, [current, previous]) => sum + Number(current.paye || 0) - Number(previous.paye || 0), 0)), kind: 'money' },
      { id: 'pension-ee', label: 'employee pension movement on retained staff', value: roundMoney(retainedPairs.reduce((sum, [current, previous]) => sum + Number(current.pensionEmployee || 0) - Number(previous.pensionEmployee || previous.pension || 0), 0)), kind: 'money' },
      { id: 'loans-other', label: 'loan and other deduction movement on retained staff', value: roundMoney(retainedPairs.reduce((sum, [current, previous]) => sum + Number(current.loanRecovery || 0) + Number(current.otherDeductions || 0) - Number(previous.loanRecovery || 0) - Number(previous.otherDeductions || 0), 0)), kind: 'money' },
    );
  } else if (metric.key === 'netPay') {
    const positiveRetained = roundMoney(retainedPairs.reduce((sum, [current, previous]) => {
      const delta = Number(current.netPay || 0) - Number(previous.netPay || 0);
      return delta > 0 ? sum + delta : sum;
    }, 0));
    const negativeRetained = roundMoney(retainedPairs.reduce((sum, [current, previous]) => {
      const delta = Number(current.netPay || 0) - Number(previous.netPay || 0);
      return delta < 0 ? sum + delta : sum;
    }, 0));
    buckets.push(
      { id: 'retained-up', label: 'net pay increases on retained staff', value: positiveRetained, kind: 'money' },
      { id: 'retained-down', label: 'net pay decreases on retained staff', value: negativeRetained, kind: 'money' },
    );
  } else if (metric.key === 'employerCost') {
    const pensionEmployerDelta = roundMoney(retainedPairs.reduce((sum, [current, previous]) => sum + Number(current.pensionEmployer || 0) - Number(previous.pensionEmployer || 0), 0));
    const statutoryEmployerDelta = roundMoney(retainedPairs.reduce((sum, [current, previous]) => sum + Number(current.statutoryEmployer || 0) - Number(previous.statutoryEmployer || 0), 0));
    buckets.push(
      { id: 'pension-er', label: 'employer pension movement on retained staff', value: pensionEmployerDelta, kind: 'money' },
      { id: 'statutory-er', label: 'employer statutory movement on retained staff', value: statutoryEmployerDelta, kind: 'money' },
      { id: 'retained-total', label: 'other employer-cost movement on retained staff', value: roundMoney(retainedDelta - pensionEmployerDelta - statutoryEmployerDelta), kind: 'money' },
    );
  }

  const contributors = [
    ...currentRecords.map((record) => {
      const previous = previousByKey.get(recordMatchKey(record));
      const variance = roundMoney(metricRecordValue(record, metric.key) - (previous ? metricRecordValue(previous, metric.key) : 0));
      return variance === 0 ? null : {
        employeeId: record.employeeId,
        employeeCode: record.employeeCode,
        fullName: record.fullName,
        variance,
        current: roundMoney(metricRecordValue(record, metric.key)),
        previous: roundMoney(previous ? metricRecordValue(previous, metric.key) : 0),
        reason: contributorReason(metric.key, record, previous),
      };
    }),
    ...exited.map((record) => ({
      employeeId: record.employeeId,
      employeeCode: record.employeeCode,
      fullName: record.fullName,
      variance: roundMoney(-metricRecordValue(record, metric.key)),
      current: 0,
      previous: roundMoney(metricRecordValue(record, metric.key)),
      reason: contributorReason(metric.key, undefined, record),
    })),
  ]
    .filter((item): item is PayrollMomContributor => Boolean(item))
    .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))
    .slice(0, 12);

  const rankedBuckets = sortBuckets(buckets);
  return {
    key: metric.key,
    kind: 'money',
    summary: topSummary(rankedBuckets, { ...metric, current: 0, previous: 0, variance: 0, pctChange: 0, direction: 'flat', detail: null }),
    buckets: rankedBuckets,
    contributors,
  };
};

export const buildPayrollMonthOverMonth = (input: {
  currentPeriod: string;
  currentPeriodLabel?: string;
  current: PayrollMomTotals;
  previous: PayrollMomTotals | null;
  currentRecords?: PayrollCalculationRecord[];
  previousRecords?: PayrollCalculationRecord[];
  includeMoneyDetails?: boolean;
}): PayrollMonthOverMonth => {
  const previousPeriod = previousPayrollPeriod(input.currentPeriod);
  const previous = totalsHaveFigures(input.previous) ? input.previous : null;
  const metrics = METRIC_DEFS.map((def) => {
    const current = Number(input.current[def.key] || 0);
    const prior = Number(previous?.[def.key] || 0);
    const variance = def.kind === 'count' ? current - prior : roundMoney(current - prior);
    const canBuildDetail = previous
      && input.currentRecords
      && input.previousRecords
      && (def.kind === 'count' || input.includeMoneyDetails !== false);
    return {
      ...def,
      current,
      previous: prior,
      variance,
      pctChange: payrollMomPctChange(prior, current),
      direction: payrollMomDirection(variance),
      detail: canBuildDetail
        ? buildPayrollMomMetricDetail(def, input.currentRecords || [], input.previousRecords || [])
        : null,
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
