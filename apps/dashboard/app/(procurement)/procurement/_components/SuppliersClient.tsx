'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Ban,
  Building2,
  CheckCircle2,
  CloudDownload,
  Eye,
  Globe,
  Loader2,
  Mail,
  MapPin,
  MoreHorizontal,
  Phone,
  Plus,
  RefreshCw,
  Sparkles,
  UserRound,
  Users,
} from 'lucide-react';
import { procurementGet, procurementPost } from '../lib/procurement-api';
import { LocationLookup, SearchableSelect } from './proc-lookups';
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
  sageCode?: string | null;
  source?: string;
  shortName?: string | null;
  contactName?: string | null;
  isApproved: boolean;
  currency: string | null;
  paymentTerms: string | null;
  deliveryPeriod: string | null;
  deliveryLocation: string | null;
  addressLine?: string | null;
  city?: string | null;
  stateName?: string | null;
  country?: string | null;
  postalCode?: string | null;
  outstanding: number;
  email: string | null;
  phone: string | null;
  mobile?: string | null;
  website?: string | null;
  taxId?: string | null;
  registrationNo?: string | null;
  notes: string | null;
  isActive: boolean;
  isBlacklisted: boolean;
  updatedAt: string;
};

type SupplierForm = {
  supplierId?: string;
  name: string;
  shortName: string;
  code: string;
  contactName: string;
  deliveryLocation: string;
  addressLine: string;
  city: string;
  stateName: string;
  country: string;
  postalCode: string;
  email: string;
  phone: string;
  mobile: string;
  website: string;
  taxId: string;
  registrationNo: string;
  paymentTerms: string;
  deliveryPeriod: string;
  currency: string;
  isApproved: boolean;
  isActive: boolean;
  isBlacklisted: boolean;
  notes: string;
  source?: string;
};

type CardKey = '' | 'Sage' | 'Approved' | 'Pending Approval' | 'Inactive' | 'Blacklisted';

const CURRENCIES = ['NGN', 'USD', 'EUR', 'GBP', 'ZAR', 'GHS'];
const COUNTRIES = [
  'Nigeria',
  'Ghana',
  'United Kingdom',
  'United States',
  'South Africa',
  'Cameroon',
  'Kenya',
  'China',
  'India',
  'United Arab Emirates',
  'Germany',
  'France',
];
const NIGERIA_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno', 'Cross River',
  'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano',
  'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo',
  'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara',
];

const optionList = (values: string[]) => values.map((value) => ({ value, label: value }));

const emptyForm = (code = ''): SupplierForm => ({
  name: '',
  shortName: '',
  code,
  contactName: '',
  deliveryLocation: '',
  addressLine: '',
  city: '',
  stateName: '',
  country: 'Nigeria',
  postalCode: '',
  email: '',
  phone: '',
  mobile: '',
  website: '',
  taxId: '',
  registrationNo: '',
  paymentTerms: '',
  deliveryPeriod: '',
  currency: 'NGN',
  isApproved: true,
  isActive: true,
  isBlacklisted: false,
  notes: '',
  source: 'LOCAL',
});

const placeLabel = (row: Pick<SupplierRow, 'city' | 'stateName' | 'country' | 'deliveryLocation'>) =>
  [row.city, row.stateName, row.country].filter(Boolean).join(', ') || row.deliveryLocation || '—';

function TogglePill({
  label,
  checked,
  onChange,
  tone = 'blue',
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  tone?: 'blue' | 'green' | 'red';
}) {
  const active =
    tone === 'green'
      ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
      : tone === 'red'
        ? 'border-red-300 bg-red-50 text-red-800'
        : 'border-blue-300 bg-blue-50 text-blue-800';
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
        checked ? active : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
      }`}
    >
      {label}
    </button>
  );
}

export function SuppliersClient() {
  const [rows, setRows] = useState<SupplierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<SupplierForm>(emptyForm());
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<CardKey | string>('');
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
      sage: rows.filter((r) => (r.source || '').toUpperCase() === 'SAGE').length,
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
      if (statusFilter === 'Sage' && (r.source || '').toUpperCase() !== 'SAGE') return false;
      if (statusFilter === 'Local' && (r.source || '').toUpperCase() === 'SAGE') return false;
      if (!q) return true;
      return [
        r.supplierId, r.name, r.shortName, r.contactName, r.code, r.sageCode, r.email, r.phone, r.mobile,
        r.deliveryLocation, r.addressLine, r.city, r.stateName, r.country, r.currency, r.source, r.taxId,
        r.registrationNo,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [rows, search, statusFilter]);

  const sliceStats = useMemo(() => {
    const withEmail = filtered.filter((r) => r.email).length;
    const withPhone = filtered.filter((r) => r.phone || r.mobile).length;
    const withAddress = filtered.filter((r) => r.addressLine || r.city || r.country).length;
    const missingContact = filtered.filter((r) => !r.email && !r.phone && !r.mobile).length;
    return { withEmail, withPhone, withAddress, missingContact };
  }, [filtered]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, pageSize]);

  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const isEdit = Boolean(form.supplierId);

  const selectCard = (key: CardKey) => {
    setStatusFilter((current) => (key === '' ? '' : current === key ? '' : key));
  };

  const openCreate = async () => {
    setError('');
    setNotice('');
    try {
      const next = await procurementGet<{ code: string }>('next-supplier-code');
      setForm(emptyForm(next.code));
      setModalOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to prepare supplier form');
    }
  };

  const openEdit = (row: SupplierRow) => {
    setForm({
      supplierId: row.supplierId,
      name: row.name,
      shortName: row.shortName || '',
      code: row.code || '',
      contactName: row.contactName || '',
      deliveryLocation: row.deliveryLocation || '',
      addressLine: row.addressLine || '',
      city: row.city || '',
      stateName: row.stateName || '',
      country: row.country || 'Nigeria',
      postalCode: row.postalCode || '',
      email: row.email || '',
      phone: row.phone || '',
      mobile: row.mobile || '',
      website: row.website || '',
      taxId: row.taxId || '',
      registrationNo: row.registrationNo || '',
      paymentTerms: row.paymentTerms || '',
      deliveryPeriod: row.deliveryPeriod || '',
      currency: row.currency || 'NGN',
      isApproved: row.isApproved,
      isActive: row.isActive,
      isBlacklisted: row.isBlacklisted,
      notes: row.notes || '',
      source: row.source || 'LOCAL',
    });
    setError('');
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      setError('Supplier name is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const composedLocation =
        form.deliveryLocation.trim()
        || [form.city, form.stateName, form.country].map((v) => v.trim()).filter(Boolean).join(', ');
      await procurementPost('upsert-supplier', {
        payload: {
          supplierId: form.supplierId,
          name: form.name.trim(),
          shortName: form.shortName.trim() || null,
          code: form.code.trim() || null,
          contactName: form.contactName.trim() || null,
          deliveryLocation: composedLocation || null,
          addressLine: form.addressLine.trim() || null,
          city: form.city.trim() || null,
          stateName: form.stateName.trim() || null,
          country: form.country.trim() || null,
          postalCode: form.postalCode.trim() || null,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          mobile: form.mobile.trim() || null,
          website: form.website.trim() || null,
          taxId: form.taxId.trim() || null,
          registrationNo: form.registrationNo.trim() || null,
          paymentTerms: form.paymentTerms.trim() || null,
          deliveryPeriod: form.deliveryPeriod.trim() || null,
          currency: form.currency || 'NGN',
          isApproved: form.isApproved,
          isActive: form.isActive,
          isBlacklisted: form.isBlacklisted,
          notes: form.notes.trim() || null,
          source: form.source || 'LOCAL',
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

  const syncSage = async () => {
    setSyncing(true);
    setError('');
    setNotice('');
    try {
      const result = await procurementPost<{ fetched: number; inserted: number; updated: number; table?: string }>(
        'sync-sage-suppliers',
      );
      setNotice(
        `Sage sync complete. ${result.fetched} distinct suppliers read, ${result.inserted} added, ${result.updated} updated.`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sage supplier sync failed');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Suppliers</h1>
          <p className="mt-1 text-sm text-slate-600">
            Sage X3 supplier master seated in DLE_Enterprise, plus locally created vendors.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void load()} className={secondaryBtnClass}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <button type="button" onClick={() => void syncSage()} className={secondaryBtnClass} disabled={syncing}>
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudDownload className="h-4 w-4" />}
            {syncing ? 'Syncing Sage…' : 'Sync from Sage'}
          </button>
          <button type="button" onClick={() => void openCreate()} className={primaryBtnClass}>
            <Plus className="h-4 w-4" /> New Supplier
          </button>
        </div>
      </div>

      {error && !modalOpen ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}
      {notice ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <KpiCard
          label="Total"
          value={kpis.total}
          icon={<Users className="h-4 w-4" />}
          onClick={() => selectCard('')}
          active={statusFilter === ''}
          hint="All records"
        />
        <KpiCard
          label="From Sage"
          value={kpis.sage}
          icon={<CloudDownload className="h-4 w-4" />}
          tint="bg-sky-50 text-sky-700"
          onClick={() => selectCard('Sage')}
          active={statusFilter === 'Sage'}
          hint="Click to view"
        />
        <KpiCard
          label="Approved"
          value={kpis.approved}
          icon={<CheckCircle2 className="h-4 w-4" />}
          tint="bg-emerald-50 text-emerald-700"
          onClick={() => selectCard('Approved')}
          active={statusFilter === 'Approved'}
          hint="Click to view"
        />
        <KpiCard
          label="Pending Approval"
          value={kpis.pending}
          icon={<Users className="h-4 w-4" />}
          tint="bg-amber-50 text-amber-700"
          onClick={() => selectCard('Pending Approval')}
          active={statusFilter === 'Pending Approval'}
          hint="Click to view"
        />
        <KpiCard
          label="Inactive"
          value={kpis.inactive}
          icon={<Users className="h-4 w-4" />}
          tint="bg-slate-100 text-slate-700"
          onClick={() => selectCard('Inactive')}
          active={statusFilter === 'Inactive'}
          hint="Click to view"
        />
        <KpiCard
          label="Blacklisted"
          value={kpis.blacklisted}
          icon={<Ban className="h-4 w-4" />}
          tint="bg-red-50 text-red-700"
          onClick={() => selectCard('Blacklisted')}
          active={statusFilter === 'Blacklisted'}
          hint="Click to view"
        />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-black text-slate-900">{statusFilter || 'All suppliers'}</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {filtered.length} record{filtered.length === 1 ? '' : 's'} in this view. Click a card to filter, then open a supplier for full Sage contact details.
            </p>
          </div>
          {statusFilter ? (
            <button type="button" className={secondaryBtnClass} onClick={() => setStatusFilter('')}>
              Clear filter
            </button>
          ) : null}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['With email', sliceStats.withEmail],
            ['With phone', sliceStats.withPhone],
            ['With address', sliceStats.withAddress],
            ['Missing contact', sliceStats.missingContact],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
              <div className="mt-1 text-lg font-black tabular-nums text-slate-900">{value}</div>
            </div>
          ))}
        </div>
        {filtered.length ? (
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {filtered.slice(0, 8).map((row) => (
              <button
                key={row.supplierId}
                type="button"
                onClick={() => openEdit(row)}
                className="rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-blue-300 hover:bg-blue-50/40"
              >
                <div className="truncate text-sm font-semibold text-slate-900">{row.name}</div>
                <div className="mt-1 truncate text-xs text-slate-500">{row.code || row.sageCode}</div>
                <div className="mt-2 truncate text-xs text-slate-600">{row.email || 'No email on file'}</div>
                <div className="truncate text-xs text-slate-600">{row.phone || row.mobile || 'No phone on file'}</div>
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">No suppliers in this slice.</p>
        )}
      </section>

      <FilterBar>
        <div className="min-w-[200px] flex-1">
          <label className={labelClass}>Search</label>
          <input
            className={inputClass}
            placeholder="Name, code, email, phone, city, tax ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
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
            <option value="Sage">Sage</option>
            <option value="Local">Local</option>
          </select>
        </div>
      </FilterBar>

      <RegisterTable
        title="Supplier Register"
        count={filtered.length}
        onExport={() =>
          exportCsv(
            'suppliers.csv',
            [
              'ID', 'Name', 'Code', 'Source', 'Contact', 'Email', 'Phone', 'Mobile', 'Address', 'City',
              'State', 'Country', 'Currency', 'Tax ID', 'Registration', 'Approved', 'Active', 'Updated',
            ],
            filtered.map((r) => [
              r.supplierId,
              r.name,
              r.code,
              r.source || 'LOCAL',
              r.contactName,
              r.email,
              r.phone,
              r.mobile,
              r.addressLine,
              r.city,
              r.stateName,
              r.country,
              r.currency,
              r.taxId,
              r.registrationNo,
              r.isApproved ? 'Yes' : 'No',
              r.isActive ? 'Yes' : 'No',
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
                    <th className="px-3 py-3 text-left">Code</th>
                    <th className="px-3 py-3 text-left">Name</th>
                    <th className="px-3 py-3 text-left">Contact</th>
                    <th className="px-3 py-3 text-left">Location</th>
                    <th className="px-3 py-3 text-left">Source</th>
                    <th className="px-3 py-3 text-left">Approved</th>
                    <th className="px-3 py-3 text-left">Outstanding</th>
                    <th className="px-3 py-3 text-left">Status</th>
                    <th className="px-3 py-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr key={row.supplierId} className="border-t border-slate-100 hover:bg-slate-50/80">
                      <td className="px-3 py-3">
                        <button type="button" className="font-semibold text-blue-600 hover:underline" onClick={() => openEdit(row)}>
                          {row.code || row.supplierId}
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-semibold text-slate-900">{row.name}</div>
                        {row.shortName ? <div className="text-xs text-slate-500">{row.shortName}</div> : null}
                      </td>
                      <td className="px-3 py-3 text-slate-700">
                        {row.contactName ? <div className="text-xs font-medium text-slate-800">{row.contactName}</div> : null}
                        <div className="text-xs">{row.email || 'No email'}</div>
                        <div className="text-xs text-slate-500">{row.phone || row.mobile || 'No phone'}</div>
                      </td>
                      <td className="px-3 py-3 text-slate-700">
                        <div>{placeLabel(row)}</div>
                        <div className="text-xs text-slate-500">{row.currency || 'NGN'}</div>
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge status={(row.source || 'LOCAL').toUpperCase() === 'SAGE' ? 'Sage' : 'Local'} />
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge status={row.isApproved ? 'Approved' : 'Pending Approval'} />
                      </td>
                      <td className="px-3 py-3 tabular-nums text-slate-800">{moneyPlain(row.outstanding, row.currency || 'NGN')}</td>
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
        title={isEdit ? 'Supplier details' : 'Create supplier'}
        subtitle={
          isEdit
            ? 'Sage master data and local edits are stored in DLE_Enterprise. Sage codes stay unique and are not duplicated.'
            : 'The supplier code is generated from the last code in this register. The record is stored in DLE_Enterprise.'
        }
        onClose={() => setModalOpen(false)}
        extraWide
        footer={
          <>
            <button type="button" className={secondaryBtnClass} onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button type="button" className={primaryBtnClass} disabled={saving} onClick={() => void save()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : isEdit ? null : <Plus className="h-4 w-4" />}
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create supplier'}
            </button>
          </>
        }
      >
        {error && modalOpen ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        ) : null}

        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              <Building2 className="h-3.5 w-3.5 text-blue-600" /> Identity
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className={labelClass}>Legal / trading name *</label>
                <input
                  className={inputClass}
                  placeholder="e.g. Dorman Long Engineering Ltd"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <label className={labelClass}>Short name</label>
                <input
                  className={inputClass}
                  placeholder="Sage short name / trading style"
                  value={form.shortName}
                  onChange={(e) => setForm((f) => ({ ...f, shortName: e.target.value }))}
                />
              </div>
              <div>
                <label className={labelClass}>Supplier code</label>
                <div className="relative">
                  <input className={`${inputClass} bg-slate-100 pr-28 font-semibold tracking-wide`} value={form.code} readOnly />
                  <span className="absolute right-2 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded-full bg-blue-600 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                    <Sparkles className="h-3 w-3" /> Auto
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  {isEdit ? 'Existing code is kept.' : 'Next code after the last supplier currently seated in this database.'}
                </p>
              </div>
              <div>
                <label className={labelClass}>Currency</label>
                <select className={selectClass} value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}>
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Registration no.</label>
                <input
                  className={inputClass}
                  placeholder="CAC / company registration"
                  value={form.registrationNo}
                  onChange={(e) => setForm((f) => ({ ...f, registrationNo: e.target.value }))}
                />
              </div>
              <div>
                <label className={labelClass}>Tax / VAT ID</label>
                <input
                  className={inputClass}
                  placeholder="TIN, VAT number"
                  value={form.taxId}
                  onChange={(e) => setForm((f) => ({ ...f, taxId: e.target.value }))}
                />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              <UserRound className="h-3.5 w-3.5 text-blue-600" /> Contact
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className={labelClass}>Primary contact name</label>
                <input
                  className={inputClass}
                  placeholder="Accounts payable / sales contact"
                  value={form.contactName}
                  onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
                />
              </div>
              <div>
                <label className={labelClass}>Email</label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    className={`${inputClass} pl-9`}
                    placeholder="vendor@company.com"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>Phone</label>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    className={`${inputClass} pl-9`}
                    placeholder="+234…"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>Mobile</label>
                <input
                  className={inputClass}
                  placeholder="Mobile / WhatsApp"
                  value={form.mobile}
                  onChange={(e) => setForm((f) => ({ ...f, mobile: e.target.value }))}
                />
              </div>
              <div>
                <label className={labelClass}>Website</label>
                <div className="relative">
                  <Globe className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    className={`${inputClass} pl-9`}
                    placeholder="https://"
                    value={form.website}
                    onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              <MapPin className="h-3.5 w-3.5 text-blue-600" /> Address
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className={labelClass}>Street address</label>
                <input
                  className={inputClass}
                  placeholder="Building, street, area"
                  value={form.addressLine}
                  onChange={(e) => setForm((f) => ({ ...f, addressLine: e.target.value }))}
                />
              </div>
              <div>
                <label className={labelClass}>City</label>
                <input
                  className={inputClass}
                  placeholder="e.g. Lagos, Port Harcourt"
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                />
              </div>
              <SearchableSelect
                label="State / region"
                value={form.stateName}
                options={optionList(NIGERIA_STATES)}
                placeholder="Search or type a state"
                allowCustom
                onChange={(value) => setForm((f) => ({ ...f, stateName: value }))}
              />
              <SearchableSelect
                label="Country"
                value={form.country}
                options={optionList(COUNTRIES)}
                placeholder="Search or type a country"
                allowCustom
                onChange={(value) => setForm((f) => ({ ...f, country: value }))}
              />
              <div>
                <label className={labelClass}>Postal code</label>
                <input
                  className={inputClass}
                  placeholder="Optional"
                  value={form.postalCode}
                  onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value }))}
                />
              </div>
              <div className="md:col-span-2">
                <LocationLookup
                  label="Delivery location / site"
                  value={form.deliveryLocation}
                  onChange={(name) => setForm((f) => ({ ...f, deliveryLocation: name }))}
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Search a DLE site, or type any city / yard. This field stays editable even if suggestions are still loading.
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Commercial terms</div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className={labelClass}>Payment terms</label>
                <input
                  className={inputClass}
                  placeholder="e.g. 30 days, 100% upfront"
                  value={form.paymentTerms}
                  onChange={(e) => setForm((f) => ({ ...f, paymentTerms: e.target.value }))}
                />
              </div>
              <div>
                <label className={labelClass}>Delivery period</label>
                <input
                  className={inputClass}
                  placeholder="e.g. 2–3 weeks"
                  value={form.deliveryPeriod}
                  onChange={(e) => setForm((f) => ({ ...f, deliveryPeriod: e.target.value }))}
                />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Notes</label>
                <textarea
                  className={`${inputClass} min-h-[88px] py-2`}
                  placeholder="Internal notes, compliance comments, or delivery instructions"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Status</div>
            <div className="flex flex-wrap gap-2">
              <TogglePill label="Approved" checked={form.isApproved} onChange={(v) => setForm((f) => ({ ...f, isApproved: v }))} tone="green" />
              <TogglePill label="Active" checked={form.isActive} onChange={(v) => setForm((f) => ({ ...f, isActive: v }))} />
              <TogglePill label="Blacklisted" checked={form.isBlacklisted} onChange={(v) => setForm((f) => ({ ...f, isBlacklisted: v }))} tone="red" />
            </div>
          </section>
        </div>
      </ProcModal>
    </div>
  );
}
