import assert from 'node:assert/strict';
import {
  displaceUncommittedBookingsOnOtherDrafts,
  findSameDayBookingConflicts,
  formatSupervisorBookingConflictMessage,
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
assert.equal(submittedAutoBook.skipped.length, 1);

const preview = findSameDayBookingConflicts(
  [line({ usedHours: 0, projectAllocations: [] })],
  blasting,
  [blasting, galvanizing],
  [line({ headerId: 'hdr-galvanizing' })],
);
assert.equal(preview.length, 0);

const submittedGalvanizingPreview = findSameDayBookingConflicts(
  [line({ usedHours: 0, projectAllocations: [] })],
  blasting,
  [blasting, { ...galvanizing, status: 'Submitted' }],
  [line({ headerId: 'hdr-galvanizing' })],
);
assert.equal(submittedGalvanizingPreview.length, 1);
assert.equal(submittedGalvanizingPreview[0]?.bookedOn, 'Galvanizing');
assert.match(
  formatSupervisorBookingConflictMessage(submittedGalvanizingPreview),
  /ABEL DANIEL already has hours on Galvanizing today/,
);
assert.equal(
  formatSupervisorBookingConflictMessage(submittedGalvanizingPreview, { allBookedAreConflicts: true }),
  'Every worker with hours here is already on another timesheet today. There is nothing new to submit on this sheet.',
);

const maintenanceKeepsCrew = findSameDayBookingConflicts(
  [line({ headerId: 'hdr-maintenance', usedHours: 8 })],
  maintenance,
  [maintenance, galvanizing],
  [line({ headerId: 'hdr-galvanizing' })],
);
assert.equal(maintenanceKeepsCrew.length, 0);

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

console.log('timesheet-booking-clash.test.ts: ok');
