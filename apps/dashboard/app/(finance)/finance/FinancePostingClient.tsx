'use client';

import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Database,
  FileText,
  RefreshCcw,
  UploadCloud,
  X,
} from 'lucide-react';
import type {
  FinancePostingWorkspace,
  PaymentRequestActionRow,
  PaymentRequestRow,
} from '@/lib/finance-intelligence/payment-requests-service';
import PaymentRequestDetailPanel from './PaymentRequestDetailPanel';

type Props = { initialWorkspace: FinancePostingWorkspace };
type TabId = 'ready' | 'posted' | 'notReady' | 'all';

const money = (amount: number, currency = 'NGN') =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: currency || 'NGN', maximumFractionDigits: 0 }).format(amount || 0);

export default function FinancePostingClient({ initialWorkspace }: Props) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [tab, setTab] = useState<TabId>('ready');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [selected, setSelected] = useState<PaymentRequestRow | null>(null);
  const [actions, setActions] = useState<PaymentRequestActionRow[]>([]);
  const [sageReference, setSageReference] = useState('');
  const [comment, setComment] = useState('');

  const refresh = async () => {
    setLoading(true);
    setToast('');
    try {
      const res = await fetch('/api/finance/payment-requests?view=sage-posting', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Refresh failed');
      setWorkspace(json.data as FinancePostingWorkspace);
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Refresh failed');
    } finally {
      setLoading(false);
    }
  };

  const openDetail = async (row: PaymentRequestRow) => {
    setSelected(row);
    setSageReference(row.sageReference || '');
    setComment('');
    setActions([]);
    try {
      const res = await fetch(`/api/finance/payment-requests?requestId=${encodeURIComponent(row.requestId)}`, { cache: 'no-store' });
      const json = await res.json();
      if (res.ok && json.status === 'success') {
        setSelected(json.data.request as PaymentRequestRow);
        setActions(json.data.actions || []);
      }
    } catch {
      // keep list row
    }
  };

  const runTransition = async (transition: string) => {
    if (!selected) return;
    setBusy(true);
    setToast('');
    try {
      const res = await fetch('/api/finance/payment-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'transition',
          transition,
          requestId: selected.requestId,
          sageReference: sageReference || undefined,
          comment: comment || undefined,
          reason: comment || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Action failed');
      setToast(json.data.message || 'Updated.');
      setActions(json.data.actions || []);
      if (json.data.request) setSelected(json.data.request as PaymentRequestRow);
      await refresh();
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const rows = useMemo(() => {
    if (tab === 'ready') return workspace.readyToPost;
    if (tab === 'posted') return workspace.posted;
    if (tab === 'notReady') return workspace.notReady;
    return workspace.rows;
  }, [tab, workspace]);

  const kpis = [
    { label: 'Ready to post', value: String(workspace.summary.readyToPost), detail: money(workspace.summary.readyValue), icon: UploadCloud, wrap: 'bg-sky-50', color: 'text-sky-600' },
    { label: 'Posted', value: String(workspace.summary.posted), detail: 'Acknowledged in Connect', icon: CheckCircle2, wrap: 'bg-emerald-50', color: 'text-emerald-600' },
    { label: 'Not ready / failed', value: String(workspace.summary.notReady), detail: `${workspace.summary.failed} failed`, icon: Database, wrap: 'bg-amber-50', color: 'text-amber-600' },
    { label: 'With documents', value: String(workspace.summary.withDocuments), detail: 'Supporting files present', icon: FileText, wrap: 'bg-violet-50', color: 'text-violet-600' },
  ];

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">Finance Posting Desk</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Review approved and paid payments due for Sage posting. Open supporting documents, capture the Sage voucher reference, and queue the outbound sync.
          </p>
        </div>
        <button type="button" onClick={() => void refresh()} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600">
          <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {toast ? <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">{toast}</div> : null}

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
            <p className="mt-1 text-xs text-slate-500">{card.detail}</p>
          </article>
        ))}
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex flex-wrap gap-2 border-b border-slate-100 px-4 py-3">
          {([
            ['ready', 'Ready to post', workspace.summary.readyToPost],
            ['posted', 'Posted', workspace.summary.posted],
            ['notReady', 'Not ready', workspace.summary.notReady],
            ['all', 'All bookable', workspace.rows.length],
          ] as const).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === id ? 'bg-[#EAF6FF] text-[#008FD5]' : 'text-slate-500 hover:text-slate-800'}`}
            >
              {label} ({count})
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                {['Request', 'Type', 'Beneficiary', 'Amount', 'Payment status', 'Posting', 'Docs', ''].map((column) => (
                  <th key={column || 'actions'} className="px-3 py-2.5 font-semibold">{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length ? rows.map((row) => (
                <tr key={row.requestId} className="border-t border-slate-100">
                  <td className="px-3 py-2.5 font-semibold text-slate-800">{row.requestNumber}</td>
                  <td className="px-3 py-2.5">{row.paymentType.replace(' Payment', '')}</td>
                  <td className="px-3 py-2.5">{row.beneficiaryName}</td>
                  <td className="px-3 py-2.5 tabular-nums">{money(row.netAmount, row.currencyCode)}</td>
                  <td className="px-3 py-2.5">{row.status}</td>
                  <td className="px-3 py-2.5">{row.postingStatus}</td>
                  <td className="px-3 py-2.5">{row.attachments?.length || 0}</td>
                  <td className="px-3 py-2.5">
                    <button type="button" onClick={() => void openDetail(row)} className="font-semibold text-[#008FD5]">Open</button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={8} className="px-3 py-12 text-center text-sm text-slate-500">No payments in this queue.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selected ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4">
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-900">Sage posting</h2>
              <button type="button" onClick={() => setSelected(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <PaymentRequestDetailPanel
                request={selected}
                actions={actions}
                footer={(
                  <div className="space-y-3">
                    {selected.postingStatus !== 'Posted' ? (
                      <>
                        <label className="block text-sm">
                          <span className="mb-1 block font-medium">Sage voucher / document # *</span>
                          <input value={sageReference} onChange={(e) => setSageReference(e.target.value)} placeholder="e.g. PAY-2026-00123" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                        </label>
                        <label className="block text-sm">
                          <span className="mb-1 block font-medium">Notes</span>
                          <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Optional posting note" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {selected.postingStatus === 'NotReady' ? (
                            <button type="button" disabled={busy} onClick={() => void runTransition('ready-to-post')} className="rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60">
                              Mark ready to post
                            </button>
                          ) : null}
                          <button type="button" disabled={busy} onClick={() => void runTransition('mark-posted')} className="inline-flex items-center gap-1.5 rounded-xl bg-[#008FD5] px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-60">
                            <UploadCloud className="h-4 w-4" /> Mark posted & queue Sage sync
                          </button>
                        </div>
                      </>
                    ) : (
                      <p className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                        Posted · {selected.sageReference || '—'} · {selected.postedBy || '—'}
                      </p>
                    )}
                  </div>
                )}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
