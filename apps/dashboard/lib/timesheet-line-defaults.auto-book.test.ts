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
  { id: 'p2', code: 'DL9999', name: 'Other', projectManager: 'PM Two', status: 'Active' },
  { id: 'p1', code: 'DL1985', name: 'Legacy Preferred', projectManager: 'PM One', status: 'Active' },
];

assert.equal(resolveBookableTimesheetProject(projects), null);
assert.equal(resolveBookableTimesheetProject(projects, 'DL1985')?.code, 'DL1985');
assert.equal(
  resolveBookableTimesheetProject([{ id: 'p-dl0062', code: 'DL0062', name: 'Agege', projectManager: '', status: 'Active' }], 'DL0062')?.code,
  'DL0062',
);

const emptySync = ensureClockedLinesHaveProjectAllocation([baseLine()], projects, dayContext);
assert.equal(emptySync.bookedCount, 0);
assert.equal(emptySync.projectCode, null);

const result = ensureClockedLinesHaveProjectAllocation(
  [
    baseLine({
      projectAllocations: [{ projectId: 'p1', projectCode: 'DL1985', projectName: 'Legacy Preferred', hours: 8, remarks: null }],
      usedHours: 8,
    }),
    baseLine({ id: 'line-2', employeeId: 'C1720', employeeNo: 'C1720', employeeName: 'ADANOU' }),
  ],
  projects,
  dayContext,
);
assert.equal(result.bookedCount, 1);
assert.equal(result.projectCode, 'DL1985');
assert.equal(result.lines[1]?.projectAllocations[0]?.projectCode, 'DL1985');

const alreadyBooked = ensureClockedLinesHaveProjectAllocation(
  [baseLine({
    projectAllocations: [{ projectId: 'p1', projectCode: 'DL1985', projectName: 'Legacy Preferred', hours: 8, remarks: null }],
    usedHours: 8,
    idleHours: 1,
    totalHours: 9,
    validationStatus: 'Valid',
  })],
  projects,
  dayContext,
);
assert.equal(alreadyBooked.bookedCount, 0);
assert.equal(alreadyBooked.lines[0].projectAllocations[0]?.projectCode, 'DL1985');

const absent = ensureClockedLinesHaveProjectAllocation(
  [baseLine({ clockIn: null, clockOut: null, attendanceDuration: 0 })],
  projects,
  dayContext,
);
assert.equal(absent.bookedCount, 0);

console.log('timesheet-line-defaults auto-book tests passed');
