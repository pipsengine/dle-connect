/**
 * Accuracy checks for consolidated Salaries Summary (NGN + locked USD FX).
 * Run: npx tsx lib/payroll-salaries-summary.test.ts
 */
import assert from 'node:assert/strict';
import { buildPayrollSalariesSummary } from './payroll-salaries-summary';

const packs = [
  {
    scheduleId: 'dle-salaries',
    packLabel: 'DLE Salaries',
    payrollComputed: true,
    run: { status: 'CFO Approved', employeeCount: 2 },
    summary: {
      employees: 2,
      basePay: 80,
      allowances: 20,
      grossPay: 100,
      totalDeductions: 10,
      netPay: 90,
      employerCost: 110,
    },
    records: [
      { employeeId: 'A', fullName: 'Perm One', employmentType: 'Permanent', grossPay: 60 },
      { employeeId: 'B', fullName: 'Contract Two', employmentType: 'Contract', payrollGroup: 'Contract / Lumpsum', grossPay: 40 },
    ],
  },
  {
    scheduleId: 'dle-usd',
    packLabel: 'DLE USD',
    payrollComputed: true,
    run: { status: 'CFO Approved', employeeCount: 2 },
    summary: {
      employees: 2,
      basePay: 1000,
      allowances: 0,
      grossPay: 1000,
      totalDeductions: 50,
      netPay: 950,
      employerCost: 1000,
    },
    records: [
      { employeeId: 'P0413', employeeCode: 'P0413', fullName: 'MD Ijeli', jobTitle: 'Managing Director', grossPay: 700 },
      { employeeId: 'PEX001', employeeCode: 'PEX001', fullName: 'NAYAK/SUSHIL', expatriate: true, grossPay: 300 },
    ],
  },
  {
    scheduleId: 'dlpc-salaries',
    packLabel: 'DLPC Salaries',
    payrollComputed: true,
    run: { status: 'Approved', employeeCount: 1 },
    summary: { employees: 1, grossPay: 50, totalDeductions: 5, netPay: 45, employerCost: 55 },
    records: [{ employeeId: 'C', fullName: 'DLPC Perm', employmentType: 'Permanent', grossPay: 50 }],
  },
  {
    scheduleId: 'dle-dayrate',
    packLabel: 'DLE Day-rate',
    payrollComputed: true,
    run: { status: 'Draft', employeeCount: 0 },
    summary: { employees: 0, grossPay: 0, totalDeductions: 0, netPay: 0, employerCost: 0 },
    records: [],
  },
  {
    scheduleId: 'dlpc-dayrate',
    packLabel: 'DLPC Day-rate',
    payrollComputed: true,
    run: { status: 'Draft', employeeCount: 0 },
    summary: { employees: 0, grossPay: 0, totalDeductions: 0, netPay: 0, employerCost: 0 },
    records: [],
  },
];

const fx = 1620;
const summary = buildPayrollSalariesSummary({
  period: '2026-08',
  packs,
  lockedFx: { rate: fx, rateDate: '2026-08-31', source: 'test' },
  priorTotalsNgn: {
    period: '2026-07',
    periodLabel: 'July 2026',
    employees: 6,
    grossPay: 2_000_000,
    deductions: 200_000,
    netPay: 1_800_000,
    employerCost: 2_100_000,
  },
  priorTotalEarningsNgn: 2_000_000,
  priorSchedules: [
    { id: 'dle-salaries', label: 'DLE Salaries', headcount: 3, grossPayNgn: 1_500_000, deductionsNgn: 0, netPayNgn: 0, employerCostNgn: 0, pctOfTotal: 0, status: 'Posted', nativeCurrency: 'NGN', nativeGrossPay: 1_500_000 },
    { id: 'dle-usd', label: 'DLE USD', headcount: 2, grossPayNgn: 500_000, deductionsNgn: 0, netPayNgn: 0, employerCostNgn: 0, pctOfTotal: 0, status: 'Posted', nativeCurrency: 'USD', nativeGrossPay: 308.64 },
  ],
});

assert.equal(summary.headcount.total, 5);
assert.equal(summary.headcount.usd, 2);
assert.equal(summary.headcount.ngn, 3);
assert.equal(summary.totalsNgn.grossPay, 100 + 50 + 1000 * fx);
assert.equal(summary.currencyMix.usdGrossNgn, 1000 * fx);
assert.equal(summary.usdNative.grossPay, 1000);
assert.equal(summary.lockedFx.display, '$1 = ₦1,620.00');

const usdRow = summary.schedules.find((row) => row.id === 'dle-usd');
assert.ok(usdRow);
assert.equal(usdRow.grossPayNgn, 1_620_000);
assert.equal(usdRow.nativeCurrency, 'USD');

const contract = summary.categories.find((row) => row.id === 'contract');
const expatriate = summary.categories.find((row) => row.id === 'expatriate');
const permanent = summary.categories.find((row) => row.id === 'permanent');
assert.ok(contract && expatriate && permanent);
assert.equal(contract.headcount, 2); // NGN contract + MD
assert.equal(expatriate.headcount, 1);
assert.equal(permanent.headcount, 2);
assert.ok(summary.monthOverMonth?.available);
assert.ok(summary.varianceDrivers.some((row) => row.id === 'dle-usd'));

console.log('payroll-salaries-summary.test.ts: ok');
console.log(
  JSON.stringify(
    {
      headcount: summary.headcount,
      totalsNgn: summary.totalsNgn,
      usdNative: summary.usdNative,
      schedules: summary.schedules.map((row) => ({
        id: row.id,
        headcount: row.headcount,
        grossPayNgn: row.grossPayNgn,
        pctOfTotal: row.pctOfTotal,
      })),
      categories: summary.categories,
    },
    null,
    2,
  ),
);
