import {
  DAILY_BREAK_HOURS,
  DEFAULT_BREAK_IDLE_REASON_ID,
  DEFAULT_BREAK_IDLE_REASON_NAME,
  GROSS_TIMESHEET_HOURS,
  STANDARD_TIMESHEET_HOURS,
  type TimesheetDayContext,
  type TimesheetLine,
  resolveTimesheetHours,
  resolveTimesheetShift,
  normalizeIdleAllocations,
  normalizeProjectAllocations,
  sumProjectAllocationHours,
  attendanceDurationFromClock,
  repairStackedOvertimeProductiveHours,
} from '@/lib/timesheet-entry-shared';

const round1 = (value: number) => Math.round(value * 10) / 10;

/** Apply break-time defaults on clocked-in lines. Night shift skips the extra 1h break against biometric. */
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

  const hours = resolveTimesheetHours(dayContext);
  const shift = resolveTimesheetShift(dayContext.shiftLabel);
  const projectAllocations = normalizeProjectAllocations(line.projectAllocations).map((item) => ({
    ...item,
    hours: repairStackedOvertimeProductiveHours(
      Number(item.hours || 0),
      hours.standardProductiveHours,
      item.remarks,
    ),
  }));

  let idleAllocations = normalizeIdleAllocations(line.idleAllocations || []);

  // Day shift requires 1h break idle. Night 18:00–02:00 is already net 8h — do not force break.
  if (shift.kind !== 'Night') {
    const hasBreak = idleAllocations.some((item) => item.hours > 0);
    if (!hasBreak) {
      idleAllocations = normalizeIdleAllocations([
        { reasonId: DEFAULT_BREAK_IDLE_REASON_ID, reasonName: DEFAULT_BREAK_IDLE_REASON_NAME, hours: DAILY_BREAK_HOURS, remarks: null },
      ]);
    }
  }

  const usedHours = sumProjectAllocationHours(projectAllocations);
  const idleHours = round1(idleAllocations.reduce((sum, item) => sum + Number(item.hours || 0), 0));
  const totalHours = round1(usedHours + idleHours);
  const clockDuration = attendanceDurationFromClock(line.clockIn, line.clockOut);
  const attendanceDuration =
    clockDuration !== null && clockDuration > 0
      ? clockDuration
      : line.clockIn && !line.clockOut
        ? round1(Math.min(Math.max(0, line.attendanceDuration || 0), hours.grossHours))
        : round1(Math.max(0, line.attendanceDuration || 0));

  return {
    ...line,
    projectAllocations,
    idleAllocations,
    attendanceDuration,
    usedHours,
    idleHours,
    totalHours,
    variance: round1(totalHours - hours.grossHours),
  };
};

export const defaultProductiveHoursForDate = (dayContext: TimesheetDayContext) =>
  resolveTimesheetHours(dayContext).standardProductiveHours;

export const defaultGrossHoursForDate = (dayContext: TimesheetDayContext) =>
  resolveTimesheetHours(dayContext).grossHours;

export const weekdayGrossHours = () => GROSS_TIMESHEET_HOURS;

export const weekdayStandardHours = () => STANDARD_TIMESHEET_HOURS;
