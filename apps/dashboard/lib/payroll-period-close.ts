import { payrollScheduleScopeLabel, normalizePayrollCompany, type PayrollCompany } from '@/lib/payroll-schedule-scope';

export type PayrollPeriodCloseRun = {
  id?: string | null;
  pack?: string | null;
  company?: string | null;
  status?: string | null;
  releasedAt?: string | null;
  submittedAt?: string | null;
  financeReviewedAt?: string | null;
  payslipsGeneratedAt?: string | null;
  bankScheduleGeneratedAt?: string | null;
  statutorySchedulesGeneratedAt?: string | null;
  employeeCount?: number | null;
};

type ClosePack = 'salaried' | 'daily-rate';

const WAGES_CLOSE_STATUSES = new Set([
  'Finance Approved',
  'CFO Approved',
  'Approved',
  'Released',
  'Locked',
  'Published',
  'Posted',
  'Closed',
]);

const packOf = (run: PayrollPeriodCloseRun): ClosePack => {
  const raw = String(run.pack || '').trim().toLowerCase();
  if (raw === 'daily-rate' || raw === 'dailyrate' || raw === 'daily_rate' || raw === 'contract-daily-rate') return 'daily-rate';
  const id = String(run.id || '').toLowerCase();
  if (id.includes('-daily-rate') || id.includes('dailyrate')) return 'daily-rate';
  return 'salaried';
};

const companyOf = (run: PayrollPeriodCloseRun): PayrollCompany => {
  const fromField = normalizePayrollCompany(run.company);
  if (fromField) return fromField;
  const id = String(run.id || '').toUpperCase();
  if (id.endsWith('-DLPC') || id.includes('-DAILY-RATE-DLPC') || id.includes('-SALARIED-DLPC')) return 'DLPC';
  return 'DLE';
};

/** Journal posting is optional until GL mapping is ready — salaried close on payslips, bank, and statutory outputs. */
export const payrollRunReadyToClose = (
  run: Pick<PayrollPeriodCloseRun, 'status' | 'releasedAt' | 'payslipsGeneratedAt' | 'bankScheduleGeneratedAt' | 'statutorySchedulesGeneratedAt'>,
) => {
  const released = Boolean(run.releasedAt) || ['Released', 'Locked', 'Published', 'Posted'].includes(String(run.status || ''));
  return released
    && Boolean(run.payslipsGeneratedAt)
    && Boolean(run.bankScheduleGeneratedAt)
    && Boolean(run.statutorySchedulesGeneratedAt)
    && run.status !== 'Closed';
};

/** A pack that was never submitted/released does not block period close (e.g. Daily Rate computed but not processed). */
export const payrollRunIdleForPeriodClose = (
  run: Pick<PayrollPeriodCloseRun, 'status' | 'releasedAt' | 'submittedAt' | 'payslipsGeneratedAt' | 'bankScheduleGeneratedAt' | 'statutorySchedulesGeneratedAt'>,
) => {
  const status = String(run.status || '');
  if (status === 'Closed') return true;
  if (run.releasedAt || run.submittedAt || run.payslipsGeneratedAt || run.bankScheduleGeneratedAt || run.statutorySchedulesGeneratedAt) return false;
  if (['Submitted', 'Under Review', 'HR Approved', 'Finance Approved', 'CFO Approved', 'Approved', 'Released', 'Published', 'Posted', 'Locked', 'Revision Requested'].includes(status)) {
    return false;
  }
  return true;
};

/** Wages (daily-rate) are statutory-exempt and are paid from the day-rate schedule, not ESS payslips. */
export const payrollWagesReadyToClose = (run: PayrollPeriodCloseRun) => {
  const status = String(run.status || '');
  if (status === 'Closed') return true;
  if (['Rejected', 'Revision Requested', 'Cancelled'].includes(status)) return false;
  return Boolean(run.financeReviewedAt) || WAGES_CLOSE_STATUSES.has(status);
};

export const payrollRunSatisfiesPeriodClose = (run: PayrollPeriodCloseRun) => {
  if (String(run.status || '') === 'Closed' || payrollRunIdleForPeriodClose(run)) return true;
  if (packOf(run) === 'daily-rate') return payrollWagesReadyToClose(run);
  return payrollRunReadyToClose(run);
};

export const payrollRunCloseBlockerLabel = (run: PayrollPeriodCloseRun) => {
  const name = payrollScheduleScopeLabel(packOf(run), companyOf(run));
  return `${name} (${run.status || 'Not started'})`;
};

export const payrollPeriodCloseError = (period: string, blockers: PayrollPeriodCloseRun[]) => {
  const labels = blockers.map(payrollRunCloseBlockerLabel).join(', ');
  const wagesOnly = blockers.length > 0 && blockers.every((item) => packOf(item) === 'daily-rate');
  if (wagesOnly) {
    return `Cannot close ${period}. Daily-rate wages need Finance approval before close (${labels}). Payslips and statutory schedules are not required for wages. Journal posting can follow later.`;
  }
  return `Cannot close ${period}. Finish payslips, bank schedule, and statutory schedules for ${labels}. Journal posting can follow later.`;
};
