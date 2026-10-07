/**
 * From the October 2026 payroll period, C-code pay days and hours come from
 * Timesheet Management bookings. Earlier periods stay on the HRIS timesheet register.
 * Project man-hours read the same bookings as soon as they are saved.
 */
import sql from 'mssql';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';
import { getPayrollPublicHolidayDates } from '@/lib/nigeria-public-holidays';
import { payrollPeriodSortKey } from '@/lib/payroll-source-of-truth';
import { normalizePayrollMatchKey } from '@/lib/sage-people-payroll-store';
import {
  OFFSHORE_ALLOWANCE_HOURS,
  STANDARD_TIMESHEET_HOURS,
  canonicalProjectCode,
  isIdleTimeProjectCode,
  isOffshoreTimesheetContext,
  timesheetDayRulesForDate,
} from '@/lib/timesheet-entry-shared';

export const PORTAL_CCODE_PAYROLL_FROM = '2026-10';

const round1 = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 10) / 10;
const compact = (value: unknown) => String(value || '').trim();
const isContractCode = (value: unknown) => /^C\d/i.test(compact(value));

type PortalPayrollHours = {
  daysWorked: number;
  bookedHours: number;
  weekdayOvertimeHours?: number;
  weekdayDays?: number;
  saturdayDays?: number;
  sundayDays?: number;
  saturdayHours?: number;
  sundayHours?: number;
  publicHolidayHours?: number;
  nightDays?: number;
  nightHours?: number;
  employeeNo?: string;
  employeeName?: string;
};

export const portalCCodePayrollFeedApplies = (period?: string | null) => {
  const key = payrollPeriodSortKey(period);
  if (!key) return false;
  return key >= payrollPeriodSortKey(PORTAL_CCODE_PAYROLL_FROM);
};

/** Payroll period 2026-10 is 16 September 2026 through 15 October 2026. */
export const payrollPeriodDateBounds = (period: string) => {
  const token = compact(period).replace(/^per-/i, '').slice(0, 7);
  const match = /^(\d{4})-(\d{2})$/.exec(token);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!year || month < 1 || month > 12) return null;
  const startMonth = month === 1 ? 12 : month - 1;
  const startYear = month === 1 ? year - 1 : year;
  return {
    start: `${startYear}-${String(startMonth).padStart(2, '0')}-16`,
    end: `${token}-15`,
  };
};

export type PortalBookingDay = {
  employeeCode: string;
  employeeName: string;
  workDate: string;
  regularHours: number;
  ovtHours: number;
  nightHours: number;
  locationName: string;
};

export type PortalProjectHourRow = {
  workDate: string;
  headerId: string;
  lineId: string;
  employeeCode: string;
  employeeName: string;
  projectCode: string;
  projectName: string;
  hours: number;
  activity: string;
  idle: boolean;
};

const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const dateOnly = (value: unknown) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = compact(value);
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(text);
  return match ? match[1] : '';
};

/** One payable calendar day per C-code. Weekday, weekend, holiday, and night follow the existing day-rate split. */
export const aggregatePortalBookingsForPayroll = (
  rows: PortalBookingDay[],
  holidayDates: string[] = [],
) => {
  const mapped = new Map<string, PortalPayrollHours>();
  const seenDay = new Set<string>();
  const ordered = [...rows].sort((left, right) => left.workDate.localeCompare(right.workDate) || left.employeeCode.localeCompare(right.employeeCode));
  for (const row of ordered) {
    const code = compact(row.employeeCode).toUpperCase();
    if (!isContractCode(code)) continue;
    const workDate = dateOnly(row.workDate);
    if (!workDate) continue;
    const regular = Math.max(0, num(row.regularHours));
    const ovt = Math.max(0, num(row.ovtHours));
    const night = num(row.nightHours) > 0;
    const booked = round1(regular + ovt);
    if (booked <= 0 && !night) continue;
    const current = mapped.get(code) || {
      daysWorked: 0,
      weekdayDays: 0,
      saturdayDays: 0,
      sundayDays: 0,
      saturdayHours: 0,
      sundayHours: 0,
      publicHolidayHours: 0,
      nightDays: 0,
      nightHours: 0,
      bookedHours: 0,
      weekdayOvertimeHours: 0,
      employeeNo: code,
      employeeName: compact(row.employeeName),
    };
    if (!current.employeeName && row.employeeName) current.employeeName = compact(row.employeeName);
    const dayKey = `${code}::${workDate}`;
    const first = !seenDay.has(dayKey);
    if (first) seenDay.add(dayKey);
    const kind = timesheetDayRulesForDate(workDate, holidayDates).kind;
    const payable = booked > 0;
    if (first && payable && kind === 'PublicHoliday') {
      current.publicHolidayHours = round1((current.publicHolidayHours || 0) + booked);
    } else if (first && payable && kind === 'Saturday') {
      current.saturdayDays = (current.saturdayDays || 0) + 1;
      current.saturdayHours = round1((current.saturdayHours || 0) + booked);
      current.daysWorked += 1;
    } else if (first && payable && kind === 'Sunday') {
      current.sundayDays = (current.sundayDays || 0) + 1;
      current.sundayHours = round1((current.sundayHours || 0) + booked);
    } else if (first && payable && kind === 'Weekday') {
      current.weekdayDays = (current.weekdayDays || 0) + 1;
      current.daysWorked += 1;
    }
    if (kind === 'Weekday' && payable) {
      let overtime = round1(Math.max(0, regular + ovt - STANDARD_TIMESHEET_HOURS));
      if (overtime <= 0.001 && regular > 0 && isOffshoreTimesheetContext(row.locationName, '')) overtime = OFFSHORE_ALLOWANCE_HOURS;
      current.weekdayOvertimeHours = round1((current.weekdayOvertimeHours || 0) + overtime);
    }
    current.bookedHours = round1(current.bookedHours + booked);
    if (night && first) {
      current.nightDays = (current.nightDays || 0) + 1;
      current.nightHours = round1((current.nightHours || 0) + Math.max(booked, 8));
    }
    mapped.set(code, current);
  }
  return mapped;
};

export const loadPortalBookingsForPayrollPeriod = async (period: string) => {
  if (!portalCCodePayrollFeedApplies(period)) return new Map<string, PortalPayrollHours>();
  const bounds = payrollPeriodDateBounds(period);
  if (!bounds) return new Map<string, PortalPayrollHours>();
  const pool = await getDleEnterpriseDbPool();
  if (!pool) return new Map<string, PortalPayrollHours>();
  const holidayDates = await getPayrollPublicHolidayDates().catch(() => [] as string[]);
  const result = await pool.request()
    .input('Start', sql.Date, bounds.start)
    .input('End', sql.Date, bounds.end)
    .query(`
      SELECT [EmployeeCode], [EmployeeName], [WorkDate], [RegularHours], [OvtHours], [NightHours], [LocationName]
      FROM [tsmgmt].[Bookings]
      WHERE [EmployeeCode] LIKE N'C[0-9]%'
        AND [WorkDate] >= @Start AND [WorkDate] <= @End
        AND (ISNULL([RegularHours], 0) > 0 OR ISNULL([OvtHours], 0) > 0 OR ISNULL([NightHours], 0) > 0)
    `);
  const rows: PortalBookingDay[] = (result.recordset || []).map((row) => ({
    employeeCode: compact(row.EmployeeCode),
    employeeName: compact(row.EmployeeName),
    workDate: dateOnly(row.WorkDate),
    regularHours: num(row.RegularHours),
    ovtHours: num(row.OvtHours),
    nightHours: num(row.NightHours),
    locationName: compact(row.LocationName),
  }));
  return aggregatePortalBookingsForPayroll(rows, holidayDates);
};

export const replaceContractHoursWithPortalFeed = (
  map: Map<string, PortalPayrollHours>,
  portal: Map<string, PortalPayrollHours>,
) => {
  for (const [key, data] of [...map.entries()]) {
    if (isContractCode(key) || isContractCode(data?.employeeNo)) map.delete(key);
  }
  for (const entry of portal.values()) {
    const keys = [entry.employeeNo, entry.employeeName, normalizePayrollMatchKey(entry.employeeNo), normalizePayrollMatchKey(entry.employeeName)]
      .map((value) => compact(value))
      .filter(Boolean);
    keys.forEach((key) => map.set(key, entry));
  }
  return map;
};

export const loadPortalProjectHours = async (): Promise<PortalProjectHourRow[]> => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) return [];
  const result = await pool.request().query(`
    SELECT t.[Id] AS HeaderId, t.[WorkDate], l.[Id] AS LineId, l.[EmployeeCode], l.[EmployeeName],
      a.[ProjectCode], a.[ProjectName], a.[RegularHours], a.[OvtHours], a.[Activity]
    FROM [tsmgmt].[TimesheetAllocations] a
    INNER JOIN [tsmgmt].[TimesheetEntryLines] l ON l.[Id] = a.[LineId]
    INNER JOIN [tsmgmt].[Timesheets] t ON t.[Id] = l.[TimesheetId]
    WHERE ISNULL(a.[RegularHours], 0) > 0 OR ISNULL(a.[OvtHours], 0) > 0
  `);
  return (result.recordset || []).map((row) => {
    const projectCode = canonicalProjectCode(row.ProjectCode);
    const hours = round1(num(row.RegularHours) + num(row.OvtHours));
    return {
      workDate: dateOnly(row.WorkDate),
      headerId: compact(row.HeaderId),
      lineId: compact(row.LineId),
      employeeCode: compact(row.EmployeeCode),
      employeeName: compact(row.EmployeeName),
      projectCode,
      projectName: compact(row.ProjectName),
      hours,
      activity: compact(row.Activity) || 'General',
      idle: isIdleTimeProjectCode(projectCode),
    };
  }).filter((row) => row.projectCode && row.hours > 0 && row.workDate);
};
