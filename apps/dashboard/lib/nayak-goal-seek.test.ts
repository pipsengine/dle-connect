/**
 * Nayak Goal Seek — dollar net stays $3,000 from October 2026.
 * Run: npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/lib/nayak-goal-seek.test.ts
 */
import assert from 'node:assert/strict';
import type { DleEmployeeDirectoryRow } from './dle-enterprise-db';
import { GM_OPERATIONS_FALLBACK_FX } from './gm-operations-goal-seek';
import {
  applyNayakGoalSeek,
  applyNayakGoalSeekToRecords,
  evaluateNayakGoalSeek,
  nayakGoalSeekApplies,
  seekNayakGoalSeekPackage,
} from './nayak-goal-seek';

const nayak = {
  employeeCode: 'PEX001',
  employeeId: '2389',
  fullName: 'SUSHILKUMAR NAYAK',
  payCurrency: 'USD',
  periodSalary: 3000,
  basicSalary: 3000,
  hasDualCurrencyPayroll: true,
  localPayCurrency: 'NGN',
  localPayrollGroup: 'DLPC',
  localPeriodSalary: 269552.63,
  sagePayrollEarnings: [
    { code: 'BASIC', name: 'Basic', amount: 3000, taxableAmount: 3000, sourceAmount: 3000, runFrequency: 'monthly', includeInMonthlyPayroll: true },
  ],
  sageLocalPayrollEarnings: [
    { code: 'BASIC', name: 'BASIC SALARY', amount: 263552.63, taxableAmount: 263552.63, sourceAmount: 263552.63, runFrequency: 'monthly', includeInMonthlyPayroll: true },
    { code: 'TELEPHONE', name: 'TELEPHONE', amount: 6000, taxableAmount: 6000, sourceAmount: 6000, runFrequency: 'monthly', includeInMonthlyPayroll: true },
  ],
  payeCalculation: {
    annualRentRelief: 500000,
    monthlyPayeOverride: 615.89,
    ngnMonthlyPayeOverride: 13477.63,
  },
} as DleEmployeeDirectoryRow;

assert.equal(nayakGoalSeekApplies(nayak, '2026-09'), false);
assert.equal(nayakGoalSeekApplies(nayak, '2026-10'), true);
assert.equal(nayakGoalSeekApplies({ employeeCode: 'EX001', fullName: 'NAYAK' }, '2026-10'), true);
assert.equal(nayakGoalSeekApplies({ employeeCode: 'P0442', fullName: 'ODULATE' }, '2026-10'), false);

const september = applyNayakGoalSeek(nayak, '2026-09', GM_OPERATIONS_FALLBACK_FX);
assert.equal(september.periodSalary, 3000);
assert.equal(september.payeCalculation?.monthlyPayeOverride, 615.89);

const sample = seekNayakGoalSeekPackage(GM_OPERATIONS_FALLBACK_FX);
assert.equal(sample.grossUsd, 3817.03);
assert.equal(sample.payeUsd, 817.03);
assert.equal(sample.payeNgn, 1089099.04);
assert.equal(sample.grossNgn, 5088062.82);
assert.equal(sample.netUsd, 3000);
assert.equal(sample.linesUsd.length, 1);
assert.equal(sample.linesUsd[0]?.code, 'BASIC');
assert.equal(sample.linesUsd[0]?.amount, sample.grossUsd);
assert.equal(roundNet(sample.grossUsd, sample.payeUsd), 3000);

const evaluated = evaluateNayakGoalSeek(sample.grossUsd, GM_OPERATIONS_FALLBACK_FX);
assert.equal(evaluated.netUsd, 3000);
assert.equal(evaluated.payeUsd, sample.payeUsd);

const applied = applyNayakGoalSeek(nayak, '2026-10', GM_OPERATIONS_FALLBACK_FX);
assert.equal(applied.periodSalary, sample.grossUsd);
assert.equal(applied.basicSalary, sample.grossUsd);
assert.equal(applied.sagePayrollEarnings?.[0]?.amount, sample.grossUsd);
assert.equal(applied.payeCalculation?.monthlyPayeOverride, sample.payeUsd);
assert.equal(applied.payeCalculation?.ngnMonthlyPayeOverride, 13477.63);
assert.equal(applied.localPeriodSalary, 269552.63);
assert.equal(applied.localPayrollGroup, 'DLPC');
assert.equal(applied.hasDualCurrencyPayroll, true);
assert.equal(applied.sageLocalPayrollEarnings?.[0]?.amount, 263552.63);
assert.equal(applied.sageLocalPayrollEarnings?.[1]?.amount, 6000);
assert.equal(applied.sageLocalPayrollEarnings?.[1]?.code, 'TELEPHONE');

const at1600 = seekNayakGoalSeekPackage(1600);
assert.equal(at1600.netUsd, 3000);
assert.notEqual(at1600.grossUsd, sample.grossUsd);
assert.notEqual(at1600.payeUsd, sample.payeUsd);

const [usdRow, ngnRow] = applyNayakGoalSeekToRecords(
  [
    {
      employeeCode: 'PEX001',
      fullName: 'SUSHILKUMAR NAYAK',
      payCurrency: 'USD',
      grossPay: 3000,
      basePay: 3000,
      allowances: 0,
      paye: 616.91,
      totalDeductions: 616.91,
      netPay: 2383.09,
      employerCost: 3000,
      earningLines: [{ code: 'BASIC', name: 'Basic', amount: 3000 }],
      deductionLines: [{ code: 'PAYE', label: 'PAYE', amount: 616.91 }],
      companionNgnPay: { grossPay: 269552.63, netPay: 256075 },
    },
    {
      employeeCode: 'PEX001',
      fullName: 'SUSHILKUMAR NAYAK',
      payCurrency: 'NGN',
      grossPay: 269552.63,
      basePay: 263552.63,
      allowances: 6000,
      paye: 13477.63,
      totalDeductions: 13477.63,
      netPay: 256075,
      employerCost: 269552.63,
      earningLines: [{ code: 'BASIC', name: 'BASIC SALARY', amount: 263552.63 }],
    },
  ],
  '2026-10',
  GM_OPERATIONS_FALLBACK_FX,
);
assert.equal(usdRow?.netPay, 3000);
assert.equal(usdRow?.grossPay, sample.grossUsd);
assert.equal(usdRow?.paye, sample.payeUsd);
assert.equal(usdRow?.companionNgnPay?.grossPay, 269552.63);
assert.equal(usdRow?.companionNgnPay?.netPay, 256075);
assert.equal(ngnRow?.grossPay, 269552.63);
assert.equal(ngnRow?.netPay, 256075);
assert.equal(ngnRow?.paye, 13477.63);

const beforeOctober = applyNayakGoalSeekToRecords(
  [{
    employeeCode: 'PEX001',
    fullName: 'SUSHILKUMAR NAYAK',
    payCurrency: 'USD',
    grossPay: 3000,
    basePay: 3000,
    allowances: 0,
    paye: 616.91,
    totalDeductions: 616.91,
    netPay: 2383.09,
    employerCost: 3000,
    earningLines: [],
  }],
  '2026-09',
  GM_OPERATIONS_FALLBACK_FX,
);
assert.equal(beforeOctober[0]?.netPay, 2383.09);
assert.equal(beforeOctober[0]?.grossPay, 3000);

function roundNet(gross: number, paye: number) {
  return Math.round((gross - paye) * 100) / 100;
}

console.log('nayak-goal-seek.test.ts ok', {
  fx: GM_OPERATIONS_FALLBACK_FX,
  grossUsd: sample.grossUsd,
  payeUsd: sample.payeUsd,
  payeNgn: sample.payeNgn,
  grossNgn: sample.grossNgn,
  netUsd: sample.netUsd,
});
