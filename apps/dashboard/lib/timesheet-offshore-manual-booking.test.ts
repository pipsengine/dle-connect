import assert from 'node:assert/strict';
import {
  canBookTimesheetHoursWithoutClock,
  formatOffshoreSheetLabel,
  isOffshoreLocationName,
  isOffshoreTimesheetContext,
  isTimesheetAbsentLine,
  isPaperAttendanceLine,
  preserveManualTimesheetBookings,
  markLineAsManualOffshore,
  buildManualOffshoreLine,
  buildPaperAttendanceLine,
  ensureOffshorePaidOvertime,
  weekdayOvertimeHoursFromLine,
  OFFSHORE_REMARKS_MARKER,
  OFFSHORE_PRODUCTIVE_HOURS,
  OFFSHORE_ALLOWANCE_HOURS,
  PAPER_ATTENDANCE_REMARKS_MARKER,
  resolveOffshoreProjectCode,
  resolveOffshoreSheetWorkCenter,
  timesheetOffshoreWorkCentersMatch,
  withOffshoreLocationName,
  withOffshoreTimesheetLocation,
} from './timesheet-entry-shared.ts';
import { validateTimesheetLine } from './timesheet-overtime-booking.ts';
import {
  mobilizationCoversDate,
  mobilizationMatchesOffshoreSheet,
  resolveOffshoreTimesheetRoster,
  selectOffshoreSheetMobilizations,
  toTimesheetDateOnly,
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
assert.equal(toTimesheetDateOnly(new Date(Date.UTC(2026, 7, 16))), '2026-08-16');
assert.equal(toTimesheetDateOnly('2026-08-16'), '2026-08-16');
assert.equal(toTimesheetDateOnly('Sun Aug 16 2026 01:00:00 GMT+0100'), '2026-08-16');
assert.equal(
  mobilizationCoversDate({ ...mobilization, startDate: '2026-08-16', endDate: '2026-09-15' }, '2026-08-16'),
  true,
  'first tour day is a bookable timesheet day',
);
assert.equal(
  mobilizationCoversDate({ ...mobilization, startDate: 'Sun Aug 16', endDate: 'Tue Sep 15' }, '2026-08-16'),
  false,
  'English date prefixes must not be treated as coverage dates',
);
assert.equal(resolveOffshoreSheetWorkCenter('DL2601', ['DL2601']), 'DL2601');
assert.equal(resolveOffshoreSheetWorkCenter('OFFSHORE', ['DL2601']), 'DL2601');
assert.equal(mobilizationCoversDate(mobilization, '2026-08-17'), true);
assert.equal(mobilizationMatchesOffshoreSheet(mobilization, {
  supervisorId: 'C1229 - SHITTU OLAWALE',
  projectCode: 'DL2601',
  workCenterName: 'DL2601',
}), true, 'host supervisor C1229 books people mobilized to him');
assert.equal(mobilizationMatchesOffshoreSheet(mobilization, {
  supervisorId: 'P0013 - Mr SAMUEL KARONWI',
  projectCode: 'DL2601',
  workCenterName: 'DL2601',
  crewCodes: [],
}), false, 'Samuel does not inherit Shittu nested crew just because the project matches');
assert.equal(mobilizationMatchesOffshoreSheet(mobilization, {
  supervisorId: 'P0013 - Mr SAMUEL KARONWI',
  projectCode: 'DL1811',
  workCenterName: 'DL1811',
  crewCodes: [],
}), false);

const dl2601Roster = [
  { employeeCode: 'C2663', supervisorId: 'C1229 - SHITTU OLAWALE' },
  { employeeCode: 'C1886', supervisorId: 'C1229 - SHITTU OLAWALE' },
  { employeeCode: 'C2834', supervisorId: 'C1229 - SHITTU OLAWALE' },
  { employeeCode: 'C2053', supervisorId: 'C1720 - ADANOU RAYMOND' },
  { employeeCode: 'C1844', supervisorId: 'P0013 - Mr SAMUEL KARONWI' },
  { employeeCode: 'C1229', supervisorId: 'P0013 - Mr SAMUEL KARONWI' },
].map((row, index) => ({
  ...mobilization,
  startDate: '2026-08-16',
  endDate: '2026-09-15',
  id: `mob-${index + 1}`,
  employeeCode: row.employeeCode,
  supervisorId: row.supervisorId,
  supervisorName: row.supervisorId,
}));
const shittuOffshore = selectOffshoreSheetMobilizations(dl2601Roster, {
  supervisorId: 'C1229 - SHITTU OLAWALE',
  projectCode: 'DL2601',
  workCenterName: 'DL2601',
});
assert.deepEqual(
  shittuOffshore.map((item) => item.employeeCode),
  ['C2663', 'C1886', 'C2834'],
  'Shittu books people hosted to him even if they are not on his home assigned roster',
);
const samuelOffshore = selectOffshoreSheetMobilizations(dl2601Roster, {
  supervisorId: 'P0013 - Mr SAMUEL KARONWI',
  projectCode: 'DL2601',
  workCenterName: 'DL2601',
});
assert.deepEqual(
  samuelOffshore.map((item) => item.employeeCode),
  ['C1844', 'C1229'],
  'Samuel books only people hosted to him, not nested crews',
);

assert.deepEqual(
  withOffshoreLocationName(['AGEGE', 'Onne Yard', 'SPIE']).includes('OFFSHORE'),
  true,
  'OFFSHORE stays in the location picker even without Sage or a mobilization',
);
assert.equal(withOffshoreLocationName(['AGEGE', 'OFFSHORE']).filter((name) => name === 'OFFSHORE').length, 1);
assert.equal(
  withOffshoreTimesheetLocation(
    [{ name: 'AGEGE', site: 'AGEGE', code: 'AGEGE' }],
    () => ({ name: 'OFFSHORE', site: 'OFFSHORE', code: 'OFFSHORE' }),
  ).some((item) => item.name === 'OFFSHORE'),
  true,
);

const offshoreBooked = buildManualOffshoreLine({
  headerId: 'hdr-1',
  employeeId: 'C1544',
  employeeNo: 'C1544',
  employeeName: 'Joseph Adeniyi',
  projectCode: 'DL2601',
  projectName: 'Offshore',
});
assert.equal(offshoreBooked.usedHours, OFFSHORE_PRODUCTIVE_HOURS);
assert.equal(offshoreBooked.idleHours, 1);
assert.equal(offshoreBooked.totalHours, OFFSHORE_PRODUCTIVE_HOURS + 1);
assert.equal(offshoreBooked.offshoreAllowanceHours, OFFSHORE_ALLOWANCE_HOURS);
assert.equal(isTimesheetAbsentLine(offshoreBooked), false);
assert.equal(weekdayOvertimeHoursFromLine(offshoreBooked, '2026-09-21'), 4, 'Monday offshore 12h books 4h WEEKDAYOVT');
assert.equal(weekdayOvertimeHoursFromLine(offshoreBooked, '2026-09-19'), 0, 'Saturday offshore hours are not WEEKDAYOVT');

const legacyEightHour = {
  ...offshoreBooked,
  projectAllocations: [{ ...offshoreBooked.projectAllocations[0], hours: 8 }],
  usedHours: 8,
  totalHours: 9,
};
const stampedTwelve = ensureOffshorePaidOvertime(legacyEightHour, 'DL2601', 'Offshore');
assert.equal(stampedTwelve.usedHours, 12, 'existing 8h offshore lines are stamped to 12h paid OT');
assert.ok(String(stampedTwelve.remarks || '').includes(OFFSHORE_REMARKS_MARKER));

const paperPresent = buildPaperAttendanceLine({
  headerId: 'hdr-2',
  employeeId: 'C2815',
  employeeNo: 'C2815',
  employeeName: 'Paul Okputu',
  projectCode: 'DL1811',
  projectName: 'Yard',
});
assert.equal(isPaperAttendanceLine(paperPresent), true);
assert.equal(isTimesheetAbsentLine(paperPresent), false);
assert.equal(paperPresent.usedHours, 8);
assert.equal(paperPresent.clockIn, null);
assert.ok(String(paperPresent.remarks || '').includes(PAPER_ATTENDANCE_REMARKS_MARKER));
assert.equal(canBookTimesheetHoursWithoutClock(paperPresent, 'Welding', 'Day (07:00-16:00)', 'AGEGE'), true);

const rosterWipe = {
  ...paperPresent,
  id: 'line-hdr-2-C2825',
  employeeId: 'C2825',
  employeeNo: 'C2825',
  employeeName: 'Akande Ismaila',
  usedHours: 0,
  idleHours: 0,
  totalHours: 0,
  remarks: null,
  projectAllocations: [],
  idleAllocations: [],
  attendanceMode: 'Biometric' as const,
  validationStatus: 'Incomplete' as const,
  validationMessage: 'Awaiting time allocation.',
};
const paperC2825 = {
  ...paperPresent,
  id: 'ts-paper-hdr-2-C2825',
  employeeId: '',
  employeeNo: 'C2825',
  employeeName: 'Akande Ismaila',
};
const restored = preserveManualTimesheetBookings([rosterWipe], [paperC2825]);
assert.equal(restored.length, 1);
assert.equal(restored[0]?.usedHours, 8, 'paper hours survive an empty attendance-sync rebuild');
assert.equal(isPaperAttendanceLine(restored[0]!), true);
assert.equal(restored[0]?.id, 'line-hdr-2-C2825', 'canonical roster id is kept after restore');

const keptExtra = preserveManualTimesheetBookings([], [paperC2825]);
assert.equal(keptExtra.length, 1, 'paper rows missing from the persist payload are not dropped');
assert.equal(keptExtra[0]?.employeeNo, 'C2825');

const trueAbsent = preserveManualTimesheetBookings([rosterWipe], [{ ...rosterWipe, remarks: null }]);
assert.equal(trueAbsent[0]?.usedHours, 0, 'true absent rows stay at 0h');

const supervisorBooked = {
  ...paperC2825,
  remarks: null,
  attendanceMode: 'Biometric' as const,
  projectAllocations: [{ projectId: 'DL2424', projectCode: 'DL2424', projectName: 'DL2424', hours: 8, remarks: null }],
};
const restoredBooked = preserveManualTimesheetBookings([rosterWipe], [supervisorBooked]);
assert.equal(restoredBooked[0]?.usedHours, 8, 'supervisor-booked hours survive even without PAPER_ATTENDANCE');
assert.equal(restoredBooked[0]?.projectAllocations[0]?.projectCode, 'DL2424');

const emptyPaperIncoming = {
  ...rosterWipe,
  remarks: PAPER_ATTENDANCE_REMARKS_MARKER,
  attendanceMode: 'Manual' as const,
  idleHours: 1,
  totalHours: 1,
};
const restoredEmptyPaper = preserveManualTimesheetBookings([emptyPaperIncoming], [paperC2825]);
assert.equal(restoredEmptyPaper[0]?.usedHours, 8, 'paper marker with 0h still restores prior 8h booking');

const offshoreValidated = validateTimesheetLine(
  offshoreBooked,
  [],
  [offshoreBooked],
  'DL2601',
  { enabled: true },
  { date: '2026-09-21', locationName: 'OFFSHORE', shiftLabel: '01 (Day)' },
);
assert.equal(offshoreValidated.validationStatus, 'Valid', 'standard 4h offshore OT does not need Overtime Management');
assert.equal(offshoreValidated.usedHours, 12);

console.log('timesheet-offshore-manual-booking.test.ts: ok');
