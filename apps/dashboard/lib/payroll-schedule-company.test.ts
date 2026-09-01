import { applyDayrateScheduleOverrideToRecords } from './dayrate-schedule-overlay';
import type { DayrateScheduleRow } from './dayrate-schedule-xlsx';
import type { PayrollCalculationRecord } from './payroll-calculation-service';
import { applySalaryScheduleOverrideToRecords, payrollCompanyFromSalaryScheduleRow } from './salary-schedule-overlay';
import type { SalaryScheduleRow } from './salary-schedule-xlsx';
import { normalizePayrollCompany, resolvePayrollCompany } from './payroll-schedule-scope';

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

assert(normalizePayrollCompany('DLENG - DLENG') === 'DLE', 'Excel DLENG company column maps to DLE');
assert(normalizePayrollCompany('DLPCG - DLPCG') === 'DLPC', 'Excel DLPCG company column maps to DLPC');
assert(normalizePayrollCompany('DLE_USD') === 'DLE', 'USD payroll group stays on DLE');
assert(normalizePayrollCompany('DLPC') === 'DLPC', 'DLPC sheet name maps to DLPC');
assert(resolvePayrollCompany({ companyCode: 'DLPC' }) === 'DLPC', 'Stamped companyCode wins');
assert(resolvePayrollCompany({ businessUnit: 'DLPCG - DLPCG' }) === 'DLPC', 'Repeated DLPCG label still maps to DLPC');
assert(payrollCompanyFromSalaryScheduleRow({ company: 'DLPCG - DLPCG', kind: 'perm' }) === 'DLPC', 'NGN perm DLPCG is DLPC Salaries');
assert(payrollCompanyFromSalaryScheduleRow({ company: 'DLPCG - DLPCG', kind: 'usd' }) === 'DLE', 'USD REPORT stays on DLE even if company cell is DLPCG');
assert(payrollCompanyFromSalaryScheduleRow({ company: '', kind: 'perm' }) === 'DLE', 'Blank COMPANY column defaults to DLE');

const blankRecord = (overrides: Partial<PayrollCalculationRecord>): PayrollCalculationRecord => ({
  recordKey: 'row',
  employeeId: 'P0001',
  employeeCode: 'P0001',
  fullName: 'Test',
  department: '',
  businessUnit: 'DLE',
  location: 'Lagos',
  jobTitle: 'Staff',
  employmentType: 'Permanent',
  employmentStatus: 'Active',
  payrollGroup: 'DLE',
  salaryGrade: 'Unassigned',
  payCurrency: 'NGN',
  paymentRun: 'Monthly',
  basePay: 0,
  allowances: 0,
  grossPay: 100,
  taxablePay: 100,
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
  netPay: 100,
  employerCost: 100,
  deductionRatio: 0,
  timesheetDaysWorked: null,
  timesheetBookedHours: null,
  sageActual: null,
  discrepancies: { status: 'Matched', grossVariance: 0, netVariance: 0, deductionVariance: 0 },
  status: 'Ready',
  readinessStatus: 'Ready',
  issues: [],
  payrollStatus: 'Ready',
  riskSeverity: 'Low',
  exceptionCount: 0,
  exceptions: [],
  deferredWarnings: [],
  deductions: 0,
  pension: 0,
  isDailyRate: false,
  ratePerDay: null,
  ratePerHour: null,
  hoursPerDay: null,
  setupAssignedToPayroll: true,
  nhfApplicable: false,
  salaryStructure: 'Permanent',
  earningLines: [],
  annualBenefitLines: [],
  deductionLines: [],
  ...overrides,
});

const salaryRow = (overrides: Partial<SalaryScheduleRow>): SalaryScheduleRow => ({
  sheet: 'PERM.STAFF',
  kind: 'perm',
  employeeCode: 'P0001',
  employeeName: 'Test',
  jobTitle: 'Staff',
  company: 'DLENG - DLENG',
  department: 'HR',
  location: 'Lagos',
  employmentType: 'Permanent',
  contType: '',
  periodSalary: 100,
  annualSalary: 1200,
  earningTotal: 100,
  deductionTotal: 0,
  grossPay: 100,
  netPay: 100,
  paye: 0,
  pension: 0,
  nhf: 0,
  earnings: [{ code: 'BASIC', name: 'Basic', amount: 100 }],
  deductions: [],
  ...overrides,
});

const salarySplit = applySalaryScheduleOverrideToRecords(
  [
    blankRecord({ employeeCode: 'P0100', employeeId: 'P0100', companyCode: 'DLE' }),
    blankRecord({ employeeCode: 'P0200', employeeId: 'P0200', companyCode: 'DLE', location: 'Agege' }),
  ],
  '2099-01',
  {
    period: '2099-01',
    fileName: 'salary.xlsx',
    title: 'Salary',
    appliedAt: '2099-01-01',
    appliedBy: 'test',
    parsed: {
      title: 'Salary',
      rows: [
        salaryRow({ employeeCode: 'P0100', company: 'DLENG - DLENG', grossPay: 50, netPay: 50 }),
        salaryRow({ employeeCode: 'P0200', company: 'DLPCG - DLPCG', grossPay: 25, netPay: 25 }),
        salaryRow({ employeeCode: 'P0300', kind: 'usd', sheet: 'USD REPORT', company: 'DLENG - DLENG', grossPay: 10, netPay: 10 }),
      ],
      byKind: { perm: [], cont: [], usd: [] },
      summary: {
        permCount: 2, contCount: 0, usdCount: 1,
        permGross: 75, contGross: 0, usdGross: 10,
        permNet: 75, contNet: 0, usdNet: 10,
      },
      skipped: [],
      sheets: [],
    },
  },
);
assert(salarySplit.filter((row) => resolvePayrollCompany(row) === 'DLE').length === 2, 'DLE Salaries gets DLENG + USD');
assert(salarySplit.filter((row) => resolvePayrollCompany(row) === 'DLPC').length === 1, 'DLPC Salaries gets DLPCG only');
assert(salarySplit.find((row) => row.employeeCode === 'P0300' && resolvePayrollCompany(row) === 'DLE'), 'USD row is on DLE Salaries');

const dayrateRow = (overrides: Partial<DayrateScheduleRow>): DayrateScheduleRow => ({
  employeeCode: 'C0001',
  firstName: 'A',
  lastName: 'B',
  employeeName: 'A B',
  jobTitle: 'Welder',
  location: 'Site',
  company: 'DLE',
  excelDailyRate: 1000,
  weekdayDays: 20,
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
  excelGross: 20000,
  excelNet: 19000,
  ...overrides,
});

const dayrateSplit = applyDayrateScheduleOverrideToRecords(
  [
    blankRecord({
      employeeCode: 'C1001',
      employeeId: 'C1001',
      isDailyRate: true,
      companyCode: 'DLPC',
      location: 'DLPC Agege',
      department: 'Projects',
      grossPay: 32000,
    }),
    blankRecord({
      employeeCode: 'C1002',
      employeeId: 'C1002',
      isDailyRate: true,
      companyCode: 'DLE',
      location: 'Ikeja',
      grossPay: 15000,
    }),
    blankRecord({
      employeeCode: 'C1999',
      employeeId: 'C1999',
      isDailyRate: true,
      companyCode: 'DLE',
      grossPay: 8000,
    }),
  ],
  '2099-01',
  {
    rows: [
      dayrateRow({ employeeCode: 'C1001', company: 'DLE', excelGross: 32000 }),
      dayrateRow({ employeeCode: 'C1002', company: 'DLPC', excelGross: 15000 }),
    ],
  },
);
assert(dayrateSplit.filter((row) => row.isDailyRate && resolvePayrollCompany(row) === 'DLE').length === 1, 'DLE Day-rate follows the DLE sheet');
assert(dayrateSplit.filter((row) => row.isDailyRate && resolvePayrollCompany(row) === 'DLPC').length === 1, 'DLPC Day-rate follows the DLPC sheet');
assert(dayrateSplit.find((row) => row.employeeCode === 'C1001' && resolvePayrollCompany(row) === 'DLE'), 'C1001 HRIS DLPC is overridden by DLE sheet');
assert(dayrateSplit.find((row) => row.employeeCode === 'C1002' && resolvePayrollCompany(row) === 'DLPC'), 'C1002 HRIS DLE is overridden by DLPC sheet');
assert(!dayrateSplit.some((row) => row.employeeCode === 'C1999'), 'Contractors not on the uploaded dayrate sheets are not kept on a day-rate page');

console.log('payroll-schedule-company tests passed');
