/**
 * Authoritative project man-hour and labour-cost calculation.
 * Hours stay on the timesheet allocation that booked them.
 * Money is integer kobo so totals do not drift between the screen and the export.
 */
import { NIGHT_INCONVENIENCE_ALLOWANCE_AMOUNT } from '@/lib/timesheet-entry-shared';

export const LABOUR_REPORT_VERSION = 'labour-cost-report-1';

const LABOUR_TEAM_PATTERNS = [
  /\bfinance\b|\baccounts?\b|\bcfo\b|\btreasury\b/i,
  /\bprojects?\b/i,
  /\bit\b|\bict\b|information technology/i,
  /\bsales\b|business development/i,
  /\bproposals?\b/i,
];

/** Finance, Project, IT, Sales, and Proposal teams, plus the global super administrator. */
export const canViewProjectLabourReport = (input: { globalAdmin?: boolean; roles?: string; department?: string; unit?: string }) => {
  if (input.globalAdmin) return true;
  const text = `${input.roles || ''} ${input.department || ''} ${input.unit || ''}`;
  if (/super\s*admin/i.test(text)) return true;
  return LABOUR_TEAM_PATTERNS.some((pattern) => pattern.test(text));
};
export const NIGHT_ALLOWANCE_KOBO = Math.round(NIGHT_INCONVENIENCE_ALLOWANCE_AMOUNT * 100);

export type DayKind = 'weekday' | 'saturday' | 'sunday' | 'ph';
export type CostMethod = 'hourly' | 'daily' | 'monthly' | 'lumpsum' | 'expatriate';
export type PmState = 'none' | 'pending' | 'partial' | 'approved';
export type ApprovalLabel =
  | 'Draft'
  | 'Submitted'
  | 'Supervisor Approved'
  | 'Cost Control Approved'
  | 'PM Partially Approved'
  | 'PM Approved'
  | 'HR Approved'
  | 'Payroll Ready'
  | 'Payroll Posted'
  | 'Returned';

export type LabourSourceLine = {
  allocationId: string;
  timesheetId: string;
  reference: string;
  periodId: string;
  workDate: string;
  employeeCode: string;
  employeeName: string;
  employeeType: string;
  department: string;
  supervisor: string;
  location: string;
  workCenter: string;
  projectCode: string;
  projectName: string;
  projectManager: string;
  projectManagerCode: string;
  shift: string;
  regularHours: number;
  ovtHours: number;
  nightSession: boolean;
  attendanceStatus: string;
  timesheetStatus: string;
  pmState: PmState;
  activity: string;
  chargeCode: string;
  recordedDayKind?: string;
};

export type LabourRateCard = {
  employeeCode: string;
  method: CostMethod;
  rateVersion: string;
  effectiveFrom: string;
  effectiveTo?: string;
  currency: string;
  amount: number;
  exchangeRate?: number | null;
  exchangeRateVersion?: string;
  workingDays?: number | null;
  standardHours?: number | null;
  multipliers?: Partial<{
    weekdayOvt: number;
    saturday: number;
    saturdayOvt: number;
    sunday: number;
    sundayOvt: number;
    publicHoliday: number;
    publicHolidayOvt: number;
    night: number;
  }>;
  nightAllowance?: number | null;
  offshoreAllowance?: number | null;
};

export type LabourBudget = {
  projectCode: string;
  labourBudgetKobo: number | null;
  plannedHours: number | null;
};

export type LockedLabourSnapshot = {
  allocationId: string;
  regularHours: number;
  ovtHours: number;
  nightSession: boolean;
  regularCostKobo: number | null;
  ovtCostKobo: number | null;
  nightLabourKobo: number | null;
  nightAllowanceKobo: number | null;
  otherAllowanceKobo: number | null;
  totalKobo: number | null;
  rateVersion: string;
  method: string;
};

export type LabourAdjustment = {
  id: string;
  allocationId: string;
  projectCode: string;
  employeeCode: string;
  workDate: string;
  component: string;
  originalKobo: number;
  correctedKobo: number;
  reason: string;
  requestedBy: string;
  approvedBy: string;
  at: string;
};

export type LabourBuildInput = {
  lines: LabourSourceLine[];
  holidays?: string[];
  rates?: LabourRateCard[];
  budgets?: LabourBudget[];
  locked?: LockedLabourSnapshot[];
  adjustments?: LabourAdjustment[];
  capacityHours?: number | null;
  category?: string;
  periodStart?: string;
  periodEnd?: string;
  asOf?: string;
  standardHours?: number;
};

export type ValuedLabourLine = LabourSourceLine & {
  dayKind: DayKind;
  approval: ApprovalLabel;
  provisional: boolean;
  finalized: boolean;
  excluded: boolean;
  weekdayRegular: number;
  weekdayOvt: number;
  saturdayHours: number;
  saturdayOvt: number;
  sundayHours: number;
  sundayOvt: number;
  phHours: number;
  phOvt: number;
  nightHours: number;
  uniqueHours: number;
  nightSessionShare: number;
  method: CostMethod | null;
  rateVersion: string | null;
  appliedRateKobo: number | null;
  currency: string | null;
  exchangeRate: number | null;
  exchangeRateVersion: string | null;
  regularCostKobo: number | null;
  ovtCostKobo: number | null;
  nightLabourKobo: number | null;
  nightAllowanceKobo: number | null;
  otherAllowanceKobo: number | null;
  adjustmentKobo: number;
  totalCostKobo: number | null;
  locked: boolean;
  exceptions: string[];
};

export type ProjectLabourRow = {
  projectCode: string;
  projectName: string;
  projectManager: string;
  employees: number;
  weekdayRegular: number;
  weekdayOvt: number;
  saturdayHours: number;
  saturdayOvt: number;
  sundayHours: number;
  sundayOvt: number;
  phHours: number;
  phOvt: number;
  nightHours: number;
  uniqueHours: number;
  plannedHours: number | null;
  utilization: number | null;
  hourVariance: number | null;
  regularCostKobo: number | null;
  ovtCostKobo: number | null;
  nightLabourKobo: number | null;
  nightAllowanceKobo: number | null;
  otherAllowanceKobo: number | null;
  adjustmentKobo: number;
  approvedCostKobo: number | null;
  provisionalCostKobo: number | null;
  totalCostKobo: number | null;
  labourBudgetKobo: number | null;
  varianceKobo: number | null;
  budgetUtilization: number | null;
  remainingBudgetKobo: number | null;
  forecastKobo: number | null;
  forecastMethod: string;
  status: string;
  costIncomplete: boolean;
};

export type LabourReport = {
  version: string;
  lines: ValuedLabourLine[];
  projects: ProjectLabourRow[];
  overview: {
    totalHours: number;
    approvedHours: number;
    provisionalHours: number;
    regularHours: number;
    overtimeHours: number;
    nightHours: number;
    employees: number;
    projects: number;
    approvedCostKobo: number | null;
    provisionalCostKobo: number | null;
    labourBudgetKobo: number | null;
    budgetVarianceKobo: number | null;
    budgetConfigured: boolean;
    projectUtilization: number | null;
    workforceUtilization: number | null;
    capacityHours: number | null;
    plannedHours: number | null;
    nightSessions: number;
    nightAllowanceKobo: number | null;
    assumptions: string[];
  };
  trend: Array<{ date: string; hours: number; approvedCostKobo: number | null; provisionalCostKobo: number | null }>;
  exceptions: Array<{ code: string; message: string; employeeCode: string; projectCode: string; workDate: string; allocationId: string }>;
  forecastMethod: string;
};

const APPROVED = new Set<ApprovalLabel>(['PM Approved', 'HR Approved', 'Payroll Ready', 'Payroll Posted']);
const FINALIZED = new Set<ApprovalLabel>(['Payroll Ready', 'Payroll Posted']);

const roundHours = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const hoursOf = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? roundHours(number) : 0;
};
const koboOf = (major: number) => Math.round((Number.isFinite(major) ? major : 0) * 100);

export const dayKindForDate = (workDate: string, holidays: Iterable<string>): DayKind => {
  const date = String(workDate || '').slice(0, 10);
  const holidaySet = holidays instanceof Set ? holidays : new Set(holidays);
  if (holidaySet.has(date)) return 'ph';
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return 'weekday';
  const day = parsed.getUTCDay();
  if (day === 0) return 'sunday';
  if (day === 6) return 'saturday';
  return 'weekday';
};

export const approvalLabelFor = (status: string, pmState: PmState = 'none'): ApprovalLabel => {
  const value = String(status || '').trim().toLowerCase();
  if (value === 'returned' || value === 'rejected') return 'Returned';
  if (value === 'payroll posted') return 'Payroll Posted';
  if (value === 'payroll ready') return 'Payroll Ready';
  if (value === 'payroll readiness') return 'HR Approved';
  if (value === 'hr' || value === 'consolidation') return 'PM Approved';
  if (value === 'project manager') {
    if (pmState === 'partial') return 'PM Partially Approved';
    if (pmState === 'approved') return 'PM Approved';
    return 'Cost Control Approved';
  }
  if (value === 'cost control') return 'Supervisor Approved';
  if (value === 'submitted' || value === 'supervisor') return 'Submitted';
  return 'Draft';
};

/** Mobilization without booked hours is not labour. */
export const mobilizationCreatesLabour = (hours: number) => hoursOf(hours) > 0;

export const allocateKobo = (total: number, weights: number[]) => {
  const clean = Math.round(Number.isFinite(total) ? total : 0);
  if (!weights.length || clean === 0) return weights.map(() => 0);
  const sum = weights.reduce((totalWeight, weight) => totalWeight + (weight > 0 ? weight : 0), 0);
  if (sum <= 0) return weights.map(() => 0);
  const exact = weights.map((weight) => (weight > 0 ? (clean * weight) / sum : 0));
  const floors = exact.map((value) => Math.trunc(value));
  let remainder = clean - floors.reduce((totalKobo, value) => totalKobo + value, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - floors[index] }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  let cursor = 0;
  while (remainder !== 0 && order.length) {
    const step = remainder > 0 ? 1 : -1;
    floors[order[cursor % order.length].index] += step;
    remainder -= step;
    cursor += 1;
  }
  return floors;
};

const weekdayCount = (start: string, end: string, holidays: Set<string>) => {
  if (!start || !end || start > end) return 0;
  let count = 0;
  const cursor = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  while (cursor.getTime() <= last.getTime() && count < 400) {
    const iso = cursor.toISOString().slice(0, 10);
    if (dayKindForDate(iso, holidays) === 'weekday') count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
};

const rateHourlyKobo = (rate: LabourRateCard | undefined, issues: string[]) => {
  if (!rate) {
    issues.push('Missing Cost Rate');
    return null;
  }
  const amount = Number(rate.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    issues.push('Missing Cost Rate');
    return null;
  }
  const currency = String(rate.currency || 'NGN').trim().toUpperCase() || 'NGN';
  if (currency !== 'NGN') {
    const exchange = Number(rate.exchangeRate);
    if (!Number.isFinite(exchange) || exchange <= 0) {
      issues.push('Currency Conversion Issues');
      return null;
    }
    return Math.round(amount * exchange * 100);
  }
  return koboOf(amount);
};

const multiplierFor = (rate: LabourRateCard | undefined, key: keyof NonNullable<LabourRateCard['multipliers']>, issues: string[]) => {
  const value = rate?.multipliers?.[key];
  if (value == null || !Number.isFinite(Number(value)) || Number(value) < 0) {
    issues.push('Missing Cost Rate');
    return null;
  }
  return Number(value);
};

const blankMoney = () => ({
  regularCostKobo: 0,
  ovtCostKobo: 0,
  nightLabourKobo: 0,
  nightAllowanceKobo: 0,
  otherAllowanceKobo: 0,
});

const sumMoney = (rows: Array<Partial<ReturnType<typeof blankMoney>> | null>) => rows.reduce<ReturnType<typeof blankMoney>>((total, row) => {
  total.regularCostKobo += row?.regularCostKobo || 0;
  total.ovtCostKobo += row?.ovtCostKobo || 0;
  total.nightLabourKobo += row?.nightLabourKobo || 0;
  total.nightAllowanceKobo += row?.nightAllowanceKobo || 0;
  total.otherAllowanceKobo += row?.otherAllowanceKobo || 0;
  return total;
}, blankMoney());

const moneyTotal = (row: ReturnType<typeof blankMoney> | null) => {
  if (!row) return null;
  return row.regularCostKobo + row.ovtCostKobo + row.nightLabourKobo + row.nightAllowanceKobo + row.otherAllowanceKobo;
};

export const buildLabourReport = (input: LabourBuildInput): LabourReport => {
  const holidays = new Set((input.holidays || []).map((date) => String(date).slice(0, 10)));
  const standardHours = input.standardHours && input.standardHours > 0 ? input.standardHours : 8;
  const rates = input.rates || [];
  const locked = new Map((input.locked || []).map((row) => [row.allocationId, row]));
  const budgets = new Map((input.budgets || []).map((row) => [row.projectCode.toUpperCase(), row]));
  const adjustments = input.adjustments || [];
  const seenKeys = new Map<string, number>();

  const prepared = (input.lines || []).map((line) => {
    const workDate = String(line.workDate || '').slice(0, 10);
    const projectCode = String(line.projectCode || '').trim().toUpperCase();
    const nightShift = String(line.shift || '').trim().toLowerCase() === 'night';
    const regular = hoursOf(line.regularHours);
    const ovt = hoursOf(line.ovtHours);
    const unique = roundHours(regular + ovt);
    const kind = dayKindForDate(workDate, holidays);
    const approval = approvalLabelFor(line.timesheetStatus, line.pmState);
    const excluded = approval === 'Returned' || /approved leave/i.test(line.attendanceStatus) && kind !== 'weekday';
    const exceptions: string[] = [];
    const key = [line.timesheetId, line.employeeCode, workDate, projectCode, String(line.shift || '').toLowerCase(), line.allocationId].join('|');
    const duplicateKey = [line.timesheetId, line.employeeCode, workDate, projectCode, String(line.shift || '').toLowerCase()].join('|');
    seenKeys.set(duplicateKey, (seenKeys.get(duplicateKey) || 0) + 1);
    if (!projectCode) exceptions.push('Missing Project/Cost Centre');
    if (line.recordedDayKind) {
      const recorded = /public/i.test(line.recordedDayKind) ? 'ph' : line.recordedDayKind.toLowerCase();
      if ((recorded === 'ph' && kind !== 'ph') || (kind === 'ph' && recorded !== 'ph' && recorded !== 'public holiday')) {
        exceptions.push('Incorrect PH Classification');
      }
    }
    if (ovt > 12) exceptions.push('Invalid OVT');
    const valued: ValuedLabourLine = {
      ...line,
      projectCode,
      workDate,
      dayKind: kind,
      approval,
      provisional: !excluded && !APPROVED.has(approval),
      finalized: FINALIZED.has(approval),
      excluded,
      weekdayRegular: !nightShift && kind === 'weekday' ? regular : 0,
      weekdayOvt: !nightShift && kind === 'weekday' ? ovt : 0,
      saturdayHours: !nightShift && kind === 'saturday' ? regular : 0,
      saturdayOvt: !nightShift && kind === 'saturday' ? ovt : 0,
      sundayHours: !nightShift && kind === 'sunday' ? regular : 0,
      sundayOvt: !nightShift && kind === 'sunday' ? ovt : 0,
      phHours: !nightShift && kind === 'ph' ? regular : 0,
      phOvt: !nightShift && kind === 'ph' ? ovt : 0,
      nightHours: nightShift ? unique : 0,
      uniqueHours: unique,
      nightSessionShare: 0,
      method: null,
      rateVersion: null,
      appliedRateKobo: null,
      currency: null,
      exchangeRate: null,
      exchangeRateVersion: null,
      regularCostKobo: null,
      ovtCostKobo: null,
      nightLabourKobo: null,
      nightAllowanceKobo: null,
      otherAllowanceKobo: null,
      adjustmentKobo: 0,
      totalCostKobo: null,
      locked: false,
      exceptions,
    };
    void key;
    return { valued, nightShift, regular, ovt, duplicateKey };
  });

  for (const row of prepared) {
    if ((seenKeys.get(row.duplicateKey) || 0) > 1) row.valued.exceptions.push('Duplicate Allocation Lines');
  }

  const byDay = new Map<string, typeof prepared>();
  for (const row of prepared) {
    if (row.valued.excluded || row.valued.uniqueHours <= 0 && !row.valued.nightSession) continue;
    const key = `${row.valued.employeeCode}|${row.valued.workDate}`;
    const list = byDay.get(key) || [];
    list.push(row);
    byDay.set(key, list);
  }

  const dayHours = new Map<string, number>();
  for (const [key, rows] of byDay) {
    dayHours.set(key, roundHours(rows.reduce((total, row) => total + row.valued.uniqueHours, 0)));
    if ((dayHours.get(key) || 0) > 16) {
      for (const row of rows) row.valued.exceptions.push('Hours Exceeding Authorized Capacity');
    }
  }

  const rateFor = (employeeCode: string, workDate: string) => rates.find((rate) => {
    if (rate.employeeCode.toUpperCase() !== employeeCode.toUpperCase()) return false;
    const from = String(rate.effectiveFrom || '').slice(0, 10);
    const to = String(rate.effectiveTo || '').slice(0, 10);
    return (!from || from <= workDate) && (!to || to >= workDate);
  });

  for (const [key, rows] of byDay) {
    const sample = rows[0].valued;
    const rate = rateFor(sample.employeeCode, sample.workDate);
    const issues: string[] = [];
    const hourly = rate ? rateHourlyKobo(rate, issues) : null;
    if (!rate) issues.push('Missing Cost Rate');
    const nightAllowanceMajor = rate?.nightAllowance == null ? NIGHT_INCONVENIENCE_ALLOWANCE_AMOUNT : Number(rate.nightAllowance);
    const nightAllowanceKobo = Number.isFinite(nightAllowanceMajor) && nightAllowanceMajor >= 0 ? koboOf(nightAllowanceMajor) : NIGHT_ALLOWANCE_KOBO;
    const weights = rows.map((row) => row.valued.uniqueHours);
    const hasNight = rows.some((row) => row.valued.nightSession || row.nightShift && row.valued.uniqueHours > 0);
    const allowanceShares = hasNight ? allocateKobo(nightAllowanceKobo, weights.some((weight) => weight > 0) ? weights : rows.map(() => 1)) : rows.map(() => 0);
    if (hasNight && weights.every((weight) => weight <= 0)) {
      for (const row of rows) row.valued.exceptions.push('Night Allowance Eligibility Conflicts');
    }

    let offshoreShares = rows.map(() => 0);
    if (rate && rate.offshoreAllowance != null && Number(rate.offshoreAllowance) > 0 && /offshore|sea|platform|fpso|rig/i.test(sample.location)) {
      offshoreShares = allocateKobo(koboOf(Number(rate.offshoreAllowance)), weights.some((weight) => weight > 0) ? weights : rows.map(() => 1));
    }

    if (rate?.method === 'daily') {
      const daily = hourly;
      const shares = daily == null ? rows.map(() => null) : allocateKobo(daily, weights);
      rows.forEach((row, index) => {
        const share = shares[index];
        applyRateMeta(row.valued, rate, hourly);
        if (share == null) {
          row.valued.exceptions.push(...issues);
          return;
        }
        const unique = row.valued.uniqueHours || 1;
        const regPart = Math.round(share * (row.regular / unique));
        const ovtPart = share - regPart;
        if (row.nightShift) {
          row.valued.nightLabourKobo = row.ovt > 0 ? regPart : share;
          row.valued.ovtCostKobo = row.ovt > 0 ? ovtPart : 0;
          row.valued.regularCostKobo = 0;
        } else {
          row.valued.regularCostKobo = regPart;
          row.valued.ovtCostKobo = ovtPart;
          row.valued.nightLabourKobo = 0;
        }
      });
    } else if (rate?.method === 'lumpsum') {
      for (const row of rows) applyRateMeta(row.valued, rate, null);
    } else if (rate?.method === 'monthly') {
      const workingDays = Number(rate.workingDays);
      if (!workingDays || workingDays <= 0) {
        for (const row of rows) {
          applyRateMeta(row.valued, rate, null);
          row.valued.exceptions.push('Missing Cost Rate');
        }
      } else if (hourly == null) {
        for (const row of rows) {
          applyRateMeta(row.valued, rate, null);
          row.valued.exceptions.push(...issues);
        }
      } else {
        const derived = Math.round(hourly / (workingDays * (rate.standardHours || standardHours)));
        for (const row of rows) {
          applyRateMeta(row.valued, rate, derived);
          priceHourly(row, rate, derived, issues);
        }
      }
    } else {
      for (const row of rows) {
        if (rate) applyRateMeta(row.valued, rate, hourly);
        if (hourly == null || !rate) {
          row.valued.exceptions.push(...(issues.length ? issues : ['Missing Cost Rate']));
          continue;
        }
        priceHourly(row, rate, hourly, []);
      }
    }

    rows.forEach((row, index) => {
      row.valued.nightAllowanceKobo = (row.valued.nightAllowanceKobo || 0) + allowanceShares[index];
      row.valued.nightSessionShare = hasNight ? roundHours(allowanceShares[index] / Math.max(1, nightAllowanceKobo)) : 0;
      row.valued.otherAllowanceKobo = (row.valued.otherAllowanceKobo || 0) + offshoreShares[index];
      if (row.valued.provisional) row.valued.exceptions.push('Unapproved Timesheets');
    });
  }

  const lumpsumEmployees = new Map<string, typeof prepared>();
  for (const row of prepared) {
    if (row.valued.excluded || row.valued.method !== 'lumpsum') continue;
    const list = lumpsumEmployees.get(row.valued.employeeCode) || [];
    list.push(row);
    lumpsumEmployees.set(row.valued.employeeCode, list);
  }
  for (const rows of lumpsumEmployees.values()) {
    const rate = rateFor(rows[0].valued.employeeCode, rows[0].valued.workDate);
    const issues: string[] = [];
    const amount = rate ? rateHourlyKobo(rate, issues) : null;
    if (amount == null) {
      for (const row of rows) row.valued.exceptions.push(...(issues.length ? issues : ['Missing Cost Rate']));
      continue;
    }
    const shares = allocateKobo(amount, rows.map((row) => row.valued.uniqueHours));
    rows.forEach((row, index) => {
      const share = shares[index];
      const unique = row.valued.uniqueHours || 1;
      const regPart = Math.round(share * (row.regular / unique));
      if (row.nightShift) {
        row.valued.nightLabourKobo = row.ovt > 0 ? regPart : share;
        row.valued.ovtCostKobo = row.ovt > 0 ? share - regPart : 0;
        row.valued.regularCostKobo = 0;
      } else {
        row.valued.regularCostKobo = regPart;
        row.valued.ovtCostKobo = share - regPart;
      }
      row.valued.exceptions.push('Lumpsum amount is allocated by chargeable hours in this report window');
    });
  }

  for (const row of prepared) {
    const snapshot = locked.get(row.valued.allocationId);
    if (!snapshot || !row.valued.finalized) continue;
    row.valued.locked = true;
    row.valued.rateVersion = snapshot.rateVersion || row.valued.rateVersion;
    row.valued.method = (snapshot.method as CostMethod) || row.valued.method;
    row.valued.regularCostKobo = snapshot.regularCostKobo;
    row.valued.ovtCostKobo = snapshot.ovtCostKobo;
    row.valued.nightLabourKobo = snapshot.nightLabourKobo;
    row.valued.nightAllowanceKobo = snapshot.nightAllowanceKobo;
    row.valued.otherAllowanceKobo = snapshot.otherAllowanceKobo;
    if (roundHours(snapshot.regularHours) !== hoursOf(row.valued.regularHours) || roundHours(snapshot.ovtHours) !== hoursOf(row.valued.ovtHours)) {
      row.valued.exceptions.push('Historical Rate Mismatch');
    }
  }

  for (const adjustment of adjustments) {
    const row = prepared.find((item) => item.valued.allocationId === adjustment.allocationId);
    if (!row) continue;
    row.valued.adjustmentKobo += Math.round(adjustment.correctedKobo - adjustment.originalKobo);
  }

  for (const row of prepared) {
    if (row.valued.excluded) continue;
    const parts = [row.valued.regularCostKobo, row.valued.ovtCostKobo, row.valued.nightLabourKobo, row.valued.nightAllowanceKobo, row.valued.otherAllowanceKobo];
    if (parts.some((part) => part == null)) row.valued.totalCostKobo = null;
    else row.valued.totalCostKobo = parts.reduce<number>((total, part) => total + (part || 0), 0) + row.valued.adjustmentKobo;
  }

  const active = prepared
    .filter((row) => !row.valued.excluded)
    .map((row) => maskCategory(row.valued, input.category))
    .filter((row) => row.uniqueHours > 0 || (row.totalCostKobo || 0) !== 0 || row.nightSessionShare > 0);
  const projects = aggregateProjects(active, budgets, holidays, input);
  const overview = aggregateOverview(active, projects, input.capacityHours ?? null);
  const trend = aggregateTrend(active);
  const exceptions = active.flatMap((line) => [...new Set(line.exceptions)].map((message) => ({
    code: message,
    message,
    employeeCode: line.employeeCode,
    projectCode: line.projectCode,
    workDate: line.workDate,
    allocationId: line.allocationId,
  })));
  if (projects.some((project) => project.labourBudgetKobo == null)) {
    exceptions.push({ code: 'Missing Project Budget', message: 'Missing Project Budget', employeeCode: '', projectCode: '', workDate: '', allocationId: '' });
  }

  return {
    version: LABOUR_REPORT_VERSION,
    lines: active,
    projects,
    overview,
    trend,
    exceptions,
    forecastMethod: projects.find((project) => project.forecastMethod)?.forecastMethod || 'Not available',
  };
};

const maskCategory = (line: ValuedLabourLine, category?: string): ValuedLabourLine => {
  const selected = String(category || '').trim().toLowerCase();
  if (!selected || selected === 'all') return line;
  const next: ValuedLabourLine = {
    ...line,
    weekdayRegular: 0,
    weekdayOvt: 0,
    saturdayHours: 0,
    saturdayOvt: 0,
    sundayHours: 0,
    sundayOvt: 0,
    phHours: 0,
    phOvt: 0,
    nightHours: 0,
    uniqueHours: 0,
    regularCostKobo: 0,
    ovtCostKobo: 0,
    nightLabourKobo: 0,
    nightAllowanceKobo: 0,
    otherAllowanceKobo: 0,
    adjustmentKobo: 0,
    totalCostKobo: 0,
  };
  const keep = (hours: number, cost: number | null) => {
    next.uniqueHours = roundHours(hours);
    next.totalCostKobo = cost;
  };
  if (selected === 'regular') {
    next.weekdayRegular = line.weekdayRegular;
    next.regularCostKobo = line.dayKind === 'weekday' && line.nightHours <= 0 ? line.regularCostKobo : 0;
    keep(line.weekdayRegular, next.regularCostKobo);
  } else if (selected === 'overtime') {
    next.weekdayOvt = line.weekdayOvt;
    next.saturdayOvt = line.saturdayOvt;
    next.sundayOvt = line.sundayOvt;
    next.phOvt = line.phOvt;
    next.ovtCostKobo = line.ovtCostKobo;
    keep(roundHours(line.weekdayOvt + line.saturdayOvt + line.sundayOvt + line.phOvt), line.ovtCostKobo);
  } else if (selected === 'saturday') {
    next.saturdayHours = line.saturdayHours;
    next.saturdayOvt = line.saturdayOvt;
    next.regularCostKobo = line.dayKind === 'saturday' ? line.regularCostKobo : 0;
    next.ovtCostKobo = line.dayKind === 'saturday' ? line.ovtCostKobo : 0;
    keep(roundHours(line.saturdayHours + line.saturdayOvt), (next.regularCostKobo || 0) + (next.ovtCostKobo || 0));
  } else if (selected === 'sunday') {
    next.sundayHours = line.sundayHours;
    next.sundayOvt = line.sundayOvt;
    next.regularCostKobo = line.dayKind === 'sunday' ? line.regularCostKobo : 0;
    next.ovtCostKobo = line.dayKind === 'sunday' ? line.ovtCostKobo : 0;
    keep(roundHours(line.sundayHours + line.sundayOvt), (next.regularCostKobo || 0) + (next.ovtCostKobo || 0));
  } else if (selected === 'public holiday' || selected === 'ph') {
    next.phHours = line.phHours;
    next.phOvt = line.phOvt;
    next.regularCostKobo = line.dayKind === 'ph' ? line.regularCostKobo : 0;
    next.ovtCostKobo = line.dayKind === 'ph' ? line.ovtCostKobo : 0;
    keep(roundHours(line.phHours + line.phOvt), (next.regularCostKobo || 0) + (next.ovtCostKobo || 0));
  } else if (selected === 'night work') {
    next.nightHours = line.nightHours;
    next.nightLabourKobo = line.nightLabourKobo;
    keep(line.nightHours, line.nightLabourKobo);
  } else if (selected === 'night allowance') {
    next.nightAllowanceKobo = line.nightAllowanceKobo;
    next.nightSessionShare = line.nightSessionShare;
    keep(line.nightSessionShare > 0 ? 0 : 0, line.nightAllowanceKobo);
    next.uniqueHours = 0;
  } else if (selected === 'other allowances') {
    next.otherAllowanceKobo = line.otherAllowanceKobo;
    keep(0, line.otherAllowanceKobo);
  }
  return next;
};

const applyRateMeta = (line: ValuedLabourLine, rate: LabourRateCard, applied: number | null) => {
  line.method = rate.method;
  line.rateVersion = rate.rateVersion;
  line.appliedRateKobo = applied;
  line.currency = String(rate.currency || 'NGN').toUpperCase();
  line.exchangeRate = rate.exchangeRate == null ? null : Number(rate.exchangeRate);
  line.exchangeRateVersion = rate.exchangeRateVersion || null;
};

const priceHourly = (
  row: { valued: ValuedLabourLine; nightShift: boolean; regular: number; ovt: number },
  rate: LabourRateCard,
  hourlyKobo: number,
  issues: string[],
) => {
  const kind = row.valued.dayKind;
  const price = (hours: number, key: keyof NonNullable<LabourRateCard['multipliers']> | 'base') => {
    if (hours <= 0) return 0;
    if (key === 'base') return Math.round(hours * hourlyKobo);
    const multiplier = multiplierFor(rate, key, issues);
    if (multiplier == null) return null;
    return Math.round(hours * hourlyKobo * multiplier);
  };
  if (row.nightShift) {
    const regularKey = rate.multipliers?.night == null ? (kind === 'weekday' ? 'base' : calendarMultiplierKey(kind, false)) : 'night';
    const ovtKey = rate.multipliers?.night == null ? calendarMultiplierKey(kind, true) : 'night';
    const regularCost = price(row.regular, regularKey);
    const ovtCost = price(row.ovt, ovtKey);
    row.valued.nightLabourKobo = regularCost;
    row.valued.ovtCostKobo = ovtCost;
    row.valued.regularCostKobo = 0;
  } else if (kind === 'weekday') {
    row.valued.regularCostKobo = price(row.regular, 'base');
    row.valued.ovtCostKobo = price(row.ovt, 'weekdayOvt');
    row.valued.nightLabourKobo = 0;
  } else if (kind === 'saturday') {
    row.valued.regularCostKobo = price(row.regular, 'saturday');
    row.valued.ovtCostKobo = price(row.ovt, 'saturdayOvt');
  } else if (kind === 'sunday') {
    row.valued.regularCostKobo = price(row.regular, 'sunday');
    row.valued.ovtCostKobo = price(row.ovt, 'sundayOvt');
  } else {
    row.valued.regularCostKobo = price(row.regular, 'publicHoliday');
    row.valued.ovtCostKobo = price(row.ovt, 'publicHolidayOvt');
  }
  if (issues.length) row.valued.exceptions.push(...issues);
};

const calendarMultiplierKey = (kind: DayKind, ovt: boolean): keyof NonNullable<LabourRateCard['multipliers']> => {
  if (kind === 'saturday') return ovt ? 'saturdayOvt' : 'saturday';
  if (kind === 'sunday') return ovt ? 'sundayOvt' : 'sunday';
  if (kind === 'ph') return ovt ? 'publicHolidayOvt' : 'publicHoliday';
  return ovt ? 'weekdayOvt' : 'weekdayOvt';
};

const aggregateProjects = (
  lines: ValuedLabourLine[],
  budgets: Map<string, LabourBudget>,
  holidays: Set<string>,
  input: LabourBuildInput,
): ProjectLabourRow[] => {
  const grouped = new Map<string, ValuedLabourLine[]>();
  for (const line of lines) {
    const key = line.projectCode || '(missing)';
    const list = grouped.get(key) || [];
    list.push(line);
    grouped.set(key, list);
  }
  const elapsed = forecastFactor(input.periodStart, input.periodEnd, input.asOf, holidays);
  return [...grouped.entries()].map(([projectCode, rows]) => {
    const budget = budgets.get(projectCode);
    const people = new Set(rows.map((row) => row.employeeCode));
    const hours = sumHours(rows);
    const approvedRows = rows.filter((row) => !row.provisional);
    const provisionalRows = rows.filter((row) => row.provisional);
    const approved = sumCosts(approvedRows);
    const provisional = sumCosts(provisionalRows);
    const incomplete = rows.some((row) => row.totalCostKobo == null);
    const planned = budget ? budget.plannedHours : null;
    const labourBudget = budget ? budget.labourBudgetKobo : null;
    const utilization = planned != null && planned > 0 ? roundHours((hours.uniqueHours / planned) * 100) : null;
    const approvedCost = approved.known ? approved.total : null;
    const provisionalCost = provisional.known ? provisional.total : null;
    const budgetUtilization = labourBudget != null && labourBudget > 0 && approvedCost != null ? roundHours((approvedCost / labourBudget) * 100) : null;
    let forecast: number | null = null;
    let forecastMethod = 'Not available — no elapsed share of the reporting window';
    if (approvedCost != null && elapsed.factor != null && elapsed.factor > 0) {
      forecast = Math.round(approvedCost / elapsed.factor);
      forecastMethod = elapsed.method;
    }
    let status = 'Within plan';
    if (labourBudget == null) status = 'Budget Not Configured';
    else if (approvedCost == null) status = 'Cost Incomplete';
    else if (approvedCost > labourBudget) status = 'Over Budget';
    else if (labourBudget > 0 && approvedCost >= labourBudget * 0.8) status = 'Approaching Budget';
    return {
      projectCode,
      projectName: rows.find((row) => row.projectName)?.projectName || projectCode,
      projectManager: rows.find((row) => row.projectManager)?.projectManager || '',
      employees: people.size,
      ...hours,
      plannedHours: planned,
      utilization,
      hourVariance: planned == null ? null : roundHours(hours.uniqueHours - planned),
      regularCostKobo: approved.regular,
      ovtCostKobo: approved.ovt,
      nightLabourKobo: approved.nightLabour,
      nightAllowanceKobo: approved.nightAllowance,
      otherAllowanceKobo: approved.other,
      adjustmentKobo: rows.reduce((total, row) => total + row.adjustmentKobo, 0),
      approvedCostKobo: approvedCost,
      provisionalCostKobo: provisionalCost,
      totalCostKobo: approvedCost,
      labourBudgetKobo: labourBudget,
      varianceKobo: labourBudget == null || approvedCost == null ? null : labourBudget - approvedCost,
      budgetUtilization,
      remainingBudgetKobo: labourBudget == null || approvedCost == null ? null : labourBudget - approvedCost,
      forecastKobo: forecast,
      forecastMethod,
      status,
      costIncomplete: incomplete,
    };
  }).sort((left, right) => right.uniqueHours - left.uniqueHours || left.projectCode.localeCompare(right.projectCode));
};

const sumHours = (rows: ValuedLabourLine[]) => ({
  weekdayRegular: roundHours(rows.reduce((total, row) => total + row.weekdayRegular, 0)),
  weekdayOvt: roundHours(rows.reduce((total, row) => total + row.weekdayOvt, 0)),
  saturdayHours: roundHours(rows.reduce((total, row) => total + row.saturdayHours, 0)),
  saturdayOvt: roundHours(rows.reduce((total, row) => total + row.saturdayOvt, 0)),
  sundayHours: roundHours(rows.reduce((total, row) => total + row.sundayHours, 0)),
  sundayOvt: roundHours(rows.reduce((total, row) => total + row.sundayOvt, 0)),
  phHours: roundHours(rows.reduce((total, row) => total + row.phHours, 0)),
  phOvt: roundHours(rows.reduce((total, row) => total + row.phOvt, 0)),
  nightHours: roundHours(rows.reduce((total, row) => total + row.nightHours, 0)),
  uniqueHours: roundHours(rows.reduce((total, row) => total + row.uniqueHours, 0)),
});

const sumCosts = (rows: ValuedLabourLine[]) => {
  const known = rows.length === 0 || rows.every((row) => row.totalCostKobo != null);
  const pick = (value: number | null) => value || 0;
  return {
    known,
    regular: rows.reduce((total, row) => total + pick(row.regularCostKobo), 0),
    ovt: rows.reduce((total, row) => total + pick(row.ovtCostKobo), 0),
    nightLabour: rows.reduce((total, row) => total + pick(row.nightLabourKobo), 0),
    nightAllowance: rows.reduce((total, row) => total + pick(row.nightAllowanceKobo), 0),
    other: rows.reduce((total, row) => total + pick(row.otherAllowanceKobo), 0),
    total: rows.reduce((total, row) => total + pick(row.totalCostKobo), 0),
  };
};

const aggregateOverview = (lines: ValuedLabourLine[], projects: ProjectLabourRow[], capacityHours: number | null) => {
  const hours = sumHours(lines);
  const approvedLines = lines.filter((line) => !line.provisional);
  const provisionalLines = lines.filter((line) => line.provisional);
  const approved = sumCosts(approvedLines);
  const provisional = sumCosts(provisionalLines);
  const planned = projects.every((project) => project.plannedHours == null)
    ? null
    : roundHours(projects.reduce((total, project) => total + (project.plannedHours || 0), 0));
  const budgets = projects.filter((project) => project.labourBudgetKobo != null);
  const labourBudget = budgets.length ? budgets.reduce((total, project) => total + (project.labourBudgetKobo || 0), 0) : null;
  const approvedCost = approved.known ? approved.total : null;
  const nightSessions = new Set(lines.filter((line) => line.nightSessionShare > 0).map((line) => `${line.employeeCode}|${line.workDate}`)).size;
  return {
    totalHours: hours.uniqueHours,
    approvedHours: roundHours(approvedLines.reduce((total, line) => total + line.uniqueHours, 0)),
    provisionalHours: roundHours(provisionalLines.reduce((total, line) => total + line.uniqueHours, 0)),
    regularHours: hours.weekdayRegular,
    overtimeHours: roundHours(hours.weekdayOvt + hours.saturdayOvt + hours.sundayOvt + hours.phOvt),
    nightHours: hours.nightHours,
    employees: new Set(lines.map((line) => line.employeeCode)).size,
    projects: projects.length,
    approvedCostKobo: approvedCost,
    provisionalCostKobo: provisional.known ? provisional.total : null,
    labourBudgetKobo: labourBudget,
    budgetVarianceKobo: labourBudget == null || approvedCost == null ? null : labourBudget - approvedCost,
    budgetConfigured: labourBudget != null,
    projectUtilization: planned != null && planned > 0 ? roundHours((hours.uniqueHours / planned) * 100) : null,
    workforceUtilization: capacityHours != null && capacityHours > 0 ? roundHours((hours.uniqueHours / capacityHours) * 100) : null,
    capacityHours,
    plannedHours: planned,
    nightSessions,
    nightAllowanceKobo: approved.nightAllowance + provisional.nightAllowance,
    assumptions: [
      'Total labour cost is approved actual cost only. Pending timesheets stay in the provisional figure.',
      'Saturday, Sunday, and public-holiday hours stay in their own columns and are not counted again as weekday hours.',
      'A night session adds the configured allowance once. It does not add those hours again.',
      'Daily-rate and lumpsum amounts are split across the projects worked that day by chargeable hours.',
      capacityHours == null ? 'Workforce capacity is not available for this selection.' : 'Workforce capacity is active employees in the selection multiplied by weekdays in the window and the standard day.',
    ],
  };
};

const aggregateTrend = (lines: ValuedLabourLine[]) => {
  const dates = new Map<string, ValuedLabourLine[]>();
  for (const line of lines) {
    const list = dates.get(line.workDate) || [];
    list.push(line);
    dates.set(line.workDate, list);
  }
  return [...dates.entries()].sort((left, right) => left[0].localeCompare(right[0])).map(([date, rows]) => {
    const approved = sumCosts(rows.filter((row) => !row.provisional));
    const provisional = sumCosts(rows.filter((row) => row.provisional));
    return {
      date,
      hours: roundHours(rows.reduce((total, row) => total + row.uniqueHours, 0)),
      approvedCostKobo: approved.known ? approved.total : null,
      provisionalCostKobo: provisional.known ? provisional.total : null,
    };
  });
};

const forecastFactor = (start?: string, end?: string, asOf?: string, holidays?: Set<string>) => {
  if (!start || !end || start > end) return { factor: null as number | null, method: 'Not available — reporting window is not bounded' };
  const today = (asOf || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const elapsedEnd = today < start ? '' : today < end ? today : end;
  if (!elapsedEnd) return { factor: null, method: 'Not available — the reporting window has not started' };
  const total = Math.max(1, weekdayCount(start, end, holidays || new Set()));
  const elapsed = weekdayCount(start, elapsedEnd, holidays || new Set());
  if (elapsed <= 0) return { factor: null, method: 'Not available — no elapsed weekdays' };
  const factor = Math.min(1, elapsed / total);
  const method = factor >= 1
    ? 'Period complete — forecast at completion equals approved actual cost'
    : `Straight-line forecast using ${elapsed} of ${total} weekdays elapsed. Assumes the same daily approved cost continues.`;
  return { factor, method };
};

export const reportCostTotals = (report: LabourReport) => {
  const projectApproved = report.projects.reduce((total, project) => total + (project.approvedCostKobo || 0), 0);
  const lineApproved = report.lines.filter((line) => !line.provisional && line.totalCostKobo != null).reduce((total, line) => total + (line.totalCostKobo || 0), 0);
  return { projectApproved, lineApproved, overview: report.overview.approvedCostKobo };
};
