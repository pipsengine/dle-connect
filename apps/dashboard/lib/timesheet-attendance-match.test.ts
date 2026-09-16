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

const reversedName = new Set(timesheetAttendanceMatchKeys('C0585', 'BELLO FEMI'));
assert.equal(
  reversedName.has('N:BELLO|FEMI'),
  true,
);
assert.equal(
  timesheetAttendanceMatchKeys('C0585', 'FEMI BELLO').some((key) => reversedName.has(key)),
  true,
  'FEMI BELLO should match BELLO FEMI',
);

const momohHris = new Set(timesheetAttendanceMatchKeys('C1882', 'MOMOH MOHAMMED'));
assert.equal(
  timesheetAttendanceMatchKeys('C11882', 'Mohammed Momoh').some((key) => momohHris.has(key)),
  true,
  'C11882 Mohammed Momoh should match C1882 MOMOH MOHAMMED',
);
assert.equal(
  timesheetAttendanceMatchKeys('C1882', 'Mohammed Momoh').some((key) => momohHris.has(key)),
  true,
);

console.log('timesheet-attendance-match.test.ts: ok');
