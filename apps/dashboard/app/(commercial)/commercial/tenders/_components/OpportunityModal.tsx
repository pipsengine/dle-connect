'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import type { TenderLookups, TenderOpportunity } from '@/lib/commercial/tender-types';
import { money, tenderGet, tenderPost, tenderUpload } from './tender-api';

const STEPS = ['Opportunity Details', 'Client & Contact', 'Scope & Commercial', 'Key Dates', 'Documents', 'Team & Approval'];
const TYPES = ['Client Tender', 'Supplier Tender', 'Enquiry', 'Framework Agreement', 'Other'];
const SOURCES = ['Client Direct', 'Invitation', 'Public Portal', 'Referral', 'Framework Call-off'];
const TENDER_TYPES = ['Client Bid', 'Supplier Tender', 'Enquiry', 'Framework Agreement', 'Internal Tender', 'Other'];
const CATEGORIES = ['Oil & Gas', 'Fabrication', 'Construction', 'Civil Works', 'Maintenance', 'Procurement', 'Infrastructure', 'Equipment', 'Materials', 'IT Services', 'Energy', 'Consultancy'];
const SUBCATEGORIES = ['EPC', 'Fabrication', 'Supply', 'Installation', 'Services', 'Consultancy'];
const STATUSES = ['Open', 'Under Review', 'Prequalification', 'Closed', 'Awarded'];
const PRIORITIES = ['High', 'Medium', 'Low'];
const CONTRACTS = ['Lump Sum', 'Unit Rate', 'Reimbursable', 'Framework'];
const CURRENCIES = [
  { code: 'NGN', label: 'NGN - Nigerian Naira' },
  { code: 'USD', label: 'USD - US Dollar' },
  { code: 'EUR', label: 'EUR - Euro' },
  { code: 'GBP', label: 'GBP - British Pound' },
];

type FormState = {
  id: string;
  title: string;
  referenceNo: string;
  opportunityType: string;
  source: string;
  tenderType: string;
  category: string;
  subCategory: string;
  businessUnit: string;
  description: string;
  status: string;
  priority: string;
  clientName: string;
  clientAddress: string;
  contactPerson: string;
  designation: string;
  email: string;
  phone: string;
  department: string;
  location: string;
  site: string;
  estimatedValue: string;
  currency: string;
  contractType: string;
  projectLocation: string;
  contractDuration: string;
  durationUnit: string;
  allowJv: boolean;
  retentions: boolean;
  scopeSummary: string;
  submissionDeadline: string;
  closingDate: string;
  invitationDate: string;
  siteVisitDate: string;
  clarificationDeadline: string;
  ownerName: string;
  teamNotes: string;
  approvalNotes: string;
  documentCategory: string;
};

const blank = (): FormState => ({
  id: '',
  title: '',
  referenceNo: '',
  opportunityType: 'Client Tender',
  source: 'Client Direct',
  tenderType: 'Client Bid',
  category: '',
  subCategory: '',
  businessUnit: '',
  description: '',
  status: 'Open',
  priority: 'High',
  clientName: '',
  clientAddress: '',
  contactPerson: '',
  designation: '',
  email: '',
  phone: '',
  department: '',
  location: '',
  site: '',
  estimatedValue: '',
  currency: 'NGN',
  contractType: 'Lump Sum',
  projectLocation: '',
  contractDuration: '',
  durationUnit: 'Months',
  allowJv: true,
  retentions: true,
  scopeSummary: '',
  submissionDeadline: '',
  closingDate: '',
  invitationDate: '',
  siteVisitDate: '',
  clarificationDeadline: '',
  ownerName: '',
  teamNotes: '',
  approvalNotes: '',
  documentCategory: 'Invitation',
});

const fromOpportunity = (row: TenderOpportunity): FormState => ({
  ...blank(),
  id: row.id,
  title: row.title,
  referenceNo: row.referenceNo,
  opportunityType: row.opportunityType || 'Client Tender',
  source: row.source || 'Client Direct',
  tenderType: row.tenderType || 'Client Bid',
  category: row.category,
  subCategory: row.subCategory,
  businessUnit: row.businessUnit,
  description: row.description,
  status: row.status === 'Draft' ? 'Open' : row.status || 'Open',
  priority: row.priority || 'Medium',
  clientName: row.clientName,
  clientAddress: row.clientAddress,
  contactPerson: row.contactPerson,
  designation: row.designation,
  email: row.email,
  phone: row.phone,
  department: row.department,
  location: row.location,
  site: row.site,
  estimatedValue: row.estimatedValue ? String(row.estimatedValue) : '',
  currency: row.currency || 'NGN',
  contractType: row.contractType || 'Lump Sum',
  projectLocation: row.projectLocation,
  contractDuration: row.contractDuration == null ? '' : String(row.contractDuration),
  durationUnit: row.durationUnit || 'Months',
  allowJv: row.allowJv,
  retentions: row.retentions,
  scopeSummary: row.scopeSummary,
  submissionDeadline: row.submissionDeadline,
  closingDate: row.closingDate,
  invitationDate: row.invitationDate,
  siteVisitDate: row.siteVisitDate,
  clarificationDeadline: row.clarificationDeadline,
  ownerName: row.ownerName,
  teamNotes: row.teamNotes,
  approvalNotes: row.approvalNotes,
});

const fieldClass = 'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const labelClass = 'mb-1 block text-xs font-semibold text-slate-600';

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}{required ? <span className="text-rose-500"> *</span> : null}</span>
      {children}
    </label>
  );
}

export function OpportunityModal({
  open,
  initial,
  presetType,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial?: TenderOpportunity | null;
  presetType?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(blank);
  const [step, setStep] = useState(0);
  const [lookups, setLookups] = useState<TenderLookups | null>(null);
  const [lookupError, setLookupError] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [taskTitle, setTaskTitle] = useState('');

  useEffect(() => {
    if (!open) return;
    const next = initial ? fromOpportunity(initial) : blank();
    if (!initial && presetType === 'Enquiry') {
      next.opportunityType = 'Enquiry';
      next.tenderType = 'Enquiry';
    }
    setForm(next);
    setStep(0);
    setFiles([]);
    setError('');
    setNotice('');
    setLookupError('');
    tenderGet<TenderLookups>('lookups')
      .then(setLookups)
      .catch((reason) => setLookupError(reason instanceof Error ? reason.message : 'Organization lookups are unavailable.'));
  }, [open, initial, presetType]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  const progress = useMemo(() => {
    const checks = [
      Boolean(form.title && form.source),
      Boolean(form.clientName),
      Boolean(form.estimatedValue && form.department && form.location && form.site),
      Boolean(form.submissionDeadline || form.closingDate || form.invitationDate),
      files.length > 0,
      Boolean(form.ownerName || form.approvalNotes),
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [files.length, form]);

  if (!open) return null;

  const payload = () => ({
    id: form.id || undefined,
    title: form.title,
    referenceNo: form.referenceNo,
    opportunityType: form.opportunityType,
    source: form.source,
    tenderType: form.tenderType,
    category: form.category,
    subCategory: form.subCategory,
    businessUnit: form.businessUnit,
    description: form.description,
    status: form.status,
    priority: form.priority,
    clientName: form.clientName,
    clientAddress: form.clientAddress,
    contactPerson: form.contactPerson,
    designation: form.designation,
    email: form.email,
    phone: form.phone,
    department: form.department,
    location: form.location,
    site: form.site,
    estimatedValue: Number(form.estimatedValue || 0),
    currency: form.currency,
    contractType: form.contractType,
    projectLocation: form.projectLocation,
    contractDuration: form.contractDuration ? Number(form.contractDuration) : null,
    durationUnit: form.durationUnit,
    allowJv: form.allowJv,
    retentions: form.retentions,
    scopeSummary: form.scopeSummary,
    submissionDeadline: form.submissionDeadline,
    closingDate: form.closingDate,
    invitationDate: form.invitationDate,
    siteVisitDate: form.siteVisitDate,
    clarificationDeadline: form.clarificationDeadline,
    ownerName: form.ownerName,
    teamNotes: form.teamNotes,
    approvalNotes: form.approvalNotes,
  });

  const persist = async (saveMode: 'draft' | 'submit') => {
    const saved = await tenderPost<TenderOpportunity>({ action: 'save', opportunity: { ...payload(), saveMode } });
    if (!saved?.id) throw new Error('The opportunity was not saved.');
    setForm((current) => ({ ...current, id: saved.id, referenceNo: saved.referenceNo }));
    for (const file of files) {
      await tenderUpload(saved.id, file, form.documentCategory);
    }
    setFiles([]);
    return saved;
  };

  const save = async (saveMode: 'draft' | 'submit') => {
    setBusy(true);
    setError('');
    try {
      await persist(saveMode);
      onSaved();
      if (saveMode === 'submit') onClose();
      else setNotice('Draft saved to DLE_Enterprise.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  };

  const runAction = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(true);
    setError('');
    try {
      const saved = form.id ? { id: form.id } : await persist('draft');
      await tenderPost({ action, id: saved.id, ...extra });
      setNotice('Saved.');
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  };

  const options = (rows: Array<{ id: string; name: string; code?: string }> | undefined, placeholder: string) => (
    <>
      <option value="">{placeholder}</option>
      {(rows || []).map((row) => (
        <option key={row.id || row.name} value={row.name}>{row.code ? `${row.name} (${row.code})` : row.name}</option>
      ))}
    </>
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-slate-900/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="my-4 w-full max-w-6xl rounded-2xl bg-[#f6f8fc] shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-lg font-black text-white">+</div>
            <div>
              <div className="text-xs font-semibold text-slate-400">Tender Management / Tender Opportunities / New Opportunity</div>
              <h2 className="text-xl font-black text-slate-950">{form.id ? 'Edit Tender Opportunity' : 'New Tender Opportunity'}</h2>
              <p className="text-sm text-slate-500">Register a tender opportunity, enquiry or invitation received from a client or external source.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" disabled={busy} onClick={() => save('draft')} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Save as Draft</button>
            <button type="button" disabled={busy} onClick={() => save('submit')} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700">Submit for Review</button>
            <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close"><X className="h-4 w-4" /></button>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-white px-5 py-3">
          {STEPS.map((label, index) => (
            <button key={label} type="button" onClick={() => setStep(index)} className={`flex shrink-0 items-center gap-2 rounded-full px-2 py-1 text-xs font-bold ${step === index ? 'text-blue-700' : 'text-slate-400'}`}>
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${step === index ? 'bg-blue-600 text-white' : index < step ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'}`}>{index < step ? <Check className="h-3 w-3" /> : index + 1}</span>
              {label}
            </button>
          ))}
        </div>

        {error ? <div className="mx-5 mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
        {notice ? <div className="mx-5 mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div> : null}
        {lookupError ? <div className="mx-5 mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{lookupError}</div> : null}

        <div className="grid gap-4 p-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-4">
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="mb-3 text-sm font-black text-slate-900">1 Opportunity Details</h3>
              <div className="mb-3">
                <div className={labelClass}>Opportunity Type</div>
                <div className="flex flex-wrap gap-3 text-sm">
                  {TYPES.map((type) => (
                    <label key={type} className="inline-flex items-center gap-2">
                      <input type="radio" name="opportunityType" checked={form.opportunityType === type} onChange={() => set('opportunityType', type)} />
                      {type}
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Tender Title" required><input className={fieldClass} value={form.title} onChange={(event) => set('title', event.target.value)} /></Field>
                <Field label="Reference No."><input className={fieldClass} value={form.referenceNo} onChange={(event) => set('referenceNo', event.target.value)} placeholder="Assigned on save when blank" /></Field>
                <Field label="Source" required>
                  <select className={fieldClass} value={form.source} onChange={(event) => set('source', event.target.value)}>{SOURCES.map((item) => <option key={item}>{item}</option>)}</select>
                </Field>
                <Field label="Type">
                  <select className={fieldClass} value={form.tenderType} onChange={(event) => set('tenderType', event.target.value)}>{TENDER_TYPES.map((item) => <option key={item}>{item}</option>)}</select>
                </Field>
                <Field label="Category">
                  <select className={fieldClass} value={form.category} onChange={(event) => set('category', event.target.value)}>
                    <option value="">Select category</option>
                    {CATEGORIES.map((item) => <option key={item}>{item}</option>)}
                  </select>
                </Field>
                <Field label="Sub Category">
                  <select className={fieldClass} value={form.subCategory} onChange={(event) => set('subCategory', event.target.value)}>
                    <option value="">Select sub category</option>
                    {SUBCATEGORIES.map((item) => <option key={item}>{item}</option>)}
                  </select>
                </Field>
                <Field label="Business Unit">
                  <select className={fieldClass} value={form.businessUnit} onChange={(event) => set('businessUnit', event.target.value)}>
                    <option value="">{lookups ? 'Select business unit' : 'Loading organization units…'}</option>
                    {(lookups?.businessUnits || []).map((item) => <option key={item}>{item}</option>)}
                  </select>
                </Field>
                <Field label="Priority">
                  <select className={fieldClass} value={form.priority} onChange={(event) => set('priority', event.target.value)}>{PRIORITIES.map((item) => <option key={item}>{item}</option>)}</select>
                </Field>
              </div>
              <label className="mt-3 block">
                <span className={labelClass}>Description</span>
                <textarea className="min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" maxLength={1000} value={form.description} onChange={(event) => set('description', event.target.value)} />
                <span className="text-[11px] text-slate-400">{form.description.length}/1000</span>
              </label>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="mb-3 text-sm font-black text-slate-900">2 Client & Contact Information</h3>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Client Name" required><input className={fieldClass} value={form.clientName} onChange={(event) => set('clientName', event.target.value)} /></Field>
                <Field label="Client Address"><input className={fieldClass} value={form.clientAddress} onChange={(event) => set('clientAddress', event.target.value)} /></Field>
                <Field label="Client Contact Person"><input className={fieldClass} value={form.contactPerson} onChange={(event) => set('contactPerson', event.target.value)} /></Field>
                <Field label="Designation"><input className={fieldClass} value={form.designation} onChange={(event) => set('designation', event.target.value)} /></Field>
                <Field label="Email Address"><input className={fieldClass} type="email" value={form.email} onChange={(event) => set('email', event.target.value)} /></Field>
                <Field label="Phone Number"><input className={fieldClass} value={form.phone} onChange={(event) => set('phone', event.target.value)} /></Field>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="mb-3 text-sm font-black text-slate-900">3 Scope & Commercial Information</h3>
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Estimated Value" required>
                  <div className="flex gap-2">
                    <select className="h-10 rounded-lg border border-slate-200 px-2 text-sm" value={form.currency} onChange={(event) => set('currency', event.target.value)}>
                      {CURRENCIES.map((item) => <option key={item.code} value={item.code}>{item.code}</option>)}
                    </select>
                    <input className={fieldClass} inputMode="decimal" value={form.estimatedValue} onChange={(event) => set('estimatedValue', event.target.value)} />
                  </div>
                </Field>
                <Field label="Contract Type">
                  <select className={fieldClass} value={form.contractType} onChange={(event) => set('contractType', event.target.value)}>{CONTRACTS.map((item) => <option key={item}>{item}</option>)}</select>
                </Field>
                <Field label="Tender Currency">
                  <select className={fieldClass} value={form.currency} onChange={(event) => set('currency', event.target.value)}>{CURRENCIES.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select>
                </Field>
                <Field label="Department" required>
                  <select className={fieldClass} value={form.department} onChange={(event) => set('department', event.target.value)}>
                    {options(lookups?.departments, lookups ? 'Select department' : 'Loading departments…')}
                  </select>
                </Field>
                <Field label="Location" required>
                  <select className={fieldClass} value={form.location} onChange={(event) => set('location', event.target.value)}>
                    {options(lookups?.locations, lookups ? 'Select location' : 'Loading locations…')}
                  </select>
                </Field>
                <Field label="Site" required>
                  <select className={fieldClass} value={form.site} onChange={(event) => set('site', event.target.value)}>
                    {options(lookups?.sites, lookups ? 'Select site' : 'Loading sites…')}
                  </select>
                </Field>
                <Field label="Project Location"><input className={fieldClass} value={form.projectLocation} onChange={(event) => set('projectLocation', event.target.value)} /></Field>
                <Field label="Contract Duration">
                  <div className="flex gap-2">
                    <input className={fieldClass} inputMode="numeric" value={form.contractDuration} onChange={(event) => set('contractDuration', event.target.value)} />
                    <select className="h-10 rounded-lg border border-slate-200 px-2 text-sm" value={form.durationUnit} onChange={(event) => set('durationUnit', event.target.value)}>
                      <option>Months</option><option>Weeks</option><option>Days</option>
                    </select>
                  </div>
                </Field>
                <div className="flex items-end gap-4 pb-2 text-sm">
                  <label className="inline-flex items-center gap-2"><input type="checkbox" checked={form.allowJv} onChange={(event) => set('allowJv', event.target.checked)} /> Allowable JV / Consortium</label>
                  <label className="inline-flex items-center gap-2"><input type="checkbox" checked={form.retentions} onChange={(event) => set('retentions', event.target.checked)} /> Retentions</label>
                </div>
              </div>
              <label className="mt-3 block">
                <span className={labelClass}>Scope Summary</span>
                <textarea className="min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" maxLength={1000} value={form.scopeSummary} onChange={(event) => set('scopeSummary', event.target.value)} />
                <span className="text-[11px] text-slate-400">{form.scopeSummary.length}/1000</span>
              </label>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="mb-3 text-sm font-black text-slate-900">4 Key Dates</h3>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Submission Deadline"><input className={fieldClass} type="date" value={form.submissionDeadline} onChange={(event) => set('submissionDeadline', event.target.value)} /></Field>
                <Field label="Closing Date"><input className={fieldClass} type="date" value={form.closingDate} onChange={(event) => set('closingDate', event.target.value)} /></Field>
                <Field label="Invitation Date"><input className={fieldClass} type="date" value={form.invitationDate} onChange={(event) => set('invitationDate', event.target.value)} /></Field>
                <Field label="Site Visit Date"><input className={fieldClass} type="date" value={form.siteVisitDate} onChange={(event) => set('siteVisitDate', event.target.value)} /></Field>
                <Field label="Clarification Deadline"><input className={fieldClass} type="date" value={form.clarificationDeadline} onChange={(event) => set('clarificationDeadline', event.target.value)} /></Field>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="mb-3 text-sm font-black text-slate-900">5 Documents</h3>
              <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
                <Field label="Category">
                  <select className={fieldClass} value={form.documentCategory} onChange={(event) => set('documentCategory', event.target.value)}>
                    {['Invitation', 'Scope', 'Commercial', 'Technical', 'Other'].map((item) => <option key={item}>{item}</option>)}
                  </select>
                </Field>
                <Field label="Files">
                  <input className={fieldClass} type="file" multiple onChange={(event) => setFiles(Array.from(event.target.files || []))} />
                </Field>
              </div>
              {files.length ? <ul className="mt-2 text-sm text-slate-600">{files.map((file) => <li key={file.name}>{file.name}</li>)}</ul> : <p className="mt-2 text-sm text-slate-400">No files selected. Documents are stored with the opportunity when you save.</p>}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="mb-3 text-sm font-black text-slate-900">6 Team & Approval</h3>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Opportunity Owner"><input className={fieldClass} value={form.ownerName} onChange={(event) => set('ownerName', event.target.value)} /></Field>
                <Field label="Opportunity Status">
                  <select className={fieldClass} value={form.status} onChange={(event) => set('status', event.target.value)}>{STATUSES.map((item) => <option key={item}>{item}</option>)}</select>
                </Field>
              </div>
              <label className="mt-3 block">
                <span className={labelClass}>Team notes</span>
                <textarea className="min-h-16 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.teamNotes} onChange={(event) => set('teamNotes', event.target.value)} />
              </label>
              <label className="mt-3 block">
                <span className={labelClass}>Approval notes</span>
                <textarea className="min-h-16 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.approvalNotes} onChange={(event) => set('approvalNotes', event.target.value)} />
              </label>
            </section>
          </div>

          <aside className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Opportunity Status</div>
              <div className="mt-2 text-sm font-bold text-emerald-600">{form.status || 'Open'}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
              <div className="mb-2 text-sm font-black">Opportunity Summary</div>
              <dl className="space-y-1 text-slate-600">
                <div className="flex justify-between gap-3"><dt>Reference No.</dt><dd className="font-semibold text-slate-900">{form.referenceNo || 'Pending'}</dd></div>
                <div className="flex justify-between gap-3"><dt>Type</dt><dd>{form.tenderType}</dd></div>
                <div className="flex justify-between gap-3"><dt>Category</dt><dd>{form.category || '—'}</dd></div>
                <div className="flex justify-between gap-3"><dt>Value (Est.)</dt><dd>{form.estimatedValue ? money(Number(form.estimatedValue), form.currency) : '—'}</dd></div>
                <div className="flex justify-between gap-3"><dt>Currency</dt><dd>{form.currency}</dd></div>
                <div className="flex justify-between gap-3"><dt>Department</dt><dd className="text-right">{form.department || '—'}</dd></div>
                <div className="flex justify-between gap-3"><dt>Location</dt><dd className="text-right">{form.location || '—'}</dd></div>
                <div className="flex justify-between gap-3"><dt>Site</dt><dd className="text-right">{form.site || '—'}</dd></div>
                <div className="flex justify-between gap-3"><dt>Priority</dt><dd className="font-semibold text-rose-600">{form.priority}</dd></div>
              </dl>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-2 text-sm font-black">Quick Actions</div>
              <div className="space-y-2">
                <button type="button" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-sm font-semibold hover:bg-slate-50" onClick={() => runAction('watchlist', { watchlisted: true })}>Add to Watchlist</button>
                <div className="flex gap-2">
                  <input className="h-9 flex-1 rounded-lg border border-slate-200 px-2 text-sm" placeholder="Follow-up task" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} />
                  <button type="button" className="rounded-lg border border-slate-200 px-2 text-xs font-bold" onClick={() => taskTitle.trim() && runAction('item', { item: { kind: 'TASK', title: taskTitle.trim() } }).then(() => setTaskTitle(''))}>Add</button>
                </div>
                <button type="button" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-sm font-semibold hover:bg-slate-50" onClick={() => runAction('notify', { message: `${form.title || 'Opportunity'} was updated.` })}>Send Notification</button>
                <button type="button" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-sm font-semibold hover:bg-slate-50" disabled={!form.id} onClick={() => runAction('duplicate')}>Duplicate Opportunity</button>
                <button type="button" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-sm font-semibold hover:bg-slate-50" onClick={() => runAction('convert')}>Convert to Tender</button>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
              <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full border-8 border-blue-100 text-xl font-black text-blue-700">{progress}%</div>
              <div className="mt-2 text-sm font-black">Opportunity Progress</div>
              <ul className="mt-2 space-y-1 text-left text-xs text-slate-500">
                {STEPS.map((label, index) => <li key={label}>{index <= step ? '●' : '○'} {label}</li>)}
              </ul>
            </div>
            {busy ? <div className="flex items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Saving to DLE_Enterprise…</div> : null}
          </aside>
        </div>
      </div>
    </div>
  );
}
