'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, Plus, RefreshCw } from 'lucide-react';
import { procurementGet, procurementPost } from '../lib/procurement-api';
import { domainById } from '@/lib/procurement/catalog';
import {
  FilterBar,
  KpiCard,
  ProcModal,
  RegisterTable,
  StatusBadge,
  exportCsv,
  formatWhen,
  inputClass,
  labelClass,
  moneyPlain,
  primaryBtnClass,
  secondaryBtnClass,
  selectClass,
} from './proc-ui';

type QueueRow = {
  id: string;
  reference: string;
  title: string;
  status: string;
  transactionType: string;
  owner?: string | null;
  amount?: number;
  currency?: string;
  project?: string | null;
  updatedAt?: string;
  href?: string;
};

const TABS = ['My Queue', 'PR', 'Sourcing', 'Award', 'PO / Contract', 'Waivers', 'Escalations'];

export function ApprovalsQueueClient() {
  const spec = domainById('approvals')!;
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('My Queue');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    title: '',
    transactionType: 'PR',
    transactionReference: '',
    approvalLevel: '1',
    ownerName: '',
    status: 'Pending',
    comment: '',
    dueDate: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await procurementGet<QueueRow[]>('approvals-queue'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load approvals');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (tab !== 'My Queue' && tab !== 'Escalations') {
        if (!String(row.transactionType).toLowerCase().includes(tab.toLowerCase().replace(' / contract', '').replace('po', 'po'))) {
          if (tab === 'PO / Contract' && row.transactionType !== 'PO / Contract') return false;
          if (tab !== 'PO / Contract' && row.transactionType !== tab) return false;
        }
      }
      if (!q) return true;
      return [row.reference, row.title, row.status, row.owner, row.transactionType].some((v) =>
        String(v || '').toLowerCase().includes(q),
      );
    });
  }, [rows, search, tab]);

  const kpis = useMemo(
    () =>
      spec.kpis.map((label, i) => ({
        label,
        value: i === 0 ? rows.length : rows.filter((r) => String(r.transactionType).toLowerCase().includes(label.toLowerCase().slice(0, 2))).length,
      })),
    [rows, spec.kpis],
  );

  const save = async () => {
    if (!form.title.trim()) {
      setError('Title is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await procurementPost('upsert-domain', {
        domain: 'approvals',
        payload: { ...form, approvalLevel: Number(form.approvalLevel || 1) },
      });
      setModalOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">{spec.title}</h1>
          <p className="mt-1 text-sm text-slate-600">{spec.description}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void load()} className={secondaryBtnClass}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <button type="button" onClick={() => setModalOpen(true)} className={primaryBtnClass}>
            <Plus className="h-4 w-4" /> New queue item
          </button>
        </div>
      </div>
      {error && !modalOpen ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} label={kpi.label} value={kpi.value} />
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white px-2">
        <div className="flex min-w-max">
          {TABS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              className={`whitespace-nowrap border-b-2 px-4 py-3 text-xs font-bold ${tab === item ? 'border-blue-700 text-blue-800' : 'border-transparent text-slate-500'}`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      <FilterBar>
        <div className="min-w-[220px] flex-1">
          <label className={labelClass}>Search</label>
          <input className={inputClass} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search queue…" />
        </div>
      </FilterBar>
      <RegisterTable
        title="Approvals queue"
        count={filtered.length}
        onExport={() =>
          exportCsv(
            'approvals-queue.csv',
            ['Reference', 'Type', 'Title', 'Status', 'Owner', 'Value', 'Updated'],
            filtered.map((r) => [r.reference, r.transactionType, r.title, r.status, r.owner, r.amount, formatWhen(r.updatedAt)]),
          )
        }
      >
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  {['Reference', 'Type', 'Description', 'Status', 'Owner', 'Value', 'Updated'].map((h) => (
                    <th key={h} className="px-3 py-3 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={`${row.transactionType}-${row.id}`} className="border-t border-slate-100 hover:bg-slate-50/80">
                    <td className="px-3 py-3">
                      {row.href ? (
                        <Link href={row.href} className="font-semibold text-blue-600 hover:underline">{row.reference}</Link>
                      ) : (
                        <span className="font-semibold text-blue-700">{row.reference}</span>
                      )}
                    </td>
                    <td className="px-3 py-3">{row.transactionType}</td>
                    <td className="px-3 py-3 font-semibold text-slate-900">{row.title}</td>
                    <td className="px-3 py-3"><StatusBadge status={row.status} /></td>
                    <td className="px-3 py-3">{row.owner || '—'}</td>
                    <td className="px-3 py-3 tabular-nums">{moneyPlain(Number(row.amount || 0), row.currency || 'NGN')}</td>
                    <td className="px-3 py-3 text-slate-600">{formatWhen(row.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length ? <div className="py-12 text-center text-sm text-slate-500">No items in this queue.</div> : null}
          </div>
        )}
      </RegisterTable>
      <ProcModal
        open={modalOpen}
        title="New approvals queue item"
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <button type="button" className={secondaryBtnClass} onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="button" className={primaryBtnClass} disabled={saving} onClick={() => void save()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save
            </button>
          </>
        }
      >
        {error && modalOpen ? <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
        <div className="grid gap-3">
          <div>
            <label className={labelClass}>Title *</label>
            <input className={inputClass} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass}>Transaction type</label>
            <select className={selectClass} value={form.transactionType} onChange={(e) => setForm((f) => ({ ...f, transactionType: e.target.value }))}>
              {['PR', 'Sourcing', 'CBE', 'PO', 'Contract', 'Commercial', 'Waiver'].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Transaction reference</label>
            <input className={inputClass} value={form.transactionReference} onChange={(e) => setForm((f) => ({ ...f, transactionReference: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass}>Approver role</label>
            <input className={inputClass} value={form.ownerName} onChange={(e) => setForm((f) => ({ ...f, ownerName: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass}>Decision</label>
            <select className={selectClass} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              {['Pending', 'Approved', 'Rejected', 'Returned', 'Delegated'].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Comment</label>
            <textarea className={`${inputClass} min-h-[80px] py-2`} value={form.comment} onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))} />
          </div>
        </div>
      </ProcModal>
    </div>
  );
}
