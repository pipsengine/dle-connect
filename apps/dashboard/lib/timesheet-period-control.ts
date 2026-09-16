export const TIMESHEET_SEPTEMBER_2026_PERIOD_ID = 'per-2026-09';
export const TIMESHEET_OCTOBER_2026_PERIOD_ID = 'per-2026-10';

export type TimesheetPeriodControlRecord = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: 'Open' | 'Closed' | 'Locked';
  openedAt?: string | null;
  openedBy?: string | null;
  closedAt?: string | null;
  closedBy?: string | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
};

export const isoDay = (value: Date | string) => {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(value || '').slice(0, 10);
};

export const isDateInTimesheetPeriod = (date: Date | string, period: Pick<TimesheetPeriodControlRecord, 'startDate' | 'endDate'>) => {
  const day = isoDay(date);
  return Boolean(day) && day >= period.startDate && day <= period.endDate;
};

export const findOpenTimesheetPeriod = (periods: TimesheetPeriodControlRecord[]) =>
  periods
    .filter((period) => period.status === 'Open')
    .sort((a, b) => b.endDate.localeCompare(a.endDate))[0] || null;

export const repairManualTimesheetPeriods = (
  periods: TimesheetPeriodControlRecord[],
  september: TimesheetPeriodControlRecord,
  nowIso: string,
) => {
  const october = periods.find((period) => period.id === TIMESHEET_OCTOBER_2026_PERIOD_ID);
  const removedOctober = Boolean(october && (!october.openedBy || october.openedBy === 'System'));
  const withoutOctober = removedOctober
    ? periods.filter((period) => period.id !== TIMESHEET_OCTOBER_2026_PERIOD_ID)
    : periods;
  const existing = withoutOctober.find((period) => period.id === TIMESHEET_SEPTEMBER_2026_PERIOD_ID);
  const systemClosedSeptember = Boolean(existing && existing.status !== 'Open' && (!existing.closedBy || existing.closedBy === 'System'));
  const reopenedSeptember = !existing || existing.status === 'Open' || systemClosedSeptember;
  const septemberRecord: TimesheetPeriodControlRecord = reopenedSeptember
    ? {
        ...september,
        ...existing,
        id: TIMESHEET_SEPTEMBER_2026_PERIOD_ID,
        name: september.name,
        startDate: september.startDate,
        endDate: september.endDate,
        status: 'Open',
        openedAt: existing?.openedAt || nowIso,
        openedBy: existing?.openedBy || 'Payroll Officer',
        closedAt: null,
        closedBy: null,
        updatedAt: nowIso,
        updatedBy: 'System',
      }
    : {
        ...september,
        ...existing,
        id: TIMESHEET_SEPTEMBER_2026_PERIOD_ID,
        name: september.name,
        startDate: september.startDate,
        endDate: september.endDate,
      };
  const rest = withoutOctober.filter((period) => period.id !== TIMESHEET_SEPTEMBER_2026_PERIOD_ID);
  return {
    periods: [septemberRecord, ...rest],
    removedOctober,
    reopenedSeptember: Boolean(systemClosedSeptember || !existing),
  };
};
