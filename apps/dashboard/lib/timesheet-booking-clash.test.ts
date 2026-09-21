import assert from 'node:assert/strict';
import {
  displaceUncommittedBookingsOnOtherDrafts,
  employeeAlreadyCommittedOnOtherTimesheet,
  findSameDayBookingConflicts,
  releaseLinesAlreadyBookedElsewhere,
} from './timesheet-booking-clash.ts';
import type { TimesheetLine } from './timesheet-entry-shared.ts';

const line = (overrides: Partial<TimesheetLine>): TimesheetLine => ({
  id: 'line-1',
  headerId: 'hdr-blasting',
  employeeId: 'C2225',
  employeeNo: 'C2225',
  employeeName: 'ABEL DANIEL',
  biometricId: null,
  attendanceId: null,
  clockIn: '07:17',
  clockOut: '17:44',
  attendanceDuration: 10.4,
  projectAllocations: [{ projectId: 'p1', projectCode: 'DL1985', projectName: 'Blasting', hours: 8, remarks: null }],
  idleAllocations: [],
  usedHours: 8,
  idleHours: 1,
  totalHours: 9,
  variance: 0,
  remarks: null,
  validationStatus: 'Valid',
  validationMessage: null,
  ...overrides,
});

const blasting = { id: 'hdr-blasting', timesheetDate: '2026-09-07', shiftLabel: '01 (Day)', workCenterName: 'Blasting', supervisorName: 'P0277 - Mr ADEBOBOLA MORUF AKINSANYA', status: 'Draft' };
const galvanizing = { id: 'hdr-galvanizing', timesheetDate: '2026-09-07', shiftLabel: '01 (Day)', workCenterName: 'Galvanizing', supervisorName: 'P0277 - Mr ADEBOBOLA MORUF AKINSANYA', status: 'Draft' };
const maintenance = { id: 'hdr-maintenance', timesheetDate: '2026-09-07', shiftLabel: '01 (Day)', workCenterName: 'Maintenance', supervisorName: 'P0436 - Mr SUNDAY OKEWU', status: 'Draft' };

const result = releaseLinesAlreadyBookedElsewhere(
  [line({}), line({ id: 'line-2', employeeId: 'C1720', employeeNo: 'C1720', employeeName: 'ADANOU RAYMOND' })],
  blasting,
  [blasting, galvanizing],
  [
    line({ headerId: 'hdr-galvanizing' }),
  ],
);

assert.equal(result.skipped.length, 0);
assert.equal(result.lines[0]?.usedHours, 8);
assert.equal(result.lines[1]?.usedHours, 8);

const distinctContract = releaseLinesAlreadyBookedElsewhere(
  [line({ employeeId: 'C1001', employeeNo: 'C1001', employeeName: 'JIMOH GBADAMOSI' })],
  blasting,
  [blasting, galvanizing],
  [line({
    headerId: 'hdr-galvanizing',
    employeeId: '1001',
    employeeNo: '1001',
    employeeName: 'Someone Else',
  })],
);

assert.equal(distinctContract.skipped.length, 0);

const autoBookedGalvanizing = line({
  headerId: 'hdr-galvanizing',
  projectAllocations: [{ projectId: 'p1', projectCode: 'DL9999', projectName: 'Misc', hours: 8, remarks: 'Auto-booked from biometric attendance.' }],
});
const ignoreDraftAutoBook = releaseLinesAlreadyBookedElsewhere(
  [line({ projectAllocations: [{ projectId: 'p2', projectCode: 'DL0062', projectName: 'Cutting job', hours: 8, remarks: null }] })],
  { ...blasting, workCenterName: 'Cutting', supervisorId: 'C2225', status: 'Draft' },
  [
    { ...blasting, workCenterName: 'Cutting', supervisorId: 'C2225', status: 'Draft' },
    { ...galvanizing, supervisorId: 'P0277', status: 'Draft' },
  ],
  [autoBookedGalvanizing],
);
assert.equal(ignoreDraftAutoBook.skipped.length, 0);
assert.equal(ignoreDraftAutoBook.lines[0]?.usedHours, 8);

const submittedAutoBook = releaseLinesAlreadyBookedElsewhere(
  [line({})],
  blasting,
  [blasting, { ...galvanizing, status: 'Submitted' }],
  [autoBookedGalvanizing],
);
assert.equal(submittedAutoBook.skipped.length, 0, 'same-supervisor auto-book on another work centre does not lock typed hours');

const preview = findSameDayBookingConflicts(
  [line({ usedHours: 0, projectAllocations: [] })],
  blasting,
  [blasting, galvanizing],
  [line({ headerId: 'hdr-galvanizing' })],
);
assert.equal(preview.length, 0);

const clockOnlyOnSubmittedClash = findSameDayBookingConflicts(
  [line({ usedHours: 0, projectAllocations: [] })],
  blasting,
  [blasting, { ...galvanizing, status: 'Submitted' }],
  [line({ headerId: 'hdr-galvanizing' })],
);
assert.equal(clockOnlyOnSubmittedClash.length, 0, 'clock-only rows are not a second booking');
assert.equal(
  employeeAlreadyCommittedOnOtherTimesheet(
    line({ usedHours: 0, projectAllocations: [] }),
    blasting,
    [blasting, { ...galvanizing, status: 'Submitted' }],
    [line({ headerId: 'hdr-galvanizing' })],
  ),
  false,
  'same supervisor duplicate work-centre headers do not hide the crew',
);

const submittedGalvanizingPreview = findSameDayBookingConflicts(
  [line({})],
  blasting,
  [blasting, { ...galvanizing, status: 'Submitted' }],
  [line({ headerId: 'hdr-galvanizing' })],
);
assert.equal(submittedGalvanizingPreview.length, 0, 'Akinsanya blasting vs galvanizing is one supervisor sheet');

const fitting = { id: 'hdr-fitting', timesheetDate: '2026-09-07', shiftLabel: '01 (Day)', workCenterName: 'Fitting', supervisorName: 'C1882 - MOMOH MOHAMMED', supervisorId: 'C1882', status: 'Submitted' };
const galvanizingSubmitted = { ...galvanizing, status: 'Submitted' as const };

const momohKeepsAssignedCrew = findSameDayBookingConflicts(
  [line({
    headerId: 'hdr-fitting',
    employeeId: 'C2422',
    employeeNo: 'C2422',
    employeeName: 'DAVID UDEH',
    usedHours: 8,
  })],
  fitting,
  [fitting, galvanizingSubmitted],
  [line({
    headerId: 'hdr-galvanizing',
    employeeId: 'C2422',
    employeeNo: 'C2422',
    employeeName: 'UDEH ANTHONY ANTHONY DAVID',
  })],
);
assert.equal(momohKeepsAssignedCrew.length, 0);

const displacedSubmittedForeign = displaceUncommittedBookingsOnOtherDrafts(
  [line({
    headerId: 'hdr-fitting',
    employeeId: 'C2422',
    employeeNo: 'C2422',
    employeeName: 'DAVID UDEH',
    usedHours: 8,
    projectAllocations: [{ projectId: 'p2', projectCode: 'DL0062', projectName: 'Fitting', hours: 8, remarks: null }],
  })],
  fitting,
  [fitting, galvanizingSubmitted],
  [line({
    headerId: 'hdr-galvanizing',
    employeeId: 'C2422',
    employeeNo: 'C2422',
    employeeName: 'UDEH ANTHONY ANTHONY DAVID',
  })],
);
assert.equal(displacedSubmittedForeign.length, 1);
assert.equal(displacedSubmittedForeign[0]?.header.id, 'hdr-galvanizing');
assert.equal(displacedSubmittedForeign[0]?.lines[0]?.usedHours, 0);

const displaced = displaceUncommittedBookingsOnOtherDrafts(
  [line({ headerId: 'hdr-maintenance', usedHours: 8, projectAllocations: [{ projectId: 'p2', projectCode: 'DL2423', projectName: 'Maintenance', hours: 8, remarks: null }] })],
  maintenance,
  [maintenance, galvanizing],
  [line({ headerId: 'hdr-galvanizing' })],
);
assert.equal(displaced.length, 1);
assert.equal(displaced[0]?.header.id, 'hdr-galvanizing');
assert.equal(displaced[0]?.lines[0]?.usedHours, 0);

const breakOnlyOtherSheet = findSameDayBookingConflicts(
  [line({ usedHours: 0, projectAllocations: [] })],
  blasting,
  [blasting, galvanizing],
  [line({
    headerId: 'hdr-galvanizing',
    usedHours: 0,
    idleHours: 1,
    totalHours: 1,
    projectAllocations: [],
  })],
);
assert.equal(breakOnlyOtherSheet.length, 0);

const karonwiMixed = {
  id: 'hdr-mixed',
  timesheetDate: '2026-09-09',
  shiftLabel: '01 (Day)',
  workCenterName: 'Mixed',
  supervisorId: 'P0013 - Mr SAMUEL KARONWI',
  supervisorName: 'P0013 - Mr SAMUEL KARONWI',
  status: 'Submitted',
};
const karonwiBlasting = {
  id: 'hdr-karonwi-blasting',
  timesheetDate: '2026-09-09',
  shiftLabel: '01 (Day)',
  workCenterName: 'Blasting',
  supervisorId: 'P0013 - Mr SAMUEL KARONWI',
  supervisorName: 'P0013 - Mr SAMUEL KARONWI',
  status: 'Supervisor_Reviewed',
};
const abelAutoBookedBlasting = line({
  id: 'line-blasting-abel',
  headerId: 'hdr-karonwi-blasting',
  projectAllocations: [{
    projectId: 'p1',
    projectCode: 'DL1985',
    projectName: 'Blasting',
    hours: 8,
    remarks: 'Auto-booked from biometric attendance.',
  }],
});
const abelTypedOnMixed = line({
  id: 'line-mixed-abel',
  headerId: 'hdr-mixed',
  usedHours: 8,
  projectAllocations: [{ projectId: 'p2', projectCode: 'DL2421', projectName: 'Fitting', hours: 8, remarks: null }],
});
const nestedSupervisorKeepsTypedHours = releaseLinesAlreadyBookedElsewhere(
  [abelTypedOnMixed],
  karonwiMixed,
  [karonwiMixed, karonwiBlasting],
  [abelAutoBookedBlasting],
);
assert.equal(nestedSupervisorKeepsTypedHours.skipped.length, 0);
assert.equal(nestedSupervisorKeepsTypedHours.lines[0]?.usedHours, 8);

const displacedSameSupervisorAutoBook = displaceUncommittedBookingsOnOtherDrafts(
  [abelTypedOnMixed],
  karonwiMixed,
  [karonwiMixed, karonwiBlasting],
  [abelAutoBookedBlasting],
);
assert.equal(displacedSameSupervisorAutoBook.length, 1);
assert.equal(displacedSameSupervisorAutoBook[0]?.header.id, 'hdr-karonwi-blasting');
assert.equal(displacedSameSupervisorAutoBook[0]?.lines[0]?.usedHours, 0);

console.log('timesheet-booking-clash.test.ts: ok');
