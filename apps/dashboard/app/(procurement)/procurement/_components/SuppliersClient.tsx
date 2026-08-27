'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  Eye,
  Loader2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Users,
} from 'lucide-react';
import { procurementGet, procurementPost } from '../lib/procurement-api';
import { LocationLookup } from './proc-lookups';
import {
  FilterBar,
  KpiCard,
  PaginationFooter,
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

type SupplierRow = {
  supplierId: string;
  name: string;
  code: string | null;
  isApproved: boolean;
  currency: string | null;
  paymentTerms: string | null;
  deliveryPeriod: string | null;
  deliveryLocation: string | null;
  outstanding: number;
  email: string | null;
  phone: string | null;
  notes: string | null;
  isActive: boolean;
  isBlacklisted: boolean;
  updatedAt: string;
};

type SupplierForm = {
  supplierId?: string;
  name: string;
  code: string;
  deliveryLocation: string;
  email: string;
  phone: string;
  paymentTerms: string;
  deliveryPeriod: string;
  currency: string;
  isApproved: boolean;
  isActive: boolean;
  isBlacklisted: boolean;
  notes: string;
};

const emptyForm = (): SupplierForm => ({
  name: '',
  code: '',
  deliveryLocation: '',
  email: '',
  phone: '',
  paymentTerms: '',
  deliveryPeriod: '',
  currency: 'NGN',
  isApproved: false,
  isActive: true,
  isBlacklisted: false,
  notes: '',
});

export function SuppliersClient() {
  const [rows, setRows] = useState<SupplierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<SupplierForm>(emptyForm());
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await procurementGet<SupplierRow[]>('suppliers'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load suppliers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const kpis = useMemo(
    () => ({
      total: rows.length,
      approved: rows.filter((r) => r.isApproved && !r.isBlacklisted).length,
      pending: rows.filter((r) => !r.isApproved && r.isActive && !r.isBlacklisted).length,
      inactive: rows.filter((r) => !r.isActive && !r.isBlacklisted).length,
      blacklisted: rows.filter((r) => r.isBlacklisted).length,
    }),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter === 'Approved' && !(r.isApproved && !r.isBlacklisted)) return false;
      if (statusFilter === 'Pending Approval' && !(!r.isApproved && r.isActive && !r.isBlacklisted)) return false;
      if (statusFilter === 'Inactive' && !(!r.isActive && !r.isBlacklisted)) return false;
      if (statusFilter === 'Blacklisted' && !r.isBlacklisted) return false;
      if (statusFilter === 'Active' && !(r.isActive && !r.isBlacklisted)) return false;
      if (!q) return true;
      return [r.supplierId, r.name, r.code, r.email, r.phone, r.deliveryLocation, r.currency]
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

  const openEdit = (row: SupplierRow) => {
    setForm({
      supplierId: row.supplierId,
      name: row.name,
      code: row.code || '',
      deliveryLocation: row.deliveryLocation || '',
      email: row.email || '',
      phone: row.phone || '',
      paymentTerms: row.paymentTerms || '',
      deliveryPeriod: row.deliveryPeriod || '',
      currency: row.currency || 'NGN',
      isApproved: row.isApproved,
      isActive: row.isActive,
      isBlacklisted: row.isBlacklisted,
      notes: row.notes || '',
    });
    setError('');
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      setError('Name is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await procurementPost('upsert-supplier', {
        payload: {
          supplierId: form.supplierId,
          name: form.name.trim(),
          code: form.code.trim() || null,
          deliveryLocation: form.deliveryLocation.trim() || null,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          paymentTerms: form.paymentTerms.trim() || null,
          deliveryPeriod: form.deliveryPeriod.trim() || null,
          currency: form.currency || 'NGN',
          isApproved: form.isApproved,
          isActive: form.isActive,
          isBlacklisted: form.isBlacklisted,
          notes: form.notes.trim() || null,
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
          <h1 className="text-2xl font-black text-slate-900">Suppliers</h1>
          <p className="mt-1 text-sm text-slate-600">
            Maintain supplier master data, approvals, and delivery details.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void load()} className={secondaryBtnClass}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <button type="button" onClick={openCreate} className={primaryBtnClass}>
            <Plus className="h-4 w-4" /> New Supplier
          </button>
        </div>
      </div>

      {error && !modalOpen ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Total" value={kpis.total} icon={<Users className="h-4 w-4" />} />
        <KpiCard label="Approved" value={kpis.approved} icon={<CheckCircle2 className="h-4 w-4" />} tint="bg-emerald-50 text-emerald-700" />
        <KpiCard label="Pending Approval" value={kpis.pending} icon={<Users className="h-4 w-4" />} tint="bg-amber-50 text-amber-700" />
        <KpiCard label="Inactive" value={kpis.inactive} icon={<Users className="h-4 w-4" />} tint="bg-slate-100 text-slate-700" />
        <KpiCard label="Blacklisted" value={kpis.blacklisted} icon={<Ban className="h-4 w-4" />} tint="bg-red-50 text-red-700" />
      </div>

      <FilterBar>
        <div className="min-w-[200px] flex-1">
          <label className={labelClass}>Search</label>
          <input className={inputClass} placeholder="Name, code, email, location…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="w-48">
          <label className={labelClass}>Status</label>
          <select className={selectClass} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All</option>
            <option value="Active">Active</option>
            <option value="Approved">Approved</option>
            <option value="Pending Approval">Pending Approval</option>
            <option value="Inactive">Inactive</option>
            <option value="Blacklisted">Blacklisted</option>
          </select>
        </div>
      </FilterBar>

      <RegisterTable
        title="Supplier Register"
        count={filtered.length}
        onExport={() =>
          exportCsv(
            'suppliers.csv',
            ['ID', 'Name', 'Code', 'Currency', 'Approved', 'Outstanding', 'Active', 'Blacklisted', 'Updated'],
            filtered.map((r) => [
              r.supplierId,
              r.name,
              r.code,
              r.currency,
              r.isApproved ? 'Yes' : 'No',
              r.outstanding,
              r.isActive ? 'Yes' : 'No',
              r.isBlacklisted ? 'Yes' : 'No',
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
                    <th className="px-3 py-3 text-left">ID</th>
                    <th className="px-3 py-3 text-left">Name</th>
                    <th className="px-3 py-3 text-left">Code</th>
                    <th className="px-3 py-3 text-left">Country / Currency</th>
                    <th className="px-3 py-3 text-left">Approved</th>
                    <th className="px-3 py-3 text-left">Outstanding</th>
                    <th className="px-3 py-3 text-left">Updated</th>
                    <th className="px-3 py-3 text-left">Status</th>
                    <th className="px-3 py-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr key={row.supplierId} className="border-t border-slate-100 hover:bg-slate-50/80">
                      <td className="px-3 py-3">
                        <button type="button" className="font-semibold text-blue-600 hover:underline" onClick={() => openEdit(row)}>
                          {row.supplierId}
                        </button>
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-900">{row.name}</td>
                      <td className="px-3 py-3 text-slate-700">{row.code || '—'}</td>
                      <td className="px-3 py-3 text-slate-700">
                        <div>{row.deliveryLocation || '—'}</div>
                        <div className="text-xs text-slate-500">{row.currency || 'NGN'}</div>
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge status={row.isApproved ? 'Approved' : 'Pending Approval'} />
                      </td>
                      <td className="px-3 py-3 tabular-nums text-slate-800">{moneyPlain(row.outstanding, row.currency || 'NGN')}</td>
                      <td className="px-3 py-3 text-slate-600">{formatWhen(row.updatedAt)}</td>
                      <td className="px-3 py-3">
                        <StatusBadge
                          status={row.isBlacklisted ? 'Blacklisted' : row.isActive ? 'Active' : 'Inactive'}
                        />
                      </td>
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
            {!pageRows.length ? <div className="py-12 text-center text-sm text-slate-500">No suppliers match your filters.</div> : null}
            <PaginationFooter page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} onPageSizeChange={setPageSize} />
          </>
        )}
      </RegisterTable>

      <ProcModal
        open={modalOpen}
        title={form.supplierId ? `Edit ${form.name || form.supplierId}` : 'New Supplier'}
        onClose={() => setModalOpen(false)}
        wide
        footer={
          <>
            <button type="button" className={secondaryBtnClass} onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="button" className={primaryBtnClass} disabled={saving} onClick={() => void save()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving ? 'Saving…' : form.supplierId ? 'Update' : 'Create'}
            </button>
          </>
        }
      >
        {error && modalOpen ? (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className={labelClass}>Name *</label>
            <input className={inputClass} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass}>Code</label>
            <input className={inputClass} value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
          </div>
          <LocationLookup
            label="Delivery location"
            value={form.deliveryLocation}
            onChange={(name) => setForm((f) => ({ ...f, deliveryLocation: name }))}
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
            <label className={labelClass}>Email</label>
            <input type="email" className={inputClass} value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass}>Phone</label>
            <input className={inputClass} value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass}>Payment terms</label>
            <input className={inputClass} value={form.paymentTerms} onChange={(e) => setForm((f) => ({ ...f, paymentTerms: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass}>Delivery period</label>
            <input className={inputClass} value={form.deliveryPeriod} onChange={(e) => setForm((f) => ({ ...f, deliveryPeriod: e.target.value }))} />
          </div>
          <label className="flex h-10 items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={form.isApproved} onChange={(e) => setForm((f) => ({ ...f, isApproved: e.target.checked }))} />
            Approved
          </label>
          <label className="flex h-10 items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
            Active
          </label>
          <label className="flex h-10 items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={form.isBlacklisted} onChange={(e) => setForm((f) => ({ ...f, isBlacklisted: e.target.checked }))} />
            Blacklisted
          </label>
          <div className="md:col-span-2">
            <label className={labelClass}>Notes</label>
            <textarea className={`${inputClass} min-h-[80px] py-2`} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
      </ProcModal>
    </div>
  );
}
