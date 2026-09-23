/**
 * December 2025 package for Mrs Odulate, used until the October 2026 salary.
 * Run: npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/lib/locked-payroll-package.test.ts
 */
import assert from 'node:assert/strict';
import {
  applyLockedPayrollPackage,
  applyLockedPayrollPackageToRecords,
  lockedNgnForUsdAmount,
  lockedPayrollPackageFor,
  payrollLinesForLockedNgn,
  payrollLinesFromLockedNgn,
} from './locked-payroll-package';
import type { DleEmployeeDirectoryRow } from './dle-enterprise-db';

const odulate = {
  employeeCode: 'P0442',
  fullName: 'Mrs ODULATE Abiodun Temitope',
  payCurrency: 'USD',
  periodSalary: 36.56,
  sagePayrollEarnings: [
    { code: 'EXP_SMGT BASIC', name: 'EXP_SMGT BASIC', amount: 36.56 },
    { code: 'EXP_SMNG TRANSPORT', name: 'EXP_SMNG TRANSPORT', amount: 453.1 },
  ],
} as DleEmployeeDirectoryRow;

const pack = lockedPayrollPackageFor(odulate, '2026-09');
assert.ok(pack);
assert.equal(pack?.grossUsd, 4631.3);
assert.equal(pack?.grossNgn, 6171216.9);
assert.equal(lockedPayrollPackageFor(odulate, '2026-10'), null);
assert.equal(lockedPayrollPackageFor({ employeeCode: 'P0364', fullName: 'MGBEOJI' }, '2026-09'), null);
assert.ok(lockedPayrollPackageFor({ employeeId: '0442', fullName: 'ODULATE' }, ''));

assert.equal(lockedNgnForUsdAmount(pack!, 4631.3), 6171216.9);
assert.equal(lockedNgnForUsdAmount(pack!, 926.3), 1234243.4);
assert.equal(lockedNgnForUsdAmount(pack!, 463.1), 617121.7);
assert.equal(lockedNgnForUsdAmount(pack!, 694.7), 925682.5);
assert.equal(lockedNgnForUsdAmount(pack!, 2547.2), 3394169.3);
assert.equal(lockedNgnForUsdAmount(pack!, 100), null);

const applied = applyLockedPayrollPackage(odulate, '2026-09');
assert.equal(applied.periodSalary, 4631.3);
assert.equal(applied.basicSalary, 926.3);
assert.equal(applied.sagePayrollEarnings?.length, 4);
assert.equal(applied.sagePayrollEarnings?.reduce((sum, line) => sum + Number(line.amount), 0), 4631.3);
assert.equal(odulate.sagePayrollEarnings?.[0]?.amount, 36.56);

const dual = applyLockedPayrollPackage({
  ...odulate,
  hasDualCurrencyPayroll: true,
  sageLocalPayrollEarnings: [{ code: 'BASIC', name: 'BASIC SALARY', amount: 1251873.99 }],
} as DleEmployeeDirectoryRow, '2026-09');
assert.equal(dual.localPeriodSalary, 6171216.9);
assert.equal(dual.sageLocalPayrollEarnings?.some((line) => line.code === 'PENSION_REFUND'), false);
assert.equal(
  Math.round((dual.sageLocalPayrollEarnings || []).reduce((sum, line) => sum + Number(line.amount), 0) * 10) / 10,
  6171216.9,
);

const shown = payrollLinesForLockedNgn(
  [{ id: '1', code: 'EXP_SMGT_BASIC', name: 'Basic', amount: '926.3', taxable: true, frequency: 'monthly' }],
  pack!,
);
assert.equal(shown[0]?.amount, '1234243.4');
const restored = payrollLinesFromLockedNgn(shown, pack!);
assert.equal(restored[0]?.amount, '926.3');

const records = applyLockedPayrollPackageToRecords([
  {
    employeeCode: 'P0442',
    fullName: 'ODULATE',
    payCurrency: 'USD',
    payrollGroup: 'DLE_USD',
    isDailyRate: false,
    grossPay: 3331.68,
    basePay: 36.56,
    allowances: 3295.12,
    totalDeductions: 0,
    netPay: 3331.68,
    employerCost: 3331.68,
    earningLines: [],
  },
], '2026-09');
assert.equal(records[0]?.grossPay, 4631.3);
assert.equal(records[0]?.netPay, 4631.3);
assert.equal(records[0]?.lockedNgnGross, 6171216.9);
assert.equal(records[0]?.basePay, 926.3);

console.log('locked-payroll-package.test.ts ok');
