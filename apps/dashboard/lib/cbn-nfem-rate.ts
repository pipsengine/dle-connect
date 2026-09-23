/**
 * Central Bank of Nigeria NFEM USD/NGN rates.
 * Source: https://www.cbn.gov.ng/rates/ExchRateByCurrency.html
 * The table's Highest Rate column is the rate used for a payroll day.
 */

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

export type CbnNfemRow = {
  ratedate?: string | null;
  highestrate?: string | number | null;
};

export const CBN_NFEM_RATES_URL = 'https://www.cbn.gov.ng/api/GetAllNFEM_Rates';

const roundRate = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 10000) / 10000;

/** "September-22-2026" → "2026-09-22". */
export const parseCbnRateDate = (value: string): string | null => {
  const match = /^([A-Za-z]+)-(\d{1,2})-(\d{4})$/.exec(String(value || '').trim());
  if (!match) return null;
  const month = MONTHS.indexOf(match[1].toLowerCase());
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (month < 0 || !Number.isInteger(day) || !Number.isInteger(year)) return null;
  const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const check = new Date(`${iso}T00:00:00Z`);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month || check.getUTCDate() !== day) return null;
  return iso;
};

export const utcDayIso = (date: Date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Last CBN publication on or before `asOfIso`, using that day's highest NFEM rate.
 * A weekend or a day not yet published resolves to the previous published day.
 */
export const pickCbnHighestUsdRate = (rows: CbnNfemRow[], asOfIso: string) => {
  const asOf = String(asOfIso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return null;
  let best: { rate: number; rateDate: string } | null = null;
  for (const row of rows) {
    const rateDate = parseCbnRateDate(String(row.ratedate || ''));
    const rate = roundRate(Number(row.highestrate));
    if (!rateDate || !(rate > 0) || rateDate > asOf) continue;
    if (!best || rateDate > best.rateDate || (rateDate === best.rateDate && rate > best.rate)) {
      best = { rate, rateDate };
    }
  }
  return best;
};

const CACHE_TTL_MS = 30 * 60 * 1000;
let cache: { at: number; rows: CbnNfemRow[] } | null = null;
let inFlight: Promise<CbnNfemRow[]> | null = null;

export const fetchCbnNfemRates = async (): Promise<CbnNfemRow[]> => {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rows;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(CBN_NFEM_RATES_URL, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`CBN NFEM HTTP ${response.status}`);
      const rows = await response.json() as CbnNfemRow[];
      if (!Array.isArray(rows) || rows.length === 0) throw new Error('CBN NFEM payload was empty');
      cache = { at: Date.now(), rows };
      return rows;
    } finally {
      clearTimeout(timer);
      inFlight = null;
    }
  })();
  return inFlight;
};
