'use client';

import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import type { ItAssetDashboardPayload, ItAssetRecord } from '@/lib/it-asset-management-store';
import { fetchAssetSection, postAssetManagementAction } from '../lib/asset-management-api';
import { AssetManagementShell } from '../AssetManagementShell';
import { AddAssetModal } from '../components/AddAssetModal';
import { ErrorBanner, exportAssetSection, PaginationBar, SectionToolbar } from '../components/AssetManagementShared';

const hardwareFilterMap: Record<string, { category?: string; subCategory?: string }> = {
  laptops: { category: 'Laptop', subCategory: 'Laptop' },
  computers: { category: 'Desktop', subCategory: 'Desktop' },
  servers: { category: 'Server', subCategory: 'Server' },
  routers: { category: 'Network', subCategory: 'Router' },
  switches: { category: 'Network', subCategory: 'Switch' },
  firewalls: { category: 'Network', subCategory: 'Firewall' },
  storage: { category: 'Server', subCategory: 'Storage' },
  printers: { category: 'Printer', subCategory: 'Printer' },
  'mobile-devices': { category: 'Phone', subCategory: 'Mobile' },
  'other-devices': { category: 'Other', subCategory: 'Other' },
};

type Props = { title: string; categorySlug?: string };

type SectionPayload = ItAssetDashboardPayload & { pagination?: { page: number; pageSize: number; total: number } };

export function HardwareSectionClient({ title, categorySlug }: Props) {
  const filter = categorySlug ? hardwareFilterMap[categorySlug] : undefined;
  const [payload, setPayload] = useState<SectionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState<ItAssetRecord | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchAssetSection<SectionPayload>('hardware', {
        page, pageSize: 25, category: filter?.category, subCategory: filter?.subCategory, search,
      });
      setPayload(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load hardware assets.');
    } finally {
      setLoading(false);
    }
  }, [page, filter?.category, filter?.subCategory, search]);

  useEffect(() => { void load(); }, [load]);

  const assets = payload?.assets || [];
  const pagination = payload?.pagination || { page, pageSize: 25, total: assets.length };

  const closeModal = () => {
    setShowModal(false);
    setEditingAsset(null);
  };

  const openCreateModal = () => {
    setEditingAsset(null);
    setShowModal(true);
  };

  const openEditModal = (asset: ItAssetRecord) => {
    setEditingAsset(asset);
    setShowModal(true);
  };

  const handleSubmitAsset = async (asset: Record<string, unknown>) => {
    if (editingAsset) {
      await postAssetManagementAction({ action: 'update-asset', assetId: editingAsset.assetId, asset });
    } else {
      await postAssetManagementAction({ action: 'create-asset', asset });
    }
    closeModal();
    await load();
  };

  const retireAsset = async (asset: ItAssetRecord) => {
    if (!window.confirm(`Retire asset ${asset.assetTag}?`)) return;
    try {
      await postAssetManagementAction({ action: 'delete-asset', assetId: asset.assetId });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to retire asset.');
    }
  };

  return (
    <AssetManagementShell title={title} description="Hardware assets in DLE_Enterprise [it].[Assets] with category and sub-category tracking.">
      <ErrorBanner message={error} />
      <SectionToolbar
        title={`${pagination.total} hardware records`}
        loading={loading}
        onRefresh={() => void load()}
        onExport={() => exportAssetSection('hardware')}
        search={search}
        onSearchChange={(value) => { setSearch(value); setPage(1); }}
        action={(
          <button type="button" onClick={openCreateModal} className="inline-flex items-center gap-2 rounded-lg bg-dle-blue px-3 py-2 text-xs font-semibold text-white hover:bg-dle-blue-deep">
            <Plus className="h-4 w-4" />Add asset
          </button>
        )}
      />

      <AddAssetModal
        open={showModal}
        onClose={closeModal}
        onSubmit={handleSubmitAsset}
        defaults={filter}
        asset={editingAsset}
      />

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Tag</th>
                <th className="px-3 py-2">Model</th>
                <th className="px-3 py-2">Manufacturer</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Department</th>
                <th className="px-3 py-2">Location</th>
                <th className="px-3 py-2">Assigned To</th>
                <th className="px-3 py-2">Register Status</th>
                <th className="px-3 py-2">PM Status</th>
                <th className="px-3 py-2">Condition</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((asset) => (
                <tr key={asset.assetId} className="border-b border-slate-50">
                  <td className="px-3 py-2 font-mono text-xs">{asset.assetTag}</td>
                  <td className="px-3 py-2 font-medium">{asset.model || asset.name}</td>
                  <td className="px-3 py-2">{asset.manufacturer || '—'}</td>
                  <td className="px-3 py-2">{asset.subCategory || asset.category}</td>
                  <td className="px-3 py-2">{asset.department || '—'}</td>
                  <td className="px-3 py-2">{asset.location || '—'}</td>
                  <td className="px-3 py-2">
                    <div>{asset.assignedEmployeeName || 'Unassigned'}</div>
                    {asset.assignedEmail ? <div className="text-xs text-slate-500">{asset.assignedEmail}</div> : null}
                  </td>
                  <td className="px-3 py-2">{asset.registerStatus || asset.status}</td>
                  <td className="px-3 py-2">{asset.pmStatus || '—'}</td>
                  <td className="px-3 py-2">{asset.assetCondition || '—'}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => openEditModal(asset)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-dle-blue hover:text-dle-blue-deep"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </button>
                      <button type="button" onClick={() => void retireAsset(asset)} className="text-xs font-semibold text-rose-600 hover:text-rose-700">
                        Retire
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && !assets.length ? <div className="py-8 text-center text-sm text-slate-500">No hardware assets found.</div> : null}
        </div>
        <PaginationBar pagination={pagination} onPageChange={setPage} />
      </div>
    </AssetManagementShell>
  );
}
