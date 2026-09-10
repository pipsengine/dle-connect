import assert from 'node:assert/strict';
import { releaseLinesAlreadyBookedElsewhere } from './timesheet-booking-clash.ts';
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

const blasting = { id: 'hdr-blasting', timesheetDate: '2026-09-07', shiftLabel: '01 (Day)', workCenterName: 'Blasting', supervisorName: 'P0277 - Mr ADEBOBOLA MORUF AKINSANYA' };
const galvanizing = { id: 'hdr-galvanizing', timesheetDate: '2026-09-07', shiftLabel: '01 (Day)', workCenterName: 'Galvanizing', supervisorName: 'P0277 - Mr ADEBOBOLA MORUF AKINSANYA' };

const result = releaseLinesAlreadyBookedElsewhere(
  [line({}), line({ id: 'line-2', employeeId: 'C1720', employeeNo: 'C1720', employeeName: 'ADANOU RAYMOND' })],
  blasting,
  [blasting, galvanizing],
  [
    line({ headerId: 'hdr-galvanizing' }),
  ],
);

assert.equal(result.skipped.length, 1);
assert.equal(result.skipped[0]?.employeeNo, 'C2225');
assert.match(result.skipped[0]?.bookedOn || '', /Galvanizing/);
assert.equal(result.lines[0]?.usedHours, 0);
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

console.log('timesheet-booking-clash.test.ts: ok');
