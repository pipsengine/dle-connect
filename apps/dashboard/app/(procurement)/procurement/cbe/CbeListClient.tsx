'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  Loader2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Scale,
} from 'lucide-react';
import { procurementGet, procurementPost } from '../lib/procurement-api';
import { DepartmentLookup, EmployeeLookup, SearchableSelect } from '../_components/proc-lookups';
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
  primaryBtnClass,
  secondaryBtnClass,
  selectClass,
} from '../_components/proc-ui';
import type { RfqRow } from '../_components/RfqsClient';

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
  createdAt?: string;
  updatedAt: string;
};

const EVALUATION_METHODS = [
  'Best Value (Weighted)',
  'Lowest Evaluated Responsive Bid',
  'Pass / Fail + Commercial Rank',
];

const CBE_STATUSES = [
  'Draft',
  'Bid Comparison',
  'Technical Evaluation',
  'Commercial Evaluation',
  'Negotiation',
  'In Evaluation',
  'Recommendation & Approval',
  'Completed',
  'Approved',
  'Awarded',
  'Cancelled',
] as const;

type CbeForm = {
  title: string;
  rfqNumber: string;
  project: string;
  department: string;
  buyerName: string;
  currency: string;
  evaluationMethod: string;
  status: string;
};

const emptyForm = (): CbeForm => ({
  title: '',
  rfqNumber: '',
  project: '',
  department: '',
  buyerName: '',
  currency: 'NGN',
  evaluationMethod: EVALUATION_METHODS[0]!,
  status: 'Draft',
});

function statusNorm(s: string) {
  return s.trim().toLowerCase();
}

function isInEvaluation(s: string) {
  const n = statusNorm(s);
  return (
    n === 'technical evaluation'
    || n === 'commercial evaluation'
    || n === 'negotiation'
    || n === 'in evaluation'
    || n.includes('recommendation')
  );
}

export default function CbeListClient() {
  const [rows, setRows] = useState<CbeListRow[]>([]);
  const [rfqs, setRfqs] = useState<RfqRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<CbeForm>(emptyForm());
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [cbes, rfqList] = await Promise.all([
        procurementGet<CbeListRow[]>('cbes'),
        procurementGet<RfqRow[]>('rfqs'),
      ]);
      setRows(cbes);
      setRfqs(rfqList);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load CBEs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const kpis = useMemo(() => {
    const count = (pred: (s: string) => boolean) => rows.filter((r) => pred(r.status)).length;
    return {
      total: rows.length,
      draft: count((s) => statusNorm(s) === 'draft'),
      bidComparison: count((s) => statusNorm(s) === 'bid comparison'),
      inEvaluation: count(isInEvaluation),
      completed: count((s) => {
        const n = statusNorm(s);
        return n === 'completed' || n === 'approved' || n === 'awarded';
      }),
    };
  }, [rows]);

  const rfqOptions = useMemo(
    () =>
      rfqs.map((r) => ({
        value: r.rfqId,
        label: `${r.rfqId} — ${r.title}`,
        sub: r.status,
      })),
    [rfqs],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter && statusNorm(r.status) !== statusNorm(statusFilter)) return false;
      if (!q) return true;
      return [r.cbeId, r.title, r.rfqNumber, r.project, r.department, r.buyerName, r.status]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [rows, search, statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, pageSize]);

  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const openCreate = () => {
    setForm(emptyForm());
    setError('');
    setModalOpen(true);
  };

  const save = async () => {
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
          rfqId: form.rfqNumber.trim() || null,
          rfqNumber: form.rfqNumber.trim() || null,
          project: form.project.trim() || null,
          department: form.department.trim() || null,
          buyerName: form.buyerName.trim() || null,
          currency: form.currency || 'NGN',
          evaluationMethod: form.evaluationMethod || null,
          status: form.status || 'Draft',
        },
      });
      setModalOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create CBE');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
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
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void load()} className={secondaryBtnClass}>
            <RefreshCw className="h-4 w-4" /> Refresh Data
          </button>
          <button type="button" onClick={openCreate} className={primaryBtnClass}>
            <Plus className="h-4 w-4" /> New CBE
          </button>
        </div>
      </div>

      {error && !modalOpen ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Total" value={kpis.total} icon={<Scale className="h-4 w-4" />} />
        <KpiCard label="Draft" value={kpis.draft} icon={<Scale className="h-4 w-4" />} tint="bg-slate-100 text-slate-700" />
        <KpiCard label="Bid Comparison" value={kpis.bidComparison} icon={<Scale className="h-4 w-4" />} tint="bg-blue-50 text-blue-700" />
        <KpiCard label="In Evaluation" value={kpis.inEvaluation} icon={<Scale className="h-4 w-4" />} tint="bg-amber-50 text-amber-700" />
        <KpiCard label="Completed" value={kpis.completed} icon={<CheckCircle2 className="h-4 w-4" />} tint="bg-emerald-50 text-emerald-700" />
      </div>

      <FilterBar>
        <div className="min-w-[200px] flex-1">
          <label className={labelClass}>Search</label>
          <input className={inputClass} placeholder="CBE ID, title, RFQ, buyer…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="w-52">
          <label className={labelClass}>Status</label>
          <select className={selectClass} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All</option>
            {CBE_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </FilterBar>

      <RegisterTable
        title="CBE Register"
        count={filtered.length}
        onExport={() =>
          exportCsv(
            'cbes.csv',
            ['CBE ID', 'Title', 'RFQ', 'Project', 'Department', 'Buyer', 'Status', 'Created', 'Updated'],
            filtered.map((r) => [
              r.cbeId,
              r.title,
              r.rfqNumber,
              r.project,
              r.department,
              r.buyerName,
              r.status,
              formatWhen(r.createdAt),
              formatWhen(r.updatedAt),
            ]),
          )
        }
      >
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading CBEs…
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-3 text-left">CBE ID</th>
                    <th className="px-3 py-3 text-left">Title</th>
                    <th className="px-3 py-3 text-left">RFQ</th>
                    <th className="px-3 py-3 text-left">Project</th>
                    <th className="px-3 py-3 text-left">Department</th>
                    <th className="px-3 py-3 text-left">Buyer</th>
                    <th className="px-3 py-3 text-left">Status</th>
                    <th className="px-3 py-3 text-left">Created</th>
                    <th className="px-3 py-3 text-left">Updated</th>
                    <th className="px-3 py-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr key={row.cbeId} className="border-t border-slate-100 hover:bg-slate-50/80">
                      <td className="px-3 py-3">
                        <Link href={`/procurement/cbe/${encodeURIComponent(row.cbeId)}`} className="font-semibold text-blue-600 hover:underline">
                          {row.cbeId}
                        </Link>
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-900">{row.title}</td>
                      <td className="px-3 py-3 text-slate-700">{row.rfqNumber || '—'}</td>
                      <td className="px-3 py-3 text-slate-700">{row.project || '—'}</td>
                      <td className="px-3 py-3 text-slate-700">{row.department || '—'}</td>
                      <td className="px-3 py-3"><PersonCell name={row.buyerName} /></td>
                      <td className="px-3 py-3"><StatusBadge status={row.status} /></td>
                      <td className="px-3 py-3 text-slate-600">{formatWhen(row.createdAt)}</td>
                      <td className="px-3 py-3 text-slate-600">{formatWhen(row.updatedAt)}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1">
                          <Link
                            href={`/procurement/cbe/${encodeURIComponent(row.cbeId)}`}
                            className="rounded-md border border-slate-200 p-1.5 hover:bg-white"
                            title="Open workspace"
                          >
                            <Eye className="h-3.5 w-3.5 text-slate-600" />
                          </Link>
                          <button type="button" className="rounded-md border border-slate-200 p-1.5" title="More">
                            <MoreHorizontal className="h-3.5 w-3.5 text-slate-600" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!pageRows.length ? <div className="py-12 text-center text-sm text-slate-500">No CBEs yet. Create one to get started.</div> : null}
            <PaginationFooter page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} onPageSizeChange={setPageSize} />
          </>
        )}
      </RegisterTable>

      <ProcModal
        open={modalOpen}
        title="New Competitive Bid Evaluation"
        onClose={() => setModalOpen(false)}
        wide
        footer={
          <>
            <button type="button" className={secondaryBtnClass} onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="button" className={primaryBtnClass} disabled={saving} onClick={() => void save()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {saving ? 'Creating…' : 'Create CBE'}
            </button>
          </>
        }
      >
        {error && modalOpen ? (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className={labelClass}>Title *</label>
            <input className={inputClass} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </div>
          <SearchableSelect
            label="RFQ Number"
            value={form.rfqNumber}
            options={rfqOptions}
            placeholder="Select RFQ…"
            onChange={(v) => setForm((f) => ({ ...f, rfqNumber: v }))}
          />
          <div>
            <label className={labelClass}>Project</label>
            <input className={inputClass} value={form.project} onChange={(e) => setForm((f) => ({ ...f, project: e.target.value }))} />
          </div>
          <DepartmentLookup value={form.department} onChange={(name) => setForm((f) => ({ ...f, department: name }))} />
          <EmployeeLookup
            label="Buyer"
            value={form.buyerName}
            onChange={(name) => setForm((f) => ({ ...f, buyerName: name }))}
          />
          <div>
            <label className={labelClass}>Currency</label>
            <select className={selectClass} value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}>
              {['NGN', 'USD', 'EUR', 'GBP'].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Evaluation method</label>
            <select className={selectClass} value={form.evaluationMethod} onChange={(e) => setForm((f) => ({ ...f, evaluationMethod: e.target.value }))}>
              {EVALUATION_METHODS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Status</label>
            <select className={selectClass} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              {CBE_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
      </ProcModal>
    </div>
  );
}
