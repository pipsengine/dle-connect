/**
 * Smoke-check official payroll Excel layouts against the August 2026 salary schedule.
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

const intern = {
  ...cont,
  employeeId: 'IT0106',
  employeeCode: 'IT0106',
  fullName: 'OREZI GBOBODO',
  employmentType: 'Intern',
  earningLines: [{ code: 'ITALLOW', name: 'IT ALLOWANCE', amount: 100000 }],
  deductionLines: [{ code: 'PAYE', label: 'PAYE', amount: 0 }],
  paye: 0,
  grossPay: 100000,
  netPay: 100000,
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

const usd = {
  ...base,
  employeeId: 'P0442',
  employeeCode: 'P0442',
  fullName: 'TEMITOPE ABIODUN ODULATE',
  payrollGroup: 'DLE_USD',
  payCurrency: 'USD',
  jobTitle: 'GENERAL MANAGER, OPERATIONS',
  location: 'IDI - IDI_ORO',
  businessUnit: 'DLE',
  grossPay: 4631.41,
  netPay: 3423.25,
  earningLines: [{ code: 'EXP_BASIC', name: 'EXP_ SMGT BASIC', amount: 926.28 }],
  deductionLines: [{ code: 'PAYE', label: 'PAYE', amount: 1049.07 }],
};

const dayDlpc = {
  ...day,
  employeeId: 'C2001',
  employeeCode: 'C2001',
  fullName: 'TEST CONTRACTOR',
  location: 'AGEGE',
  businessUnit: 'DLPCG',
  payrollGroup: 'DLPC',
};

const dlePerm = {
  ...base,
  employeeId: 'P0100',
  employeeCode: 'P0100',
  businessUnit: 'DLE',
  payrollGroup: 'DLE',
  location: 'IDI - IDI_ORO',
};

const missing = (cols: string[], required: string[]) => required.filter((c) => !cols.includes(c));

const bank = buildOfficialBankScheduleWorksheets([base as any, day as any], { periodLabel: 'August 2026' });
const salaryBank = buildOfficialBankScheduleWorksheets([base as any, cont as any, intern as any, usd as any], {
  periodLabel: 'August 2026',
  mode: 'salary-schedule',
  currencyScope: 'all',
});
const sal = buildOfficialSalariedDetailWorksheets([base as any, cont as any, intern as any, usd as any], {
  periodLabel: 'August 2026',
  currencyScope: 'all',
});
const daySheets = await buildOfficialDayrateScheduleWorksheets([day as any, dayDlpc as any], { period: '', periodLabel: 'August 2026' });
const dleOnlyBank = buildOfficialBankScheduleWorksheets([dlePerm as any, usd as any], {
  periodLabel: 'August 2026',
  mode: 'salary-schedule',
  currencyScope: 'all',
});

const perm = sal.find((sheet) => sheet.sheetName === 'PERM.STAFF')!;
const contSheet = sal.find((sheet) => sheet.sheetName === 'CONT. STAFF')!;
const usdSheet = sal.find((sheet) => sheet.sheetName === 'USD REPORT')!;
const summary = sal.find((sheet) => sheet.sheetName === 'Summary')!;

const samplePerm = [
  'Employee Code', 'EmployeeSurname', 'EmployeeFirstName', 'Age', 'Date of Birth', 'Gender', 'Date Joined Group', 'Job Title Long Description',
  'BASIC SALARY (Earning)', 'FURNITURE (Earning)', 'HOUSING (Earning)', 'Earning Total', 'NHF - National Housing Fund (Deduction)',
  'PAYE Tax (Deduction)', 'Column2', 'ITF Levy (CompanyContribution)', 'NSITF - Nigeria Social Insurance Tr (CompanyContribution)',
  'RENT (Provisions)', 'Net Pay', 'Company (HA)', 'Supervisor (HA)',
];
const sampleCont = [
  'Employee Code', 'Cont Type', 'LUMSUM AMOUNT (Earning)', 'Weekly Transport ', 'PAYE Tax (Deduction)', 'RENT (Provisions)', 'Net Pay', 'Supervisor (HA)',
];
const sampleUsd = [
  'Employee Code', 'EmployeeSecondName', 'EXP_ SMGT BASIC (Earning)', 'Earning Total', 'PAYE Tax (Deduction)', 'Taxable Earnings',
];
const sampleDle = [
  'Contractor Code', 'Location', 'Daily Rate', 'AGE', 'Total Weekday', 'Site Allowance', 'TCM Meal', 'TCM TRANSPORT', 'Amount Payable',
];
const sampleDlpc = [
  'Contractor Code', 'Daily Rate', 'Age', 'Total Weekday', 'Meal Allowance', 'Transport', 'Amount Payable',
];
const sampleBank = ['Employee Code', 'Employee Name', 'Bank', 'Account No', 'Sort Code', 'NET Salary', 'Location'];

const earningTotalIdx = perm.columns.indexOf('Earning Total');
const payeIdx = perm.columns.indexOf('PAYE Tax (Deduction)');
const taxableIdx = perm.columns.indexOf('Taxable Earnings');

const report = {
  bankSheets: bank.map((s) => s.sheetName),
  salaryBankSheets: salaryBank.map((s) => s.sheetName),
  dleOnlyBankSheets: dleOnlyBank.map((s) => s.sheetName),
  salarySheets: sal.map((s) => s.sheetName),
  bankMissing: missing(bank[0].columns, sampleBank),
  salaryBankMissing: missing(salaryBank[0].columns, sampleBank),
  permMissing: missing(perm.columns, samplePerm),
  contMissing: missing(contSheet.columns, sampleCont),
  usdMissing: missing(usdSheet.columns, sampleUsd),
  daySheets: daySheets.map((s) => s.sheetName),
  dleMissing: missing(daySheets.find((s) => s.sheetName === 'DLE')!.columns, sampleDle),
  dlpcMissing: missing(daySheets.find((s) => s.sheetName === 'DLPC')!.columns, sampleDlpc),
  dlpcHasLocation: daySheets.find((s) => s.sheetName === 'DLPC')!.columns.includes('Location'),
  permCode: perm.rows[0]?.[0],
  contType: contSheet.rows[0]?.[1],
  internType: contSheet.rows[1]?.[1],
  usdCode: usdSheet.rows[0]?.[0],
  earningTotalBeforePaye: earningTotalIdx >= 0 && payeIdx > earningTotalIdx,
  permHasTaxable: taxableIdx >= 0,
  summaryRows: summary.rows.slice(0, 6),
  dayrateSummaryRows: daySheets.find((s) => s.sheetName === 'SUMMARY')!.rows,
};

console.log(JSON.stringify(report, null, 2));
const failed = [
  ...report.bankMissing,
  ...report.salaryBankMissing,
  ...report.permMissing,
  ...report.contMissing,
  ...report.usdMissing,
  ...report.dleMissing,
  ...report.dlpcMissing,
].length > 0
  || report.permCode !== '0013'
  || report.contType !== 'Lumpsum'
  || report.internType !== 'Intern'
  || report.usdCode !== '0442_'
  || !report.earningTotalBeforePaye
  || report.permHasTaxable
  || report.dlpcHasLocation
  || JSON.stringify(report.salaryBankSheets) !== JSON.stringify([
    'DLPC.PERM.BANK.SCHD',
    'DLPC.CONT.BANK.SCHD',
    'USD BANK SCHD',
  ])
  || JSON.stringify(report.dleOnlyBankSheets) !== JSON.stringify([
    'DLE.PERM.BANK.SCHD',
    'USD BANK SCHD',
  ])
  || JSON.stringify(report.salarySheets) !== JSON.stringify([
    'Summary',
    'PERM.STAFF',
    'CONT. STAFF',
    'DLPC.PERM.BANK.SCHD',
    'DLPC.CONT.BANK.SCHD',
    'USD REPORT',
    'USD BANK SCHD',
  ]);
if (failed) {
  console.error('SMOKE FAILED');
  process.exit(1);
}
console.log('SMOKE OK');
process.exit(0);
