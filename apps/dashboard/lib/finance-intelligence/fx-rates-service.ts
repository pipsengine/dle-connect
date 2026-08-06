import sql from 'mssql';
import { ensureFinanceDb } from '@/lib/finance-intelligence/store';

const compact = (value: unknown) => String(value ?? '').trim();
const moneyRound8 = (value: number) => Math.round(Number(value || 0) * 1e8) / 1e8;

const FX_CURRENCIES = ['USD', 'EUR', 'GBP'] as const;
type FxCurrency = (typeof FX_CURRENCIES)[number];

export type LiveFxRate = {
  fromCurrency: string;
  toCurrency: 'NGN';
  rate: number;
  rateDate: string;
  source: string;
};

type SyncResult = {
  syncedAt: string;
  rateDate: string;
  rates: LiveFxRate[];
  provider: string;
};

/** Refresh at most once per hour unless forced. */
const SYNC_TTL_MS = 60 * 60 * 1000;
let lastSyncAt = 0;
let lastSyncResult: SyncResult | null = null;
let syncInFlight: Promise<SyncResult> | null = null;

const todayIso = (date = new Date()) => date.toISOString().slice(0, 10);

const rateIdFor = (from: string, rateDate: string) =>
  `FX-${from.toUpperCase()}-${rateDate.replace(/-/g, '')}`;

const fetchJson = async (url: string, timeoutMs = 12000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`FX provider HTTP ${response.status} for ${url}`);
    return await response.json() as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
};

/** Primary: ExchangeRate-API open access (daily market rates, no key). */
const fetchFromOpenErApi = async (): Promise<SyncResult> => {
  const rateDate = todayIso();
  const rates: LiveFxRate[] = [];
  const provider = 'open.er-api.com';

  await Promise.all(FX_CURRENCIES.map(async (from) => {
    const json = await fetchJson(`https://open.er-api.com/v6/latest/${from}`);
    if (compact(json.result).toLowerCase() !== 'success') {
      throw new Error(`open.er-api.com failed for ${from}: ${compact(json.result) || 'unknown'}`);
    }
    const table = (json.rates || {}) as Record<string, number>;
    const ngn = Number(table.NGN);
    if (!(ngn > 0)) throw new Error(`open.er-api.com missing NGN for ${from}`);
    rates.push({
      fromCurrency: from,
      toCurrency: 'NGN',
      rate: moneyRound8(ngn),
      rateDate,
      source: provider,
    });
  }));

  return { syncedAt: new Date().toISOString(), rateDate, rates, provider };
};

/** Fallback: exchangerate.fun (hourly updates, no key). */
const fetchFromExchangeRateFun = async (): Promise<SyncResult> => {
  const rateDate = todayIso();
  const rates: LiveFxRate[] = [];
  const provider = 'api.exchangerate.fun';

  await Promise.all(FX_CURRENCIES.map(async (from) => {
    const json = await fetchJson(`https://api.exchangerate.fun/latest?base=${from}`);
    const table = (json.rates || {}) as Record<string, number>;
    const ngn = Number(table.NGN);
    if (!(ngn > 0)) throw new Error(`exchangerate.fun missing NGN for ${from}`);
    rates.push({
      fromCurrency: from,
      toCurrency: 'NGN',
      rate: moneyRound8(ngn),
      rateDate,
      source: provider,
    });
  }));

  return { syncedAt: new Date().toISOString(), rateDate, rates, provider };
};

const persistRates = async (sync: SyncResult) => {
  const pool = await ensureFinanceDb();
  if (!pool) throw new Error('Finance database unavailable for FX sync.');

  // Always keep NGN identity for the day.
  const allRates: LiveFxRate[] = [
    ...sync.rates,
    {
      fromCurrency: 'NGN',
      toCurrency: 'NGN',
      rate: 1,
      rateDate: sync.rateDate,
      source: 'Identity',
    },
  ];

  for (const item of allRates) {
    const rateId = rateIdFor(item.fromCurrency, item.rateDate);
    await pool.request()
      .input('RateId', sql.NVarChar(60), rateId)
      .input('FromCurrency', sql.NVarChar(10), item.fromCurrency)
      .input('ToCurrency', sql.NVarChar(10), item.toCurrency)
      .input('RateDate', sql.Date, item.rateDate)
      .input('Rate', sql.Decimal(19, 8), item.rate)
      .input('Source', sql.NVarChar(80), item.source)
      .query(`
MERGE [finance].[FxRates] AS target
USING (SELECT
  @RateId AS [RateId],
  @FromCurrency AS [FromCurrency],
  @ToCurrency AS [ToCurrency],
  @RateDate AS [RateDate],
  @Rate AS [Rate],
  @Source AS [Source]
) AS source
ON target.[FromCurrency] = source.[FromCurrency]
 AND target.[ToCurrency] = source.[ToCurrency]
 AND target.[RateDate] = source.[RateDate]
WHEN MATCHED THEN UPDATE SET
  [Rate] = source.[Rate],
  [Source] = source.[Source],
  [RateId] = COALESCE(target.[RateId], source.[RateId]),
  [UpdatedAt] = SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT ([RateId], [FromCurrency], [ToCurrency], [RateDate], [Rate], [Source])
VALUES (source.[RateId], source.[FromCurrency], source.[ToCurrency], source.[RateDate], source.[Rate], source.[Source]);
`);
  }

  return allRates;
};

const runLiveSync = async (): Promise<SyncResult> => {
  let sync: SyncResult;
  try {
    sync = await fetchFromOpenErApi();
  } catch (primaryError) {
    console.warn('[fx-rates] primary provider failed; trying fallback', primaryError);
    sync = await fetchFromExchangeRateFun();
  }
  await persistRates(sync);
  lastSyncAt = Date.now();
  lastSyncResult = sync;
  console.info('[fx-rates] synced live market rates', {
    provider: sync.provider,
    rateDate: sync.rateDate,
    rates: sync.rates.map((row) => `${row.fromCurrency}=${row.rate}`),
  });
  return sync;
};

/**
 * Ensure today's FX rates are live market rates.
 * Refreshes at most once per hour unless force=true.
 */
export const ensureLiveFxRates = async (options?: { force?: boolean }): Promise<SyncResult> => {
  const force = Boolean(options?.force);
  const fresh = !force && lastSyncResult && (Date.now() - lastSyncAt) < SYNC_TTL_MS;
  if (fresh && lastSyncResult) return lastSyncResult;

  if (syncInFlight) return syncInFlight;

  syncInFlight = runLiveSync()
    .catch((error) => {
      console.error('[fx-rates] live sync failed', error);
      if (lastSyncResult) return lastSyncResult;
      throw error;
    })
    .finally(() => {
      syncInFlight = null;
    });

  return syncInFlight;
};

export const listSyncedFxCurrencies = () => [...FX_CURRENCIES] as FxCurrency[];
