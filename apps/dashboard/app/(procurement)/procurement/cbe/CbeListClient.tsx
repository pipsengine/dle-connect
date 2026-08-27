'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, RefreshCw, Scale } from 'lucide-react';
import { procurementGet, procurementPost } from '../lib/procurement-api';

type CbeListRow = {
  cbeId: string;
  title: string;
  rfqNumber: string | null;
  status: string;
  buyerName: string | null;
  project: string | null;
  department: string | null;
  currency: string;
  evaluationMethod: string | null;
  updatedAt: string;
  bidderCount?: number;
  itemCount?: number;
};

const EVALUATION_METHODS = [
  'Best Value (Weighted)',
  'Lowest Evaluated Responsive Bid',
  'Pass / Fail + Commercial Rank',
];

const emptyForm = {
  title: '',
  rfqNumber: '',
  project: '',
  department: '',
  buyerName: '',
  currency: 'NGN',
  evaluationMethod: EVALUATION_METHODS[0],
  status: 'Draft',
};

function formatWhen(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusBadgeClass(status: string) {
  const s = status.toLowerCase();
  const base = 'inline-block rounded px-2 py-1 text-[11px] font-bold whitespace-nowrap';
  if (s.includes('award') || s.includes('approved') || s === 'draft') {
    return `${base} bg-emerald-50 text-emerald-800`;
  }
  if (s.includes('cancel') || s.includes('reject')) {
    return `${base} bg-red-50 text-red-700`;
  }
  if (s.includes('approval') || s.includes('negotiation')) {
    return `${base} bg-amber-50 text-amber-800`;
  }
  return `${base} bg-slate-100 text-slate-700`;
}

export default function CbeListClient() {
  const [rows, setRows] = useState<CbeListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ ...emptyForm });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await procurementGet<CbeListRow[]>('cbes'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load CBEs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setError('Title is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await procurementPost('create-cbe', {
        payload: {
          title: form.title.trim(),
          rfqNumber: form.rfqNumber.trim() || null,
          project: form.project.trim() || null,
          department: form.department.trim() || null,
          buyerName: form.buyerName.trim() || null,
          currency: form.currency || 'NGN',
          evaluationMethod: form.evaluationMethod || null,
          status: form.status || 'Draft',
        },
      });
      setForm({ ...emptyForm });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create CBE');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-blue-700" />
            <h1 className="text-2xl font-black text-slate-900">Competitive Bid Evaluation</h1>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Create and manage CBEs linked to RFQs across the procurement lifecycle.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex h-10 items-center gap-2 rounded-md border bg-white px-3 text-sm font-semibold"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <form onSubmit={(e) => void create(e)} className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center gap-2">
          <Plus className="h-4 w-4 text-blue-700" />
          <h2 className="text-sm font-black text-slate-900">Create CBE</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input
            className="h-10 rounded-md border px-3 text-sm"
            placeholder="Title *"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            required
          />
          <input
            className="h-10 rounded-md border px-3 text-sm"
            placeholder="RFQ Number"
            value={form.rfqNumber}
            onChange={(e) => setForm((f) => ({ ...f, rfqNumber: e.target.value }))}
          />
          <input
            className="h-10 rounded-md border px-3 text-sm"
            placeholder="Project"
            value={form.project}
            onChange={(e) => setForm((f) => ({ ...f, project: e.target.value }))}
          />
          <input
            className="h-10 rounded-md border px-3 text-sm"
            placeholder="Department"
            value={form.department}
            onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
          />
          <input
            className="h-10 rounded-md border px-3 text-sm"
            placeholder="Buyer Name"
            value={form.buyerName}
            onChange={(e) => setForm((f) => ({ ...f, buyerName: e.target.value }))}
          />
          <select
            className="h-10 rounded-md border px-3 text-sm"
            value={form.currency}
            onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
          >
            <option value="NGN">NGN</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
          </select>
          <select
            className="h-10 rounded-md border px-3 text-sm"
            value={form.evaluationMethod}
            onChange={(e) => setForm((f) => ({ ...f, evaluationMethod: e.target.value }))}
          >
            {EVALUATION_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <select
            className="h-10 rounded-md border px-3 text-sm"
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
          >
            <option value="Draft">Draft</option>
            <option value="Bid Comparison">Bid Comparison</option>
            <option value="Technical Evaluation">Technical Evaluation</option>
            <option value="Commercial Evaluation">Commercial Evaluation</option>
            <option value="Negotiation">Negotiation</option>
            <option value="Recommendation & Approval">Recommendation & Approval</option>
          </select>
        </div>
        <div className="mt-3">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create CBE
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {loading ? (
          <div className="flex items-center gap-2 px-4 py-10 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading CBEs…
          </div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-10 text-sm text-slate-600">No CBEs yet. Create one above to get started.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-600">
                  <th className="px-3 py-3">CBE ID</th>
                  <th className="px-3 py-3">Title</th>
                  <th className="px-3 py-3">RFQ Number</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Buyer</th>
                  <th className="px-3 py-3">Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.cbeId} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="px-3 py-3 font-semibold">
                      <Link
                        href={`/procurement/cbe/${encodeURIComponent(row.cbeId)}`}
                        className="text-blue-700 hover:underline"
                      >
                        {row.cbeId}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <Link
                        href={`/procurement/cbe/${encodeURIComponent(row.cbeId)}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {row.title}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-slate-700">{row.rfqNumber || '—'}</td>
                    <td className="px-3 py-3">
                      <span className={statusBadgeClass(row.status)}>{row.status}</span>
                    </td>
                    <td className="px-3 py-3 text-slate-700">{row.buyerName || '—'}</td>
                    <td className="px-3 py-3 text-slate-600">{formatWhen(row.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
