'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import type { ItAssetRecord } from '@/lib/it-asset-management-store';
import {
  ASSET_CONDITION_OPTIONS,
  defaultHardwareAssetForm,
  hardwareAssetFormFromRecord,
  hardwareAssetFormToPayload,
  HARDWARE_TYPE_OPTIONS,
  LOCATION_SUGGESTIONS,
  PM_STATUS_OPTIONS,
  REGISTER_STATUS_OPTIONS,
  type HardwareAssetFormState,
} from '../lib/asset-form-constants';
import { EmployeePicker, type EmployeeOption } from './AssetManagementShared';

type Props = {
  open: boolean;
  onClose: () => void;
  onSubmit: (asset: Record<string, unknown>) => Promise<void>;
  defaults?: { category?: string; subCategory?: string };
  asset?: ItAssetRecord | null;
};

type FieldErrors = Partial<Record<keyof HardwareAssetFormState, string>>;

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-dle-blue focus:ring-2 focus:ring-dle-blue/20';
const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500';

function FormField({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className={labelClass}>
        {label}
        {required ? <span className="text-rose-500"> *</span> : null}
      </span>
      {children}
      {error ? <p className="mt-1 text-xs text-rose-600">{error}</p> : null}
    </label>
  );
}

const validateForm = (form: HardwareAssetFormState): FieldErrors => {
  const errors: FieldErrors = {};
  if (!form.assetTag.trim()) errors.assetTag = 'Asset tag is required.';
  if (!form.model.trim()) errors.model = 'Model is required.';
  if (!form.typeKey.trim()) errors.typeKey = 'Asset type is required.';
  if (!form.registerStatus.trim()) errors.registerStatus = 'Register status is required.';
  if (form.purchaseCost && Number.isNaN(Number(form.purchaseCost))) errors.purchaseCost = 'Enter a valid purchase cost.';
  if (form.assignedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.assignedEmail.trim())) {
    errors.assignedEmail = 'Enter a valid email address.';
  }
  return errors;
};

export function AddAssetModal({ open, onClose, onSubmit, defaults, asset }: Props) {
  const isEdit = Boolean(asset);
  const [form, setForm] = useState<HardwareAssetFormState>(() => defaultHardwareAssetForm(defaults));
  const [employee, setEmployee] = useState<EmployeeOption | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);
  const [suggestingTag, setSuggestingTag] = useState(false);

  const loadSuggestedTag = useCallback(async () => {
    const response = await fetch('/api/it-support/asset-management?section=next-asset-tag', { cache: 'no-store' });
    const json = await response.json();
    if (json.status !== 'success') throw new Error(json.error || 'Unable to suggest asset tag.');
    return json.data as { assetTag: string; sourceAssetId: string };
  }, []);

  const resetForm = useCallback(async () => {
    if (asset) {
      const nextForm = hardwareAssetFormFromRecord(asset);
      setForm(nextForm);
      setEmployee(asset.assignedEmployeeName ? {
        employeeCode: asset.assignedEmployeeId || '',
        fullName: asset.assignedEmployeeName,
        department: asset.department || '',
        location: asset.location || '',
        email: asset.assignedEmail || '',
      } : null);
      setErrors({});
      setSubmitError('');
      return;
    }

    const baseForm = defaultHardwareAssetForm(defaults);
    setEmployee(null);
    setErrors({});
    setSubmitError('');
    try {
      const suggestion = await loadSuggestedTag();
      setForm({
        ...baseForm,
        assetTag: suggestion.assetTag,
        sourceAssetId: suggestion.sourceAssetId,
      });
    } catch {
      setForm(baseForm);
    }
  }, [asset, defaults, loadSuggestedTag]);

  useEffect(() => {
    if (!open) return;
    void resetForm();
  }, [open, resetForm]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose, saving]);

  const suggestTag = async () => {
    setSuggestingTag(true);
    setSubmitError('');
    try {
      const suggestion = await loadSuggestedTag();
      setForm((current) => ({
        ...current,
        assetTag: suggestion.assetTag,
        sourceAssetId: suggestion.sourceAssetId,
      }));
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to suggest asset tag.');
    } finally {
      setSuggestingTag(false);
    }
  };

  const handleEmployeeSelect = (selected: EmployeeOption | null) => {
    setEmployee(selected);
    setForm((current) => ({
      ...current,
      assignedEmployeeId: selected?.employeeCode || '',
      assignedEmployeeName: selected?.fullName || '',
      assignedEmail: selected?.email || current.assignedEmail,
      department: selected?.department || current.department,
      location: selected?.location || current.location,
    }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const preserveAssignedOn = asset?.assignedEmployeeName === form.assignedEmployeeName.trim()
      ? asset?.assignedOn || null
      : null;

    setSaving(true);
    setSubmitError('');
    try {
      await onSubmit(hardwareAssetFormToPayload(form, {
        preserveAssignedOn,
        isEdit,
      }));
      onClose();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : `Unable to ${isEdit ? 'update' : 'create'} asset.`);
    } finally {
      setSaving(false);
    }
  };

  const sectionTitle = useMemo(
    () => (isEdit
      ? `Update register record ${asset?.assetTag || ''} in DLE_Enterprise.`
      : 'Register a new hardware asset in DLE_Enterprise with full lifecycle metadata.'),
    [asset?.assetTag, isEdit],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="add-asset-title">
      <button type="button" className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]" aria-label="Close dialog" onClick={() => !saving && onClose()} />
      <div className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 id="add-asset-title" className="text-lg font-bold text-slate-950">{isEdit ? 'Edit Hardware Asset' : 'Add Hardware Asset'}</h2>
            <p className="mt-1 text-sm text-slate-500">{sectionTitle}</p>
          </div>
          <button
            type="button"
            onClick={() => !saving && onClose()}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={(event) => void handleSubmit(event)} className="flex min-h-0 flex-1 flex-col">
          <div className="overflow-y-auto px-6 py-5">
            {submitError ? (
              <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{submitError}</div>
            ) : null}

            <section className="mb-6">
              <h3 className="mb-3 text-sm font-bold text-slate-900">Identification</h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <FormField label="Asset Tag" required error={errors.assetTag}>
                  <div className="flex gap-2">
                    <input
                      value={form.assetTag}
                      onChange={(e) => setForm((current) => ({ ...current, assetTag: e.target.value }))}
                      placeholder="Auto-generated from register"
                      className={inputClass}
                      readOnly={!isEdit}
                    />
                    {!isEdit ? (
                      <button
                        type="button"
                        onClick={() => void suggestTag()}
                        disabled={suggestingTag || saving}
                        className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        {suggestingTag ? '...' : 'Regenerate'}
                      </button>
                    ) : null}
                  </div>
                </FormField>
                <FormField label="Source Asset ID" error={errors.sourceAssetId}>
                  <input
                    value={form.sourceAssetId}
                    onChange={(e) => setForm((current) => ({ ...current, sourceAssetId: e.target.value }))}
                    placeholder="Optional register ID"
                    className={inputClass}
                  />
                </FormField>
                <FormField label="Serial Number" error={errors.serialNumber}>
                  <input
                    value={form.serialNumber}
                    onChange={(e) => setForm((current) => ({ ...current, serialNumber: e.target.value }))}
                    placeholder="Manufacturer serial"
                    className={inputClass}
                  />
                </FormField>
                <FormField label="Model" required error={errors.model}>
                  <input
                    value={form.model}
                    onChange={(e) => setForm((current) => ({ ...current, model: e.target.value }))}
                    placeholder="HP ELITEBOOK 840 G8"
                    className={inputClass}
                  />
                </FormField>
                <FormField label="Manufacturer" error={errors.manufacturer}>
                  <input
                    value={form.manufacturer}
                    onChange={(e) => setForm((current) => ({ ...current, manufacturer: e.target.value }))}
                    placeholder="HP, DELL, APPLE..."
                    className={inputClass}
                  />
                </FormField>
                <FormField label="Type" required error={errors.typeKey}>
                  <select
                    value={form.typeKey}
                    onChange={(e) => setForm((current) => ({ ...current, typeKey: e.target.value }))}
                    className={inputClass}
                  >
                    {HARDWARE_TYPE_OPTIONS.map((option) => (
                      <option key={`${option.category}::${option.subCategory}`} value={`${option.category}::${option.subCategory}`}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </FormField>
              </div>
            </section>

            <section className="mb-6">
              <h3 className="mb-3 text-sm font-bold text-slate-900">Assignment & Location</h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <FormField label="Department" error={errors.department}>
                  <input
                    value={form.department}
                    onChange={(e) => setForm((current) => ({ ...current, department: e.target.value }))}
                    placeholder="Finance, IT, Project..."
                    className={inputClass}
                  />
                </FormField>
                <FormField label="Location" error={errors.location}>
                  <input
                    value={form.location}
                    onChange={(e) => setForm((current) => ({ ...current, location: e.target.value }))}
                    placeholder="IDI ORO"
                    list="asset-location-suggestions"
                    className={inputClass}
                  />
                  <datalist id="asset-location-suggestions">
                    {LOCATION_SUGGESTIONS.map((location) => <option key={location} value={location} />)}
                  </datalist>
                </FormField>
                <FormField label="Assigned To" error={errors.assignedEmployeeName}>
                  <EmployeePicker value={employee} onSelect={handleEmployeeSelect} placeholder="Search HRIS employee..." />
                </FormField>
                <FormField label="Assigned Email" error={errors.assignedEmail}>
                  <input
                    type="email"
                    value={form.assignedEmail}
                    onChange={(e) => setForm((current) => ({ ...current, assignedEmail: e.target.value }))}
                    placeholder="employee@dormanlongeng.com"
                    className={inputClass}
                  />
                </FormField>
              </div>
            </section>

            <section className="mb-6">
              <h3 className="mb-3 text-sm font-bold text-slate-900">Status & Maintenance</h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <FormField label="Register Status" required error={errors.registerStatus}>
                  <select
                    value={form.registerStatus}
                    onChange={(e) => setForm((current) => ({ ...current, registerStatus: e.target.value as HardwareAssetFormState['registerStatus'] }))}
                    className={inputClass}
                  >
                    {REGISTER_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </FormField>
                <FormField label="PM Status" error={errors.pmStatus}>
                  <select
                    value={form.pmStatus}
                    onChange={(e) => setForm((current) => ({ ...current, pmStatus: e.target.value as HardwareAssetFormState['pmStatus'] }))}
                    className={inputClass}
                  >
                    {PM_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </FormField>
                <FormField label="Next PM Due" error={errors.nextPmDue}>
                  <input
                    type="date"
                    value={form.nextPmDue}
                    onChange={(e) => setForm((current) => ({ ...current, nextPmDue: e.target.value }))}
                    className={inputClass}
                  />
                </FormField>
                <FormField label="Condition" error={errors.assetCondition}>
                  <select
                    value={form.assetCondition}
                    onChange={(e) => setForm((current) => ({ ...current, assetCondition: e.target.value as HardwareAssetFormState['assetCondition'] }))}
                    className={inputClass}
                  >
                    {ASSET_CONDITION_OPTIONS.map((condition) => <option key={condition} value={condition}>{condition}</option>)}
                  </select>
                </FormField>
                <FormField label="Operating System" error={errors.operatingSystem}>
                  <input
                    value={form.operatingSystem}
                    onChange={(e) => setForm((current) => ({ ...current, operatingSystem: e.target.value }))}
                    placeholder="Windows 11"
                    className={inputClass}
                  />
                </FormField>
              </div>
            </section>

            <section>
              <h3 className="mb-3 text-sm font-bold text-slate-900">Lifecycle & Notes</h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <FormField label="Purchase Date" error={errors.purchaseDate}>
                  <input
                    type="date"
                    value={form.purchaseDate}
                    onChange={(e) => setForm((current) => ({ ...current, purchaseDate: e.target.value }))}
                    className={inputClass}
                  />
                </FormField>
                <FormField label="Purchase Cost (NGN)" error={errors.purchaseCost}>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.purchaseCost}
                    onChange={(e) => setForm((current) => ({ ...current, purchaseCost: e.target.value }))}
                    placeholder="0.00"
                    className={inputClass}
                  />
                </FormField>
                <FormField label="Warranty Expiry" error={errors.warrantyExpiry}>
                  <input
                    type="date"
                    value={form.warrantyExpiry}
                    onChange={(e) => setForm((current) => ({ ...current, warrantyExpiry: e.target.value }))}
                    className={inputClass}
                  />
                </FormField>
                <div className="md:col-span-2 xl:col-span-3">
                  <FormField label="Notes" error={errors.notes}>
                    <textarea
                      value={form.notes}
                      onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))}
                      rows={3}
                      placeholder="Additional register notes..."
                      className={inputClass}
                    />
                  </FormField>
                </div>
              </div>
            </section>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
            <button
              type="button"
              onClick={() => onClose()}
              disabled={saving}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-dle-blue px-5 py-2 text-sm font-semibold text-white hover:bg-dle-blue-deep disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving ? (isEdit ? 'Updating Asset...' : 'Saving Asset...') : (isEdit ? 'Update Asset' : 'Save Asset')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
