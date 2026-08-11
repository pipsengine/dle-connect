'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import type { ItAssetDashboardPayload } from '@/lib/it-asset-management-store';
import { fetchAssetSection, postAssetManagementAction } from '../lib/asset-management-api';
import { AssetManagementShell } from '../AssetManagementShell';
import { ErrorBanner, exportAssetSection, PaginationBar, SectionToolbar } from '../components/AssetManagementShared';

type Props = {
  title: string;
  section: 'vendors' | 'warranties' | 'procurement' | 'licenses' | 'software' | 'software-catalog' | 'installed-software' | 'software-requests' | 'license-compliance';
};

type SectionPayload = ItAssetDashboardPayload & {
  pagination?: { page: number; pageSize: number; total: number };
  softwareCatalog?: ItAssetDashboardPayload['softwareCatalog'];
  installedSoftware?: ItAssetDashboardPayload['installedSoftware'];
  softwareRequests?: ItAssetDashboardPayload['softwareRequests'];
};

const currency = (value: number | null) =>
  value == null ? '—' : new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(value);

export function RecordsSectionClient({ title, section }: Props) {
  const [payload, setPayload] = useState<SectionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const apiSection = section === 'licenses' || section === 'license-compliance' ? 'dashboard'
    : section === 'software' ? 'software-catalog'
      : section;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (section === 'licenses' || section === 'license-compliance' || section === 'software') {
        const data = await fetchAssetSection<SectionPayload>('dashboard');
        setPayload(data);
      } else {
        const data = await fetchAssetSection<SectionPayload>(apiSection, { page, pageSize: 25, search });
        setPayload(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load records.');
    } finally {
      setLoading(false);
    }
  }, [apiSection, page, search, section]);

  useEffect(() => { void load(); }, [load]);

  const pagination = payload?.pagination || { page, pageSize: 25, total: 0 };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    try {
      if (section === 'vendors') await postAssetManagementAction({ action: 'create-vendor', vendor: form });
      else if (section === 'warranties') await postAssetManagementAction({ action: 'create-warranty', warranty: form });
      else if (section === 'procurement') await postAssetManagementAction({ action: 'create-procurement', procurement: { ...form, amount: form.amount ? Number(form.amount) : null } });
      else if (section === 'licenses' || section === 'license-compliance') await postAssetManagementAction({ action: 'create-license', license: { ...form, seatsTotal: Number(form.seatsTotal || 0), seatsUsed: Number(form.seatsUsed || 0), annualCost: form.annualCost ? Number(form.annualCost) : null } });
      else if (section === 'software-catalog' || section === 'software') await postAssetManagementAction({ action: 'create-software-catalog', catalog: { ...form, annualCost: form.annualCost ? Number(form.annualCost) : null } });
      else if (section === 'installed-software') await postAssetManagementAction({ action: 'create-installed-software', installed: form });
      else if (section === 'software-requests') await postAssetManagementAction({ action: 'create-software-request', request: form });
      setShowForm(false);
      setForm({});
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save record.');
    }
  };

  const canCreate = !['license-compliance'].includes(section);

  return (
    <AssetManagementShell title={title}>
      <ErrorBanner message={error} />
      <SectionToolbar
        loading={loading}
        onRefresh={() => void load()}
        onExport={() => exportAssetSection(section)}
        search={search}
        onSearchChange={(value) => { setSearch(value); setPage(1); }}
        action={canCreate ? (
          <button type="button" onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 rounded-lg bg-dle-blue px-3 py-2 text-xs font-semibold text-white hover:bg-dle-blue-deep">
            <Plus className="h-4 w-4" />Add record
          </button>
        ) : undefined}
      />

      {showForm ? (
        <form onSubmit={(e) => void submit(e)} className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-3">
          {(section === 'vendors') && (
            <>
              <input placeholder="Vendor name" value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-lg border px-3 py-2 text-sm" required />
              <input placeholder="Email" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} className="rounded-lg border px-3 py-2 text-sm" />
              <input placeholder="Location" value={form.location || ''} onChange={(e) => setForm({ ...form, location: e.target.value })} className="rounded-lg border px-3 py-2 text-sm" />
            </>
          )}
          {(section === 'warranties') && (
            <>
              <input placeholder="Asset name" value={form.assetName || ''} onChange={(e) => setForm({ ...form, assetName: e.target.value })} className="rounded-lg border px-3 py-2 text-sm" required />
              <input placeholder="Provider" value={form.provider || ''} onChange={(e) => setForm({ ...form, provider: e.target.value })} className="rounded-lg border px-3 py-2 text-sm" />
              <input placeholder="End date" type="date" value={form.endDate || ''} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="rounded-lg border px-3 py-2 text-sm" />
            </>
          )}
          {(section === 'procurement') && (
            <>
              <input placeholder="Title" value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} className="rounded-lg border px-3 py-2 text-sm" required />
              <input placeholder="Vendor" value={form.vendorName || ''} onChange={(e) => setForm({ ...form, vendorName: e.target.value })} className="rounded-lg border px-3 py-2 text-sm" />
              <input placeholder="Amount" type="number" value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="rounded-lg border px-3 py-2 text-sm" />
            </>
          )}
          {(section === 'licenses' || section === 'license-compliance') && (
            <>
              <input placeholder="Product name" value={form.productName || ''} onChange={(e) => setForm({ ...form, productName: e.target.value })} className="rounded-lg border px-3 py-2 text-sm" required />
              <input placeholder="Seats total" type="number" value={form.seatsTotal || ''} onChange={(e) => setForm({ ...form, seatsTotal: e.target.value })} className="rounded-lg border px-3 py-2 text-sm" />
              <input placeholder="Seats used" type="number" value={form.seatsUsed || ''} onChange={(e) => setForm({ ...form, seatsUsed: e.target.value })} className="rounded-lg border px-3 py-2 text-sm" />
            </>
          )}
          {(section === 'software-catalog' || section === 'software') && (
            <>
              <input placeholder="Product name" value={form.productName || ''} onChange={(e) => setForm({ ...form, productName: e.target.value })} className="rounded-lg border px-3 py-2 text-sm" required />
              <input placeholder="Vendor" value={form.vendorName || ''} onChange={(e) => setForm({ ...form, vendorName: e.target.value })} className="rounded-lg border px-3 py-2 text-sm" />
              <input placeholder="Edition" value={form.edition || ''} onChange={(e) => setForm({ ...form, edition: e.target.value })} className="rounded-lg border px-3 py-2 text-sm" />
            </>
          )}
          {section === 'installed-software' && (
            <>
              <input placeholder="Product name" value={form.productName || ''} onChange={(e) => setForm({ ...form, productName: e.target.value })} className="rounded-lg border px-3 py-2 text-sm" required />
              <input placeholder="Version" value={form.version || ''} onChange={(e) => setForm({ ...form, version: e.target.value })} className="rounded-lg border px-3 py-2 text-sm" />
              <input placeholder="Installed on" value={form.installedOn || ''} onChange={(e) => setForm({ ...form, installedOn: e.target.value })} className="rounded-lg border px-3 py-2 text-sm" />
            </>
          )}
          {section === 'software-requests' && (
            <>
              <input placeholder="Request title" value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} className="rounded-lg border px-3 py-2 text-sm" required />
              <input placeholder="Requester" value={form.requesterName || ''} onChange={(e) => setForm({ ...form, requesterName: e.target.value })} className="rounded-lg border px-3 py-2 text-sm" />
              <input placeholder="Department" value={form.department || ''} onChange={(e) => setForm({ ...form, department: e.target.value })} className="rounded-lg border px-3 py-2 text-sm" />
            </>
          )}
          <button type="submit" className="rounded-lg bg-dle-blue px-4 py-2 text-sm font-medium text-white md:col-span-3">Save</button>
        </form>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {(section === 'vendors') && (
          <table className="min-w-full text-left text-sm">
            <thead><tr className="text-xs uppercase text-slate-500"><th className="px-3 py-2">Vendor</th><th className="px-3 py-2">Contact</th><th className="px-3 py-2">Location</th><th className="px-3 py-2">Spend YTD</th></tr></thead>
            <tbody>{(payload?.vendors || []).map((row) => <tr key={row.vendorId} className="border-t border-slate-50"><td className="px-3 py-2">{row.name}</td><td className="px-3 py-2">{row.email || row.phone}</td><td className="px-3 py-2">{row.location}</td><td className="px-3 py-2">{currency(row.spendYtd)}</td></tr>)}</tbody>
          </table>
        )}
        {(section === 'warranties') && (
          <table className="min-w-full text-left text-sm">
            <thead><tr className="text-xs uppercase text-slate-500"><th className="px-3 py-2">Asset</th><th className="px-3 py-2">Provider</th><th className="px-3 py-2">End</th><th className="px-3 py-2">Status</th></tr></thead>
            <tbody>{(payload?.warranties || []).map((row) => <tr key={row.warrantyId} className="border-t border-slate-50"><td className="px-3 py-2">{row.assetName}</td><td className="px-3 py-2">{row.provider}</td><td className="px-3 py-2">{row.endDate}</td><td className="px-3 py-2">{row.status}</td></tr>)}</tbody>
          </table>
        )}
        {(section === 'procurement') && (
          <table className="min-w-full text-left text-sm">
            <thead><tr className="text-xs uppercase text-slate-500"><th className="px-3 py-2">Order</th><th className="px-3 py-2">Title</th><th className="px-3 py-2">Vendor</th><th className="px-3 py-2">Amount</th></tr></thead>
            <tbody>{(payload?.procurement || []).map((row) => <tr key={row.orderId} className="border-t border-slate-50"><td className="px-3 py-2">{row.orderNumber}</td><td className="px-3 py-2">{row.title}</td><td className="px-3 py-2">{row.vendorName}</td><td className="px-3 py-2">{currency(row.amount)}</td></tr>)}</tbody>
          </table>
        )}
        {(section === 'licenses' || section === 'license-compliance' || section === 'software') && (
          <table className="min-w-full text-left text-sm">
            <thead><tr className="text-xs uppercase text-slate-500"><th className="px-3 py-2">Product</th><th className="px-3 py-2">Seats</th><th className="px-3 py-2">Compliance</th><th className="px-3 py-2">Expiry</th></tr></thead>
            <tbody>{(payload?.licenses || []).map((row) => <tr key={row.licenseId} className="border-t border-slate-50"><td className="px-3 py-2">{row.productName}</td><td className="px-3 py-2">{row.seatsUsed}/{row.seatsTotal}</td><td className="px-3 py-2">{row.complianceStatus}</td><td className="px-3 py-2">{row.expiryDate}</td></tr>)}</tbody>
          </table>
        )}
        {section === 'software-catalog' && (
          <table className="min-w-full text-left text-sm">
            <thead><tr className="text-xs uppercase text-slate-500"><th className="px-3 py-2">Product</th><th className="px-3 py-2">Vendor</th><th className="px-3 py-2">Edition</th><th className="px-3 py-2">Status</th></tr></thead>
            <tbody>{(payload?.softwareCatalog || []).map((row) => <tr key={row.catalogId} className="border-t border-slate-50"><td className="px-3 py-2">{row.productName}</td><td className="px-3 py-2">{row.vendorName}</td><td className="px-3 py-2">{row.edition}</td><td className="px-3 py-2">{row.status}</td></tr>)}</tbody>
          </table>
        )}
        {section === 'installed-software' && (
          <table className="min-w-full text-left text-sm">
            <thead><tr className="text-xs uppercase text-slate-500"><th className="px-3 py-2">Product</th><th className="px-3 py-2">Version</th><th className="px-3 py-2">Installed On</th><th className="px-3 py-2">Status</th></tr></thead>
            <tbody>{(payload?.installedSoftware || []).map((row) => <tr key={row.installId} className="border-t border-slate-50"><td className="px-3 py-2">{row.productName}</td><td className="px-3 py-2">{row.version}</td><td className="px-3 py-2">{row.installedOn}</td><td className="px-3 py-2">{row.status}</td></tr>)}</tbody>
          </table>
        )}
        {section === 'software-requests' && (
          <table className="min-w-full text-left text-sm">
            <thead><tr className="text-xs uppercase text-slate-500"><th className="px-3 py-2">Title</th><th className="px-3 py-2">Requester</th><th className="px-3 py-2">Priority</th><th className="px-3 py-2">Status</th></tr></thead>
            <tbody>{(payload?.softwareRequests || []).map((row) => <tr key={row.requestId} className="border-t border-slate-50"><td className="px-3 py-2">{row.title}</td><td className="px-3 py-2">{row.requesterName}</td><td className="px-3 py-2">{row.priority}</td><td className="px-3 py-2">{row.status}</td></tr>)}</tbody>
          </table>
        )}
        {!loading && pagination.total === 0 && !(payload?.vendors?.length || payload?.licenses?.length || payload?.softwareCatalog?.length) ? (
          <div className="py-8 text-center text-sm text-slate-500">No records found. Initialize Asset Management or add a record.</div>
        ) : null}
        {section !== 'licenses' && section !== 'license-compliance' && section !== 'software' ? (
          <PaginationBar pagination={pagination} onPageChange={setPage} />
        ) : null}
      </div>
    </AssetManagementShell>
  );
}
