/**
 * Unique employee-date day counts for Timesheet Reports Excel.
 * Run: npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/lib/timesheet-payroll-attendance-sheet.test.ts
 */
import assert from 'node:assert/strict';
import { buildPayrollAttendanceSheet } from './timesheet-payroll-attendance-sheet.ts';
import { timesheetDayRulesForDate } from './timesheet-entry-shared.ts';

const row = (overrides: Record<string, unknown>) => ({
  lineId: 'line',
  timesheetDate: '2026-09-21',
  employeeId: 'C1001',
  employeeNo: 'C1001',
  employeeName: 'Ada Contractor',
  jobTitle: 'Rigger',
  location: 'Agege',
  shiftLabel: '01 (Day)',
  projectCode: 'DL2601',
  attendanceHours: 9,
  usedHours: 8,
  productiveHours: 8,
  totalHours: 8,
  dayWorked: 1,
  ...overrides,
});

assert.equal(timesheetDayRulesForDate('2026-09-21').kind, 'Weekday', 'Monday is weekday in UTC');
assert.equal(timesheetDayRulesForDate('2026-09-19').kind, 'Saturday');
assert.equal(timesheetDayRulesForDate('2026-09-20').kind, 'Sunday');

const splitAllocations = buildPayrollAttendanceSheet({
  rows: [
    row({ lineId: 'a', projectCode: 'DL1', usedHours: 5, totalHours: 5, productiveHours: 5 }),
    row({ lineId: 'a-2', projectCode: 'DL2', usedHours: 5, totalHours: 5, productiveHours: 5 }),
  ],
});
assert.equal(splitAllocations.length, 1);
assert.equal(splitAllocations[0].weekDaysWorked, 1, 'two project lines on the same Monday count as one day');
assert.equal(splitAllocations[0].totalDaysWorked, 1);

const weekend = buildPayrollAttendanceSheet({
  rows: [
    row({ lineId: 'mon', timesheetDate: '2026-09-21', dayWorked: 1 }),
    row({ lineId: 'sat', timesheetDate: '2026-09-19', dayWorked: 1 }),
    row({ lineId: 'sun', timesheetDate: '2026-09-20', dayWorked: 0, usedHours: 6, totalHours: 6, attendanceHours: 6 }),
  ],
});
assert.equal(weekend[0].weekDaysWorked, 1);
assert.equal(weekend[0].saturdayDaysWorked, 1);
assert.equal(weekend[0].sundayDaysWorked, 1);
assert.equal(weekend[0].totalDaysWorked, 3, 'weekday + Saturday + Sunday');

const night = buildPayrollAttendanceSheet({
  rows: [row({ lineId: 'night', shiftLabel: '02 (Night)', timesheetDate: '2026-09-21', dayWorked: 1 })],
});
assert.equal(night[0].weekDaysWorked, 1, 'night shift on Monday is still a weekday worked');
assert.equal(night[0].nightWorkedDays, 1);
assert.equal(night[0].totalDaysWorked, 1);

const remarksOnly = buildPayrollAttendanceSheet({
  rows: [row({
    lineId: 'note',
    dayWorked: 0,
    attendanceHours: 0,
    usedHours: 0,
    productiveHours: 0,
    totalHours: 0,
    lineRemarks: 'please check',
  })],
});
assert.equal(remarksOnly[0]?.weekDaysWorked || 0, 0, 'a remark without hours is not a worked day');
assert.equal(remarksOnly[0]?.totalDaysWorked || 0, 0);

const leaveNoClock = buildPayrollAttendanceSheet({
  rows: [row({
    lineId: 'leave-1',
    timesheetDate: '2026-09-21',
    clockIn: null,
    lineRemarks: 'Approved paid leave: 2026-09-17 to 2026-09-25 (Annual Leave)',
    projectCode: 'DL1949',
    dayWorked: 1,
  })],
});
assert.equal(leaveNoClock[0].weekDaysWorked, 1, 'payroll counts paid-leave weekdays as weekdays worked');
assert.equal(leaveNoClock[0].paidLeaveDays, 1);
assert.equal(leaveNoClock[0].totalDaysWorked, 1);

const leaveWithClock = buildPayrollAttendanceSheet({
  rows: [row({
    lineId: 'leave-2',
    timesheetDate: '2026-09-21',
    clockIn: '07:14',
    lineRemarks: 'Approved paid leave: 2026-08-25 to 2026-09-13 (Annual Leave)',
    projectCode: 'DL1949',
    dayWorked: 1,
  })],
});
assert.equal(leaveWithClock[0].weekDaysWorked, 1, 'clock-in on a leave-remark day counts as weekday worked');
assert.equal(leaveWithClock[0].paidLeaveDays, 0);

const payrollAligned = buildPayrollAttendanceSheet({
  rows: [row({ lineId: 'early', timesheetDate: '2026-09-01', dayWorked: 1, employeeNo: 'C0129', employeeId: 'C0129' })],
  payrollHoursByKey: new Map([['C0129', {
    daysWorked: 18,
    bookedHours: 144,
    weekdayDays: 17,
    saturdayDays: 1,
    sundayDays: 0,
    saturdayHours: 8,
    sundayHours: 0,
    weekdayOvertimeHours: 2,
    employeeNo: 'C0129',
  }]]),
});
assert.equal(payrollAligned[0].weekDaysWorked, 17, 'attendance sheet weekdays follow payroll timesheet totals');
assert.equal(payrollAligned[0].saturdayDaysWorked, 1);
assert.equal(payrollAligned[0].totalDaysWorked, 18);

console.log('payroll attendance sheet day-count tests passed');
