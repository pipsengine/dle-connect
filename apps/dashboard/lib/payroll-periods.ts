export const ACTIVE_PAYROLL_PERIOD = process.env.HRIS_ACTIVE_PAYROLL_PERIOD || '2026-06';
export const NEXT_PAYROLL_PERIOD = process.env.HRIS_NEXT_PAYROLL_PERIOD || '2026-07';

/** Synchronous fallback — prefer resolveActivePayrollPeriod() in API routes. */
export const activePayrollPeriod = () => process.env.HRIS_ACTIVE_PAYROLL_PERIOD || ACTIVE_PAYROLL_PERIOD;

export const resolveActivePayrollPeriod = async () => {
  try {
    const { getActivePayrollPeriod } = await import('@/lib/payroll-period-store');
    return await getActivePayrollPeriod();
  } catch {
    return activePayrollPeriod();
  }
};

export const nextPayrollPeriod = (period: string) => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(period || '').trim());
  if (!match) return '';
  let year = Number(match[1]);
  let month = Number(match[2]) + 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
};

/** When the stored active month is already Closed, Process Payroll should move to the next calendar month. */
export const successorPeriodIfActiveClosed = (
  activePeriod: string,
  periods: Array<{ period: string; status: string }>,
) => {
  const active = periods.find((item) => item.period === activePeriod);
  if (!active || active.status !== 'Closed') return '';
  return nextPayrollPeriod(active.period);
};

export const payrollPeriodLabel = (period: string) => {
  const [year, month] = period.split('-').map(Number);
  return new Date(Date.UTC(year || new Date().getUTCFullYear(), (month || 1) - 1, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
};
