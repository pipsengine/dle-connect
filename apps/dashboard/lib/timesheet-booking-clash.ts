import { extractSupervisorEmployeeCode, supervisorCodesMatch, timesheetEmployeeRecordsMatch } from '@/lib/timesheet-agege-blasting';
import {
  normalizeTimesheetStatusKey,
  productiveProjectHours,
  reconcileTimesheetLineHours,
  supervisorWorkCenterLabel,
  timesheetHeaderShiftKind,
  timesheetLineHasProductiveHours,
  timesheetWorkCentersMatch,
  type TimesheetLine,
} from '@/lib/timesheet-entry-shared';

export type TimesheetHeaderClashRef = {
  id: string;
  timesheetDate: string;
  shiftLabel?: string | null;
  workCenterName?: string | null;
  supervisorName?: string | null;
  supervisorId?: string | null;
  status?: string | null;
};

export type TimesheetAlreadyBookedSkip = {
  employeeName: string;
  employeeNo: string;
  bookedOn: string;
  lineId?: string;
};

const bookedHours = (line: TimesheetLine) => productiveProjectHours(line.projectAllocations);

const clearLineBooking = (line: TimesheetLine): TimesheetLine =>
  reconcileTimesheetLineHours({
    ...line,
    projectAllocations: [],
  });

const otherSheetLabel = (header?: TimesheetHeaderClashRef | null) =>
  supervisorWorkCenterLabel(header?.workCenterName);

const otherDateLinesForHeader = (
  header: TimesheetHeaderClashRef,
  otherHeaders: TimesheetHeaderClashRef[],
  otherLines: TimesheetLine[],
) => otherLines.filter((line) => {
  const otherHeader = otherHeaders.find((item) => item.id === line.headerId);
  return Boolean(otherHeader && otherHeader.timesheetDate === header.timesheetDate && otherHeader.id !== header.id);
});

export const isAutoBookedTimesheetLine = (line: TimesheetLine) =>
  (line.projectAllocations || []).some((item) => /auto-booked from biometric/i.test(String(item.remarks || '')));

/** Submitted/in-review hours, or a job the supervisor typed. Draft miscellaneous auto-book is not a real booking. */
export const isCommittedTimesheetBooking = (
  header: TimesheetHeaderClashRef | null | undefined,
  line: TimesheetLine,
) => {
  if (!timesheetLineHasProductiveHours(line) && bookedHours(line) <= 0.001) return false;
  const status = normalizeTimesheetStatusKey(header?.status);
  if (status && status !== 'draft') return true;
  return !isAutoBookedTimesheetLine(line);
};

const headerSupervisorKey = (header?: TimesheetHeaderClashRef | null) =>
  extractSupervisorEmployeeCode(header?.supervisorId) || extractSupervisorEmployeeCode(header?.supervisorName);

const sameSupervisorHeaders = (left: TimesheetHeaderClashRef, right?: TimesheetHeaderClashRef | null) =>
  Boolean(right && supervisorCodesMatch(headerSupervisorKey(left), headerSupervisorKey(right)));

const isPayrollReadyHeader = (header?: TimesheetHeaderClashRef | null) => {
  const key = normalizeTimesheetStatusKey(header?.status);
  return key === 'hr_acknowledged' || key === 'locked' || key === 'approved';
};

/** Draft on another section is never a lock. A submitted sheet from a different supervisor also yields. */
const otherSheetDoesNotLockThisCrew = (
  header: TimesheetHeaderClashRef,
  otherHeader: TimesheetHeaderClashRef | undefined,
) => {
  if (!otherHeader || isPayrollReadyHeader(otherHeader)) return false;
  if (timesheetWorkCentersMatch(header.workCenterName, otherHeader.workCenterName)) return false;
  if (normalizeTimesheetStatusKey(otherHeader.status) === 'draft') return true;
  return !sameSupervisorHeaders(header, otherHeader);
};

const clashOnOtherSheet = (
  line: TimesheetLine,
  header: TimesheetHeaderClashRef,
  otherDateLines: TimesheetLine[],
  otherHeaders: TimesheetHeaderClashRef[],
  committedOnly: boolean,
) => otherDateLines.find((other) => {
  if (!timesheetLineHasProductiveHours(other)) return false;
  const otherHeader = otherHeaders.find((item) => item.id === other.headerId);
  if (timesheetHeaderShiftKind(otherHeader?.shiftLabel) !== timesheetHeaderShiftKind(header.shiftLabel)) return false;
  if (otherSheetDoesNotLockThisCrew(header, otherHeader)) return false;
  if (committedOnly && !isCommittedTimesheetBooking(otherHeader, other)) return false;
  return timesheetEmployeeRecordsMatch(line, other);
});

const toSkip = (line: TimesheetLine, bookedOn: string): TimesheetAlreadyBookedSkip => ({
  employeeName: line.employeeName,
  employeeNo: String(line.employeeNo || line.employeeId || ''),
  bookedOn,
  lineId: line.id,
});

/**
 * One person cannot have productive hours on two same-shift sheets for the same date.
 * Keep a committed booking on the other sheet. Draft auto-book ("miscellaneous") does not win.
 */
export const releaseLinesAlreadyBookedElsewhere = (
  lines: TimesheetLine[],
  header: TimesheetHeaderClashRef,
  otherHeaders: TimesheetHeaderClashRef[],
  otherLines: TimesheetLine[],
): { lines: TimesheetLine[]; skipped: TimesheetAlreadyBookedSkip[] } => {
  const otherDateLines = otherDateLinesForHeader(header, otherHeaders, otherLines);
  const skipped: TimesheetAlreadyBookedSkip[] = [];
  const nextLines = lines.map((line) => {
    if (bookedHours(line) <= 0.001) return line;
    const clash = clashOnOtherSheet(line, header, otherDateLines, otherHeaders, true);
    if (!clash) return line;
    const otherHeader = otherHeaders.find((item) => item.id === clash.headerId);
    skipped.push(toSkip(line, otherSheetLabel(otherHeader)));
    return clearLineBooking(line);
  });
  return { lines: nextLines, skipped };
};

/** Productive hours on this sheet that are already committed on another same-day timesheet. Clock-only roster rows are not a second booking. */
export const findSameDayBookingConflicts = (
  lines: TimesheetLine[],
  header: TimesheetHeaderClashRef,
  otherHeaders: TimesheetHeaderClashRef[],
  otherLines: TimesheetLine[],
): TimesheetAlreadyBookedSkip[] => {
  const otherDateLines = otherDateLinesForHeader(header, otherHeaders, otherLines);
  const skipped: TimesheetAlreadyBookedSkip[] = [];
  for (const line of lines) {
    if (bookedHours(line) <= 0.001) continue;
    const clash = clashOnOtherSheet(line, header, otherDateLines, otherHeaders, true);
    if (!clash) continue;
    const otherHeader = otherHeaders.find((item) => item.id === clash.headerId);
    skipped.push(toSkip(line, otherSheetLabel(otherHeader)));
  }
  return skipped;
};

export const employeeAlreadyCommittedOnOtherTimesheet = (
  employee: { employeeNo?: string | null; employeeId?: string | null; employeeName?: string | null },
  header: TimesheetHeaderClashRef,
  otherHeaders: TimesheetHeaderClashRef[],
  otherLines: TimesheetLine[],
) => otherLines.some((other) => {
  if (!timesheetLineHasProductiveHours(other) && bookedHours(other) <= 0.001) return false;
  const otherHeader = otherHeaders.find((item) => item.id === other.headerId);
  if (!otherHeader || otherHeader.id === header.id || otherHeader.timesheetDate !== header.timesheetDate) return false;
  if (timesheetHeaderShiftKind(otherHeader.shiftLabel) !== timesheetHeaderShiftKind(header.shiftLabel)) return false;
  if (otherSheetDoesNotLockThisCrew(header, otherHeader)) return false;
  if (!isCommittedTimesheetBooking(otherHeader, other)) return false;
  return timesheetEmployeeRecordsMatch(employee, other);
});

export const timesheetLineMatchesBookingConflict = (
  line: Pick<TimesheetLine, 'id' | 'employeeNo' | 'employeeId'>,
  conflicts: TimesheetAlreadyBookedSkip[],
) => conflicts.some((item) => {
  if (item.lineId && item.lineId === line.id) return true;
  const no = String(item.employeeNo || '').trim();
  if (!no) return false;
  return no === String(line.employeeNo || '').trim() || no === String(line.employeeId || '').trim();
});

export const formatSupervisorBookingConflictMessage = (
  conflicts: TimesheetAlreadyBookedSkip[],
  options?: { allBookedAreConflicts?: boolean },
) => {
  if (!conflicts.length) return '';
  if (options?.allBookedAreConflicts) {
    return 'Every worker with hours here is already on another timesheet today. There is nothing new to submit on this sheet.';
  }
  if (conflicts.length === 1) {
    const item = conflicts[0];
    return `${item.employeeName} already has hours on ${supervisorWorkCenterLabel(item.bookedOn)} today. One person cannot be submitted on two timesheets for the same day.`;
  }
  const sample = conflicts.slice(0, 6).map((item) => `${item.employeeName} (${supervisorWorkCenterLabel(item.bookedOn)})`);
  const extra = conflicts.length > 6 ? ` and ${conflicts.length - 6} more` : '';
  return `These workers already have hours on another timesheet today. One person cannot be submitted twice for the same day: ${sample.join(', ')}${extra}.`;
};

export const formatAlreadyBookedSkipNotice = (skipped: TimesheetAlreadyBookedSkip[]) => {
  if (!skipped.length) return '';
  const sample = skipped.slice(0, 4).map((item) => `${item.employeeName} on ${supervisorWorkCenterLabel(item.bookedOn)}`);
  const extra = skipped.length > 4 ? ` and ${skipped.length - 4} more` : '';
  return `Submitted. These workers already have hours on another timesheet today, so they were left there: ${sample.join(', ')}${extra}.`;
};

const supervisorCodesForHeader = (header: TimesheetHeaderClashRef) =>
  [extractSupervisorEmployeeCode(header.supervisorId), extractSupervisorEmployeeCode(header.supervisorName)].filter(Boolean);

export const employeeIsOtherTimesheetSupervisor = (
  employee: { employeeNo?: string | null; employeeId?: string | null; employeeName?: string | null },
  header: TimesheetHeaderClashRef,
  otherHeaders: TimesheetHeaderClashRef[],
) => otherHeaders.some((other) => {
  if (other.timesheetDate !== header.timesheetDate || other.id === header.id) return false;
  if (supervisorCodesMatch(other.supervisorId, header.supervisorId)) return false;
  return supervisorCodesForHeader(other).some((code) => (
    supervisorCodesMatch(code, employee.employeeNo)
    || supervisorCodesMatch(code, employee.employeeId)
    || timesheetEmployeeRecordsMatch(employee, { employeeNo: code, employeeId: code, employeeName: other.supervisorName })
  ));
});

export const omitOtherTimesheetSupervisors = (
  lines: TimesheetLine[],
  header: TimesheetHeaderClashRef,
  otherHeaders: TimesheetHeaderClashRef[],
) => lines.filter((line) => !employeeIsOtherTimesheetSupervisor(line, header, otherHeaders));

/** When this sheet books real hours, take them off other drafts or a different supervisor's unposted sheet. */
export const displaceUncommittedBookingsOnOtherDrafts = (
  submittingLines: TimesheetLine[],
  header: TimesheetHeaderClashRef,
  otherHeaders: TimesheetHeaderClashRef[],
  otherLines: TimesheetLine[],
): { header: TimesheetHeaderClashRef; lines: TimesheetLine[] }[] => {
  const headerKind = timesheetHeaderShiftKind(header.shiftLabel);
  const bookedHere = submittingLines.filter((line) => bookedHours(line) > 0.001);
  if (!bookedHere.length) return [];
  const updates: { header: TimesheetHeaderClashRef; lines: TimesheetLine[] }[] = [];
  for (const otherHeader of otherHeaders) {
    if (otherHeader.id === header.id || otherHeader.timesheetDate !== header.timesheetDate) continue;
    if (timesheetHeaderShiftKind(otherHeader.shiftLabel) !== headerKind) continue;
    if (isPayrollReadyHeader(otherHeader)) continue;
    const draft = normalizeTimesheetStatusKey(otherHeader.status) === 'draft';
    const foreignSupervisor = !sameSupervisorHeaders(header, otherHeader);
    const differentWorkCenter = !timesheetWorkCentersMatch(header.workCenterName, otherHeader.workCenterName);
    if (!draft && !(foreignSupervisor && differentWorkCenter)) continue;
    const lines = otherLines.filter((line) => line.headerId === otherHeader.id);
    let changed = false;
    const next = lines.map((other) => {
      const match = bookedHere.find((line) => timesheetEmployeeRecordsMatch(line, other));
      if (!match) return other;
      const autoBook = isAutoBookedTimesheetLine(other);
      if (!differentWorkCenter && !autoBook) return other;
      if (bookedHours(other) <= 0.001 && !timesheetLineHasProductiveHours(other)) return other;
      changed = true;
      return clearLineBooking(other);
    });
    if (changed) updates.push({ header: otherHeader, lines: next });
  }
  return updates;
};

export const clearEmployeeFromDraftHeaders = (
  employee: { employeeNo?: string | null; employeeId?: string | null; employeeName?: string | null },
  header: TimesheetHeaderClashRef,
  otherHeaders: TimesheetHeaderClashRef[],
  otherLines: TimesheetLine[],
): { header: TimesheetHeaderClashRef; lines: TimesheetLine[] }[] => {
  const updates: { header: TimesheetHeaderClashRef; lines: TimesheetLine[] }[] = [];
  for (const otherHeader of otherHeaders) {
    if (otherHeader.id === header.id || otherHeader.timesheetDate !== header.timesheetDate) continue;
    if (normalizeTimesheetStatusKey(otherHeader.status) !== 'draft') continue;
    const lines = otherLines.filter((line) => line.headerId === otherHeader.id);
    const next = lines.filter((line) => !timesheetEmployeeRecordsMatch(line, employee));
    if (next.length !== lines.length) updates.push({ header: otherHeader, lines: next });
  }
  return updates;
};
