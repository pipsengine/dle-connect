'use client';

/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileSpreadsheet,
  RefreshCcw,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { PageTemplate } from '@/components/layout/page-template';

type ReconcileStatus = 'Match' | 'Excel higher' | 'Excel lower' | 'Excel only' | 'Not in Excel' | 'Cannot pay';

type ReconcileRow = {
  employeeCode: string;
  employeeName: string;
  company: string;
  directoryName: string | null;
  dailyRate: number;
  excelDailyRate: number;
  excelWeekdayDays: number;
  systemDays: number;
  excelBookedHours: number;
  systemHours: number;
  weekdayOvtHours: number;
  saturdayHours: number;
  sundayHours: number;
  publicHolidayHours: number;
  nightDays: number;
  nightAmt: number;
  siteAllowance: number;
  tcmMeal: number;
  tcmTransport: number;
  transport: number;
  arrears: number;
  status: ReconcileStatus;
  payable: boolean;
  note: string | null;
};

type ReconcileSummary = {
  excelEmployees: number;
  payable: number;
  blocked: number;
  excelOnly: number;
  notInExcel: number;
  mismatched: number;
  matched: number;
};

type Payload = {
  generatedAt: string;
  period: string;
  periods: Array<{ period: string; periodLabel: string; status: string }>;
  permissions: { actor: string; role: string; canApply: boolean };
  applied: {
    period: string;
    fileName: string;
    title: string;
    appliedAt: string;
    appliedBy: string;
    employeeCount: number;
    sheets: Array<{ name: string; company: string; rowCount: number }>;
    skippedCount: number;
  } | null;
  reconcile: { rows: ReconcileRow[]; summary: ReconcileSummary } | null;
  guide: { title: string; points: string[] };
};

const money = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 });
const number = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });

const statusClass = (status: ReconcileStatus) => {
  if (status === 'Cannot pay') return 'bg-red-50 text-red-800 border-red-200';
  if (status === 'Not in Excel') return 'bg-amber-50 text-amber-900 border-amber-200';
  if (status === 'Excel only') return 'bg-blue-50 text-blue-800 border-blue-200';
  if (status === 'Match') return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  return 'bg-violet-50 text-violet-800 border-violet-200';
};

const readFileAsBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Unable to read the workbook.'));
    reader.readAsDataURL(file);
  });

export default function DayrateScheduleReconcileClient() {
  const [period, setPeriod] = useState('');
  const [payload, setPayload] = useState<Payload | null>(null);
  const [reconcile, setReconcile] = useState<{ rows: ReconcileRow[]; summary: ReconcileSummary } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | ReconcileStatus>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (nextPeriod?: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (nextPeriod) params.set('period', nextPeriod);
      const res = await fetch(`/api/hris/time-and-logs/dayrate-schedule-reconcile?${params.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to load dayrate schedule workspace');
      const data = json.data as Payload;
      setPayload(data);
      setPeriod(data.period);
      setReconcile(data.reconcile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load dayrate schedule workspace');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const postWorkbook = async (action: 'preview' | 'apply') => {
    if (!file) {
      setError('Choose the Dayrate Payment Schedule .xlsx file first.');
      return;
    }
    if (!period) {
      setError('Choose a payroll period.');
      return;
    }
    setBusy(action);
    setError(null);
    setNotice(null);
    try {
      const fileBase64 = await readFileAsBase64(file);
      const res = await fetch('/api/hris/time-and-logs/dayrate-schedule-reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, period, fileName: file.name, fileBase64 }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || `Unable to ${action} workbook`);
      setReconcile(json.data.reconcile);
      if (action === 'apply') {
        setPayload((current) => current ? { ...current, applied: json.data.applied, reconcile: json.data.reconcile } : current);
        setNotice(`Applied ${file.name} to ${period} payroll. C-code days, OT, weekend, night, site, TCM, transport, and arrears now follow Excel. Day timesheets were not changed.`);
      } else {
        setNotice(`Previewed ${file.name}. Review the grid, then apply to payroll if it is correct.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Unable to ${action} workbook`);
    } finally {
      setBusy('');
    }
  };

  const clearOverride = async () => {
    if (!period) return;
    if (!window.confirm(`Clear the Excel overlay for ${period}? Daily-rate pay will go back to booked timesheets.`)) return;
    setBusy('clear');
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/hris/time-and-logs/dayrate-schedule-reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear', period }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to clear overlay');
      setReconcile(null);
      setPayload((current) => current ? { ...current, applied: null, reconcile: null } : current);
      setNotice(`Cleared the Excel overlay for ${period}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to clear overlay');
    } finally {
      setBusy('');
    }
  };

  const rows = reconcile?.rows || [];
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (!needle) return true;
      return [row.employeeCode, row.employeeName, row.directoryName, row.company, row.note]
        .some((value) => String(value || '').toLowerCase().includes(needle));
    });
  }, [query, rows, statusFilter]);

  const summary = reconcile?.summary;
  const canApply = Boolean(payload?.permissions.canApply);

  return (
    <PageTemplate
      title="Dayrate Payment Schedule"
      description="Upload HR’s official DLE / DLPC dayrate workbook and apply it to payroll for the selected period. Excel is the source of truth. Day timesheets are not rewritten."
      breadcrumbs={[
        { label: 'HRIS', href: '/hris' },
        { label: 'Workforce Management', href: '/hris/workforce-management' },
        { label: 'Dayrate Payment Schedule' },
      ]}
      primaryAction={{ label: loading ? 'Refreshing' : 'Refresh', onClick: () => void load(period), icon: RefreshCcw }}
      secondaryAction={{
        label: 'Back to Reports',
        onClick: () => { window.location.href = '/hris/workforce-management/timesheet-reports'; },
        icon: ArrowLeft,
      }}
    >
      <div className="space-y-5">
        {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}
        {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{notice}</div> : null}

        {payload?.applied ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
            <div className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-black">Excel overlay is active for {payload.applied.period}</p>
                <p className="mt-1 font-semibold">
                  {payload.applied.fileName} · {payload.applied.employeeCount} C-codes · applied by {payload.applied.appliedBy} on {new Date(payload.applied.appliedAt).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="font-semibold">No Excel overlay for this period. Daily-rate pay still follows booked timesheets until HR uploads and applies the schedule.</p>
            </div>
          </div>
        )}

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[180px_1fr_auto]">
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Payroll period</span>
              <select
                value={period}
                onChange={(event) => {
                  const next = event.target.value;
                  setPeriod(next);
                  setReconcile(null);
                  void load(next);
                }}
                className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-xs font-bold text-slate-700 outline-none focus:border-blue-600"
              >
                {(payload?.periods || []).map((item) => (
                  <option key={item.period} value={item.period}>{item.periodLabel} ({item.status})</option>
                ))}
                {payload?.periods.some((item) => item.period === period) ? null : period ? <option value={period}>{period}</option> : null}
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Dayrate Payment Schedule (.xlsx)</span>
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
                className="mt-1 block w-full text-xs font-bold text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-[10px] file:font-black file:uppercase file:tracking-widest file:text-white"
              />
            </label>
            <div className="flex flex-wrap items-end gap-2">
              <button type="button" disabled={Boolean(busy) || !file} onClick={() => void postWorkbook('preview')} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-xs font-black text-slate-800 hover:bg-slate-50 disabled:opacity-50">
                <FileSpreadsheet className="h-4 w-4" />
                {busy === 'preview' ? 'Reading' : 'Preview'}
              </button>
              <button type="button" disabled={Boolean(busy) || !file || !canApply} onClick={() => void postWorkbook('apply')} className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-4 text-xs font-black text-white hover:bg-blue-700 disabled:opacity-50">
                <Upload className="h-4 w-4" />
                {busy === 'apply' ? 'Applying' : 'Apply Excel to payroll'}
              </button>
            </div>
          </div>
          {payload?.applied ? (
            <button type="button" disabled={Boolean(busy) || !canApply} onClick={() => void clearOverride()} className="mt-3 text-xs font-black uppercase tracking-widest text-red-700 hover:underline disabled:opacity-50">
              {busy === 'clear' ? 'Clearing overlay' : 'Clear Excel overlay'}
            </button>
          ) : null}
          {!canApply ? <p className="mt-3 text-xs font-semibold text-slate-500">You can review this page. Applying or clearing the overlay requires HR or Payroll access.</p> : null}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-black text-slate-950">{payload?.guide.title || 'Dayrate Payment Schedule'}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs font-semibold text-slate-600">
            {(payload?.guide.points || []).map((point) => <li key={point}>{point}</li>)}
          </ul>
        </section>

        {summary ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            {[
              ['Excel people', summary.excelEmployees, 'all'],
              ['Payable', summary.payable, 'all'],
              ['Matched', summary.matched, 'Match'],
              ['Excel higher', rows.filter((row) => row.status === 'Excel higher').length, 'Excel higher'],
              ['Excel lower', rows.filter((row) => row.status === 'Excel lower').length, 'Excel lower'],
              ['Excel only', summary.excelOnly, 'Excel only'],
              ['Dropped / blocked', summary.notInExcel + summary.blocked, 'Not in Excel'],
            ].map(([label, value, filter]) => (
              <button
                key={String(label)}
                type="button"
                onClick={() => setStatusFilter(filter === 'all' || filter === statusFilter ? 'all' : filter as ReconcileStatus)}
                className="rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm hover:border-blue-300"
              >
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
                <p className="mt-1 text-xl font-black text-slate-950">{value}</p>
              </button>
            ))}
          </div>
        ) : null}

        {reconcile ? (
          <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div>
                <h2 className="text-sm font-black text-slate-950">Reconcile grid</h2>
                <p className="text-xs font-semibold text-slate-500">{visible.length} of {rows.length} C-codes</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search C-code or name"
                  className="h-9 rounded-md border border-slate-200 px-3 text-xs font-bold text-slate-700 outline-none focus:border-blue-600"
                />
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | ReconcileStatus)} className="h-9 rounded-md border border-slate-200 px-3 text-xs font-bold text-slate-700">
                  <option value="all">All statuses</option>
                  <option value="Cannot pay">Cannot pay</option>
                  <option value="Not in Excel">Not in Excel</option>
                  <option value="Excel only">Excel only</option>
                  <option value="Excel higher">Excel higher</option>
                  <option value="Excel lower">Excel lower</option>
                  <option value="Match">Match</option>
                </select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Code</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Co.</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Excel days</th>
                    <th className="px-3 py-2">System days</th>
                    <th className="px-3 py-2">OT h</th>
                    <th className="px-3 py-2">Sat h</th>
                    <th className="px-3 py-2">Sun h</th>
                    <th className="px-3 py-2">PH h</th>
                    <th className="px-3 py-2">Night</th>
                    <th className="px-3 py-2">Site / TCM / Arr</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr key={`${row.employeeCode}-${row.company}`} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-black text-slate-900">{row.employeeCode}</td>
                      <td className="px-3 py-2 font-semibold text-slate-700">
                        {row.employeeName || row.directoryName || '—'}
                        {row.note ? <p className="mt-0.5 text-[10px] font-semibold text-slate-500">{row.note}</p> : null}
                      </td>
                      <td className="px-3 py-2 font-bold text-slate-600">{row.company || '—'}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black ${statusClass(row.status)}`}>{row.status}</span>
                      </td>
                      <td className="px-3 py-2 font-bold">{number.format(row.excelWeekdayDays)}</td>
                      <td className="px-3 py-2 font-bold">{number.format(row.systemDays)}</td>
                      <td className="px-3 py-2">{number.format(row.weekdayOvtHours)}</td>
                      <td className="px-3 py-2">{number.format(row.saturdayHours)}</td>
                      <td className="px-3 py-2">{number.format(row.sundayHours)}</td>
                      <td className="px-3 py-2">{number.format(row.publicHolidayHours)}</td>
                      <td className="px-3 py-2">{row.nightDays ? `${number.format(row.nightDays)} · ${money.format(row.nightAmt)}` : '—'}</td>
                      <td className="px-3 py-2">
                        {[row.siteAllowance, row.tcmMeal, row.tcmTransport, row.transport, row.arrears].some((value) => value > 0)
                          ? money.format(row.siteAllowance + row.tcmMeal + row.tcmTransport + row.transport + row.arrears)
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!visible.length ? (
              <div className="flex items-center gap-2 px-4 py-8 text-sm font-semibold text-slate-500">
                <CheckCircle2 className="h-4 w-4" />
                No rows match this filter.
              </div>
            ) : null}
          </section>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm font-semibold text-slate-500">
            Upload the Dayrate Payment Schedule workbook and preview it before applying to payroll.
          </div>
        )}
      </div>
    </PageTemplate>
  );
}
