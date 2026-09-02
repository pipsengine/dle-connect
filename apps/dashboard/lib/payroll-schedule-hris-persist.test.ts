import { salaryRowToHrisPackageLines } from './payroll-schedule-hris-persist';
import type { SalaryScheduleRow } from './salary-schedule-xlsx';

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const row = (overrides: Partial<SalaryScheduleRow>): SalaryScheduleRow => ({
  sheet: 'PERM.STAFF',
  kind: 'perm',
  employeeCode: 'P0100',
  employeeName: 'Test Staff',
  jobTitle: 'Engineer',
  company: 'DLENG - DLENG',
  department: 'Ops',
  location: 'Lagos',
  employmentType: 'Permanent',
  contType: '',
  periodSalary: 500000,
  annualSalary: 6000000,
  earningTotal: 520000,
  deductionTotal: 80000,
  grossPay: 520000,
  netPay: 440000,
  paye: 50000,
  pension: 25000,
  nhf: 5000,
  earnings: [
    { code: 'BASIC', name: 'Basic Salary', amount: 400000 },
    { code: 'HOUSING', name: 'Housing', amount: 100000 },
    { code: 'ARREARS', name: 'Arrears', amount: 20000 },
  ],
  deductions: [
    { code: 'PAYE', name: 'PAYE', amount: 50000 },
    { code: 'PENSION_EE', name: 'Pension', amount: 25000 },
    { code: 'UNION', name: 'Union', amount: 2000 },
  ],
  ...overrides,
});

const pkg = salaryRowToHrisPackageLines(row({}));
assert(pkg.earnings.some((line) => line.code === 'BASIC' && line.runFrequency === 'monthly'), 'Basic is a recurring HRIS package line');
assert(pkg.earnings.some((line) => line.code === 'ARREARS' && line.runFrequency === 'one-off' && line.includeInMonthlyPayroll === false), 'Arrears is one-off and will not repeat next month');
assert(!pkg.deductions.some((line) => line.code === 'PAYE'), 'PAYE is not stored as a package deduction — HRIS tax engine computes it');
assert(pkg.deductions.some((line) => line.code === 'UNION' && line.amount === 2000), 'Union dues stay on the HRIS package');
assert(pkg.periodSalary === 500000, 'Period salary is saved from the workbook');
assert(pkg.basicSalary === 400000, 'Basic salary is saved from the BASIC line');

console.log('payroll-schedule-hris-persist tests passed');
