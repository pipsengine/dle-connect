import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import {
  calculatePayrollOvertime,
  JUNIOR_OVERTIME_RULES,
  resolvePayrollEarningProfile,
  type OvertimeDayType,
} from '@/lib/payroll-earnings-engine';
import { isPermanentPayrollEmployee } from '@/lib/payroll-employee-classification';
import { normalizePayrollPeriod } from '@/lib/payroll-leave-allowance-store';
import {
  removePayrollPeriodEarningAdjustments,
  TIMESHEET_OT_POSTING_SOURCE,
  upsertPayrollPeriodEarningAdjustment,
} from '@/lib/payroll-period-earning-adjustments-store';
import { readPayrollEmployees } from '@/lib/payroll-employee-source';
import { normalizePayrollMatchKey } from '@/lib/sage-people-payroll-store';
import {
  isTimesheetPayrollReadyStatus,
  normalizePaidWorkHours,
  readTimesheetData,
  type TimesheetHeader,
  type TimesheetLine,
} from '@/lib/timesheet-entry-store';
import { timesheetDayRulesForDate, resolveTimesheetShift } from '@/lib/timesheet-entry-shared';
import { isNightTimesheetHeader, postPermanentTimesheetNightAllowanceToPayroll } from '@/lib/payroll-timesheet-night-allowance-posting';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const round2 = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const compact = (value: unknown) => String(value || '').trim();

const resolveDashboardRoot = () => {
  const cwd = process.cwd();
  const dashboardSuffix = path.join('apps', 'dashboard');
  return cwd.endsWith(dashboardSuffix) ? cwd : path.join(cwd, dashboardSuffix);
};

const HOLIDAY_PATH = path.join(resolveDashboardRoot(), 'data', 'hris', 'payroll-public-holidays.json');

const readHolidayDates = async (): Promise<string[]> => {
  try {
    const raw = await readFile(HOLIDAY_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.dates)) return parsed.dates.map(String).filter(Boolean);
  } catch {
    return [];
  }
  return [];
};

const dayTypeFor = (date: string, holidays: Set<string>): OvertimeDayType => {
  if (holidays.has(date)) return 'Public Holiday';
  const day = new Date(`${date}T00:00:00`).getDay();
  if (day === 6) return 'Saturday';
  if (day === 0) return 'Sunday';
  return 'Weekday';
};

const employeeKeys = (employee: DleEmployeeDirectoryRow) =>
  [employee.employeeId, employee.employeeCode, employee.fullName, employee.sourceEmployeeId].map(normalizePayrollMatchKey).filter(Boolean);

const lineKeys = (line: TimesheetLine) => [line.employeeId, line.employeeNo, line.employeeName].map(normalizePayrollMatchKey).filter(Boolean);

const permanentOvertimeCode = (employee: DleEmployeeDirectoryRow, dayType: OvertimeDayType) => {
  const profileId = resolvePayrollEarningProfile(employee);
  const rule = JUNIOR_OVERTIME_RULES[dayType];
  if (profileId === 'junior-permanent') return { code: rule.code, name: rule.name, taxable: rule.taxable };
  if (dayType === 'Weekday' || dayType === 'Night') return { code: dayType === 'Night' ? 'NIGHT_OVT' : 'WKDAY_OVT', name: dayType === 'Night' ? 'NIGHT OVERTIME' : 'WEEKDAY OVERTIME', taxable: true };
  return { code: rule.code, name: rule.name, taxable: rule.taxable };
};

const headerInPeriod = (header: TimesheetHeader, period: string) => {
  const normalized = normalizePayrollPeriod(period);
  if (!normalized) return false;
  if (header.periodId === `per-${normalized}` || header.periodId === normalized) return true;
  return compact(header.timesheetDate).startsWith(normalized);
};

export type TimesheetOtPostingSummary = {
  period: string;
  posted: number;
  skipped: number;
  employees: number;
  totalAmount: number;
  lines: Array<{
    employeeCode: string;
    employeeName: string;
    code: string;
    name: string;
    amount: number;
    hours: number;
  }>;
};

/**
 * Aggregate approved permanent-staff OT/weekend hours from payroll-ready timesheets
 * and upsert supplemental earning adjustments for the payroll period.
 */
export const postPermanentTimesheetOvertimeToPayroll = async (period?: string): Promise<TimesheetOtPostingSummary> => {
  const normalizedPeriod = normalizePayrollPeriod(period || '');
  if (!normalizedPeriod) throw new Error('Payroll period is required.');

  const [employeeSource, timesheetData, holidayDates] = await Promise.all([
    readPayrollEmployees(),
    readTimesheetData(),
    readHolidayDates(),
  ]);
  const employees = employeeSource.employees || [];
  const employeeByKey = new Map<string, DleEmployeeDirectoryRow>();
  for (const employee of employees) {
    for (const key of employeeKeys(employee)) employeeByKey.set(key, employee);
  }

  const headerById = new Map(timesheetData.headers.map((header) => [header.id, header]));
  const holidays = new Set(holidayDates);
  const buckets = new Map<string, {
    employee: DleEmployeeDirectoryRow;
    code: string;
    name: string;
    taxable: boolean;
    amount: number;
    hours: number;
  }>();
  let skipped = 0;

  for (const line of timesheetData.lines) {
    const header = headerById.get(line.headerId);
    if (!header || !headerInPeriod(header, normalizedPeriod)) continue;
    if (!isTimesheetPayrollReadyStatus(header.status)) {
      skipped += 1;
      continue;
    }
    // Night work is normal 8h + flat inconvenience allowance only — never post OT.
    if (isNightTimesheetHeader(header, line) || resolveTimesheetShift(header.shiftLabel).kind === 'Night') {
      skipped += 1;
      continue;
    }

    const employee = lineKeys(line).map((key) => employeeByKey.get(key)).find(Boolean);
    if (!employee || !isPermanentPayrollEmployee(employee)) continue;

    const date = header.timesheetDate;
    const dayType = dayTypeFor(date, holidays);
    const dayRules = timesheetDayRulesForDate(date, holidayDates);
    const hoursPerDay = dayRules.standardProductiveHours;
    const workedHours = Math.max(
      normalizePaidWorkHours(num(line.attendanceDuration)),
      normalizePaidWorkHours(num(line.totalHours)),
      normalizePaidWorkHours(num(line.usedHours) + num(line.idleHours)),
    );
    const productiveHours = normalizePaidWorkHours(num(line.usedHours));
    const overtimeHours = Math.max(0, round2(productiveHours - hoursPerDay));
    const payableHours = dayType === 'Weekday' || dayType === 'Night' ? overtimeHours : workedHours;
    if (payableHours <= 0) continue;

    const overtime = calculatePayrollOvertime(employee, dayType, payableHours);
    const amount = roundMoney(overtime.amount);
    if (amount <= 0) continue;

    const codeMeta = permanentOvertimeCode(employee, dayType);
    const employeeCode = compact(employee.employeeCode || employee.employeeId);
    const bucketKey = `${normalizePayrollMatchKey(employeeCode)}|${codeMeta.code}`;
    const existing = buckets.get(bucketKey);
    if (existing) {
      existing.amount = roundMoney(existing.amount + amount);
      existing.hours = round2(existing.hours + payableHours);
      continue;
    }
    buckets.set(bucketKey, {
      employee,
      code: codeMeta.code,
      name: codeMeta.name,
      taxable: codeMeta.taxable,
      amount,
      hours: payableHours,
    });
  }

  await removePayrollPeriodEarningAdjustments({ period: normalizedPeriod, source: TIMESHEET_OT_POSTING_SOURCE });

  const lines: TimesheetOtPostingSummary['lines'] = [];
  for (const bucket of buckets.values()) {
    const employeeCode = compact(bucket.employee.employeeCode || bucket.employee.employeeId);
    const identity = bucket.employee.fullName ? `${employeeCode} - ${bucket.employee.fullName}` : employeeCode;
    await upsertPayrollPeriodEarningAdjustment({
      period: normalizedPeriod,
      employeeId: identity,
      employeeCode: identity,
      code: bucket.code,
      name: bucket.name,
      amount: bucket.amount,
      taxable: bucket.taxable,
      source: TIMESHEET_OT_POSTING_SOURCE,
    });
    lines.push({
      employeeCode,
      employeeName: compact(bucket.employee.fullName),
      code: bucket.code,
      name: bucket.name,
      amount: bucket.amount,
      hours: bucket.hours,
    });
  }

  return {
    period: normalizedPeriod,
    posted: lines.length,
    skipped,
    employees: new Set(lines.map((line) => line.employeeCode)).size,
    totalAmount: roundMoney(lines.reduce((sum, line) => sum + line.amount, 0)),
    lines: lines.sort((a, b) => `${a.employeeCode}-${a.code}`.localeCompare(`${b.employeeCode}-${b.code}`)),
  };
};

/** Post day OT (excluding night) and night inconvenience allowance for a payroll period. */
export const postPermanentTimesheetEarningsFromTimesheets = async (period?: string) => {
  const [overtime, nightAllowance] = await Promise.all([
    postPermanentTimesheetOvertimeToPayroll(period),
    postPermanentTimesheetNightAllowanceToPayroll(period),
  ]);
  return { overtime, nightAllowance };
};
