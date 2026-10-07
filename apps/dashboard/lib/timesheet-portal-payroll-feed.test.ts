/**
 * Run: npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/lib/timesheet-portal-payroll-feed.test.ts
 */
import assert from 'node:assert/strict';
import {
  aggregatePortalBookingsForPayroll,
  payrollPeriodDateBounds,
  portalCCodePayrollFeedApplies,
  replaceContractHoursWithPortalFeed,
} from './timesheet-portal-payroll-feed.ts';

assert.equal(portalCCodePayrollFeedApplies('2026-09'), false);
assert.equal(portalCCodePayrollFeedApplies('per-2026-09'), false);
assert.equal(portalCCodePayrollFeedApplies('2026-10'), true);
assert.equal(portalCCodePayrollFeedApplies('2026-11'), true);

assert.deepEqual(payrollPeriodDateBounds('2026-10'), { start: '2026-09-16', end: '2026-10-15' });
assert.deepEqual(payrollPeriodDateBounds('per-2026-01'), { start: '2025-12-16', end: '2026-01-15' });

const hours = aggregatePortalBookingsForPayroll([
  { employeeCode: 'C1001', employeeName: 'Ada', workDate: '2026-10-05', regularHours: 8, ovtHours: 2, nightHours: 0, locationName: 'AGEGE' },
  { employeeCode: 'C1001', employeeName: 'Ada', workDate: '2026-10-03', regularHours: 8, ovtHours: 0, nightHours: 0, locationName: 'OFFSHORE' },
  { employeeCode: 'C1001', employeeName: 'Ada', workDate: '2026-10-10', regularHours: 8, ovtHours: 0, nightHours: 1, locationName: 'AGEGE' },
  { employeeCode: 'C1001', employeeName: 'Ada', workDate: '2026-10-01', regularHours: 8, ovtHours: 0, nightHours: 0, locationName: 'AGEGE' },
  { employeeCode: 'P0013', employeeName: 'Sam', workDate: '2026-10-05', regularHours: 8, ovtHours: 0, nightHours: 0, locationName: 'AGEGE' },
], ['2026-10-01']);

const ada = hours.get('C1001');
assert.ok(ada);
assert.equal(ada?.weekdayDays, 1);
assert.equal(ada?.daysWorked, 3);
assert.equal(ada?.saturdayDays, 2);
assert.equal(ada?.publicHolidayHours, 8);
assert.equal(ada?.weekdayOvertimeHours, 2);
assert.equal(ada?.nightDays, 1);
assert.equal(hours.has('P0013'), false);

const merged = replaceContractHoursWithPortalFeed(new Map([
  ['C1001', { daysWorked: 21, bookedHours: 168, employeeNo: 'C1001', employeeName: 'Old Register' }],
  ['Old Register', { daysWorked: 21, bookedHours: 168, employeeNo: 'C1001', employeeName: 'Old Register' }],
  ['P0277', { daysWorked: 15, bookedHours: 120, employeeNo: 'P0277', employeeName: 'Akinsanya' }],
]), hours);
assert.equal(merged.get('C1001')?.weekdayDays, 1);
assert.equal(merged.get('ADA')?.employeeNo, 'C1001');
assert.equal(merged.has('Old Register'), false);
assert.equal(merged.get('P0277')?.daysWorked, 15);

console.log('timesheet-portal-payroll-feed.test.ts ok');
