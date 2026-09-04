import assert from 'node:assert/strict';
import { computePayslipHistoryYtdTotals } from './payroll-ess-payslip-store.ts';

const history = [
  {
    period: '2025-12',
    grossPay: 500_000,
    netPay: 400_000,
    deductions: 100_000,
    pensionEmployee: 40_000,
    earnings: [{ code: 'BONUS', label: 'Bonus', amount: 50_000 }],
    deductionLines: [
      { code: 'PAYE', label: 'PAYE Tax', amount: 30_000 },
      { code: 'NHF', label: 'NHF', amount: 10_000 },
      { code: 'PENSION_EMPLOYEE', label: 'Pension', amount: 40_000 },
    ],
  },
  {
    period: '2026-01',
    grossPay: 1_000_000,
    netPay: 800_000,
    deductions: 200_000,
    pensionEmployee: 80_000,
    earnings: [
      { code: 'BASIC', label: 'Basic Salary', amount: 700_000 },
      { code: 'BONUS', label: 'Performance Bonus', amount: 100_000 },
      { code: 'LEAVE_ALLOW', label: 'Leave Allowance', amount: 200_000 },
    ],
    deductionLines: [
      { code: 'PAYE', label: 'PAYE Tax', amount: 90_000 },
      { code: 'NHF', label: 'NHF', amount: 25_000 },
      { code: 'PENSION_EMPLOYEE', label: 'Pension', amount: 80_000 },
    ],
  },
  {
    period: '2026-02',
    grossPay: 900_000,
    netPay: 720_000,
    deductions: 180_000,
    pensionEmployee: 72_000,
    earnings: [{ code: 'BASIC', label: 'Basic Salary', amount: 900_000 }],
    deductionLines: [
      { code: 'PAYE', label: 'PAYE Tax', amount: 80_000 },
      { code: 'NHF', label: 'NHF', amount: 25_000 },
      { code: 'PENSION_EMPLOYEE', label: 'Pension', amount: 72_000 },
    ],
  },
  {
    period: '2026-03',
    grossPay: 950_000,
    netPay: 760_000,
    deductions: 190_000,
    pensionEmployee: 76_000,
    earnings: [{ code: 'BASIC', label: 'Basic Salary', amount: 950_000 }],
    deductionLines: [
      { code: 'PAYE', label: 'PAYE Tax', amount: 85_000 },
      { code: 'NHF', label: 'NHF', amount: 25_000 },
      { code: 'PENSION_EMPLOYEE', label: 'Pension', amount: 76_000 },
    ],
  },
];

const jan = computePayslipHistoryYtdTotals('2026-01', history);
assert.equal(jan.grossEarnings, 1_000_000, 'Jan YTD gross is Jan only (excludes prior year)');
assert.equal(jan.taxPaid, 90_000, 'Jan YTD tax from PAYE lines');
assert.equal(jan.pensionContribution, 80_000, 'Jan YTD pension');
assert.equal(jan.nhf, 25_000, 'Jan YTD NHF');
assert.equal(jan.bonuses, 100_000, 'Jan YTD bonuses');
assert.equal(jan.leaveAllowance, 200_000, 'Jan YTD leave allowance');
assert.equal(jan.deductions, 200_000, 'Jan YTD deductions');
assert.equal(jan.netEarnings, 800_000, 'Jan YTD net');

const mar = computePayslipHistoryYtdTotals('2026-03', history);
assert.equal(mar.grossEarnings, 2_850_000, 'Mar YTD gross sums Jan–Mar');
assert.equal(mar.taxPaid, 255_000, 'Mar YTD tax sums Jan–Mar PAYE');
assert.equal(mar.pensionContribution, 228_000, 'Mar YTD pension sums Jan–Mar');
assert.equal(mar.nhf, 75_000, 'Mar YTD NHF sums Jan–Mar');
assert.equal(mar.bonuses, 100_000, 'Mar YTD bonuses only from months with bonus');
assert.equal(mar.leaveAllowance, 200_000, 'Mar YTD leave allowance only from months paid');
assert.equal(mar.deductions, 570_000, 'Mar YTD deductions');
assert.equal(mar.netEarnings, 2_280_000, 'Mar YTD net');

const empty = computePayslipHistoryYtdTotals('bad-period', history);
assert.equal(empty.grossEarnings, 0, 'Invalid period returns empty YTD');

console.log('payroll-ess-payslip-ytd.test.ts: ok');
