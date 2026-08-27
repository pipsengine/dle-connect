'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, RefreshCw } from 'lucide-react';
import { procurementGet, procurementPost } from '../lib/procurement-api';

type Field = {
  key: string;
  label: string;
  type?: 'text' | 'textarea' | 'number' | 'select' | 'checkbox';
  options?: string[];
  required?: boolean;
};

type Props = {
  title: string;
  description?: string;
  resource: string;
  action: string;
  idKey: string;
  fields: Field[];
  columns: Array<{ key: string; label: string }>;
  createDefaults?: Record<string, unknown>;
  query?: Record<string, string | undefined>;
};

export function ProcEntityCrud({
  title,
  description,
  resource,
  action,
  idKey,
  fields,
  columns,
  createDefaults = {},
  query,
}: Props) {
  const queryKey = JSON.stringify(query || {});
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, unknown>>({ ...createDefaults });

  const emptyForm = useMemo(() => {
    const next: Record<string, unknown> = { ...createDefaults };
    for (const field of fields) {
      if (next[field.key] == null) next[field.key] = field.type === 'checkbox' ? false : field.type === 'number' ? 0 : '';
    }
    return next;
  }, [createDefaults, fields]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = queryKey ? (JSON.parse(queryKey) as Record<string, string | undefined>) : {};
      setRows(await procurementGet<Record<string, unknown>[]>(resource, params));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [queryKey, resource]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setForm(emptyForm);
  }, [emptyForm]);

  const save = async () => {
    for (const field of fields) {
      if (field.required && !String(form[field.key] ?? '').trim()) {
        setError(`${field.label} is required`);
        return;
      }
    }
    setSaving(true);
    setError('');
    try {
      await procurementPost(action, { payload: form });
      setForm(emptyForm);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black text-slate-900">{title}</h1>
        {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
      </div>
      <button type="button" onClick={() => void load()} className="inline-flex h-10 items-center gap-2 rounded-md border bg-white px-3 text-sm font-semibold">
        <RefreshCw className="h-4 w-4" /> Refresh
      </button>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-black">{form[idKey] ? 'Edit record' : 'Create record'}</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {fields.map((field) => {
            if (field.type === 'textarea') {
              return (
                <textarea
                  key={field.key}
                  className="min-h-[80px] rounded-md border px-3 py-2 text-sm md:col-span-2"
                  placeholder={field.label}
                  value={String(form[field.key] ?? '')}
                  onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                />
              );
            }
            if (field.type === 'select') {
              return (
                <select
                  key={field.key}
                  className="h-10 rounded-md border px-3 text-sm"
                  value={String(form[field.key] ?? '')}
                  onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                >
                  {(field.options || []).map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              );
            }
            if (field.type === 'checkbox') {
              return (
                <label key={field.key} className="flex h-10 items-center gap-2 text-sm">
                  <input type="checkbox" checked={Boolean(form[field.key])} onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.checked }))} />
                  {field.label}
                </label>
              );
            }
            return (
              <input
                key={field.key}
                type={field.type === 'number' ? 'number' : 'text'}
                className="h-10 rounded-md border px-3 text-sm"
                placeholder={field.label}
                value={String(form[field.key] ?? '')}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    [field.key]: field.type === 'number' ? Number(e.target.value) : e.target.value,
                  }))
                }
              />
            );
          })}
          <button type="button" disabled={saving} onClick={() => void save()} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-blue-700 text-sm font-semibold text-white disabled:opacity-60">
            <Plus className="h-4 w-4" /> {saving ? 'Saving…' : form[idKey] ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border bg-white">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                {columns.map((col) => (
                  <th key={col.key} className="px-3 py-3 text-left">{col.label}</th>
                ))}
                <th className="px-3 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={String(row[idKey])} className="border-t">
                  {columns.map((col) => (
                    <td key={col.key} className="px-3 py-3">{String(row[col.key] ?? '—')}</td>
                  ))}
                  <td className="px-3 py-3">
                    <button type="button" className="rounded border px-2 py-1 text-xs font-semibold" onClick={() => setForm({ ...emptyForm, ...row })}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && !rows.length ? <div className="py-12 text-center text-sm text-slate-500">No records yet.</div> : null}
      </div>
    </div>
  );
}
