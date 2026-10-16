/**
 * DLE USD employer cost follows the salary-schedule company contribution (ITF + NSITF).
 * Run: npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/lib/salary-schedule-employer-cost.test.ts
 */
import assert from 'node:assert/strict';
import { applySalaryScheduleEmployerCost } from './salary-schedule-overlay';
import type { PayrollCalculationRecord } from './payroll-calculation-service';
import type { SalaryScheduleRow } from './salary-schedule-xlsx';
import type { SalaryScheduleUploadRecord } from './salary-schedule-upload-sql';

const record = (overrides: Partial<PayrollCalculationRecord>): PayrollCalculationRecord => ({
  recordKey: 'row',
  employeeId: 'P0000',
  employeeCode: 'P0000',
  fullName: 'STAFF',
  department: '',
  businessUnit: 'DLE',
  location: '',
  jobTitle: '',
  employmentType: 'Permanent',
  employmentStatus: 'Active',
  payrollGroup: 'DLE',
  salaryGrade: '',
  payCurrency: 'NGN',
  paymentRun: 'Monthly',
  basePay: 0,
  allowances: 0,
  grossPay: 0,
  taxablePay: 0,
  nonTaxablePay: 0,
  earningProfile: 'Salary',
  earningProfileId: 'fallback',
  paye: 0,
  pensionEmployee: 0,
  pensionEmployer: 0,
  statutoryEmployee: 0,
  statutoryEmployer: 0,
  loanRecovery: 0,
  otherDeductions: 0,
  totalDeductions: 0,
  netPay: 0,
  employerCost: 0,
  deductionRatio: 0,
  timesheetDaysWorked: null,
  timesheetBookedHours: null,
  sageActual: null,
  discrepancies: { status: 'Matched', grossVariance: 0, netVariance: 0, deductionVariance: 0 },
  status: 'Ready',
  payrollStatus: 'Ready',
  issues: [],
  riskSeverity: 'Low',
  exceptionCount: 0,
  earningLines: [],
  annualBenefitLines: [],
  deductionLines: [],
  isDailyRate: false,
  ...overrides,
} as PayrollCalculationRecord);

const excel = (overrides: Partial<SalaryScheduleRow>): SalaryScheduleRow => ({
  sheet: 'USD REPORT',
  kind: 'usd',
  employeeCode: 'P0442',
  employeeName: 'TEMITOPE ODULATE',
  jobTitle: 'GENERAL MANAGER, OPERATIONS',
  company: 'DLENG - DLENG',
  department: '',
  location: '',
  employmentType: 'Permanent',
  contType: '',
  periodSalary: 0,
  annualSalary: 0,
  earningTotal: 0,
  deductionTotal: 0,
  grossPay: 0,
  netPay: 0,
  paye: 0,
  pension: 0,
  nhf: 0,
  earnings: [],
  deductions: [],
  ...overrides,
});

const schedule = {
  period: '2026-09',
  fileName: 'salary.xlsx',
  title: 'September',
  appliedAt: '',
  appliedBy: 'test',
  parsed: {
    rows: [
      excel({
        employeeCode: 'P0442',
        grossPay: 4631.33,
        itf: 46.31,
        nsitf: 46.31,
        companyContributionTotal: 92.64,
      }),
      excel({
        kind: 'perm',
        sheet: 'PERM STAFF',
        employeeCode: 'P0442',
        grossPay: 6393380.73,
        itf: 63933.81,
        nsitf: 63933.81,
        pensionEmployer: 277704.76,
        pensionEmployerUsd: 288039.54,
        companyContributionTotal: 693611.91,
      }),
      excel({
        sheet: 'MD  (2)',
        employeeCode: 'P0413',
        employeeName: 'CHRIS IJELI',
        grossPay: 9000,
        itf: 90,
        nsitf: 90,
        companyContributionTotal: 0,
      }),
      excel({
        kind: 'perm',
        sheet: 'MD  (2)',
        employeeCode: 'P0413',
        employeeName: 'CHRIS IJELI',
        grossPay: 8035000,
        itf: 80350,
        nsitf: 80350,
        companyContributionTotal: 0,
      }),
      excel({
        employeeCode: 'P0457',
        employeeName: 'OLUWATAMILAYO AISTEN-PETERS',
        grossPay: 1000,
        itf: 10,
        nsitf: 10,
        companyContributionTotal: 20,
      }),
      excel({
        sheet: 'Expatriate (2)',
        employeeCode: 'PEX001',
        employeeName: 'NAYAK SUSHIL',
        grossPay: 3000,
        itf: 0,
        nsitf: 0,
        companyContributionTotal: 0,
      }),
    ],
  },
} as SalaryScheduleUploadRecord;

const [odulateUsd, odulateNgn, ijeliUsd, ijeliNgn, aisten, nayak] = applySalaryScheduleEmployerCost(
  [
    record({
      employeeId: 'P0442',
      employeeCode: 'P0442',
      fullName: 'TEMITOPE ODULATE',
      payrollGroup: 'DLE_USD',
      payCurrency: 'USD',
      grossPay: 4631.33,
      pensionEmployer: 208.41,
      employerCost: 4839.74,
    }),
    record({
      employeeId: 'P0442',
      employeeCode: 'P0442',
      fullName: 'TEMITOPE ODULATE',
      payCurrency: 'NGN',
      grossPay: 6393380.73,
      employerCost: 6393380.73,
    }),
    record({
      employeeId: 'P0413',
      employeeCode: 'P0413',
      fullName: 'CHRIS IJELI',
      payrollGroup: 'DLE_USD',
      payCurrency: 'USD',
      grossPay: 9000,
      employerCost: 9000,
    }),
    record({
      employeeId: 'P0413',
      employeeCode: 'P0413',
      fullName: 'CHRIS IJELI',
      payCurrency: 'NGN',
      grossPay: 8035000,
      employerCost: 8035000,
    }),
    record({
      employeeId: 'P0457',
      employeeCode: 'P0457',
      fullName: 'OLUWATAMILAYO AISTEN-PETERS',
      payrollGroup: 'DLE_USD',
      payCurrency: 'USD',
      grossPay: 1000,
      employerCost: 1000,
    }),
    record({
      employeeId: 'PEX001',
      employeeCode: 'PEX001',
      fullName: 'NAYAK SUSHIL',
      payrollGroup: 'DLE_USD',
      payCurrency: 'USD',
      grossPay: 3000,
      pensionEmployer: 50,
      employerCost: 3050,
    }),
  ],
  '2026-09',
  schedule,
);

assert.equal(odulateUsd.employerCost, 4723.97, 'Odulate USD employer cost is gross plus Excel ITF and NSITF');
assert.equal(odulateUsd.pensionEmployer, 0, 'USD employer pension stays off the employer cost');
assert.equal(odulateUsd.statutoryEmployer, 92.64, 'USD statutory employer is the Excel company contribution');
assert.equal(odulateNgn.employerCost, 7086992.64, 'Naira company contribution stays on the naira row');
assert.equal(ijeliUsd.employerCost, 9180, 'MD dollar leg keeps Excel ITF and NSITF');
assert.equal(ijeliUsd.pensionEmployer, 0);
assert.equal(ijeliNgn.employerCost, 8195700, 'MD naira ITF and NSITF stay on DLE Salaries');
assert.equal(aisten.employerCost, 1020, 'Basic-only USD package keeps the Excel 2% contribution');
assert.equal(nayak.employerCost, 3000, 'Expatriate dollar leg with no Excel contribution stays at gross');
assert.equal(nayak.pensionEmployer, 0, 'Engine pension is removed when the USD sheet has no employer pension');

console.log('salary-schedule-employer-cost.test.ts ok');
