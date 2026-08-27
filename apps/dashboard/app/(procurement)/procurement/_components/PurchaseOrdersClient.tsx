'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  Loader2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  ShoppingCart,
} from 'lucide-react';
import { procurementGet, procurementPost } from '../lib/procurement-api';
import { SearchableSelect } from './proc-lookups';
import {
  FilterBar,
  KpiCard,
  PaginationFooter,
  ProcModal,
  RegisterTable,
  StatusBadge,
  exportCsv,
  formatDate,
  formatWhen,
  inputClass,
  labelClass,
  moneyPlain,
  primaryBtnClass,
  secondaryBtnClass,
  selectClass,
  toDateInput,
} from './proc-ui';

type PurchaseOrderRow = {
  poId: string;
  title: string;
  supplierId: string | null;
  supplierName: string | null;
  cbeId: string | null;
  status: string;
  currency: string | null;
  amount: number | null;
  orderDate: string | null;
  expectedDate: string | null;
  updatedAt: string;
};

type SupplierRow = {
  supplierId: string;
  name: string;
  code: string | null;
};

type CbeRow = {
  cbeId: string;
  title: string;
  status: string;
};

const PO_STATUSES = [
  'Draft',
  'Pending Approval',
  'Approved',
  'Issued',
  'In Progress',
  'Completed',
  'Cancelled',
] as const;

type PoForm = {
  poId?: string;
  title: string;
  supplierId: string;
  supplierName: string;
  cbeId: string;
  status: string;
  currency: string;
  amount: string;
  orderDate: string;
  expectedDate: string;
};

const emptyForm = (): PoForm => ({
  title: '',
  supplierId: '',
  supplierName: '',
  cbeId: '',
  status: 'Draft',
  currency: 'NGN',
  amount: '',
  orderDate: '',
  expectedDate: '',
});

function statusNorm(s: string) {
  return s.trim().toLowerCase();
}

export function PurchaseOrdersClient() {
  const [rows, setRows] = useState<PurchaseOrderRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [cbes, setCbes] = useState<CbeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<PoForm>(emptyForm());
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [pos, sups, cbeList] = await Promise.all([
        procurementGet<PurchaseOrderRow[]>('purchase-orders'),
        procurementGet<SupplierRow[]>('suppliers'),
        procurementGet<CbeRow[]>('cbes'),
      ]);
      setRows(pos);
      setSuppliers(sups);
      setCbes(cbeList);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load purchase orders');
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
      pending: count((s) => statusNorm(s) === 'pending approval'),
      approved: count((s) => statusNorm(s) === 'approved'),
      issued: count((s) => statusNorm(s) === 'issued'),
    };
  }, [rows]);

  const supplierOptions = useMemo(
    () =>
      suppliers.map((s) => ({
        value: s.supplierId,
        label: s.name,
        sub: s.code || s.supplierId,
      })),
    [suppliers],
  );

  const cbeOptions = useMemo(
    () =>
      cbes.map((c) => ({
        value: c.cbeId,
        label: `${c.cbeId} — ${c.title}`,
        sub: c.status,
      })),
    [cbes],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter && statusNorm(r.status) !== statusNorm(statusFilter)) return false;
      if (!q) return true;
      return [r.poId, r.title, r.supplierName, r.cbeId, r.status]
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

  const openEdit = (row: PurchaseOrderRow) => {
    setForm({
      poId: row.poId,
      title: row.title,
      supplierId: row.supplierId || '',
      supplierName: row.supplierName || '',
      cbeId: row.cbeId || '',
      status: row.status || 'Draft',
      currency: row.currency || 'NGN',
      amount: row.amount == null ? '' : String(row.amount),
      orderDate: toDateInput(row.orderDate),
      expectedDate: toDateInput(row.expectedDate),
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
      await procurementPost('upsert-po', {
        payload: {
          poId: form.poId,
          title: form.title.trim(),
          supplierId: form.supplierId || null,
          supplierName: form.supplierName.trim() || null,
          cbeId: form.cbeId || null,
          status: form.status,
          currency: form.currency || 'NGN',
          amount: form.amount === '' ? null : Number(form.amount),
          orderDate: form.orderDate || null,
          expectedDate: form.expectedDate || null,
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
          <h1 className="text-2xl font-black text-slate-900">Purchase Orders</h1>
          <p className="mt-1 text-sm text-slate-600">
            Create and track purchase orders linked to suppliers and awarded CBEs.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void load()} className={secondaryBtnClass}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <button type="button" onClick={openCreate} className={primaryBtnClass}>
            <Plus className="h-4 w-4" /> New Purchase Order
          </button>
        </div>
      </div>

      {error && !modalOpen ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Total" value={kpis.total} icon={<ShoppingCart className="h-4 w-4" />} />
        <KpiCard label="Draft" value={kpis.draft} icon={<ShoppingCart className="h-4 w-4" />} tint="bg-slate-100 text-slate-700" />
        <KpiCard label="Pending Approval" value={kpis.pending} icon={<ShoppingCart className="h-4 w-4" />} tint="bg-amber-50 text-amber-700" />
        <KpiCard label="Approved" value={kpis.approved} icon={<CheckCircle2 className="h-4 w-4" />} tint="bg-emerald-50 text-emerald-700" />
        <KpiCard label="Issued" value={kpis.issued} icon={<ShoppingCart className="h-4 w-4" />} tint="bg-blue-50 text-blue-700" />
      </div>

      <FilterBar>
        <div className="min-w-[200px] flex-1">
          <label className={labelClass}>Search</label>
          <input className={inputClass} placeholder="PO no, title, supplier, CBE…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="w-48">
          <label className={labelClass}>Status</label>
          <select className={selectClass} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All</option>
            {PO_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </FilterBar>

      <RegisterTable
        title="PO Register"
        count={filtered.length}
        onExport={() =>
          exportCsv(
            'purchase-orders.csv',
            ['PO No', 'Title', 'Supplier', 'CBE', 'Amount', 'Status', 'Order Date', 'Expected', 'Updated'],
            filtered.map((r) => [
              r.poId,
              r.title,
              r.supplierName,
              r.cbeId,
              r.amount,
              r.status,
              formatDate(r.orderDate),
              formatDate(r.expectedDate),
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
                    <th className="px-3 py-3 text-left">PO No</th>
                    <th className="px-3 py-3 text-left">Title</th>
                    <th className="px-3 py-3 text-left">Supplier</th>
                    <th className="px-3 py-3 text-left">CBE</th>
                    <th className="px-3 py-3 text-left">Amount</th>
                    <th className="px-3 py-3 text-left">Order Date</th>
                    <th className="px-3 py-3 text-left">Expected</th>
                    <th className="px-3 py-3 text-left">Status</th>
                    <th className="px-3 py-3 text-left">Updated</th>
                    <th className="px-3 py-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr key={row.poId} className="border-t border-slate-100 hover:bg-slate-50/80">
                      <td className="px-3 py-3">
                        <button type="button" className="font-semibold text-blue-600 hover:underline" onClick={() => openEdit(row)}>
                          {row.poId}
                        </button>
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-900">{row.title}</td>
                      <td className="px-3 py-3 text-slate-700">{row.supplierName || '—'}</td>
                      <td className="px-3 py-3 text-slate-700">{row.cbeId || '—'}</td>
                      <td className="px-3 py-3 tabular-nums text-slate-800">{moneyPlain(row.amount, row.currency || 'NGN')}</td>
                      <td className="px-3 py-3 text-slate-600">{formatDate(row.orderDate)}</td>
                      <td className="px-3 py-3 text-slate-600">{formatDate(row.expectedDate)}</td>
                      <td className="px-3 py-3"><StatusBadge status={row.status} /></td>
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
            {!pageRows.length ? <div className="py-12 text-center text-sm text-slate-500">No purchase orders match your filters.</div> : null}
            <PaginationFooter page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} onPageSizeChange={setPageSize} />
          </>
        )}
      </RegisterTable>

      <ProcModal
        open={modalOpen}
        title={form.poId ? `Edit ${form.poId}` : 'New Purchase Order'}
        onClose={() => setModalOpen(false)}
        wide
        footer={
          <>
            <button type="button" className={secondaryBtnClass} onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="button" className={primaryBtnClass} disabled={saving} onClick={() => void save()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving ? 'Saving…' : form.poId ? 'Update' : 'Create'}
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
            label="Supplier"
            value={form.supplierId}
            options={supplierOptions}
            placeholder="Search suppliers…"
            onChange={(v, opt) =>
              setForm((f) => ({
                ...f,
                supplierId: v,
                supplierName: opt?.label || '',
              }))
            }
          />
          <SearchableSelect
            label="Linked CBE"
            value={form.cbeId}
            options={cbeOptions}
            placeholder="Search CBEs…"
            onChange={(v) => setForm((f) => ({ ...f, cbeId: v }))}
          />
          <div>
            <label className={labelClass}>Status</label>
            <select className={selectClass} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              {PO_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Currency</label>
            <select className={selectClass} value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}>
              {['NGN', 'USD', 'EUR', 'GBP'].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Amount</label>
            <input type="number" className={inputClass} value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass}>Order date</label>
            <input type="date" className={inputClass} value={form.orderDate} onChange={(e) => setForm((f) => ({ ...f, orderDate: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass}>Expected date</label>
            <input type="date" className={inputClass} value={form.expectedDate} onChange={(e) => setForm((f) => ({ ...f, expectedDate: e.target.value }))} />
          </div>
        </div>
      </ProcModal>
    </div>
  );
}
