/**
 * Accurate timesheet report export metrics.
 * Run: npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/lib/timesheet-report-metrics.test.ts
 */
import assert from 'node:assert/strict';
import {
  bookedTimesheetHours,
  buildTimesheetExportLineTotals,
  contractLabourNetNgn,
  contractLabourWhtNgn,
  formatTimesheetClockForExport,
  isContractDayRateEmployee,
  lineOvertimeHours,
  prorateBookedHours,
  resolveTimesheetLabourRateNgn,
  timesheetExportControlTotals,
} from './timesheet-report-metrics.ts';

assert.equal(bookedTimesheetHours(12), 12, 'booked 12h stays 12 (no second break deduction)');
assert.equal(bookedTimesheetHours(8), 8);
assert.equal(bookedTimesheetHours(9.15), 9.2);

assert.equal(lineOvertimeHours({ usedHours: 12, timesheetDate: '2026-09-21' }), 4, 'Monday 12h → 4h OT');
assert.equal(lineOvertimeHours({ usedHours: 12, timesheetDate: '2026-09-19' }), 0, 'Saturday has no weekday OT');
assert.equal(lineOvertimeHours({ usedHours: 8, offshoreAllowanceHours: 4, timesheetDate: '2026-09-21' }), 4);

assert.deepEqual(prorateBookedHours(8, [5, 3]), [5, 3]);
assert.deepEqual(prorateBookedHours(8, [1, 1]), [4, 4]);
assert.equal(prorateBookedHours(10, [1, 1, 1]).reduce((sum, value) => sum + value, 0), 10);

assert.equal(resolveTimesheetLabourRateNgn({ ratePerHour: 1250 }), 1250);
assert.equal(resolveTimesheetLabourRateNgn({ ratePerDay: 10000 }), 1250);
assert.equal(resolveTimesheetLabourRateNgn({}), 0, 'no invented default rate');

assert.equal(isContractDayRateEmployee('C2585', 'P0123'), true);
assert.equal(isContractDayRateEmployee('P0123', 'P0123'), false);
assert.equal(contractLabourWhtNgn(100000, true), 5000);
assert.equal(contractLabourWhtNgn(100000, false), 0);
assert.equal(contractLabourNetNgn(100000, true), 95000);
assert.equal(contractLabourNetNgn(100000, false), null);

assert.equal(formatTimesheetClockForExport('2026-09-21T08:15:00.000Z'), '08:15');
assert.equal(formatTimesheetClockForExport('08:15'), '08:15');
assert.equal(formatTimesheetClockForExport(null), '');

const splitRows = [
  {
    lineId: 'line-1',
    employeeNo: 'C1001',
    employeeName: 'Ada',
    department: 'Fabrication',
    timesheetDate: '2026-09-21',
    periodName: 'Sep 2026',
    dayWorked: 1,
    daysWorked: 1,
    attendanceHours: 9,
    usedHours: 12,
    idleHours: 1,
    productiveHours: 8,
    nonProductiveHours: 0.5,
    overtimeHours: 2.7,
    totalHours: 8.5,
    allocationHours: 8,
    variance: 4,
    labourCostNgn: 10000,
    whtNgn: 500,
    netNgn: 9500,
    projectCode: 'DL2601',
    normalizedStatus: 'Approved',
  },
  {
    lineId: 'line-1',
    employeeNo: 'C1001',
    employeeName: 'Ada',
    department: 'Fabrication',
    timesheetDate: '2026-09-21',
    periodName: 'Sep 2026',
    dayWorked: 1,
    daysWorked: 1,
    attendanceHours: 9,
    usedHours: 12,
    idleHours: 1,
    productiveHours: 4,
    nonProductiveHours: 0.5,
    overtimeHours: 1.3,
    totalHours: 4.5,
    allocationHours: 4,
    variance: 4,
    labourCostNgn: 5000,
    whtNgn: 250,
    netNgn: 4750,
    projectCode: 'DL2602',
    normalizedStatus: 'Approved',
  },
];

const controls = timesheetExportControlTotals(splitRows);
assert.equal(controls.lines, 1, 'control counts unique timesheet lines');
assert.equal(controls.allocations, 2);
assert.equal(controls.usedHours, 12, 'used hours counted once');
assert.equal(controls.idleHours, 1, 'idle hours counted once');
assert.equal(controls.attendanceHours, 9);
assert.equal(controls.allocationHours, 12);
assert.equal(controls.overtimeHours, 4);
assert.equal(controls.labourCostNgn, 15000);
assert.equal(controls.whtNgn, 750);
assert.equal(controls.netNgn, 14250);

const lineTotals = buildTimesheetExportLineTotals(splitRows);
assert.equal(lineTotals.length, 1);
assert.equal(lineTotals[0].usedHours, 12);
assert.equal(lineTotals[0].allocationHours, 12);
assert.equal(lineTotals[0].overtimeHours, 4);
assert.equal(lineTotals[0].projectCodes, 'DL2601, DL2602');
assert.equal(lineTotals[0].labourCostNgn, 15000);

console.log('timesheet-report-metrics.test.ts: ok');
