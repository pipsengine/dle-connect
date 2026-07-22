import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { isPermanentPayrollEmployee } from '@/lib/payroll-employee-classification';
import { normalizePayrollPeriod } from '@/lib/payroll-leave-allowance-store';
import {
  removePayrollPeriodEarningAdjustments,
  upsertPayrollPeriodEarningAdjustment,
} from '@/lib/payroll-period-earning-adjustments-store';
import { readPayrollEmployees } from '@/lib/payroll-employee-source';
import { normalizePayrollMatchKey } from '@/lib/sage-people-payroll-store';
import {
  isTimesheetPayrollReadyStatus,
  readTimesheetData,
  type TimesheetHeader,
  type TimesheetLine,
} from '@/lib/timesheet-entry-store';
import { resolveTimesheetShift } from '@/lib/timesheet-entry-shared';

export const NIGHT_INCONVENIENCE_ALLOWANCE_AMOUNT = 1500;
export const NIGHT_ALLOWANCE_CODE = 'NIGHT_ALLOW';
export const NIGHT_ALLOWANCE_NAME = 'NIGHT ALLOWANCE';
export const TIMESHEET_NIGHT_ALLOWANCE_POSTING_SOURCE = 'Timesheet Night Allowance Posting';

const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const compact = (value: unknown) => String(value || '').trim();
const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const employeeKeys = (employee: DleEmployeeDirectoryRow) =>
  [employee.employeeId, employee.employeeCode, employee.fullName, employee.sourceEmployeeId].map(normalizePayrollMatchKey).filter(Boolean);

const lineKeys = (line: TimesheetLine) => [line.employeeId, line.employeeNo, line.employeeName].map(normalizePayrollMatchKey).filter(Boolean);

const headerInPeriod = (header: TimesheetHeader, period: string) => {
  const normalized = normalizePayrollPeriod(period);
  if (!normalized) return false;
  if (header.periodId === `per-${normalized}` || header.periodId === normalized) return true;
  return compact(header.timesheetDate).startsWith(normalized);
};

const lineLooksWorked = (line: TimesheetLine) => {
  if (compact(line.clockIn)) return true;
  return num(line.usedHours) > 0 || num(line.attendanceDuration) > 0 || num(line.totalHours) > 0;
};

/** True when the timesheet header (or biometric clock pattern) is a night shift. */
export const isNightTimesheetHeader = (header?: TimesheetHeader | null, sampleLine?: TimesheetLine | null) => {
  if (header?.shiftLabel && resolveTimesheetShift(header.shiftLabel).kind === 'Night') return true;
  const clockIn = compact(sampleLine?.clockIn);
  if (!clockIn || clockIn === '--:--') return false;
  const [h] = clockIn.split(':').map(Number);
  return Number.isFinite(h) && (h >= 18 || h < 6);
};

export type NightAllowancePostingSummary = {
  period: string;
  posted: number;
  skipped: number;
  employees: number;
  totalAmount: number;
  nights: number;
  lines: Array<{
    employeeCode: string;
    employeeName: string;
    code: string;
    name: string;
    amount: number;
    nights: number;
  }>;
};

/**
 * Auto-post flat ₦1,500 inconvenience allowance per night worked on payroll-ready timesheets.
 * Night work does not generate overtime — only this allowance.
 */
export const postPermanentTimesheetNightAllowanceToPayroll = async (period?: string): Promise<NightAllowancePostingSummary> => {
  const normalizedPeriod = normalizePayrollPeriod(period || '');
  if (!normalizedPeriod) throw new Error('Payroll period is required.');

  const [employeeSource, timesheetData] = await Promise.all([
    readPayrollEmployees(),
    readTimesheetData(),
  ]);
  const employees = employeeSource.employees || [];
  const employeeByKey = new Map<string, DleEmployeeDirectoryRow>();
  for (const employee of employees) {
    for (const key of employeeKeys(employee)) employeeByKey.set(key, employee);
  }

  const headerById = new Map(timesheetData.headers.map((header) => [header.id, header]));
  const buckets = new Map<string, {
    employee: DleEmployeeDirectoryRow;
    nights: number;
    amount: number;
  }>();
  let skipped = 0;

  for (const line of timesheetData.lines) {
    const header = headerById.get(line.headerId);
    if (!header || !headerInPeriod(header, normalizedPeriod)) continue;
    if (!isTimesheetPayrollReadyStatus(header.status)) {
      skipped += 1;
      continue;
    }
    if (!lineLooksWorked(line)) continue;
    if (!isNightTimesheetHeader(header, line)) continue;

    const employee = lineKeys(line).map((key) => employeeByKey.get(key)).find(Boolean);
    if (!employee || !isPermanentPayrollEmployee(employee)) continue;

    const employeeCode = compact(employee.employeeCode || employee.employeeId);
    const bucketKey = normalizePayrollMatchKey(employeeCode);
    const existing = buckets.get(bucketKey);
    if (existing) {
      existing.nights += 1;
      existing.amount = roundMoney(existing.nights * NIGHT_INCONVENIENCE_ALLOWANCE_AMOUNT);
      continue;
    }
    buckets.set(bucketKey, {
      employee,
      nights: 1,
      amount: NIGHT_INCONVENIENCE_ALLOWANCE_AMOUNT,
    });
  }

  await removePayrollPeriodEarningAdjustments({
    period: normalizedPeriod,
    source: TIMESHEET_NIGHT_ALLOWANCE_POSTING_SOURCE,
  });

  const lines: NightAllowancePostingSummary['lines'] = [];
  for (const bucket of buckets.values()) {
    const employeeCode = compact(bucket.employee.employeeCode || bucket.employee.employeeId);
    const identity = bucket.employee.fullName ? `${employeeCode} - ${bucket.employee.fullName}` : employeeCode;
    await upsertPayrollPeriodEarningAdjustment({
      period: normalizedPeriod,
      employeeId: identity,
      employeeCode: identity,
      code: NIGHT_ALLOWANCE_CODE,
      name: NIGHT_ALLOWANCE_NAME,
      amount: bucket.amount,
      taxable: false,
      source: TIMESHEET_NIGHT_ALLOWANCE_POSTING_SOURCE,
    });
    lines.push({
      employeeCode,
      employeeName: compact(bucket.employee.fullName),
      code: NIGHT_ALLOWANCE_CODE,
      name: NIGHT_ALLOWANCE_NAME,
      amount: bucket.amount,
      nights: bucket.nights,
    });
  }

  return {
    period: normalizedPeriod,
    posted: lines.length,
    skipped,
    employees: lines.length,
    totalAmount: roundMoney(lines.reduce((sum, line) => sum + line.amount, 0)),
    nights: lines.reduce((sum, line) => sum + line.nights, 0),
    lines,
  };
};
