import assert from 'node:assert/strict';
import {
  buildTimesheetHeaderId,
  MIXED_TIMESHEET_WORK_CENTER,
  type TimesheetLine,
} from './timesheet-entry-shared.ts';
import {
  mergeDuplicateTimesheetSheetLines,
  overlayMissingTimesheetClocks,
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
  'without codes, assigned crew stays exclusive',
);
assert.deepEqual(
  preferAssignedTimesheetRoster([], ['Micah']),
  ['Micah'],
  'reporting line is used only when nobody is assigned',
);
assert.deepEqual(
  preferAssignedTimesheetRoster(
    [{ employeeCode: 'C2236' }],
    [{ employeeCode: 'C2236' }, { employeeCode: 'C2410' }],
    {
      codeOf: (item) => item.employeeCode,
      assignedToOtherCodes: [],
    },
  ).map((item) => item.employeeCode).sort(),
  ['C2236', 'C2410'],
  'unassigned direct reports stay on a partial assignment sheet',
);
assert.deepEqual(
  preferAssignedTimesheetRoster(
    [{ employeeCode: 'P0044' }],
    [{ employeeCode: 'P0044' }, { employeeCode: 'C2410' }, { employeeCode: 'C1544' }],
    {
      codeOf: (item) => item.employeeCode,
      assignedToOtherCodes: ['C1544', 'C2410'],
    },
  ).map((item) => item.employeeCode),
  ['P0044'],
  'crew assigned to another supervisor stay off the skip-level sheet',
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

const abelAbsent = {
  ...emptyBlastingLine,
  id: 'line-abel-mixed',
  headerId: 'hdr-mixed',
  employeeId: 'C2225',
  employeeNo: 'C2225',
  employeeName: 'ABEL DANIEL',
  workCenterName: 'Machining',
} as TimesheetLine;
const abelClockedOnOwnSheet = {
  ...abelAbsent,
  id: 'line-abel-own',
  headerId: 'hdr-abel-cutting',
  clockIn: '07:26',
  clockOut: '17:42',
  attendanceDuration: 9.3,
  biometricId: 'live-clock-day-20260909-1239',
} as TimesheetLine;
const abelOnSamuel = overlayMissingTimesheetClocks([abelAbsent], [abelClockedOnOwnSheet]);
assert.equal(abelOnSamuel[0]?.clockIn, '07:26', 'Abel stays present on Samuel Agege even when clocks live on his own sheet');
assert.equal(abelOnSamuel[0]?.clockOut, '17:42');

const mergedReviewedClocks = mergeDuplicateTimesheetSheetLines({
  canonical: { ...cutting, id: 'hdr-mixed', status: 'Supervisor_Reviewed' },
  siblings: [{ ...blasting, status: 'Supervisor_Reviewed' }],
  lines: [abelAbsent, { ...abelClockedOnOwnSheet, headerId: 'hdr-blasting' }],
});
assert.equal(mergedReviewedClocks.lines[0]?.clockIn, '07:26', 'reviewed Blasting leftover still donates Abel’s punch');

const unlocatedYard = {
  ...blasting,
  id: 'hdr-unlocated',
  locationName: '',
};
const offshoreHeaderPick = selectCanonicalTimesheetHeader([unlocatedYard, blasting], {
  date: '2026-08-17',
  supervisorId: 'P0013 - Mr SAMUEL KARONWI',
  shiftLabel: '01 (Day)',
  locationName: 'OFFSHORE',
  supervisorHomeLocation: 'AGEGE',
});
assert.equal(offshoreHeaderPick.header, null, 'Offshore never adopts the Agege yard sheet');

console.log('timesheet-sheet-identity.test.ts: ok');
