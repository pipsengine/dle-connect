/**
 * Run: npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/lib/payroll-official-excel-components.test.ts
 * Salary-schedule component columns must add up to Gross Earnings for every pack.
 */
import assert from 'node:assert/strict';
import { buildOfficialSalariedDetailWorksheets } from './payroll-official-excel-export';

const round = (value: number) => Math.round(value * 100) / 100;

const line = (code: string, name: string, amount: number) => ({ code, name, amount });

const record = (
  employeeCode: string,
  employmentType: string,
  lines: Array<{ code: string; name: string; amount: number }>,
  extra: Record<string, unknown> = {},
) => ({
  employeeId: employeeCode,
  employeeCode,
  fullName: employeeCode,
  employmentType,
  department: 'PRODUCTION',
  location: 'AGEGE',
  businessUnit: 'DLE',
  payrollGroup: 'DLE',
  jobTitle: 'ENGINEER',
  isDailyRate: false,
  payCurrency: 'NGN',
  grossPay: round(lines.reduce((sum, item) => sum + item.amount, 0)),
  netPay: round(lines.reduce((sum, item) => sum + item.amount, 0)),
  earningLines: lines,
  deductionLines: [],
  ...extra,
});

const displayedCode = (employeeCode: string) => (
  /^P\d+$/i.test(employeeCode) ? employeeCode.slice(1) : employeeCode
);

const earningIndexes = (columns: string[]) => columns
  .map((label, index) => ({ label, index }))
  .filter(({ label }) => /\(Earning\)$/i.test(label) || /^Weekly Transport\s*$/i.test(label))
  .map(({ index }) => index);

const sheets = buildOfficialSalariedDetailWorksheets([
  record('P0442', 'Permanent', [
    line('BASIC', 'BASIC SALARY', 1234243.38),
    line('SNMHOUSINGTAX', 'SENIOR MANAGEMENT HOUSING_TAX', 925682.54),
    line('SNMTRANSPTAX', 'SENIOR MANAGER TRANSPORT', 617121.69),
    line('SNMOTHALLTAX', 'SENIOR MANAGEMENT OTHER ALLOWANCE_T', 3394169.31),
    line('PENSION_REFUND', 'PENSION REFUND', 222163.81),
  ]),
  record('P0457', 'Permanent', [
    line('BASIC', 'BASIC SALARY', 640455.73),
    line('HOUSING', 'HOUSING', 512364.59),
    line('TRANSPORT', 'TRANSPORT ALLOWANCE', 384273.44),
    line('OTHERALL', 'OTHER ALLOWANCE', 742928.65),
    line('FURNITURE', 'FURNITURE', 102472.92),
    line('UTILITY', 'UTILITY', 99142.55),
  ]),
  record('P1101', 'Permanent', [
    line('SNR_BASIC', 'BASIC SALARY', 100000),
    line('SNR_HOUSE', 'HOUSING', 20000),
    line('SNR_MEDICAL', 'MEDICAL', 10000),
    line('SNR_OTHERALL', 'OTHER ALLOWANCE', 30000),
    line('SNR_TRANS', 'TRANSPORT ALLOWANCE', 15000),
    line('SNR_UTILITY', 'UTILITIES', 5000),
    line('PER_MEAL', 'Meal Allowance', 22000),
    line('SNR_NJIC', 'SNR NJIC', 15000),
    line('SNR_UNION', 'SNR UNION', 2500),
  ]),
  record('P1102', 'Permanent', [
    line('JNR_BASIC', 'BASIC SALARY', 80000),
    line('JNR_HOUSE', 'HOUSING', 10000),
    line('JNR_MEDICAL', 'MEDICAL', 8000),
    line('JNR_OTHERALL', 'OTHER ALLOWANCE', 20000),
    line('JNR_TRANS', 'TRANSPORT ALLOWANCE', 8000),
    line('JNR_UTILITY', 'UTILITIES', 4000),
    line('PER_MEAL_JNR', 'Meal Allowance', 8800),
    line('JNR_NJIC', 'JNR NJIC', 10000),
    line('JNR_UNION', 'JUNIOR UNION', 2000),
    line('JNR_LEAVE', 'LEAVE', 5000),
  ]),
  record('P1103', 'Permanent', [
    line('MGT_BASIC', 'BASIC SALARY', 250000),
    line('MGT_HOUSE', 'HOUSING', 200000),
    line('MGT_OTHERALL', 'OTHER ALLOWANCE', 290000),
    line('MGT_TRANS', 'TRANSPORT ALLOWANCE', 150000),
    line('MGT_FURN', 'FURNITURE ALLOWANCE', 40000),
    line('MGT_UTILITY', 'UTILITIES', 38700),
  ]),
  record('P1104', 'Permanent', [
    line('MGT1COLA_BASIC', 'BASIC SALARY', 400000),
    line('MGT1COLA_HOUSIN', 'HOUSING', 160000),
    line('MGT1COLA_OTHALL', 'OTHER ALLOWANCE', 232000),
    line('MGT1COLA_TRANSP', 'TRANSPORT ALLOWANCE', 120000),
    line('MGT1COLA_FURN', 'FURNITURE ALLOWANCE', 32000),
    line('MGT1COLA_UTILIT', 'UTILITIES', 30400),
  ]),
  record('P1105', 'Permanent', [
    line('SNM_BASIC', 'BASIC SALARY', 200000),
    line('SNM_HOUSE', 'HOUSING', 100000),
    line('SNM_FURN', 'FURNITURE ALLOWANCE', 75000),
    line('SNM_OTHERALL', 'OTHER ALLOWANCE', 430000),
    line('SNM_TRANS', 'TRANSPORT ALLOWANCE', 70000),
    line('SNM_UTILITY', 'UTILITIES', 100000),
  ]),
  record('P1106', 'Permanent', [
    line('BASIC', 'BASIC SALARY', 50000),
    line('MISC', 'MISCELLANEOUS', 7500),
    line('TRANSPORT_WK', 'WEEKLY TRANSPORT', 4000),
    line('OVERTIME', 'OVERTIME', 6000),
  ]),
  record('L1101', 'Contract Lumpsum', [
    line('LUMPSUMTAX', 'LUMPSUM ALLOWANCE', 250000),
    line('MEAL', 'MEAL ALLOWANCE', 10000),
  ]),
  record('L1102', 'Contract Lumpsum', [
    line('BASIC1_LUMPSUM', 'LUMPSUM AMOUNT', 180000),
    line('TCMMEAL', 'TCM MEAL', 4500),
  ]),
  record('NYSC0025', 'NYSC', [
    line('NYSCALLOW', 'NYSC ALLOWANCE', 70000),
  ]),
  record('IT0100', 'Industrial Training', [
    line('ITALLOW', 'IT ALLOWANCE', 40000),
  ]),
  record('L1103', 'Contract Lumpsum', [
    line('LUMPSUMTAX', 'LUMPSUM ALLOWANCE', 90000),
    line('NIGHT_ALLOW', 'NIGHT ALLOWANCE', 5000),
    line('WEEKDAYOVT', 'WEEKDAY OVT EARNING', 8000),
    line('ARREARS', 'ARREARS', 3000),
    line('TRANSPORT_WK', 'WEEKLY TRANSPORT', 2000),
    line('SITE_ALLOW', 'SITE ALLOWANCE', 1500),
  ]),
  record('P9001', 'Permanent', [
    line('BASIC', 'BASIC SALARY', 200),
    line('EXP_BASIC', 'EXP SMGT BASIC', 1000),
    line('EXP_OTHALL', 'EXP SMGT OTHER ALLOWANCE', 500),
    line('EXP_HOUSING', 'EXP SMGT HOUSING', 400),
    line('EXP_TRANSP', 'EXP SNMG TRANSPORT', 300),
    line('MEAL', 'MEAL ALLOWANCE', 50),
  ], { payCurrency: 'USD', payrollGroup: 'DLE_USD', jobTitle: 'EXPATRIATE ENGINEER' }),
] as never[], {
  periodLabel: 'October 2026',
  currencyScope: 'all',
  includeBankSheets: false,
});

const perm = sheets.find((sheet) => sheet.sheetName === 'PERM.STAFF');
const cont = sheets.find((sheet) => sheet.sheetName === 'CONT. STAFF');
const usd = sheets.find((sheet) => sheet.sheetName === 'USD REPORT' && sheet.columns.includes('Gross Earnings'));
assert(perm && cont && usd, 'salary schedule includes PERM, CONT, and the USD detail sheet');

const amount = (sheet: { columns: string[]; rows: unknown[][] }, code: string, label: string) => {
  const row = sheet.rows.find((cells) => String(cells[0] ?? '') === code);
  assert(row, `missing row ${code}`);
  const index = sheet.columns.indexOf(label);
  assert(index >= 0, `${label} exists for ${code}`);
  return Number(row[index] || 0);
};

const assertFoots = (sheet: { columns: string[]; rows: unknown[][] }, code: string) => {
  const row = sheet.rows.find((cells) => String(cells[0] ?? '') === code);
  assert(row, `missing ${code}`);
  const componentSum = round(earningIndexes(sheet.columns).reduce((sum, index) => sum + Number(row[index] || 0), 0));
  const gross = Number(row[sheet.columns.indexOf('Gross Earnings')] || 0);
  const earningTotal = Number(row[sheet.columns.indexOf('Earning Total')] || 0);
  assert.equal(componentSum, gross, `${code} component columns ${componentSum} must equal gross ${gross}`);
  assert.equal(earningTotal, gross, `${code} Earning Total ${earningTotal} must equal gross ${gross}`);
};

const permCode = displayedCode;
assertFoots(perm, permCode('P0442'));
assertFoots(perm, permCode('P0457'));
assertFoots(perm, permCode('P1101'));
assertFoots(perm, permCode('P1102'));
assertFoots(perm, permCode('P1103'));
assertFoots(perm, permCode('P1104'));
assertFoots(perm, permCode('P1105'));
assertFoots(perm, permCode('P1106'));
assertFoots(cont, 'L1101');
assertFoots(cont, 'L1102');
assertFoots(cont, 'NYSC0025');
assertFoots(cont, 'IT0100');
assertFoots(cont, 'L1103');
assertFoots(usd, '9001_');

assert.equal(amount(perm, permCode('P0442'), 'SENIOR MANAGEMENT OTHER ALLOWANCE_T (Earning)'), 3394169.31);
assert.equal(amount(perm, permCode('P0442'), 'OTHER ALLOWANCE (Earning)'), 0);
assert.equal(amount(perm, permCode('P0442'), 'SENIOR MANAGEMENT HOUSING_TAX (Earning)'), 925682.54);
assert.equal(amount(perm, permCode('P0442'), 'HOUSING (Earning)'), 0);
assert.equal(amount(perm, permCode('P0442'), 'PENSION REFUND (Earning)'), 222163.81);

assert.equal(amount(perm, permCode('P0457'), 'HOUSING (Earning)'), 512364.59);
assert.equal(amount(perm, permCode('P0457'), 'UTILITY (Earning)'), 99142.55);
assert.equal(amount(perm, permCode('P0457'), 'UTILITIES (Earning)'), 0);
assert.equal(amount(perm, permCode('P0457'), 'FURNITURE (Earning)'), 102472.92);
assert.equal(amount(perm, permCode('P0457'), 'FURNITURE ALLOWANCE (Earning)'), 0);

assert.equal(amount(perm, permCode('P1101'), 'NJIC (Earning)'), 15000);
assert.equal(amount(perm, permCode('P1101'), 'Meal Allowance (Earning)'), 22000);
assert.equal(amount(perm, permCode('P1101'), 'Jnr Staff_Meal Allowance (Earning)'), 0);
assert.equal(amount(perm, permCode('P1101'), 'TRANSPORT ALLOWANCE (Earning)'), 15000);
assert.equal(amount(perm, permCode('P1101'), 'SNR UNION (Earning)'), 2500);
assert.equal(amount(perm, permCode('P1101'), 'UTILITIES (Earning)'), 5000);
assert.equal(amount(perm, permCode('P1101'), 'UTILITY (Earning)'), 0);

assert.equal(amount(perm, permCode('P1102'), 'NJIC (Earning)'), 10000);
assert.equal(amount(perm, permCode('P1102'), 'Jnr Staff_Meal Allowance (Earning)'), 8800);
assert.equal(amount(perm, permCode('P1102'), 'Meal Allowance (Earning)'), 0);
assert.equal(amount(perm, permCode('P1102'), 'JNR UTILITY (Earning)'), 4000);
assert.equal(amount(perm, permCode('P1102'), 'UTILITIES (Earning)'), 0);
assert.equal(amount(perm, permCode('P1102'), 'JNR MEDICAL (Earning)'), 8000);
assert.equal(amount(perm, permCode('P1102'), 'MEDICAL (Earning)'), 0);
assert.equal(amount(perm, permCode('P1102'), 'JNR OTHER ALLOWANCE (Earning)'), 20000);
assert.equal(amount(perm, permCode('P1102'), 'OTHER ALLOWANCE (Earning)'), 0);
assert.equal(amount(perm, permCode('P1102'), 'JUNIOR UNION (Earning)'), 2000);
assert.equal(amount(perm, permCode('P1102'), 'Leave Allowance (Earning)'), 5000);

assert.equal(amount(perm, permCode('P1103'), 'FURNITURE ALLOWANCE (Earning)'), 40000);
assert.equal(amount(perm, permCode('P1103'), 'FURNITURE (Earning)'), 0);
assert.equal(amount(perm, permCode('P1104'), 'HOUSING (Earning)'), 160000);
assert.equal(amount(perm, permCode('P1105'), 'OTHER ALLOWANCE (Earning)'), 430000);
assert.equal(amount(perm, permCode('P1105'), 'SENIOR MANAGEMENT OTHER ALLOWANCE_T (Earning)'), 0);
assert.equal(amount(perm, permCode('P1105'), 'HOUSING (Earning)'), 100000);
assert.equal(amount(perm, permCode('P1105'), 'SENIOR MANAGER TRANSPORT (Earning)'), 70000);
assert.equal(amount(perm, permCode('P1105'), 'TRANSPORT ALLOWANCE (Earning)'), 0);
assert.equal(amount(perm, permCode('P1106'), 'MISCELLANEOUS (Earning)'), 7500);
assert.equal(amount(perm, permCode('P1106'), 'Weekly Transport '), 4000);

assert.equal(amount(cont, 'L1101', 'LUMPSUM ALLOWANCE (Earning)'), 250000);
assert.equal(amount(cont, 'L1101', 'LUMSUM AMOUNT (Earning)'), 0);
assert.equal(amount(cont, 'L1101', 'MEAL ALLOWANCE (Earning)'), 10000);
assert.equal(amount(cont, 'L1101', 'MEAL (Earning)'), 0);
assert.equal(amount(cont, 'L1102', 'LUMSUM AMOUNT (Earning)'), 180000);
assert.equal(amount(cont, 'L1102', 'LUMPSUM ALLOWANCE (Earning)'), 0);
assert.equal(amount(cont, 'L1102', 'MEAL (Earning)'), 4500);
assert.equal(amount(cont, 'NYSC0025', 'NYSC ALLOWANCE (Earning)'), 70000);
assert.equal(amount(cont, 'IT0100', 'IT ALLOWANCE (Earning)'), 40000);
assert.equal(amount(cont, 'L1103', 'NIGHT ALLOWANCE (Earning)'), 5000);
assert.equal(amount(cont, 'L1103', 'OVERTIME (Earning)'), 8000);
assert.equal(amount(cont, 'L1103', 'Weekly Transport '), 2000);

assert.equal(amount(usd, '9001_', 'BASIC SALARY (Earning)'), 200);
assert.equal(amount(usd, '9001_', 'EXP_ SMGT BASIC (Earning)'), 1000);
assert.equal(amount(usd, '9001_', 'EXP_ SMGT OTHER ALLOWANCE (Earning)'), 500);
assert.equal(amount(usd, '9001_', 'EXP_SMGT HOUSING (Earning)'), 400);
assert.equal(amount(usd, '9001_', 'EXP_SNMG TRANSPORT (Earning)'), 300);
assert.equal(amount(usd, '9001_', 'Meal Allowance (Earning)'), 50);

console.log('payroll-official-excel-components.test.ts ok');
