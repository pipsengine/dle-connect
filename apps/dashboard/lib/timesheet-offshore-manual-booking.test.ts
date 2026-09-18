import assert from 'node:assert/strict';
import {
  canBookTimesheetHoursWithoutClock,
  isTimesheetAbsentLine,
  markLineAsManualOffshore,
  OFFSHORE_REMARKS_MARKER,
} from './timesheet-entry-shared.ts';
import {
  mobilizationCoversDate,
  mobilizationMatchesOffshoreSheet,
  resolveOffshoreTimesheetRoster,
  type TimesheetMobilization,
} from './timesheet-mobilization-store.ts';

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

const roster = resolveOffshoreTimesheetRoster(
  [{ employeeCode: 'C1686', employeeName: 'Micah' }],
  [{ employeeCode: 'C2663', employeeName: 'Jeremiah' }, { employeeCode: 'C1686', employeeName: 'Micah duplicate' }],
);
assert.deepEqual(roster.map((item) => item.employeeCode), ['C1686', 'C2663']);
assert.deepEqual(
  resolveOffshoreTimesheetRoster([], [{ employeeCode: 'C2534' }]).map((item) => item.employeeCode),
  ['C2534'],
);

const mobilization = {
  id: 'mob-1',
  employeeCode: 'C1686',
  employeeName: 'Micah Fred',
  homeWorkCenterName: 'Fitting',
  supervisorId: 'C1229',
  supervisorName: 'Shittu',
  projectCode: 'DL2601',
  projectName: 'Offshore',
  workCenterName: 'OFFSHORE · DL2601',
  locationName: 'OFFSHORE',
  startDate: '2026-08-17',
  endDate: null,
  status: 'Mobilized',
  reason: null,
  createdAt: '2026-08-17T00:00:00.000Z',
  createdBy: 'test',
  updatedAt: null,
  updatedBy: null,
} as TimesheetMobilization;
assert.equal(mobilizationCoversDate(mobilization, '2026-08-17'), true);
assert.equal(mobilizationMatchesOffshoreSheet(mobilization, {
  supervisorId: 'P0013 - Mr SAMUEL KARONWI',
  projectCode: 'DL2601',
  workCenterName: 'OFFSHORE · DL2601',
  crewCodes: ['C1686', 'C2663'],
}), true, 'Samuel can book his assigned crew even when the host supervisor field is Shittu');
assert.equal(mobilizationMatchesOffshoreSheet(mobilization, {
  supervisorId: 'P0013 - Mr SAMUEL KARONWI',
  projectCode: 'DL2601',
  crewCodes: ['C9999'],
}), false);

console.log('timesheet-offshore-manual-booking.test.ts: ok');
