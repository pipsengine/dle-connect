'use client';

import { TrendingDown, TrendingUp } from 'lucide-react';
import type { PayrollMomMetric, PayrollMomMetricKey, PayrollMonthOverMonth } from '@/lib/payroll-month-over-month';
import { payrollMomMetric } from '@/lib/payroll-month-over-month';
import { formatPayrollMoney } from '@/lib/payroll-currency';

const money = (value: number, allowed: boolean) => {
  if (!allowed) return 'Restricted';
  return formatPayrollMoney(value, 'NGN', { maximumFractionDigits: 0 });
};

const signedMoney = (value: number, allowed: boolean) => {
  if (!allowed) return 'Restricted';
  const formatted = money(Math.abs(value), true);
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
};

const count = (value: number) => new Intl.NumberFormat('en-GB').format(value);
const signedCount = (value: number) => {
  if (value > 0) return `+${count(value)}`;
  if (value < 0) return `-${count(Math.abs(value))}`;
  return count(value);
};

const pct = (value: number) => {
  const formatted = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 }).format(Math.abs(value));
  if (value > 0) return `+${formatted}%`;
  if (value < 0) return `-${formatted}%`;
  return `${formatted}%`;
};

const directionClass = (direction: PayrollMomMetric['direction']) =>
  direction === 'up' ? 'text-rose-700' : direction === 'down' ? 'text-emerald-700' : 'text-slate-500';

export function PayrollMomBadge({
  mom,
  metricKey,
  canViewMoney = true,
}: {
  mom?: PayrollMonthOverMonth | null;
  metricKey: PayrollMomMetricKey;
  canViewMoney?: boolean;
}) {
  const metric = payrollMomMetric(mom, metricKey);
  if (!mom || !metric) return null;
  const Icon = metric.direction === 'down' ? TrendingDown : TrendingUp;
  const amount = metric.kind === 'count'
    ? signedCount(metric.variance)
    : signedMoney(metric.variance, canViewMoney);
  return (
    <p className={`mt-2 inline-flex items-center gap-1 text-[11px] font-black ${directionClass(metric.direction)}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <span>
        {amount} · {pct(metric.pctChange)} vs {mom.previousPeriodLabel}
      </span>
    </p>
  );
}

export default function PayrollMonthOverMonthPanel({
  mom,
  packLabel,
  canViewMoney = true,
}: {
  mom?: PayrollMonthOverMonth | null;
  packLabel?: string;
  canViewMoney?: boolean;
}) {
  if (!mom) return null;
  return (
    <section className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Month-over-month variance</p>
        <h2 className="mt-1 text-sm font-black text-slate-950">
          {packLabel ? `${packLabel} · ` : ''}
          {mom.currentPeriodLabel} vs {mom.previousPeriodLabel || 'prior month'}
        </h2>
        <p className="mt-1 text-xs font-semibold text-slate-500">
          {mom.available
            ? 'Same schedule only. Naira totals compared with the previous payroll month.'
            : 'Previous month has no comparable payroll figures for this schedule yet.'}
        </p>
      </div>
      {mom.available ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Metric</th>
                <th className="px-4 py-3 text-right">{mom.previousPeriodLabel}</th>
                <th className="px-4 py-3 text-right">{mom.currentPeriodLabel}</th>
                <th className="px-4 py-3 text-right">Variance</th>
                <th className="px-4 py-3 text-right">Change</th>
              </tr>
            </thead>
            <tbody>
              {mom.metrics.map((metric) => {
                const Icon = metric.direction === 'down' ? TrendingDown : TrendingUp;
                const currentValue = metric.kind === 'count' ? count(metric.current) : money(metric.current, canViewMoney);
                const previousValue = metric.kind === 'count' ? count(metric.previous) : money(metric.previous, canViewMoney);
                const varianceValue = metric.kind === 'count'
                  ? signedCount(metric.variance)
                  : signedMoney(metric.variance, canViewMoney);
                return (
                  <tr key={metric.key} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-bold text-slate-900">{metric.label}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-600">{previousValue}</td>
                    <td className="px-4 py-3 text-right font-black text-slate-950">{currentValue}</td>
                    <td className={`px-4 py-3 text-right font-black ${directionClass(metric.direction)}`}>
                      <span className="inline-flex items-center justify-end gap-1">
                        <Icon className="h-3.5 w-3.5" aria-hidden />
                        {varianceValue}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-right font-black ${directionClass(metric.direction)}`}>{pct(metric.pctChange)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-4 py-4 text-sm font-semibold text-slate-500 sm:px-5">
          Once the previous month is computed or has a salary schedule, this panel will show whether cost went up or down.
        </p>
      )}
    </section>
  );
}
