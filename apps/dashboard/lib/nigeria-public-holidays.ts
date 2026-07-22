import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type NigeriaPublicHoliday = {
  id: string;
  label: string;
  date: string;
  source: 'google-calendar' | 'fallback' | 'hr-override';
};

const resolveDashboardRoot = () => {
  const cwd = process.cwd();
  const dashboardSuffix = path.join('apps', 'dashboard');
  return cwd.endsWith(dashboardSuffix) ? cwd : path.join(cwd, dashboardSuffix);
};

const DATA_DIR = process.env.DLE_HRIS_DATA_DIR
  ? path.resolve(process.env.DLE_HRIS_DATA_DIR)
  : path.join(resolveDashboardRoot(), 'data', 'hris');

const CACHE_PATH = path.join(DATA_DIR, 'nigeria-public-holidays-cache.json');
const PAYROLL_HOLIDAY_PATH = path.join(DATA_DIR, 'payroll-public-holidays.json');
const LEAVE_CALENDAR_PATH = path.join(DATA_DIR, 'leave-calendar-config.json');

/** Google Calendar public ICS for Holidays in Nigeria. */
export const NIGERIA_GOOGLE_HOLIDAY_ICS_URL =
  'https://calendar.google.com/calendar/ical/en.ng%23holiday%40group.v.calendar.google.com/public/basic.ics';

/** Official Google calendar ID (also try `.official` variant). */
export const NIGERIA_GOOGLE_HOLIDAY_ICS_URLS = [
  NIGERIA_GOOGLE_HOLIDAY_ICS_URL,
  'https://calendar.google.com/calendar/ical/en.ng.official%23holiday%40group.v.calendar.google.com/public/basic.ics',
];

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

const compact = (value: unknown) => String(value || '').trim();
const dateOnly = (value: string) => compact(value).slice(0, 10);

/** Fixed / commonly observed Nigerian public holidays used when Google ICS is unreachable. */
export const nigeriaFallbackHolidaysForYear = (year: number): NigeriaPublicHoliday[] => {
  const fixed: Array<[string, string]> = [
    [`${year}-01-01`, "New Year's Day"],
    [`${year}-05-01`, 'Workers\' Day'],
    [`${year}-06-12`, 'Democracy Day'],
    [`${year}-10-01`, 'Independence Day'],
    [`${year}-12-25`, 'Christmas Day'],
    [`${year}-12-26`, 'Boxing Day'],
  ];
  return fixed.map(([date, label]) => ({
    id: `ng-fallback-${date}`,
    label,
    date,
    source: 'fallback' as const,
  }));
};

const unfoldIcsLines = (raw: string) =>
  raw.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');

const parseIcsDate = (value: string): string | null => {
  const raw = compact(value);
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return null;
};

export const parseGoogleHolidayIcs = (icsText: string): NigeriaPublicHoliday[] => {
  const text = unfoldIcsLines(icsText);
  const events = text.split('BEGIN:VEVENT').slice(1);
  const holidays: NigeriaPublicHoliday[] = [];
  for (const chunk of events) {
    const block = chunk.split('END:VEVENT')[0] || '';
    const summary = compact(block.match(/^SUMMARY(?:;[^:]*)?:(.+)$/m)?.[1]);
    const dtStart = compact(block.match(/^DTSTART(?:;[^:]*)?:(.+)$/m)?.[1]);
    const uid = compact(block.match(/^UID:(.+)$/m)?.[1]) || `${dtStart}-${summary}`;
    const date = parseIcsDate(dtStart);
    if (!date || !summary) continue;
    // Skip multi-day "observance" noise without a clear date; Google uses DATE values for holidays.
    holidays.push({
      id: `gcal-${uid}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120),
      label: summary.replace(/\\,/g, ',').replace(/\\n/g, ' '),
      date,
      source: 'google-calendar',
    });
  }
  const byDate = new Map<string, NigeriaPublicHoliday>();
  for (const item of holidays) {
    const existing = byDate.get(item.date);
    if (!existing || item.label.length > existing.label.length) byDate.set(item.date, item);
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
};

const readJsonFile = async <T>(filePath: string, fallback: T): Promise<T> => {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
};

const writeJsonFile = async (filePath: string, value: unknown) => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

type HolidayCache = {
  fetchedAt: string;
  sourceUrl?: string;
  holidays: NigeriaPublicHoliday[];
};

const fetchIcsText = async (url: string): Promise<string | null> => {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'text/calendar, text/plain, */*' },
      cache: 'no-store',
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
};

export const fetchNigeriaPublicHolidaysFromGoogle = async (): Promise<{
  holidays: NigeriaPublicHoliday[];
  sourceUrl: string | null;
}> => {
  for (const url of NIGERIA_GOOGLE_HOLIDAY_ICS_URLS) {
    const text = await fetchIcsText(url);
    if (!text || !/BEGIN:VEVENT/i.test(text)) continue;
    const holidays = parseGoogleHolidayIcs(text);
    if (holidays.length) return { holidays, sourceUrl: url };
  }
  return { holidays: [], sourceUrl: null };
};

const mergeHolidayLists = (...lists: NigeriaPublicHoliday[][]) => {
  const byDate = new Map<string, NigeriaPublicHoliday>();
  const rank = (source: NigeriaPublicHoliday['source']) =>
    (source === 'hr-override' ? 3 : source === 'google-calendar' ? 2 : 1);
  for (const list of lists) {
    for (const item of list) {
      const date = dateOnly(item.date);
      if (!date) continue;
      const next = { ...item, date, label: compact(item.label) || 'Public Holiday' };
      const existing = byDate.get(date);
      if (!existing || rank(next.source) >= rank(existing.source)) byDate.set(date, next);
    }
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
};

const readHrOverrideHolidays = async (): Promise<NigeriaPublicHoliday[]> => {
  const leaveConfig = await readJsonFile<{ holidays?: Array<{ id?: string; label?: string; date?: string }> }>(
    LEAVE_CALENDAR_PATH,
    { holidays: [] },
  );
  return (leaveConfig.holidays || [])
    .map((item) => ({
      id: compact(item.id) || `hr-${dateOnly(String(item.date || ''))}`,
      label: compact(item.label) || 'Public Holiday',
      date: dateOnly(String(item.date || '')),
      source: 'hr-override' as const,
    }))
    .filter((item) => item.date);
};

/**
 * Resolve Nigeria public holidays: Google Calendar ICS (cached), fallback fixed dates, HR overrides.
 * Also syncs payroll-public-holidays.json date list for OT/timesheet day typing.
 */
export const resolveNigeriaPublicHolidays = async (options?: {
  forceRefresh?: boolean;
  years?: number[];
}): Promise<{
  holidays: NigeriaPublicHoliday[];
  dates: string[];
  source: 'google-calendar' | 'cache' | 'fallback';
  sourceUrl?: string | null;
}> => {
  const now = Date.now();
  const year = new Date().getFullYear();
  const years = options?.years?.length ? options.years : [year - 1, year, year + 1];
  const cache = await readJsonFile<HolidayCache | null>(CACHE_PATH, null);
  const cacheAge = cache?.fetchedAt ? now - new Date(cache.fetchedAt).getTime() : Number.POSITIVE_INFINITY;
  const cacheFresh = Boolean(cache?.holidays?.length) && cacheAge < CACHE_TTL_MS && !options?.forceRefresh;

  let feedHolidays: NigeriaPublicHoliday[] = [];
  let source: 'google-calendar' | 'cache' | 'fallback' = 'fallback';
  let sourceUrl: string | null | undefined;

  if (cacheFresh && cache) {
    feedHolidays = cache.holidays;
    source = 'cache';
    sourceUrl = cache.sourceUrl;
  } else {
    const fetched = await fetchNigeriaPublicHolidaysFromGoogle();
    if (fetched.holidays.length) {
      feedHolidays = fetched.holidays;
      source = 'google-calendar';
      sourceUrl = fetched.sourceUrl;
      await writeJsonFile(CACHE_PATH, {
        fetchedAt: new Date().toISOString(),
        sourceUrl: sourceUrl || undefined,
        holidays: feedHolidays,
      } satisfies HolidayCache);
    } else if (cache?.holidays?.length) {
      feedHolidays = cache.holidays;
      source = 'cache';
      sourceUrl = cache.sourceUrl;
    } else {
      feedHolidays = years.flatMap((y) => nigeriaFallbackHolidaysForYear(y));
      source = 'fallback';
    }
  }

  const hrOverrides = await readHrOverrideHolidays();
  const holidays = mergeHolidayLists(feedHolidays, hrOverrides);
  const dates = holidays.map((item) => item.date);

  // Keep payroll OT holiday list aligned for timesheet day typing.
  try {
    const payroll = await readJsonFile<{ dates?: string[] }>(PAYROLL_HOLIDAY_PATH, { dates: [] });
    const mergedDates = Array.from(new Set([...(payroll.dates || []).map(dateOnly).filter(Boolean), ...dates])).sort();
    await writeJsonFile(PAYROLL_HOLIDAY_PATH, { dates: mergedDates, syncedFrom: 'nigeria-public-holidays', syncedAt: new Date().toISOString() });
  } catch {
    // Non-fatal — leave still works with in-memory holidays.
  }

  // Mirror feed into leave calendar holidays (preserve HR overrides / blocked periods).
  try {
    const leaveConfig = await readJsonFile<{
      blockedPeriods?: unknown[];
      holidays?: Array<{ id: string; label: string; date: string }>;
    }>(LEAVE_CALENDAR_PATH, { blockedPeriods: [], holidays: [] });
    const existingHr = new Set(
      (leaveConfig.holidays || [])
        .filter((item) => String(item.id || '').startsWith('hr-') || !String(item.id || '').startsWith('gcal-') && !String(item.id || '').startsWith('ng-fallback-'))
        .map((item) => dateOnly(item.date)),
    );
    const feedForLeave = holidays
      .filter((item) => item.source !== 'hr-override' || !existingHr.has(item.date))
      .map((item) => ({ id: item.id, label: item.label, date: item.date }));
    const hrOnly = (leaveConfig.holidays || []).filter((item) => {
      const id = String(item.id || '');
      return id.startsWith('hr-') || (!id.startsWith('gcal-') && !id.startsWith('ng-fallback-') && !id.startsWith('ng-'));
    });
    const byDate = new Map<string, { id: string; label: string; date: string }>();
    for (const item of [...feedForLeave, ...hrOnly]) {
      if (!item.date) continue;
      byDate.set(item.date, item);
    }
    await writeJsonFile(LEAVE_CALENDAR_PATH, {
      blockedPeriods: Array.isArray(leaveConfig.blockedPeriods) ? leaveConfig.blockedPeriods : [],
      holidays: Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date)),
      holidayFeed: { source, sourceUrl: sourceUrl || null, syncedAt: new Date().toISOString() },
    });
  } catch {
    // Non-fatal
  }

  return { holidays, dates, source, sourceUrl };
};

export const nigeriaHolidayDateSet = async (options?: { forceRefresh?: boolean }) => {
  const resolved = await resolveNigeriaPublicHolidays(options);
  return new Set(resolved.dates);
};
