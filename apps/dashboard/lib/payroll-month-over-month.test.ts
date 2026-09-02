import {
  buildPayrollMonthOverMonth,
  payrollMomDirection,
  payrollMomMetric,
  payrollMomPctChange,
  shortPayrollPeriodLabel,
  totalsHaveFigures,
} from './payroll-month-over-month';

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

assert(shortPayrollPeriodLabel('2026-08') === 'Aug 2026', 'August period short label');
assert(payrollMomPctChange(100, 110) === 10, '10% increase');
assert(payrollMomPctChange(0, 50) === 100, 'from zero is 100%');
assert(payrollMomDirection(0) === 'flat', 'tiny/zero variance is flat');
assert(payrollMomDirection(12) === 'up', 'positive variance is up');
assert(payrollMomDirection(-8) === 'down', 'negative variance is down');
assert(!totalsHaveFigures({
  period: '2026-07',
  periodLabel: 'July 2026',
  employees: 0,
  grossPay: 0,
  deductions: 0,
  netPay: 0,
  employerCost: 0,
}), 'all-zero prior month is not a figure');

const mom = buildPayrollMonthOverMonth({
  currentPeriod: '2026-08',
  currentPeriodLabel: 'August 2026',
  current: {
    period: '2026-08',
    periodLabel: 'August 2026',
    employees: 140,
    grossPay: 113719411,
    deductions: 21888271,
    netPay: 91831140,
    employerCost: 119238344,
  },
  previous: {
    period: '2026-07',
    periodLabel: 'July 2026',
    employees: 139,
    grossPay: 110000000,
    deductions: 20000000,
    netPay: 90000000,
    employerCost: 115000000,
  },
});

assert(mom.available, 'prior month with figures is available');
assert(mom.previousPeriod === '2026-07', 'previous calendar month');
const employer = payrollMomMetric(mom, 'employerCost');
assert(employer?.direction === 'up', 'employer cost went up');
assert(employer?.variance === 4238344, 'employer cost naira variance');
assert(payrollMomMetric(mom, 'employees')?.variance === 1, 'headcount +1');

const empty = buildPayrollMonthOverMonth({
  currentPeriod: '2026-08',
  current: mom.current,
  previous: null,
});
assert(!empty.available, 'missing prior month is not available');
assert(!payrollMomMetric(empty, 'employerCost'), 'no metric chip when prior month is missing');

console.log('payroll-month-over-month.test.ts OK');
