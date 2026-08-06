'use client';

import { useEffect, useMemo, useState } from 'react';
import { ScrollTable } from '@/components/ui/responsive';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock3,
  RefreshCcw,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { CashAdvanceControlsWorkspace } from '@/lib/finance-intelligence/payment-requests-service';

type Props = {
  initialWorkspace: CashAdvanceControlsWorkspace;
};

const money = (value: number, currency = 'NGN') =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

const fmtDateTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function CashAdvanceControlsClient({ initialWorkspace }: Props) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [waiverReason, setWaiverReason] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [selectedRequestId, setSelectedRequestId] = useState('');

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/finance/payment-requests?view=cash-advance-controls', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to refresh controls.');
      setWorkspace(json.data as CashAdvanceControlsWorkspace);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to refresh controls.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedRequestId && workspace.outstanding[0]) {
      setSelectedRequestId(workspace.outstanding[0].requestId);
      setEmployeeCode(workspace.outstanding[0].beneficiaryCode || workspace.outstanding[0].requesterCode);
    }
  }, [workspace.outstanding, selectedRequestId]);

  const selected = useMemo(
    () => workspace.outstanding.find((row) => row.requestId === selectedRequestId) || null,
    [workspace.outstanding, selectedRequestId],
  );

  const grantWaiver = async () => {
    setBusy(true);
    setToast('');
    setError('');
    try {
      const res = await fetch('/api/finance/payment-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'grant-cash-advance-waiver',
          employeeCode: employeeCode || selected?.beneficiaryCode || selected?.requesterCode,
          reason: waiverReason,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to grant waiver.');
      if (json.data.workspace) setWorkspace(json.data.workspace as CashAdvanceControlsWorkspace);
      else await refresh();
      setWaiverReason('');
      setToast(json.data.message || 'Waiver granted.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to grant waiver.');
    } finally {
      setBusy(false);
    }
  };

  const cancelOutstanding = async () => {
    if (!selectedRequestId) {
      setError('Select an outstanding cash advance first.');
      return;
    }
    if (!window.confirm('Cancel this outstanding cash advance and remove the retirement requirement?')) return;
    setBusy(true);
    setToast('');
    setError('');
    try {
      const res = await fetch('/api/finance/payment-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cancel-outstanding-cash-advance',
          requestId: selectedRequestId,
          reason: cancelReason,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to cancel request.');
      if (json.data.workspace) setWorkspace(json.data.workspace as CashAdvanceControlsWorkspace);
      else await refresh();
      setCancelReason('');
      setSelectedRequestId('');
      setToast(json.data.message || 'Outstanding advance cancelled.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to cancel request.');
    } finally {
      setBusy(false);
    }
  };

  const kpis = [
    { label: 'Outstanding advances', value: workspace.summary.outstandingCount, icon: Clock3, wrap: 'bg-orange-50', color: 'text-orange-600' },
    { label: 'Awaiting retirement', value: workspace.summary.awaitingRetirement, icon: AlertTriangle, wrap: 'bg-amber-50', color: 'text-amber-700' },
    { label: 'Blocked employees', value: workspace.summary.blockedEmployees, icon: Users, wrap: 'bg-rose-50', color: 'text-rose-600' },
    { label: 'Active CFO waivers', value: workspace.summary.activeWaivers, icon: ShieldCheck, wrap: 'bg-emerald-50', color: 'text-emerald-600' },
  ];

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">Cash Advance Controls</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            CFO / Finance only. Cancel an outstanding advance when retirement is no longer required, or grant a one-time waiver so the employee can raise a new request.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-700"
        >
          <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </header>

      {toast ? <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{toast}</div> : null}
      {error ? <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((card) => (
          <article key={card.label} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{card.label}</p>
              <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl ${card.wrap}`}>
                <card.icon className={`h-4 w-4 ${card.color}`} />
              </span>
            </div>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">{card.value}</p>
          </article>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Outstanding cash advances</h2>
          </div>
          <ScrollTable minWidth={960}><table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  {['Select', 'Request', 'Employee', 'Title', 'Amount', 'Site', 'Status', 'Updated'].map((column) => (
                    <th key={column} className="px-3 py-2.5 font-semibold">{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {workspace.outstanding.length ? workspace.outstanding.map((row) => (
                  <tr key={row.requestId} className={`border-t border-slate-100 ${selectedRequestId === row.requestId ? 'bg-[#F0F9FF]' : ''}`}>
                    <td className="px-3 py-2.5">
                      <input
                        type="radio"
                        name="outstanding"
                        checked={selectedRequestId === row.requestId}
                        onChange={() => {
                          setSelectedRequestId(row.requestId);
                          setEmployeeCode(row.beneficiaryCode || row.requesterCode);
                        }}
                        className="text-[#008FD5]"
                      />
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-slate-800">{row.requestNumber}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-slate-800">{row.beneficiaryName || row.requesterName}</div>
                      <div className="text-slate-500">{row.beneficiaryCode || row.requesterCode}</div>
                    </td>
                    <td className="px-3 py-2.5">{row.title}</td>
                    <td className="px-3 py-2.5 tabular-nums">{money(row.netAmount, row.currencyCode || 'NGN')}</td>
                    <td className="px-3 py-2.5">{row.paymentSiteCode || row.companyCode || '—'}</td>
                    <td className="px-3 py-2.5">{row.status}</td>
                    <td className="px-3 py-2.5">{fmtDateTime(row.updatedAt || row.submittedAt)}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={8} className="px-3 py-12 text-center text-slate-500">
                      No outstanding cash advances. Requesters can raise new advances without a waiver.
                    </td>
                  </tr>
                )}
              </tbody>
            </table></ScrollTable>
        </section>

        <div className="space-y-4">
          <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Ban className="h-4 w-4 text-rose-600" /> Cancel previous (retirement not required)
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Use when the prior advance should no longer block the employee and retirement is not required.
            </p>
            <label className="mt-3 block text-sm">
              <span className="mb-1 block font-medium text-slate-700">CFO reason *</span>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
                placeholder="Explain why retirement is being cancelled…"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              />
            </label>
            <button
              type="button"
              disabled={busy || !selectedRequestId || cancelReason.trim().length < 10}
              onClick={() => void cancelOutstanding()}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-3.5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              Cancel selected outstanding advance
            </button>
          </section>

          <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
              <ShieldCheck className="h-4 w-4 text-emerald-600" /> Grant one-time waiver
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Keeps the old advance outstanding, but allows one new cash advance request for the employee.
            </p>
            <label className="mt-3 block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Employee code *</span>
              <input
                value={employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              />
            </label>
            <label className="mt-3 block text-sm">
              <span className="mb-1 block font-medium text-slate-700">CFO reason *</span>
              <textarea
                value={waiverReason}
                onChange={(e) => setWaiverReason(e.target.value)}
                rows={3}
                placeholder="Explain why a new advance is allowed…"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              />
            </label>
            <button
              type="button"
              disabled={busy || !employeeCode.trim() || waiverReason.trim().length < 10}
              onClick={() => void grantWaiver()}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#008FD5] px-3.5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              Grant waiver
            </button>
          </section>

          <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <h2 className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Active waivers
            </h2>
            {workspace.activeWaivers.length ? (
              <ul className="space-y-2 text-xs text-slate-600">
                {workspace.activeWaivers.map((waiver) => (
                  <li key={waiver.waiverId} className="rounded-lg bg-slate-50 px-3 py-2">
                    <div className="font-semibold text-slate-800">{waiver.employeeCode} · {waiver.waiverId}</div>
                    <div className="mt-0.5">{waiver.reason}</div>
                    <div className="mt-1 text-slate-400">{waiver.grantedBy} · {fmtDateTime(waiver.createdAt)}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No active waivers.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
