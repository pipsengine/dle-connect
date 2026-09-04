import type { PayrollCalculationRecord } from '@/lib/payroll-calculation-service';
import {
  resolveBankScheduleStaffPack,
  type BankScheduleStaffPack,
} from '@/lib/payroll-bank-schedule-packs';

const staffPackLabel = (pack: BankScheduleStaffPack) => {
  switch (pack) {
    case 'contract-lumpsum':
      return 'Contract / Lumpsum';
    case 'it-nysc':
      return 'IT / NYSC';
    case 'dle-usd':
      return 'DLE USD';
    default:
      return 'Permanent';
  }
};

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
  staffPack?: BankScheduleStaffPack;
  staffPackLabel?: string;
};

export type PayrollMomMetricDetail = {
  key: PayrollMomMetricKey;
  kind: 'money' | 'count';
  summary: string;
  buckets: PayrollMomDetailBucket[];
  contributors: PayrollMomContributor[];
  /** Employees with a non-zero variance for this metric (same as contributors.length). */
  contributorTotal: number;
  /** Retained employees with ~0 variance for this metric. */
  unchangedCount: number;
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

const sortBuckets = (buckets: PayrollMomDetailBucket[]) =>
  buckets.filter((bucket) => Math.abs(bucket.value) >= (bucket.kind === 'count' ? 1 : 0.005))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

const topSummary = (buckets: PayrollMomDetailBucket[], metric: PayrollMomMetric) => {
  if (!buckets.length) return `${metric.label} had no material movement.`;
  const top = buckets.filter((bucket) => bucket.id !== 'residual').slice(0, 2).map((bucket) => bucket.label).join(' and ');
  return top
    ? `${metric.label} changed mainly because of ${top}.`
    : `${metric.label} changed mainly because of schedule adjustments.`;
};

type MomAggRecord = {
  key: string;
  employeeId: string;
  employeeCode: string;
  fullName: string;
  staffPack: BankScheduleStaffPack;
  staffPackLabel: string;
  grossPay: number;
  deductions: number;
  netPay: number;
  employerCost: number;
  basePay: number;
  allowances: number;
  paye: number;
  pensionEmployee: number;
  loanRecovery: number;
  otherDeductions: number;
  pensionEmployer: number;
  statutoryEmployer: number;
};

const metricAggValue = (record: MomAggRecord, key: PayrollMomMetricKey) => {
  switch (key) {
    case 'grossPay':
      return record.grossPay;
    case 'deductions':
      return record.deductions;
    case 'netPay':
      return record.netPay;
    case 'employerCost':
      return record.employerCost;
    case 'employees':
      return 1;
    default:
      return 0;
  }
};

const toMomAgg = (record: PayrollCalculationRecord): MomAggRecord | null => {
  const key = recordMatchKey(record);
  if (!key) return null;
  const staffPack = resolveBankScheduleStaffPack(record);
  return {
    key,
    employeeId: compact(record.employeeId) || compact(record.employeeCode) || key,
    employeeCode: compact(record.employeeCode) || compact(record.employeeId) || key,
    fullName: compact(record.fullName) || compact(record.employeeCode) || key,
    staffPack,
    staffPackLabel: staffPackLabel(staffPack),
    grossPay: Number(record.grossPay || 0),
    deductions: Number(record.totalDeductions || record.deductions || 0),
    netPay: Number(record.netPay || 0),
    employerCost: Number(record.employerCost || 0),
    basePay: Number(record.basePay || 0),
    allowances: Number(record.allowances || 0),
    paye: Number(record.paye || 0),
    pensionEmployee: Number(record.pensionEmployee || record.pension || 0),
    loanRecovery: Number(record.loanRecovery || 0),
    otherDeductions: Number(record.otherDeductions || 0),
    pensionEmployer: Number(record.pensionEmployer || 0),
    statutoryEmployer: Number(record.statutoryEmployer || 0),
  };
};

const aggregateMomRecords = (records: PayrollCalculationRecord[]) => {
  const map = new Map<string, MomAggRecord>();
  for (const record of records) {
    const next = toMomAgg(record);
    if (!next) continue;
    const existing = map.get(next.key);
    if (!existing) {
      map.set(next.key, next);
      continue;
    }
    map.set(next.key, {
      ...existing,
      fullName: existing.fullName || next.fullName,
      employeeId: existing.employeeId || next.employeeId,
      employeeCode: existing.employeeCode || next.employeeCode,
      staffPack: existing.staffPack || next.staffPack,
      staffPackLabel: existing.staffPackLabel || next.staffPackLabel,
      grossPay: existing.grossPay + next.grossPay,
      deductions: existing.deductions + next.deductions,
      netPay: existing.netPay + next.netPay,
      employerCost: existing.employerCost + next.employerCost,
      basePay: existing.basePay + next.basePay,
      allowances: existing.allowances + next.allowances,
      paye: existing.paye + next.paye,
      pensionEmployee: existing.pensionEmployee + next.pensionEmployee,
      loanRecovery: existing.loanRecovery + next.loanRecovery,
      otherDeductions: existing.otherDeductions + next.otherDeductions,
      pensionEmployer: existing.pensionEmployer + next.pensionEmployer,
      statutoryEmployer: existing.statutoryEmployer + next.statutoryEmployer,
    });
  }
  return map;
};

const contributorReason = (
  key: PayrollMomMetricKey,
  current: MomAggRecord | undefined,
  previous: MomAggRecord | undefined,
) => {
  if (current && !previous) return 'New in current period';
  if (!current && previous) return 'Present in previous period only';
  if (!current || !previous) return 'No comparable record';
  if (key === 'employees') return 'Retained across both periods';
  if (key === 'grossPay') {
    const baseDelta = roundMoney(current.basePay - previous.basePay);
    const allowanceDelta = roundMoney(current.allowances - previous.allowances);
    if (Math.abs(baseDelta) >= Math.abs(allowanceDelta) && Math.abs(baseDelta) >= 0.005) return 'Base salary changed';
    if (Math.abs(allowanceDelta) >= 0.005) return 'Allowances changed';
    return 'Gross pay changed';
  }
  if (key === 'deductions') {
    const deductionDeltas: Array<[string, number]> = [
      ['PAYE changed', roundMoney(current.paye - previous.paye)],
      ['Employee pension changed', roundMoney(current.pensionEmployee - previous.pensionEmployee)],
      ['Loan recovery changed', roundMoney(current.loanRecovery - previous.loanRecovery)],
      ['Other deductions changed', roundMoney(current.otherDeductions - previous.otherDeductions)],
    ];
    deductionDeltas.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    return Math.abs(deductionDeltas[0][1]) >= 0.005 ? deductionDeltas[0][0] : 'Deduction mix changed';
  }
  if (key === 'netPay') {
    const grossDelta = roundMoney(current.grossPay - previous.grossPay);
    const deductionDelta = roundMoney(current.deductions - previous.deductions);
    if (Math.abs(grossDelta) >= Math.abs(deductionDelta) && Math.abs(grossDelta) >= 0.005) return 'Gross pay changed';
    if (Math.abs(deductionDelta) >= 0.005) return 'Deductions changed';
    return 'Net pay changed';
  }
  const employerDeltas: Array<[string, number]> = [
    ['Employer pension changed', roundMoney(current.pensionEmployer - previous.pensionEmployer)],
    ['Employer statutory changed', roundMoney(current.statutoryEmployer - previous.statutoryEmployer)],
    ['Gross-pay-linked cost changed', roundMoney(current.grossPay - previous.grossPay)],
  ];
  employerDeltas.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  return Math.abs(employerDeltas[0][1]) >= 0.005 ? employerDeltas[0][0] : 'Employer cost changed';
};

const reconcileBucketsToTarget = (
  buckets: PayrollMomDetailBucket[],
  targetVariance: number,
): PayrollMomDetailBucket[] => {
  const explained = roundMoney(buckets.reduce((sum, bucket) => sum + bucket.value, 0));
  const residual = roundMoney(targetVariance - explained);
  if (Math.abs(residual) < 0.005) return buckets;
  return [
    ...buckets,
    {
      id: 'residual',
      label: 'schedule / other adjustments vs employee lines',
      value: residual,
      kind: 'money',
    },
  ];
};

const buildPayrollMomMetricDetail = (
  metric: { key: PayrollMomMetricKey; label: string; kind: 'money' | 'count'; current: number; previous: number; variance: number },
  currentRecords: PayrollCalculationRecord[],
  previousRecords: PayrollCalculationRecord[],
): PayrollMomMetricDetail => {
  const currentByKey = aggregateMomRecords(currentRecords);
  const previousByKey = aggregateMomRecords(previousRecords);
  const allKeys = Array.from(new Set([...currentByKey.keys(), ...previousByKey.keys()]));

  const joined = allKeys
    .map((key) => currentByKey.get(key))
    .filter((record): record is MomAggRecord => Boolean(record && !previousByKey.has(record.key)));
  const exited = allKeys
    .map((key) => previousByKey.get(key))
    .filter((record): record is MomAggRecord => Boolean(record && !currentByKey.has(record.key)));
  const retainedPairs = allKeys
    .map((key) => {
      const current = currentByKey.get(key);
      const previous = previousByKey.get(key);
      return current && previous ? ([current, previous] as const) : null;
    })
    .filter((pair): pair is readonly [MomAggRecord, MomAggRecord] => Boolean(pair));

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
        staffPack: record.staffPack,
        staffPackLabel: record.staffPackLabel,
      })),
      ...exited.map((record) => ({
        employeeId: record.employeeId,
        employeeCode: record.employeeCode,
        fullName: record.fullName,
        variance: -1,
        current: 0,
        previous: 1,
        reason: 'Present in previous period only',
        staffPack: record.staffPack,
        staffPackLabel: record.staffPackLabel,
      })),
    ].sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance) || a.fullName.localeCompare(b.fullName));
    return {
      key: metric.key,
      kind: 'count',
      summary: topSummary(buckets.filter((bucket) => bucket.id !== 'retained'), { ...metric, pctChange: 0, direction: 'flat', detail: null }),
      buckets,
      contributors,
      contributorTotal: contributors.length,
      unchangedCount: retainedPairs.length,
    };
  }

  const headcountMovement = roundMoney(
    joined.reduce((sum, record) => sum + metricAggValue(record, metric.key), 0)
      - exited.reduce((sum, record) => sum + metricAggValue(record, metric.key), 0),
  );
  const retainedDelta = roundMoney(retainedPairs.reduce(
    (sum, [current, previous]) => sum + metricAggValue(current, metric.key) - metricAggValue(previous, metric.key),
    0,
  ));

  const buckets: PayrollMomDetailBucket[] = [
    { id: 'headcount', label: 'headcount movement', value: headcountMovement, kind: 'money' },
  ];

  if (metric.key === 'grossPay') {
    const baseDelta = roundMoney(retainedPairs.reduce((sum, [current, previous]) => sum + current.basePay - previous.basePay, 0));
    const allowanceDelta = roundMoney(retainedPairs.reduce((sum, [current, previous]) => sum + current.allowances - previous.allowances, 0));
    buckets.push(
      { id: 'base-pay', label: 'base salary changes on retained staff', value: baseDelta, kind: 'money' },
      { id: 'allowances', label: 'allowance changes on retained staff', value: allowanceDelta, kind: 'money' },
      { id: 'other-retained', label: 'other gross movement on retained staff', value: roundMoney(retainedDelta - baseDelta - allowanceDelta), kind: 'money' },
    );
  } else if (metric.key === 'deductions') {
    const payeDelta = roundMoney(retainedPairs.reduce((sum, [current, previous]) => sum + current.paye - previous.paye, 0));
    const pensionDelta = roundMoney(retainedPairs.reduce((sum, [current, previous]) => sum + current.pensionEmployee - previous.pensionEmployee, 0));
    const loanOtherDelta = roundMoney(retainedPairs.reduce((sum, [current, previous]) => sum + current.loanRecovery + current.otherDeductions - previous.loanRecovery - previous.otherDeductions, 0));
    buckets.push(
      { id: 'paye', label: 'PAYE movement on retained staff', value: payeDelta, kind: 'money' },
      { id: 'pension-ee', label: 'employee pension movement on retained staff', value: pensionDelta, kind: 'money' },
      { id: 'loans-other', label: 'loan and other deduction movement on retained staff', value: loanOtherDelta, kind: 'money' },
      { id: 'other-retained', label: 'other deduction movement on retained staff', value: roundMoney(retainedDelta - payeDelta - pensionDelta - loanOtherDelta), kind: 'money' },
    );
  } else if (metric.key === 'netPay') {
    const positiveRetained = roundMoney(retainedPairs.reduce((sum, [current, previous]) => {
      const delta = current.netPay - previous.netPay;
      return delta > 0 ? sum + delta : sum;
    }, 0));
    const negativeRetained = roundMoney(retainedPairs.reduce((sum, [current, previous]) => {
      const delta = current.netPay - previous.netPay;
      return delta < 0 ? sum + delta : sum;
    }, 0));
    buckets.push(
      { id: 'retained-up', label: 'net pay increases on retained staff', value: positiveRetained, kind: 'money' },
      { id: 'retained-down', label: 'net pay decreases on retained staff', value: negativeRetained, kind: 'money' },
    );
  } else if (metric.key === 'employerCost') {
    const pensionEmployerDelta = roundMoney(retainedPairs.reduce((sum, [current, previous]) => sum + current.pensionEmployer - previous.pensionEmployer, 0));
    const statutoryEmployerDelta = roundMoney(retainedPairs.reduce((sum, [current, previous]) => sum + current.statutoryEmployer - previous.statutoryEmployer, 0));
    buckets.push(
      { id: 'pension-er', label: 'employer pension movement on retained staff', value: pensionEmployerDelta, kind: 'money' },
      { id: 'statutory-er', label: 'employer statutory movement on retained staff', value: statutoryEmployerDelta, kind: 'money' },
      { id: 'retained-total', label: 'other employer-cost movement on retained staff', value: roundMoney(retainedDelta - pensionEmployerDelta - statutoryEmployerDelta), kind: 'money' },
    );
  }

  const reconciled = reconcileBucketsToTarget(buckets, metric.variance);

  const ranked = allKeys
    .map((key) => {
      const current = currentByKey.get(key);
      const previous = previousByKey.get(key);
      const currentValue = current ? metricAggValue(current, metric.key) : 0;
      const previousValue = previous ? metricAggValue(previous, metric.key) : 0;
      const variance = roundMoney(currentValue - previousValue);
      const sample = current || previous!;
      return {
        employeeId: sample.employeeId,
        employeeCode: sample.employeeCode,
        fullName: sample.fullName,
        variance,
        current: roundMoney(currentValue),
        previous: roundMoney(previousValue),
        reason: contributorReason(metric.key, current, previous),
        staffPack: sample.staffPack,
        staffPackLabel: sample.staffPackLabel,
      } satisfies PayrollMomContributor;
    })
    .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance) || a.fullName.localeCompare(b.fullName));

  const contributors = ranked.filter((item) => Math.abs(item.variance) >= 0.005);
  const unchangedCount = ranked.length - contributors.length;

  const rankedBuckets = sortBuckets(reconciled);
  return {
    key: metric.key,
    kind: 'money',
    summary: topSummary(rankedBuckets, { ...metric, pctChange: 0, direction: 'flat', detail: null }),
    buckets: rankedBuckets,
    contributors,
    contributorTotal: contributors.length,
    unchangedCount,
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
        ? buildPayrollMomMetricDetail(
          { ...def, current, previous: prior, variance },
          input.currentRecords || [],
          input.previousRecords || [],
        )
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
