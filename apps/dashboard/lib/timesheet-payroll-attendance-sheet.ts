import { calculateContractDayRateEarnings } from '@/lib/payroll-earnings-engine';
import { NIGHT_INCONVENIENCE_ALLOWANCE_AMOUNT } from '@/lib/timesheet-entry-shared';
import { resolveTimesheetShift, timesheetDayRulesForDate } from '@/lib/timesheet-entry-shared';
import { canonicalTimesheetEmployeeKey, normalizePaidWorkHours } from '@/lib/timesheet-entry-store';

export const PAYROLL_ATTENDANCE_SHEET_COLUMNS = [
  'Emp. Code',
  'First Name',
  'Last Name',
  'Job Title',
  'Location',
  'WEEK DAYS WORKED',
  'WKD TOT',
  'PAID LEAVE (DAYS)',
  'L TOT',
  'TOTAL SATURDAY (HRS)',
  'S TOT',
  'TOTAL SUNDAY (HRS)',
  'SN TOT',
  'TOTAL PUBLIC HOLIDAY (HRS)',
  'PH TOT',
  'TOTAL OVERTIME WEEKDAY (HRS)',
  'OVT TOT',
  'NIGHT WORKED (DAYS)',
  'NW TOT',
  'SITE ALLOWANCE (DAYS)',
  'SA TOT',
  'TOTAL NUMBER OF DAYS WORKED',
] as const;

export type PayrollAttendanceSheetRow = {
  empCode: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  location: string;
  weekDaysWorked: number;
  weekDayTotal: number;
  paidLeaveDays: number;
  paidLeaveTotal: number;
  saturdayHours: number;
  saturdayTotal: number;
  sundayHours: number;
  sundayTotal: number;
  publicHolidayHours: number;
  publicHolidayTotal: number;
  weekdayOvertimeHours: number;
  weekdayOvertimeTotal: number;
  nightWorkedDays: number;
  nightWorkedTotal: number;
  siteAllowanceDays: number;
  siteAllowanceTotal: number;
  totalDaysWorked: number;
};

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
  if (clean(row.projectCode).toUpperCase() === 'LEAVE') return true;
  const remarks = clean(row.lineRemarks).toLowerCase();
  if (remarks.includes('approved paid leave') || remarks.includes('paid leave')) return true;
  return clean(row.idleReasons).toLowerCase().includes('leave');
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
    const workedHours = Math.max(
      normalizePaidWorkHours(Number(row.attendanceHours || 0)),
      normalizePaidWorkHours(Number(row.totalHours || 0)),
      normalizePaidWorkHours(Number(row.usedHours || row.productiveHours || 0)),
    );
    const productiveHours = normalizePaidWorkHours(Number(row.usedHours || row.productiveHours || 0));
    const payable = row.dayWorked === 1
      || paidLeave
      || workedHours > 0
      || productiveHours > 0
      || Boolean(clean(row.lineRemarks));

    // Sunday is never a payable day count, but Sunday hours still roll into Sunday totals.
    if (payable && dayRules.kind !== 'Sunday') {
      current.payableDates.add(date);
    }

    if (paidLeave && dayRules.kind !== 'Sunday') {
      current.paidLeaveDates.add(date);
    } else if (night && payable && dayRules.kind !== 'Sunday') {
      current.nightDates.add(date);
    } else if (payable && dayRules.kind === 'Weekday') {
      current.weekDayDates.add(date);
      const overtimeHours = Math.max(0, round2(productiveHours - dayRules.standardProductiveHours));
      current.weekdayOvertimeHours = round2(current.weekdayOvertimeHours + overtimeHours);
    }

    if (dayRules.kind === 'Saturday' && workedHours > 0) {
      current.saturdayHours = round2(current.saturdayHours + workedHours);
    } else if (dayRules.kind === 'Sunday' && workedHours > 0) {
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
      const weekDaysWorked = bucket.weekDayDates.size;
      const paidLeaveDays = bucket.paidLeaveDates.size;
      const nightWorkedDays = bucket.nightDates.size;
      const siteAllowanceDays = bucket.siteDates.size;
      const totalDaysWorked = bucket.payableDates.size;
      const earnings = calculateContractDayRateEarnings({
        ratePerDay: bucket.ratePerDay,
        weekdayDays: weekDaysWorked,
        weekdayOvertimeHours: bucket.weekdayOvertimeHours,
        saturdayHours: bucket.saturdayHours,
        sundayHours: bucket.sundayHours,
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
        saturdayHours: bucket.saturdayHours,
        saturdayTotal,
        sundayHours: bucket.sundayHours,
        sundayTotal,
        publicHolidayHours: bucket.publicHolidayHours,
        publicHolidayTotal,
        weekdayOvertimeHours: bucket.weekdayOvertimeHours,
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

export const payrollAttendanceSheetToExcelRows = (rows: PayrollAttendanceSheetRow[], canViewCosts = true): (string | number)[][] =>
  rows.map((row) => [
    row.empCode,
    row.firstName,
    row.lastName,
    row.jobTitle,
    row.location,
    row.weekDaysWorked,
    canViewCosts ? row.weekDayTotal : 'Restricted',
    row.paidLeaveDays,
    canViewCosts ? row.paidLeaveTotal : 'Restricted',
    row.saturdayHours,
    canViewCosts ? row.saturdayTotal : 'Restricted',
    row.sundayHours,
    canViewCosts ? row.sundayTotal : 'Restricted',
    row.publicHolidayHours,
    canViewCosts ? row.publicHolidayTotal : 'Restricted',
    row.weekdayOvertimeHours,
    canViewCosts ? row.weekdayOvertimeTotal : 'Restricted',
    row.nightWorkedDays,
    canViewCosts ? row.nightWorkedTotal : 'Restricted',
    row.siteAllowanceDays,
    canViewCosts ? row.siteAllowanceTotal : 'Restricted',
    row.totalDaysWorked,
  ]);
