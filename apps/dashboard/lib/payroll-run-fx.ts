import sql from 'mssql';
import { ensureFinanceDb } from '@/lib/finance-intelligence/store';
import { roundMoney } from '@/lib/payroll-package-lines';
import { resolvePayCurrency } from '@/lib/payroll-currency';
import { payrollSalariesSummaryLockDate } from '@/lib/payroll-salaries-summary';
import { ensureSalaryScheduleOverrideLoaded } from '@/lib/salary-schedule-upload-sql';
import type { PayrollRunFx } from '@/lib/payroll-fx-display';

const compact = (value: unknown) => String(value ?? '').trim();

const periodCode = (period?: string | null) =>
  compact(period).replace(/\//g, '-').replace(/^per-/i, '').slice(0, 7);

/**
 * USD→NGN rate for the day this payroll period is run.
 * The salary-schedule CBN rate wins. Otherwise the latest stored USD/NGN rate
 * on or before the period lock date (last calendar day of the payroll month).
 * No invented fallback rate — a missing rate stays missing.
 */
export const resolvePayrollRunUsdNgnRate = async (period?: string | null): Promise<PayrollRunFx | null> => {
  const normalized = periodCode(period);
  if (!/^\d{4}-\d{2}$/.test(normalized)) return null;
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
