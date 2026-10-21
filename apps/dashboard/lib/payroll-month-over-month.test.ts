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
const aliceGross = payrollMomMetric(mom, 'grossPay')?.detail?.contributors.find((item) => item.employeeCode === 'P001');
assert(aliceGross?.reason.includes('Basic salary increased by') && aliceGross.reason.includes('10,000.00'), 'retained gross names the basic salary movement');
assert(aliceGross?.reason.includes('Allowances increased by'), 'retained gross names allowance movement when earning lines are absent');
assert(!aliceGross?.reason.includes('Allowances changed'), 'gross reason is the pay element, not the category');
const aliceDeductions = payrollMomMetric(mom, 'deductions')?.detail?.contributors.find((item) => item.employeeCode === 'P001');
assert(aliceDeductions?.reason.includes('PAYE increased by') && aliceDeductions.reason.includes('3,000.00'), 'deduction reason names PAYE');
assert(payrollMomMetric(mom, 'employees')?.detail?.contributors.some((item) => item.employeeCode === 'P003' && item.reason.includes('New in current period') && item.reason.includes('Basic salary')), 'employee detail lists joiners with their main pay element');
assert(payrollMomMetric(mom, 'netPay')?.detail?.contributors.some((item) => item.staffPack === 'permanent'), 'permanent staff appear in net pay contributors');
assert((payrollMomMetric(mom, 'netPay')?.detail?.contributorTotal || 0) >= 2, 'all employees with net movement are included');

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

const manyPrevious = Array.from({ length: 14 }, (_, index) => ({
  employeeId: `L${1000 + index}`,
  employeeCode: `L${1000 + index}`,
  fullName: `Lumpsum ${index}`,
  employmentType: 'Lumpsum',
  grossPay: 1_000_000 - index * 10_000,
  totalDeductions: 100_000,
  deductions: 100_000,
  netPay: 900_000 - index * 10_000,
  employerCost: 1_050_000,
  basePay: 1_000_000,
  allowances: 0,
  paye: 80_000,
  pensionEmployee: 20_000,
  pension: 20_000,
  pensionEmployer: 40_000,
  statutoryEmployer: 10_000,
  loanRecovery: 0,
  otherDeductions: 0,
}));
const manyCurrent = [
  ...manyPrevious.map((row, index) => ({
    ...row,
    netPay: row.netPay - (200_000 - index * 1_000),
    grossPay: row.grossPay - (200_000 - index * 1_000),
  })),
  {
    employeeId: 'P0500',
    employeeCode: 'P0500',
    fullName: 'Permanent Small Move',
    employmentType: 'Permanent',
    grossPay: 500_000,
    totalDeductions: 80_000,
    deductions: 80_000,
    netPay: 420_000,
    employerCost: 540_000,
    basePay: 400_000,
    allowances: 100_000,
    paye: 50_000,
    pensionEmployee: 20_000,
    pension: 20_000,
    pensionEmployer: 30_000,
    statutoryEmployer: 10_000,
    loanRecovery: 0,
    otherDeductions: 10_000,
  },
];
const manyPreviousWithPermanent = [
  ...manyPrevious,
  {
    employeeId: 'P0500',
    employeeCode: 'P0500',
    fullName: 'Permanent Small Move',
    employmentType: 'Permanent',
    grossPay: 495_000,
    totalDeductions: 80_000,
    deductions: 80_000,
    netPay: 415_000,
    employerCost: 535_000,
    basePay: 395_000,
    allowances: 100_000,
    paye: 50_000,
    pensionEmployee: 20_000,
    pension: 20_000,
    pensionEmployer: 30_000,
    statutoryEmployer: 10_000,
    loanRecovery: 0,
    otherDeductions: 10_000,
  },
];
const manyMom = buildPayrollMonthOverMonth({
  currentPeriod: '2026-08',
  currentPeriodLabel: 'August 2026',
  current: {
    period: '2026-08',
    periodLabel: 'August 2026',
    employees: 15,
    grossPay: 1,
    deductions: 1,
    netPay: 1,
    employerCost: 1,
  },
  previous: {
    period: '2026-07',
    periodLabel: 'July 2026',
    employees: 15,
    grossPay: 2,
    deductions: 2,
    netPay: 2,
    employerCost: 2,
  },
  currentRecords: manyCurrent as any[],
  previousRecords: manyPreviousWithPermanent as any[],
});
const manyNet = payrollMomMetric(manyMom, 'netPay');
assert((manyNet?.detail?.contributors.length || 0) === 15, 'all 15 employees with net movement are listed (not top-12 only)');
assert(manyNet?.detail?.contributors.some((item) => item.employeeCode === 'P0500' && item.staffPack === 'permanent'), 'permanent staff with smaller variance still appear alongside lumpsum');
assert(manyNet?.detail?.contributors.some((item) => item.staffPack === 'contract-lumpsum'), 'lumpsum staff appear in the same list');
assert((manyNet?.detail?.contributorTotal || 0) === 15, 'contributorTotal matches full list');

const namedPrevious = [
  {
    employeeId: 'P001',
    employeeCode: 'P001',
    fullName: 'Ada Retained',
    payCurrency: 'NGN',
    grossPay: 130000,
    totalDeductions: 15000,
    deductions: 15000,
    netPay: 115000,
    employerCost: 140000,
    basePay: 80000,
    allowances: 50000,
    paye: 10000,
    pensionEmployee: 5000,
    pension: 5000,
    pensionEmployer: 8000,
    statutoryEmployer: 2000,
    loanRecovery: 0,
    otherDeductions: 0,
    earningLines: [
      { code: 'BASIC', name: 'BASIC SALARY', amount: 80000 },
      { code: 'TRANSP', name: 'TRANSPORT ALLOWANCE', amount: 40000 },
      { code: 'SITE_ALLOW', name: 'SITE ALLOWANCE', amount: 10000 },
    ],
    deductionLines: [
      { code: 'PAYE', label: 'PAYE', amount: 10000 },
      { code: 'PENSION_EE', label: 'Pension', amount: 5000 },
    ],
  },
  {
    employeeId: 'P002',
    employeeCode: 'P002',
    fullName: 'Ben Left',
    payCurrency: 'NGN',
    grossPay: 50000,
    totalDeductions: 5000,
    deductions: 5000,
    netPay: 45000,
    employerCost: 50000,
    basePay: 50000,
    allowances: 0,
    paye: 5000,
    pensionEmployee: 0,
    pension: 0,
    pensionEmployer: 0,
    statutoryEmployer: 0,
    loanRecovery: 0,
    otherDeductions: 0,
    earningLines: [{ code: 'LUMPSUMTAX', name: 'LUMPSUM ALLOWANCE', amount: 50000 }],
    deductionLines: [{ code: 'PAYE', label: 'PAYE', amount: 5000 }],
  },
] as any[];

const namedCurrent = [
  {
    employeeId: 'P001',
    employeeCode: 'P001',
    fullName: 'Ada Retained',
    payCurrency: 'NGN',
    grossPay: 97000,
    totalDeductions: 23000,
    deductions: 23000,
    netPay: 74000,
    employerCost: 108000,
    basePay: 80000,
    allowances: 17000,
    paye: 18000,
    pensionEmployee: 5000,
    pension: 5000,
    pensionEmployer: 9000,
    statutoryEmployer: 2000,
    loanRecovery: 0,
    otherDeductions: 0,
    earningLines: [
      { code: 'BASIC', name: 'BASIC SALARY', amount: 80000 },
      { code: 'MGT1COLA_TRANSP', name: 'TRANSPORT ALLOWANCE', amount: 5000 },
      { code: 'SITE_ALLOW', name: 'SITE ALLOWANCE', amount: 12000 },
    ],
    deductionLines: [
      { code: 'PAYE', label: 'PAYE', amount: 18000 },
      { code: 'PENSION_EE', label: 'Pension', amount: 5000 },
    ],
  },
  {
    employeeId: 'P003',
    employeeCode: 'P003',
    fullName: 'Chioma Joined',
    payCurrency: 'NGN',
    grossPay: 60000,
    totalDeductions: 6000,
    deductions: 6000,
    netPay: 54000,
    employerCost: 60000,
    basePay: 60000,
    allowances: 0,
    paye: 6000,
    pensionEmployee: 0,
    pension: 0,
    pensionEmployer: 0,
    statutoryEmployer: 0,
    loanRecovery: 0,
    otherDeductions: 0,
    earningLines: [{ code: 'BASIC', name: 'BASIC SALARY', amount: 60000 }],
    deductionLines: [{ code: 'PAYE', label: 'PAYE', amount: 6000 }],
  },
] as any[];

const namedMom = buildPayrollMonthOverMonth({
  currentPeriod: '2026-09',
  currentPeriodLabel: 'September 2026',
  current: {
    period: '2026-09',
    periodLabel: 'September 2026',
    employees: 2,
    grossPay: 157000,
    deductions: 29000,
    netPay: 128000,
    employerCost: 168000,
  },
  previous: {
    period: '2026-08',
    periodLabel: 'August 2026',
    employees: 2,
    grossPay: 180000,
    deductions: 20000,
    netPay: 160000,
    employerCost: 190000,
  },
  currentRecords: namedCurrent,
  previousRecords: namedPrevious,
});

const namedGross = payrollMomMetric(namedMom, 'grossPay');
const adaGross = namedGross?.detail?.contributors.find((item) => item.employeeCode === 'P001');
assert(adaGross?.reason === 'Transport allowance decreased by ₦\u00A035,000.00', `main gross reason is the transport line, got ${adaGross?.reason}`);
assert(namedGross?.detail?.buckets.find((bucket) => bucket.label === 'Transport allowance on retained staff')?.value === -35000, 'transport driver is the retained transport movement');
assert(namedGross?.detail?.buckets.find((bucket) => bucket.label === 'Site allowance on retained staff')?.value === 2000, 'site allowance is its own driver');
assert(!namedGross?.detail?.buckets.some((bucket) => /allowance changes on retained staff/i.test(bucket.label)), 'drivers are named lines, not the allowance category');
const benGross = namedGross?.detail?.contributors.find((item) => item.employeeCode === 'P002');
assert(benGross?.reason.includes('Present in previous period only') && benGross.reason.includes('Lumpsum allowance'), 'a leaver reason names the pay element that dropped out');
const chiomaGross = namedGross?.detail?.contributors.find((item) => item.employeeCode === 'P003');
assert(chiomaGross?.reason.includes('New in current period') && chiomaGross.reason.includes('Basic salary'), 'a joiner reason names the pay element that came in');

const adaDeductions = payrollMomMetric(namedMom, 'deductions')?.detail?.contributors.find((item) => item.employeeCode === 'P001');
assert(adaDeductions?.reason === 'PAYE increased by ₦\u00A08,000.00', `main deduction reason is PAYE, got ${adaDeductions?.reason}`);
const adaNet = payrollMomMetric(namedMom, 'netPay')?.detail?.contributors.find((item) => item.employeeCode === 'P001');
assert(adaNet?.reason.includes('Transport allowance decreased by') && adaNet.reason.includes('PAYE increased by'), `net pay follows through to the earning and deduction lines, got ${adaNet?.reason}`);
const adaEmployer = payrollMomMetric(namedMom, 'employerCost')?.detail?.contributors.find((item) => item.employeeCode === 'P001');
assert(adaEmployer?.reason.includes('Transport allowance decreased by'), `employer cost follows through to the earning line, got ${adaEmployer?.reason}`);
assert(payrollMomMetric(namedMom, 'grossPay')?.detail?.summary.includes('Transport allowance on retained staff'), 'summary names the main driver');

for (const key of moneyMetricKeys) {
  const metric = payrollMomMetric(namedMom, key);
  const driverTotal = Math.round((metric!.detail!.buckets.reduce((sum, bucket) => sum + bucket.value, 0)) * 100) / 100;
  assert(driverTotal === metric!.variance, `${key} named-line drivers must reconcile to summary variance`);
}

const empty = buildPayrollMonthOverMonth({
  currentPeriod: '2026-08',
  current: mom.current,
  previous: null,
});
assert(!empty.available, 'missing prior month is not available');
assert(!payrollMomMetric(empty, 'employerCost'), 'no metric chip when prior month is missing');

console.log('payroll-month-over-month.test.ts OK');

