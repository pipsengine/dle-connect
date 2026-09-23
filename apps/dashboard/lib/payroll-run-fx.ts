import sql from 'mssql';
import { fetchCbnNfemRates, pickCbnHighestUsdRate, utcDayIso } from '@/lib/cbn-nfem-rate';
import { ensureFinanceDb } from '@/lib/finance-intelligence/store';
import { roundMoney } from '@/lib/payroll-package-lines';
import { resolvePayCurrency } from '@/lib/payroll-currency';
import { payrollSalariesSummaryLockDate } from '@/lib/payroll-salaries-summary';
import { ensureSalaryScheduleOverrideLoaded } from '@/lib/salary-schedule-upload-sql';
import type { PayrollRunFx } from '@/lib/payroll-fx-display';

const compact = (value: unknown) => String(value ?? '').trim();

const periodCode = (period?: string | null) =>
  compact(period).replace(/\//g, '-').replace(/^per-/i, '').slice(0, 7);

/** Payroll day, but not a future date — CBN has not published those yet. */
const payrollRateAsOfIso = (period: string, today = new Date()) => {
  const lockIso = utcDayIso(payrollSalariesSummaryLockDate(period));
  const todayIso = utcDayIso(today);
  return lockIso < todayIso ? lockIso : todayIso;
};

/**
 * USD→NGN rate for the payroll day: the latest Central Bank of Nigeria NFEM
 * publication on or before that day, always that day's highest rate.
 * A stored schedule or finance rate is used only when the CBN feed cannot be read.
 */
export const resolvePayrollRunUsdNgnRate = async (period?: string | null): Promise<PayrollRunFx | null> => {
  const normalized = periodCode(period);
  if (!/^\d{4}-\d{2}$/.test(normalized)) return null;
  const asOfIso = payrollRateAsOfIso(normalized);

  try {
    const rows = await fetchCbnNfemRates();
    const picked = pickCbnHighestUsdRate(rows, asOfIso);
    if (picked) {
      return {
        rate: picked.rate,
        rateDate: picked.rateDate,
        source: 'Central Bank of Nigeria NFEM highest rate',
        kind: 'cbn',
        period: normalized,
      };
    }
  } catch (error) {
    console.warn('[payroll-fx] CBN NFEM rate skipped', error);
  }

  const lockDate = payrollSalariesSummaryLockDate(normalized);
  const lockIso = lockDate.toISOString().slice(0, 10);

  try {
    const schedule = await ensureSalaryScheduleOverrideLoaded(normalized);
    const locked = schedule?.parsed?.lockedUsdNgnRate;
    if (locked && Number(locked.rate) > 0) {
      return {
        rate: roundMoney(Number(locked.rate)),
        rateDate: compact(locked.rateDate).slice(0, 10) || lockIso,
        source: compact(locked.source) || 'Salary schedule',
        kind: 'cbn',
        period: normalized,
      };
    }
  } catch (error) {
    console.warn('[payroll-fx] salary schedule rate skipped', error);
  }

  const pool = await ensureFinanceDb().catch(() => null);
  if (!pool) return null;
  try {
    const result = await pool.request()
      .input('onDate', sql.Date, lockDate)
      .query(`
SELECT TOP 1 [RateDate], [Rate], [Source]
FROM [finance].[FxRates]
WHERE [FromCurrency] = N'USD'
  AND [ToCurrency] = N'NGN'
  AND [RateDate] <= @onDate
  AND [Rate] > 0
  AND ([Source] IS NULL OR [Source] NOT LIKE N'%seed%')
ORDER BY [RateDate] DESC
`);
    const row = result.recordset?.[0] as { RateDate?: unknown; Rate?: unknown; Source?: unknown } | undefined;
    const rate = Number(row?.Rate || 0);
    if (!(rate > 0)) return null;
    const source = compact(row?.Source) || 'finance.FxRates';
    const rateDate = row?.RateDate
      ? new Date(String(row.RateDate)).toISOString().slice(0, 10)
      : lockIso;
    return {
      rate: roundMoney(rate),
      rateDate,
      source,
      kind: /cbn/i.test(source) ? 'cbn' : 'market',
      period: normalized,
    };
  } catch (error) {
    console.warn('[payroll-fx] stored USD/NGN rate skipped', error);
    return null;
  }
};

export const payrollFxForEmployeePackage = async (input: {
  payCurrency?: string | null;
  payrollGroup?: string | null;
  salaryGrade?: string | null;
  jobGrade?: string | null;
  businessUnit?: string | null;
  period?: string | null;
}): Promise<PayrollRunFx | null> => {
  const currency = resolvePayCurrency(input);
  if (currency !== 'USD') return null;
  return resolvePayrollRunUsdNgnRate(input.period);
};
