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
  isTimesheetAbsentLine,
  applyNightPaperClock,
  isIdleTimeProjectCode,
  productiveProjectHours,
  configuredTimesheetDefaultProjectCode,
  isManualOffshoreLine,
} from '@/lib/timesheet-entry-shared';
import { withCanonicalProjectManager } from '@/lib/timesheet-canonical-project-managers';

const round1 = (value: number) => Math.round(value * 10) / 10;

export type TimesheetBookableProject = {
  id: string;
  code: string;
  name: string;
  projectManager?: string | null;
  status?: string | null;
};

export const AUTO_BOOKED_ATTENDANCE_REMARK = 'Auto-booked from biometric attendance.';

const bookableProjects = (projects: TimesheetBookableProject[]) =>
  projects.map(withCanonicalProjectManager).filter((project) => {
    const status = String(project.status || 'Active');
    if (!['Active', 'Approved', 'Open'].includes(status)) return false;
    if (isIdleTimeProjectCode(project.code)) return false;
    if (!String(project.code || '').trim()) return false;
    return Boolean(String(project.projectManager || '').trim());
  });

/**
 * Only book onto a job the supervisor already chose, or TIMESHEET_DEFAULT_PROJECT_CODE.
 * Never guess the first catalog project (supervisors see that as "miscellaneous").
 */
export const resolveBookableTimesheetProject = (
  projects: TimesheetBookableProject[],
  preferredCode?: string | null,
) => {
  const bookable = bookableProjects(projects);
  if (!bookable.length) return null;
  const preferred = String(preferredCode || '').trim().toUpperCase();
  if (preferred) {
    const match = bookable.find((project) => project.code.toUpperCase() === preferred);
    if (match) return match;
  }
  const configured = configuredTimesheetDefaultProjectCode();
  if (configured) {
    const match = bookable.find((project) => project.code.toUpperCase() === configured);
    if (match) return match;
  }
  return null;
};

const preferredProjectCodeFromLines = (lines: TimesheetLine[]) => {
  for (const line of lines) {
    const booked = (line.projectAllocations || []).find((item) => (
      Number(item.hours || 0) > 0.001 && !isIdleTimeProjectCode(item.projectCode)
    ));
    if (booked?.projectCode) return booked.projectCode;
  }
  return null;
};

/**
 * Fill empty clocked rows from a job already on this sheet.
 * Does not pick a miscellaneous catalog project for the supervisor.
 */
export const ensureClockedLinesHaveProjectAllocation = (
  lines: TimesheetLine[],
  projects: TimesheetBookableProject[],
  dayContext: TimesheetDayContext,
): { lines: TimesheetLine[]; bookedCount: number; projectCode: string | null } => {
  const project = resolveBookableTimesheetProject(projects, preferredProjectCodeFromLines(lines));
  if (!project) {
    return {
      lines: lines.map((line) => applyTimesheetLineDefaults(line, dayContext, [])),
      bookedCount: 0,
      projectCode: null,
    };
  }

  const hours = resolveTimesheetHours(dayContext);
  const shift = resolveTimesheetShift(dayContext.shiftLabel);
  let bookedCount = 0;

  const nextLines = lines.map((line) => {
    const working = applyTimesheetLineDefaults(line, dayContext, [project.code]);
    if (shift.kind !== 'Night' && isTimesheetAbsentLine(working) && !isManualOffshoreLine(working)) {
      return working;
    }
    if (productiveProjectHours(working.projectAllocations) > 0.001) {
      return working;
    }
    if (!working.clockIn && !isManualOffshoreLine(working) && shift.kind !== 'Night') {
      return working;
    }

    bookedCount += 1;
    const projectAllocations = normalizeProjectAllocations([
      {
        projectId: project.id,
        projectCode: project.code,
        projectName: project.name,
        hours: hours.standardProductiveHours,
        remarks: AUTO_BOOKED_ATTENDANCE_REMARK,
      },
      ...normalizeProjectAllocations(working.projectAllocations).filter((item) => isIdleTimeProjectCode(item.projectCode)),
    ]);
    const usedHours = sumProjectAllocationHours(projectAllocations);
    const idleHours = round1((working.idleAllocations || []).reduce((sum, item) => sum + Number(item.hours || 0), 0));
    const totalHours = round1(usedHours + idleHours);
    const complete = totalHours === hours.grossHours && usedHours === hours.standardProductiveHours;
    return {
      ...working,
      projectAllocations,
      usedHours,
      idleHours,
      totalHours,
      variance: round1(totalHours - hours.grossHours),
      validationStatus: complete ? 'Valid' : 'Incomplete',
      validationMessage: complete ? null : `Awaiting full ${hours.grossHours}-hour allocation.`,
    } as TimesheetLine;
  });

  return { lines: nextLines, bookedCount, projectCode: project.code };
};

/** Apply break-time defaults on clocked-in lines. Night shift skips the extra 1h break against biometric. */
export const applyTimesheetLineDefaults = (
  line: TimesheetLine,
  dayContext: TimesheetDayContext,
  _projectCodes: string[] = [],
): TimesheetLine => {
  const working = applyNightPaperClock(line, dayContext.shiftLabel);
  if (isTimesheetAbsentLine(working)) {
    return {
      ...working,
      projectAllocations: normalizeProjectAllocations(working.projectAllocations),
      idleAllocations: normalizeIdleAllocations(working.idleAllocations || []),
    };
  }

  const hours = resolveTimesheetHours(dayContext);
  const shift = resolveTimesheetShift(dayContext.shiftLabel);
  const projectAllocations = normalizeProjectAllocations(working.projectAllocations).map((item) => ({
    ...item,
    hours: repairStackedOvertimeProductiveHours(
      Number(item.hours || 0),
      hours.standardProductiveHours,
      item.remarks,
    ),
  }));

  let idleAllocations = normalizeIdleAllocations(working.idleAllocations || []);

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
  const clockDuration = attendanceDurationFromClock(working.clockIn, working.clockOut);
  const attendanceDuration =
    clockDuration !== null && clockDuration > 0
      ? clockDuration
      : working.clockIn && !working.clockOut
        ? round1(Math.min(Math.max(0, working.attendanceDuration || 0), hours.grossHours))
        : round1(Math.max(0, working.attendanceDuration || 0));

  return {
    ...working,
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
