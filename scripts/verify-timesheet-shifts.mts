/**
 * Verify Day/Night shift catalog and overnight OT window helpers.
 * Run: npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/verify-timesheet-shifts.mts
 */
import {
  DEFAULT_TIMESHEET_SHIFT_LABEL,
  TIMESHEET_SHIFT_LABELS,
  attendanceDurationFromClock,
  impliedOvertimeHoursFromClock,
  resolveTimesheetShift,
} from '../apps/dashboard/lib/timesheet-entry-shared';

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

assert(TIMESHEET_SHIFT_LABELS.includes('01 (Day)'), 'Day shift must be listed');
assert(TIMESHEET_SHIFT_LABELS.includes('02 (Night)'), 'Night shift must be listed');
assert(DEFAULT_TIMESHEET_SHIFT_LABEL === '01 (Day)', 'Default shift is Day');

const night = resolveTimesheetShift('02 (Night)');
assert(night.kind === 'Night', 'Night kind');
assert(night.start === '18:00' && night.end === '02:00', 'Night window 18:00–02:00');

assert(attendanceDurationFromClock('18:00', '02:00') === 8, `Night span should be 8h, got ${attendanceDurationFromClock('18:00', '02:00')}`);
assert(attendanceDurationFromClock('18:00', '04:00') === 10, 'Night span to 04:00 should be 10h');

assert(impliedOvertimeHoursFromClock('18:00', '02:00', '02 (Night)') === 0, 'Exact 02:00 end has no OT');
assert(impliedOvertimeHoursFromClock('18:00', '04:00', '02 (Night)') === 2, '04:00 clock-out implies 2h OT after 02:00');
assert(impliedOvertimeHoursFromClock('18:00', '05:30', '02 (Night)') === 3.5, '05:30 implies 3.5h OT');
assert(impliedOvertimeHoursFromClock('08:00', '19:00', '01 (Day)') === 2, 'Day OT after 17:00');
assert(impliedOvertimeHoursFromClock('18:00', '23:00', '02 (Night)') === 0, 'Same-evening out before midnight is still within night window');

console.log('verify-timesheet-shifts: OK');
process.exit(0);
