'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, FileText, Save, Send } from 'lucide-react';
import type { TenderDocument, TenderOpportunity } from '@/lib/commercial/tender-types';
import { commercialKindOf, documentChecklistFor, type CommercialKind } from '@/lib/commercial/tender-workflow';
import { tenderGet, tenderPost, tenderUpload } from './tender-api';

const KINDS: Array<{ id: CommercialKind; label: string }> = [
  { id: 'ITT', label: 'Invitation to Tender (ITT)' },
  { id: 'RFQ', label: 'Request for Quotation (RFQ)' },
  { id: 'EOI', label: 'Expression of Interest (EOI)' },
];
const SECTORS = ['Oil & Gas', 'Energy', 'Construction', 'Infrastructure', 'Fabrication', 'Industrial', 'Maintenance', 'Marine'];
const SOURCES = ['Client Direct', 'Email', 'Invitation', 'Public Portal', 'Referral', 'Tender Portal', 'Website'];
const PRIORITIES = ['High', 'Medium', 'Low'];

const inputClass = 'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

export function CommercialOpportunityModal({
  open,
  initial,
  clients,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial?: TenderOpportunity | null;
  clients: string[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [kind, setKind] = useState<CommercialKind | ''>('');
  const [referenceNo, setReferenceNo] = useState('');
  const [title, setTitle] = useState('');
  const [client, setClient] = useState('');
  const [description, setDescription] = useState('');
  const [sector, setSector] = useState('');
  const [source, setSource] = useState('');
  const [received, setReceived] = useState('');
  const [clientRef, setClientRef] = useState('');
  const [external, setExternal] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [contact, setContact] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [instructions, setInstructions] = useState('');
  const [checked, setChecked] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [documents, setDocuments] = useState<TenderDocument[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const nextKind = initial ? commercialKindOf(initial) : '';
    setKind(initial ? nextKind : '');
    setReferenceNo(initial?.referenceNo || '');
    setTitle(initial?.title || '');
    setClient(initial?.clientName || '');
    setDescription(initial?.description || '');
    setSector(initial?.category || '');
    setSource(initial?.source || '');
    setReceived((initial?.invitationDate || '').slice(0, 10));
    setClientRef(initial?.enquiryRef || '');
    setExternal((initial?.submissionDeadline || '').slice(0, 10));
    setPriority(initial?.priority || 'Medium');
    setContact(initial?.contactPerson || '');
    setEmail(initial?.email || '');
    setPhone(initial?.phone || '');
    setInstructions(initial?.approvalNotes || '');
    const checklist = documentChecklistFor(initial ? commercialKindOf(initial) : 'ITT');
    const saved = (initial?.scopeSummary || '').split('\n').map((line) => line.replace(/^•\s*/, '').trim());
    setChecked(checklist.filter((item) => saved.includes(item)));
    setFiles([]);
    setDocuments([]);
    setError('');
    if (initial?.id) {
      tenderGet<{ documents: TenderDocument[] }>('opportunity', { id: initial.id })
        .then((detail) => setDocuments(detail.documents || []))
        .catch(() => setDocuments([]));
    }
  }, [open, initial]);

  const checklist = useMemo(() => documentChecklistFor(kind || 'ITT'), [kind]);
  const locked = Boolean(initial?.bidDecision && /bid/i.test(initial.bidDecision));

  if (!open) return null;

  const payload = (mode: 'draft' | 'submit') => ({
    ...(initial || {}),
    id: initial?.id || '',
    referenceNo: initial?.referenceNo || '',
    commercialKind: kind,
    opportunityType: kind,
    tenderType: kind,
    title: title.trim(),
    clientName: client.trim(),
    description: description.trim(),
    category: sector,
    source,
    invitationDate: received,
    enquiryRef: clientRef,
    submissionDeadline: external,
    closingDate: initial?.closingDate || '',
    priority,
    contactPerson: contact,
    email,
    phone,
    approvalNotes: instructions,
    scopeSummary: checked.map((item) => `• ${item}`).join('\n'),
    ownerName: initial?.ownerName || '',
    ownerEmployeeCode: initial?.ownerEmployeeCode || '',
    bidDecision: initial?.bidDecision || '',
    estimatedValue: initial?.estimatedValue || 0,
    currency: initial?.currency || 'NGN',
    department: initial?.department || '',
    location: initial?.location || '',
    site: initial?.site || '',
    status: mode === 'draft' ? 'Draft' : initial?.status && initial.status !== 'Draft' ? initial.status : 'Under Review',
    stage: mode === 'draft' ? 'Registration' : initial?.commercialReview === 'Reviewed' ? initial.stage : 'GM Commercial Review',
    saveMode: mode,
  });

  const save = async (mode: 'draft' | 'submit') => {
    if (!kind) {
      setError('Select an opportunity type.');
      return;
    }
    if (!title.trim() || !client.trim()) {
      setError('Client and project title are required.');
      return;
    }
    if (mode === 'submit' && (!sector || !source || !received || !external || !description.trim())) {
      setError('Complete the sector, source, date received, external deadline and description before submitting for review.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const saved = await tenderPost<TenderOpportunity>({ action: 'save', opportunity: payload(mode) });
      if (saved?.id && files.length) await Promise.all(files.map((file) => tenderUpload(saved.id, file, `${kind} document`)));
      onSaved(mode === 'draft' ? `${saved?.referenceNo || 'Draft'} saved.` : `${saved?.referenceNo || 'Opportunity'} submitted for GM Commercial review.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The opportunity was not saved.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/45 p-4">
      <div className="mx-auto my-4 max-w-4xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#2563eb] text-white"><FileText className="h-5 w-5" /></span>
            <div>
              <h2 className="text-[18px] font-black text-slate-950">{initial ? 'Edit Opportunity' : 'New Opportunity'}</h2>
              <p className="text-[12px] text-slate-500">A submitted ITT, RFQ or EOI goes to GM Commercial review. The reference is generated on save.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-[12px] font-bold text-slate-700"><ArrowLeft className="h-3.5 w-3.5" /> Back</button>
        </div>
        <form className="space-y-4 p-5" onSubmit={(event) => { event.preventDefault(); void save('submit'); }}>
          {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">{error}</p> : null}
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-[12px] font-semibold text-slate-600">Opportunity Type <span className="text-rose-500">*</span>
              <select required value={kind} disabled={locked} onChange={(event) => { setKind(event.target.value as CommercialKind); setChecked([]); }} className={`${inputClass} mt-1`} aria-label="Opportunity type">
                <option value="">Select opportunity type...</option>
                {KINDS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label className="block text-[12px] font-semibold text-slate-600">Reference No.
              <input value={referenceNo} readOnly placeholder="Assigned on save" className={`${inputClass} mt-1 bg-slate-50`} />
            </label>
            <label className="block text-[12px] font-semibold text-slate-600 md:col-span-2">Client <span className="text-rose-500">*</span>
              <input required list="commercial-clients" value={client} onChange={(event) => setClient(event.target.value)} placeholder="Client name" className={`${inputClass} mt-1`} />
              <datalist id="commercial-clients">{clients.map((name) => <option key={name} value={name} />)}</datalist>
            </label>
            <label className="block text-[12px] font-semibold text-slate-600 md:col-span-2">Project Title <span className="text-rose-500">*</span>
              <input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Project title" className={`${inputClass} mt-1`} />
            </label>
            <label className="block text-[12px] font-semibold text-slate-600 md:col-span-2">Description / Scope <span className="text-rose-500">*</span>
              <textarea required value={description} onChange={(event) => setDescription(event.target.value)} rows={3} placeholder="Describe the opportunity" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
            </label>
            <label className="block text-[12px] font-semibold text-slate-600">Sector
              <select value={sector} onChange={(event) => setSector(event.target.value)} className={`${inputClass} mt-1`} aria-label="Sector">
                <option value="">Select sector...</option>
                {SECTORS.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label className="block text-[12px] font-semibold text-slate-600">Source
              <select value={source} onChange={(event) => setSource(event.target.value)} className={`${inputClass} mt-1`} aria-label="Source">
                <option value="">Select source...</option>
                {SOURCES.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label className="block text-[12px] font-semibold text-slate-600">Date Received
              <input type="date" value={received} onChange={(event) => setReceived(event.target.value)} className={`${inputClass} mt-1`} />
            </label>
            <label className="block text-[12px] font-semibold text-slate-600">Client Reference
              <input value={clientRef} onChange={(event) => setClientRef(event.target.value)} className={`${inputClass} mt-1`} />
            </label>
            <label className="block text-[12px] font-semibold text-slate-600">External Deadline
              <input type="date" value={external} disabled={locked} onChange={(event) => setExternal(event.target.value)} className={`${inputClass} mt-1`} />
            </label>
            <label className="block text-[12px] font-semibold text-slate-600">Priority
              <select value={priority} onChange={(event) => setPriority(event.target.value)} className={`${inputClass} mt-1`} aria-label="Priority">
                {PRIORITIES.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label className="block text-[12px] font-semibold text-slate-600">Contact Person
              <input value={contact} onChange={(event) => setContact(event.target.value)} className={`${inputClass} mt-1`} />
            </label>
            <label className="block text-[12px] font-semibold text-slate-600">Email
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className={`${inputClass} mt-1`} />
            </label>
            <label className="block text-[12px] font-semibold text-slate-600">Phone
              <input value={phone} onChange={(event) => setPhone(event.target.value)} className={`${inputClass} mt-1`} />
            </label>
            <label className="block text-[12px] font-semibold text-slate-600 md:col-span-2">Instructions
              <textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
            </label>
          </div>
          <fieldset className="rounded-xl border border-slate-200 p-3">
            <legend className="px-1 text-[12px] font-bold text-slate-700">{kind || 'Opportunity'} document checklist</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {checklist.map((item) => (
                <label key={item} className="flex items-center gap-2 text-[12px] text-slate-700">
                  <input type="checkbox" checked={checked.includes(item)} onChange={() => setChecked((current) => current.includes(item) ? current.filter((entry) => entry !== item) : [...current, item])} />
                  {item}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block text-[12px] font-semibold text-slate-600">Supporting attachments
            <input type="file" multiple onChange={(event) => setFiles(Array.from(event.target.files || []))} className="mt-1 block w-full text-[12px]" />
          </label>
          {documents.length ? <p className="text-[12px] text-slate-500">{documents.length} document{documents.length === 1 ? '' : 's'} already attached.</p> : null}
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" disabled={busy} onClick={() => void save('draft')} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 px-4 text-[13px] font-bold text-slate-700"><Save className="h-4 w-4" /> Save Draft</button>
            <button type="submit" disabled={busy} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#2563eb] px-4 text-[13px] font-bold text-white"><Send className="h-4 w-4" /> Submit for Review</button>
          </div>
        </form>
      </div>
    </div>
  );
}
