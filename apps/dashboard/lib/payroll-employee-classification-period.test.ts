import { employeeStartsAfterPayrollPeriod, joinMonthSalaryFactor, payrollPeriodEndIso, payrollPeriodStartIso } from './payroll-employee-classification';

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

assert(payrollPeriodStartIso('2026-10') === '2026-10-01', 'October starts on the 1st');
assert(payrollPeriodEndIso('2026-09') === '2026-09-30', 'September ends on the 30th');
assert(payrollPeriodEndIso('per-2026-02') === '2026-02-28', 'February 2026 ends on the 28th');
assert(payrollPeriodEndIso('2024-02') === '2024-02-29', 'Leap-year February ends on the 29th');
assert(payrollPeriodEndIso('bad') === null, 'Unparseable periods do not invent an end date');

assert(
  employeeStartsAfterPayrollPeriod({ dateJoined: '2026-10-08' }, '2026-09'),
  'October joiner is outside September payroll',
);
assert(
  employeeStartsAfterPayrollPeriod({ dateJoined: '2026-10-13' }, 'per-2026-09'),
  'per- period prefix still excludes a later start date',
);
assert(
  !employeeStartsAfterPayrollPeriod({ dateJoined: '2026-09-30' }, '2026-09'),
  'Staff who join on the last day of the period stay on that run',
);
assert(
  !employeeStartsAfterPayrollPeriod({ dateJoined: '2026-09-01' }, '2026-09'),
  'Staff who join during the period stay on that run',
);
assert(
  !employeeStartsAfterPayrollPeriod({ dateJoined: '' }, '2026-09'),
  'Missing join date does not drop an employee',
);
assert(
  employeeStartsAfterPayrollPeriod({ dateJoined: '', contractStartDate: '2026-10-01' }, '2026-09'),
  'Contract start is used only when join date is blank',
);
assert(
  !employeeStartsAfterPayrollPeriod({ dateJoined: '2020-01-06', contractStartDate: '2026-10-01' }, '2026-09'),
  'An existing join date wins over a later contract start',
);

assert(
  Math.abs(joinMonthSalaryFactor({ dateJoined: '2026-10-19' }, '2026-10') - 13 / 31) < 1e-9,
  '19 October is 13 of 31 days in October',
);
assert(joinMonthSalaryFactor({ dateJoined: '2026-10-19' }, '2026-11') === 1, 'November after an October start is a full month');
assert(joinMonthSalaryFactor({ dateJoined: '2026-10-19' }, '2026-09') === 0, 'September before an October start has no days');
assert(joinMonthSalaryFactor({ dateJoined: '2026-10-01' }, '2026-10') === 1, 'A 1 October start is a full October');
assert(joinMonthSalaryFactor({ dateJoined: '' }, '2026-10') === 1, 'A missing join date does not cut pay');

console.log('payroll-employee-classification-period.test.ts: ok');
