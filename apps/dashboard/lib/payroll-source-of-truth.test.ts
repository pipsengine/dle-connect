/**
 * September 2026 source-of-truth: salaried from profiles, day-rate from timesheets.
 * Run: npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/lib/payroll-source-of-truth.test.ts
 */
import assert from 'node:assert/strict';
import type { DleEmployeeDirectoryRow } from './dle-enterprise-db';
import {
  applyDayrateScheduleOverrideToHoursMap,
  clearPrimedDayrateScheduleOverrideCache,
  primeDayrateScheduleOverrideCache,
} from './dayrate-schedule-override-read';
import type { DayrateScheduleRow } from './dayrate-schedule-xlsx';
import {
  isTimesheetWagePayrollEmployee,
  isPeriodVariableDayRateEarningLine,
  resolvePayrollRunPackForEmployee,
} from './payroll-employee-classification';
import {
  calculatePayrollEarnings,
  mergeTimesheetDayRateEarnings,
} from './payroll-earnings-engine';
import {
  employeeMatchKeys,
  leaveAllowancePaymentPeriodForYear,
} from './leave-allowance-policy';
import {
  explicitPayrollDayRate,
  isPayrollProfileTimesheetSourcePeriod,
  payrollExcelAmountOverlayApplies,
  payrollRecordUsesExcelOverlay,
  PAYROLL_PROFILE_TIMESHEET_SOURCE_FROM,
} from './payroll-source-of-truth';

const employee = (overrides: Partial<DleEmployeeDirectoryRow>): DleEmployeeDirectoryRow =>
  ({
    employeeId: 'X0001',
    employeeCode: 'X0001',
    fullName: 'Test',
    status: 'Active',
    employmentType: 'Permanent',
    ...overrides,
  }) as DleEmployeeDirectoryRow;

assert.equal(PAYROLL_PROFILE_TIMESHEET_SOURCE_FROM, '2026-09');
assert.equal(payrollExcelAmountOverlayApplies('2026-08'), true);
assert.equal(payrollExcelAmountOverlayApplies('2026-09'), false);
assert.equal(payrollExcelAmountOverlayApplies('2026-10'), false);
assert.equal(isPayrollProfileTimesheetSourcePeriod('2026-08'), false);
assert.equal(isPayrollProfileTimesheetSourcePeriod('2026-09'), true);

assert.equal(explicitPayrollDayRate({ ratePerDay: 12000 }).ratePerDay, 12000);
assert.equal(explicitPayrollDayRate({ ratePerHour: 1500, hoursPerDay: 8 }).ratePerDay, 12000);
assert.equal(explicitPayrollDayRate({ ratePerDay: 0, ratePerHour: 0 }).ratePerDay, 0);

const permanent = employee({
  employeeCode: 'P0100',
  employeeId: 'P0100',
  employmentType: 'Permanent',
  periodSalary: 500000,
  sagePayrollEarnings: [{ code: 'BASIC', name: 'Basic', amount: 500000 }],
});
const lumpsum = employee({
  employeeCode: 'L0100',
  employeeId: 'L0100',
  employmentType: 'Lumpsum',
  periodSalary: 250000,
});
const nysc = employee({
  employeeCode: 'NYSC0100',
  employeeId: 'NYSC0100',
  employmentType: 'NYSC',
  periodSalary: 80000,
});
const intern = employee({
  employeeCode: 'IT0100',
  employeeId: 'IT0100',
  employmentType: 'Industrial Training',
  periodSalary: 70000,
});
const dayRate = employee({
  employeeCode: 'C0100',
  employeeId: 'C0100',
  employmentType: 'Daily Rate',
  ratePerDay: 10000,
  hoursPerDay: 8,
  periodSalary: 500000,
});
const dayRateNoRate = employee({
  employeeCode: 'C0101',
  employeeId: 'C0101',
  employmentType: 'Daily Rate',
  ratePerDay: 0,
  ratePerHour: 0,
  periodSalary: 80000,
});

assert.equal(isTimesheetWagePayrollEmployee(permanent), false);
assert.equal(isTimesheetWagePayrollEmployee(lumpsum), false);
assert.equal(isTimesheetWagePayrollEmployee(nysc), false);
assert.equal(isTimesheetWagePayrollEmployee(intern), false);
assert.equal(isTimesheetWagePayrollEmployee(dayRate), true);
assert.equal(isPeriodVariableDayRateEarningLine({ code: 'JCWEEKDAY', name: 'WEEKDAY EARNING' }), true);
assert.equal(isPeriodVariableDayRateEarningLine({ code: 'SATURDAY_OVT', name: 'SATURDAY OVERTIME' }), true);
assert.equal(isPeriodVariableDayRateEarningLine({ code: 'REFUND', name: 'REFUND' }), true);
assert.equal(isPeriodVariableDayRateEarningLine({ code: 'NIGHTALL', name: 'NIGHT ALLOWANCE' }), true);
assert.equal(isPeriodVariableDayRateEarningLine({ code: 'MEAL', name: 'MEAL ALLOWANCE' }), true);
assert.equal(isPeriodVariableDayRateEarningLine({ code: 'LOAN', name: 'Loan Recovery' }), false);
assert.equal(resolvePayrollRunPackForEmployee(permanent), 'salaried');
assert.equal(resolvePayrollRunPackForEmployee(lumpsum), 'salaried');
assert.equal(resolvePayrollRunPackForEmployee(nysc), 'salaried');
assert.equal(resolvePayrollRunPackForEmployee(intern), 'salaried');
assert.equal(resolvePayrollRunPackForEmployee(dayRate), 'daily-rate');

const permanentPay = calculatePayrollEarnings(permanent, { useHrisPackageLines: true });
assert.match(permanentPay.profileName, /HRIS Salary Package|Payroll Profile/);
assert.equal(permanentPay.grossPay, 500000);

const lumpsumPay = calculatePayrollEarnings(lumpsum);
assert.equal(lumpsumPay.profileId, 'contract-lumpsum');
assert.equal(lumpsumPay.grossPay, 250000);
assert.ok(lumpsumPay.paidEarningLines.some((line) => line.code === 'LUMPSUMTAX'));

const nyscPay = calculatePayrollEarnings(nysc);
assert.equal(nyscPay.profileId, 'stipend-non-taxable');
assert.equal(nyscPay.grossPay, 80000);
assert.ok(nyscPay.paidEarningLines.some((line) => line.code === 'STIPEND_NT'));

const internPay = calculatePayrollEarnings(intern);
assert.equal(internPay.profileId, 'stipend-non-taxable');
assert.equal(internPay.grossPay, 70000);

const dayRatePackage = calculatePayrollEarnings(dayRate);
assert.equal(dayRatePackage.profileId, 'contract-day-rate');
assert.equal(dayRatePackage.grossPay, 0, 'day-rate must not invent days from periodSalary');

const timesheet10 = mergeTimesheetDayRateEarnings(dayRate, { ratePerDay: 10000, daysWorked: 10, period: '2026-09' });
const timesheet12 = mergeTimesheetDayRateEarnings(dayRate, { ratePerDay: 10000, daysWorked: 12, period: '2026-09' });
assert.equal(timesheet10.grossPay, 105000);
assert.equal(timesheet12.grossPay, 126000);
assert.match(timesheet10.profileName, /Day Rate/i);
assert.equal(payrollRecordUsesExcelOverlay(timesheet10), false);

const timesheet10WithOt = mergeTimesheetDayRateEarnings(dayRate, { ratePerDay: 10000, daysWorked: 10, weekdayOvertimeHours: 4, period: '2026-09' });
assert.equal(
  timesheet10WithOt.grossPay,
  112500,
  'September weekday overtime from timesheets pays WEEKDAYOVT on top of day rate + meal',
);
assert.equal(
  timesheet10WithOt.paidEarningLines.find((line) => line.code === 'WEEKDAYOVT')?.amount,
  7500,
);

const excelRow: DayrateScheduleRow = {
  employeeCode: 'C0100',
  firstName: 'Test',
  lastName: 'Day',
  employeeName: 'Test',
  jobTitle: 'Welder',
  location: 'Site',
  company: 'DLE',
  excelDailyRate: 20000,
  weekdayDays: 22,
  weekdayOvtHours: 0,
  saturdayHours: 0,
  sundayHours: 0,
  publicHolidayHours: 0,
  nightDays: 0,
  nightAmt: 0,
  mealAllowance: 0,
  transport: 0,
  siteAllowance: 0,
  tcmMeal: 0,
  tcmTransport: 0,
  arrears: 0,
  excelGross: 440000,
  excelNet: 418000,
};

primeDayrateScheduleOverrideCache('2026-08', {
  period: '2026-08',
  fileName: 'dayrate.xlsx',
  title: 'Dayrate',
  appliedAt: '2026-08-01',
  appliedBy: 'test',
  rows: [excelRow],
  skipped: [],
  sheets: [],
});
primeDayrateScheduleOverrideCache('2026-09', {
  period: '2026-09',
  fileName: 'dayrate.xlsx',
  title: 'Dayrate',
  appliedAt: '2026-09-01',
  appliedBy: 'test',
  rows: [excelRow],
  skipped: [],
  sheets: [],
});

const augustExcel = mergeTimesheetDayRateEarnings(dayRate, { ratePerDay: 10000, daysWorked: 10, period: '2026-08' });
assert.equal(augustExcel.grossPay, 440000, 'August still uses Excel days × Excel rate');
assert.equal(payrollRecordUsesExcelOverlay(augustExcel), true);

const septemberTimesheet = mergeTimesheetDayRateEarnings(dayRate, { ratePerDay: 10000, daysWorked: 10, period: '2026-09' });
assert.equal(septemberTimesheet.grossPay, 105000, 'September ignores Excel days and uses timesheet × profile rate');
assert.equal(payrollRecordUsesExcelOverlay(septemberTimesheet), false);

const dayRateWithSnapshot = employee({
  employeeCode: 'C0100',
  employeeId: 'C0100',
  employmentType: 'Daily Rate',
  ratePerDay: 10000,
  hoursPerDay: 8,
  sagePayrollEarnings: [
    { code: 'JCWEEKDAY', name: 'WEEKDAY EARNING', amount: 198000 },
    { code: 'MEAL', name: 'MEAL ALLOWANCE', amount: 3000 },
    { code: 'SATURDAY_OVT', name: 'SATURDAY OVERTIME', amount: 50000 },
    { code: 'WEEKDAYOVT', name: 'WEEKDAY OVERTIME', amount: 8000 },
    { code: 'REFUND', name: 'REFUND', amount: 20000 },
    { code: 'NIGHTALL', name: 'NIGHT ALLOWANCE', amount: 4000 },
  ],
});
const septemberIgnoresPackageSnapshot = mergeTimesheetDayRateEarnings(dayRateWithSnapshot, {
  ratePerDay: 10000,
  daysWorked: 10,
  period: '2026-09',
});
assert.equal(
  septemberIgnoresPackageSnapshot.grossPay,
  105000,
  'leftover C-code package OT/refund/weekday/meal must not pay again after timesheet cutover',
);
assert.equal(
  septemberIgnoresPackageSnapshot.paidEarningLines.some((line) => line.code === 'REFUND'),
  false,
);
assert.equal(
  septemberIgnoresPackageSnapshot.paidEarningLines.some((line) => line.code === 'SATURDAY_OVT'),
  false,
);

const hours = new Map<string, { daysWorked: number; bookedHours: number }>([
  ['C0100', { daysWorked: 10, bookedHours: 80 }],
]);
applyDayrateScheduleOverrideToHoursMap('2026-09', hours);
assert.equal(hours.get('C0100')?.daysWorked, 10, 'September hours map stays on timesheet days');
applyDayrateScheduleOverrideToHoursMap('2026-08', hours);
assert.equal(hours.get('C0100')?.daysWorked, 22, 'August hours map still follows Excel weekday days');

assert.equal(explicitPayrollDayRate(dayRateNoRate).ratePerDay, 0, 'missing ratePerDay must not fall back to periodSalary');

const internDouble = employee({
  employeeCode: 'IT0100',
  employeeId: 'IT0100',
  employmentType: 'Industrial Training',
  periodSalary: 70000,
  sagePayrollEarnings: [
    { code: 'ITALLOW', name: 'IT ALLOWANCE', amount: 70000, runFrequency: 'monthly', sourceAmount: 70000 },
  ],
});
const internDoublePay = calculatePayrollEarnings(internDouble, { useHrisPackageLines: true });
assert.equal(internDoublePay.grossPay, 70000, 'IT stipend must not stack STIPEND_NT on stored ITALLOW');
assert.equal(
  internDoublePay.paidEarningLines.filter((line) => /STIPEND|ITALLOW|NYSCALLOW/i.test(line.code)).length,
  1,
);

const nyscDouble = employee({
  employeeCode: 'NYSC0100',
  employeeId: 'NYSC0100',
  employmentType: 'NYSC',
  periodSalary: 80000,
  sagePayrollEarnings: [
    { code: 'NYSCALLOW', name: 'NYSC ALLOWANCE', amount: 80000, runFrequency: 'monthly', sourceAmount: 80000 },
  ],
});
const nyscDoublePay = calculatePayrollEarnings(nyscDouble, { useHrisPackageLines: true });
assert.equal(nyscDoublePay.grossPay, 80000, 'NYSC stipend must not stack STIPEND_NT on stored NYSCALLOW');

const lumpsumDouble = employee({
  employeeCode: 'L0100',
  employeeId: 'L0100',
  employmentType: 'Lumpsum',
  periodSalary: 250000,
  sagePayrollEarnings: [
    { code: 'BASIC1_LUMPSUM', name: 'LUMSUM AMOUNT', amount: 250000, runFrequency: 'monthly', sourceAmount: 250000 },
    { code: 'MEAL', name: 'MEAL ALLOWANCE', amount: 5000, runFrequency: 'monthly', sourceAmount: 5000 },
    { code: 'OVERTIME', name: 'OVERTIME', amount: 10000, runFrequency: 'one-off', sourceAmount: 10000, includeInMonthlyPayroll: false },
  ],
});
const lumpsumDoublePay = calculatePayrollEarnings(lumpsumDouble, { useHrisPackageLines: true });
assert.equal(lumpsumDoublePay.grossPay, 265000, 'lumpsum formula must not stack LUMPSUMTAX on BASIC1_LUMPSUM; meal/OT stay');
assert.equal(
  lumpsumDoublePay.paidEarningLines.filter((line) => /^(LUMPSUMTAX|BASIC1_LUMPSUM)$/i.test(line.code)).length,
  1,
);
assert.equal(lumpsumDoublePay.paidEarningLines.find((line) => line.code === 'MEAL')?.amount, 5000);
assert.equal(lumpsumDoublePay.paidEarningLines.find((line) => line.code === 'OVERTIME')?.amount, 10000);

const lumpsumAmountAlias = employee({
  employeeCode: 'L2718',
  employeeId: 'L2718',
  employmentType: 'Lumpsum',
  periodSalary: 330347.91,
  sagePayrollEarnings: [
    { code: 'LUMPSUMTAX', name: 'LUMPSUM ALLOWANCE', amount: 330347.91, runFrequency: 'monthly', sourceAmount: 330347.91 },
    { code: 'LUMSUM_AMOUNT', name: 'LUMSUM AMOUNT', amount: 330347.91, runFrequency: 'monthly', sourceAmount: 330347.91 },
  ],
});
const lumpsumAmountAliasPay = calculatePayrollEarnings(lumpsumAmountAlias, { useHrisPackageLines: true });
assert.equal(lumpsumAmountAliasPay.grossPay, 330347.91, 'LUMSUM_AMOUNT must collapse onto LUMPSUMTAX');
assert.equal(lumpsumAmountAliasPay.paidEarningLines.filter((line) => /LUMPSUM|LUMSUM/i.test(line.code)).length, 1);

const permanentLeavePackage = employee({
  employeeCode: 'P0100',
  employeeId: 'P0100',
  employmentType: 'Permanent',
  salaryGrade: 'SNR',
  periodSalary: 500000,
  sagePayrollEarnings: [
    { code: 'SNR_BASIC', name: 'BASIC SALARY', amount: 200000, runFrequency: 'monthly', sourceAmount: 200000, includeInMonthlyPayroll: true },
    { code: 'SNR_HOUSE', name: 'HOUSING', amount: 100000, runFrequency: 'monthly', sourceAmount: 100000, includeInMonthlyPayroll: true },
    { code: 'LEAVEALLOW', name: 'LEAVE ALLOWANCE', amount: 180000, runFrequency: 'monthly', sourceAmount: 180000, includeInMonthlyPayroll: true },
  ],
});
const permanentLeavePay = calculatePayrollEarnings(permanentLeavePackage, {
  useHrisPackageLines: true,
  includePeriodAdjustments: true,
  period: '2026-09',
});
assert.equal(
  permanentLeavePay.paidEarningLines.some((line) => /LEAVEALLOW/i.test(line.code) || /LEAVE ALLOWANCE/i.test(line.name)),
  false,
  'stored August leave allowance must not pay again from the standing package',
);
assert.equal(permanentLeavePay.grossPay, 300000);

assert.equal(
  leaveAllowancePaymentPeriodForYear(
    [{ id: 'p0453-sep', employeeId: 'P0453', leaveType: 'Annual Leave', startDate: '2026-09-07', endDate: '2026-09-18', days: 10, status: 'Approved' }],
    employeeMatchKeys('P0453'),
    2026,
  ),
  '2026-09',
);
assert.equal(
  leaveAllowancePaymentPeriodForYear(
    [
      { id: 'aug', employeeId: 'P0100', leaveType: 'Annual Leave', startDate: '2026-08-03', endDate: '2026-08-14', days: 10, status: 'Approved' },
      { id: 'sep', employeeId: 'P0100', leaveType: 'Annual Leave', startDate: '2026-09-07', endDate: '2026-09-18', days: 12, status: 'Approved' },
    ],
    employeeMatchKeys('P0100'),
    2026,
  ),
  '2026-08',
  'August qualifying leave must not create a second September leave-allowance payment',
);
assert.equal(
  leaveAllowancePaymentPeriodForYear(
    [{ id: 'short', employeeId: 'P0200', leaveType: 'Annual Leave', startDate: '2026-09-07', endDate: '2026-09-11', days: 5, status: 'Approved' }],
    employeeMatchKeys('P0200'),
    2026,
  ),
  null,
);

const septemberLabels = [permanentPay, lumpsumPay, nyscPay, internPay, septemberTimesheet];
assert.equal(
  septemberLabels.filter((row) => payrollRecordUsesExcelOverlay(row)).length,
  0,
  'September live labels must not show HR schedule overlay',
);

clearPrimedDayrateScheduleOverrideCache('2026-08');
clearPrimedDayrateScheduleOverrideCache('2026-09');

console.log('payroll-source-of-truth tests passed');
