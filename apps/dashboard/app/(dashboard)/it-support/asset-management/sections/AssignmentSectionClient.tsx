'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Boxes, ClipboardList, Pencil, Plus, Undo2, UserCheck, UserX, Users } from 'lucide-react';
import type { ItAssetDashboardPayload, ItAssetRecord, ItAssignmentRecord } from '@/lib/it-asset-management-store';
import { fetchAssetManagementPayload, fetchAssetSection, postAssetManagementAction } from '../lib/asset-management-api';
import { AssetManagementShell } from '../AssetManagementShell';
import { AddAssetModal } from '../components/AddAssetModal';
import { AssetGroupDetailModal, assetRowsFromAssets, assetRowsFromAssignments, mergeAssignmentRecords } from '../components/AssetGroupDetailModal';
import { AssignAssetModal } from '../components/AssignAssetModal';
import { ErrorBanner, exportAssetSection, PaginationBar, SectionToolbar, type EmployeeOption } from '../components/AssetManagementShared';

type SectionPayload = ItAssetDashboardPayload & { pagination?: { page: number; pageSize: number; total: number } };
type CardFilter = 'total' | 'assigned' | 'unassigned' | 'logged' | null;
type AssignModalState = {
  open: boolean;
  mode: 'assign' | 'reassign';
  assetId?: string;
  employee?: EmployeeOption | null;
};

const CARD_STYLES = {
  total: 'border-blue-100 bg-blue-50/40 hover:border-blue-200',
  assigned: 'border-emerald-100 bg-emerald-50/40 hover:border-emerald-200',
  unassigned: 'border-orange-100 bg-orange-50/40 hover:border-orange-200',
  logged: 'border-violet-100 bg-violet-50/40 hover:border-violet-200',
};

const assignmentToEmployee = (row: ItAssignmentRecord): EmployeeOption => ({
  employeeCode: row.employeeId || '',
  fullName: row.employeeName,
  department: row.department || '',
  location: row.location || '',
  email: '',
});

export function AssignmentSectionClient() {
  const [assets, setAssets] = useState<ItAssetDashboardPayload['assets']>([]);
  const [formalAssignments, setFormalAssignments] = useState<ItAssignmentRecord[]>([]);
  const [summary, setSummary] = useState<ItAssetDashboardPayload['summary'] | null>(null);
  const [assignments, setAssignments] = useState<ItAssignmentRecord[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 25, total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [assignModal, setAssignModal] = useState<AssignModalState>({ open: false, mode: 'assign' });
  const [editingAsset, setEditingAsset] = useState<ItAssetRecord | null>(null);
  const [cardFilter, setCardFilter] = useState<CardFilter>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [dashboard, section] = await Promise.all([
        fetchAssetManagementPayload(),
        fetchAssetSection<SectionPayload>('assignments', { page, pageSize: 25, search }),
      ]);
      setSummary(dashboard.summary);
      setAssets(dashboard.assets);
      setFormalAssignments(dashboard.assignments || []);
      setAssignments(section.assignments || []);
      setPagination(section.pagination || { page, pageSize: 25, total: section.assignments?.length || 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load assignments.');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { void load(); }, [load]);

  const assetById = useMemo(
    () => new Map(assets.map((asset) => [asset.assetId, asset])),
    [assets],
  );

  const handleAssign = async (input: {
    assetId: string;
    employeeId: string;
    employeeName: string;
    assignedEmail: string;
    department: string;
    location: string;
    notes: string;
  }) => {
    await postAssetManagementAction({
      action: 'assign-asset',
      assetId: input.assetId,
      employeeId: input.employeeId,
      employeeName: input.employeeName,
      assignedEmail: input.assignedEmail,
      department: input.department,
      location: input.location,
      notes: input.notes,
    });
    await load();
  };

  const handleReassign = async (input: {
    assetId: string;
    employeeId: string;
    employeeName: string;
    assignedEmail: string;
    department: string;
    location: string;
    notes: string;
  }) => {
    await postAssetManagementAction({
      action: 'reassign-asset',
      assetId: input.assetId,
      employeeId: input.employeeId,
      employeeName: input.employeeName,
      assignedEmail: input.assignedEmail,
      department: input.department,
      location: input.location,
      notes: input.notes,
    });
    await load();
  };

  const handleUpdateAsset = async (asset: Record<string, unknown>) => {
    if (!editingAsset) return;
    await postAssetManagementAction({ action: 'update-asset', assetId: editingAsset.assetId, asset });
    setEditingAsset(null);
    await load();
  };

  const handleReturn = async (assignmentId: string) => {
    if (!window.confirm('Return this asset to inventory?')) return;
    try {
      await postAssetManagementAction({ action: 'return-asset', assignmentId });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to return asset.');
    }
  };

  const openAssignModal = () => setAssignModal({ open: true, mode: 'assign' });

  const openReassignModal = (row: ItAssignmentRecord) => {
    const asset = assetById.get(row.assetId);
    setAssignModal({
      open: true,
      mode: 'reassign',
      assetId: row.assetId,
      employee: asset?.assignedEmail
        ? { ...assignmentToEmployee(row), email: asset.assignedEmail }
        : assignmentToEmployee(row),
    });
  };

  const openEditModal = (row: ItAssignmentRecord) => {
    const asset = assetById.get(row.assetId);
    if (!asset) {
      setError('Asset record not found. Refresh and try again.');
      return;
    }
    setEditingAsset(asset);
  };

  const openEditFromDetailRow = (row: { assetId: string }) => {
    const asset = assetById.get(row.assetId);
    if (!asset) {
      setError('Asset record not found. Refresh and try again.');
      return;
    }
    setCardFilter(null);
    setEditingAsset(asset);
  };

  const mergedAssignments = useMemo(
    () => mergeAssignmentRecords(assets, formalAssignments),
    [assets, formalAssignments],
  );

  const cards = useMemo(() => {
    const total = summary?.totalAssets || 0;
    const assigned = summary?.assignedAssets || 0;
    const unassigned = summary?.unassignedAssets || 0;
    return [
      {
        id: 'total' as const,
        label: 'Total Assets',
        value: total,
        sub: 'All registered assets',
        icon: Boxes,
        iconTone: 'text-blue-600 bg-blue-100',
      },
      {
        id: 'assigned' as const,
        label: 'Assigned',
        value: assigned,
        sub: total ? `${Math.round((assigned / total) * 1000) / 10}% of total` : '0% of total',
        icon: UserCheck,
        iconTone: 'text-emerald-600 bg-emerald-100',
      },
      {
        id: 'unassigned' as const,
        label: 'Unassigned',
        value: unassigned,
        sub: total ? `${Math.round((unassigned / total) * 1000) / 10}% of total` : '0% of total',
        icon: UserX,
        iconTone: 'text-orange-600 bg-orange-100',
      },
      {
        id: 'logged' as const,
        label: 'Assignments Logged',
        value: mergedAssignments.length,
        sub: 'Current assignment records',
        icon: ClipboardList,
        iconTone: 'text-violet-600 bg-violet-100',
      },
    ];
  }, [mergedAssignments.length, summary]);

  const detailModal = useMemo(() => {
    if (!cardFilter) return null;
    if (cardFilter === 'total') {
      return {
        title: 'All Assets',
        description: `${assets.length} assets in the register.`,
        rows: assetRowsFromAssets(assets),
      };
    }
    if (cardFilter === 'assigned') {
      return {
        title: 'Assigned Assets',
        description: `${summary?.assignedAssets || 0} assets currently assigned to employees.`,
        rows: assetRowsFromAssets(assets.filter((asset) => asset.assignedEmployeeName)),
      };
    }
    if (cardFilter === 'unassigned') {
      return {
        title: 'Unassigned Assets',
        description: `${summary?.unassignedAssets || 0} assets available for assignment.`,
        rows: assetRowsFromAssets(assets.filter((asset) => !asset.assignedEmployeeName)),
      };
    }
    return {
      title: 'Assignments Logged',
      description: `${mergedAssignments.length} active assignment records.`,
      rows: assetRowsFromAssignments(mergedAssignments),
    };
  }, [assets, cardFilter, mergedAssignments, summary]);

  return (
    <AssetManagementShell title="Asset Assignment" description="Assign assets to HRIS employees and track returns.">
      <ErrorBanner message={error} />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => setCardFilter(card.id)}
              className={`rounded-2xl border p-4 text-left shadow-sm transition ${CARD_STYLES[card.id]}`}
            >
              <div className="flex items-center gap-3">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${card.iconTone}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{card.label}</p>
                  <p className="mt-1 text-2xl font-black text-slate-950">{card.value}</p>
                  <p className="truncate text-xs text-slate-500">{card.sub}</p>
                </div>
              </div>
            </button>
          );
        })}
      </section>

      <SectionToolbar
        loading={loading}
        onRefresh={() => void load()}
        onExport={() => exportAssetSection('assignments')}
        search={search}
        onSearchChange={(value) => { setSearch(value); setPage(1); }}
        action={(
          <button type="button" onClick={openAssignModal} className="inline-flex items-center gap-2 rounded-lg bg-dle-blue px-3 py-2 text-xs font-semibold text-white hover:bg-dle-blue-deep">
            <Plus className="h-4 w-4" />Assign asset
          </button>
        )}
      />

      <AssignAssetModal
        open={assignModal.open}
        onClose={() => setAssignModal({ open: false, mode: 'assign' })}
        assets={assets}
        mode={assignModal.mode}
        initialAssetId={assignModal.assetId}
        initialEmployee={assignModal.employee}
        onSubmit={assignModal.mode === 'reassign' ? handleReassign : handleAssign}
      />

      <AddAssetModal
        open={Boolean(editingAsset)}
        onClose={() => setEditingAsset(null)}
        asset={editingAsset}
        onSubmit={handleUpdateAsset}
      />

      <AssetGroupDetailModal
        open={Boolean(cardFilter)}
        onClose={() => setCardFilter(null)}
        title={detailModal?.title || ''}
        description={detailModal?.description || ''}
        rows={detailModal?.rows || []}
        onRowActivate={openEditFromDetailRow}
      />

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Asset</th>
                <th className="px-3 py-2">Employee</th>
                <th className="px-3 py-2">Department</th>
                <th className="px-3 py-2">Location</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Assigned On</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((row) => (
                <tr key={row.assignmentId} className="border-b border-slate-50">
                  <td className="px-3 py-2">
                    <div className="font-medium">{row.assetName}</div>
                    <div className="font-mono text-xs text-slate-500">{row.assetTag}</div>
                  </td>
                  <td className="px-3 py-2">{row.employeeName}</td>
                  <td className="px-3 py-2">{row.department || '—'}</td>
                  <td className="px-3 py-2">{row.location || '—'}</td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">{row.status}</span>
                  </td>
                  <td className="px-3 py-2">{row.assignedOn || '—'}</td>
                  <td className="px-3 py-2">
                    {row.status === 'Assigned' ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(row)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-dle-blue hover:text-dle-blue-deep"
                        >
                          <Pencil className="h-3.5 w-3.5" />Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => openReassignModal(row)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-slate-950"
                        >
                          <Users className="h-3.5 w-3.5" />Reassign
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleReturn(row.assignmentId)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-slate-950"
                        >
                          <Undo2 className="h-3.5 w-3.5" />Return
                        </button>
                      </div>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && !assignments.length ? (
            <div className="py-8 text-center text-sm text-slate-500">No assignment records found.</div>
          ) : null}
        </div>
        <PaginationBar pagination={pagination} onPageChange={setPage} />
      </div>
    </AssetManagementShell>
  );
}
