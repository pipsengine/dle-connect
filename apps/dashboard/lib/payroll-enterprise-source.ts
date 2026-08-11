/** First payroll period where DLE_Enterprise is the sole runtime payroll authority. Sage is migration-only before this. */
export const ENTERPRISE_PAYROLL_FROM_PERIOD = String(process.env.HRIS_PAYROLL_ENTERPRISE_FROM || '2026-06').trim();

/**
 * Last period where Sage Dayrate Payment Schedule may feed days/OT into HRIS payroll.
 * From the next month onward, C-code daily-rate pay is timesheet-driven only (Sage license expired).
 */
export const SAGE_DAYRATE_SCHEDULE_FEED_UNTIL = String(process.env.HRIS_SAGE_DAYRATE_FEED_UNTIL || '2026-07').trim();

/**
 * Last period where JULY PAYROLL / Sage salaried payslip lines may drive permanent, lumpsum, IT, NYSC packages.
 * From the next month onward, HRIS package setup is the sole authority.
 */
export const SAGE_SALARIED_SCHEDULE_FEED_UNTIL = String(process.env.HRIS_SAGE_SALARIED_FEED_UNTIL || '2026-07').trim();

const periodSortKey = (period: string) => {
  const normalized = String(period || '').replace(/^per-/, '').trim();
  if (!/^\d{4}-\d{2}$/.test(normalized)) return 0;
  const [year, month] = normalized.split('-').map(Number);
  return year * 100 + month;
};

export const isEnterprisePayrollPeriod = (period: string) =>
  periodSortKey(period) >= periodSortKey(ENTERPRISE_PAYROLL_FROM_PERIOD);

/** True only for frozen Sage dayrate schedule migration periods (default through 2026-07). */
export const isSageDayrateScheduleFeedPeriod = (period: string) =>
  periodSortKey(period) > 0 && periodSortKey(period) <= periodSortKey(SAGE_DAYRATE_SCHEDULE_FEED_UNTIL);

/** True only for frozen Sage salaried schedule migration periods (default through 2026-07). */
export const isSageSalariedScheduleFeedPeriod = (period: string) =>
  periodSortKey(period) > 0 && periodSortKey(period) <= periodSortKey(SAGE_SALARIED_SCHEDULE_FEED_UNTIL);

export const isSageDayrateScheduleSource = (value?: string | null) =>
  /sage dayrate payment schedule/i.test(String(value || '').trim());

/** Sage live comparison is only valid for pre-cutover migration periods. */
export const shouldComparePayrollWithSage = (period: string) =>
  isSagePayrollRuntimeEnabled(period) && !isEnterprisePayrollPeriod(period);

/**
 * Sage payroll DB access is migration-only by default.
 * Set HRIS_SAGE_PAYROLL_RUNTIME=true only for legacy cutover debugging — never in production load paths.
 */
export const isSagePayrollRuntimeEnabled = (period?: string) => {
  const runtimeFlag = String(process.env.HRIS_SAGE_PAYROLL_RUNTIME ?? 'false').trim().toLowerCase();
  if (['0', 'false', 'no', 'off', ''].includes(runtimeFlag)) return false;
  if (period && isEnterprisePayrollPeriod(period)) return false;
  return true;
};

export const enterprisePayrollSourceLabel = (period: string) =>
  isEnterprisePayrollPeriod(period) ? 'DLE_Enterprise payroll engine' : 'DLE unified payroll calculation engine';
