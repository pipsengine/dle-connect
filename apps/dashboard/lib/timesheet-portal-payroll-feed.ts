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
import { clearWeekendLeaveHours } from '@/lib/timesheet-entry-workspace';
import {
  OFFSHORE_ALLOWANCE_HOURS,
  STANDARD_TIMESHEET_HOURS,
  canonicalProjectCode,
  employeeTreatsCalendarDaysAsWorkedDays,
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
  paidLeaveDays?: number;
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
  paidLeave?: boolean;
};

export type ApprovedLeaveSpan = {
  employeeCode: string;
  employeeName?: string;
  startDate: string;
  endDate: string;
};

/** Weekday leave inside the payroll window. Weekends and public holidays are not payable leave days. */
export const approvedLeaveBookingDays = (
  spans: ApprovedLeaveSpan[],
  bounds: { start: string; end: string },
  holidayDates: string[] = [],
) => {
  const days: Array<{ employeeCode: string; employeeName: string; workDate: string }> = [];
  for (const span of spans) {
    const code = compact(span.employeeCode).toUpperCase();
    if (!isContractCode(code)) continue;
    const start = dateOnly(span.startDate);
    const end = dateOnly(span.endDate);
    const from = start > bounds.start ? start : bounds.start;
    const to = end < bounds.end ? end : bounds.end;
    if (!from || !to || to < from) continue;
    for (let cursor = new Date(`${from}T00:00:00.000Z`); cursor <= new Date(`${to}T00:00:00.000Z`); cursor = new Date(cursor.getTime() + 86400000)) {
      const workDate = cursor.toISOString().slice(0, 10);
      if (timesheetDayRulesForDate(workDate, holidayDates).kind !== 'Weekday') continue;
      days.push({ employeeCode: code, employeeName: compact(span.employeeName), workDate });
    }
  }
  return days;
};

/**
 * Approved leave that was never saved as booking hours still counts.
 * A date that already has hours is marked as leave and is not added again.
 */
export const mergeUnbookedApprovedLeave = (
  rows: PortalBookingDay[],
  leaveDays: Array<{ employeeCode: string; employeeName?: string; workDate: string }>,
) => {
  const next = rows.map((row) => ({ ...row }));
  const indexByDay = new Map<string, number>();
  next.forEach((row, index) => {
    const code = compact(row.employeeCode).toUpperCase();
    const workDate = dateOnly(row.workDate);
    if (!code || !workDate) return;
    const payable = num(row.regularHours) + num(row.ovtHours) > 0 || num(row.nightHours) > 0;
    if (!payable || indexByDay.has(`${code}::${workDate}`)) return;
    indexByDay.set(`${code}::${workDate}`, index);
  });
  for (const leave of leaveDays) {
    const code = compact(leave.employeeCode).toUpperCase();
    const workDate = dateOnly(leave.workDate);
    if (!isContractCode(code) || !workDate) continue;
    const key = `${code}::${workDate}`;
    const existing = indexByDay.get(key);
    if (existing != null) {
      next[existing] = { ...next[existing], paidLeave: true };
      continue;
    }
    indexByDay.set(key, next.length);
    next.push({
      employeeCode: code,
      employeeName: compact(leave.employeeName),
      workDate,
      regularHours: STANDARD_TIMESHEET_HOURS,
      ovtHours: 0,
      nightHours: 0,
      locationName: '',
      paidLeave: true,
    });
  }
  return next;
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
  const seenNight = new Set<string>();
  const ordered = [...rows].sort((left, right) => left.workDate.localeCompare(right.workDate) || left.employeeCode.localeCompare(right.employeeCode) || Number(num(left.nightHours) > 0) - Number(num(right.nightHours) > 0));
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
      paidLeaveDays: 0,
      bookedHours: 0,
      weekdayOvertimeHours: 0,
      employeeNo: code,
      employeeName: compact(row.employeeName),
    };
    if (!current.employeeName && row.employeeName) current.employeeName = compact(row.employeeName);
    const dayKey = `${code}::${workDate}`;
    const first = !seenDay.has(dayKey);
    if (first) seenDay.add(dayKey);
    const kind = timesheetDayRulesForDate(workDate, holidayDates, code).kind;
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
      if (row.paidLeave) current.paidLeaveDays = (current.paidLeaveDays || 0) + 1;
    }
    if (kind === 'Weekday' && payable && !employeeTreatsCalendarDaysAsWorkedDays(code)) {
      let overtime = round1(Math.max(0, regular + ovt - STANDARD_TIMESHEET_HOURS));
      if (overtime <= 0.001 && first && regular > 0 && isOffshoreTimesheetContext(row.locationName, '')) overtime = OFFSHORE_ALLOWANCE_HOURS;
      current.weekdayOvertimeHours = round1((current.weekdayOvertimeHours || 0) + overtime);
    }
    current.bookedHours = round1(current.bookedHours + booked);
    if (night && !seenNight.has(dayKey)) {
      seenNight.add(dayKey);
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
  await clearWeekendLeaveHours(pool).catch(() => undefined);
  const holidayDates = await getPayrollPublicHolidayDates().catch(() => [] as string[]);
  const result = await pool.request()
    .input('Start', sql.Date, bounds.start)
    .input('End', sql.Date, bounds.end)
    .query(`
      SELECT [EmployeeCode], [EmployeeName], [WorkDate], [RegularHours], [OvtHours], [NightHours], [LocationName], [AttendanceStatus]
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
    paidLeave: /approved leave/i.test(compact(row.AttendanceStatus)),
  }));
  let leaveDays: Array<{ employeeCode: string; employeeName: string; workDate: string }> = [];
  try {
    const leave = await pool.request()
      .input('Start', sql.Date, bounds.start)
      .input('End', sql.Date, bounds.end)
      .query(`
        SELECT
          COALESCE(NULLIF(LTRIM(RTRIM(v.employee_code)), N''), leave.[EmployeeId]) AS EmployeeCode,
          COALESCE(NULLIF(LTRIM(RTRIM(leave.[FullName])), N''), v.full_name, N'') AS EmployeeName,
          CONVERT(varchar(10), leave.[StartDate], 23) AS StartDate,
          CONVERT(varchar(10), leave.[EndDate], 23) AS EndDate
        FROM [hris].[LeaveApplications] leave
        LEFT JOIN [hris].[EmployeeMasterView] v
          ON v.employee_code = leave.[EmployeeId]
          OR CONVERT(nvarchar(80), v.employee_id) = leave.[EmployeeId]
        WHERE leave.[EndDate] >= @Start
          AND leave.[StartDate] <= @End
          AND (
            leave.[StatusName] LIKE N'%Approved%'
            OR leave.[StatusName] IN (N'Completed', N'Paid')
          )
          AND leave.[LeaveType] NOT LIKE N'%Unpaid%'
          AND leave.[LeaveType] NOT LIKE N'%Casual%'
      `);
    leaveDays = approvedLeaveBookingDays(
      (leave.recordset || []).map((row) => ({
        employeeCode: compact(row.EmployeeCode),
        employeeName: compact(row.EmployeeName),
        startDate: dateOnly(row.StartDate),
        endDate: dateOnly(row.EndDate),
      })),
      bounds,
      holidayDates,
    );
  } catch (error) {
    console.warn('[Timesheet] Approved leave days were not added to payroll hours:', error instanceof Error ? error.message : error);
  }
  return aggregatePortalBookingsForPayroll(mergeUnbookedApprovedLeave(rows, leaveDays), holidayDates);
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
  await clearWeekendLeaveHours(pool).catch(() => undefined);
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
