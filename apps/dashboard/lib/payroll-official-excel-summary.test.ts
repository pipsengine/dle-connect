import {
  buildOfficialDayrateScheduleWorksheets,
  buildOfficialSalariedDetailWorksheets,
} from './payroll-official-excel-export';

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const labelsOf = (rows: Array<Array<unknown>> | undefined) =>
  (rows || []).map((row) => String(row[0] ?? '').trim());

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
  isDailyRate: false,
  payCurrency: 'NGN',
  earningLines: [{ code: 'BASIC', name: 'BASIC SALARY', amount: 359353.17 }],
  deductionLines: [{ code: 'PAYE', label: 'PAYE', amount: 130593.46 }],
};

const dlePerm = {
  ...base,
  employeeId: 'P0100',
  employeeCode: 'P0100',
  businessUnit: 'DLE',
  payrollGroup: 'DLE',
  location: 'IDI - IDI_ORO',
  netPay: 500000,
};

const dlpcCont = {
  ...base,
  employeeId: 'L0191',
  employeeCode: 'L0191',
  employmentType: 'Contract Lumpsum',
  netPay: 327126.71,
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
  netPay: 3423.25,
};

const dleDay = {
  ...base,
  employeeId: 'C1065',
  employeeCode: 'C1065',
  employmentType: 'Daily Rate',
  isDailyRate: true,
  businessUnit: 'DLE',
  payrollGroup: 'DLE',
  location: 'IDI - IDI_ORO',
  netPay: 318492.5,
  grossPay: 334650,
};

const dlpcDay = {
  ...dleDay,
  employeeId: 'C2001',
  employeeCode: 'C2001',
  businessUnit: 'DLPCG',
  payrollGroup: 'DLPC',
  location: 'AGEGE',
};

const main = async () => {
const dleSummary = buildOfficialSalariedDetailWorksheets([dlePerm as any, usd as any], {
  periodLabel: 'August 2026',
  currencyScope: 'all',
  company: 'DLE',
}).find((sheet) => sheet.sheetName === 'Summary');
const dleLabels = labelsOf(dleSummary?.rows);

assert(dleLabels.includes('DLE Staff'), 'DLE salary Summary keeps the staff line that has a figure');
assert(dleLabels.includes('GRAND TOTAL'), 'DLE salary Summary keeps GRAND TOTAL');
assert(dleLabels.includes('USD'), 'DLE salary Summary keeps the USD block when USD has a figure');
assert(!dleLabels.includes('DLPC Contract'), 'DLE salary Summary drops empty DLPC Contract');
assert(!dleLabels.includes('Dlpc Staff'), 'DLE salary Summary drops empty DLPC Staff');
assert(!dleLabels.includes('Mubass (Outsourced)'), 'DLE salary Summary drops empty Mubass');
assert(!dleLabels.includes('Nayak'), 'DLE salary Summary drops empty Nayak');

const dlpcSummary = buildOfficialSalariedDetailWorksheets([base as any, dlpcCont as any], {
  periodLabel: 'August 2026',
  currencyScope: 'all',
  company: 'DLPC',
}).find((sheet) => sheet.sheetName === 'Summary');
const dlpcLabels = labelsOf(dlpcSummary?.rows);

assert(dlpcLabels.includes('DLPC Contract'), 'DLPC salary Summary keeps contract when it has a figure');
assert(dlpcLabels.includes('Dlpc Staff'), 'DLPC salary Summary keeps staff when it has a figure');
assert(dlpcLabels.includes('GRAND TOTAL'), 'DLPC salary Summary keeps GRAND TOTAL');
assert(!dlpcLabels.includes('DLE Contract'), 'DLPC salary Summary drops empty DLE Contract');
assert(!dlpcLabels.includes('DLE Staff'), 'DLPC salary Summary drops empty DLE Staff');
assert(!dlpcLabels.includes('USD'), 'DLPC salary Summary drops the USD block when it has no figure');
assert(!dlpcLabels.includes('GM Ops'), 'DLPC salary Summary drops empty GM Ops');
assert(!dlpcLabels.includes('MD'), 'DLPC salary Summary drops empty MD');

const mixedSummary = buildOfficialSalariedDetailWorksheets(
  [base as any, dlpcCont as any, dlePerm as any, usd as any],
  { periodLabel: 'August 2026', currencyScope: 'all' },
).find((sheet) => sheet.sheetName === 'Summary');
const mixedLabels = labelsOf(mixedSummary?.rows);
assert(mixedLabels.includes('DLE Staff') && mixedLabels.includes('Dlpc Staff'), 'Combined salary Summary keeps both companies that have figures');
assert(!mixedLabels.includes('Mubass (Outsourced)'), 'Combined salary Summary still drops empty Mubass');

const dleDaySheets = await buildOfficialDayrateScheduleWorksheets([dleDay as any], {
  period: '',
  periodLabel: 'August 2026',
  company: 'DLE',
});
const dleDayLabels = labelsOf(dleDaySheets.find((sheet) => sheet.sheetName === 'SUMMARY')?.rows);
assert(dleDayLabels.includes('DLE'), 'DLE dayrate Summary keeps DLE when it has a figure');
assert(dleDayLabels.includes('Total'), 'DLE dayrate Summary keeps Total');
assert(!dleDayLabels.includes('DLPC'), 'DLE dayrate Summary drops empty DLPC');

const dlpcDaySheets = await buildOfficialDayrateScheduleWorksheets([dlpcDay as any], {
  period: '',
  periodLabel: 'August 2026',
  company: 'DLPC',
});
const dlpcDayLabels = labelsOf(dlpcDaySheets.find((sheet) => sheet.sheetName === 'SUMMARY')?.rows);
assert(dlpcDayLabels.includes('DLPC'), 'DLPC dayrate Summary keeps DLPC when it has a figure');
assert(!dlpcDayLabels.includes('DLE'), 'DLPC dayrate Summary drops empty DLE');

console.log('payroll-official-excel-summary.test.ts OK');
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});