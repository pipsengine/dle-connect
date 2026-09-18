import assert from 'node:assert/strict';
import {
  canBookTimesheetHoursWithoutClock,
  isTimesheetAbsentLine,
  markLineAsManualOffshore,
  OFFSHORE_REMARKS_MARKER,
} from './timesheet-entry-shared.ts';

const absentLine = { clockIn: null, attendanceMode: 'Biometric' as const, remarks: null };
assert.equal(isTimesheetAbsentLine(absentLine), true);
assert.equal(canBookTimesheetHoursWithoutClock(absentLine, 'Welding', 'Day (07:00-16:00)'), false);

const stamped = markLineAsManualOffshore(absentLine);
assert.equal(stamped.attendanceMode, 'Manual');
assert.ok(String(stamped.remarks || '').includes(OFFSHORE_REMARKS_MARKER));
assert.equal(isTimesheetAbsentLine(stamped), false);
assert.equal(canBookTimesheetHoursWithoutClock(stamped, 'Welding', 'Day (07:00-16:00)'), true);

assert.equal(
  canBookTimesheetHoursWithoutClock(absentLine, 'OFFSHORE · DL1811', 'Day (07:00-16:00)'),
  true,
);
assert.equal(
  canBookTimesheetHoursWithoutClock(absentLine, 'Welding', 'Night (18:00-02:00)'),
  true,
);

console.log('timesheet-offshore-manual-booking.test.ts: ok');
