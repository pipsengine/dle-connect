/**
 * Run: npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/lib/timesheet-night-band.test.ts
 */
import assert from 'node:assert/strict';
import { attachNightBand } from './timesheet-entry-workspace.ts';

const day = [{
  employeeCode: 'C1001',
  employeeName: 'Ada',
  operationalStatus: 'Active on Crew',
  allocations: [{ projectCode: 'DL1', regularHours: 8, ovtHours: 1 }],
  nightSession: false,
}];
const night = [{
  employeeCode: 'C1001',
  employeeName: 'Ada',
  operationalStatus: 'Active on Crew',
  allocations: [{ projectCode: 'DL9', regularHours: 6, ovtHours: 2 }],
  nightSession: true,
  nightStart: '18:00',
  nightEnd: '22:00',
}, {
  employeeCode: 'C1002',
  employeeName: 'Bo',
  operationalStatus: 'Active on Crew',
  allocations: [{ projectCode: 'DL9', regularHours: 8, ovtHours: 0 }],
  nightSession: true,
}, {
  employeeCode: 'C1003',
  employeeName: 'Chi',
  operationalStatus: 'Approved Leave',
  allocations: [{ projectCode: 'DL1949', regularHours: 8, ovtHours: 0 }],
  nightSession: false,
}];

const band = attachNightBand(day, night);
assert.equal(band.length, 2);
const ada = band.find((line) => line.employeeCode === 'C1001');
assert.equal(ada?.allocations?.[0]?.regularHours, 8);
assert.equal(ada?.nightWork, true);
assert.equal(ada?.nightAllocations?.[0]?.projectCode, 'DL9');
assert.equal(ada?.nightAllocations?.[0]?.ovtHours, 2);
const bo = band.find((line) => line.employeeCode === 'C1002');
assert.equal(bo?.nightWork, true);
assert.equal((bo?.allocations || []).length, 0);
assert.equal(bo?.nightAllocations?.[0]?.regularHours, 8);
assert.equal(band.some((line) => line.employeeCode === 'C1003'), false);

const leave = attachNightBand([{
  employeeCode: 'C1001',
  operationalStatus: 'Approved Leave',
  allocations: [{ regularHours: 8, ovtHours: 0 }],
}], night);
assert.equal(leave[0]?.nightWork, false);
assert.equal((leave[0]?.nightAllocations || []).length, 0);

console.log('timesheet-night-band.test.ts ok');
