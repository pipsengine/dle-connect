'use client';

/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CalendarDays,
  RefreshCcw,
  ShieldCheck,
} from 'lucide-react';
import { PageTemplate } from '@/components/layout/page-template';
import type { MissingTimesheetDay } from '@/lib/timesheet-recapture-shared';
import { TIMESHEET_RECAPTURE_GUIDE } from '@/lib/timesheet-recapture-shared';

type RecapturePayload = {
  generatedAt: string;
  from: string;
  to: string;
  period: { id: string; name: string; status: string };
  permissions: { actor: string; role: string; canRecapture: boolean };
  gate: { allowed: boolean; periodCode: string; message: string };
  missingDays: MissingTimesheetDay[];
  missingDayCount: number;
  recaptureGuide: typeof TIMESHEET_RECAPTURE_GUIDE;
};

const today = new Date().toISOString().slice(0, 10);
const monthStart = `${today.slice(0, 8)}01`;
const formatStatus = (status: string) => status.replace(/_/g, ' ');

export default function TimesheetRecaptureClient() {
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [payload, setPayload] = useState<RecapturePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(true);
  const [recaptureBusyId, setRecaptureBusyId] = useState<string | null>(null);
  const [recaptureReason, setRecaptureReason] = useState('Omitted / incomplete day — reopen for recapture.');

  const requestUrl = useMemo(() => {
    const params = new URLSearchParams({ from, to });
    return `/api/hris/time-and-logs/timesheet-recapture?${params.toString()}`;
  }, [from, to]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(requestUrl, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to load timesheet recapture workspace');
      setPayload(json.data as RecapturePayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load timesheet recapture workspace');
    } finally {
      setLoading(false);
    }
  }, [requestUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  const openTimesheetEntry = (gap: MissingTimesheetDay) => {
    const params = new URLSearchParams();
    if (gap.headerId) params.set('headerId', gap.headerId);
    params.set('date', gap.date);
    if (gap.supervisorId) params.set('supervisorId', gap.supervisorId);
    if (gap.workCenterName) params.set('workCenterName', gap.workCenterName);
    window.location.href = `/hris/workforce-management/timesheet-entry?${params.toString()}`;
  };

  const reopenForRecapture = async (gap: MissingTimesheetDay) => {
    if (!gap.headerId) {
      setError('No timesheet header found for this day. Open Timesheet Entry and sync attendance for that date/crew first.');
      return;
    }
    if (!gap.recaptureAllowed) {
      setError(gap.blockReason || 'Recapture is blocked for this day.');
      return;
    }
    const reason = recaptureReason.trim() || 'Omitted / incomplete day — reopen for recapture.';
    setRecaptureBusyId(gap.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/hris/time-and-logs/timesheet-entry', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'RECAPTURE_REOPEN',
          headerId: gap.headerId,
          recaptureReason: reason,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to reopen timesheet for recapture');
      const message = json.data?.recapture?.message || 'Timesheet returned for recapture.';
      const entryUrl = (json.data?.recapture?.entryUrl as string | undefined)?.replace(
        '/hris/time-and-logs/timesheet-entry',
        '/hris/workforce-management/timesheet-entry',
      );
      setNotice(message);
      await load();
      if (entryUrl && window.confirm(`${message}\n\nOpen Timesheet Entry now?`)) {
        window.location.href = entryUrl;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reopen timesheet for recapture');
    } finally {
      setRecaptureBusyId(null);
    }
  };

  const guide = payload?.recaptureGuide || TIMESHEET_RECAPTURE_GUIDE;
  const gaps = payload?.missingDays || [];

  return (
    <PageTemplate
      title="Timesheet Recapture"
      description="Find omitted or incomplete days and reopen sheets for correction before payroll submit."
      breadcrumbs={[
        { label: 'HRIS', href: '/hris' },
        { label: 'Workforce Management', href: '/hris/workforce-management' },
        { label: 'Timesheet Recapture' },
      ]}
      primaryAction={{ label: loading ? 'Refreshing' : 'Refresh', onClick: load, icon: RefreshCcw }}
      secondaryAction={{
        label: 'Back to Reports',
        onClick: () => { window.location.href = '/hris/workforce-management/timesheet-reports'; },
        icon: ArrowLeft,
      }}
    >
      <div className="space-y-5">
        {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}
        {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{notice}</div> : null}

        {!payload?.gate?.allowed ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-black">Recapture blocked for this payroll period</p>
                <p className="mt-1 font-semibold">{payload?.gate?.message || 'Payroll has been submitted for approval.'}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
            {payload?.gate?.message || 'Recapture is allowed — no payroll run for this period has been submitted for approval.'}
          </div>
        )}

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto]">
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">From</span>
              <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-xs font-bold text-slate-700 outline-none focus:border-blue-600" />
            </label>
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">To</span>
              <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-xs font-bold text-slate-700 outline-none focus:border-blue-600" />
            </label>
            <button type="button" onClick={() => void load()} className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-xs font-black text-white hover:bg-blue-700">
              <CalendarDays className="h-4 w-4" />
              Load missing days
            </button>
          </div>
          <p className="mt-3 text-xs font-semibold text-slate-500">
            Period: {payload?.period?.name || '—'} · Status: {payload?.period?.status || '—'} · Gaps: {payload?.missingDayCount ?? 0}
          </p>
        </div>

        <section className="rounded-lg border border-amber-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-100 px-4 py-3">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-amber-50 p-2 text-amber-700"><BookOpen className="h-4 w-4" /></div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Standard Recapture</p>
                <h2 className="text-sm font-black text-slate-950">{guide.title}</h2>
                <p className="mt-1 text-xs font-semibold text-slate-600">{guide.summary}</p>
              </div>
            </div>
            <button type="button" onClick={() => setShowGuide((value) => !value)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50">
              {showGuide ? 'Hide guide' : 'Show guide'}
            </button>
          </div>

          {showGuide ? (
            <div className="grid gap-4 border-b border-amber-50 px-4 py-4 lg:grid-cols-[1.4fr_1fr]">
              <ol className="space-y-3">
                {guide.steps.map((step) => (
                  <li key={step.title} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-xs font-black text-slate-900">{step.title}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-600">{step.detail}</p>
                  </li>
                ))}
              </ol>
              <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Rules</p>
                <ul className="mt-2 space-y-2">
                  {guide.rules.map((rule) => (
                    <li key={rule} className="flex gap-2 text-xs font-semibold text-slate-600">
                      <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                      <span>{rule}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 border-t border-slate-100 pt-3">
                  <Link href="/hris/workforce-management/timesheet-entry" className="text-xs font-black text-blue-700 hover:underline">
                    Open Timesheet Entry →
                  </Link>
                </div>
              </div>
            </div>
          ) : null}

          <div className="px-4 py-4">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Missing / Incomplete Days</p>
                <p className="text-xs font-semibold text-slate-600">
                  Employees already active in this range with Mon–Sat dates that have no payable day. Reopen returns the sheet for correction; then capture and re-submit.
                </p>
              </div>
              <label className="block min-w-[280px]">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Recapture reason</span>
                <input
                  value={recaptureReason}
                  onChange={(event) => setRecaptureReason(event.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-xs font-bold text-slate-700 outline-none focus:border-blue-600"
                  placeholder="Why is this day being recaptured?"
                />
              </label>
            </div>
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="min-w-[1100px] w-full text-left text-sm">
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Employee</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Issue</th>
                    <th className="px-3 py-2">Sheet Status</th>
                    <th className="px-3 py-2">Crew</th>
                    <th className="px-3 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {gaps.slice(0, 200).map((gap) => (
                    <tr key={gap.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2">
                        <div className="font-black text-slate-900">{gap.employeeName}</div>
                        <div className="text-[11px] font-bold text-slate-500">{gap.employeeNo}</div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-bold">{gap.date}</div>
                        <div className="text-[11px] font-semibold text-slate-500">{gap.weekday}</div>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded-md px-2 py-1 text-[10px] font-black ${
                          gap.reason === 'needs-reopen' ? 'bg-amber-50 text-amber-800'
                            : gap.reason === 'editable-incomplete' ? 'bg-blue-50 text-blue-800'
                              : 'bg-slate-100 text-slate-700'
                        }`}>
                          {gap.reason === 'needs-reopen' ? 'Needs reopen' : gap.reason === 'editable-incomplete' ? 'Editable incomplete' : 'No entry'}
                        </span>
                        {!gap.recaptureAllowed && gap.blockReason ? (
                          <div className="mt-1 max-w-[280px] text-[11px] font-semibold text-red-600">{gap.blockReason}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 font-bold text-slate-700">{gap.headerStatus ? formatStatus(gap.headerStatus) : '—'}</td>
                      <td className="px-3 py-2">
                        <div className="font-bold text-slate-800">{gap.supervisorName || '—'}</div>
                        <div className="text-[11px] font-semibold text-slate-500">{gap.workCenterName || 'No work centre'}</div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex flex-wrap justify-end gap-2">
                          {gap.suggestedAction === 'reopen' ? (
                            <button
                              type="button"
                              disabled={!gap.recaptureAllowed || recaptureBusyId === gap.id || !gap.headerId}
                              onClick={() => void reopenForRecapture(gap)}
                              className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-black text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                            >
                              {recaptureBusyId === gap.id ? 'Reopening…' : 'Recapture reopen'}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            disabled={gap.suggestedAction === 'blocked' && !gap.headerId}
                            onClick={() => openTimesheetEntry(gap)}
                            className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            {gap.suggestedAction === 'continue-edit' ? 'Continue edit' : 'Open entry'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!loading && !gaps.length ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-sm font-bold text-slate-400">
                        No missing Mon–Sat days detected for employees active in this range.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            {(payload?.missingDayCount || 0) > 200 ? (
              <p className="mt-2 text-xs font-semibold text-slate-500">Showing first 200 of {payload?.missingDayCount} gaps. Narrow the date range to focus.</p>
            ) : null}
          </div>
        </section>
      </div>
    </PageTemplate>
  );
}
