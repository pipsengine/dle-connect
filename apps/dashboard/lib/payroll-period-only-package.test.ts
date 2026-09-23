/**
 * Standing package vs this-period-only variable earnings.
 * Run: npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/lib/payroll-period-only-package.test.ts
 */
import assert from 'node:assert/strict';
import {
  effectiveHrisPayrollLines,
  isPeriodOnlyPackageEarningLine,
  keepUnscheduledStandingPackageLines,
  mergePayrollEarningLinesForSave,
  packageLinePaysInPeriod,
  splitDraftEarningLinesByScope,
  storedPackageLinesForPayrollSave,
  type StoredPayrollPackageLine,
} from './payroll-package-lines';
import { calculatePayrollEarnings } from './payroll-earnings-engine';
import type { DleEmployeeDirectoryRow } from './dle-enterprise-db';

assert.equal(isPeriodOnlyPackageEarningLine({ code: 'OVERTIME', name: 'OVERTIME' }), true);
assert.equal(isPeriodOnlyPackageEarningLine({ code: 'ARREARS', name: 'Arrears' }), true);
assert.equal(isPeriodOnlyPackageEarningLine({ code: 'STOCKCOUNT', name: 'Stock Count' }), true);
assert.equal(isPeriodOnlyPackageEarningLine({ code: 'LUMPSUMTAX', name: 'LUMPSUM ALLOWANCE', runFrequency: 'monthly' }), false);
assert.equal(isPeriodOnlyPackageEarningLine({ code: 'MEAL', name: 'Meal Allowance', runFrequency: 'monthly' }), false);
assert.equal(isPeriodOnlyPackageEarningLine({ code: 'SITE', name: 'Site Allowance', runFrequency: 'monthly' }), false);
assert.equal(isPeriodOnlyPackageEarningLine({ code: 'SITE_ALLOW', name: 'SITE ALLOWANCE' }), false);
assert.equal(isPeriodOnlyPackageEarningLine({ code: 'OVERTIME', frequency: 'one-off' }), true);

assert.equal(packageLinePaysInPeriod({ code: 'MEAL', runFrequency: 'monthly' }, '2026-09'), true);
assert.equal(packageLinePaysInPeriod({ code: 'OVERTIME', runFrequency: 'one-off' }, '2026-09'), false);
assert.equal(packageLinePaysInPeriod({ code: 'OVERTIME', runFrequency: 'one-off', payrollPeriod: '2026-09' }, '2026-09'), true);
assert.equal(packageLinePaysInPeriod({ code: 'OVERTIME', runFrequency: 'one-off', payrollPeriod: '2026-09' }, '2026-10'), false);
assert.equal(packageLinePaysInPeriod({ code: 'OVERTIME', amount: 3000 }, '2026-09'), false);

const promoted = effectiveHrisPayrollLines([
  { code: 'LUMPSUMTAX', name: 'LUMPSUM ALLOWANCE', amount: 260000, runFrequency: 'monthly', sourceAmount: 260000 },
  { code: 'OVERTIME', name: 'OVERTIME', amount: 3000 },
  { code: 'SITE', name: 'SITE ALLOWANCE', amount: 50000 },
]);
assert.equal(promoted.some((line) => line.code === 'OVERTIME'), false, 'Sage leftover overtime must not be promoted onto the standing package');
assert.equal(promoted.some((line) => line.code === 'SITE'), true, 'Standing Sage site allowance may remain on the package');

const saved = storedPackageLinesForPayrollSave([
  { code: 'LUMPSUMTAX', name: 'LUMPSUM', amount: 260000, runFrequency: 'monthly', sourceAmount: 260000 },
  { code: 'OVERTIME', name: 'OVERTIME', amount: 3000, runFrequency: 'one-off', sourceAmount: 3000, includeInMonthlyPayroll: false },
  { code: 'ARREARS', name: 'ARREARS', amount: 8000, runFrequency: 'one-off', sourceAmount: 8000, includeInMonthlyPayroll: false, payrollPeriod: '2026-09' },
] as StoredPayrollPackageLine[], '2026-09');
assert.equal(saved.some((line) => line.code === 'OVERTIME'), false);
assert.equal(saved.some((line) => line.code === 'ARREARS'), true);
assert.equal(saved.some((line) => line.code === 'LUMPSUMTAX'), true);

const merged = mergePayrollEarningLinesForSave(
  [
    { code: 'LUMPSUMTAX', name: 'LUMPSUM', amount: 260000, runFrequency: 'monthly', sourceAmount: 260000 },
    { code: 'OVERTIME', name: 'OVERTIME', amount: 3000 },
  ],
  [{ code: 'LUMPSUMTAX', name: 'LUMPSUM', amount: 260000, runFrequency: 'monthly', sourceAmount: 260000 }],
);
assert.equal(merged.some((line) => line.code === 'OVERTIME'), false, 'save must drop leftover overtime rather than merge it back');

const mealReplaced = mergePayrollEarningLinesForSave(
  [
    { code: 'LUMPSUMTAX', name: 'LUMPSUM', amount: 436876.13, runFrequency: 'monthly', sourceAmount: 436876.13 },
    { code: 'MEAL', name: 'MEAL', amount: 33000 },
    { code: 'TCMTRANS', name: 'TCM TRANSPORT', amount: 33000 },
  ],
  [
    { code: 'LUMPSUMTAX', name: 'LUMPSUM', amount: 436876.13, runFrequency: 'monthly', sourceAmount: 436876.13 },
    { code: 'TCMMEAL', name: 'MEAL', amount: 31500, runFrequency: 'monthly', sourceAmount: 31500, includeInMonthlyPayroll: true },
    { code: 'TCMTRANS', name: 'TCM TRANSPORT', amount: 31500, runFrequency: 'monthly', sourceAmount: 31500, includeInMonthlyPayroll: true },
  ],
);
assert.equal(mealReplaced.filter((line) => /MEAL/i.test(String(line.code))).length, 1, 'saving TCMMEAL must drop the leftover MEAL line');
assert.equal(mealReplaced.find((line) => line.code === 'TCMMEAL')?.amount, 31500);

const bothMealsSubmitted = mergePayrollEarningLinesForSave(
  [],
  [
    { code: 'MEAL', name: 'MEAL', amount: 33000, runFrequency: 'monthly', sourceAmount: 33000, includeInMonthlyPayroll: true },
    { code: 'TCMMEAL', name: 'MEAL', amount: 31500, runFrequency: 'monthly', sourceAmount: 31500, includeInMonthlyPayroll: true },
  ],
);
assert.equal(bothMealsSubmitted.filter((line) => /MEAL/i.test(String(line.code))).length, 1);
assert.equal(bothMealsSubmitted[0]?.code, 'TCMMEAL');
assert.equal(bothMealsSubmitted[0]?.amount, 31500);

const scoped = splitDraftEarningLinesByScope([
  { id: '1', code: 'LUMPSUMTAX', name: 'LUMPSUM', amount: '260000', taxable: true, frequency: 'monthly' },
  { id: '2', code: 'OVERTIME', name: 'OVERTIME', amount: '3000', taxable: true, frequency: 'one-off', payrollPeriod: '2026-09' },
  { id: '3', code: 'OVERTIME', name: 'OLD OT', amount: '1500', taxable: true, frequency: 'one-off' },
], '2026-09');
assert.equal(scoped.standing.length, 1);
assert.equal(scoped.thisPeriod.length, 1);
assert.equal(scoped.leftover.length, 1);

const employee = (overrides: Partial<DleEmployeeDirectoryRow>): DleEmployeeDirectoryRow =>
  ({
    employeeId: 'L0100',
    employeeCode: 'L0100',
    fullName: 'Test',
    status: 'Active',
    employmentType: 'Lumpsum',
    periodSalary: 260000,
    ...overrides,
  }) as DleEmployeeDirectoryRow;

const leftoverPay = calculatePayrollEarnings(employee({
  sagePayrollEarnings: [
    { code: 'LUMPSUMTAX', name: 'LUMPSUM ALLOWANCE', amount: 260000, runFrequency: 'monthly', sourceAmount: 260000 },
    { code: 'OVERTIME', name: 'OVERTIME', amount: 3000, runFrequency: 'one-off', sourceAmount: 3000, includeInMonthlyPayroll: false },
  ],
}), { useHrisPackageLines: true, period: '2026-09' });
assert.equal(leftoverPay.grossPay, 260000);
assert.equal(leftoverPay.paidEarningLines.some((line) => line.code === 'OVERTIME'), false);

const sageLeftoverPay = calculatePayrollEarnings(employee({
  sagePayrollEarnings: [
    { code: 'LUMPSUMTAX', name: 'LUMPSUM ALLOWANCE', amount: 260000, runFrequency: 'monthly', sourceAmount: 260000 },
    { code: 'OVERTIME', name: 'OVERTIME', amount: 3000 },
  ],
}), { useHrisPackageLines: true, period: '2026-09' });
assert.equal(sageLeftoverPay.paidEarningLines.some((line) => line.code === 'OVERTIME'), false);
assert.equal(sageLeftoverPay.grossPay, 260000);

const stampedPay = calculatePayrollEarnings(employee({
  sagePayrollEarnings: [
    { code: 'LUMPSUMTAX', name: 'LUMPSUM ALLOWANCE', amount: 260000, runFrequency: 'monthly', sourceAmount: 260000 },
    { code: 'OVERTIME', name: 'OVERTIME', amount: 3000, runFrequency: 'one-off', sourceAmount: 3000, includeInMonthlyPayroll: false, payrollPeriod: '2026-09' },
  ],
}), { useHrisPackageLines: true, period: '2026-09' });
assert.equal(stampedPay.paidEarningLines.find((line) => line.code === 'OVERTIME')?.amount, 3000);
assert.equal(stampedPay.grossPay, 263000);

const standingSitePay = calculatePayrollEarnings(employee({
  employeeCode: 'P0399',
  employeeId: 'P0399',
  employmentType: 'Permanent',
  salaryGrade: 'MGTCOLA',
  periodSalary: 518255,
  sagePayrollEarnings: [
    { code: 'MGT1COLA_BASIC', name: 'BASIC SALARY', amount: 213158.87, runFrequency: 'monthly', sourceAmount: 213158.87, includeInMonthlyPayroll: true },
    { code: 'SITE', name: 'SITE ALLOWANCE', amount: 300000, runFrequency: 'monthly', sourceAmount: 300000, includeInMonthlyPayroll: true },
  ],
}), { useHrisPackageLines: true, period: '2026-09' });
assert.equal(standingSitePay.paidEarningLines.find((line) => line.code === 'SITE')?.amount, 300000, 'HRIS monthly site allowance stays standing');

const preservedTcm = keepUnscheduledStandingPackageLines(
  [{ code: 'LUMPSUMTAX', name: 'LUMPSUM', amount: 436876.13, runFrequency: 'monthly', sourceAmount: 436876.13 }],
  [
    { code: 'TCMMEAL', name: 'MEAL', amount: 31500, runFrequency: 'monthly', sourceAmount: 31500 },
    { code: 'TCM_TRNSPT', name: 'TCM TRANSPORT', amount: 31500, runFrequency: 'monthly', sourceAmount: 31500 },
  ],
);
assert.equal(preservedTcm.some((line) => line.code === 'TCMMEAL' && line.amount === 31500), true, 'salary schedule persist must keep TCM meal');
assert.equal(preservedTcm.some((line) => /TCM/i.test(line.code) && /TRANS|TRNSPT/i.test(line.code) && line.amount === 31500), true, 'salary schedule persist must keep TCM transport');

console.log('payroll-period-only-package tests passed');
