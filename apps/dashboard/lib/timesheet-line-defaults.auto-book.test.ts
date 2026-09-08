import assert from 'node:assert/strict';
import {
  ensureClockedLinesHaveProjectAllocation,
  resolveBookableTimesheetProject,
} from '@/lib/timesheet-line-defaults';
import type { TimesheetLine } from '@/lib/timesheet-entry-shared';

const dayContext = { date: '2026-08-17', holidayDates: [] as string[], shiftLabel: '01 (Day)' };

const baseLine = (overrides: Partial<TimesheetLine> = {}): TimesheetLine => ({
  id: 'line-1',
  headerId: 'hdr-1',
  employeeId: 'C1931',
  employeeNo: 'C1931',
  employeeName: 'EZEKIEL ABIODUN',
  biometricId: null,
  attendanceId: null,
  clockIn: '07:36',
  clockOut: '16:50',
  attendanceDuration: 9.2,
  projectAllocations: [],
  idleAllocations: [],
  usedHours: 0,
  idleHours: 0,
  totalHours: 0,
  variance: 0,
  remarks: null,
  validationStatus: 'Incomplete',
  validationMessage: 'Awaiting time allocation.',
  ...overrides,
});

const projects = [
  { id: 'p1', code: 'DL1985', name: 'Primary', projectManager: 'PM One', status: 'Active' },
  { id: 'p2', code: 'DL9999', name: 'Other', projectManager: 'PM Two', status: 'Active' },
];

assert.equal(resolveBookableTimesheetProject(projects)?.code, 'DL1985');
assert.equal(resolveBookableTimesheetProject([{ ...projects[1], projectManager: '' }]), null);

const result = ensureClockedLinesHaveProjectAllocation([baseLine()], projects, dayContext);
assert.equal(result.bookedCount, 1);
assert.equal(result.projectCode, 'DL1985');
assert.equal(result.lines[0].usedHours, 8);
assert.equal(result.lines[0].idleHours, 1);
assert.equal(result.lines[0].totalHours, 9);
assert.equal(result.lines[0].validationStatus, 'Valid');
assert.equal(result.lines[0].projectAllocations[0]?.projectCode, 'DL1985');

const alreadyBooked = ensureClockedLinesHaveProjectAllocation(
  [baseLine({
    projectAllocations: [{ projectId: 'p2', projectCode: 'DL9999', projectName: 'Other', hours: 8, remarks: null }],
    usedHours: 8,
    idleHours: 1,
    totalHours: 9,
    validationStatus: 'Valid',
  })],
  projects,
  dayContext,
);
assert.equal(alreadyBooked.bookedCount, 0);
assert.equal(alreadyBooked.lines[0].projectAllocations[0]?.projectCode, 'DL9999');

const absent = ensureClockedLinesHaveProjectAllocation(
  [baseLine({ clockIn: null, clockOut: null, attendanceDuration: 0 })],
  projects,
  dayContext,
);
assert.equal(absent.bookedCount, 0);

console.log('timesheet-line-defaults auto-book tests passed');
