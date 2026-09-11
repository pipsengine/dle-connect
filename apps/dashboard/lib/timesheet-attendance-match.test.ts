import assert from 'node:assert/strict';
import { clockingRecordsForSupervisorCrew, timesheetAttendanceMatchKeys } from './timesheet-attendance-match.ts';

const keys = new Set(timesheetAttendanceMatchKeys('C2225', 'ABEL DANIEL'));
assert.equal(keys.has('C2225'), true);

const day = [
  { employeeId: 'C2225', employeeName: 'ABEL DANIEL', location: 'Unassigned', site: 'Biometric Terminal' },
  { employeeId: 'C1001', employeeName: 'JIMOH GBADAMOSI', location: 'AGEGE', site: 'AGEGE' },
  { employeeId: 'P0277', employeeName: 'SOMEONE ELSE', location: 'AGEGE', site: 'AGEGE' },
];

const crew = clockingRecordsForSupervisorCrew(day, keys);
assert.equal(crew.length, 1);
assert.equal(crew[0]?.employeeId, 'C2225');

const numericPunch = clockingRecordsForSupervisorCrew(
  [{ employeeId: '2225', employeeName: 'ABEL DANIEL', location: 'Unassigned', site: 'Gate' }],
  keys,
);
assert.equal(numericPunch.length, 1);

console.log('timesheet-attendance-match.test.ts: ok');
