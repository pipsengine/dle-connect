'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, Loader2, Plus, RefreshCw } from 'lucide-react';
import { procurementGet, procurementPost } from '../lib/procurement-api';
import {
  domainStatuses,
  linesTotal,
  type ProcDomainDef,
  type ProcLineItem,
} from '@/lib/procurement/catalog';
import {
  FilterBar,
  KpiCard,
  PaginationFooter,
  PersonCell,
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
  toDateInput,
} from './proc-ui';
import { LineItemsEditor } from './LineItemsEditor';

type DomainRow = Record<string, unknown> & {
  recordId: string;
  reference: string;
  title: string;
  status: string;
  amount?: number;
  currency?: string;
  project?: string | null;
  costCentre?: string | null;
  ownerName?: string | null;
  owner?: string | null;
  updatedAt?: string;
  lines?: ProcLineItem[];
};

function asLines(value: unknown): ProcLineItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((line) => ({
    id: String(line.id || line.lineId || crypto.randomUUID()),
    lineId: line.lineId,
    description: String(line.description || ''),
    quantity: Number(line.quantity ?? line.qty ?? 1),
    uom: String(line.uom || 'EA'),
    unitPrice: Number(line.unitPrice ?? line.unitEstimate ?? 0),
    taxRate: Number(line.taxRate ?? 0),
    requiredDate: line.requiredDate ? String(line.requiredDate).slice(0, 10) : '',
  }));
}

export function DomainWorkspace({ domain }: { domain: ProcDomainDef }) {
  const [rows, setRows] = useState<DomainRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState(domain.tabs[0] || 'All');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [modalOpen, setModalOpen] = useState(false);
  const [detail, setDetail] = useState<DomainRow | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [lines, setLines] = useState<ProcLineItem[]>([]);
  const statuses = domainStatuses(domain);

  const emptyForm = useCallback(() => {
    const next: Record<string, unknown> = { status: statuses[0] || 'Draft', currency: 'NGN', priority: 'Medium' };
    for (const field of domain.fields) {
      if (next[field.key] == null) next[field.key] = field.type === 'number' ? '' : field.type === 'checkbox' ? false : '';
    }
    return next;
  }, [domain.fields, statuses]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await procurementGet<DomainRow[]>(domain.resource));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load records');
    } finally {
      setLoading(false);
    }
  }, [domain.resource]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (tab && !tab.toLowerCase().startsWith('all') && !tab.toLowerCase().startsWith('my')) {
        const status = String(row.status || '').toLowerCase();
        const needle = tab.toLowerCase();
        if (!status.includes(needle) && needle !== 'open' && needle !== 'in execution') return false;
      }
      if (!q) return true;
      return [row.reference, row.title, row.status, row.project, row.ownerName, row.owner]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [rows, search, tab]);

  useEffect(() => {
    setPage(1);
  }, [search, tab, pageSize]);

  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const kpis = useMemo(
    () =>
      domain.kpis.map((label, index) => {
        if (index === 0) return { label, value: rows.length };
        const needle = label.toLowerCase();
        return {
          label,
          value: rows.filter((r) => String(r.status || '').toLowerCase().includes(needle)).length,
        };
      }),
    [domain.kpis, rows],
  );

  const openCreate = () => {
    setForm(emptyForm());
    setLines([]);
    setError('');
    setModalOpen(true);
  };

  const openEdit = (row: DomainRow) => {
    setForm({ ...emptyForm(), ...row, dueDate: toDateInput(String(row.dueDate || '')) });
    setLines(asLines(row.lines));
    setError('');
    setModalOpen(true);
  };

  const save = async (status?: string) => {
    const titleField = domain.fields.find((f) => f.key === 'title');
    if (titleField?.required && !String(form.title || '').trim()) {
      setError(`${titleField.label} is required`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const amount = form.amount === '' || form.amount == null ? linesTotal(lines) : Number(form.amount);
      await procurementPost('upsert-domain', {
        domain: domain.id,
        payload: {
          ...form,
          status: status || form.status || statuses[0],
          amount,
          lines: domain.hasLines ? lines : undefined,
        },
      });
      setModalOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const fieldValue = (key: string) => {
    const value = form[key];
    if (value == null) return '';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return String(value);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">{domain.title}</h1>
          <p className="mt-1 text-sm text-slate-600">{domain.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void load()} className={secondaryBtnClass}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <button type="button" onClick={openCreate} className={primaryBtnClass}>
            <Plus className="h-4 w-4" /> New
          </button>
        </div>
      </div>

      {error && !modalOpen ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} label={kpi.label} value={kpi.value} />
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white px-2">
        <div className="flex min-w-max">
          {domain.tabs.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              className={`whitespace-nowrap border-b-2 px-4 py-3 text-xs font-bold ${
                tab === item ? 'border-blue-700 text-blue-800' : 'border-transparent text-slate-500'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <FilterBar>
        <div className="min-w-[220px] flex-1">
          <label className={labelClass}>Search</label>
          <input className={inputClass} placeholder={`Search ${domain.title.toLowerCase()}…`} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </FilterBar>

      <RegisterTable
        title={`${domain.title} register`}
        count={filtered.length}
        onExport={() =>
          exportCsv(
            `${domain.id}.csv`,
            ['Reference', 'Title', 'Status', 'Value', 'Project', 'Owner', 'Updated'],
            filtered.map((r) => [r.reference, r.title, r.status, r.amount, r.project, r.ownerName || r.owner, formatWhen(r.updatedAt)]),
          )
        }
      >
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    {['Reference', 'Description', 'Status', 'Value', 'Project / Cost centre', 'Owner', 'Updated', 'Action'].map((h) => (
                      <th key={h} className="px-3 py-3 text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr key={row.recordId} className="border-t border-slate-100 hover:bg-slate-50/80">
                      <td className="px-3 py-3">
                        <button type="button" className="font-semibold text-blue-600 hover:underline" onClick={() => setDetail(row)}>
                          {row.reference}
                        </button>
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-900">{row.title || '—'}</td>
                      <td className="px-3 py-3"><StatusBadge status={row.status} /></td>
                      <td className="px-3 py-3 tabular-nums">{moneyPlain(Number(row.amount || 0), String(row.currency || 'NGN'))}</td>
                      <td className="px-3 py-3 text-slate-700">
                        <div>{row.project || '—'}</div>
                        <div className="text-xs text-slate-500">{row.costCentre || ''}</div>
                      </td>
                      <td className="px-3 py-3"><PersonCell name={String(row.ownerName || row.owner || '')} /></td>
                      <td className="px-3 py-3 text-slate-600">{formatWhen(row.updatedAt)}</td>
                      <td className="px-3 py-3">
                        <button type="button" className="rounded-md border border-slate-200 p-1.5" onClick={() => openEdit(row)} title="View / Edit">
                          <Eye className="h-3.5 w-3.5 text-slate-600" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!pageRows.length ? (
              <div className="py-12 text-center text-sm text-slate-500">No records yet. Use New to start this workflow.</div>
            ) : null}
            <PaginationFooter page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} onPageSizeChange={setPageSize} />
          </>
        )}
      </RegisterTable>

      <ProcModal
        open={modalOpen}
        title={`${form.recordId ? 'Edit' : 'New'} ${domain.title}`}
        onClose={() => setModalOpen(false)}
        wide
        footer={
          <>
            <button type="button" className={secondaryBtnClass} onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="button" className={secondaryBtnClass} disabled={saving} onClick={() => void save('Draft')}>Save draft</button>
            <button type="button" className={primaryBtnClass} disabled={saving} onClick={() => void save(String(form.status || statuses[1] || 'Submitted'))}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving ? 'Saving…' : 'Save & submit'}
            </button>
          </>
        }
      >
        {error && modalOpen ? (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2">
          {domain.fields.map((field) => (
            <div key={field.key} className={field.span === 2 ? 'md:col-span-2' : ''}>
              <label className={labelClass}>
                {field.label}
                {field.required ? ' *' : ''}
              </label>
              {field.type === 'textarea' ? (
                <textarea
                  className={`${inputClass} min-h-[80px] py-2`}
                  value={fieldValue(field.key)}
                  onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                />
              ) : field.type === 'select' ? (
                <select
                  className={selectClass}
                  value={fieldValue(field.key)}
                  onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                >
                  <option value="">Select…</option>
                  {(field.options || []).map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              ) : (
                <input
                  className={inputClass}
                  type={field.type === 'datetime' ? 'datetime-local' : field.type || 'text'}
                  value={fieldValue(field.key)}
                  onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                />
              )}
            </div>
          ))}
          <div>
            <label className={labelClass}>Status</label>
            <select className={selectClass} value={String(form.status || statuses[0])} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              {statuses.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
        {domain.hasLines ? (
          <div className="mt-6">
            <LineItemsEditor lines={lines} onChange={setLines} />
          </div>
        ) : null}
      </ProcModal>

      <ProcModal
        open={Boolean(detail)}
        title={detail?.reference || 'Record detail'}
        onClose={() => setDetail(null)}
        wide
        footer={
          <>
            <button type="button" className={secondaryBtnClass} onClick={() => setDetail(null)}>Close</button>
            {detail ? (
              <button type="button" className={primaryBtnClass} onClick={() => { openEdit(detail); setDetail(null); }}>
                Edit record
              </button>
            ) : null}
          </>
        }
      >
        {detail ? (
          <div className="grid gap-3 md:grid-cols-2">
            {Object.entries(detail)
              .filter(([key, value]) => key !== 'lines' && value != null && typeof value !== 'object')
              .map(([key, value]) => (
                <div key={key}>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{key}</div>
                  <div className="mt-1 break-words text-sm text-slate-800">{String(value)}</div>
                </div>
              ))}
          </div>
        ) : null}
      </ProcModal>
    </div>
  );
}
