import { calculateContractDayRateEarnings } from '@/lib/payroll-earnings-engine';
import { NIGHT_INCONVENIENCE_ALLOWANCE_AMOUNT } from '@/lib/timesheet-entry-shared';
import { hasBiometricClockIn, isTimesheetPaidLeaveLine, resolveTimesheetShift, timesheetDayRulesForDate } from '@/lib/timesheet-entry-shared';
import { canonicalTimesheetEmployeeKey, lookupPayrollTimesheetHours, type PayrollTimesheetHoursEntry } from '@/lib/timesheet-entry-store';
import { bookedTimesheetHours } from '@/lib/timesheet-report-metrics';
import {
  type PayrollAttendanceSheetRow,
} from '@/lib/timesheet-payroll-attendance-sheet-shared';

export {
  PAYROLL_ATTENDANCE_SHEET_COLUMNS,
  payrollAttendanceSheetToExcelRows,
  type PayrollAttendanceSheetRow,
} from '@/lib/timesheet-payroll-attendance-sheet-shared';

type AttendanceSourceRow = {
  lineId: string;
  timesheetDate: string;
  employeeId?: string;
  employeeNo: string;
  employeeName: string;
  jobTitle: string;
  location: string;
  shiftLabel?: string;
  projectCode: string;
  projectSite?: string;
  lineRemarks?: string;
  idleReasons?: string;
  attendanceHours: number;
  usedHours?: number;
  productiveHours: number;
  totalHours: number;
  dayWorked?: number;
  labourRateNgn?: number;
  clockIn?: string | null;
};

type EmployeeLookup = {
  employeeCode?: string | null;
  employeeId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  jobTitle?: string | null;
  location?: string | null;
  ratePerDay?: number | null;
  dailyRate?: number | null;
  ratePerHour?: number | null;
};

const round2 = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const clean = (value: unknown) => String(value || '').trim();

const splitName = (fullName: string, firstName?: string | null, lastName?: string | null) => {
  if (clean(firstName) || clean(lastName)) {
    return { firstName: clean(firstName) || clean(fullName), lastName: clean(lastName) };
  }
  const parts = clean(fullName).split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] || '', lastName: '' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
};

const isPaidLeaveRow = (row: AttendanceSourceRow) => {
  if (hasBiometricClockIn(row.clockIn)) return false;
  return isTimesheetPaidLeaveLine({
    remarks: row.lineRemarks,
    projectAllocations: [{ projectCode: row.projectCode, hours: Number(row.productiveHours || row.usedHours || 0) }],
  });
};

const codeAliases = (code: string) => {
  const raw = clean(code).toUpperCase().replace(/_/g, '');
  if (!raw) return [];
  return [...new Set([
    raw,
    raw.replace(/^P(?=\d)/, ''),
    raw.replace(/^(IT|NYSC|L|C)(?=\d)/, ''),
  ].filter(Boolean))];
};

const isSiteEligibleLocation = (location: string, projectSite?: string) => {
  const value = `${location} ${projectSite || ''}`.toLowerCase();
  if (!clean(value)) return true;
  if (/\b(hq|head office|headquarters|corporate|admin office)\b/.test(value)) return false;
  return true;
};

const resolveDayRate = (employee: EmployeeLookup | undefined, labourRateNgn?: number) => {
  const explicitDay = Number(employee?.ratePerDay || employee?.dailyRate || 0);
  if (explicitDay > 0) return explicitDay;
  const hourly = Number(employee?.ratePerHour || labourRateNgn || 0);
  if (hourly > 0) return hourly * 8;
  return 0;
};

type EmployeeBucket = {
  empCode: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  location: string;
  ratePerDay: number;
  weekDayDates: Set<string>;
  paidLeaveDates: Set<string>;
  nightDates: Set<string>;
  siteDates: Set<string>;
  payableDates: Set<string>;
  saturdayDates: Set<string>;
  sundayDates: Set<string>;
  saturdayHours: number;
  sundayHours: number;
  publicHolidayHours: number;
  weekdayOvertimeHours: number;
};

export const buildPayrollAttendanceSheet = (input: {
  rows: AttendanceSourceRow[];
  employeesByKey?: Map<string, EmployeeLookup>;
  holidayDates?: string[];
  canViewCosts?: boolean;
  payrollHoursByKey?: Map<string, PayrollTimesheetHoursEntry>;
}): PayrollAttendanceSheetRow[] => {
  const holidays = input.holidayDates || [];
  const holidaySet = new Set(holidays);
  const canViewCosts = input.canViewCosts !== false;
  const buckets = new Map<string, EmployeeBucket>();
  const seenLines = new Set<string>();

  for (const row of input.rows) {
    if (seenLines.has(row.lineId)) continue;
    seenLines.add(row.lineId);

    const employeeKey = canonicalTimesheetEmployeeKey({
      employeeId: row.employeeId || row.employeeNo,
      employeeNo: row.employeeNo,
      employeeName: row.employeeName,
    });
    const employee = input.employeesByKey?.get(employeeKey)
      || input.employeesByKey?.get(clean(row.employeeNo).toLowerCase())
      || input.employeesByKey?.get(clean(row.employeeId).toLowerCase());
    const names = splitName(row.employeeName, employee?.firstName, employee?.lastName);
    const ratePerDay = resolveDayRate(employee, row.labourRateNgn);
    const current = buckets.get(employeeKey) || {
      empCode: clean(employee?.employeeCode || row.employeeNo || row.employeeId),
      firstName: names.firstName,
      lastName: names.lastName,
      jobTitle: clean(employee?.jobTitle || row.jobTitle) || 'Unassigned',
      location: clean(employee?.location || row.location) || 'Unassigned',
      ratePerDay,
      weekDayDates: new Set<string>(),
      paidLeaveDates: new Set<string>(),
      nightDates: new Set<string>(),
      siteDates: new Set<string>(),
      payableDates: new Set<string>(),
      saturdayDates: new Set<string>(),
      sundayDates: new Set<string>(),
      saturdayHours: 0,
      sundayHours: 0,
      publicHolidayHours: 0,
      weekdayOvertimeHours: 0,
    };
    if (ratePerDay > current.ratePerDay) current.ratePerDay = ratePerDay;

    const date = clean(row.timesheetDate).slice(0, 10);
    if (!date) {
      buckets.set(employeeKey, current);
      continue;
    }

    const dayRules = timesheetDayRulesForDate(date, holidays);
    const night = resolveTimesheetShift(row.shiftLabel).kind === 'Night';
    const paidLeave = isPaidLeaveRow(row);
    // Prefer line-level usedHours / attendance when present. Do not re-deduct the unpaid break from booked hours.
    const attendanceHours = bookedTimesheetHours(Number(row.attendanceHours || 0));
    const usedHours = bookedTimesheetHours(Number(row.usedHours || 0));
    const productiveHours = usedHours > 0
      ? usedHours
      : bookedTimesheetHours(Number(row.productiveHours || 0));
    const workedHours = Math.max(
      attendanceHours,
      bookedTimesheetHours(Number(row.totalHours || 0)),
      productiveHours,
    );
    const payable = row.dayWorked === 1
      || paidLeave
      || (dayRules.kind !== 'Sunday' && workedHours > 0);

    // One calendar date per employee. Extra project lines must not add extra days or hours.
    if (current.payableDates.has(date) || current.sundayDates.has(date)) {
      buckets.set(employeeKey, current);
      continue;
    }

    if (payable && dayRules.kind !== 'Sunday') {
      current.payableDates.add(date);
    }

    if (paidLeave && dayRules.kind === 'Weekday') {
      current.paidLeaveDates.add(date);
      current.weekDayDates.add(date);
    } else if (payable && dayRules.kind === 'Weekday') {
      current.weekDayDates.add(date);
      const overtimeHours = Math.max(0, round2(productiveHours - dayRules.standardProductiveHours));
      current.weekdayOvertimeHours = round2(current.weekdayOvertimeHours + overtimeHours);
    }

    if (night && payable && dayRules.kind !== 'Sunday') {
      current.nightDates.add(date);
    }

    if (dayRules.kind === 'Saturday' && payable) {
      current.saturdayDates.add(date);
      current.saturdayHours = round2(current.saturdayHours + (workedHours > 0 ? workedHours : 8));
    } else if (dayRules.kind === 'Sunday' && workedHours > 0) {
      current.sundayDates.add(date);
      current.sundayHours = round2(current.sundayHours + workedHours);
    } else if (dayRules.kind === 'PublicHoliday' && workedHours > 0) {
      current.publicHolidayHours = round2(current.publicHolidayHours + workedHours);
    } else if (holidaySet.has(date) && workedHours > 0) {
      current.publicHolidayHours = round2(current.publicHolidayHours + workedHours);
    }

    if (payable && !paidLeave && dayRules.kind !== 'Sunday' && isSiteEligibleLocation(current.location, row.projectSite)) {
      current.siteDates.add(date);
    }

    buckets.set(employeeKey, current);
  }

  return Array.from(buckets.values())
    .map((bucket) => {
      const payrollHours = lookupPayrollTimesheetHours(
        input.payrollHoursByKey,
        bucket.empCode,
        ...codeAliases(bucket.empCode),
      );
      const weekDaysWorked = payrollHours?.weekdayDays != null ? Number(payrollHours.weekdayDays) : bucket.weekDayDates.size;
      const paidLeaveDays = bucket.paidLeaveDates.size;
      const saturdayDaysWorked = payrollHours?.saturdayDays != null ? Number(payrollHours.saturdayDays) : bucket.saturdayDates.size;
      const sundayDaysWorked = payrollHours?.sundayDays != null ? Number(payrollHours.sundayDays) : bucket.sundayDates.size;
      const nightWorkedDays = bucket.nightDates.size;
      const siteAllowanceDays = bucket.siteDates.size;
      const saturdayHours = payrollHours?.saturdayHours != null ? Number(payrollHours.saturdayHours) : bucket.saturdayHours;
      const sundayHours = payrollHours?.sundayHours != null ? Number(payrollHours.sundayHours) : bucket.sundayHours;
      const weekdayOvertimeHours = payrollHours?.weekdayOvertimeHours != null ? Number(payrollHours.weekdayOvertimeHours) : bucket.weekdayOvertimeHours;
      const totalDaysWorked = weekDaysWorked + saturdayDaysWorked + sundayDaysWorked;
      const earnings = calculateContractDayRateEarnings({
        ratePerDay: bucket.ratePerDay,
        weekdayDays: weekDaysWorked,
        weekdayOvertimeHours,
        saturdayHours,
        sundayHours,
        publicHolidayHours: bucket.publicHolidayHours,
      });
      const amountFor = (...codes: string[]) =>
        roundMoney(
          earnings.earningLines
            .filter((line) => codes.includes(line.code))
            .reduce((sum, line) => sum + Number(line.amount || 0), 0),
        );
      const weekDayTotal = canViewCosts ? amountFor('JCWEEKDAY', 'JCWEEKDAY_NT') || roundMoney(weekDaysWorked * bucket.ratePerDay) : 0;
      const paidLeaveTotal = canViewCosts ? roundMoney(paidLeaveDays * bucket.ratePerDay) : 0;
      const saturdayTotal = canViewCosts ? amountFor('SATEARN') : 0;
      const sundayTotal = canViewCosts ? amountFor('SUNDAYEARN') : 0;
      const publicHolidayTotal = canViewCosts ? amountFor('PUBHOL') : 0;
      const weekdayOvertimeTotal = canViewCosts ? amountFor('WEEKDAYOVT') : 0;
      const nightWorkedTotal = canViewCosts ? roundMoney(nightWorkedDays * NIGHT_INCONVENIENCE_ALLOWANCE_AMOUNT) : 0;
      // Site allowance rate is not standardized in timesheets; leave amount at 0 unless rate exists later.
      const siteAllowanceTotal = 0;

      return {
        empCode: bucket.empCode,
        firstName: bucket.firstName,
        lastName: bucket.lastName,
        jobTitle: bucket.jobTitle,
        location: bucket.location,
        weekDaysWorked,
        weekDayTotal,
        paidLeaveDays,
        paidLeaveTotal,
        saturdayDaysWorked,
        saturdayHours,
        saturdayTotal,
        sundayDaysWorked,
        sundayHours,
        sundayTotal,
        publicHolidayHours: bucket.publicHolidayHours,
        publicHolidayTotal,
        weekdayOvertimeHours,
        weekdayOvertimeTotal,
        nightWorkedDays,
        nightWorkedTotal,
        siteAllowanceDays,
        siteAllowanceTotal,
        totalDaysWorked,
      };
    })
    .sort((a, b) => a.empCode.localeCompare(b.empCode) || a.lastName.localeCompare(b.lastName));
};