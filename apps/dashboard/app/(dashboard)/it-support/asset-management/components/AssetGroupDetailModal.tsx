'use client';

import { X } from 'lucide-react';
import type { ItAssetRecord, ItAssignmentRecord } from '@/lib/it-asset-management-store';

type DetailRow = {
  key: string;
  assetId: string;
  tag: string;
  name: string;
  department: string;
  location: string;
  assignee: string;
  status: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  rows: DetailRow[];
  onRowActivate?: (row: DetailRow) => void;
};

export function AssetGroupDetailModal({ open, onClose, title, description, rows, onRowActivate }: Props) {
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
              {onRowActivate ? ' Click or double-click a row to edit the asset.' : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
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
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.key}
                  className={`border-b border-slate-50 ${onRowActivate ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                  onClick={() => activateRow(row)}
                  onDoubleClick={() => activateRow(row)}
                  title={onRowActivate ? 'Click or double-click to edit asset' : undefined}
                >
                  <td className="px-3 py-2 font-mono text-xs">{row.tag}</td>
                  <td className="px-3 py-2 font-medium">{row.name}</td>
                  <td className="px-3 py-2">{row.department || '—'}</td>
                  <td className="px-3 py-2">{row.location || '—'}</td>
                  <td className="px-3 py-2">{row.assignee || 'Unassigned'}</td>
                  <td className="px-3 py-2">{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length ? <div className="py-10 text-center text-sm text-slate-500">No records found for this group.</div> : null}
        </div>
      </div>
    </div>
  );
}

export const assetRowsFromAssets = (assets: ItAssetRecord[]): DetailRow[] =>
  assets.map((asset) => ({
    key: asset.assetId,
    assetId: asset.assetId,
    tag: asset.assetTag,
    name: asset.model || asset.name,
    department: asset.department || '',
    location: asset.location || '',
    assignee: asset.assignedEmployeeName || '',
    status: asset.registerStatus || asset.status,
  }));

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
