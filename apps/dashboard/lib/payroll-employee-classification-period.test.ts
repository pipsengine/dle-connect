import { employeeStartsAfterPayrollPeriod, payrollPeriodEndIso } from './payroll-employee-classification';

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

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

console.log('payroll-employee-classification-period.test.ts: ok');
