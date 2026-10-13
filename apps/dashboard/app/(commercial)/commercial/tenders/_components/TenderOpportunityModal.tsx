'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, FileText, Plus, Save, X } from 'lucide-react';
import type { TenderDocument, TenderOpportunity } from '@/lib/commercial/tender-types';
import { formatWhen, tenderGet, tenderPost, tenderUpload } from './tender-api';

const TYPES = ['EPC', 'Supply', 'Service', 'Consultancy', 'Framework', 'Other'];
const METHODS = ['Open Tender', 'Selective Tender', 'Single Source', 'Framework', 'Request for Quotation'];
const SECTORS = ['Oil & Gas', 'Energy', 'Industrial', 'Infrastructure', 'Fabrication', 'Construction', 'Maintenance', 'IT Services'];
const SOURCES = ['Client Direct', 'Email', 'Invitation', 'Public Portal', 'Referral', 'Tender Portal', 'Website'];
const FORMATS = ['Hard copy', 'Email', 'Portal', 'Two-envelope'];
const EFFORT = ['Low', 'Medium', 'High'];

type Extra = { lineManager: string; documentsReceived: string; platform: string; bidFormat: string; projects: string; effort: string };

const readExtra = (notes: string): Extra => {
  const pick = (key: string) => notes.match(new RegExp(`^${key}:\\s*(.*)$`, 'im'))?.[1]?.trim() || '';
  return {
    lineManager: pick('Line manager'),
    documentsReceived: pick('Documents received'),
    platform: pick('Procurement platform'),
    bidFormat: pick('Bid format'),
    projects: pick('Relevant projects'),
    effort: pick('Submission effort'),
  };
};

const writeExtra = (extra: Extra, notes: string) => {
  const rest = notes.replace(/^(Line manager|Documents received|Procurement platform|Bid format|Relevant projects|Submission effort):.*$/gim, '').trim();
  return [
    extra.lineManager ? `Line manager: ${extra.lineManager}` : '',
    extra.documentsReceived ? `Documents received: ${extra.documentsReceived}` : '',
    extra.platform ? `Procurement platform: ${extra.platform}` : '',
    extra.bidFormat ? `Bid format: ${extra.bidFormat}` : '',
    extra.projects ? `Relevant projects: ${extra.projects}` : '',
    extra.effort ? `Submission effort: ${extra.effort}` : '',
    rest,
  ].filter(Boolean).join('\n');
};

export function TenderOpportunityModal({
  open,
  initial,
  clients,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial?: TenderOpportunity | null;
  clients: string[];
  officers?: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [documents, setDocuments] = useState<TenderDocument[]>([]);
  const [referenceNo, setReferenceNo] = useState('');
  const [title, setTitle] = useState('');
  const [client, setClient] = useState('');
  const [newClient, setNewClient] = useState(false);
  const [tenderType, setTenderType] = useState('');
  const [method, setMethod] = useState('');
  const [sector, setSector] = useState('');
  const [source, setSource] = useState('');
  const [external, setExternal] = useState('');
  const [clientRef, setClientRef] = useState('');
  const [issued, setIssued] = useState('');
  const [documentsReceived, setDocumentsReceived] = useState('');
  const [platform, setPlatform] = useState('');
  const [bidFormat, setBidFormat] = useState('');
  const [clarification, setClarification] = useState('');
  const [description, setDescription] = useState('');
  const [requirements, setRequirements] = useState('');
  const [projects, setProjects] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [effort, setEffort] = useState('');
  const [remarks, setRemarks] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const extra = readExtra(initial?.teamNotes || '');
    setReferenceNo(initial?.referenceNo || '');
    setTitle(initial?.title || '');
    setClient(initial?.clientName || '');
    setNewClient(false);
    setTenderType(initial?.tenderType && initial.tenderType !== 'Enquiry' ? initial.tenderType : '');
    setMethod(initial?.contractType || '');
    setSector(initial?.category || '');
    setSource(initial?.source || '');
    setExternal((initial?.submissionDeadline || '').slice(0, 10));
    setClientRef(initial?.enquiryRef || '');
    setIssued((initial?.invitationDate || '').slice(0, 10));
    setDocumentsReceived(extra.documentsReceived);
    setPlatform(extra.platform);
    setBidFormat(extra.bidFormat);
    setClarification((initial?.clarificationDeadline || '').slice(0, 10));
    setDescription(initial?.description || '');
    setRequirements(initial?.scopeSummary || '');
    setProjects(extra.projects);
    setPriority(initial?.priority || 'Medium');
    setEffort(extra.effort);
    setRemarks(initial?.approvalNotes || '');
    setFiles([]);
    setDocuments([]);
    setError('');
    if (initial?.id) {
      tenderGet<{ documents: TenderDocument[] }>('opportunity', { id: initial.id }).then((detail) => setDocuments(detail.documents || [])).catch(() => setDocuments([]));
    }
  }, [open, initial]);

  if (!open) return null;

  const save = async () => {
    if (!title.trim() || !client.trim() || !tenderType || !sector || !source || !external || !description.trim() || !documentsReceived) {
      setError('Complete the required opportunity details, external deadline, and whether tender documents were received.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const keepExisting = Boolean(initial && initial.status !== 'Draft' && initial.estimatedValue > 0 && initial.department && initial.location && initial.site);
      const saved = await tenderPost<TenderOpportunity>({
        action: 'save',
        opportunity: {
          ...(initial || {}),
          id: initial?.id || '',
          referenceNo,
          enquiryRef: clientRef,
          title: title.trim(),
          description: description.trim(),
          scopeSummary: requirements,
          opportunityType: 'Client Tender',
          tenderType,
          source,
          category: sector,
          contractType: method,
          priority,
          status: keepExisting ? initial?.status : 'Draft',
          stage: keepExisting ? initial?.stage : 'Tender/Bid',
          clientName: client.trim(),
          department: initial?.department || '',
          location: initial?.location || '',
          site: initial?.site || '',
          estimatedValue: initial?.estimatedValue || 0,
          currency: initial?.currency || 'NGN',
          invitationDate: issued,
          submissionDeadline: external,
          closingDate: initial?.closingDate || '',
          clarificationDeadline: clarification,
          ownerName: initial?.ownerName || '',
          approvalNotes: remarks,
          teamNotes: writeExtra({
            lineManager: readExtra(initial?.teamNotes || '').lineManager,
            documentsReceived,
            platform,
            bidFormat,
            projects,
            effort,
          }, initial?.teamNotes || ''),
          saveMode: keepExisting ? 'submit' : 'draft',
        },
      });
      if (saved?.id && files.length) await Promise.all(files.map((file) => tenderUpload(saved.id, file, 'Tender Document')));
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The opportunity was not saved.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 p-4">
      <div className="mx-auto my-4 max-w-6xl rounded-2xl border border-slate-200 bg-[#f4f7fb] shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#2563eb] text-white"><FileText className="h-5 w-5" /></span>
            <div>
              <h2 className="text-[20px] font-black text-slate-950">{initial ? 'Edit Tender Opportunity' : 'New Tender Opportunity'}</h2>
              <p className="text-[12px] text-slate-500">Capture the tender opportunity. The Managing Director assigns the responsible officer afterwards.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-[12px] font-bold text-slate-700"><ArrowLeft className="h-3.5 w-3.5" /> Back to Opportunities</button>
        </div>
        <div className="space-y-3 p-4">
          {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">{error}</p> : null}
          <div className="grid gap-3 xl:grid-cols-2">
            <Card step="1" title="Opportunity Information">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Reference No."><input value={referenceNo} onChange={(event) => setReferenceNo(event.target.value)} placeholder="Assigned on save" className={input} /></Field>
                <Field label="Title" required><input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Enter tender title..." className={input} /></Field>
                <Field label="Client / Issuing Organisation" required className="md:col-span-2">
                  <div className="flex gap-2">
                    {newClient ? <input value={client} onChange={(event) => setClient(event.target.value)} placeholder="Enter client name" className={input} /> : (
                      <select value={client} onChange={(event) => setClient(event.target.value)} className={input} aria-label="Client"><option value="">Select client...</option>{clients.map((name) => <option key={name}>{name}</option>)}</select>
                    )}
                    <button type="button" onClick={() => setNewClient((value) => !value)} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-blue-700" aria-label="Add client"><Plus className="h-4 w-4" /></button>
                  </div>
                </Field>
                <Field label="Tender Type" required><select value={tenderType} onChange={(event) => setTenderType(event.target.value)} className={input} aria-label="Tender type"><option value="">Select type...</option>{TYPES.map((item) => <option key={item}>{item}</option>)}</select></Field>
                <Field label="Procurement Method"><select value={method} onChange={(event) => setMethod(event.target.value)} className={input} aria-label="Procurement method"><option value="">Select method...</option>{METHODS.map((item) => <option key={item}>{item}</option>)}</select></Field>
                <Field label="Sector" required><select value={sector} onChange={(event) => setSector(event.target.value)} className={input} aria-label="Sector"><option value="">Select sector...</option>{SECTORS.map((item) => <option key={item}>{item}</option>)}</select></Field>
                <Field label="Source" required><select value={source} onChange={(event) => setSource(event.target.value)} className={input} aria-label="Source"><option value="">Select source...</option>{SOURCES.map((item) => <option key={item}>{item}</option>)}</select></Field>
                <div className="flex items-end pb-2 text-[12px] text-slate-500">Opportunity Status <span className="ml-2 rounded-md bg-rose-50 px-2 py-0.5 font-bold text-rose-600">Not Started</span></div>
              </div>
            </Card>
            <Card step="2" title="Tender Details">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="External Submission Deadline" required><input type="date" value={external} onChange={(event) => setExternal(event.target.value)} className={input} /></Field>
                <p className="text-[12px] text-sky-800 md:col-span-2">The Managing Director confirms the internal submission deadline and assigns the responsible officer after this opportunity is saved.</p>
                <Field label="Tender Reference (Client)"><input value={clientRef} onChange={(event) => setClientRef(event.target.value)} placeholder="Enter client reference number..." className={input} /></Field>
                <Field label="Issuing Date"><input type="date" value={issued} onChange={(event) => setIssued(event.target.value)} className={input} /></Field>
                <Field label="Tender Documents Received" required><select value={documentsReceived} onChange={(event) => setDocumentsReceived(event.target.value)} className={input} aria-label="Documents received"><option value="">Select...</option><option>Yes</option><option>No</option></select></Field>
                <Field label="Procurement Platform (if any)"><input value={platform} onChange={(event) => setPlatform(event.target.value)} placeholder="Enter platform name..." className={input} /></Field>
                <Field label="Bid Format / Submission Method"><select value={bidFormat} onChange={(event) => setBidFormat(event.target.value)} className={input} aria-label="Submission method"><option value="">Select submission method...</option>{FORMATS.map((item) => <option key={item}>{item}</option>)}</select></Field>
                <Field label="Clarification Deadline"><input type="date" value={clarification} onChange={(event) => setClarification(event.target.value)} className={input} /></Field>
              </div>
            </Card>
            <Card step="3" title="Scope & Requirements">
              <Field label="Brief Description" required><textarea maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Enter brief description of the tender, scope of work, client requirements..." className="min-h-24 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px]" /><div className="text-right text-[11px] text-slate-400">{description.length}/2000</div></Field>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Field label="Key Requirements (if any)"><textarea maxLength={1000} value={requirements} onChange={(event) => setRequirements(event.target.value)} placeholder="Enter key requirements..." className="min-h-16 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px]" /><div className="text-right text-[11px] text-slate-400">{requirements.length}/1000</div></Field>
                <Field label="Relevant Projects / Categories (if any)"><input value={projects} onChange={(event) => setProjects(event.target.value)} placeholder="Select project(s)..." className={input} /></Field>
              </div>
            </Card>
            <Card step="4" title="Attachments">
              <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center text-[12px] text-slate-500">
                <input type="file" multiple className="hidden" onChange={(event) => setFiles(Array.from(event.target.files || []))} />
                Drag and drop files here, or click to browse
              </label>
              <div className="mt-3 text-[12px] font-semibold text-slate-600">Uploaded Documents ({documents.length + files.length})</div>
              {documents.length + files.length === 0 ? <p className="py-3 text-center text-[12px] text-slate-400">No files uploaded yet.</p> : (
                <ul className="mt-1 text-[12px] text-slate-600">{documents.map((file) => <li key={file.id}>{file.fileName} · {formatWhen(file.uploadedAt)}</li>)}{files.map((file) => <li key={file.name}>{file.name} · pending save</li>)}</ul>
              )}
            </Card>
            <Card step="5" title="Additional Information">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Priority" required><select value={priority} onChange={(event) => setPriority(event.target.value)} className={input} aria-label="Priority">{['High', 'Medium', 'Low'].map((item) => <option key={item}>{item}</option>)}</select></Field>
                <Field label="Estimated Submission Effort"><select value={effort} onChange={(event) => setEffort(event.target.value)} className={input} aria-label="Submission effort"><option value="">Select effort level...</option>{EFFORT.map((item) => <option key={item}>{item}</option>)}</select></Field>
                <Field label="Remarks / Notes" className="md:col-span-2"><textarea maxLength={1000} value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder="Enter any additional notes or remarks..." className="min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px]" /><div className="text-right text-[11px] text-slate-400">{remarks.length}/1000</div></Field>
              </div>
            </Card>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-5 py-4">
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => save()} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#2563eb] px-4 text-[13px] font-bold text-white disabled:opacity-50"><Save className="h-4 w-4" /> {busy ? 'Saving…' : 'Save Opportunity'}</button>
            <button type="button" onClick={onClose} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 px-4 text-[13px] font-bold text-slate-700"><X className="h-4 w-4" /> Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const input = 'h-10 w-full rounded-lg border border-slate-200 px-3 text-[13px] disabled:bg-slate-50';

function Card({ step, title, children }: { step: string; title: string; children: ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-4"><h3 className="mb-3 flex items-center gap-2 text-[14px] font-black text-slate-900"><span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#2563eb] text-[11px] text-white">{step}</span> {title}</h3>{children}</section>;
}

function Field({ label, required = false, className = '', children }: { label: string; required?: boolean; className?: string; children: ReactNode }) {
  return <label className={`block text-[12px] font-semibold text-slate-500 ${className}`}>{label}{required ? <span className="text-rose-500"> *</span> : null}<div className="mt-1">{children}</div></label>;
}
