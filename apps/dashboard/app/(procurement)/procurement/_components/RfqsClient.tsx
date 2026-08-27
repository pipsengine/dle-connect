'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  FileQuestion,
  Loader2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { procurementGet, procurementPost } from '../lib/procurement-api';
import { EmployeeLookup, SearchableSelect } from './proc-lookups';
import {
  FilterBar,
  KpiCard,
  PaginationFooter,
  PersonCell,
  ProcModal,
  RegisterTable,
  StatusBadge,
  exportCsv,
  formatDate,
  formatWhen,
  inputClass,
  labelClass,
  primaryBtnClass,
  secondaryBtnClass,
  selectClass,
  toDateInput,
} from './proc-ui';
import type { PurchaseRequisitionRow } from './PurchaseRequisitionsClient';

export type RfqRow = {
  rfqId: string;
  prId: string | null;
  title: string;
  status: string;
  issueDate: string | null;
  submissionDeadline: string | null;
  buyerName: string | null;
  updatedAt: string;
};

const RFQ_STATUSES = ['Draft', 'Open', 'Closed', 'Cancelled'] as const;

type RfqForm = {
  rfqId?: string;
  title: string;
  prId: string;
  buyerName: string;
  status: string;
  issueDate: string;
  submissionDeadline: string;
};

const emptyForm = (): RfqForm => ({
  title: '',
  prId: '',
  buyerName: '',
  status: 'Draft',
  issueDate: '',
  submissionDeadline: '',
});

function statusNorm(s: string) {
  return s.trim().toLowerCase();
}

function isOpenStatus(s: string) {
  const n = statusNorm(s);
  return n === 'open' || n === 'issued';
}

export function RfqsClient() {
  const [rows, setRows] = useState<RfqRow[]>([]);
  const [prs, setPrs] = useState<PurchaseRequisitionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<RfqForm>(emptyForm());
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [rfqs, prList] = await Promise.all([
        procurementGet<RfqRow[]>('rfqs'),
        procurementGet<PurchaseRequisitionRow[]>('purchase-requisitions'),
      ]);
      setRows(rfqs);
      setPrs(prList);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load RFQs');
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
      open: count(isOpenStatus),
      closed: count((s) => statusNorm(s) === 'closed'),
      cancelled: count((s) => statusNorm(s) === 'cancelled'),
    };
  }, [rows]);

  const prOptions = useMemo(
    () =>
      prs.map((pr) => ({
        value: pr.prId,
        label: `${pr.prId} — ${pr.title}`,
        sub: [pr.department, pr.status].filter(Boolean).join(' · '),
      })),
    [prs],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter) {
        if (statusNorm(statusFilter) === 'open') {
          if (!isOpenStatus(r.status)) return false;
        } else if (statusNorm(r.status) !== statusNorm(statusFilter)) {
          return false;
        }
      }
      if (!q) return true;
      return [r.rfqId, r.title, r.prId, r.buyerName, r.status]
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

  const openEdit = (row: RfqRow) => {
    const status = isOpenStatus(row.status) && statusNorm(row.status) === 'issued' ? 'Open' : row.status;
    setForm({
      rfqId: row.rfqId,
      title: row.title,
      prId: row.prId || '',
      buyerName: row.buyerName || '',
      status: RFQ_STATUSES.includes(status as (typeof RFQ_STATUSES)[number]) ? status : row.status,
      issueDate: toDateInput(row.issueDate),
      submissionDeadline: toDateInput(row.submissionDeadline),
    });
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
      await procurementPost('upsert-rfq', {
        payload: {
          rfqId: form.rfqId,
          title: form.title.trim(),
          prId: form.prId || null,
          buyerName: form.buyerName.trim() || null,
          status: form.status === 'Open' ? 'Issued' : form.status,
          issueDate: form.issueDate || null,
          submissionDeadline: form.submissionDeadline || null,
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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Request for Quotations</h1>
          <p className="mt-1 text-sm text-slate-600">
            Issue RFQs linked to purchase requisitions and track supplier response windows.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void load()} className={secondaryBtnClass}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <button type="button" onClick={openCreate} className={primaryBtnClass}>
            <Plus className="h-4 w-4" /> New RFQ
          </button>
        </div>
      </div>

      {error && !modalOpen ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Total" value={kpis.total} icon={<FileQuestion className="h-4 w-4" />} />
        <KpiCard label="Draft" value={kpis.draft} icon={<FileQuestion className="h-4 w-4" />} tint="bg-slate-100 text-slate-700" />
        <KpiCard label="Open" value={kpis.open} icon={<FileQuestion className="h-4 w-4" />} tint="bg-emerald-50 text-emerald-700" />
        <KpiCard label="Closed" value={kpis.closed} icon={<CheckCircle2 className="h-4 w-4" />} tint="bg-blue-50 text-blue-700" />
        <KpiCard label="Cancelled" value={kpis.cancelled} icon={<XCircle className="h-4 w-4" />} tint="bg-red-50 text-red-700" />
      </div>

      <FilterBar>
        <div className="min-w-[200px] flex-1">
          <label className={labelClass}>Search</label>
          <input className={inputClass} placeholder="RFQ no, title, buyer, PR…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="w-44">
          <label className={labelClass}>Status</label>
          <select className={selectClass} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All</option>
            {RFQ_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </FilterBar>

      <RegisterTable
        title="RFQ Register"
        count={filtered.length}
        onExport={() =>
          exportCsv(
            'rfqs.csv',
            ['RFQ No', 'Title', 'PR', 'Buyer', 'Status', 'Issue Date', 'Deadline', 'Updated'],
            filtered.map((r) => [
              r.rfqId,
              r.title,
              r.prId,
              r.buyerName,
              r.status,
              formatDate(r.issueDate),
              formatDate(r.submissionDeadline),
              formatWhen(r.updatedAt),
            ]),
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
                    <th className="px-3 py-3 text-left">RFQ No</th>
                    <th className="px-3 py-3 text-left">Title</th>
                    <th className="px-3 py-3 text-left">Linked PR</th>
                    <th className="px-3 py-3 text-left">Buyer</th>
                    <th className="px-3 py-3 text-left">Issue Date</th>
                    <th className="px-3 py-3 text-left">Deadline</th>
                    <th className="px-3 py-3 text-left">Status</th>
                    <th className="px-3 py-3 text-left">Updated</th>
                    <th className="px-3 py-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr key={row.rfqId} className="border-t border-slate-100 hover:bg-slate-50/80">
                      <td className="px-3 py-3">
                        <button type="button" className="font-semibold text-blue-600 hover:underline" onClick={() => openEdit(row)}>
                          {row.rfqId}
                        </button>
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-900">{row.title}</td>
                      <td className="px-3 py-3 text-slate-700">{row.prId || '—'}</td>
                      <td className="px-3 py-3"><PersonCell name={row.buyerName} /></td>
                      <td className="px-3 py-3 text-slate-600">{formatDate(row.issueDate)}</td>
                      <td className="px-3 py-3 text-slate-600">{formatDate(row.submissionDeadline)}</td>
                      <td className="px-3 py-3">
                        <StatusBadge status={isOpenStatus(row.status) ? 'Open' : row.status} />
                      </td>
                      <td className="px-3 py-3 text-slate-600">{formatWhen(row.updatedAt)}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1">
                          <button type="button" className="rounded-md border border-slate-200 p-1.5" onClick={() => openEdit(row)} title="View / Edit">
                            <Eye className="h-3.5 w-3.5 text-slate-600" />
                          </button>
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
            {!pageRows.length ? <div className="py-12 text-center text-sm text-slate-500">No RFQs match your filters.</div> : null}
            <PaginationFooter page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} onPageSizeChange={setPageSize} />
          </>
        )}
      </RegisterTable>

      <ProcModal
        open={modalOpen}
        title={form.rfqId ? `Edit ${form.rfqId}` : 'New RFQ'}
        onClose={() => setModalOpen(false)}
        wide
        footer={
          <>
            <button type="button" className={secondaryBtnClass} onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="button" className={primaryBtnClass} disabled={saving} onClick={() => void save()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving ? 'Saving…' : form.rfqId ? 'Update' : 'Create'}
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
            label="Linked PR"
            value={form.prId}
            options={prOptions}
            placeholder="Search purchase requisitions…"
            onChange={(v) => setForm((f) => ({ ...f, prId: v }))}
          />
          <EmployeeLookup
            label="Buyer"
            value={form.buyerName}
            onChange={(name) => setForm((f) => ({ ...f, buyerName: name }))}
          />
          <div>
            <label className={labelClass}>Status</label>
            <select className={selectClass} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              {RFQ_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Issue date</label>
            <input type="date" className={inputClass} value={form.issueDate} onChange={(e) => setForm((f) => ({ ...f, issueDate: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass}>Submission deadline</label>
            <input type="date" className={inputClass} value={form.submissionDeadline} onChange={(e) => setForm((f) => ({ ...f, submissionDeadline: e.target.value }))} />
          </div>
        </div>
      </ProcModal>
    </div>
  );
}
