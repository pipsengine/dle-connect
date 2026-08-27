'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, RefreshCw, Star } from 'lucide-react';
import { relativeTime, serviceDeskGet, serviceDeskPost } from '../lib/service-desk-api';
import { ServiceDeskItsmShell } from '../ServiceDeskItsmShell';

type Template = {
  templateId: string;
  name: string;
  subject: string;
  description: string | null;
  category: string | null;
  priority: string | null;
  isFavorite: boolean;
};

export function TicketTemplatesWorkspace() {
  const [rows, setRows] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ templateId: '', name: '', subject: '', description: '', category: 'Software', priority: 'Medium', isFavorite: false });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await serviceDeskGet<Template[]>('templates'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await serviceDeskPost('upsert-template', { payload: form });
      setForm({ templateId: '', name: '', subject: '', description: '', category: 'Software', priority: 'Medium', isFavorite: false });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const useTemplate = async (tpl: Template) => {
    await serviceDeskPost('create-ticket', {
      payload: {
        subject: tpl.subject,
        description: tpl.description,
        category: tpl.category,
        priority: tpl.priority || 'Medium',
        status: 'Open',
      },
    });
    await load();
  };

  return (
    <ServiceDeskItsmShell title="Ticket Templates" description="Reusable ticket templates stored in DLE_Enterprise.">
      <div className="space-y-4">
        <button type="button" onClick={() => void load()} className="inline-flex h-10 items-center gap-2 rounded-md border bg-white px-3 text-sm font-semibold"><RefreshCw className="h-4 w-4" /> Refresh</button>
        {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
        <div className="grid gap-3 md:grid-cols-2 rounded-lg border bg-white p-4">
          <input className="h-10 rounded-md border px-3 text-sm" placeholder="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <input className="h-10 rounded-md border px-3 text-sm" placeholder="Subject" value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} />
          <textarea className="min-h-[80px] rounded-md border px-3 py-2 text-sm md:col-span-2" placeholder="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          <select className="h-10 rounded-md border px-3 text-sm" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>{['Email', 'Network', 'Hardware', 'Software', 'Infrastructure', 'HR'].map((c) => <option key={c}>{c}</option>)}</select>
          <select className="h-10 rounded-md border px-3 text-sm" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>{['Critical', 'High', 'Medium', 'Low'].map((c) => <option key={c}>{c}</option>)}</select>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isFavorite} onChange={(e) => setForm((f) => ({ ...f, isFavorite: e.target.checked }))} /> Favorite</label>
          <button type="button" disabled={saving} onClick={() => void save()} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-teal-700 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> Save template</button>
        </div>
        {loading ? <div className="flex justify-center py-16"><Loader2 className="h-4 w-4 animate-spin" /></div> : (
          <div className="grid gap-3 md:grid-cols-2">
            {rows.map((tpl) => (
              <div key={tpl.templateId} className="rounded-lg border bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-black">{tpl.name}</div>
                    <div className="text-xs text-slate-500">{tpl.category} · {tpl.priority}</div>
                  </div>
                  {tpl.isFavorite ? <Star className="h-4 w-4 text-amber-500" /> : null}
                </div>
                <div className="mt-2 text-sm text-slate-700">{tpl.subject}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="rounded border px-2 py-1 text-xs font-semibold" onClick={() => void useTemplate(tpl)}>Use</button>
                  <button type="button" className="rounded border px-2 py-1 text-xs font-semibold" onClick={() => setForm({ ...tpl, description: tpl.description || '', category: tpl.category || 'Software', priority: tpl.priority || 'Medium' })}>Edit</button>
                  <button type="button" className="rounded border px-2 py-1 text-xs font-semibold" onClick={() => void serviceDeskPost('upsert-template', { payload: { ...tpl, isFavorite: !tpl.isFavorite } }).then(load)}>Favorite</button>
                  <button type="button" className="rounded border px-2 py-1 text-xs font-semibold" onClick={() => void serviceDeskPost('upsert-template', { payload: { ...tpl, name: `${tpl.name} (copy)`, templateId: '' } }).then(load)}>Duplicate</button>
                  <button type="button" className="rounded border px-2 py-1 text-xs font-semibold text-red-700" onClick={() => void serviceDeskPost('delete-template', { id: tpl.templateId }).then(load)}>Archive</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ServiceDeskItsmShell>
  );
}
