import type { PayrollCalculationRecord } from '@/lib/payroll-calculation-service';
import {
  resolveBankScheduleStaffPack,
  type BankScheduleStaffPack,
} from '@/lib/payroll-bank-schedule-packs';
import { earningComponentFamily, type EarningComponentFamily } from '@/lib/payroll-earning-component';
import { formatPayrollMoney } from '@/lib/payroll-currency';

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
  /** Currency of the schedule being compared. DLE USD stays in dollars. */
  currency: 'NGN' | 'USD';
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

const FAMILY_LABEL: Record<EarningComponentFamily, string> = {
  basic: 'Basic salary',
  housing: 'Housing',
  medical: 'Medical',
  other: 'Other allowance',
  transport: 'Transport allowance',
  furniture: 'Furniture allowance',
  utilities: 'Utilities',
  meal: 'Meal allowance',
  leave: 'Leave allowance',
  lumpsum: 'Lumpsum allowance',
  njic: 'NJIC',
};

const DEDUCTION_LABEL: Record<string, string> = {
  'ded:paye': 'PAYE',
  'ded:pension': 'Employee pension',
  'ded:nhf': 'NHF',
  'ded:loan': 'Loan recovery',
  'ded:union': 'Union dues',
};

const ACRONYM_WORD = /^(paye|nhf|nsitf|itf|tcm|nysc|njic|usd|ngn|ot|ovt)$/i;

const displayPayLineName = (raw: string) => {
  const text = compact(raw);
  if (!text) return 'Other';
  if (/^[A-Z0-9/&-]{2,12}$/.test(text) && !text.includes('_')) return text;
  const words = text.split(/[\s_]+/).filter(Boolean).map((word) => (
    ACRONYM_WORD.test(word) ? word.toUpperCase() : word.toLowerCase()
  ));
  const sentence = words.join(' ');
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
};

const identifyEarning = (code: string, name: string) => {
  const family = earningComponentFamily(code, name);
  if (family) return { key: `family:${family}`, label: FAMILY_LABEL[family] };
  const label = displayPayLineName(name || code);
  return { key: `name:${label.toLowerCase()}`, label };
};

const identifyDeduction = (code: string, name: string) => {
  const text = `${code} ${name}`;
  if (/PAYE/i.test(text)) return { key: 'ded:paye', label: DEDUCTION_LABEL['ded:paye'] };
  if (/NHF/i.test(text)) return { key: 'ded:nhf', label: DEDUCTION_LABEL['ded:nhf'] };
  if (/PENSION/i.test(text)) return { key: 'ded:pension', label: DEDUCTION_LABEL['ded:pension'] };
  if (/LOAN/i.test(text)) return { key: 'ded:loan', label: DEDUCTION_LABEL['ded:loan'] };
  if (/UNION/i.test(text)) return { key: 'ded:union', label: DEDUCTION_LABEL['ded:union'] };
  const label = displayPayLineName(name || code);
  return { key: `ded:${label.toLowerCase()}`, label };
};

type MomPayLine = { key: string; label: string; amount: number };

type MomComponent = {
  key: string;
  label: string;
  /** Change in the pay element itself. Positive means the element went up. */
  ownDelta: number;
  /** Effect of that change on the metric being explained. */
  contribution: number;
};

const parsePayLines = (value: unknown, kind: 'earning' | 'deduction'): MomPayLine[] => {
  if (!Array.isArray(value)) return [];
  const map = new Map<string, MomPayLine>();
  for (const line of value) {
    if (!line || typeof line !== 'object') continue;
    const row = line as { code?: unknown; name?: unknown; label?: unknown; amount?: unknown };
    const code = compact(row.code);
    const name = compact(row.name || row.label);
    const amount = roundMoney(Number(row.amount || 0));
    if ((!code && !name) || Math.abs(amount) < 0.005) continue;
    const identified = kind === 'earning' ? identifyEarning(code, name) : identifyDeduction(code, name);
    const existing = map.get(identified.key);
    if (existing) existing.amount = roundMoney(existing.amount + amount);
    else map.set(identified.key, { key: identified.key, label: identified.label, amount });
  }
  return [...map.values()];
};

const mergePayLines = (left: MomPayLine[], right: MomPayLine[]) => {
  const map = new Map<string, MomPayLine>();
  for (const line of [...left, ...right]) {
    const existing = map.get(line.key);
    if (!existing) map.set(line.key, { ...line });
    else existing.amount = roundMoney(existing.amount + line.amount);
  }
  return [...map.values()];
};

const moneyText = (amount: number, currency: string) => formatPayrollMoney(Math.abs(amount), currency || 'NGN');

const movementPhrase = (label: string, delta: number, currency: string) => {
  const amount = moneyText(delta, currency);
  if (delta > 0) return `${label} increased by ${amount}`;
  if (delta < 0) return `${label} decreased by ${amount}`;
  return label;
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
  payCurrency: string;
  earningLines: MomPayLine[];
  deductionLines: MomPayLine[];
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
    payCurrency: compact(record.payCurrency).toUpperCase() === 'USD' ? 'USD' : 'NGN',
    earningLines: parsePayLines(record.earningLines, 'earning'),
    deductionLines: parsePayLines(record.deductionLines, 'deduction'),
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
      payCurrency: existing.payCurrency || next.payCurrency,
      earningLines: mergePayLines(existing.earningLines, next.earningLines),
      deductionLines: mergePayLines(existing.deductionLines, next.deductionLines),
    });
  }
  return map;
};

const scalarEarnings = (record: MomAggRecord): MomPayLine[] => [
  { key: 'family:basic', label: 'Basic salary', amount: roundMoney(record.basePay) },
  { key: 'scalar:allowances', label: 'Allowances', amount: roundMoney(record.allowances) },
];

const scalarDeductions = (record: MomAggRecord): MomPayLine[] => [
  { key: 'ded:paye', label: 'PAYE', amount: roundMoney(record.paye) },
  { key: 'ded:pension', label: 'Employee pension', amount: roundMoney(record.pensionEmployee) },
  { key: 'ded:loan', label: 'Loan recovery', amount: roundMoney(record.loanRecovery) },
  { key: 'ded:other', label: 'Other deductions', amount: roundMoney(record.otherDeductions) },
];

const earningsForDiff = (current: MomAggRecord, previous: MomAggRecord) => {
  if (current.earningLines.length && previous.earningLines.length) {
    return { current: current.earningLines, previous: previous.earningLines };
  }
  return { current: scalarEarnings(current), previous: scalarEarnings(previous) };
};

const deductionsForDiff = (current: MomAggRecord, previous: MomAggRecord) => {
  if (current.deductionLines.length && previous.deductionLines.length) {
    return { current: current.deductionLines, previous: previous.deductionLines };
  }
  return { current: scalarDeductions(current), previous: scalarDeductions(previous) };
};

const diffPayLines = (current: MomPayLine[], previous: MomPayLine[]): MomComponent[] => {
  const currentMap = new Map(current.map((line) => [line.key, line]));
  const previousMap = new Map(previous.map((line) => [line.key, line]));
  const components: MomComponent[] = [];
  for (const key of new Set([...currentMap.keys(), ...previousMap.keys()])) {
    const currentLine = currentMap.get(key);
    const previousLine = previousMap.get(key);
    const ownDelta = roundMoney((currentLine?.amount || 0) - (previousLine?.amount || 0));
    if (Math.abs(ownDelta) < 0.005) continue;
    components.push({
      key,
      label: currentLine?.label || previousLine?.label || 'Other',
      ownDelta,
      contribution: ownDelta,
    });
  }
  return components;
};

const withGap = (components: MomComponent[], target: number, key: string, label: string) => {
  const explained = roundMoney(components.reduce((sum, component) => sum + component.contribution, 0));
  const gap = roundMoney(target - explained);
  if (Math.abs(gap) < 0.005) return components;
  return [...components, { key, label, ownDelta: gap, contribution: gap }];
};

const retainedComponents = (
  key: PayrollMomMetricKey,
  current: MomAggRecord,
  previous: MomAggRecord,
): MomComponent[] => {
  const earningDiff = diffPayLines(
    earningsForDiff(current, previous).current,
    earningsForDiff(current, previous).previous,
  );
  const deductionDiff = diffPayLines(
    deductionsForDiff(current, previous).current,
    deductionsForDiff(current, previous).previous,
  );
  if (key === 'grossPay') {
    return withGap(earningDiff, roundMoney(current.grossPay - previous.grossPay), 'gap:gross', 'Other gross adjustment');
  }
  if (key === 'deductions') {
    return withGap(deductionDiff, roundMoney(current.deductions - previous.deductions), 'gap:deductions', 'Other deduction adjustment');
  }
  if (key === 'netPay') {
    const deductionImpact = deductionDiff.map((component) => ({
      ...component,
      contribution: roundMoney(-component.ownDelta),
    }));
    return withGap(
      [...earningDiff, ...deductionImpact],
      roundMoney(current.netPay - previous.netPay),
      'gap:net',
      'Other net adjustment',
    );
  }
  const extras: MomComponent[] = [];
  const pensionDelta = roundMoney(current.pensionEmployer - previous.pensionEmployer);
  const statutoryDelta = roundMoney(current.statutoryEmployer - previous.statutoryEmployer);
  if (Math.abs(pensionDelta) >= 0.005) {
    extras.push({ key: 'er:pension', label: 'Employer pension', ownDelta: pensionDelta, contribution: pensionDelta });
  }
  if (Math.abs(statutoryDelta) >= 0.005) {
    extras.push({ key: 'er:statutory', label: 'NSITF/ITF', ownDelta: statutoryDelta, contribution: statutoryDelta });
  }
  return withGap(
    [...earningDiff, ...extras],
    roundMoney(current.employerCost - previous.employerCost),
    'gap:employer',
    'Other employer-cost adjustment',
  );
};

const payLinesForRecord = (key: PayrollMomMetricKey, record: MomAggRecord): MomPayLine[] => {
  const earnings = record.earningLines.length
    ? record.earningLines
    : scalarEarnings(record).filter((line) => Math.abs(line.amount) >= 0.005);
  if (key === 'deductions') {
    return record.deductionLines.length
      ? record.deductionLines
      : scalarDeductions(record).filter((line) => Math.abs(line.amount) >= 0.005);
  }
  if (key === 'employerCost') {
    const extras: MomPayLine[] = [];
    if (Math.abs(record.pensionEmployer) >= 0.005) {
      extras.push({ key: 'er:pension', label: 'Employer pension', amount: roundMoney(record.pensionEmployer) });
    }
    if (Math.abs(record.statutoryEmployer) >= 0.005) {
      extras.push({ key: 'er:statutory', label: 'NSITF/ITF', amount: roundMoney(record.statutoryEmployer) });
    }
    return [...earnings, ...extras];
  }
  return earnings;
};

const arrivalReason = (kind: 'new' | 'left', record: MomAggRecord, key: PayrollMomMetricKey = 'grossPay') => {
  const prefix = kind === 'new' ? 'New in current period' : 'Present in previous period only';
  const main = [...payLinesForRecord(key, record)].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount) || a.label.localeCompare(b.label))[0];
  if (!main) return prefix;
  return `${prefix} — ${main.label} ${moneyText(main.amount, record.payCurrency)}`;
};

const GENERIC_REASON: Record<PayrollMomMetricKey, string> = {
  grossPay: 'Gross pay changed',
  deductions: 'Deduction mix changed',
  netPay: 'Net pay changed',
  employerCost: 'Employer cost changed',
  employees: 'Retained across both periods',
};

const contributorReason = (
  key: PayrollMomMetricKey,
  current: MomAggRecord | undefined,
  previous: MomAggRecord | undefined,
) => {
  if (current && !previous) return arrivalReason('new', current, key);
  if (!current && previous) return arrivalReason('left', previous, key);
  if (!current || !previous) return 'No comparable record';
  if (key === 'employees') return 'Retained across both periods';
  const currency = current.payCurrency || previous.payCurrency || 'NGN';
  const components = retainedComponents(key, current, previous)
    .filter((component) => Math.abs(component.contribution) >= 0.005)
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution) || a.label.localeCompare(b.label));
  if (!components.length) return GENERIC_REASON[key];
  const phrase = (component: MomComponent) => movementPhrase(component.label, component.ownDelta, currency);
  const [primary, secondary] = components;
  if (secondary && Math.abs(secondary.contribution) >= Math.abs(primary.contribution) * 0.2) {
    return `${phrase(primary)}, and ${phrase(secondary)}`;
  }
  return phrase(primary);
};

const componentBucketId = (key: string) =>
  `retained-${key.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

const driverLabel = (metric: PayrollMomMetricKey, component: MomComponent) => {
  if (metric === 'netPay' && component.key.startsWith('ded:')) return `${component.label} on retained net pay`;
  return `${component.label} on retained staff`;
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
        reason: arrivalReason('new', record, 'employees'),
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
        reason: arrivalReason('left', record, 'employees'),
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

  const bucketMap = new Map<string, PayrollMomDetailBucket>();
  const addBucket = (id: string, label: string, value: number) => {
    const existing = bucketMap.get(id);
    if (!existing) {
      bucketMap.set(id, { id, label, value: roundMoney(value), kind: 'money' });
      return;
    }
    existing.value = roundMoney(existing.value + value);
  };
  addBucket('headcount', 'headcount movement', headcountMovement);
  for (const [current, previous] of retainedPairs) {
    for (const component of retainedComponents(metric.key, current, previous)) {
      if (Math.abs(component.contribution) < 0.005) continue;
      addBucket(componentBucketId(component.key), driverLabel(metric.key, component), component.contribution);
    }
  }
  const buckets = [...bucketMap.values()];

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
  currency?: 'NGN' | 'USD';
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
    currency: input.currency === 'USD' ? 'USD' : 'NGN',
    previous,
    current: input.current,
    metrics,
  };
};

export const payrollMomMetric = (mom: PayrollMonthOverMonth | null | undefined, key: PayrollMomMetricKey) =>
  mom?.available ? mom.metrics.find((item) => item.key === key) || null : null;
