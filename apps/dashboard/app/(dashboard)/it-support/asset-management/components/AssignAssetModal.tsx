'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import type { ItAssetRecord } from '@/lib/it-asset-management-store';
import { EmployeePicker, type EmployeeOption } from './AssetManagementShared';

type AssignInput = {
  assetId: string;
  employeeId: string;
  employeeName: string;
  assignedEmail: string;
  department: string;
  location: string;
  notes: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  assets: ItAssetRecord[];
  mode?: 'assign' | 'reassign';
  initialAssetId?: string;
  initialEmployee?: EmployeeOption | null;
  onSubmit: (input: AssignInput) => Promise<void>;
};

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-dle-blue focus:ring-2 focus:ring-dle-blue/20';
const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500';

export function AssignAssetModal({
  open,
  onClose,
  assets,
  mode = 'assign',
  initialAssetId = '',
  initialEmployee = null,
  onSubmit,
}: Props) {
  const [assetId, setAssetId] = useState('');
  const [employee, setEmployee] = useState<EmployeeOption | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const isReassign = mode === 'reassign';
  const unassignedAssets = assets.filter((asset) => !asset.assignedEmployeeName);
  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.assetId === assetId) || null,
    [assetId, assets],
  );

  useEffect(() => {
    if (!open) return;
    setAssetId(isReassign ? initialAssetId : '');
    setEmployee(isReassign ? initialEmployee : null);
    setNotes('');
    setError('');
  }, [open, isReassign, initialAssetId, initialEmployee]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose, saving]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!assetId || !employee) {
      setError('Select an asset and employee to continue.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSubmit({
        assetId,
        employeeId: employee.employeeCode,
        employeeName: employee.fullName,
        assignedEmail: employee.email,
        department: employee.department,
        location: employee.location,
        notes: notes.trim(),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Unable to ${isReassign ? 'reassign' : 'assign'} asset.`);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]" aria-label="Close dialog" onClick={() => !saving && onClose()} />
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-950">{isReassign ? 'Reassign Asset' : 'Assign Asset'}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {isReassign
                ? 'Change the employee this asset is assigned to.'
                : 'Assign an unassigned register asset to an HRIS employee.'}
            </p>
          </div>
          <button type="button" onClick={() => !saving && onClose()} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={(event) => void handleSubmit(event)} className="px-6 py-5">
          {error ? <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

          <div className="space-y-4">
            {isReassign ? (
              <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-3">
                <p className={labelClass}>Asset</p>
                {selectedAsset ? (
                  <>
                    <p className="font-medium text-slate-900">{selectedAsset.model || selectedAsset.name}</p>
                    <p className="font-mono text-xs text-slate-500">{selectedAsset.assetTag}</p>
                  </>
                ) : (
                  <p className="text-sm text-slate-500">Asset not found.</p>
                )}
              </div>
            ) : (
              <label className="block">
                <span className={labelClass}>Select Asset <span className="text-rose-500">*</span></span>
                <select value={assetId} onChange={(e) => setAssetId(e.target.value)} className={inputClass} required>
                  <option value="">Choose an unassigned asset</option>
                  {unassignedAssets.map((asset) => (
                    <option key={asset.assetId} value={asset.assetId}>
                      {asset.assetTag} — {asset.model || asset.name} ({asset.subCategory || asset.category})
                    </option>
                  ))}
                </select>
                {!unassignedAssets.length ? (
                  <p className="mt-1 text-xs text-amber-600">No unassigned assets available.</p>
                ) : null}
              </label>
            )}

            <label className="block">
              <span className={labelClass}>{isReassign ? 'Reassign To' : 'Assign To'} <span className="text-rose-500">*</span></span>
              <EmployeePicker value={employee} onSelect={setEmployee} placeholder="Search HRIS employee..." />
            </label>

            {employee ? (
              <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <div>{employee.fullName} · {employee.employeeCode}</div>
                <div>{employee.department || 'No department'} · {employee.location || 'No location'}</div>
                {employee.email ? <div>{employee.email}</div> : null}
              </div>
            ) : null}

            <label className="block">
              <span className={labelClass}>Notes</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Optional assignment notes..."
                className={inputClass}
              />
            </label>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || (!isReassign && !unassignedAssets.length)}
              className="inline-flex items-center gap-2 rounded-lg bg-dle-blue px-5 py-2 text-sm font-semibold text-white hover:bg-dle-blue-deep disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving ? (isReassign ? 'Reassigning...' : 'Assigning...') : (isReassign ? 'Reassign Asset' : 'Assign Asset')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
