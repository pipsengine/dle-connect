'use client';

import { useMemo, useState } from 'react';
import {
  Banknote,
  CheckCircle2,
  Clock3,
  FileUp,
  RefreshCcw,
  ShieldCheck,
  Wallet,
  X,
} from 'lucide-react';
import type {
  PaymentRequestActionRow,
  PaymentRequestRow,
  TreasuryWorkspace,
} from '@/lib/finance-intelligence/payment-requests-service';
import PaymentRequestDetailPanel from './PaymentRequestDetailPanel';

type Props = { initialWorkspace: TreasuryWorkspace };
type TabId = 'ready' | 'paidToday' | 'awaiting' | 'verify' | 'history';

const money = (amount: number, currency = 'NGN') =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: currency || 'NGN', maximumFractionDigits: 0 }).format(amount || 0);

const fileToBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const result = String(reader.result || '');
    const comma = result.indexOf(',');
    resolve(comma >= 0 ? result.slice(comma + 1) : result);
  };
  reader.onerror = () => reject(new Error(`Unable to read ${file.name}`));
  reader.readAsDataURL(file);
});

export default function TreasuryOperationsClient({ initialWorkspace }: Props) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [tab, setTab] = useState<TabId>('ready');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [modalError, setModalError] = useState('');
  const [selected, setSelected] = useState<PaymentRequestRow | null>(null);
  const [actions, setActions] = useState<PaymentRequestActionRow[]>([]);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [comment, setComment] = useState('');

  const refresh = async () => {
    setLoading(true);
    setToast('');
    try {
      const res = await fetch('/api/finance/payment-requests?view=treasury', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Refresh failed');
      setWorkspace(json.data as TreasuryWorkspace);
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Refresh failed');
    } finally {
      setLoading(false);
    }
  };

  const openDetail = async (row: PaymentRequestRow) => {
    setSelected(row);
    setEvidenceFile(null);
    setComment('');
    setModalError('');
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

  const runTransition = async (transition: string, extra?: Record<string, unknown>) => {
    if (!selected) return;
    setBusy(true);
    setToast('');
    setModalError('');
    try {
      let paymentEvidenceUpload: { fileName: string; mimeType: string; contentBase64: string } | undefined;
      if (transition === 'mark-paid') {
        if (!evidenceFile) {
          throw new Error('Upload payment evidence (bank receipt / transfer proof) before marking paid.');
        }
        paymentEvidenceUpload = {
          fileName: evidenceFile.name,
          mimeType: evidenceFile.type || 'application/octet-stream',
          contentBase64: await fileToBase64(evidenceFile),
        };
      }

      const res = await fetch('/api/finance/payment-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'transition',
          transition,
          requestId: selected.requestId,
          comment: comment || undefined,
          reason: comment || undefined,
          paymentEvidenceUpload,
          ...extra,
        }),
      });
      const json = await res.json().catch(() => ({ status: 'error', error: 'Action failed' }));
      if (!res.ok || json.status !== 'success') throw new Error(json.error || `Action failed (${res.status}).`);
      setToast(json.data.message || 'Updated.');
      setActions(json.data.actions || []);
      if (json.data.request) setSelected(json.data.request as PaymentRequestRow);
      setEvidenceFile(null);
      await refresh();
      if (transition === 'mark-paid' || transition === 'acknowledge-retirement') setSelected(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Action failed';
      setModalError(message);
      setToast(message);
    } finally {
      setBusy(false);
    }
  };

  const rows = useMemo(() => {
    if (tab === 'ready') return workspace.readyToPay;
    if (tab === 'paidToday') return workspace.paidToday;
    if (tab === 'awaiting') return workspace.awaitingRetirement;
    if (tab === 'verify') return workspace.retirementToVerify;
    return workspace.history;
  }, [tab, workspace]);

  const kpis = [
    { label: 'Ready to pay', value: String(workspace.summary.readyToPay), detail: money(workspace.summary.readyValue), icon: Wallet, wrap: 'bg-teal-50', color: 'text-teal-600' },
    { label: 'Paid today', value: String(workspace.summary.paidToday), detail: money(workspace.summary.paidTodayValue), icon: Banknote, wrap: 'bg-emerald-50', color: 'text-emerald-600' },
    { label: 'Awaiting retirement', value: String(workspace.summary.awaitingRetirement), detail: 'Cash advances', icon: Clock3, wrap: 'bg-amber-50', color: 'text-amber-600' },
    { label: 'Retirement to verify', value: String(workspace.summary.retirementToVerify), detail: 'Acknowledge / return', icon: ShieldCheck, wrap: 'bg-violet-50', color: 'text-violet-600' },
  ];

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">Treasury Operations</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Disburse fully approved payments, upload payment evidence, notify requesters, and acknowledge cash-advance retirements.
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
            ['ready', 'Ready to pay', workspace.summary.readyToPay],
            ['paidToday', 'Paid today', workspace.summary.paidToday],
            ['awaiting', 'Awaiting retirement', workspace.summary.awaitingRetirement],
            ['verify', 'Retirement to verify', workspace.summary.retirementToVerify],
            ['history', 'History', workspace.summary.history],
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
                {['Request', 'Type', 'Beneficiary', 'Amount', 'Status', 'Site', ''].map((column) => (
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
                  <td className="px-3 py-2.5">{row.paymentSiteCode || '—'}</td>
                  <td className="px-3 py-2.5">
                    <button type="button" onClick={() => void openDetail(row)} className="font-semibold text-[#008FD5]">Open</button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={7} className="px-3 py-12 text-center text-sm text-slate-500">No payments in this queue.</td>
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
              <h2 className="text-lg font-semibold text-slate-900">Treasury action</h2>
              <button type="button" onClick={() => setSelected(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {modalError ? (
                <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                  {modalError}
                </div>
              ) : null}
              <PaymentRequestDetailPanel
                request={selected}
                actions={actions}
                footer={(
                  <div className="space-y-3">
                    {/ready for treasury|approved/i.test(selected.status) ? (
                      <>
                        <label className="block text-sm">
                          <span className="mb-1 block font-medium">Payment evidence *</span>
                          <span className="mb-2 block text-xs text-slate-500">
                            Upload bank receipt / transfer proof (PDF or image, max 8 MB). Requesters can download it from the request.
                          </span>
                          <div className="flex items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3">
                            <FileUp className="h-5 w-5 shrink-0 text-[#008FD5]" />
                            <div className="min-w-0 flex-1">
                              <input
                                type="file"
                                accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt,application/pdf,image/*"
                                onChange={(e) => {
                                  setEvidenceFile(e.target.files?.[0] || null);
                                  setModalError('');
                                }}
                                className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-[#EAF6FF] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[#008FD5]"
                              />
                              {evidenceFile ? (
                                <p className="mt-1 truncate text-xs font-medium text-slate-600">
                                  Selected: {evidenceFile.name} ({Math.max(1, Math.round(evidenceFile.size / 1024))} KB)
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </label>
                        <label className="block text-sm">
                          <span className="mb-1 block font-medium">Note</span>
                          <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Optional disbursement note" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                        </label>
                        <button
                          type="button"
                          disabled={busy || !evidenceFile}
                          onClick={() => void runTransition('mark-paid')}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-[#008FD5] px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-60"
                        >
                          <CheckCircle2 className="h-4 w-4" /> Mark paid & notify requester
                        </button>
                      </>
                    ) : null}
                    {/retirement submitted|treasury verification|finance verification/i.test(selected.status) ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void runTransition('acknowledge-retirement')}
                          className="rounded-xl bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-60"
                        >
                          Acknowledge retirement
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            const reason = window.prompt('Reason to return retirement for correction') || '';
                            if (!reason.trim()) return;
                            void runTransition('return-retirement', { reason, comment: reason });
                          }}
                          className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-sm font-semibold text-rose-700 disabled:opacity-60"
                        >
                          Return retirement
                        </button>
                      </div>
                    ) : null}
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
