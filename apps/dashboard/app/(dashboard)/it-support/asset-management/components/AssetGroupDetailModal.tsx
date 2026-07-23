'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { ItAssetRecord, ItAssignmentRecord, ItMaintenanceRecord } from '@/lib/it-asset-management-store';

export type DetailRow = {
  key: string;
  assetId: string;
  tag: string;
  name: string;
  department: string;
  location: string;
  assignee: string;
  status: string;
  extra?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  rows: DetailRow[];
  extraColumnLabel?: string;
  onRowActivate?: (row: DetailRow) => void;
};

export function AssetGroupDetailModal({ open, onClose, title, description, rows, extraColumnLabel, onRowActivate }: Props) {
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [row.tag, row.name, row.department, row.location, row.assignee, row.status, row.extra]
        .some((value) => String(value || '').toLowerCase().includes(q)),
    );
  }, [rows, search]);

  if (!open) return null;

  const activateRow = (row: DetailRow) => {
    if (!onRowActivate) return;
    onRowActivate(row);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]" aria-label="Close dialog" onClick={onClose} />
      <div className="relative flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-950">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {description}
              {onRowActivate ? ' Click a row to open the related record.' : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-slate-100 px-6 py-3">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search tag, model, department, location, assignee..."
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 outline-none focus:border-dle-blue"
            />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Showing {filteredRows.length} of {rows.length} records
          </p>
        </div>

        <div className="overflow-y-auto px-6 py-4">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Tag</th>
                <th className="px-3 py-2">Asset</th>
                <th className="px-3 py-2">Department</th>
                <th className="px-3 py-2">Location</th>
                <th className="px-3 py-2">Assigned To</th>
                <th className="px-3 py-2">Status</th>
                {extraColumnLabel ? <th className="px-3 py-2">{extraColumnLabel}</th> : null}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr
                  key={row.key}
                  className={`border-b border-slate-50 ${onRowActivate ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                  onClick={() => activateRow(row)}
                  onDoubleClick={() => activateRow(row)}
                  title={onRowActivate ? 'Click to open related record' : undefined}
                >
                  <td className="px-3 py-2 font-mono text-xs">{row.tag}</td>
                  <td className="px-3 py-2 font-medium">{row.name}</td>
                  <td className="px-3 py-2">{row.department || '—'}</td>
                  <td className="px-3 py-2">{row.location || '—'}</td>
                  <td className="px-3 py-2">{row.assignee || 'Unassigned'}</td>
                  <td className="px-3 py-2">{row.status}</td>
                  {extraColumnLabel ? <td className="px-3 py-2">{row.extra || '—'}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
          {!filteredRows.length ? <div className="py-10 text-center text-sm text-slate-500">No records found for this group.</div> : null}
        </div>
      </div>
    </div>
  );
}

export const assetRowsFromAssets = (assets: ItAssetRecord[], extra?: (asset: ItAssetRecord) => string | undefined): DetailRow[] =>
  assets.map((asset) => ({
    key: asset.assetId,
    assetId: asset.assetId,
    tag: asset.assetTag,
    name: asset.model || asset.name,
    department: asset.department || '',
    location: asset.location || '',
    assignee: asset.assignedEmployeeName || '',
    status: asset.registerStatus || asset.status,
    extra: extra?.(asset),
  }));

export const assetRowsFromMaintenance = (records: ItMaintenanceRecord[], assets: ItAssetRecord[]): DetailRow[] => {
  const byId = new Map(assets.map((asset) => [asset.assetId, asset]));
  return records.map((row) => {
    const asset = row.assetId ? byId.get(row.assetId) : undefined;
    return {
      key: row.maintenanceId,
      assetId: row.assetId || '',
      tag: asset?.assetTag || '—',
      name: row.assetName || asset?.model || asset?.name || row.title,
      department: row.department || asset?.department || '',
      location: row.location || asset?.location || '',
      assignee: row.assignedTo || asset?.assignedEmployeeName || '',
      status: row.status,
      extra: row.title,
    };
  });
};

export const mergeAssignmentRecords = (assets: ItAssetRecord[], formal: ItAssignmentRecord[]) => {
  const activeFormal = formal.filter((row) => row.status === 'Assigned');
  const formalAssetIds = new Set(activeFormal.map((row) => row.assetId));
  const synthetic = assets
    .filter((asset) => asset.assignedEmployeeName && !formalAssetIds.has(asset.assetId))
    .map((asset) => ({
      assignmentId: `syn-${asset.assetId}`,
      assetId: asset.assetId,
      assetTag: asset.assetTag,
      assetName: asset.model || asset.name,
      assetType: asset.assetType,
      employeeId: asset.assignedEmployeeId,
      employeeName: asset.assignedEmployeeName || '',
      department: asset.department,
      location: asset.location,
      status: 'Assigned',
      assignedOn: asset.assignedOn,
      returnedOn: null,
      notes: null,
      updatedAt: asset.updatedAt,
    }));
  return [...activeFormal, ...synthetic];
};

export const assetRowsFromAssignments = (assignments: ItAssignmentRecord[]): DetailRow[] =>
  assignments.map((row) => ({
    key: row.assignmentId,
    assetId: row.assetId,
    tag: row.assetTag,
    name: row.assetName,
    department: row.department || '',
    location: row.location || '',
    assignee: row.employeeName,
    status: row.status,
  }));
