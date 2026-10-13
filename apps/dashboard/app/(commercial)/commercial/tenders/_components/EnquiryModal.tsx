'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, Info, Mail, Plus, Save, Send, X } from 'lucide-react';
import type { TenderLookups, TenderOpportunity } from '@/lib/commercial/tender-types';
import { isGmCommercial } from '@/lib/access/commercial-access';
import { tenderGet, tenderPost, tenderUpload } from './tender-api';
import { ActingEmployee } from './acting-employee';

const SOURCES = ['Client Direct', 'Email', 'Invitation', 'Public Portal', 'Referral', 'Tender Portal', 'Website'];
const SECTORS = ['Oil & Gas', 'Energy', 'Industrial', 'Infrastructure', 'Fabrication', 'Construction', 'Maintenance', 'IT Services'];
const PRIORITIES = ['High', 'Medium', 'Low'];
const ENQUIRY_TYPES = ['General', 'Technical', 'Commercial', 'Prequalification', 'Other'];
const FORMATS = ['Email', 'Portal', 'Hard copy', 'Meeting'];

type Extra = { lineManager: string; responseFormat: string; relatedProjects: string };

const readExtra = (notes: string): Extra => {
  const pick = (key: string) => notes.match(new RegExp(`^${key}:\\s*(.*)$`, 'im'))?.[1]?.trim() || '';
  return { lineManager: pick('Line manager'), responseFormat: pick('Response format'), relatedProjects: pick('Related projects') };
};

const writeExtra = (extra: Extra, notes: string) => {
  const rest = notes.replace(/^(Line manager|Response format|Related projects):.*$/gim, '').trim();
  const lines = [
    extra.lineManager ? `Line manager: ${extra.lineManager}` : '',
    extra.responseFormat ? `Response format: ${extra.responseFormat}` : '',
    extra.relatedProjects ? `Related projects: ${extra.relatedProjects}` : '',
    rest,
  ].filter(Boolean);
  return lines.join('\n');
};

const dayBefore = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return '';
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() - 1);
  const monthText = String(date.getMonth() + 1).padStart(2, '0');
  const dayText = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${monthText}-${dayText}`;
};

export function EnquiryModal({
  open,
  initial,
  clients,
  officers,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial?: TenderOpportunity | null;
  clients: string[];
  officers: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [gm, setGm] = useState(false);
  const [lookups, setLookups] = useState<TenderLookups | null>(null);
  const [title, setTitle] = useState('');
  const [received, setReceived] = useState('');
  const [client, setClient] = useState('');
  const [newClient, setNewClient] = useState(false);
  const [source, setSource] = useState('');
  const [sector, setSector] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [description, setDescription] = useState('');
  const [external, setExternal] = useState('');
  const [internal, setInternal] = useState('');
  const [internalTouched, setInternalTouched] = useState(false);
  const [officer, setOfficer] = useState('');
  const [newOfficer, setNewOfficer] = useState(false);
  const [lineManager, setLineManager] = useState('');
  const [department, setDepartment] = useState('');
  const [site, setSite] = useState('');
  const [contact, setContact] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [enquiryType, setEnquiryType] = useState('General');
  const [format, setFormat] = useState('');
  const [projects, setProjects] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const extra = readExtra(initial?.teamNotes || '');
    setTitle(initial?.title || '');
    setReceived((initial?.invitationDate || '').slice(0, 10));
    setClient(initial?.clientName || '');
    setNewClient(false);
    setSource(initial?.source || '');
    setSector(initial?.category || '');
    setPriority(initial?.priority || 'Medium');
    setDescription(initial?.description || '');
    setExternal((initial?.submissionDeadline || initial?.closingDate || '').slice(0, 10));
    setInternal((initial?.clarificationDeadline || '').slice(0, 10));
    setInternalTouched(Boolean(initial?.clarificationDeadline));
    setOfficer(initial?.ownerName || '');
    setNewOfficer(false);
    setLineManager(extra.lineManager);
    setDepartment(initial?.department || '');
    setSite(initial?.site || '');
    setContact(initial?.contactPerson || '');
    setEmail(initial?.email || '');
    setPhone(initial?.phone || '');
    setEnquiryType(initial?.tenderType && initial.tenderType !== 'Enquiry' ? initial.tenderType : 'General');
    setFormat(extra.responseFormat);
    setProjects(extra.relatedProjects);
    setFiles([]);
    setError('');
    tenderGet<TenderLookups>('lookups').then(setLookups).catch(() => setLookups(null));
    fetch('/api/auth/me', { cache: 'no-store', credentials: 'same-origin' })
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => setGm(isGmCommercial(json?.data?.roles || [], Boolean(json?.data?.isGlobalAdmin))))
      .catch(() => setGm(false));
  }, [open, initial]);

  if (!open) return null;

  const setExternalDate = (value: string) => {
    setExternal(value);
    if (gm && !internalTouched) setInternal(value ? dayBefore(value) : '');
  };

  const save = async (assign: boolean) => {
    if (!title.trim() || !client.trim() || !source || !sector || !received || !description.trim() || !external) {
      setError('Complete the required enquiry details, description, and external response deadline.');
      return;
    }
    if (assign && (!gm || !officer.trim() || !internal)) {
      setError('GM Commercial must choose the responsible officer and internal response date before assigning.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const saved = await tenderPost<TenderOpportunity>({
        action: 'save',
        opportunity: {
          ...(initial || {}),
          id: initial?.id || '',
          title: title.trim(),
          description: description.trim(),
          opportunityType: 'Enquiry',
          tenderType: enquiryType || 'Enquiry',
          source,
          category: sector,
          priority,
          status: initial && initial.status !== 'Draft' && initial.estimatedValue > 0 ? initial.status : 'Draft',
          stage: 'Enquiry',
          clientName: client.trim(),
          contactPerson: contact,
          email,
          phone,
          department,
          location: initial?.location || site,
          site,
          estimatedValue: initial?.estimatedValue || 0,
          currency: initial?.currency || 'NGN',
          invitationDate: received,
          submissionDeadline: external,
          closingDate: external,
          clarificationDeadline: gm ? internal : (initial?.clarificationDeadline || ''),
          ownerName: gm ? officer.trim() : (initial?.ownerName || ''),
          teamNotes: writeExtra({ lineManager: gm ? lineManager : readExtra(initial?.teamNotes || '').lineManager, responseFormat: format, relatedProjects: projects }, initial?.teamNotes || ''),
          saveMode: initial && initial.status !== 'Draft' && initial.estimatedValue > 0 && initial.department && initial.location && initial.site ? 'submit' : 'draft',
        },
      });
      if (saved?.id && files.length) {
        await Promise.all(files.map((file) => tenderUpload(saved.id, file, 'Enquiry')));
      }
      if (assign && saved?.id) {
        await tenderPost({ action: 'notify', id: saved.id, message: `${saved.referenceNo} assigned to ${officer.trim()}. Internal response date ${internal}.` });
      }
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The enquiry was not saved.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 p-4">
      <div className="mx-auto my-4 max-w-6xl rounded-2xl border border-slate-200 bg-[#f4f7fb] shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#2563eb] text-white"><Mail className="h-5 w-5" /></span>
            <div>
              <h2 className="text-[20px] font-black text-slate-950">{initial ? 'Edit Enquiry' : 'New Enquiry'}</h2>
              <p className="text-[12px] text-slate-500">Capture client enquiry details and assign a responsible officer.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-[12px] font-bold text-slate-700"><ArrowLeft className="h-3.5 w-3.5" /> Back to Enquiries</button>
        </div>
        <div className="space-y-3 p-4">
          <ActingEmployee />
          {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">{error}</p> : null}
          <div className="grid gap-3 xl:grid-cols-2">
            <Card step="1" title="Enquiry Information">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Enquiry Reference No."><input readOnly value={initial?.enquiryRef || initial?.referenceNo || ''} placeholder="Assigned on save" className={input} /></Field>
                <Field label="Date Received" required><input type="date" required value={received} onChange={(event) => setReceived(event.target.value)} className={input} /></Field>
                <Field label="Enquiry Title" required className="md:col-span-2"><input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Enter enquiry title..." className={input} /></Field>
                <Field label="Client" required className="md:col-span-2">
                  <div className="flex gap-2">
                    {newClient ? <input required value={client} onChange={(event) => setClient(event.target.value)} placeholder="Enter client name" className={input} /> : (
                      <select required value={client} onChange={(event) => setClient(event.target.value)} className={input} aria-label="Client">
                        <option value="">Select client...</option>
                        {clients.map((name) => <option key={name}>{name}</option>)}
                      </select>
                    )}
                    <button type="button" onClick={() => setNewClient((value) => !value)} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-blue-700" aria-label="Add client"><Plus className="h-4 w-4" /></button>
                  </div>
                </Field>
                <Field label="Source" required>
                  <select required value={source} onChange={(event) => setSource(event.target.value)} className={input} aria-label="Source"><option value="">Select source...</option>{SOURCES.map((item) => <option key={item}>{item}</option>)}</select>
                </Field>
                <Field label="Sector" required>
                  <select required value={sector} onChange={(event) => setSector(event.target.value)} className={input} aria-label="Sector"><option value="">Select sector...</option>{SECTORS.map((item) => <option key={item}>{item}</option>)}</select>
                </Field>
                <Field label="Priority" required>
                  <select value={priority} onChange={(event) => setPriority(event.target.value)} className={input} aria-label="Priority">{PRIORITIES.map((item) => <option key={item}>{item}</option>)}</select>
                </Field>
                <div className="flex items-end pb-2 text-[12px] text-slate-500">Current Status <span className="ml-2 rounded-md bg-rose-50 px-2 py-0.5 font-bold text-rose-600">Not Started</span></div>
              </div>
            </Card>
            <Card step="2" title="Description">
              <Field label="Enquiry Description" required>
                <textarea required maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Enter detailed description of the enquiry, client requirements, scope, and any other relevant information..." className="min-h-40 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px]" />
                <div className="text-right text-[11px] text-slate-400">{description.length}/2000</div>
              </Field>
            </Card>
            <Card step="3" title="Response Deadlines">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="External Response Deadline" required><input type="date" required value={external} onChange={(event) => setExternalDate(event.target.value)} className={input} /></Field>
                <Field label="Internal Response Deadline" required>
                  <input type="date" value={internal} disabled={!gm} onChange={(event) => { setInternalTouched(true); setInternal(event.target.value); }} className={`${input} disabled:bg-slate-50`} />
                </Field>
              </div>
              <p className="mt-3 flex items-start gap-2 rounded-lg bg-sky-50 px-3 py-2 text-[12px] text-sky-800"><Info className="mt-0.5 h-4 w-4 shrink-0" /> Internal deadline is set to 24 hours before the external deadline. This can be adjusted by GM Commercial if required.</p>
            </Card>
            <Card step="4" title="Assignment">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Responsible Officer">
                  <div className="flex gap-2">
                    {newOfficer ? <input value={officer} disabled={!gm} onChange={(event) => setOfficer(event.target.value)} placeholder="Officer name" className={input} /> : (
                      <select value={officer} disabled={!gm} onChange={(event) => setOfficer(event.target.value)} className={input} aria-label="Responsible officer">
                        <option value="">Select officer...</option>
                        {officers.map((name) => <option key={name}>{name}</option>)}
                      </select>
                    )}
                    <button type="button" disabled={!gm} onClick={() => setNewOfficer((value) => !value)} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-blue-700 disabled:opacity-40" aria-label="Add officer"><Plus className="h-4 w-4" /></button>
                  </div>
                </Field>
                <Field label="Line Manager"><input value={lineManager} disabled={!gm} onChange={(event) => setLineManager(event.target.value)} placeholder="Line manager" className={input} /></Field>
                <Field label="Department">
                  <select value={department} onChange={(event) => setDepartment(event.target.value)} className={input} aria-label="Department"><option value="">Select department</option>{(lookups?.departments || []).map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select>
                </Field>
                <Field label="Work Centre">
                  <select value={site} onChange={(event) => setSite(event.target.value)} className={input} aria-label="Work centre"><option value="">Select work centre</option>{(lookups?.sites || []).map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select>
                </Field>
              </div>
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800">{gm ? 'Saving and assigning notifies the portal that this officer owns the enquiry.' : 'Only GM Commercial can assign the responsible officer and the internal response date.'}</p>
            </Card>
            <Card step="5" title="Attachments">
              <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-[12px] text-slate-500">
                <input type="file" multiple className="hidden" onChange={(event) => setFiles(Array.from(event.target.files || []))} />
                Drag and drop files here, or click to browse
                <span className="mt-1 text-[11px] text-slate-400">Supported files: PDF, Word, Excel, images</span>
              </label>
              {files.length ? <ul className="mt-2 text-[12px] text-slate-600">{files.map((file) => <li key={file.name}>{file.name}</li>)}</ul> : null}
            </Card>
            <Card step="6" title="Additional Information">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Client Contact Person"><input value={contact} onChange={(event) => setContact(event.target.value)} placeholder="Enter contact person name..." className={input} /></Field>
                <Field label="Enquiry Type"><select value={enquiryType} onChange={(event) => setEnquiryType(event.target.value)} className={input} aria-label="Enquiry type">{ENQUIRY_TYPES.map((item) => <option key={item}>{item}</option>)}</select></Field>
                <Field label="Contact Email"><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Enter email address..." className={input} /></Field>
                <Field label="Requested Response Format"><select value={format} onChange={(event) => setFormat(event.target.value)} className={input} aria-label="Response format"><option value="">Select format...</option>{FORMATS.map((item) => <option key={item}>{item}</option>)}</select></Field>
                <Field label="Contact Phone"><input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Enter phone number..." className={input} /></Field>
                <Field label="Related Projects (if any)"><input value={projects} onChange={(event) => setProjects(event.target.value)} placeholder="Select project(s)..." className={input} /></Field>
              </div>
            </Card>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-5 py-4">
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => save(false)} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 px-4 text-[13px] font-bold text-slate-700 disabled:opacity-50"><Save className="h-4 w-4" /> Save as Draft</button>
            <button type="button" onClick={onClose} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 px-4 text-[13px] font-bold text-slate-700"><X className="h-4 w-4" /> Cancel</button>
          </div>
          {gm ? <button type="button" disabled={busy} onClick={() => save(true)} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#2563eb] px-4 text-[13px] font-bold text-white disabled:opacity-50"><Send className="h-4 w-4" /> {busy ? 'Saving…' : 'Save and Assign'}</button> : null}
        </div>
      </div>
    </div>
  );
}

const input = 'h-10 w-full rounded-lg border border-slate-200 px-3 text-[13px] disabled:bg-slate-50';

function Card({ step, title, children }: { step: string; title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="mb-3 flex items-center gap-2 text-[14px] font-black text-slate-900"><span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#2563eb] text-[11px] text-white">{step}</span> {title}</h3>
      {children}
    </section>
  );
}

function Field({ label, required = false, className = '', children }: { label: string; required?: boolean; className?: string; children: ReactNode }) {
  return <label className={`block text-[12px] font-semibold text-slate-500 ${className}`}>{label}{required ? <span className="text-rose-500"> *</span> : null}<div className="mt-1">{children}</div></label>;
}
