/** Client-safe leave day calculation (weekends + Nigeria public holidays + scattered selected dates). */

export type LeaveHoliday = { date: string; label?: string };

export type LeaveDayCalculationInput = {
  startDate: string;
  endDate: string;
  /** Explicit days taken within the period. When omitted, all chargeable days in range are used. */
  selectedDates?: string[] | null;
  holidays?: Array<string | LeaveHoliday> | null;
};

export type LeaveDayCalculationResult = {
  startDate: string;
  endDate: string;
  selectedDates: string[];
  chargeableDates: string[];
  days: number;
  weekendDates: string[];
  holidayDatesInPeriod: Array<{ date: string; label: string }>;
  holidayDatesExcluded: Array<{ date: string; label: string }>;
  nonChargeableSelected: string[];
};

const dayMs = 24 * 60 * 60 * 1000;

export const normalizeLeaveIsoDate = (value: unknown): string => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const enumerateInclusiveDates = (startDate: string, endDate: string): string[] => {
  const start = normalizeLeaveIsoDate(startDate);
  const end = normalizeLeaveIsoDate(endDate);
  if (!start || !end || end < start) return [];
  const out: string[] = [];
  for (let cursor = new Date(`${start}T00:00:00`); ;) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, '0');
    const d = String(cursor.getDate()).padStart(2, '0');
    const iso = `${y}-${m}-${d}`;
    out.push(iso);
    if (iso >= end) break;
    cursor = new Date(cursor.getTime() + dayMs);
  }
  return out;
};

export const isWeekendLeaveDate = (isoDate: string) => {
  const date = new Date(`${normalizeLeaveIsoDate(isoDate)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return false;
  const day = date.getDay();
  return day === 0 || day === 6;
};

export const holidayMapFromList = (holidays?: Array<string | LeaveHoliday> | null) => {
  const map = new Map<string, string>();
  for (const item of holidays || []) {
    if (typeof item === 'string') {
      const date = normalizeLeaveIsoDate(item);
      if (date) map.set(date, 'Public Holiday');
      continue;
    }
    const date = normalizeLeaveIsoDate(item?.date);
    if (!date) continue;
    map.set(date, String(item.label || 'Public Holiday').trim() || 'Public Holiday');
  }
  return map;
};

/** Chargeable leave day: not weekend and not a public holiday. Applies to all leave types. */
export const isChargeableLeaveDate = (isoDate: string, holidayDates: Set<string> | Map<string, string>) => {
  const date = normalizeLeaveIsoDate(isoDate);
  if (!date) return false;
  if (isWeekendLeaveDate(date)) return false;
  if (holidayDates instanceof Map) return !holidayDates.has(date);
  return !holidayDates.has(date);
};

export const defaultChargeableDatesInPeriod = (
  startDate: string,
  endDate: string,
  holidays?: Array<string | LeaveHoliday> | null,
) => {
  const holidayMap = holidayMapFromList(holidays);
  return enumerateInclusiveDates(startDate, endDate).filter((date) => isChargeableLeaveDate(date, holidayMap));
};

export const holidaysOverlappingPeriod = (
  startDate: string,
  endDate: string,
  holidays?: Array<string | LeaveHoliday> | null,
) => {
  const start = normalizeLeaveIsoDate(startDate);
  const end = normalizeLeaveIsoDate(endDate);
  const holidayMap = holidayMapFromList(holidays);
  return Array.from(holidayMap.entries())
    .filter(([date]) => date >= start && date <= end)
    .map(([date, label]) => ({ date, label }))
    .sort((a, b) => a.date.localeCompare(b.date));
};

/**
 * Regularize leave: count only selected (or default chargeable) days, excluding weekends and public holidays.
 * Holidays that fall in the period are reported so the UI can prompt before continuing.
 */
export const calculateLeaveDays = (input: LeaveDayCalculationInput): LeaveDayCalculationResult => {
  const startDate = normalizeLeaveIsoDate(input.startDate);
  const endDate = normalizeLeaveIsoDate(input.endDate);
  const holidayMap = holidayMapFromList(input.holidays);
  const periodDates = enumerateInclusiveDates(startDate, endDate);
  const weekendDates = periodDates.filter((date) => isWeekendLeaveDate(date));
  const holidayDatesInPeriod = holidaysOverlappingPeriod(startDate, endDate, input.holidays);

  const requested = Array.isArray(input.selectedDates) && input.selectedDates.length
    ? Array.from(new Set(input.selectedDates.map(normalizeLeaveIsoDate).filter(Boolean))).sort()
    : defaultChargeableDatesInPeriod(startDate, endDate, input.holidays);

  const inPeriod = requested.filter((date) => date >= startDate && date <= endDate);
  const chargeableDates = inPeriod.filter((date) => isChargeableLeaveDate(date, holidayMap));
  const nonChargeableSelected = inPeriod.filter((date) => !isChargeableLeaveDate(date, holidayMap));
  const holidayDatesExcluded = holidayDatesInPeriod.filter((item) => inPeriod.includes(item.date) || !input.selectedDates?.length);

  return {
    startDate,
    endDate,
    selectedDates: chargeableDates,
    chargeableDates,
    days: chargeableDates.length,
    weekendDates,
    holidayDatesInPeriod,
    holidayDatesExcluded,
    nonChargeableSelected,
  };
};

/** After employee confirms holiday prompt: drop holidays from selection and recount. */
export const regularizeLeaveDatesExcludingHolidays = (input: LeaveDayCalculationInput): LeaveDayCalculationResult => {
  const holidayMap = holidayMapFromList(input.holidays);
  const base = calculateLeaveDays(input);
  const withoutHolidays = base.selectedDates.filter((date) => !holidayMap.has(date));
  return calculateLeaveDays({
    ...input,
    selectedDates: withoutHolidays,
  });
};

export const selectedDatesOverlap = (a?: string[] | null, b?: string[] | null) => {
  const left = new Set((a || []).map(normalizeLeaveIsoDate).filter(Boolean));
  if (!left.size) return false;
  return (b || []).some((date) => left.has(normalizeLeaveIsoDate(date)));
};

export const leavePeriodRangesOverlap = (startA: string, endA: string, startB: string, endB: string) => {
  const a0 = normalizeLeaveIsoDate(startA);
  const a1 = normalizeLeaveIsoDate(endA);
  const b0 = normalizeLeaveIsoDate(startB);
  const b1 = normalizeLeaveIsoDate(endB);
  if (!a0 || !a1 || !b0 || !b1) return false;
  return a0 <= b1 && a1 >= b0;
};

/**
 * Conflict when either both have selectedDates that intersect, or either side lacks selectedDates
 * and the inclusive date ranges overlap.
 */
export const leaveApplicationsConflict = (a: {
  startDate?: string | null;
  endDate?: string | null;
  selectedDates?: string[] | null;
}, b: {
  startDate?: string | null;
  endDate?: string | null;
  selectedDates?: string[] | null;
}) => {
  const aStart = normalizeLeaveIsoDate(a.startDate);
  const aEnd = normalizeLeaveIsoDate(a.endDate);
  const bStart = normalizeLeaveIsoDate(b.startDate);
  const bEnd = normalizeLeaveIsoDate(b.endDate);
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  if (!leavePeriodRangesOverlap(aStart, aEnd, bStart, bEnd)) return false;

  const aSelected = (a.selectedDates || []).map(normalizeLeaveIsoDate).filter(Boolean);
  const bSelected = (b.selectedDates || []).map(normalizeLeaveIsoDate).filter(Boolean);
  if (aSelected.length && bSelected.length) return selectedDatesOverlap(aSelected, bSelected);
  if (aSelected.length) return aSelected.some((date) => date >= bStart && date <= bEnd);
  if (bSelected.length) return bSelected.some((date) => date >= aStart && date <= aEnd);
  return true;
};

export const encodeLeaveExceptionsPayload = (input: {
  messages?: string[];
  selectedDates?: string[];
  excludedHolidays?: Array<{ date: string; label: string }>;
}) => JSON.stringify({
  messages: input.messages || [],
  selectedDates: input.selectedDates || [],
  excludedHolidays: input.excludedHolidays || [],
});

export const decodeLeaveExceptionsPayload = (raw: unknown): {
  messages: string[];
  selectedDates: string[];
  excludedHolidays: Array<{ date: string; label: string }>;
} => {
  if (raw == null || raw === '') return { messages: [], selectedDates: [], excludedHolidays: [] };
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) {
      return { messages: parsed.map(String), selectedDates: [], excludedHolidays: [] };
    }
    if (parsed && typeof parsed === 'object') {
      const messages = Array.isArray((parsed as { messages?: unknown }).messages)
        ? (parsed as { messages: unknown[] }).messages.map(String)
        : [];
      const selectedDates = Array.isArray((parsed as { selectedDates?: unknown }).selectedDates)
        ? (parsed as { selectedDates: unknown[] }).selectedDates.map((item) => normalizeLeaveIsoDate(item)).filter(Boolean)
        : [];
      const excludedHolidays = Array.isArray((parsed as { excludedHolidays?: unknown }).excludedHolidays)
        ? (parsed as { excludedHolidays: Array<{ date?: string; label?: string }> }).excludedHolidays
          .map((item) => ({
            date: normalizeLeaveIsoDate(item?.date),
            label: String(item?.label || 'Public Holiday'),
          }))
          .filter((item) => item.date)
        : [];
      return { messages, selectedDates, excludedHolidays };
    }
  } catch {
    return { messages: [String(raw)], selectedDates: [], excludedHolidays: [] };
  }
  return { messages: [], selectedDates: [], excludedHolidays: [] };
};

/** Monday-first weekday labels for leave day calendars. */
export const LEAVE_CALENDAR_WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export type LeaveCalendarMonth = {
  year: number;
  month: number; // 1-12
  label: string;
  /** ISO dates or null padding cells for a Mon-first 7-column grid. */
  cells: Array<string | null>;
};

const monthLabel = (year: number, month: number) =>
  new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Build Mon-first calendar cells for a calendar month. */
export const buildLeaveCalendarMonthCells = (year: number, month: number): Array<string | null> => {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0=Sun..6=Sat
  const mondayIndex = firstDow === 0 ? 6 : firstDow - 1;
  const cells: Array<string | null> = [];
  for (let i = 0; i < mondayIndex; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
};

/** Calendar months covering an inclusive leave period (one grid per month). */
export const buildLeaveCalendarMonthsForPeriod = (startDate: string, endDate: string): LeaveCalendarMonth[] => {
  const start = normalizeLeaveIsoDate(startDate);
  const end = normalizeLeaveIsoDate(endDate);
  if (!start || !end || end < start) return [];
  const months: LeaveCalendarMonth[] = [];
  let year = Number(start.slice(0, 4));
  let month = Number(start.slice(5, 7));
  const endYear = Number(end.slice(0, 4));
  const endMonth = Number(end.slice(5, 7));
  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push({
      year,
      month,
      label: monthLabel(year, month),
      cells: buildLeaveCalendarMonthCells(year, month),
    });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
};
