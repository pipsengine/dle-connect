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

const previousRecords = [
  {
    employeeId: 'P001',
    employeeCode: 'P001',
    fullName: 'Alice Example',
    grossPay: 100000,
    totalDeductions: 20000,
    deductions: 20000,
    netPay: 80000,
    employerCost: 110000,
    basePay: 70000,
    allowances: 30000,
    paye: 12000,
    pensionEmployee: 5000,
    pension: 5000,
    pensionEmployer: 7000,
    statutoryEmployer: 3000,
    loanRecovery: 2000,
    otherDeductions: 1000,
  },
  {
    employeeId: 'P002',
    employeeCode: 'P002',
    fullName: 'Bob Exit',
    grossPay: 50000,
    totalDeductions: 5000,
    deductions: 5000,
    netPay: 45000,
    employerCost: 54000,
    basePay: 40000,
    allowances: 10000,
    paye: 3000,
    pensionEmployee: 1000,
    pension: 1000,
    pensionEmployer: 2000,
    statutoryEmployer: 1000,
    loanRecovery: 500,
    otherDeductions: 500,
  },
] as any[];

const currentRecords = [
  {
    employeeId: 'P001',
    employeeCode: 'P001',
    fullName: 'Alice Example',
    grossPay: 120000,
    totalDeductions: 25000,
    deductions: 25000,
    netPay: 95000,
    employerCost: 132000,
    basePay: 80000,
    allowances: 40000,
    paye: 15000,
    pensionEmployee: 6000,
    pension: 6000,
    pensionEmployer: 8000,
    statutoryEmployer: 4000,
    loanRecovery: 2000,
    otherDeductions: 2000,
  },
  {
    employeeId: 'P003',
    employeeCode: 'P003',
    fullName: 'Cara Join',
    grossPay: 60000,
    totalDeductions: 6000,
    deductions: 6000,
    netPay: 54000,
    employerCost: 65000,
    basePay: 45000,
    allowances: 15000,
    paye: 3500,
    pensionEmployee: 1500,
    pension: 1500,
    pensionEmployer: 2500,
    statutoryEmployer: 1000,
    loanRecovery: 500,
    otherDeductions: 500,
  },
] as any[];

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
  currentRecords,
  previousRecords,
});

assert(mom.available, 'prior month with figures is available');
assert(mom.previousPeriod === '2026-07', 'previous calendar month');
const employer = payrollMomMetric(mom, 'employerCost');
assert(employer?.direction === 'up', 'employer cost went up');
assert(employer?.variance === 4238344, 'employer cost naira variance');
assert(payrollMomMetric(mom, 'employees')?.variance === 1, 'headcount +1');
assert(payrollMomMetric(mom, 'grossPay')?.detail?.buckets.some((bucket) => bucket.id === 'headcount'), 'gross pay detail includes headcount movement');
assert(payrollMomMetric(mom, 'employees')?.detail?.contributors.some((item) => item.employeeCode === 'P003' && item.reason.includes('New in current period')), 'employee detail lists joiners');

const moneyMetricKeys = ['grossPay', 'deductions', 'netPay', 'employerCost'] as const;
for (const key of moneyMetricKeys) {
  const metric = payrollMomMetric(mom, key);
  assert(metric?.detail, `${key} has detail`);
  const driverTotal = Math.round((metric!.detail!.buckets.reduce((sum, bucket) => sum + bucket.value, 0)) * 100) / 100;
  assert(driverTotal === metric!.variance, `${key} drivers must reconcile to summary variance`);
}

const mismatched = buildPayrollMonthOverMonth({
  currentPeriod: '2026-08',
  currentPeriodLabel: 'August 2026',
  current: {
    period: '2026-08',
    periodLabel: 'August 2026',
    employees: 2,
    grossPay: 200000,
    deductions: 40000,
    netPay: 160000,
    employerCost: 210000,
  },
  previous: {
    period: '2026-07',
    periodLabel: 'July 2026',
    employees: 2,
    grossPay: 150000,
    deductions: 25000,
    netPay: 125000,
    employerCost: 160000,
  },
  currentRecords,
  previousRecords,
});
const mismatchedNet = payrollMomMetric(mismatched, 'netPay');
assert(mismatchedNet?.detail?.buckets.some((bucket) => bucket.id === 'residual'), 'schedule vs employee-line gap becomes residual');
const mismatchedDriverTotal = Math.round((mismatchedNet!.detail!.buckets.reduce((sum, bucket) => sum + bucket.value, 0)) * 100) / 100;
assert(mismatchedDriverTotal === mismatchedNet!.variance, 'mismatched schedule still reconciles via residual');

const duplicateCurrent = [
  currentRecords[0],
  { ...currentRecords[0], grossPay: 5000, netPay: 4000, totalDeductions: 1000, deductions: 1000 },
  currentRecords[1],
] as any[];
const deduped = buildPayrollMonthOverMonth({
  currentPeriod: '2026-08',
  current: {
    period: '2026-08',
    periodLabel: 'August 2026',
    employees: 2,
    grossPay: 185000,
    deductions: 32000,
    netPay: 153000,
    employerCost: 197000,
  },
  previous: {
    period: '2026-07',
    periodLabel: 'July 2026',
    employees: 2,
    grossPay: 150000,
    deductions: 25000,
    netPay: 125000,
    employerCost: 164000,
  },
  currentRecords: duplicateCurrent,
  previousRecords,
});
const dedupedNet = payrollMomMetric(deduped, 'netPay');
const alice = dedupedNet?.detail?.contributors.find((item) => item.employeeCode === 'P001');
assert(alice?.current === 99000, 'duplicate employee rows are aggregated before ranking contributors');
assert(Math.round((dedupedNet!.detail!.buckets.reduce((sum, bucket) => sum + bucket.value, 0)) * 100) / 100 === dedupedNet!.variance, 'deduped drivers still reconcile');

const empty = buildPayrollMonthOverMonth({
  currentPeriod: '2026-08',
  current: mom.current,
  previous: null,
});
assert(!empty.available, 'missing prior month is not available');
assert(!payrollMomMetric(empty, 'employerCost'), 'no metric chip when prior month is missing');

console.log('payroll-month-over-month.test.ts OK');

