'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import type { ItAssetDashboardPayload, ItInventoryRecord } from '@/lib/it-asset-management-store';
import { fetchAssetSection, postAssetManagementAction } from '../lib/asset-management-api';
import { AssetManagementShell } from '../AssetManagementShell';
import { ErrorBanner, exportAssetSection, PaginationBar, SectionToolbar } from '../components/AssetManagementShared';

type SectionPayload = ItAssetDashboardPayload & { pagination?: { page: number; pageSize: number; total: number } };

export function InventorySectionClient() {
  const [items, setItems] = useState<ItInventoryRecord[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 25, total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ sku: '', name: '', category: 'Laptop', quantity: '', status: 'Available', location: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchAssetSection<SectionPayload>('inventory', { page, pageSize: 25, search });
      setItems(data.inventory || []);
      setPagination(data.pagination || { page, pageSize: 25, total: data.inventory?.length || 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load inventory.');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { void load(); }, [load]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.sku.trim() || !form.name.trim()) return;
    try {
      await postAssetManagementAction({ action: 'create-inventory', inventory: { ...form, quantity: Number(form.quantity) || 0 } });
      setShowForm(false);
      setForm({ sku: '', name: '', category: 'Laptop', quantity: '', status: 'Available', location: '' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create inventory item.');
    }
  };

  const removeItem = async (stockId: string) => {
    if (!window.confirm('Delete this inventory item?')) return;
    try {
      await postAssetManagementAction({ action: 'delete-inventory', stockId });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete inventory item.');
    }
  };

  return (
    <AssetManagementShell title="Inventory" description="Track stocked hardware items by SKU, availability, and location.">
      <ErrorBanner message={error} />
      <SectionToolbar loading={loading} onRefresh={() => void load()} onExport={() => exportAssetSection('inventory')} search={search} onSearchChange={(v) => { setSearch(v); setPage(1); }} action={<button type="button" onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 rounded-lg bg-dle-blue px-3 py-2 text-xs font-semibold text-white"><Plus className="h-4 w-4" />Add stock item</button>} />
      {showForm ? (
        <form onSubmit={(e) => void handleSubmit(e)} className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-3">
          <input value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} placeholder="SKU" className="rounded-lg border px-3 py-2 text-sm" required />
          <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Name" className="rounded-lg border px-3 py-2 text-sm" required />
          <input value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} placeholder="Quantity" type="number" className="rounded-lg border px-3 py-2 text-sm" />
          <input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="Location" className="rounded-lg border px-3 py-2 text-sm" />
          <button type="submit" className="rounded-lg bg-dle-blue px-4 py-2 text-sm text-white md:col-span-3">Save</button>
        </form>
      ) : null}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">SKU</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Qty</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Location</th><th className="px-3 py-2">Actions</th></tr></thead>
          <tbody>{items.map((item) => <tr key={item.stockId} className="border-t border-slate-50"><td className="px-3 py-2 font-mono text-xs">{item.sku}</td><td className="px-3 py-2">{item.name}</td><td className="px-3 py-2">{item.quantity}</td><td className="px-3 py-2">{item.status}</td><td className="px-3 py-2">{item.location}</td><td className="px-3 py-2"><button type="button" onClick={() => void removeItem(item.stockId)} className="text-xs font-semibold text-rose-600">Delete</button></td></tr>)}</tbody>
        </table>
        <PaginationBar pagination={pagination} onPageChange={setPage} />
      </div>
    </AssetManagementShell>
  );
}
