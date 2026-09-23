/**
 * From September 2026, live payroll amounts come from employee profiles
 * (Permanent / Lumpsum / NYSC / IT) or approved timesheets (day-rate).
 * Excel salary / day-rate schedules must not overlay that compute, and a
 * payroll re-run must not write those workbooks back onto earning lines.
 */
export const PAYROLL_PROFILE_TIMESHEET_SOURCE_FROM = '2026-09';

export const payrollPeriodSortKey = (period?: string | null) => {
  const normalized = String(period || '').replace(/^per-/i, '').replace(/\//g, '-').trim().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(normalized)) return 0;
  const [year, month] = normalized.split('-').map(Number);
  return year * 100 + month;
};

/** True for 2026-08 and earlier: an applied Excel schedule may still replace live amounts. */
export const payrollExcelAmountOverlayApplies = (period?: string | null) => {
  const key = payrollPeriodSortKey(period);
  if (!key) return false;
  return key < payrollPeriodSortKey(PAYROLL_PROFILE_TIMESHEET_SOURCE_FROM);
};

export const isPayrollProfileTimesheetSourcePeriod = (period?: string | null) =>
  payrollPeriodSortKey(period) >= payrollPeriodSortKey(PAYROLL_PROFILE_TIMESHEET_SOURCE_FROM);

/** Day-rate from the employee profile only — never invent a rate from monthly salary. */
export const explicitPayrollDayRate = (employee: {
  ratePerDay?: number | null;
  ratePerHour?: number | null;
  hoursPerDay?: number | null;
}) => {
  const hoursPerDay = Number(employee.hoursPerDay || 8) || 8;
  const explicitDayRate = Number(employee.ratePerDay || 0);
  const explicitHourRate = Number(employee.ratePerHour || 0);
  const ratePerDay = explicitDayRate > 0
    ? explicitDayRate
    : explicitHourRate > 0
      ? explicitHourRate * hoursPerDay
      : 0;
  const ratePerHour = explicitHourRate > 0 ? explicitHourRate : ratePerDay > 0 ? ratePerDay / hoursPerDay : 0;
  return { ratePerDay, ratePerHour, hoursPerDay };
};

export const payrollRecordUsesExcelOverlay = (record: { earningProfile?: string | null; profileName?: string | null }) =>
  /HR (Salary|Dayrate) Schedule/i.test(String(record.earningProfile || record.profileName || ''));
