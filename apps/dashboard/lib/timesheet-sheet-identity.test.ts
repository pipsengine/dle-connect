import assert from 'node:assert/strict';
import {
  buildTimesheetHeaderId,
  MIXED_TIMESHEET_WORK_CENTER,
  type TimesheetLine,
} from './timesheet-entry-shared.ts';
import {
  mergeDuplicateTimesheetSheetLines,
  preferAssignedTimesheetRoster,
  resolveTimesheetLineWorkCenter,
  selectCanonicalTimesheetHeader,
  summarizeTimesheetHeaderWorkCenter,
  timesheetHeaderMatchesSupervisorShift,
  workCenterNameFromJobTitle,
} from './timesheet-sheet-identity.ts';

assert.equal(
  buildTimesheetHeaderId({
    date: '2026-08-17',
    supervisorId: 'P0013 - Mr SAMUEL KARONWI',
    workCenterName: 'Blasting',
    shiftLabel: '01 (Day)',
    locationName: 'AGEGE',
  }),
  buildTimesheetHeaderId({
    date: '2026-08-17',
    supervisorId: 'P0013 - Mr SAMUEL KARONWI',
    workCenterName: 'Cutting',
    shiftLabel: '01 (Day)',
    locationName: 'AGEGE',
  }),
  'work centre is not part of the sheet id',
);

assert.notEqual(
  buildTimesheetHeaderId({
    date: '2026-08-17',
    supervisorId: 'P0013 - Mr SAMUEL KARONWI',
    shiftLabel: '01 (Day)',
    locationName: 'AGEGE',
  }),
  buildTimesheetHeaderId({
    date: '2026-08-17',
    supervisorId: 'P0013 - Mr SAMUEL KARONWI',
    shiftLabel: '01 (Day)',
    locationName: 'IDI-ORO',
  }),
);

assert.deepEqual(
  preferAssignedTimesheetRoster(['Shittu'], ['Shittu', 'Micah', 'Jeremiah']),
  ['Shittu'],
  'nested crews stay off the skip-level sheet',
);
assert.deepEqual(
  preferAssignedTimesheetRoster([], ['Micah']),
  ['Micah'],
  'reporting line is used only when nobody is assigned',
);

assert.equal(workCenterNameFromJobTitle('WELDING SUPERVISOR', ['Welding', 'Cutting', 'Blasting']), 'Welding');
assert.equal(workCenterNameFromJobTitle('PS - PRODUCTION SUPERVISOR', ['Welding', 'Cutting', 'Blasting']), '');
assert.equal(
  resolveTimesheetLineWorkCenter({
    employeeWorkCenter: 'Cutting',
    jobTitle: 'PRODUCTION SUPERVISOR',
    workCenterNames: ['Blasting', 'Cutting', 'Welding'],
  }),
  'Cutting',
);

assert.equal(summarizeTimesheetHeaderWorkCenter(['Cutting', 'Cutting']), 'Cutting');
assert.equal(summarizeTimesheetHeaderWorkCenter(['Cutting', 'Welding']), MIXED_TIMESHEET_WORK_CENTER);

const blasting = {
  id: 'hdr-blasting',
  timesheetDate: '2026-08-17',
  supervisorId: 'P0013 - Mr SAMUEL KARONWI',
  supervisorName: 'P0013 - Mr SAMUEL KARONWI',
  shiftLabel: '01 (Day)',
  locationName: 'AGEGE',
  workCenterName: 'Blasting',
  status: 'Draft',
};
const cutting = {
  ...blasting,
  id: 'hdr-cutting',
  workCenterName: 'Cutting',
};
assert.equal(timesheetHeaderMatchesSupervisorShift(blasting, {
  date: '2026-08-17',
  supervisorId: 'P0013',
  shiftLabel: '01 (Day)',
}), true);

const shittuLine = {
  id: 'line-shittu',
  headerId: 'hdr-cutting',
  employeeId: 'C1229',
  employeeNo: 'C1229',
  employeeName: 'Shittu',
  biometricId: '',
  attendanceId: null,
  clockIn: '07:46',
  clockOut: '17:07',
  attendanceDuration: 9,
  projectAllocations: [{ projectId: 'DL1985', projectCode: 'DL1985', projectName: 'Job', hours: 8, remarks: null }],
  idleAllocations: [],
  usedHours: 8,
  idleHours: 1,
  totalHours: 9,
  variance: 0,
  remarks: null,
  validationStatus: 'Valid',
  validationMessage: null,
  workCenterName: 'Cutting',
} as TimesheetLine;
const emptyBlastingLine = {
  ...shittuLine,
  id: 'line-blasting-empty',
  headerId: 'hdr-blasting',
  clockIn: null,
  clockOut: null,
  attendanceDuration: 0,
  projectAllocations: [],
  usedHours: 0,
  idleHours: 0,
  totalHours: 0,
  validationStatus: 'Incomplete',
  workCenterName: 'Blasting',
} as TimesheetLine;
const josephLine = {
  ...emptyBlastingLine,
  id: 'line-joseph',
  employeeId: 'C1544',
  employeeNo: 'C1544',
  employeeName: 'Joseph',
  workCenterName: 'Blasting',
} as TimesheetLine;

const canonical = selectCanonicalTimesheetHeader([blasting, cutting], {
  date: '2026-08-17',
  supervisorId: 'P0013 - Mr SAMUEL KARONWI',
  shiftLabel: '01 (Day)',
  locationName: 'AGEGE',
  preferredId: 'hdr-p0013-agege',
  linesByHeader: new Map([
    ['hdr-blasting', [emptyBlastingLine, josephLine]],
    ['hdr-cutting', [shittuLine]],
  ]),
});
assert.equal(canonical.header?.id, 'hdr-cutting', 'the sheet with booked hours is the Agege sheet');

const merged = mergeDuplicateTimesheetSheetLines({
  canonical: cutting,
  siblings: [blasting, cutting],
  lines: [shittuLine, emptyBlastingLine, josephLine],
});
assert.equal(merged.lines.length, 2, 'Shittu and Joseph share one Samuel Agege sheet');
assert.equal(merged.workCenterName, MIXED_TIMESHEET_WORK_CENTER);
assert.equal(merged.lines.find((line) => line.employeeNo === 'C1229')?.workCenterName, 'Cutting');
assert.equal(merged.lines.find((line) => line.employeeNo === 'C1544')?.workCenterName, 'Blasting');
assert.equal(merged.siblingWrites[0]?.lines.length, 0, 'the extra Blasting draft is emptied');

console.log('timesheet-sheet-identity.test.ts: ok');
