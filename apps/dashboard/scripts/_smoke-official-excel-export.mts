/**
 * Smoke-check official payroll Excel layouts against sample column sets.
 * Usage: npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/_smoke-official-excel-export.mts
 */
import {
  buildOfficialBankScheduleWorksheets,
  buildOfficialDayrateScheduleWorksheets,
  buildOfficialSalariedDetailWorksheets,
} from '../lib/payroll-official-excel-export.ts';

const base = {
  employeeId: 'P0013',
  employeeCode: 'P0013',
  fullName: 'SAMUEL KARONWI',
  employmentType: 'Permanent',
  department: 'PRODUCTION',
  location: 'AGEGE',
  businessUnit: 'DLPCG',
  payrollGroup: 'DLPC',
  jobTitle: 'PRODUCTION SUPERVISOR',
  grossPay: 903791.86,
  netPay: 724830.85,
  paye: 130593.46,
  pension: 39383.72,
  pensionEmployee: 39383.72,
  pensionEmployer: 49229.66,
  statutoryEmployer: 18075.84,
  totalDeductions: 178961.01,
  deductions: 178961.01,
  taxablePay: 903791.86,
  bankName: 'Access',
  accountNo: '123',
  sortCode: '044',
  isDailyRate: false,
  payCurrency: 'NGN',
  salaryGrade: 'SNR',
  earningLines: [
    { code: 'BASIC', name: 'BASIC SALARY', amount: 359353.17 },
    { code: 'HOUSING', name: 'HOUSING', amount: 97439.99 },
  ],
  deductionLines: [
    { code: 'PAYE', label: 'PAYE', amount: 130593.46 },
    { code: 'PENSION_EE', label: 'Pension', amount: 39383.72 },
    { code: 'SNR_UNION', label: 'Union Dues', amount: 8983.83 },
  ],
};

const cont = {
  ...base,
  employeeId: 'L0191',
  employeeCode: 'L0191',
  fullName: 'DARL OBUMA',
  employmentType: 'Contract Lumpsum',
  earningLines: [{ code: 'BASIC1_LUMPSUM', name: 'LUMSUM AMOUNT', amount: 368447.2 }],
  deductionLines: [{ code: 'PAYE', label: 'PAYE', amount: 41320.49 }],
  paye: 41320.49,
  grossPay: 368447.2,
  netPay: 327126.71,
};

const day = {
  ...base,
  employeeId: 'C1065',
  employeeCode: 'C1065',
  fullName: 'VINCENT OGHENERIE',
  employmentType: 'Daily Rate',
  isDailyRate: true,
  ratePerDay: 14050,
  location: 'IDI - IDI_ORO',
  businessUnit: 'DLE',
  payrollGroup: 'DLE',
  timesheetDaysWorked: 23,
  earningLines: [{ code: 'JCWEEKDAY', name: 'Weekday', amount: 323150 }],
  deductionLines: [{ code: 'PAYE', label: 'PAYE', amount: 16157.5 }],
  paye: 16157.5,
  grossPay: 334650,
  netPay: 318492.5,
};

const missing = (cols: string[], required: string[]) => required.filter((c) => !cols.includes(c));

const bank = buildOfficialBankScheduleWorksheets([base as any, day as any], { periodLabel: 'July 2026' });
const sal = buildOfficialSalariedDetailWorksheets([base as any, cont as any], { periodLabel: 'July 2026' });
const daySheets = await buildOfficialDayrateScheduleWorksheets([day as any], { period: '', periodLabel: 'July 2026' });

const samplePerm = [
  'Employee Code', 'EmployeeSurname', 'EmployeeFirstName', 'Age', 'Date of Birth', 'Gender', 'Date Joined Group', 'Job Title Long Description',
  'BASIC SALARY (Earning)', 'FURNITURE (Earning)', 'HOUSING (Earning)', 'Earning Total', 'NHF - National Housing Fund (Deduction)',
  'PAYE Tax (Deduction)', 'ITF Levy (CompanyContribution)', 'NSITF - Nigeria Social Insurance Tr (CompanyContribution)',
  'RENT (Provisions)', 'Net Pay', 'Company (HA)', 'Supervisor (HA)',
];
const sampleCont = [
  'Employee Code', 'Cont Type', 'LUMSUM AMOUNT (Earning)', 'PAYE Tax (Deduction)', 'RENT (Provisions)', 'Net Pay', 'Supervisor (HA)',
];
const sampleDle = [
  'Emp. Code', 'Location', 'Daily Rate', 'AGE', 'Total Weekday', 'Site Allowance', 'TCM Meal', 'TCM TRANSPORT', 'Net Pay',
];
const sampleDlpc = [
  'Emp. Code', 'Daily Rate', 'Age', 'Total Weekday', 'Stock Count', 'Total Earning- Transport', 'Net Pay',
];
const sampleBank = ['Employee Code', 'Employee Name', 'Bank', 'Account No', 'Sort Code', 'NET Salary', 'Location'];

const report = {
  bankSheets: bank.map((s) => s.sheetName),
  bankMissing: missing(bank[0].columns, sampleBank),
  permMissing: missing(sal[0].columns, samplePerm),
  contMissing: missing(sal[1].columns, sampleCont),
  daySheets: daySheets.map((s) => s.sheetName),
  dleMissing: missing(daySheets.find((s) => s.sheetName === 'DLE')!.columns, sampleDle),
  dlpcMissing: missing(daySheets.find((s) => s.sheetName === 'DLPC')!.columns, sampleDlpc),
  dlpcHasLocation: daySheets.find((s) => s.sheetName === 'DLPC')!.columns.includes('Location'),
  permCode: sal[0].rows[0]?.[0],
  contType: sal[1].rows[0]?.[1],
  summaryRows: daySheets.find((s) => s.sheetName === 'SUMMARY')!.rows,
};

console.log(JSON.stringify(report, null, 2));
const failed = [
  ...report.bankMissing,
  ...report.permMissing,
  ...report.contMissing,
  ...report.dleMissing,
  ...report.dlpcMissing,
].length > 0 || report.permCode !== '0013' || report.dlpcHasLocation;
if (failed) {
  console.error('SMOKE FAILED');
  process.exit(1);
}
console.log('SMOKE OK');
process.exit(0);
