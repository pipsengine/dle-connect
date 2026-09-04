'use client';

import { useMemo, useState } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import type {
  PayrollMomContributor,
  PayrollMomDetailBucket,
  PayrollMomMetric,
  PayrollMomMetricKey,
  PayrollMonthOverMonth,
} from '@/lib/payroll-month-over-month';
import { payrollMomMetric } from '@/lib/payroll-month-over-month';
import type { BankScheduleStaffPack } from '@/lib/payroll-bank-schedule-packs';
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

const directionFromValue = (value: number): PayrollMomMetric['direction'] =>
  value > 0 ? 'up' : value < 0 ? 'down' : 'flat';

const bucketValue = (bucket: PayrollMomDetailBucket, allowed: boolean) =>
  bucket.kind === 'count' ? signedCount(bucket.value) : signedMoney(bucket.value, allowed);

const contributorValue = (item: PayrollMomContributor, metric: PayrollMomMetric, allowed: boolean) =>
  metric.kind === 'count' ? signedCount(item.variance) : signedMoney(item.variance, allowed);

const detailTotalValue = (value: number, metric: PayrollMomMetric, allowed: boolean) =>
  metric.kind === 'count' ? count(value) : money(value, allowed);

const STAFF_PACK_FILTERS: Array<{ id: 'all' | BankScheduleStaffPack; label: string }> = [
  { id: 'all', label: 'All staff' },
  { id: 'permanent', label: 'Permanent' },
  { id: 'contract-lumpsum', label: 'Contract / Lumpsum' },
  { id: 'it-nysc', label: 'IT / NYSC' },
];

function VarianceContributorsPanel({
  metric,
  contributors,
  contributorTotal,
  unchangedCount,
  canViewMoney,
}: {
  metric: PayrollMomMetric;
  contributors: PayrollMomContributor[];
  contributorTotal: number;
  unchangedCount: number;
  canViewMoney: boolean;
}) {
  const [query, setQuery] = useState('');
  const [staffPack, setStaffPack] = useState<'all' | BankScheduleStaffPack>('all');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return contributors.filter((item) => {
      if (staffPack !== 'all' && item.staffPack !== staffPack) return false;
      if (!needle) return true;
      const haystack = `${item.fullName} ${item.employeeCode} ${item.reason} ${item.staffPackLabel || ''}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [contributors, query, staffPack]);

  const packCounts = useMemo(() => {
    const counts: Partial<Record<BankScheduleStaffPack, number>> = {};
    for (const item of contributors) {
      if (!item.staffPack) continue;
      counts[item.staffPack] = (counts[item.staffPack] || 0) + 1;
    }
    return counts;
  }, [contributors]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">Employee variances</p>
          <p className="mt-1 text-sm font-semibold text-slate-600">
            {count(contributorTotal)} with movement
            {unchangedCount > 0 ? ` · ${count(unchangedCount)} unchanged` : ''}
          </p>
        </div>
        <label className="block min-w-[12rem] flex-1 sm:max-w-xs">
          <span className="sr-only">Search employees</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, code, reason…"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 outline-none ring-slate-300 placeholder:font-medium placeholder:text-slate-400 focus:ring-2"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {STAFF_PACK_FILTERS.map((option) => {
          const optionCount = option.id === 'all'
            ? contributorTotal
            : Number(packCounts[option.id] || 0);
          if (option.id !== 'all' && optionCount === 0) return null;
          const active = staffPack === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setStaffPack(option.id)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-black transition ${
                active
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {option.label} ({count(optionCount)})
            </button>
          );
        })}
      </div>

      <div className="mt-3 max-h-[28rem] overflow-auto rounded-xl border border-slate-100">
        <table className="min-w-full text-left text-sm">
          <thead className="sticky top-0 bg-slate-50 text-[11px] font-black uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Employee</th>
              <th className="px-3 py-2">Group</th>
              <th className="px-3 py-2">Reason</th>
              <th className="px-3 py-2 text-right">Variance</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length ? filtered.map((item) => (
              <tr key={`${item.employeeId}-${item.employeeCode}`} className="border-t border-slate-100">
                <td className="px-3 py-2">
                  <div className="font-bold text-slate-900">{item.fullName || item.employeeCode}</div>
                  <div className="text-xs font-semibold text-slate-500">{item.employeeCode}</div>
                </td>
                <td className="px-3 py-2 font-semibold text-slate-600">{item.staffPackLabel || '—'}</td>
                <td className="px-3 py-2 font-semibold text-slate-600">{item.reason}</td>
                <td className={`px-3 py-2 text-right font-black ${directionClass(directionFromValue(item.variance))}`}>
                  {contributorValue(item, metric, canViewMoney)}
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-sm font-semibold text-slate-500">
                  {contributors.length
                    ? 'No employees match this search or staff filter.'
                    : 'No employee-level contributors were available for this metric.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

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
  const [activeMetricKey, setActiveMetricKey] = useState<PayrollMomMetricKey | null>(null);
  if (!mom) return null;
  const activeMetric = activeMetricKey ? mom.metrics.find((metric) => metric.key === activeMetricKey) || null : null;
  const activeDetail = activeMetric?.detail || null;
  const canOpenDetail = (metric: PayrollMomMetric) => Boolean(metric.detail);

  return (
    <>
      <section className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Month-over-month variance</p>
          <h2 className="mt-1 text-sm font-black text-slate-950">
            {packLabel ? `${packLabel} · ` : ''}
            {mom.currentPeriodLabel} vs {mom.previousPeriodLabel || 'prior month'}
          </h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            {mom.available
              ? 'Same schedule only. Click a variance or change value to see drivers across all staff groups.'
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
                  const clickable = canOpenDetail(metric);
                  return (
                    <tr key={metric.key} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-bold text-slate-900">{metric.label}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-600">{previousValue}</td>
                      <td className="px-4 py-3 text-right font-black text-slate-950">{currentValue}</td>
                      <td className={`px-4 py-3 text-right font-black ${directionClass(metric.direction)}`}>
                        {clickable ? (
                          <button
                            type="button"
                            onClick={() => setActiveMetricKey(metric.key)}
                            className="inline-flex items-center justify-end gap-1 rounded-md px-2 py-1 transition hover:bg-slate-100"
                          >
                            <Icon className="h-3.5 w-3.5" aria-hidden />
                            {varianceValue}
                          </button>
                        ) : (
                          <span className="inline-flex items-center justify-end gap-1">
                            <Icon className="h-3.5 w-3.5" aria-hidden />
                            {varianceValue}
                          </span>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-right font-black ${directionClass(metric.direction)}`}>
                        {clickable ? (
                          <button
                            type="button"
                            onClick={() => setActiveMetricKey(metric.key)}
                            className="rounded-md px-2 py-1 transition hover:bg-slate-100"
                          >
                            {pct(metric.pctChange)}
                          </button>
                        ) : (
                          pct(metric.pctChange)
                        )}
                      </td>
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

      {activeMetric && activeDetail ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 p-3 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`${activeMetric.label} variance details`}
          onClick={() => setActiveMetricKey(null)}
        >
          <div
            className="my-3 flex max-h-[calc(100vh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:my-0 sm:max-h-[85vh]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Variance details</p>
                <h3 className="mt-1 text-base font-black text-slate-950">
                  {activeMetric.label} · {packLabel ? `${packLabel} · ` : ''}
                  {mom.currentPeriodLabel} vs {mom.previousPeriodLabel}
                </h3>
                <p className="mt-1 text-sm font-semibold text-slate-500">{activeDetail.summary}</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveMetricKey(null)}
                className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
              <div className="grid gap-5 lg:grid-cols-[1.1fr,1.9fr]">
                <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-black uppercase tracking-wide text-slate-500">Summary</p>
                  <div className="mt-3 space-y-2 text-sm font-semibold text-slate-700">
                    <div className="flex items-center justify-between gap-3">
                      <span>{mom.previousPeriodLabel}</span>
                      <span className="font-black text-slate-900">{detailTotalValue(activeMetric.previous, activeMetric, canViewMoney)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>{mom.currentPeriodLabel}</span>
                      <span className="font-black text-slate-900">{detailTotalValue(activeMetric.current, activeMetric, canViewMoney)}</span>
                    </div>
                    <div className={`flex items-center justify-between gap-3 ${directionClass(activeMetric.direction)}`}>
                      <span>Variance</span>
                      <span className="font-black">{activeMetric.kind === 'count' ? signedCount(activeMetric.variance) : signedMoney(activeMetric.variance, canViewMoney)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Change</span>
                      <span className={`font-black ${directionClass(activeMetric.direction)}`}>{pct(activeMetric.pctChange)}</span>
                    </div>
                  </div>

                  <div className="mt-5">
                    <p className="text-xs font-black uppercase tracking-wide text-slate-500">Drivers</p>
                    <div className="mt-3 space-y-2">
                      {activeDetail.buckets.length ? activeDetail.buckets.map((bucket) => (
                        <div key={bucket.id} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm">
                          <span className="font-semibold text-slate-700">{bucket.label}</span>
                          <span className={`font-black ${directionClass(directionFromValue(bucket.value))}`}>
                            {bucketValue(bucket, canViewMoney)}
                          </span>
                        </div>
                      )) : (
                        <p className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-500">No detailed drivers available for this metric yet.</p>
                      )}
                      {activeMetric.kind === 'money' && activeDetail.buckets.length ? (
                        <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                          <span className="font-black text-slate-800">Drivers total</span>
                          <span className={`font-black ${directionClass(activeMetric.direction)}`}>
                            {signedMoney(activeDetail.buckets.reduce((sum, bucket) => sum + bucket.value, 0), canViewMoney)}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </section>

                <VarianceContributorsPanel
                  metric={activeMetric}
                  contributors={activeDetail.contributors}
                  contributorTotal={activeDetail.contributorTotal ?? activeDetail.contributors.length}
                  unchangedCount={activeDetail.unchangedCount || 0}
                  canViewMoney={canViewMoney}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
