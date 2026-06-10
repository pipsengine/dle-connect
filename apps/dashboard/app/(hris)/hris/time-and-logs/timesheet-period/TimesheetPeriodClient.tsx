'use client';

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, CheckCircle2, Clock, Lock, Play, RefreshCcw, Search, Square } from 'lucide-react';
import { PageTemplate } from '@/components/layout/page-template';

type PeriodStatus = 'Open' | 'Closed' | 'Locked';

type TimesheetPeriod = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: PeriodStatus;
  openedAt?: string | null;
  openedBy?: string | null;
  closedAt?: string | null;
  closedBy?: string | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
  totalHeaders: number;
  draftHeaders: number;
  submittedHeaders: number;
  approvedHeaders: number;
  totalEmployees: number;
  totalHours: number;
};

type Payload = {
  generatedAt: string;
  currentPeriodId: string;
  periodRule: {
    description: string;
    startDay: number;
    endDay: number;
  };
  periods: TimesheetPeriod[];
  permissions: {
    actor: string;
    role: string;
    canManagePeriod: boolean;
  };
};

const monthValue = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const currentMonthValue = () => {
  const today = new Date();
  const endMonth = today.getDate() >= 16 ? new Date(today.getFullYear(), today.getMonth() + 1, 1) : today;
  return monthValue(endMonth);
};
const formatDate = (value: string) => new Intl.DateTimeFormat('en', { month: 'short', day: '2-digit', year: 'numeric' }).format(new Date(`${value}T00:00:00`));
const formatDateTime = (value?: string | null) => value ? new Intl.DateTimeFormat('en', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';

export default function TimesheetPeriodClient() {
  const currentMonth = currentMonthValue();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [month, setMonth] = useState(currentMonth);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/hris/time-and-logs/timesheet-period', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json?.status !== 'success') throw new Error(json?.error || 'Unable to load periods');
      setPayload(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load periods');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const updatePeriod = async (action: 'OPEN_PERIOD' | 'CLOSE_PERIOD', periodId?: string) => {
    setSubmitting(true);
    setError(null);
    try {
      const body = periodId
        ? { action, periodId }
        : { action, year: Number(month.slice(0, 4)), month: Number(month.slice(5, 7)) };
      const res = await fetch('/api/hris/time-and-logs/timesheet-period', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || json?.status !== 'success') throw new Error(json?.error || 'Unable to update period');
      setPayload(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update period');
    } finally {
      setSubmitting(false);
    }
  };

  const periods = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!payload || !term) return payload?.periods || [];
    return payload.periods.filter((period) =>
      period.name.toLowerCase().includes(term) ||
      period.startDate.includes(term) ||
      period.endDate.includes(term) ||
      period.status.toLowerCase().includes(term),
    );
  }, [payload, query]);

  const stats = useMemo(() => {
    const all = payload?.periods || [];
    return {
      total: all.length,
      open: all.filter((period) => period.status === 'Open').length,
      closed: all.filter((period) => period.status === 'Closed').length,
      activeHeaders: all.reduce((sum, period) => sum + period.draftHeaders + period.submittedHeaders, 0),
    };
  }, [payload]);

  const selectedPeriodId = `per-${month}`;
  const canOpenSelectedPeriod =
    Boolean(payload?.permissions.canManagePeriod) &&
    selectedPeriodId === payload?.currentPeriodId &&
    !payload?.periods.some((period) => period.id === selectedPeriodId && period.status === 'Open');

  if (loading && !payload) {
    return (
      <PageTemplate
        title="Timesheet Period"
        description="Loading period records..."
        breadcrumbs={[{ label: 'HRIS', href: '/hris' }, { label: 'Time & Logs', href: '/hris/time-and-logs' }, { label: 'Timesheet Period' }]}
      >
        <div className="flex h-96 items-center justify-center"><RefreshCcw className="h-8 w-8 animate-spin text-slate-400" /></div>
      </PageTemplate>
    );
  }

  return (
    <PageTemplate
      title="Timesheet Period"
      description="Manage monthly timesheet periods from the 16th of the previous month to the 15th of the selected month."
      breadcrumbs={[{ label: 'HRIS', href: '/hris' }, { label: 'Time & Logs', href: '/hris/time-and-logs' }, { label: 'Timesheet Period' }]}
      primaryAction={{ label: 'Refresh', onClick: load, icon: RefreshCcw }}
    >
      <div className="space-y-6">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {[
            { label: 'Period Records', value: stats.total, icon: CalendarDays, tone: 'indigo' },
            { label: 'Open Periods', value: stats.open, icon: Clock, tone: 'emerald' },
            { label: 'Closed Periods', value: stats.closed, icon: Lock, tone: 'slate' },
            { label: 'Active Timesheets', value: stats.activeHeaders, icon: CheckCircle2, tone: 'amber' },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className={`rounded-lg bg-${stat.tone}-50 p-2 text-${stat.tone}-600`}><stat.icon className="h-5 w-5" /></div>
                <span className="text-2xl font-black text-slate-900">{stat.value}</span>
              </div>
              <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-slate-400">{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-black uppercase tracking-widest text-slate-900">Open New Period</h2>
              <p className="mt-1 text-xs font-semibold text-slate-500">{payload?.periodRule.description}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="month"
                value={month}
                max={currentMonth}
                onChange={(e) => setMonth(e.target.value)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-900 focus:border-indigo-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => updatePeriod('OPEN_PERIOD')}
                disabled={submitting || !canOpenSelectedPeriod}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <Play className="h-3.5 w-3.5" /> Open Period
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search period, date, or status..."
              className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-4 text-sm font-semibold focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <Link href="/hris/time-and-logs/timesheet-entry" className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black uppercase tracking-widest text-slate-700 hover:bg-slate-50">
            Timesheet Entry
          </Link>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Period', 'Date Range', 'Status', 'Timesheets', 'Hours', 'Last Action', 'Actions'].map((header) => (
                    <th key={header} className="px-5 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {periods.map((period) => {
                  const isCurrentPeriod = period.id === payload?.currentPeriodId;
                  const canManagePeriod = Boolean(payload?.permissions.canManagePeriod);
                  const canClosePeriod = canManagePeriod && isCurrentPeriod && period.status === 'Open';
                  const canOpenPeriod = canManagePeriod && isCurrentPeriod && period.status === 'Closed';
                  const isHistoricalClosed = !isCurrentPeriod && period.status === 'Closed';

                  return (
                  <tr key={period.id} className={isHistoricalClosed ? 'bg-slate-50/50' : 'hover:bg-slate-50/70'}>
                    <td className="px-5 py-4">
                      <div className="font-black text-slate-900">{period.name}</div>
                      <div className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">{period.id}</div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-bold text-slate-700">{formatDate(period.startDate)}</div>
                      <div className="text-xs font-semibold text-slate-400">to {formatDate(period.endDate)}</div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${
                        period.status === 'Open' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' :
                        period.status === 'Locked' ? 'border-red-200 bg-red-50 text-red-700' :
                        'border-slate-200 bg-slate-100 text-slate-600'
                      }`}>
                        {period.status === 'Open' ? <Clock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                        {period.status}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-black text-slate-900">{period.totalHeaders}</div>
                      <div className="text-[10px] font-bold uppercase tracking-tight text-slate-400">{period.draftHeaders} draft / {period.submittedHeaders} review / {period.approvedHeaders} approved</div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-black tabular-nums text-slate-900">{period.totalHours}h</div>
                      <div className="text-[10px] font-bold uppercase tracking-tight text-slate-400">{period.totalEmployees} lines</div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-bold text-slate-700">{formatDateTime(period.updatedAt)}</div>
                      <div className="text-[10px] font-bold uppercase tracking-tight text-slate-400">{period.updatedBy || 'System'}</div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        {period.status === 'Open' ? (
                          <button
                            type="button"
                            onClick={() => updatePeriod('CLOSE_PERIOD', period.id)}
                            disabled={submitting || !canClosePeriod}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            <Square className="h-3 w-3" /> Close
                          </button>
                        ) : canOpenPeriod ? (
                          <button
                            type="button"
                            onClick={() => updatePeriod('OPEN_PERIOD', period.id)}
                            disabled={submitting}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            <Play className="h-3 w-3" /> Open
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400"
                          >
                            <Lock className="h-3 w-3" /> Read Only
                          </button>
                        )}
                        <Link href={`/hris/time-and-logs/timesheet-entry?date=${period.endDate}`} className="rounded-lg bg-slate-900 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-slate-800">
                          View
                        </Link>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </PageTemplate>
  );
}
