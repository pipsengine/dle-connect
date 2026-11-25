'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ClipboardList, FileText, Paperclip, Save, Send, Trash2, X } from 'lucide-react';
import {
  emptyBidNoBidValues,
  prefillBidNoBidValues,
  validateBidNoBidAssessment,
} from '@/lib/commercial/bid-no-bid-assessment';
import type { TenderClient, TenderDocument, TenderOpportunity } from '@/lib/commercial/tender-types';
import { COMMERCIAL_SECTORS, COMMERCIAL_SOURCES } from '@/lib/commercial/tender-lookups';
import { commercialKindOf, documentChecklistFor, internalDeadlineFromExternal, PROPOSAL_REVIEW_STAGE, type CommercialKind } from '@/lib/commercial/tender-workflow';
import { fileSize } from '@/lib/commercial/tender-present';
import { BidNoBidAssessmentForm } from './BidNoBidAssessmentForm';
import { tenderDeleteDocument, tenderGet, tenderPost, tenderUpload } from './tender-api';

const KINDS: Array<{ id: CommercialKind; label: string }> = [
  { id: 'ITT', label: 'Invitation to Tender (ITT)' },
  { id: 'RFQ', label: 'Request for Quotation (RFQ)' },
  { id: 'EOI', label: 'Expression of Interest (EOI)' },
];
const SECTORS = [...COMMERCIAL_SECTORS];
const SOURCES = [...COMMERCIAL_SOURCES];
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
  const [step, setStep] = useState<1 | 2>(1);
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
  const [clientDirectory, setClientDirectory] = useState<TenderClient[]>([]);
  const [assessmentValues, setAssessmentValues] = useState<Record<string, string>>(emptyBidNoBidValues());
  const [assessmentErrors, setAssessmentErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const nextKind = initial ? commercialKindOf(initial) : '';
    setStep(1);
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
    setAssessmentErrors({});
    const existingAssessment = initial?.bidNoBidAssessment?.values || null;
    const internal = (initial?.closingDate || (initial?.submissionDeadline ? internalDeadlineFromExternal(initial.submissionDeadline) : '')).slice(0, 10);
    setAssessmentValues(prefillBidNoBidValues({
      title: initial?.title,
      description: initial?.description,
      clientName: initial?.clientName,
      submissionDeadline: initial?.submissionDeadline,
      closingDate: initial?.closingDate || internal,
      commercialKind: nextKind,
      enquiryRef: initial?.enquiryRef,
      category: initial?.category,
      estimatedValue: initial?.estimatedValue,
    }, existingAssessment, internal));
    tenderGet<TenderClient[]>('clients')
      .then((rows) => setClientDirectory(Array.isArray(rows) ? rows : []))
      .catch(() => setClientDirectory([]));
    if (initial?.id) {
      tenderGet<{ documents: TenderDocument[] }>('opportunity', { id: initial.id })
        .then((detail) => setDocuments(detail.documents || []))
        .catch(() => setDocuments([]));
    }
  }, [open, initial]);

  const checklist = useMemo(() => documentChecklistFor(kind || 'ITT'), [kind]);
  const locked = Boolean(initial?.bidDecision && /bid/i.test(initial.bidDecision));
  const clientNames = useMemo(
    () => Array.from(new Set([...clients, ...clientDirectory.map((row) => row.name)].filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [clientDirectory, clients],
  );

  const applyClient = (name: string) => {
    setClient(name);
    const match = clientDirectory.find((row) => row.name.toLowerCase() === name.trim().toLowerCase());
    if (!match) return;
    if (!contact && match.contactPerson) setContact(match.contactPerson);
    if (!email && match.email) setEmail(match.email);
    if (!phone && match.phone) setPhone(match.phone);
    if (!sector && match.sector) setSector(match.sector);
  };

  if (!open) return null;

  const syncAssessmentFromOpportunity = () => {
    const internal = (assessmentValues.internalDeadline || (external ? internalDeadlineFromExternal(external) : '')).slice(0, 10);
    return prefillBidNoBidValues({
      title,
      description,
      clientName: client,
      submissionDeadline: external,
      closingDate: internal,
      commercialKind: kind,
      enquiryRef: clientRef,
      category: sector,
      estimatedValue: Number(assessmentValues.contractValue) || initial?.estimatedValue || 0,
    }, assessmentValues, internal);
  };

  const payload = (mode: 'draft' | 'submit', values = assessmentValues) => ({
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
    closingDate: (values.internalDeadline || initial?.closingDate || (external ? internalDeadlineFromExternal(external) : '')).slice(0, 10),
    priority,
    contactPerson: contact,
    email,
    phone,
    approvalNotes: instructions,
    scopeSummary: checked.map((item) => `• ${item}`).join('\n'),
    ownerName: initial?.ownerName || '',
    ownerEmployeeCode: initial?.ownerEmployeeCode || '',
    bidDecision: initial?.bidDecision || '',
    estimatedValue: Number(values.contractValue) || initial?.estimatedValue || 0,
    currency: initial?.currency || 'NGN',
    department: initial?.department || '',
    location: initial?.location || '',
    site: initial?.site || '',
    status: mode === 'draft' ? 'Draft' : initial?.status && initial.status !== 'Draft' ? initial.status : 'Under Review',
    stage: mode === 'draft' ? 'Registration' : initial?.commercialReview === 'Reviewed' ? initial.stage : PROPOSAL_REVIEW_STAGE,
    saveMode: mode,
    bidNoBidAssessment: {
      values,
      completedAt: initial?.bidNoBidAssessment?.completedAt,
      completedBy: initial?.bidNoBidAssessment?.completedBy,
    },
  });

  const addFiles = (list: FileList | null) => {
    if (!list?.length) return;
    const next = Array.from(list);
    setFiles((current) => {
      const keys = new Set(current.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
      const merged = [...current];
      for (const file of next) {
        const key = `${file.name}:${file.size}:${file.lastModified}`;
        if (!keys.has(key)) {
          keys.add(key);
          merged.push(file);
        }
      }
      return merged;
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePendingFile = (index: number) => {
    setFiles((current) => current.filter((_, item) => item !== index));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeUploadedDocument = async (documentId: string) => {
    setBusy(true);
    setError('');
    try {
      const next = await tenderDeleteDocument(documentId) as TenderDocument[];
      setDocuments(Array.isArray(next) ? next : documents.filter((item) => item.id !== documentId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The attachment was not removed.');
    } finally {
      setBusy(false);
    }
  };

  const validateStep1 = (mode: 'draft' | 'submit') => {
    if (!kind) {
      setError('Select an opportunity type.');
      return false;
    }
    if (!title.trim() || !client.trim()) {
      setError('Client and project title are required.');
      return false;
    }
    if (mode === 'submit' && (!sector || !source || !received || !external || !description.trim())) {
      setError('Complete the sector, source, date received, external deadline and description before continuing.');
      return false;
    }
    return true;
  };

  const goToAssessment = () => {
    if (!validateStep1('submit')) return;
    const next = syncAssessmentFromOpportunity();
    setAssessmentValues(next);
    setAssessmentErrors({});
    setError('');
    setStep(2);
  };

  const save = async (mode: 'draft' | 'submit') => {
    if (!validateStep1(mode === 'draft' ? 'draft' : 'submit')) return;
    const values = mode === 'submit' ? syncAssessmentFromOpportunity() : assessmentValues;
    if (mode === 'submit') {
      const nextErrors = validateBidNoBidAssessment(values, 'submit');
      setAssessmentErrors(nextErrors);
      if (Object.keys(nextErrors).length) {
        setStep(2);
        setError('Complete the required BID / NO BID assessment fields before submitting for review.');
        return;
      }
    }
    setBusy(true);
    setError('');
    try {
      const saved = await tenderPost<TenderOpportunity>({ action: 'save', opportunity: payload(mode, values) });
      if (saved?.id && files.length) {
        let uploaded = documents;
        for (const file of files) {
          uploaded = await tenderUpload(saved.id, file, `${kind} document`) as TenderDocument[];
        }
        setDocuments(Array.isArray(uploaded) ? uploaded : documents);
        setFiles([]);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
      onSaved(mode === 'draft' ? `${saved?.referenceNo || 'Draft'} saved.` : `${saved?.referenceNo || 'Opportunity'} submitted for Proposal review.`);
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
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#2563eb] text-white">{step === 1 ? <FileText className="h-5 w-5" /> : <ClipboardList className="h-5 w-5" />}</span>
            <div>
              <h2 className="text-[18px] font-black text-slate-950">
                {step === 1 ? (initial ? 'Edit Opportunity' : 'New Opportunity') : 'BID / NO BID Assessment'}
              </h2>
              <p className="text-[12px] text-slate-500">
                {step === 1
                  ? 'Step 1 of 2 — capture the opportunity. Next: BID / NO BID assessment, then Proposal review → GM Commercial → MD where required.'
                  : 'Step 2 of 2 — complete the DL/Prop/F-03 scorecard. GM Commercial will review this before deciding BID / NO BID.'}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-[12px] font-bold text-slate-700"><ArrowLeft className="h-3.5 w-3.5" /> Back</button>
        </div>

        <div className="flex gap-2 border-b border-slate-100 px-5 py-3">
          <div className={`rounded-lg px-3 py-1.5 text-[12px] font-bold ${step === 1 ? 'bg-[#eff6ff] text-[#2563eb]' : 'bg-emerald-50 text-emerald-700'}`}>1. Opportunity</div>
          <div className={`rounded-lg px-3 py-1.5 text-[12px] font-bold ${step === 2 ? 'bg-[#eff6ff] text-[#2563eb]' : 'bg-slate-50 text-slate-500'}`}>2. BID / NO BID Assessment</div>
        </div>

        <form
          className="space-y-4 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (step === 1) goToAssessment();
            else void save('submit');
          }}
        >
          {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">{error}</p> : null}

          {step === 1 ? (
            <>
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
                  <input required list="commercial-clients" value={client} onChange={(event) => applyClient(event.target.value)} placeholder="Search or type a client name" className={`${inputClass} mt-1`} />
                  <datalist id="commercial-clients">{clientNames.map((name) => <option key={name} value={name} />)}</datalist>
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
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[12px] font-bold text-slate-700">Supporting attachments</div>
                  <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-700">
                    <Paperclip className="h-3.5 w-3.5" /> Add files
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      onChange={(event) => addFiles(event.target.files)}
                      className="sr-only"
                    />
                  </label>
                </div>
                {!files.length && !documents.length ? (
                  <p className="text-[12px] text-slate-500">No attachments yet. Add files, then remove any you do not need before saving.</p>
                ) : (
                  <ul className="space-y-2">
                    {documents.map((doc) => (
                      <li key={doc.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[12px]">
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-slate-800">{doc.fileName}</span>
                          <span className="text-slate-500">{doc.category || 'Document'} · {fileSize(doc.sizeBytes)} · saved</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <a href={`/api/commercial/tenders?resource=document&documentId=${doc.id}`} className="font-bold text-[#2563eb]">Open</a>
                          <button type="button" disabled={busy || locked} onClick={() => void removeUploadedDocument(doc.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50 disabled:opacity-40" aria-label={`Remove ${doc.fileName}`}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      </li>
                    ))}
                    {files.map((file, index) => (
                      <li key={`${file.name}-${file.size}-${file.lastModified}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-blue-100 bg-blue-50/40 px-3 py-2 text-[12px]">
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-slate-800">{file.name}</span>
                          <span className="text-slate-500">{fileSize(file.size)} · ready to upload</span>
                        </span>
                        <button type="button" disabled={busy} onClick={() => removePendingFile(index)} className="inline-flex h-8 items-center gap-1 rounded-lg px-2 font-bold text-slate-600 hover:bg-white disabled:opacity-40" aria-label={`Remove ${file.name}`}>
                          <X className="h-3.5 w-3.5" /> Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                <button type="button" disabled={busy} onClick={() => void save('draft')} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 px-4 text-[13px] font-bold text-slate-700"><Save className="h-4 w-4" /> Save Draft</button>
                <button type="submit" disabled={busy} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#2563eb] px-4 text-[13px] font-bold text-white"><ArrowRight className="h-4 w-4" /> Continue to Assessment</button>
              </div>
            </>
          ) : (
            <>
              <BidNoBidAssessmentForm
                values={assessmentValues}
                errors={assessmentErrors}
                showRestricted
                lockFromOpportunity
                onChange={(fieldId, value) => {
                  setAssessmentValues((current) => ({ ...current, [fieldId]: value }));
                  setAssessmentErrors((current) => {
                    if (!current[fieldId]) return current;
                    const next = { ...current };
                    delete next[fieldId];
                    return next;
                  });
                }}
              />
              <div className="flex flex-wrap justify-between gap-2 border-t border-slate-100 pt-4">
                <button type="button" disabled={busy} onClick={() => { setStep(1); setError(''); }} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 px-4 text-[13px] font-bold text-slate-700"><ArrowLeft className="h-4 w-4" /> Back to Opportunity</button>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={busy} onClick={() => void save('draft')} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 px-4 text-[13px] font-bold text-slate-700"><Save className="h-4 w-4" /> Save Draft</button>
                  <button type="submit" disabled={busy} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#2563eb] px-4 text-[13px] font-bold text-white"><Send className="h-4 w-4" /> Submit for Review</button>
                </div>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
