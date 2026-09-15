/**
 * Period close: salaried packs need payslips/bank/statutory; daily-rate wages close after Finance Approved.
 * Run: npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/lib/payroll-period-close.test.ts
 */
import assert from 'node:assert/strict';
import {
  payrollPeriodCloseError,
  payrollRunCloseBlockerLabel,
  payrollRunSatisfiesPeriodClose,
  type PayrollPeriodCloseRun,
} from './payroll-period-close';

const run = (overrides: PayrollPeriodCloseRun): PayrollPeriodCloseRun => overrides;

const wagesFinanceApproved = run({
  id: 'payroll-2026-08-daily-rate-DLE',
  pack: 'daily-rate',
  company: 'DLE',
  status: 'Finance Approved',
  submittedAt: '2026-08-20T10:00:00.000Z',
  financeReviewedAt: '2026-08-21T10:00:00.000Z',
});

const salariesReady = run({
  id: 'payroll-2026-08-salaried-DLE',
  pack: 'salaried',
  company: 'DLE',
  status: 'Published',
  releasedAt: '2026-08-22T10:00:00.000Z',
  submittedAt: '2026-08-20T10:00:00.000Z',
  payslipsGeneratedAt: '2026-08-22T11:00:00.000Z',
  bankScheduleGeneratedAt: '2026-08-22T11:05:00.000Z',
  statutorySchedulesGeneratedAt: '2026-08-22T11:10:00.000Z',
});

assert.equal(payrollRunSatisfiesPeriodClose(wagesFinanceApproved), true, 'Finance-approved wages close without payslips or statutory schedules');
assert.equal(
  payrollRunSatisfiesPeriodClose(run({
    id: 'payroll-2026-08-daily-rate-DLPC',
    pack: 'daily-rate',
    company: 'DLPC',
    status: 'Finance Approved',
    submittedAt: '2026-08-20T10:00:00.000Z',
  })),
  true,
  'DLPC wages at Finance Approved close even if financeReviewedAt is missing',
);

assert.equal(
  payrollRunSatisfiesPeriodClose(run({
    id: 'payroll-2026-08-daily-rate-DLE',
    pack: 'daily-rate',
    status: 'Submitted',
    submittedAt: '2026-08-20T10:00:00.000Z',
  })),
  false,
  'Submitted wages still block close until Finance Approved',
);

assert.equal(
  payrollRunSatisfiesPeriodClose(run({
    id: 'payroll-2026-08-daily-rate-DLE',
    pack: 'daily-rate',
    status: 'HR Approved',
    submittedAt: '2026-08-20T10:00:00.000Z',
  })),
  false,
  'HR-approved wages still wait for Finance',
);

assert.equal(
  payrollRunSatisfiesPeriodClose(run({
    id: 'payroll-2026-08-daily-rate-DLE',
    pack: 'daily-rate',
    status: 'Calculated',
  })),
  true,
  'Idle calculated wages do not block period close',
);

assert.equal(payrollRunSatisfiesPeriodClose(salariesReady), true, 'Salaried with outputs is ready to close');
assert.equal(
  payrollRunSatisfiesPeriodClose(run({
    id: 'payroll-2026-08-salaried-DLE',
    pack: 'salaried',
    status: 'Released',
    releasedAt: '2026-08-22T10:00:00.000Z',
    submittedAt: '2026-08-20T10:00:00.000Z',
  })),
  false,
  'Released salaried still needs payslips, bank, and statutory',
);

assert.equal(
  payrollRunCloseBlockerLabel(wagesFinanceApproved),
  'DLE Day-rate (Finance Approved)',
  'Close errors name the day-rate schedule, not a generic Wages label',
);

const augustBlockers = [wagesFinanceApproved, salariesReady].filter((item) => !payrollRunSatisfiesPeriodClose(item));
assert.deepEqual(augustBlockers, [], 'August close proceeds when salaries have outputs and wages are Finance Approved');

assert.match(
  payrollPeriodCloseError('2026-08', [run({
    id: 'payroll-2026-08-daily-rate-DLE',
    pack: 'daily-rate',
    status: 'Submitted',
    submittedAt: '2026-08-20T10:00:00.000Z',
  })]),
  /DLE Day-rate \(Submitted\)/,
);

console.log('payroll-period-close tests passed');
