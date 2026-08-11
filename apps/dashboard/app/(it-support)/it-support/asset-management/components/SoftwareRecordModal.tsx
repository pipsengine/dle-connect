'use client';

import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';

export type SoftwareRecordKind = 'catalog' | 'license' | 'installed' | 'request';

type Props = {
  open: boolean;
  kind: SoftwareRecordKind;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
};

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-dle-blue focus:ring-2 focus:ring-dle-blue/20';
const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500';

const titles: Record<SoftwareRecordKind, string> = {
  catalog: 'Add Software Catalog Record',
  license: 'Add Software License',
  installed: 'Add Installed Software',
  request: 'Add Software Request',
};

const defaults: Record<SoftwareRecordKind, Record<string, string>> = {
  catalog: { productName: '', vendorName: '', category: '', edition: '', status: 'Approved', annualCost: '' },
  license: { productName: '', vendorName: '', licenseType: 'Subscription', seatsTotal: '', seatsUsed: '', complianceStatus: 'In Compliance', expiryDate: '', annualCost: '' },
  installed: { productName: '', version: '', installedOn: '', assetTag: '', status: 'Active' },
  request: { title: '', requesterName: '', department: '', priority: 'Medium', status: 'Open', requestedOn: '', notes: '' },
};

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={labelClass}>
        {label}
        {required ? <span className="text-rose-500"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

export function SoftwareRecordModal({ open, kind, onClose, onSubmit }: Props) {
  const [form, setForm] = useState<Record<string, string>>(defaults[kind]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setForm(defaults[kind]);
      setError('');
      setSaving(false);
    }
  }, [open, kind]);

  if (!open) return null;

  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload: Record<string, unknown> = { ...form };
      if (form.annualCost !== undefined) payload.annualCost = form.annualCost ? Number(form.annualCost) : null;
      if (form.seatsTotal !== undefined) payload.seatsTotal = Number(form.seatsTotal || 0);
      if (form.seatsUsed !== undefined) payload.seatsUsed = Number(form.seatsUsed || 0);
      await onSubmit(payload);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save record.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]" aria-label="Close dialog" onClick={onClose} />
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-950">{titles[kind]}</h2>
            <p className="mt-1 text-sm text-slate-500">Capture software details for tracking, licensing, and compliance.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={(event) => void submit(event)} className="space-y-4 px-6 py-5">
          {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

          {kind === 'catalog' ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="Product name" required><input className={inputClass} value={form.productName} onChange={(e) => set('productName', e.target.value)} required /></Field>
              <Field label="Vendor"><input className={inputClass} value={form.vendorName} onChange={(e) => set('vendorName', e.target.value)} /></Field>
              <Field label="Category"><input className={inputClass} value={form.category} onChange={(e) => set('category', e.target.value)} /></Field>
              <Field label="Edition"><input className={inputClass} value={form.edition} onChange={(e) => set('edition', e.target.value)} /></Field>
              <Field label="Status">
                <select className={inputClass} value={form.status} onChange={(e) => set('status', e.target.value)}>
                  {['Approved', 'Review', 'Deprecated', 'Restricted'].map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </Field>
              <Field label="Annual cost (NGN)"><input type="number" min="0" step="0.01" className={inputClass} value={form.annualCost} onChange={(e) => set('annualCost', e.target.value)} /></Field>
            </div>
          ) : null}

          {kind === 'license' ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="Product name" required><input className={inputClass} value={form.productName} onChange={(e) => set('productName', e.target.value)} required /></Field>
              <Field label="Vendor"><input className={inputClass} value={form.vendorName} onChange={(e) => set('vendorName', e.target.value)} /></Field>
              <Field label="License type">
                <select className={inputClass} value={form.licenseType} onChange={(e) => set('licenseType', e.target.value)}>
                  {['Subscription', 'Perpetual', 'Storage', 'Enterprise'].map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </Field>
              <Field label="Compliance">
                <select className={inputClass} value={form.complianceStatus} onChange={(e) => set('complianceStatus', e.target.value)}>
                  {['In Compliance', 'Expiring Soon', 'Expired', 'Non-Compliant'].map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </Field>
              <Field label="Seats total"><input type="number" min="0" className={inputClass} value={form.seatsTotal} onChange={(e) => set('seatsTotal', e.target.value)} /></Field>
              <Field label="Seats used"><input type="number" min="0" className={inputClass} value={form.seatsUsed} onChange={(e) => set('seatsUsed', e.target.value)} /></Field>
              <Field label="Expiry date"><input type="date" className={inputClass} value={form.expiryDate} onChange={(e) => set('expiryDate', e.target.value)} /></Field>
              <Field label="Annual cost (NGN)"><input type="number" min="0" step="0.01" className={inputClass} value={form.annualCost} onChange={(e) => set('annualCost', e.target.value)} /></Field>
            </div>
          ) : null}

          {kind === 'installed' ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="Product name" required><input className={inputClass} value={form.productName} onChange={(e) => set('productName', e.target.value)} required /></Field>
              <Field label="Version"><input className={inputClass} value={form.version} onChange={(e) => set('version', e.target.value)} /></Field>
              <Field label="Installed on"><input className={inputClass} value={form.installedOn} onChange={(e) => set('installedOn', e.target.value)} placeholder="User or asset" /></Field>
              <Field label="Asset tag"><input className={inputClass} value={form.assetTag} onChange={(e) => set('assetTag', e.target.value)} /></Field>
              <Field label="Status">
                <select className={inputClass} value={form.status} onChange={(e) => set('status', e.target.value)}>
                  {['Active', 'Inactive', 'Unapproved'].map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </Field>
            </div>
          ) : null}

          {kind === 'request' ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="Request title" required><input className={inputClass} value={form.title} onChange={(e) => set('title', e.target.value)} required /></Field>
              <Field label="Requester" required><input className={inputClass} value={form.requesterName} onChange={(e) => set('requesterName', e.target.value)} required /></Field>
              <Field label="Department"><input className={inputClass} value={form.department} onChange={(e) => set('department', e.target.value)} /></Field>
              <Field label="Priority">
                <select className={inputClass} value={form.priority} onChange={(e) => set('priority', e.target.value)}>
                  {['Low', 'Medium', 'High', 'Critical'].map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </Field>
              <Field label="Status">
                <select className={inputClass} value={form.status} onChange={(e) => set('status', e.target.value)}>
                  {['Open', 'In Review', 'Approved', 'Rejected', 'Fulfilled'].map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </Field>
              <Field label="Requested on"><input type="date" className={inputClass} value={form.requestedOn} onChange={(e) => set('requestedOn', e.target.value)} /></Field>
              <div className="md:col-span-2">
                <Field label="Notes"><textarea className={`${inputClass} min-h-[80px]`} value={form.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-dle-blue px-4 py-2 text-sm font-semibold text-white hover:bg-dle-blue-deep disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving ? 'Saving...' : 'Save record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
