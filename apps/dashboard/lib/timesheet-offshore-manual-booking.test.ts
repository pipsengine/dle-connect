import assert from 'node:assert/strict';
import {
  canBookTimesheetHoursWithoutClock,
  formatOffshoreSheetLabel,
  isOffshoreLocationName,
  isOffshoreTimesheetContext,
  isTimesheetAbsentLine,
  markLineAsManualOffshore,
  OFFSHORE_REMARKS_MARKER,
  resolveOffshoreProjectCode,
  timesheetOffshoreWorkCentersMatch,
} from './timesheet-entry-shared.ts';
import {
  mobilizationCoversDate,
  mobilizationMatchesOffshoreSheet,
  resolveOffshoreTimesheetRoster,
  type TimesheetMobilization,
} from './timesheet-mobilization-store.ts';

const absentLine = { clockIn: null, attendanceMode: 'Biometric' as const, remarks: null };
assert.equal(isTimesheetAbsentLine(absentLine), true);
assert.equal(canBookTimesheetHoursWithoutClock(absentLine, 'Welding', 'Day (07:00-16:00)', 'AGEGE'), false);

const stamped = markLineAsManualOffshore(absentLine);
assert.equal(stamped.attendanceMode, 'Manual');
assert.ok(String(stamped.remarks || '').includes(OFFSHORE_REMARKS_MARKER));
assert.equal(isTimesheetAbsentLine(stamped), false);
assert.equal(canBookTimesheetHoursWithoutClock(stamped, 'Welding', 'Day (07:00-16:00)'), true);

assert.equal(isOffshoreLocationName('OFFSHORE'), true);
assert.equal(isOffshoreTimesheetContext('OFFSHORE', 'DL2601'), true);
assert.equal(isOffshoreTimesheetContext('AGEGE', 'Cutting'), false);
assert.equal(resolveOffshoreProjectCode('OFFSHORE · DL2601'), 'DL2601');
assert.equal(resolveOffshoreProjectCode('DL2601', 'OFFSHORE'), 'DL2601');
assert.equal(timesheetOffshoreWorkCentersMatch('OFFSHORE · DL2601', 'DL2601', 'OFFSHORE'), true);
assert.equal(formatOffshoreSheetLabel('DL2601'), 'OFFSHORE · DL2601');

assert.equal(
  canBookTimesheetHoursWithoutClock(absentLine, 'OFFSHORE · DL1811', 'Day (07:00-16:00)'),
  true,
  'legacy offshore work-centre names still book without a clock',
);
assert.equal(
  canBookTimesheetHoursWithoutClock(absentLine, 'DL2601', 'Day (07:00-16:00)', 'OFFSHORE'),
  true,
  'location OFFSHORE + project work centre books without a clock',
);
assert.equal(
  canBookTimesheetHoursWithoutClock(absentLine, 'Welding', 'Day (07:00-16:00)', 'AGEGE'),
  false,
);
assert.equal(
  canBookTimesheetHoursWithoutClock(absentLine, 'Welding', 'Night (18:00-02:00)'),
  true,
);

const roster = resolveOffshoreTimesheetRoster(
  [{ employeeCode: 'C1686', employeeName: 'Micah' }],
  [{ employeeCode: 'C2663', employeeName: 'Jeremiah' }, { employeeCode: 'C1686', employeeName: 'Micah duplicate' }],
);
assert.deepEqual(roster.map((item) => item.employeeCode), ['C1686'], 'home crew never fills an offshore sheet');
assert.deepEqual(
  resolveOffshoreTimesheetRoster([], [{ employeeCode: 'C2534' }]).map((item) => item.employeeCode),
  [],
  'assigned supervisor crew is not treated as mobilized',
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
  workCenterName: 'DL2601',
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
  workCenterName: 'DL2601',
  crewCodes: [],
}), true, 'DL2601 timesheet lists everyone mobilized to that project, not only the selected host');
assert.equal(mobilizationMatchesOffshoreSheet(mobilization, {
  supervisorId: 'P0013 - Mr SAMUEL KARONWI',
  projectCode: 'DL1811',
  workCenterName: 'DL1811',
  crewCodes: [],
}), false);

const dl2601Roster = [
  { employeeCode: 'C2663', supervisorId: 'C1229 - SHITTU OLAWALE' },
  { employeeCode: 'C1686', supervisorId: 'C1229 - SHITTU OLAWALE' },
  { employeeCode: 'C2534', supervisorId: 'C1229 - SHITTU OLAWALE' },
  { employeeCode: 'C2823', supervisorId: 'C1720 - ADANOU RAYMOND' },
  { employeeCode: 'C1544', supervisorId: 'P0013 - Mr SAMUEL KARONWI' },
  { employeeCode: 'C1229', supervisorId: 'P0013 - Mr SAMUEL KARONWI' },
].map((row, index) => ({
  ...mobilization,
  id: `mob-${index + 1}`,
  employeeCode: row.employeeCode,
  supervisorId: row.supervisorId,
}));
const matched = dl2601Roster.filter((item) => mobilizationMatchesOffshoreSheet(item, {
  supervisorId: 'P0013 - Mr SAMUEL KARONWI (5)',
  projectCode: 'DL2601',
  workCenterName: 'DL2601',
  crewCodes: [],
}));
assert.deepEqual(matched.map((item) => item.employeeCode), ['C2663', 'C1686', 'C2534', 'C2823', 'C1544', 'C1229']);

console.log('timesheet-offshore-manual-booking.test.ts: ok');
