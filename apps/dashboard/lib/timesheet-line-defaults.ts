import {
  DAILY_BREAK_HOURS,
  DEFAULT_BREAK_IDLE_REASON_ID,
  DEFAULT_BREAK_IDLE_REASON_NAME,
  GROSS_TIMESHEET_HOURS,
  STANDARD_TIMESHEET_HOURS,
  type TimesheetDayContext,
  type TimesheetLine,
  timesheetDayRulesForDate,
  normalizeIdleAllocations,
  normalizeProjectAllocations,
  sumProjectAllocationHours,
  attendanceDurationFromClock,
  repairStackedOvertimeProductiveHours,
} from '@/lib/timesheet-entry-shared';

const round1 = (value: number) => Math.round(value * 10) / 10;

/** Apply break-time defaults (1h break) on clocked-in lines. Does not auto-book project hours from biometric. */
export const applyTimesheetLineDefaults = (
  line: TimesheetLine,
  dayContext: TimesheetDayContext,
  _projectCodes: string[] = [],
): TimesheetLine => {
  if (!line.clockIn) {
    return {
      ...line,
      projectAllocations: normalizeProjectAllocations(line.projectAllocations),
      idleAllocations: normalizeIdleAllocations(line.idleAllocations || []),
    };
  }

  const rules = timesheetDayRulesForDate(dayContext.date, dayContext.holidayDates);
  const projectAllocations = normalizeProjectAllocations(line.projectAllocations).map((item) => ({
    ...item,
    hours: repairStackedOvertimeProductiveHours(
      Number(item.hours || 0),
      rules.standardProductiveHours,
      item.remarks,
    ),
  }));

  let idleAllocations = normalizeIdleAllocations(
    (line.idleAllocations || []).length
      ? line.idleAllocations || []
      : [{ reasonId: DEFAULT_BREAK_IDLE_REASON_ID, reasonName: DEFAULT_BREAK_IDLE_REASON_NAME, hours: DAILY_BREAK_HOURS, remarks: null }],
  );

  const hasBreak = idleAllocations.some((item) => item.hours > 0);

  if (!hasBreak) {
    idleAllocations = normalizeIdleAllocations([
      { reasonId: DEFAULT_BREAK_IDLE_REASON_ID, reasonName: DEFAULT_BREAK_IDLE_REASON_NAME, hours: DAILY_BREAK_HOURS, remarks: null },
    ]);
  }

  const usedHours = sumProjectAllocationHours(projectAllocations);
  const idleHours = round1(idleAllocations.reduce((sum, item) => sum + Number(item.hours || 0), 0));
  const totalHours = round1(usedHours + idleHours);
  const clockDuration = attendanceDurationFromClock(line.clockIn, line.clockOut);
  const attendanceDuration =
    clockDuration !== null && clockDuration > 0
      ? clockDuration
      : line.clockIn && !line.clockOut
        ? round1(Math.min(line.attendanceDuration || 0, rules.grossHours))
        : line.attendanceDuration;

  return {
    ...line,
    projectAllocations,
    idleAllocations,
    attendanceDuration,
    usedHours,
    idleHours,
    totalHours,
    variance: round1(totalHours - rules.grossHours),
  };
};

export const defaultProductiveHoursForDate = (dayContext: TimesheetDayContext) =>
  timesheetDayRulesForDate(dayContext.date, dayContext.holidayDates).standardProductiveHours;

export const defaultGrossHoursForDate = (dayContext: TimesheetDayContext) =>
  timesheetDayRulesForDate(dayContext.date, dayContext.holidayDates).grossHours;

export const weekdayGrossHours = () => GROSS_TIMESHEET_HOURS;

export const weekdayStandardHours = () => STANDARD_TIMESHEET_HOURS;
