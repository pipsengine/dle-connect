/**
 * Next-month rollover after payroll close.
 * Run: npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/lib/payroll-period-rollover.test.ts
 */
import assert from 'node:assert/strict';
import { nextPayrollPeriod, successorPeriodIfActiveClosed } from './payroll-periods';
import { stripPendingPayrollAmounts, zeroPendingPayrollRecord } from './payroll-pending-display';
import type { PayrollCalculationRecord } from './payroll-calculation-service';

assert.equal(nextPayrollPeriod('2026-08'), '2026-09');
assert.equal(nextPayrollPeriod('2026-12'), '2027-01');
assert.equal(nextPayrollPeriod(''), '');

assert.equal(
  successorPeriodIfActiveClosed('2026-08', [{ period: '2026-08', status: 'Closed' }]),
  '2026-09',
  'Closed August advances to September',
);
assert.equal(
  successorPeriodIfActiveClosed('2026-08', [{ period: '2026-08', status: 'Open' }]),
  '',
  'Open August does not advance',
);
assert.equal(
  successorPeriodIfActiveClosed('2026-09', [
    { period: '2026-08', status: 'Closed' },
    { period: '2026-09', status: 'Open' },
  ]),
  '',
  'Already-open September stays put',
);

const record = {
  employeeId: 'P0146',
  fullName: 'CHRISTIAN OGBAISI',
  department: 'CORPORATE OFFICE',
  grossPay: 8146000,
  netPay: 6092667,
  totalDeductions: 2053333,
  deductions: 2053333,
  employerCost: 8146000,
  basePay: 5000000,
  allowances: 3146000,
  companionNgnPay: { grossPay: 100, totalDeductions: 10, netPay: 90, employerCost: 100, shareLabel: '40%' },
  earningLines: [{ code: 'BASIC', amount: 5000000 }],
  deductionLines: [{ code: 'PAYE', label: 'PAYE', amount: 1000 }],
  annualBenefitLines: [],
} as unknown as PayrollCalculationRecord;

const zeroed = zeroPendingPayrollRecord(record);
assert.equal(zeroed.grossPay, 0);
assert.equal(zeroed.netPay, 0);
assert.equal(zeroed.totalDeductions, 0);
assert.equal(zeroed.companionNgnPay?.grossPay, 0);
assert.equal(zeroed.fullName, 'CHRISTIAN OGBAISI');
assert.equal(zeroed.department, 'CORPORATE OFFICE');
assert.equal((zeroed.earningLines[0] as { amount?: number }).amount, 0);

const stripped = stripPendingPayrollAmounts({
  records: [record],
  summary: {
    employees: 140,
    grossPay: 121739739,
    netPay: 97770663,
    deductions: 23960076,
    totalDeductions: 23960076,
    employerCost: 121739739,
    scheduleGrossPay: 121739739,
    scheduleNetPay: 97770663,
    scheduleEmployees: 140,
  },
  breakdowns: {
    byPayrollGroup: [{ name: 'DLE', grossPay: 10, netPay: 9 }],
    byDepartment: [{ name: 'CORP', grossPay: 10, netPay: 9 }],
    byEmploymentType: [{ name: 'Permanent', grossPay: 10, netPay: 9 }],
    byComponent: [{ name: 'BASIC', amount: 10 }],
  },
});
assert.equal(stripped.summary.grossPay, 0);
assert.equal(stripped.summary.scheduleGrossPay, 0);
assert.equal(stripped.summary.scheduleEmployees, 140);
assert.equal(stripped.records[0].grossPay, 0);
assert.equal(stripped.breakdowns.byPayrollGroup[0].grossPay, 0);

console.log('payroll-period-rollover tests passed');
