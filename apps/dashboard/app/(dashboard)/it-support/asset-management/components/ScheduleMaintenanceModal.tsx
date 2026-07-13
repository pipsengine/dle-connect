'use client';

import { useEffect, useMemo, useState } from 'react';
import { Building2, Loader2, MapPin, User, X } from 'lucide-react';
import type { ItAssetRecord } from '@/lib/it-asset-management-store';
import {
  assetsForMaintenanceScope,
  MAINTENANCE_CATEGORIES,
  MAINTENANCE_INTENTS,
  MAINTENANCE_PRIORITIES,
  MAINTENANCE_SCOPES,
  MAINTENANCE_TYPES,
  maintenanceIntentLabel,
  maintenanceIntentStatus,
  maintenanceScopeLabel,
  SCHEDULE_MODAL_PRESETS,
  type MaintenanceIntent,
  type MaintenanceScope,
  type ScheduleModalPreset,
  uniqueAssetDepartments,
  uniqueAssetLocations,
} from '../lib/maintenance-utils';
import { EmployeePicker, type EmployeeOption } from './AssetManagementShared';

export type ScheduleMaintenanceBatchInput = {
  scope: MaintenanceScope;
  intent: MaintenanceIntent;
  assetId?: string;
  department?: string;
  location?: string;
  maintenanceType: string;
  category: string;
  scheduledDate: string;
  priority: string;
  assignedTo: string;
  notes: string;
  onlyPmDue: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  assets: ItAssetRecord[];
  preset?: ScheduleModalPreset;
  onSubmit: (input: ScheduleMaintenanceBatchInput) => Promise<void>;
};

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-dle-blue focus:ring-2 focus:ring-dle-blue/20';
const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500';

const defaultForm = () => ({
  scope: 'individual' as MaintenanceScope,
  intent: 'schedule' as MaintenanceIntent,
  maintenanceType: 'Preventive maintenance',
  assetId: '',
  department: '',
  location: '',
  category: 'Hardware',
  scheduledDate: new Date().toISOString().slice(0, 10),
  priority: 'Medium',
  assignedTo: '',
  notes: '',
  onlyPmDue: false,
});

const scopeIcons = {
  individual: User,
  department: Building2,
  location: MapPin,
};

export function ScheduleMaintenanceModal({ open, onClose, assets, preset = 'default', onSubmit }: Props) {
  const presetConfig = SCHEDULE_MODAL_PRESETS[preset];
  const [form, setForm] = useState(defaultForm);
  const [technician, setTechnician] = useState<EmployeeOption | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const departments = useMemo(() => uniqueAssetDepartments(assets), [assets]);
  const locations = useMemo(() => uniqueAssetLocations(assets), [assets]);

  const hardwareAssets = useMemo(
    () => assets.filter((asset) => asset.assetType === 'Hardware').sort((a, b) => a.assetTag.localeCompare(b.assetTag)),
    [assets],
  );

  const targetAssets = useMemo(
    () => assetsForMaintenanceScope(assets, form.scope, {
      assetId: form.assetId,
      department: form.department,
      location: form.location,
      onlyPmDue: form.onlyPmDue,
    }),
    [assets, form.assetId, form.department, form.location, form.onlyPmDue, form.scope],
  );

  const selectedAsset = useMemo(
    () => hardwareAssets.find((asset) => asset.assetId === form.assetId) || null,
    [form.assetId, hardwareAssets],
  );

  const derivedStatus = maintenanceIntentStatus(form.intent, form.scheduledDate || null);

  useEffect(() => {
    if (!open) return;
    const today = new Date().toISOString().slice(0, 10);
    setForm({
      ...defaultForm(),
      scope: presetConfig.scope,
      intent: presetConfig.intent,
      maintenanceType: presetConfig.maintenanceType,
      priority: presetConfig.priority,
      scheduledDate: today,
    });
    setTechnician(null);
    setError('');
  }, [open, preset, presetConfig.intent, presetConfig.maintenanceType, presetConfig.priority, presetConfig.scope]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose, saving]);

  const handleAssetChange = (assetId: string) => {
    const asset = hardwareAssets.find((row) => row.assetId === assetId);
    if (asset?.assignedEmployeeName) {
      setTechnician({
        employeeCode: asset.assignedEmployeeId || '',
        fullName: asset.assignedEmployeeName,
        department: asset.department || '',
        location: asset.location || '',
        email: asset.assignedEmail || '',
      });
      setForm((current) => ({ ...current, assetId, assignedTo: asset.assignedEmployeeName || '' }));
    } else {
      setTechnician(null);
      setForm((current) => ({ ...current, assetId, assignedTo: '' }));
    }
  };

  const handleTechnicianSelect = (selected: EmployeeOption | null) => {
    setTechnician(selected);
    setForm((current) => ({ ...current, assignedTo: selected?.fullName || '' }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (form.scope === 'individual' && !form.assetId) {
      setError('Select an asset for individual maintenance.');
      return;
    }
    if (form.scope === 'department' && !form.department) {
      setError('Select a department.');
      return;
    }
    if (form.scope === 'location' && !form.location) {
      setError('Select a location.');
      return;
    }
    if (presetConfig.requireNotes && !form.notes.trim()) {
      setError('Describe the issue or service required.');
      return;
    }
    if (form.intent === 'schedule' && !form.scheduledDate) {
      setError('Scheduled date is required when scheduling maintenance.');
      return;
    }
    if (!targetAssets.length) {
      setError('No assets match the selected scope and filters.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await onSubmit({
        scope: form.scope,
        intent: form.intent,
        assetId: form.scope === 'individual' ? form.assetId : undefined,
        department: form.scope === 'department' ? form.department : undefined,
        location: form.scope === 'location' ? form.location : undefined,
        maintenanceType: form.maintenanceType,
        category: form.category,
        scheduledDate: form.scheduledDate,
        priority: form.priority,
        assignedTo: form.assignedTo.trim(),
        notes: form.notes.trim(),
        onlyPmDue: form.onlyPmDue,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create maintenance records.');
    } finally {
      setSaving(false);
    }
  };

  const submitLabel = preset === 'default'
    ? `${maintenanceIntentLabel(form.intent)} maintenance for ${targetAssets.length} asset${targetAssets.length === 1 ? '' : 's'}`
    : `${presetConfig.submitVerb}${targetAssets.length > 1 ? ` (${targetAssets.length} assets)` : ''}`;

  const visibleScopes = MAINTENANCE_SCOPES.filter((scope) => presetConfig.allowedScopes.includes(scope));

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]" aria-label="Close dialog" onClick={() => !saving && onClose()} />
      <div className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-950">{presetConfig.title}</h2>
            <p className="mt-1 text-sm text-slate-500">{presetConfig.description}</p>
          </div>
          <button type="button" onClick={() => !saving && onClose()} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={(event) => void handleSubmit(event)} className="overflow-y-auto px-6 py-5">
          {error ? <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

          <div className="space-y-5">
            {presetConfig.showIntentPicker ? (
              <div>
                <p className={labelClass}>Action</p>
                <div className="grid grid-cols-3 gap-2">
                  {MAINTENANCE_INTENTS.map((intent) => (
                    <button
                      key={intent}
                      type="button"
                      onClick={() => setForm((current) => ({ ...current, intent }))}
                      className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                        form.intent === intent
                          ? 'border-dle-blue bg-dle-blue/10 text-dle-blue'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {maintenanceIntentLabel(intent)}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {presetConfig.showScopePicker ? (
              <div>
                <p className={labelClass}>Scope</p>
                <div className={`grid gap-2 ${visibleScopes.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                  {visibleScopes.map((scope) => {
                    const Icon = scopeIcons[scope];
                    return (
                      <button
                        key={scope}
                        type="button"
                        onClick={() => setForm((current) => ({
                          ...current,
                          scope,
                          assetId: scope === 'individual' ? current.assetId : '',
                          department: scope === 'department' ? current.department : '',
                          location: scope === 'location' ? current.location : '',
                        }))}
                        className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                          form.scope === scope
                            ? 'border-dle-blue bg-dle-blue/10 text-dle-blue'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {maintenanceScopeLabel(scope)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {form.scope === 'individual' ? (
              <label className="block">
                <span className={labelClass}>Asset <span className="text-rose-500">*</span></span>
                <select value={form.assetId} onChange={(e) => handleAssetChange(e.target.value)} className={inputClass} required>
                  <option value="">Select asset from register</option>
                  {hardwareAssets.map((asset) => (
                    <option key={asset.assetId} value={asset.assetId}>
                      {asset.assetTag} — {asset.model || asset.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {form.scope === 'department' ? (
              <label className="block">
                <span className={labelClass}>Department <span className="text-rose-500">*</span></span>
                <select
                  value={form.department}
                  onChange={(e) => setForm((current) => ({ ...current, department: e.target.value }))}
                  className={inputClass}
                  required
                >
                  <option value="">Select department</option>
                  {departments.map((department) => (
                    <option key={department} value={department}>{department}</option>
                  ))}
                </select>
              </label>
            ) : null}

            {form.scope === 'location' ? (
              <label className="block">
                <span className={labelClass}>Location <span className="text-rose-500">*</span></span>
                <select
                  value={form.location}
                  onChange={(e) => setForm((current) => ({ ...current, location: e.target.value }))}
                  className={inputClass}
                  required
                >
                  <option value="">Select location</option>
                  {locations.map((location) => (
                    <option key={location} value={location}>{location}</option>
                  ))}
                </select>
              </label>
            ) : null}

            {selectedAsset && form.scope === 'individual' ? (
              <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <div className="font-medium text-slate-800">{selectedAsset.model || selectedAsset.name}</div>
                <div>{selectedAsset.department || 'No department'} · {selectedAsset.location || 'No location'}</div>
              </div>
            ) : null}

            {presetConfig.showPmDueFilter ? (
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.onlyPmDue}
                  onChange={(e) => setForm((current) => ({ ...current, onlyPmDue: e.target.checked }))}
                  className="rounded border-slate-300"
                />
                Only assets with PM status DUE or OVERDUE
              </label>
            ) : null}

            <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-slate-700">
              {targetAssets.length ? (
                <>
                  <span className="font-semibold text-slate-900">{targetAssets.length}</span> asset{targetAssets.length === 1 ? '' : 's'} selected
                  {form.scope === 'department' && form.department ? ` in ${form.department}` : ''}
                  {form.scope === 'location' && form.location ? ` at ${form.location}` : ''}
                </>
              ) : (
                <span className="text-slate-600">Select an asset, department, or location to continue.</span>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {preset !== 'service-request' ? (
                <label className="block">
                  <span className={labelClass}>Maintenance Type</span>
                  <select
                    value={form.maintenanceType}
                    onChange={(e) => setForm((current) => ({ ...current, maintenanceType: e.target.value }))}
                    className={inputClass}
                  >
                    {MAINTENANCE_TYPES.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <p className={labelClass}>Request Type</p>
                  <p className="font-semibold text-slate-900">Corrective maintenance</p>
                </div>
              )}
              <label className="block">
                <span className={labelClass}>Category</span>
                <select
                  value={form.category}
                  onChange={(e) => setForm((current) => ({ ...current, category: e.target.value }))}
                  className={inputClass}
                >
                  {MAINTENANCE_CATEGORIES.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={labelClass}>
                  Scheduled Date {form.intent === 'schedule' ? <span className="text-rose-500">*</span> : null}
                </span>
                <input
                  type="date"
                  value={form.scheduledDate}
                  onChange={(e) => setForm((current) => ({ ...current, scheduledDate: e.target.value }))}
                  className={inputClass}
                  required={form.intent === 'schedule'}
                />
              </label>
              <label className="block">
                <span className={labelClass}>Priority</span>
                <select
                  value={form.priority}
                  onChange={(e) => setForm((current) => ({ ...current, priority: e.target.value }))}
                  className={inputClass}
                >
                  {MAINTENANCE_PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>{priority}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block">
              <span className={labelClass}>Assigned To</span>
              <EmployeePicker value={technician} onSelect={handleTechnicianSelect} placeholder="Search HRIS employee or technician..." />
            </label>

            <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Records will be created with status <span className="font-semibold text-slate-800">{derivedStatus}</span>.
            </div>

            <label className="block">
              <span className={labelClass}>
                {presetConfig.requireNotes ? 'Issue Description' : 'Notes'}
                {presetConfig.requireNotes ? <span className="text-rose-500"> *</span> : null}
              </span>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))}
                rows={3}
                placeholder={presetConfig.requireNotes ? 'Describe the fault, symptoms, or service required...' : 'Optional instructions for the maintenance team...'}
                className={inputClass}
                required={presetConfig.requireNotes}
              />
            </label>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !targetAssets.length}
              className="inline-flex items-center gap-2 rounded-lg bg-dle-blue px-5 py-2 text-sm font-semibold text-white hover:bg-dle-blue-deep disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving ? 'Saving...' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
