import { timesheetEmployeeRecordsMatch } from '@/lib/timesheet-agege-blasting';
import {
  reconcileTimesheetLineHours,
  timesheetHeaderShiftKind,
  timesheetLineHasBookedHours,
  type TimesheetLine,
} from '@/lib/timesheet-entry-shared';

export type TimesheetHeaderClashRef = {
  id: string;
  timesheetDate: string;
  shiftLabel?: string | null;
  workCenterName?: string | null;
  supervisorName?: string | null;
};

export type TimesheetAlreadyBookedSkip = {
  employeeName: string;
  employeeNo: string;
  bookedOn: string;
};

const bookedHours = (line: TimesheetLine) =>
  Number(line.usedHours || 0) + (line.projectAllocations || []).reduce((sum, allocation) => sum + Number(allocation.hours || 0), 0);

const clearLineBooking = (line: TimesheetLine): TimesheetLine =>
  reconcileTimesheetLineHours({
    ...line,
    projectAllocations: [],
  });

const otherSheetLabel = (header?: TimesheetHeaderClashRef | null) =>
  [header?.workCenterName, header?.supervisorName].filter(Boolean).join(' / ') || 'another timesheet';

/**
 * One person cannot have productive hours on two same-shift sheets for the same date.
 * Keep the existing booking on the other sheet and clear hours on this one.
 */
export const releaseLinesAlreadyBookedElsewhere = (
  lines: TimesheetLine[],
  header: TimesheetHeaderClashRef,
  otherHeaders: TimesheetHeaderClashRef[],
  otherLines: TimesheetLine[],
): { lines: TimesheetLine[]; skipped: TimesheetAlreadyBookedSkip[] } => {
  const headerKind = timesheetHeaderShiftKind(header.shiftLabel);
  const otherDateLines = otherLines.filter((line) => {
    const otherHeader = otherHeaders.find((item) => item.id === line.headerId);
    return Boolean(otherHeader && otherHeader.timesheetDate === header.timesheetDate && otherHeader.id !== header.id);
  });
  const skipped: TimesheetAlreadyBookedSkip[] = [];
  const nextLines = lines.map((line) => {
    if (bookedHours(line) <= 0.001) return line;
    const clash = otherDateLines.find((other) => {
      if (Number(other.usedHours || 0) <= 0.001 && !timesheetLineHasBookedHours(other)) return false;
      const otherHeader = otherHeaders.find((item) => item.id === other.headerId);
      if (timesheetHeaderShiftKind(otherHeader?.shiftLabel) !== headerKind) return false;
      return timesheetEmployeeRecordsMatch(line, other);
    });
    if (!clash) return line;
    const otherHeader = otherHeaders.find((item) => item.id === clash.headerId);
    skipped.push({
      employeeName: line.employeeName,
      employeeNo: String(line.employeeNo || line.employeeId || ''),
      bookedOn: otherSheetLabel(otherHeader),
    });
    return clearLineBooking(line);
  });
  return { lines: nextLines, skipped };
};

export const formatAlreadyBookedSkipNotice = (skipped: TimesheetAlreadyBookedSkip[]) => {
  if (!skipped.length) return '';
  const sample = skipped.slice(0, 4).map((item) => `${item.employeeName} (${item.employeeNo}) stays on ${item.bookedOn}`);
  const extra = skipped.length > 4 ? ` and ${skipped.length - 4} more` : '';
  return `Submitted without duplicating hours. ${sample.join('; ')}${extra}.`;
};
