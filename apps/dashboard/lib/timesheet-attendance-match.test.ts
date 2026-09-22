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

assert.equal(
  timesheetAttendanceMatchKeys('C1607 - OJIKA').includes('C1607'),
  true,
  'embedded C1607 in biometric name must match the Cutting roster',
);
assert.equal(
  timesheetAttendanceMatchKeys('C1607', 'OJIKA CHUKWUDUMEBI').some((key) =>
    timesheetAttendanceMatchKeys('C1607', 'OJIKA CHUKWUDUME').includes(key),
  ),
  true,
  '16-char biometric truncation OJIKA CHUKWUDUME must match OJIKA CHUKWUDUMEBI',
);

const aziekweHris = new Set(timesheetAttendanceMatchKeys('C2585', 'EMMANUEL AZIEKWE'));
assert.equal(
  timesheetAttendanceMatchKeys('C1734', 'EMMANUEL AZIEKWE').some((key) => aziekweHris.has(key)),
  true,
  'biometric C1734 Emmanuel Aziekwe must match HRIS C2585',
);
assert.equal(
  clockingRecordsForSupervisorCrew(
    [{ employeeId: 'C1734', employeeName: 'EMMANUEL AZIEKWE', location: 'Unassigned', site: 'Gate' }],
    aziekweHris,
  ).length,
  1,
  'Shittu roster C2585 must pick up C1734 clocks',
);

const akandeHris = new Set(timesheetAttendanceMatchKeys('C2825', 'AKANDE ISMAILA'));
assert.equal(
  timesheetAttendanceMatchKeys('C1817', 'AKANDE ISMAILA').some((key) => akandeHris.has(key)),
  true,
  'biometric C1817 Akande Ismaila must match HRIS C2825',
);
assert.equal(
  clockingRecordsForSupervisorCrew(
    [{ employeeId: 'C1817', employeeName: 'AKANDE ISMAILA', location: 'AGEGE', site: 'AGEGE' }],
    akandeHris,
  ).length,
  1,
  'Shittu roster C2825 must pick up C1817 clocks',
);
assert.equal(
  timesheetAttendanceMatchKeys('C1001').some((key) => timesheetAttendanceMatchKeys('C2585').includes(key)),
  false,
  'unrelated contract codes must not alias',
);

console.log('timesheet-attendance-match.test.ts: ok');
