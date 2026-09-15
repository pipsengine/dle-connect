import assert from 'node:assert/strict';
import {
  assertTimesheetDateInCurrentPeriod,
  calculateTimesheetPeriod,
  isTimesheetDateInCurrentPeriod,
  mapTimesheetDateIntoPeriod,
  shiftIsoDateByMonths,
} from './timesheet-entry-store.ts';

const september = calculateTimesheetPeriod('2026-09-15');
const october = calculateTimesheetPeriod('2026-09-16');

assert.equal(september.id, 'per-2026-09');
assert.equal(september.name, 'September 2026 Period');
assert.equal(september.startDate, '2026-08-16');
assert.equal(september.endDate, '2026-09-15');

assert.equal(october.id, 'per-2026-10');
assert.equal(october.name, 'October 2026 Period');
assert.equal(october.startDate, '2026-09-16');
assert.equal(october.endDate, '2026-10-15');

assert.equal(isTimesheetDateInCurrentPeriod('2026-09-15', '2026-09-15'), true);
assert.equal(isTimesheetDateInCurrentPeriod('2026-08-16', '2026-09-15'), true);
assert.equal(isTimesheetDateInCurrentPeriod('2026-09-16', '2026-09-15'), false);
assert.equal(isTimesheetDateInCurrentPeriod('2026-10-06', '2026-09-15'), false);

assert.doesNotThrow(() => assertTimesheetDateInCurrentPeriod('2026-09-15', '2026-09-15'));
assert.throws(
  () => assertTimesheetDateInCurrentPeriod('2026-09-16', '2026-09-15'),
  /current period \(September 2026 Period/,
);
assert.throws(
  () => assertTimesheetDateInCurrentPeriod('2026-10-06', '2026-09-15'),
  /October 2026 Period is not the current period/,
);

assert.equal(shiftIsoDateByMonths('2026-09-16', -1), '2026-08-16');
assert.equal(shiftIsoDateByMonths('2026-10-06', -1), '2026-09-06');
assert.equal(shiftIsoDateByMonths('2026-03-31', -1), '2026-02-28');

assert.equal(mapTimesheetDateIntoPeriod('2026-09-16', september), '2026-08-16');
assert.equal(mapTimesheetDateIntoPeriod('2026-09-25', september), '2026-08-25');
assert.equal(mapTimesheetDateIntoPeriod('2026-09-30', september), '2026-08-30');
assert.equal(mapTimesheetDateIntoPeriod('2026-10-02', september), '2026-09-02');
assert.equal(mapTimesheetDateIntoPeriod('2026-10-06', september), '2026-09-06');
assert.equal(mapTimesheetDateIntoPeriod('2026-09-15', september), '2026-09-15');
assert.equal(mapTimesheetDateIntoPeriod('2026-08-20', september), '2026-08-20');

console.log('timesheet-current-period.test.ts ok');
