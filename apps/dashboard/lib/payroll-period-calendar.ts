export const payrollPeriodLabel = (period: string) => {
  const [year, month] = period.split('-').map(Number);
  return new Date(Date.UTC(year || new Date().getUTCFullYear(), (month || 1) - 1, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
};

/** Calendar YYYY-MM for the local date (report default, not the env-locked ACTIVE_PAYROLL_PERIOD). */
export const calendarPayrollPeriod = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

export const listCalendarPayrollPeriodOptions = (months = 12, from = new Date()) => {
  const options: Array<{ value: string; label: string }> = [];
  const seen = new Set<string>();
  for (let index = 0; index < months; index += 1) {
    const cursor = new Date(from.getFullYear(), from.getMonth() - index, 1);
    const value = calendarPayrollPeriod(cursor);
    if (seen.has(value)) continue;
    seen.add(value);
    options.push({ value, label: payrollPeriodLabel(value) });
  }
  return options;
};
