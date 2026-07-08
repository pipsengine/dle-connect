'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Factory,
  Pencil,
  Plus,
  RefreshCcw,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type { TimesheetWorkCenter } from '@/lib/timesheet-entry-store';

type Payload = {
  generatedAt: string;
  source: string;
  summary: { total: number; active: number; inactive: number };
  workCenters: TimesheetWorkCenter[];
};

type FormState = {
  id?: string;
  code: string;
  name: string;
  location: string;
  site: string;
  status: 'Active' | 'Inactive';
};

const emptyForm = (): FormState => ({
  code: '',
  name: '',
  location: '',
  site: '',
  status: 'Active',
});

export default function WorkCentersClient() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Inactive'>('Active');
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/hris/organization/work-centers', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to load work centers.');
      setPayload(json.data as Payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load work centers.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    const list = payload?.workCenters || [];
    const q = query.trim().toLowerCase();
    return list.filter((item) => {
      if (statusFilter !== 'All' && item.status !== statusFilter) return false;
      if (!q) return true;
      return [item.name, item.code, item.location, item.site, item.sourceSystem]
        .some((value) => String(value || '').toLowerCase().includes(q));
    });
  }, [payload, query, statusFilter]);

  const openCreate = () => {
    setForm(emptyForm());
    setFormOpen(true);
  };

  const openEdit = (item: TimesheetWorkCenter) => {
    setForm({
      id: item.id,
      code: item.code || '',
      name: item.name || '',
      location: item.location || '',
      site: item.site || '',
      status: item.status === 'Inactive' ? 'Inactive' : 'Active',
    });
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      setError('Work center name is required.');
      return;
    }
    setBusy(true);
    setError('');
    setToast('');
    try {
      const res = await fetch('/api/hris/organization/work-centers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'upsert',
          workCenter: {
            id: form.id,
            code: form.code.trim() || undefined,
            name: form.name.trim(),
            location: form.location.trim() || null,
            site: form.site.trim() || form.location.trim() || null,
            status: form.status,
            sourceSystem: 'HRIS Organization',
          },
        }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to save work center.');
      setPayload(json.data as Payload);
      setFormOpen(false);
      setForm(emptyForm());
      setToast(form.id ? 'Work center updated.' : 'Work center created.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save work center.');
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async (item: TimesheetWorkCenter) => {
    if (!window.confirm(`Deactivate work center "${item.name}"? It will no longer appear for new timesheets.`)) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/hris/organization/work-centers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'deactivate', workCenter: { id: item.id } }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to deactivate work center.');
      setPayload(json.data as Payload);
      setToast(`Deactivated ${item.name}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to deactivate work center.');
    } finally {
      setBusy(false);
    }
  };

  const reactivate = async (item: TimesheetWorkCenter) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/hris/organization/work-centers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'activate',
          workCenter: {
            id: item.id,
            name: item.name,
            code: item.code,
            location: item.location,
            site: item.site,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to reactivate work center.');
      setPayload(json.data as Payload);
      setToast(`Reactivated ${item.name}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reactivate work center.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 pb-10">
      <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700 shadow-sm">
              <Factory className="h-7 w-7" />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-[#0F172A]">Work Centers</h1>
              <p className="mt-1 max-w-3xl text-sm text-[#64748B]">
                Add, edit, or deactivate production work centers used by timesheet entry and workforce operations.
                Stored in <span className="font-semibold">DLE_Enterprise → hris.TimesheetWorkCenters</span>.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading || busy}
              className="inline-flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-xl bg-[#2563EB] px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Add Work Center
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Kpi label="Total" value={payload?.summary.total || 0} />
        <Kpi label="Active" value={payload?.summary.active || 0} tone="green" />
        <Kpi label="Inactive" value={payload?.summary.inactive || 0} tone="amber" />
      </section>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{error}</div> : null}
      {toast ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{toast}</div> : null}

      <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, code, location, site..."
              className="h-10 w-full rounded-xl border border-[#E5E7EB] bg-white pl-9 pr-3 text-sm outline-none focus:border-[#2563EB]"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="h-10 rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm font-semibold"
          >
            <option value="All">All statuses</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-[#E5E7EB]">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-bold uppercase text-[#64748B]">
              <tr>
                <th className="px-4 py-3">Work Center</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Site</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.id} className="border-t border-[#E5E7EB] hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-[#0F172A]">{item.name}</td>
                  <td className="px-4 py-3 text-[#475569]">{item.code}</td>
                  <td className="px-4 py-3 text-[#475569]">{item.location || '—'}</td>
                  <td className="px-4 py-3 text-[#475569]">{item.site || '—'}</td>
                  <td className="px-4 py-3 text-xs text-[#64748B]">{item.sourceSystem}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${item.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button type="button" disabled={busy} onClick={() => openEdit(item)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-white">
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                      {item.status === 'Active' ? (
                        <button type="button" disabled={busy} onClick={() => void deactivate(item)} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50">
                          <Trash2 className="h-3.5 w-3.5" /> Deactivate
                        </button>
                      ) : (
                        <button type="button" disabled={busy} onClick={() => void reactivate(item)} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">
                          <RotateCcw className="h-3.5 w-3.5" /> Reactivate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm font-semibold text-[#64748B]">
                    {loading ? 'Loading work centers...' : 'No work centers match the current filters.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {payload?.source ? (
          <p className="mt-3 text-xs font-medium text-[#94A3B8]">Source: {payload.source} · Updated {payload.generatedAt ? new Date(payload.generatedAt).toLocaleString('en-GB') : '—'}</p>
        ) : null}
      </section>

      {formOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-[#0F172A]">{form.id ? 'Edit Work Center' : 'Add Work Center'}</h2>
              <button type="button" onClick={() => setFormOpen(false)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
                Name *
                <input
                  value={form.name}
                  onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-500"
                  placeholder="e.g. Welding"
                />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Code
                <input
                  value={form.code}
                  onChange={(e) => setForm((current) => ({ ...current, code: e.target.value }))}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-500"
                  placeholder="Optional"
                />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Status
                <select
                  value={form.status}
                  onChange={(e) => setForm((current) => ({ ...current, status: e.target.value as FormState['status'] }))}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-500"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Location
                <input
                  value={form.location}
                  onChange={(e) => setForm((current) => ({ ...current, location: e.target.value }))}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-500"
                  placeholder="Optional"
                />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Site
                <input
                  value={form.site}
                  onChange={(e) => setForm((current) => ({ ...current, site: e.target.value }))}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-500"
                  placeholder="Optional"
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setFormOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button type="button" disabled={busy} onClick={() => void save()} className="rounded-xl bg-[#2563EB] px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                {busy ? 'Saving...' : 'Save Work Center'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Kpi({ label, value, tone = 'slate' }: { label: string; value: number; tone?: 'slate' | 'green' | 'amber' }) {
  const toneClass = tone === 'green' ? 'border-emerald-200 bg-emerald-50' : tone === 'amber' ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50';
  return (
    <div className={`rounded-2xl border px-5 py-4 ${toneClass}`}>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}
