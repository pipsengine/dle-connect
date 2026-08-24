/** First payroll period where DLE_Enterprise is the sole runtime payroll authority. */
export const ENTERPRISE_PAYROLL_FROM_PERIOD = String(process.env.HRIS_PAYROLL_ENTERPRISE_FROM || '2026-06').trim();

const periodSortKey = (period: string) => {
  const normalized = String(period || '').replace(/^per-/, '').trim();
  if (!/^\d{4}-\d{2}$/.test(normalized)) return 0;
  const [year, month] = normalized.split('-').map(Number);
  return year * 100 + month;
};

export const isEnterprisePayrollPeriod = (period: string) =>
  periodSortKey(period) >= periodSortKey(ENTERPRISE_PAYROLL_FROM_PERIOD);

/** Legacy Sage dayrate schedule feed — permanently disabled; HRIS timesheets are the sole authority. */
export const isSageDayrateScheduleFeedPeriod = (_period: string) => false;

/** Legacy Sage salaried payslip feed — permanently disabled; HRIS package setup is the sole authority. */
export const isSageSalariedScheduleFeedPeriod = (_period: string) => false;

export const isSageDayrateScheduleSource = (value?: string | null) =>
  /sage dayrate payment schedule/i.test(String(value || '').trim());

/** HRIS Overtime Management / timesheet OT postings — allowed on top of timesheet weekday days. */
export const isHrisTimesheetOvertimeSource = (value?: string | null) =>
  /hris timesheet overtime/i.test(String(value || '').trim());

/** Sage live comparison permanently disabled — HRIS payroll engine is authoritative for all periods. */
export const shouldComparePayrollWithSage = (_period: string) => false;

/** Sage payroll DB/runtime permanently disabled — all payroll data comes from HRIS. */
export const isSagePayrollRuntimeEnabled = (_period?: string) => false;

export const enterprisePayrollSourceLabel = (_period: string) => 'DLE_Enterprise payroll engine';
