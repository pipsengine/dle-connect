/**
 * MD / Expatriate NGN from the salary-schedule Excel attaches onto USD rows.
 * Run: npx tsx lib/salary-schedule-overlay-companion.test.ts
 */
import assert from 'node:assert/strict';
import { attachCompanionNgnPay } from './salary-schedule-overlay';
import type { PayrollCalculationRecord } from './payroll-calculation-service';
import type { SalaryScheduleRow } from './salary-schedule-xlsx';

const usdRecord = (overrides: Partial<PayrollCalculationRecord>): PayrollCalculationRecord => ({
  recordKey: 'usd',
  employeeId: 'P0000',
  employeeCode: 'P0000',
  fullName: 'USD STAFF',
  department: 'CORPORATE OFFICE',
  businessUnit: 'DLE',
  location: 'IDI',
  jobTitle: 'STAFF',
  employmentType: 'Permanent',
  employmentStatus: 'Active',
  payrollGroup: 'DLE_USD',
  salaryGrade: 'Unassigned',
  payCurrency: 'USD',
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

const excelRow = (overrides: Partial<SalaryScheduleRow>): SalaryScheduleRow => ({
  sheet: 'MD  (2)',
  kind: 'perm',
  employeeCode: 'P0413',
  employeeName: 'CHRIS IJELI',
  jobTitle: 'MANAGING DIRECTOR',
  company: 'DLENG - DLENG',
  department: 'CORPORATE OFFICE',
  location: '',
  employmentType: 'Managing Director',
  contType: 'MD NGN 40%',
  periodSalary: 8146000,
  annualSalary: 97752000,
  earningTotal: 8146000,
  deductionTotal: 2053333.33,
  grossPay: 8146000,
  netPay: 6092666.67,
  paye: 0,
  pension: 0,
  nhf: 0,
  earnings: [],
  deductions: [],
  ...overrides,
});

const [md] = attachCompanionNgnPay(
  [usdRecord({
    employeeId: 'P0413',
    employeeCode: 'P0413',
    fullName: 'CHRIS IJELI',
    jobTitle: 'MANAGING DIRECTOR',
    grossPay: 9000,
    netPay: 6831.24,
  })],
  [excelRow({})],
);
assert.equal(md.companionNgnPay?.grossPay, 8146000);
assert.equal(md.companionNgnPay?.netPay, 6092666.67);
assert.equal(md.companionNgnPay?.shareLabel, '40% NGN');

const [nayak] = attachCompanionNgnPay(
  [usdRecord({
    employeeId: 'PEX001',
    employeeCode: 'PEX001',
    fullName: 'SUSHILKUMAR NAYAK',
    jobTitle: 'EXPATRIATE',
    grossPay: 3000,
    netPay: 2383.09,
  })],
  [excelRow({
    sheet: 'Expatriate (2)',
    employeeCode: 'PEX001',
    employeeName: 'SUSHILKUMAR NAYAK',
    jobTitle: 'EXPATRIATE',
    employmentType: 'Expatriate',
    contType: 'Expatriate NGN',
    grossPay: 269552.63,
    deductionTotal: 13477.63,
    netPay: 256075,
  })],
);
assert.equal(nayak.companionNgnPay?.grossPay, 269552.63);
assert.equal(nayak.companionNgnPay?.netPay, 256075);
assert.equal(nayak.companionNgnPay?.shareLabel, 'NGN package');

const [permanent] = attachCompanionNgnPay(
  [usdRecord({
    employeeId: 'P0442',
    employeeCode: 'P0442',
    fullName: 'TEMITOPE ABIODUN ODULATE',
    jobTitle: 'GENERAL MANAGER, OPERATIONS',
    grossPay: 3423.25,
  })],
  [excelRow({})],
);
assert.equal(permanent.companionNgnPay, undefined);

console.log('salary-schedule-overlay-companion.test.ts: ok');
