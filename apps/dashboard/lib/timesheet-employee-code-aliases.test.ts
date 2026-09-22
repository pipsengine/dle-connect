import assert from 'node:assert/strict';
import {
  canonicalTimesheetEmployeeCode,
  isTimesheetEmployeeCodeAlias,
  timesheetEmployeeCodeEquivalents,
  timesheetEmployeeCodesAreSamePerson,
} from './timesheet-employee-code-aliases.ts';
import { normalizeEmployeeLineKey } from './timesheet-entry-shared.ts';

assert.equal(canonicalTimesheetEmployeeCode('C1734'), 'C2585');
assert.equal(canonicalTimesheetEmployeeCode('c1817'), 'C2825');
assert.equal(canonicalTimesheetEmployeeCode('C2585'), 'C2585');
assert.equal(canonicalTimesheetEmployeeCode('C1001'), 'C1001');
assert.equal(isTimesheetEmployeeCodeAlias('C1734'), true);
assert.equal(isTimesheetEmployeeCodeAlias('C2585'), false);

assert.deepEqual(new Set(timesheetEmployeeCodeEquivalents('C2585')), new Set(['C2585', 'C1734']));
assert.deepEqual(new Set(timesheetEmployeeCodeEquivalents('C1734')), new Set(['C2585', 'C1734']));
assert.equal(timesheetEmployeeCodesAreSamePerson('C1734', 'C2585'), true);
assert.equal(timesheetEmployeeCodesAreSamePerson('C1817', 'C2825'), true);
assert.equal(timesheetEmployeeCodesAreSamePerson('C1734', 'C2825'), false);

assert.equal(normalizeEmployeeLineKey({ employeeId: 'C1734', employeeNo: 'C1734' }), 'C2585');
assert.equal(normalizeEmployeeLineKey({ employeeId: 'C1817' }), 'C2825');
assert.equal(
  normalizeEmployeeLineKey({ employeeId: 'C1734' }),
  normalizeEmployeeLineKey({ employeeId: 'C2585' }),
);

console.log('timesheet-employee-code-aliases.test.ts: ok');
