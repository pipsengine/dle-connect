/**
 * Timesheet sheet identity is date + supervisor + location + shift.
 * Work centre is a line label (trade or offshore project), not a second sheet.
 */
import { supervisorCodesMatch, timesheetEmployeeRecordsMatch, timesheetLocationsMatch } from '@/lib/timesheet-agege-blasting';
import {
  MIXED_TIMESHEET_WORK_CENTER,
  isOffshoreLocationName,
  normalizeTimesheetStatusKey,
  timesheetHeaderMatchesShift,
  timesheetLineHasBookedHours,
  timesheetWorkCentersMatch,
  type TimesheetLine,
} from '@/lib/timesheet-entry-shared';

const clean = (value: unknown) => String(value || '').trim();

export type TimesheetSheetHeaderRef = {
  id: string;
  timesheetDate: string;
  supervisorId: string;
  supervisorName?: string | null;
  shiftLabel?: string | null;
  locationName?: string | null;
  workCenterName?: string | null;
  status?: string | null;
};

export type TimesheetSheetScope = {
  date: string;
  supervisorId: string;
  shiftLabel?: string | null;
  locationName?: string | null;
};

const JOB_TITLE_WORK_CENTERS: Array<[RegExp, string]> = [
  [/\bfitter|fitting\b/i, 'Fitting'],
  [/\bwelder|welding\b/i, 'Welding'],
  [/\bblaster|blasting\b/i, 'Blasting'],
  [/\bpainter|painting|coating\b/i, 'Painting'],
  [/\brigger|rigging\b/i, 'Rigging'],
  [/\bscaffold/i, 'Structural Assembly'],
  [/\bcnc|koike|cutter|cutting\b/i, 'Cutting'],
  [/\broller|rolling|machinist|machining\b/i, 'Machining'],
];

/** Assigned crew wins, then HR direct reports who are not on another supervisor's sheet. Exclusive shop rosters stay assignment-only. */
export const timesheetAssignmentGroupIsExclusive = (group?: string | null) => {
  const value = clean(group);
  if (!value) return false;
  return !/report|department reporting|org chart/i.test(value);
};

export const preferAssignedTimesheetRoster = <T>(
  assigned: T[],
  reportingFallback: T[],
  options?: {
    codeOf?: (item: T) => string | null | undefined;
    assignedToOtherCodes?: Iterable<string>;
    exclusive?: boolean;
  },
) => {
  const codeOf = options?.codeOf;
  if (!codeOf) return assigned.length ? assigned : reportingFallback;
  if (options?.exclusive && assigned.length) return assigned;
  const assignedElsewhere = new Set(
    [...(options?.assignedToOtherCodes || [])].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean),
  );
  const byCode = new Map<string, T>();
  for (const row of assigned) {
    const code = String(codeOf(row) || '').trim().toLowerCase();
    if (code) byCode.set(code, row);
  }
  for (const row of reportingFallback) {
    const code = String(codeOf(row) || '').trim().toLowerCase();
    if (!code || byCode.has(code) || assignedElsewhere.has(code)) continue;
    byCode.set(code, row);
  }
  return byCode.size ? [...byCode.values()] : reportingFallback;
};

export const workCenterNameFromJobTitle = (jobTitle?: string | null, workCenterNames: string[] = []) => {
  const title = clean(jobTitle);
  if (!title) return '';
  const alias = JOB_TITLE_WORK_CENTERS.find(([pattern]) => pattern.test(title))?.[1] || '';
  if (alias) {
    const match = workCenterNames.find((name) => timesheetWorkCentersMatch(name, alias));
    if (match) return match;
    if (!workCenterNames.length) return alias;
  }
  return workCenterNames.find((name) => title.toLowerCase().includes(clean(name).toLowerCase())) || '';
};

export const resolveTimesheetLineWorkCenter = (input: {
  employeeWorkCenter?: string | null;
  jobTitle?: string | null;
  tradeRole?: string | null;
  fallbackWorkCenter?: string | null;
  workCenterNames?: string[];
}) => {
  const names = input.workCenterNames || [];
  const assigned = clean(input.employeeWorkCenter);
  if (assigned) {
    const match = names.find((name) => timesheetWorkCentersMatch(name, assigned));
    return match || assigned;
  }
  const fromTitle = workCenterNameFromJobTitle(input.jobTitle || input.tradeRole, names);
  if (fromTitle) return fromTitle;
  const fallback = clean(input.fallbackWorkCenter);
  if (fallback && fallback !== MIXED_TIMESHEET_WORK_CENTER) return fallback;
  return '';
};

export const summarizeTimesheetHeaderWorkCenter = (workCenters: Array<string | null | undefined>) => {
  const unique = Array.from(new Set(workCenters.map(clean).filter((name) => name && name !== MIXED_TIMESHEET_WORK_CENTER)));
  if (unique.length === 1) return unique[0];
  if (unique.length > 1) return MIXED_TIMESHEET_WORK_CENTER;
  return MIXED_TIMESHEET_WORK_CENTER;
};

const headerStatusRank = (status?: string | null) => {
  const key = normalizeTimesheetStatusKey(status);
  if (key === 'hr_acknowledged' || key === 'locked' || key === 'approved') return 3;
  if (key && key !== 'draft' && key !== 'returned') return 2;
  return 1;
};

const headerBookedHours = (lines: TimesheetLine[]) =>
  lines.reduce((sum, line) => sum + Number(line.usedHours || 0) + (timesheetLineHasBookedHours(line) ? 0.01 : 0), 0);

export const timesheetHeaderMatchesSupervisorShift = (
  header: TimesheetSheetHeaderRef,
  input: TimesheetSheetScope,
) => {
  if (header.timesheetDate !== input.date) return false;
  if (
    !supervisorCodesMatch(header.supervisorId, input.supervisorId)
    && !supervisorCodesMatch(header.supervisorName, input.supervisorId)
  ) return false;
  return timesheetHeaderMatchesShift(header.shiftLabel, input.shiftLabel);
};

export const selectCanonicalTimesheetHeader = <T extends TimesheetSheetHeaderRef>(
  candidates: T[],
  input: TimesheetSheetScope & {
    supervisorHomeLocation?: string | null;
    preferredId?: string | null;
    linesByHeader?: Map<string, TimesheetLine[]>;
  },
): { header: T | null; adoptLegacy: boolean } => {
  if (!candidates.length) return { header: null, adoptLegacy: false };
  const targetLocation = clean(input.locationName);
  const located = targetLocation
    ? candidates.filter((header) => timesheetLocationsMatch(header.locationName, targetLocation))
    : candidates;
  const unlocated = candidates.filter((header) => !clean(header.locationName));
  const canAdoptLegacy = Boolean(unlocated.length)
    && !isOffshoreLocationName(targetLocation)
    && (
      !clean(input.supervisorHomeLocation)
      || timesheetLocationsMatch(targetLocation, input.supervisorHomeLocation)
    );
  const pool = located.length ? located : (canAdoptLegacy ? unlocated : []);
  if (!pool.length) return { header: null, adoptLegacy: false };

  const preferredId = clean(input.preferredId);
  const ranked = [...pool].sort((left, right) => {
    const statusDelta = headerStatusRank(right.status) - headerStatusRank(left.status);
    if (statusDelta) return statusDelta;
    const leftHours = headerBookedHours(input.linesByHeader?.get(left.id) || []);
    const rightHours = headerBookedHours(input.linesByHeader?.get(right.id) || []);
    if (rightHours !== leftHours) return rightHours - leftHours;
    if (preferredId) {
      if (left.id === preferredId) return -1;
      if (right.id === preferredId) return 1;
    }
    return left.id.localeCompare(right.id);
  });
  return { header: ranked[0] || null, adoptLegacy: !located.length && canAdoptLegacy };
};

const relocateLine = (line: TimesheetLine, headerId: string, workCenterName: string): TimesheetLine => ({
  ...line,
  id: `line-${headerId}-${String(line.employeeNo || line.employeeId).replace(/[^A-Za-z0-9]/g, '')}`,
  headerId,
  workCenterName: clean(line.workCenterName) || workCenterName,
});

/**
 * Move unique people from editable duplicate sheets onto the canonical sheet.
 * Payroll-ready headers are left alone. Line work centre is stamped from the source header.
 */
export const mergeDuplicateTimesheetSheetLines = (input: {
  canonical: TimesheetSheetHeaderRef;
  siblings: TimesheetSheetHeaderRef[];
  lines: TimesheetLine[];
}) => {
  let canonicalLines: TimesheetLine[] = input.lines
    .filter((line) => line.headerId === input.canonical.id)
    .map((line) => ({
      ...line,
      workCenterName: clean(line.workCenterName) || clean(input.canonical.workCenterName) || null,
    }));
  const siblingWrites: Array<{ header: TimesheetSheetHeaderRef; lines: TimesheetLine[] }> = [];

  for (const sibling of input.siblings) {
    if (sibling.id === input.canonical.id) continue;
    const siblingStatus = normalizeTimesheetStatusKey(sibling.status);
    if (siblingStatus && siblingStatus !== 'draft' && siblingStatus !== 'returned') continue;
    const siblingLines = input.lines.filter((line) => line.headerId === sibling.id);
    if (!siblingLines.length) {
      siblingWrites.push({ header: sibling, lines: [] });
      continue;
    }
    const remaining: TimesheetLine[] = [];
    for (const line of siblingLines) {
      const existing = canonicalLines.find((item) => timesheetEmployeeRecordsMatch(item, line));
      if (!existing) {
        canonicalLines.push(relocateLine(line, input.canonical.id, clean(sibling.workCenterName)));
        continue;
      }
      const existingBooked = timesheetLineHasBookedHours(existing);
      const incomingBooked = timesheetLineHasBookedHours(line);
      if (!existingBooked && incomingBooked) {
        canonicalLines = canonicalLines.map((item) => (
          item.id === existing.id
            ? relocateLine(line, input.canonical.id, clean(line.workCenterName) || clean(sibling.workCenterName))
            : item
        ));
      }
    }
    siblingWrites.push({ header: sibling, lines: remaining });
  }

  return {
    lines: overlayMissingTimesheetClocks(
      canonicalLines,
      input.lines.filter((line) => line.headerId !== input.canonical.id && Boolean(String(line.clockIn || '').trim())),
    ),
    siblingWrites,
    workCenterName: summarizeTimesheetHeaderWorkCenter(canonicalLines.map((line) => line.workCenterName)),
  };
};

const lineHasClock = (line: Pick<TimesheetLine, 'clockIn'>) => Boolean(String(line.clockIn || '').trim());

/**
 * Nested supervisors (Abel on Samuel's Agege sheet) often already have clocks on their
 * own sheet or a leftover Blasting/Cutting duplicate. Copy those punches onto an Absent
 * roster row so presence is visible even when hours stay on the other sheet.
 */
export const overlayMissingTimesheetClocks = (lines: TimesheetLine[], donors: TimesheetLine[]): TimesheetLine[] => {
  if (!lines.length || !donors.length) return lines;
  return lines.map((line) => {
    if (lineHasClock(line)) return line;
    const donor = donors.find((item) => lineHasClock(item) && timesheetEmployeeRecordsMatch(line, item));
    if (!donor) return line;
    return {
      ...line,
      clockIn: donor.clockIn,
      clockOut: donor.clockOut || line.clockOut,
      attendanceDuration: donor.attendanceDuration || line.attendanceDuration,
      attendanceMode: donor.attendanceMode || line.attendanceMode || 'Biometric',
      biometricId: donor.biometricId || line.biometricId,
      attendanceId: donor.attendanceId || line.attendanceId,
    };
  });
};
