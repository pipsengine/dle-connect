'use client';

import { Check, FilePlus2, FileSearch, Link2, Package, Pencil, Printer, RefreshCw, Save, Search, Trash2, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { forwardRef, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ADDITIONAL_WORK,
  fmtDate,
  formDate,
  JOB_TYPES,
  kgText,
  nextSignOff,
  PACKAGING,
  RELEASE_FORM,
  RELEASE_STAGE,
  releaseStage,
  SIGN_OFFS,
  type AdditionalWork,
  type GalvanizingRelease,
  type JobType,
  type Packaging,
  type ReleaseSignRole,
  type ReleaseStage,
} from '@/lib/galvanizing/release-meta';
import type { GalvanizingSnapshot } from '@/lib/galvanizing/types';

type Draft = Omit<GalvanizingRelease, 'id' | 'createdAt' | 'updatedAt' | 'signOffs'>;
type MaterialOption = {
  key: string;
  jobId: number;
  receiptId: number;
  materialRegisterId: number;
  label: string;
  clientName: string;
  po: string;
  items: string;
  received: string;
  net: number | null;
  jobNo: string;
  jobDate: string;
  due: string;
};

const inputClass = 'h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-[#0b1f4a] focus:ring-4 focus:ring-[#0b1f4a]/10';
const labelClass = 'mb-1.5 block text-xs font-semibold text-slate-600';

const blankDraft = (orderNo: string): Draft => ({
  releaseOrderNo: orderNo,
  formNo: RELEASE_FORM.docNo,
  dated: new Date().toISOString().slice(0, 10),
  batch: '',
  jobType: 'galvanizing',
  jobTypeOther: '',
  clientName: '',
  clientPoNo: '',
  scheduledDelivery: '',
  pfiNo: '',
  pfiDate: '',
  materialReceiptDate: '',
  blackWeight: null,
  weighbridgeTicketNo: '',
  additionalWork: [],
  additionalWorkOther: '',
  itemsList: '',
  packaging: [],
  packagingOther: '',
  remarks: '',
  variationReason: '',
  jobNo: '',
  jobDate: '',
  qcReportNo: '',
  qcReportDate: '',
  hdgRate: '',
  otherCharges: '',
  dispatchDate: '',
  ticketNo: '',
  galvanizedWeight: null,
  waybillNo: '',
  waybillDate: '',
  paymentReceiptNo: '',
  paymentReceiptDate: '',
  jobId: 0,
  receiptId: 0,
  materialRegisterId: 0,
});

const draftFrom = (release: GalvanizingRelease): Draft => {
  const { id: _id, createdAt: _created, updatedAt: _updated, signOffs: _signs, ...draft } = release;
  return draft;
};

const nextOrderNo = (releases: GalvanizingRelease[]) => {
  const year = new Date().getFullYear();
  const seq = releases.reduce((max, release) => {
    const match = release.releaseOrderNo.match(/(\d+)$/);
    return Math.max(max, match ? Number(match[1]) : 0);
  }, 0) + 1;
  return `JRO-${year}-${String(seq).padStart(4, '0')}`;
};

const materialKey = (jobId: number, receiptId: number, materialRegisterId = 0) => (
  materialRegisterId > 0 ? `m-${materialRegisterId}` : receiptId > 0 ? `r-${receiptId}` : jobId > 0 ? `j-${jobId}` : ''
);

const materialNet = (material: { weighMethod: string; grossWeight: number | null; emptyWeight: number | null; directNetWeight: number | null }) => {
  if (material.weighMethod === 'direct') return material.directNetWeight;
  if (material.grossWeight == null || material.emptyWeight == null) return null;
  return Math.round((material.grossWeight - material.emptyWeight) * 1000) / 1000;
};

function materialsOf(data: GalvanizingSnapshot | null): MaterialOption[] {
  if (!data) return [];
  const fromRegister = (data.materials || []).map((material) => ({
    key: `m-${material.id}`,
    jobId: 0,
    receiptId: 0,
    materialRegisterId: material.id,
    label: `${material.jobNo} — ${material.clientName}`,
    clientName: material.clientName,
    po: '',
    items: material.items,
    received: material.dateReceived,
    net: materialNet(material),
    jobNo: material.jobNo,
    jobDate: material.dateReceived,
    due: '',
  }));
  const jobs = new Map(data.jobs.map((job) => [job.id, job]));
  const fromReceipts = data.receipts.filter((receipt) => receipt.jobId > 0).map((receipt) => {
    const job = jobs.get(receipt.jobId);
    const items = data.articles.filter((article) => article.receiptId === receipt.id).map((article) => `${article.description} – ${article.quantity}`).join(', ');
    return {
      key: `r-${receipt.id}`,
      jobId: receipt.jobId,
      receiptId: receipt.id,
      materialRegisterId: 0,
      label: `${receipt.jobNumber || job?.number || 'Job'} — ${receipt.customerProject || job?.customerProject || 'Unassigned'}`,
      clientName: receipt.customerProject || job?.customerProject || '',
      po: job?.reference || '',
      items: items || job?.title || '',
      received: (receipt.gateInAt || '').slice(0, 10),
      net: receipt.tareRecorded === 'YES' ? receipt.netKg : null,
      jobNo: receipt.jobNumber || job?.number || '',
      jobDate: (job?.createdAt || '').slice(0, 10),
      due: job?.dueDate || '',
    };
  });
  const linkedJobs = new Set(fromReceipts.map((item) => item.jobId));
  const jobsOnly = data.jobs.filter((job) => !linkedJobs.has(job.id) && job.status !== 'REJECTED').map((job) => ({
    key: `j-${job.id}`,
    jobId: job.id,
    receiptId: 0,
    materialRegisterId: 0,
    label: `${job.number} — ${job.customerProject}`,
    clientName: job.customerProject,
    po: job.reference,
    items: job.title,
    received: '',
    net: job.estimatedTonnes > 0 ? Math.round(job.estimatedTonnes * 1000 * 1000) / 1000 : null,
    jobNo: job.number,
    jobDate: job.createdAt.slice(0, 10),
    due: job.dueDate,
  }));
  return [...fromRegister, ...fromReceipts, ...jobsOnly];
}

function usePlant() {
  const [data, setData] = useState<GalvanizingSnapshot | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    fetch('/api/galvanizing', { cache: 'no-store' })
      .then((res) => res.json().then((json) => ({ ok: res.ok, json })))
      .then(({ ok, json }) => {
        if (!active) return;
        if (!ok) setError(json.error || 'Unable to load job releases.');
        else setData(json.data);
      })
      .catch(() => { if (active) setError('Unable to load job releases.'); });
    return () => { active = false; };
  }, []);
  const post = async (action: string, payload: Record<string, unknown>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/galvanizing', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...payload }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'The action was rejected.');
      setData(json.data);
      setNotice(json.notice || 'Saved.');
      return json.data as GalvanizingSnapshot;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The action was rejected.');
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { data, error, notice, busy, post };
}

function Banner({ notice, error }: { notice: string; error: string }) {
  return (
    <>
      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{notice}</div> : null}
      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{error}</div> : null}
    </>
  );
}

function Modal({ title, text, wide, onClose, children, footer }: { title: string; text?: string; wide?: boolean; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previous; };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-3 sm:items-center sm:p-6">
      <button type="button" className="absolute inset-0 bg-slate-950/50" aria-label="Close dialog" onClick={onClose} />
      <div role="dialog" aria-modal="true" className={`relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ${wide ? 'max-w-5xl' : 'max-w-lg'}`}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
            {text ? <p className="mt-1 text-sm leading-6 text-slate-600">{text}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100">Close</button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {footer ? <div className="border-t border-slate-100 px-6 py-4">{footer}</div> : null}
      </div>
    </div>
  );
}

function TextInput({ label, value, onChange, type = 'text', required, error, hint, className = '' }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; error?: string; hint?: string; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className={labelClass}>{label}{required ? ' *' : ''}</span>
      <input type={type} value={value} required={required} aria-invalid={error ? true : undefined} onChange={(event) => onChange(event.target.value)} className={inputClass} />
      {error ? <span className="mt-1 block text-xs font-medium text-rose-700">{error}</span> : null}
      {hint && !error ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

function WeightInput({ label, value, onChange, hint }: { label: string; value: number | null; onChange: (value: number | null) => void; hint?: string }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <input type="number" min="0" step="0.001" value={value ?? ''} onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))} className={inputClass} />
      {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

function Area({ label, value, onChange, required, error, hint }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; error?: string; hint?: string }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}{required ? ' *' : ''}</span>
      <textarea value={value} required={required} aria-invalid={error ? true : undefined} rows={3} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0b1f4a] focus:ring-4 focus:ring-[#0b1f4a]/10" />
      {error ? <span className="mt-1 block text-xs font-medium text-rose-700">{error}</span> : null}
      {hint && !error ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

const toggle = (list: string[], value: string, on: boolean) => (on ? [...new Set([...list, value])] : list.filter((item) => item !== value));

function ReleaseFormDialog({ initial, existing, data, busy, serverError = '', onClose, onSave }: {
  initial: Draft;
  existing?: GalvanizingRelease;
  data: GalvanizingSnapshot;
  busy: boolean;
  serverError?: string;
  onClose: () => void;
  onSave: (draft: Draft) => Promise<boolean>;
}) {
  const [start] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [formError, setFormError] = useState('');
  const materials = useMemo(() => materialsOf(data), [data]);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const others = (data.releases || []).filter((item) => item.id !== existing?.id);
  const errors = {
    releaseOrderNo: !draft.releaseOrderNo.trim() ? 'Enter the release order number.' : others.some((item) => item.releaseOrderNo.trim() === draft.releaseOrderNo.trim()) ? 'This release order number is already used.' : '',
    formNo: !draft.formNo.trim() ? 'Enter the form number.' : '',
    dated: !draft.dated ? 'Enter the date.' : '',
    clientName: !draft.clientName.trim() ? 'Enter the client name.' : '',
    jobTypeOther: draft.jobType === 'others' && !draft.jobTypeOther.trim() ? 'Specify the type of job.' : '',
    itemsList: !draft.itemsList.trim() ? 'List the items and quantity as per waybill.' : '',
    scheduledDelivery: draft.scheduledDelivery && draft.dated && draft.scheduledDelivery < draft.dated ? 'Delivery date is before the release date.' : '',
  };
  const shown = submitted ? errors : { releaseOrderNo: '', formNo: '', dated: '', clientName: '', jobTypeOther: '', itemsList: '', scheduledDelivery: '' };
  const dirty = JSON.stringify(draft) !== JSON.stringify(start);
  const requestClose = () => (dirty ? setDiscard(true) : onClose());
  const linked = materials.find((item) => item.key === materialKey(draft.jobId, draft.receiptId, draft.materialRegisterId));
  const taken = (option: MaterialOption) => others.find((item) => (
    (option.materialRegisterId > 0 && item.materialRegisterId === option.materialRegisterId)
    || (option.receiptId > 0 && item.receiptId === option.receiptId)
    || (option.materialRegisterId === 0 && option.receiptId === 0 && item.jobId === option.jobId && item.receiptId === 0 && item.materialRegisterId === 0)
  ));
  const fill = (key: string) => {
    const option = materials.find((item) => item.key === key);
    if (!option) {
      setDraft((current) => ({ ...current, jobId: 0, receiptId: 0, materialRegisterId: 0 }));
      return;
    }
    setDraft((current) => ({
      ...current,
      jobId: option.jobId,
      receiptId: option.receiptId,
      materialRegisterId: option.materialRegisterId,
      clientName: option.clientName,
      clientPoNo: current.clientPoNo || option.po,
      materialReceiptDate: option.received || current.materialReceiptDate,
      blackWeight: option.net ?? current.blackWeight,
      itemsList: current.itemsList && current.materialRegisterId === option.materialRegisterId && current.receiptId === option.receiptId && current.jobId === option.jobId ? current.itemsList : option.items,
      jobNo: option.jobNo,
      jobDate: option.jobDate,
      scheduledDelivery: current.scheduledDelivery || option.due,
    }));
  };
  const save = async () => {
    setSubmitted(true);
    if (Object.values(errors).some(Boolean)) {
      setFormError('Please correct the highlighted fields.');
      return;
    }
    setFormError('');
    if (await onSave(draft)) onClose();
  };
  return (
    <>
      <Modal
        wide
        title={existing ? `Edit Job Release Order ${existing.releaseOrderNo}` : 'New Job Release Order'}
        text={`Doc No ${RELEASE_FORM.docNo} · Revision ${RELEASE_FORM.revision}${existing ? '' : ' · saved as a draft until it is issued'}`}
        onClose={requestClose}
        footer={(
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs text-slate-500"><Link2 className="h-3.5 w-3.5" /> Sign-offs are recorded on the release page.</p>
            <div className="flex gap-2">
              <button type="button" onClick={requestClose} className="h-10 rounded-lg px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
              <button type="button" disabled={busy || (!!existing && !dirty)} onClick={() => void save()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#0b1f4a] px-4 text-sm font-semibold text-white hover:bg-[#16336e] disabled:opacity-40"><Save className="h-4 w-4" />{existing ? 'Save changes' : 'Save draft'}</button>
            </div>
          </div>
        )}
      >
        {existing && releaseStage(existing) !== 'draft' ? <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">This release has already been signed. Check that any change is agreed with the signatories.</p> : null}
        <div className="flex flex-col gap-3 rounded-xl border border-blue-200 bg-blue-50/40 p-4 sm:flex-row sm:items-end">
          <label className="block flex-1">
            <span className={labelClass}>Linked material record</span>
            <select value={materialKey(draft.jobId, draft.receiptId, draft.materialRegisterId)} onChange={(event) => fill(event.target.value)} className={inputClass}>
              <option value="">Not linked</option>
              {materials.map((option) => {
                const used = taken(option);
                return <option key={option.key} value={option.key} disabled={!!used}>{option.label}{used ? ` (Release ${used.releaseOrderNo})` : ''}</option>;
              })}
            </select>
            <span className="mt-1 block text-xs text-slate-500">{linked ? `${linked.clientName} · ${linked.items} · net ${kgText(linked.net)}` : 'Link a received job to fill the shared fields from the plant database.'}</span>
          </label>
          {linked ? <button type="button" onClick={() => fill(linked.key)} className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800"><RefreshCw className="h-4 w-4" /> Refresh from material</button> : null}
        </div>
        {formError || serverError ? <p className="mt-3 text-sm font-medium text-rose-700">{formError || serverError}</p> : null}
        <Section step={1} title="Release details">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <TextInput label="Release Order No." value={draft.releaseOrderNo} onChange={(value) => set('releaseOrderNo', value)} required error={shown.releaseOrderNo} />
            <TextInput label="Dated" type="date" value={draft.dated} onChange={(value) => set('dated', value)} required error={shown.dated} />
            <TextInput label="Form No." value={draft.formNo} onChange={(value) => set('formNo', value)} required error={shown.formNo} />
            <TextInput label="Batch" value={draft.batch} onChange={(value) => set('batch', value)} />
          </div>
        </Section>
        <Section step={2} title="Type of job" text="Tick as appropriate.">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {(Object.keys(JOB_TYPES) as JobType[]).map((type) => (
              <label key={type} className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm ${draft.jobType === type ? 'border-blue-500 bg-blue-50/60 text-blue-800' : 'border-slate-200 text-slate-700'}`}>
                <input type="radio" name="jobType" checked={draft.jobType === type} onChange={() => set('jobType', type)} className="h-4 w-4 accent-blue-600" />
                {JOB_TYPES[type]}
              </label>
            ))}
          </div>
          {draft.jobType === 'others' ? <TextInput label="Specify type of job" value={draft.jobTypeOther} onChange={(value) => set('jobTypeOther', value)} required error={shown.jobTypeOther} className="mt-4 max-w-md" /> : null}
        </Section>
        <Section step={3} title="Client and material">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <TextInput label="Name of Client" value={draft.clientName} onChange={(value) => set('clientName', value)} required error={shown.clientName} className="sm:col-span-2" />
            <TextInput label="Client's P.O. No." value={draft.clientPoNo} onChange={(value) => set('clientPoNo', value)} />
            <TextInput label="Scheduled Date of Delivery" type="date" value={draft.scheduledDelivery} onChange={(value) => set('scheduledDelivery', value)} error={shown.scheduledDelivery} />
            <TextInput label="PFI No." value={draft.pfiNo} onChange={(value) => set('pfiNo', value)} />
            <TextInput label="PFI dated" type="date" value={draft.pfiDate} onChange={(value) => set('pfiDate', value)} />
            <TextInput label="Date of Mat. Receipt" type="date" value={draft.materialReceiptDate} onChange={(value) => set('materialReceiptDate', value)} />
            <WeightInput label="Black Weight" value={draft.blackWeight} onChange={(value) => set('blackWeight', value)} hint="Weight before galvanizing" />
            <TextInput label="Weight Bridge Ticket No." value={draft.weighbridgeTicketNo} onChange={(value) => set('weighbridgeTicketNo', value)} />
          </div>
        </Section>
        <Section step={4} title="Additional work requirement" text="Tick as appropriate.">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(Object.keys(ADDITIONAL_WORK) as AdditionalWork[]).map((work) => (
              <label key={work} className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={draft.additionalWork.includes(work)} onChange={(event) => set('additionalWork', toggle(draft.additionalWork, work, event.target.checked))} />{ADDITIONAL_WORK[work]}</label>
            ))}
            <input aria-label="Other additional work" value={draft.additionalWorkOther} onChange={(event) => set('additionalWorkOther', event.target.value)} placeholder="Others (specify)" className={inputClass} />
          </div>
          <div className="mt-4"><Area label="List of items / quantity as per waybill" value={draft.itemsList} onChange={(value) => set('itemsList', value)} required error={shown.itemsList} hint="e.g. Straight sections (600×150H), ladders – 120 nos" /></div>
        </Section>
        <Section step={5} title="Packaging" text="Tick as appropriate.">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {(Object.keys(PACKAGING) as Packaging[]).map((item) => (
              <label key={item} className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={draft.packaging.includes(item)} onChange={(event) => set('packaging', toggle(draft.packaging, item, event.target.checked))} />{PACKAGING[item]}</label>
            ))}
            <input aria-label="Other packaging" value={draft.packagingOther} onChange={(event) => set('packagingOther', event.target.value)} placeholder="Others (specify)" className={inputClass} />
          </div>
        </Section>
        <Section step={6} title="Notes and variation">
          <div className="grid gap-4 lg:grid-cols-2">
            <Area label="Note / Remarks" value={draft.remarks} onChange={(value) => set('remarks', value)} />
            <Area label="State reason for any variation" value={draft.variationReason} onChange={(value) => set('variationReason', value)} />
          </div>
        </Section>
        <Section step={7} title="Job and quality reference">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <TextInput label="Job No." value={draft.jobNo} onChange={(value) => set('jobNo', value)} />
            <TextInput label="Job dated" type="date" value={draft.jobDate} onChange={(value) => set('jobDate', value)} />
            <TextInput label="QC Report No." value={draft.qcReportNo} onChange={(value) => set('qcReportNo', value)} />
            <TextInput label="QC report dated" type="date" value={draft.qcReportDate} onChange={(value) => set('qcReportDate', value)} />
          </div>
        </Section>
        <Section step={8} title="Pricing" text="Completed by Sales at costing.">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput label="HDG Rate (Price)" value={draft.hdgRate} onChange={(value) => set('hdgRate', value)} />
            <TextInput label="Blasting/Hole Charges & Others" value={draft.otherCharges} onChange={(value) => set('otherCharges', value)} />
          </div>
        </Section>
        <Section step={9} title="Dispatch and payment" text="Completed when the galvanized material is dispatched and paid for.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <TextInput label="Dispatch Date" type="date" value={draft.dispatchDate} onChange={(value) => set('dispatchDate', value)} />
            <TextInput label="Ticket No." value={draft.ticketNo} onChange={(value) => set('ticketNo', value)} />
            <WeightInput label="Galvanized Weight" value={draft.galvanizedWeight} onChange={(value) => set('galvanizedWeight', value)} />
            <TextInput label="DLPC Waybill No. / Dispatch Note" value={draft.waybillNo} onChange={(value) => set('waybillNo', value)} />
            <TextInput label="Waybill dated" type="date" value={draft.waybillDate} onChange={(value) => set('waybillDate', value)} />
            <TextInput label="DLPC Payment Receipt No." value={draft.paymentReceiptNo} onChange={(value) => set('paymentReceiptNo', value)} />
            <TextInput label="Receipt dated" type="date" value={draft.paymentReceiptDate} onChange={(value) => set('paymentReceiptDate', value)} />
          </div>
        </Section>
      </Modal>
      {discard ? (
        <Modal title="Discard changes?" text="Your changes to this job release will be lost." onClose={() => setDiscard(false)} footer={(
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setDiscard(false)} className="h-10 rounded-lg px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
            <button type="button" onClick={onClose} className="h-10 rounded-lg bg-rose-700 px-4 text-sm font-semibold text-white">Discard</button>
          </div>
        )}><span /></Modal>
      ) : null}
    </>
  );
}

function Section({ step, title, text, children }: { step: number; title: string; text?: string; children: ReactNode }) {
  return (
    <section className="mt-6 border-t border-slate-100 pt-5">
      <div className="mb-3 flex items-baseline gap-2">
        <span className="text-xs font-semibold text-slate-400">{step}</span>
        <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
        {text ? <span className="text-xs text-slate-500">{text}</span> : null}
      </div>
      {children}
    </section>
  );
}

const Box = ({ on }: { on: boolean }) => <span className="inline-flex h-[14px] w-[14px] shrink-0 items-center justify-center border border-black text-[11px] font-bold leading-none">{on ? '✓' : ''}</span>;
const Blank = ({ label, value }: { label: string; value?: ReactNode }) => (
  <span className="flex min-w-0 flex-1 items-end gap-1.5">
    <span className="shrink-0 whitespace-nowrap">{label}</span>
    <span className="min-w-[48px] flex-1 border-b border-dotted border-black px-1 font-semibold text-[#0b2a6b]">{value || ' '}</span>
  </span>
);

export const ReleaseDocument = forwardRef<HTMLDivElement, { release: GalvanizingRelease }>(function ReleaseDocument({ release }, ref) {
  const sign = Object.fromEntries(SIGN_OFFS.map((item) => [item.role, item])) as Record<ReleaseSignRole, (typeof SIGN_OFFS)[number]>;
  return (
    <div ref={ref} className="jro-sheet mx-auto w-full max-w-[794px] bg-white p-6 font-[Arial,Helvetica,sans-serif] text-[11.5px] leading-snug text-black sm:p-8">
      <div className="flex border border-black">
        <div className="flex w-[34%] shrink-0 items-center gap-2 border-r border-black px-3 py-2">
          <span className="text-[22px] font-black leading-none tracking-tighter">DL</span>
          <span className="leading-none"><span className="block text-[12px] font-bold tracking-wide">DORMAN LONG</span><span className="block text-[7px] tracking-[0.18em]">ENGINEERING LIMITED</span></span>
        </div>
        <div className="flex-1 text-center">
          <p className="border-b border-black py-1.5 text-[13px] font-bold tracking-wide">DORMANLONG PROTECTIVE COATINGS LIMITED</p>
          <div className="flex"><p className="flex-1 py-1 text-[12px] font-bold">JOB RELEASE ORDER</p><p className="w-[32%] border-l border-black py-1 font-semibold text-[#0b2a6b]">{release.batch}</p></div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-1">
        <Blank label="Release Order No:" value={release.releaseOrderNo} />
        <Blank label="Dated:" value={formDate(release.dated)} />
        <Blank label="Form No:" value={release.formNo} />
      </div>
      <div className="mt-2 border border-black">
        <div className="grid grid-cols-5 border-b border-black text-[10.5px]">
          <div className="border-r border-black px-2 py-1.5">Type of Job<br /><span className="text-[9.5px]">(Put √ as Appropriate)</span></div>
          {(Object.keys(JOB_TYPES) as JobType[]).map((type, index) => (
            <div key={type} className={`flex items-center justify-between gap-1 px-2 py-1.5 ${index < 3 ? 'border-r border-black' : ''}`}>
              <span>{type === 'others' && release.jobType === 'others' && release.jobTypeOther ? `Others: ${release.jobTypeOther}` : type === 'others' ? 'Others (Specify)' : JOB_TYPES[type]}</span>
              <Box on={release.jobType === type} />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-5 border-b border-black px-2 py-1.5"><Blank label="Name of Client:" value={release.clientName} /><Blank label="Client's P.O. No:" value={release.clientPoNo} /></div>
        <div className="flex flex-wrap gap-x-5 border-b border-black px-2 py-1.5"><Blank label="PFI No.:" value={release.pfiNo} /><Blank label="Dated:" value={formDate(release.pfiDate)} /></div>
        <div className="flex flex-wrap gap-x-5 border-b border-black px-2 py-1.5"><Blank label="Date of Mat. Receipt:" value={formDate(release.materialReceiptDate)} /><Blank label="Black Weight:" value={release.blackWeight == null ? '' : `${release.blackWeight.toLocaleString('en-GB')} kg`} /><Blank label="Weight Bridge Ticket No.:" value={release.weighbridgeTicketNo} /></div>
        <div className="flex border-b border-black px-2 py-1.5"><Blank label="Scheduled Date of Delivery:" value={formDate(release.scheduledDelivery)} /></div>
        <div className="flex border-b border-black px-2 py-1 text-[10.5px]"><span>Additional Work Requirement</span><span className="ml-auto">List of items / quantity as per waybill:</span></div>
        <div className="grid grid-cols-2 border-b border-black">
          <div className="border-r border-black">
            {(Object.keys(ADDITIONAL_WORK) as AdditionalWork[]).map((work) => (
              <div key={work} className="flex items-center justify-between border-b border-black px-2 py-1 last:border-b-0">{ADDITIONAL_WORK[work]} <Box on={release.additionalWork.includes(work)} /></div>
            ))}
            <div className="px-2 py-1"><Blank label="Others (Specify)" value={release.additionalWorkOther} /></div>
          </div>
          <div className="whitespace-pre-wrap px-2 py-1.5 font-semibold text-[#0b2a6b]">{release.itemsList}</div>
        </div>
        <p className="border-b border-black px-2 py-1 text-[10.5px]">Packaging</p>
        <div className="grid grid-cols-2 border-b border-black">
          <div className="border-r border-black">{(Object.keys(PACKAGING) as Packaging[]).map((item) => <div key={item} className="flex items-center justify-between border-b border-black px-2 py-1 last:border-b-0">{PACKAGING[item]} <Box on={release.packaging.includes(item)} /></div>)}</div>
          <div className="px-2 py-1.5"><Blank label="Others (Specify)" value={release.packagingOther} /></div>
        </div>
        <div className="border-b border-black px-2 py-1.5"><Blank label="Note/Remarks" value={release.remarks} /></div>
        <div className="border-b border-black px-2 py-1.5"><Blank label="State Reason For Any Variation:" value={release.variationReason} /></div>
        <div className="flex gap-6 border-b border-black px-2 py-2">
          <Signature title="Issued By" designation={sign.issued.designations.join(' / ')} signed={release.signOffs.issued} />
          <Signature title="Received By" designation={sign.received.designations.join(' / ')} signed={release.signOffs.received} />
        </div>
        <div className="flex flex-wrap gap-x-5 border-b border-black px-2 py-1.5"><Blank label="Job No.:" value={release.jobNo} /><Blank label="Dated:" value={formDate(release.jobDate)} /><Blank label="QC Report No.:" value={release.qcReportNo} /><Blank label="Dated:" value={formDate(release.qcReportDate)} /></div>
        <div className="border-b border-black px-2 py-1.5"><Blank label="HDG Rate (Price):" value={release.hdgRate} /></div>
        <div className="border-b border-black px-2 py-1.5"><Blank label="Blasting/Hole Charges & Others:" value={release.otherCharges} /></div>
        <div className="flex flex-wrap gap-x-5 px-2 py-1.5"><Blank label="Dispatch Date:" value={formDate(release.dispatchDate)} /><Blank label="Ticket No.:" value={release.ticketNo} /><Blank label="Galvanized Weight:" value={release.galvanizedWeight == null ? '' : `${release.galvanizedWeight.toLocaleString('en-GB')} kg`} /></div>
        <div className="flex flex-wrap gap-x-5 px-2 py-1.5"><Blank label="DLPC Waybill No/Dispatch Note:" value={release.waybillNo} /><Blank label="Dated:" value={formDate(release.waybillDate)} /></div>
        <div className="flex flex-wrap gap-x-5 px-2 py-1.5"><Blank label="DLPC Payment Receipt No.:" value={release.paymentReceiptNo} /><Blank label="Dated:" value={formDate(release.paymentReceiptDate)} /></div>
        <div className="flex gap-6 px-2 pb-3 pt-2">
          <Signature title="Reviewed By" designation={sign.reviewed.designations.join(' / ')} signed={release.signOffs.reviewed} />
          <Signature title="Approved By" designation={sign.approved.designations.join(' / ')} signed={release.signOffs.approved} />
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between text-[11px] font-semibold">
        <span>Doc No: {RELEASE_FORM.docNo}</span><span>Revision. {RELEASE_FORM.revision}</span><span>Issue Date: {RELEASE_FORM.issueDate}</span>
      </div>
    </div>
  );
});

function Signature({ title, designation, signed }: { title: string; designation: string; signed: GalvanizingRelease['signOffs']['issued'] }) {
  return (
    <div className="min-w-0 flex-1">
      <Blank label={`${title}:`} value={signed ? `${signed.name} — ${formDate(signed.date)}` : ''} />
      <p className="mt-0.5 text-[10px]">{signed ? signed.designation : designation}</p>
    </div>
  );
}

function printElement(element: HTMLElement, title: string) {
  const frame = document.createElement('iframe');
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc || !frame.contentWindow) return;
  const styles = [...document.querySelectorAll('link[rel="stylesheet"], style')].map((node) => node.outerHTML).join('');
  doc.open();
  doc.write(`<!doctype html><html><head><title>${title.replace(/</g, '')}</title>${styles}<style>@page{size:A4;margin:10mm}body{background:#fff;margin:0}.jro-sheet{max-width:none!important;padding:0!important}</style></head><body>${element.outerHTML}</body></html>`);
  doc.close();
  setTimeout(() => { frame.contentWindow?.focus(); frame.contentWindow?.print(); setTimeout(() => frame.remove(), 1000); }, 300);
}

const canSign = (data: GalvanizingSnapshot, role: ReleaseSignRole) => {
  const caps = data.capabilities;
  if (caps.release) return true;
  if (role === 'issued') return caps.intake;
  if (role === 'received') return caps.production;
  if (role === 'reviewed') return caps.qc;
  return false;
};

export function JobReleaseList() {
  const plant = usePlant();
  const router = useRouter();
  const params = useSearchParams();
  const stage = (params.get('stage') || 'all') as 'all' | ReleaseStage;
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [preset, setPreset] = useState<Draft | null>(null);
  const openedMaterial = useRef(false);
  const materialParam = Number(params.get('material') || 0);
  const releases = plant.data?.releases || [];
  useEffect(() => {
    if (openedMaterial.current || !plant.data || !materialParam) return;
    const material = (plant.data.materials || []).find((item) => item.id === materialParam);
    if (!material) return;
    openedMaterial.current = true;
    setPreset({
      ...blankDraft(nextOrderNo(plant.data.releases || [])),
      clientName: material.clientName,
      itemsList: material.items,
      jobNo: material.jobNo,
      jobDate: material.dateReceived,
      materialReceiptDate: material.dateReceived,
      blackWeight: materialNet(material),
      weighbridgeTicketNo: material.noWaybillMemo?.ticketNumber || '',
      materialRegisterId: material.id,
    });
    setCreating(true);
    router.replace('/operations-center/galvanizing/jobs/release', { scroll: false });
  }, [plant.data, materialParam, router]);
  const setStage = (value: string) => router.replace(value === 'all' ? '/operations-center/galvanizing/jobs/release' : `/operations-center/galvanizing/jobs/release?stage=${value}`, { scroll: false });
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return releases
      .filter((release) => stage === 'all' || releaseStage(release) === stage)
      .filter((release) => !needle || [release.releaseOrderNo, release.formNo, release.clientName, release.jobNo, release.itemsList, release.batch].some((value) => value.toLowerCase().includes(needle)))
      .sort((a, b) => b.dated.localeCompare(a.dated) || b.id - a.id);
  }, [releases, stage, query]);
  const counts = useMemo(() => {
    const tally: Record<string, number> = { all: releases.length };
    for (const release of releases) {
      const key = releaseStage(release);
      tally[key] = (tally[key] || 0) + 1;
    }
    return tally;
  }, [releases]);
  const canCreate = Boolean(plant.data && (plant.data.capabilities.intake || plant.data.capabilities.release));
  if (!plant.data && !plant.error) return <div className="rounded-2xl border border-slate-200 bg-white p-10 text-sm text-slate-500">Loading job releases…</div>;
  return (
    <div className="space-y-6">
      <Banner notice={plant.notice} error={creating ? '' : plant.error} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Jobs and intake</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Job Release Orders</h1>
          <p className="mt-2 text-sm text-slate-600">Job Release Orders ({RELEASE_FORM.docNo}) and their sign-off progress.</p>
        </div>
        <button type="button" disabled={!canCreate} onClick={() => setCreating(true)} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#0b1f4a] px-4 text-sm font-semibold text-white hover:bg-[#16336e] disabled:opacity-40"><FilePlus2 className="h-4 w-4" /> New Job Release</button>
      </div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
          {(['all', 'draft', 'issued', 'received', 'reviewed', 'approved'] as const).map((item) => (
            <button key={item} type="button" onClick={() => setStage(item)} className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium ${stage === item ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}>
              {item === 'all' ? 'All' : RELEASE_STAGE[item].label}<span className="ml-1.5 tabular-nums opacity-60">{counts[item] || 0}</span>
            </button>
          ))}
        </div>
        <label className="relative lg:w-80">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search release no., client, job no.…" className={`${inputClass} pl-10`} />
        </label>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {rows.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <FileSearch className="mx-auto h-7 w-7 text-slate-400" />
            <h2 className="mt-3 text-base font-semibold text-slate-950">{query || stage !== 'all' ? 'No job releases match' : 'No job releases yet'}</h2>
            <p className="mt-1 text-sm text-slate-500">{query || stage !== 'all' ? 'Try a different search or stage.' : 'Create one from a material record or start a blank release.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Release / form no.</th><th className="px-4 py-3">Dated</th><th className="px-4 py-3">Client</th><th className="px-4 py-3">Job</th><th className="px-4 py-3 text-right">Black weight</th><th className="px-4 py-3">Stage</th><th className="px-4 py-3">Next sign-off</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((release) => {
                  const current = releaseStage(release);
                  const next = nextSignOff(release);
                  const typeLabel = release.jobType === 'others' ? release.jobTypeOther || 'Others' : JOB_TYPES[release.jobType as JobType] || release.jobType;
                  return (
                    <tr key={release.id} className="cursor-pointer hover:bg-slate-50" onClick={() => router.push(`/operations-center/galvanizing/jobs/release/${release.id}`)}>
                      <td className="px-4 py-3"><Link href={`/operations-center/galvanizing/jobs/release/${release.id}`} className="font-semibold text-slate-900 hover:text-blue-700" onClick={(event) => event.stopPropagation()}>{release.releaseOrderNo}</Link><span className="block text-xs text-slate-500">Form {release.formNo}{release.batch ? ` · ${release.batch}` : ''}</span></td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{fmtDate(release.dated)}</td>
                      <td className="max-w-[260px] px-4 py-3"><span className="block truncate font-medium text-slate-900">{release.clientName}</span><span className="block truncate text-xs text-slate-500">{release.itemsList}</span></td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{release.jobNo || '—'}<span className="block text-xs text-slate-500">{typeLabel}</span></td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-700">{kgText(release.blackWeight)}</td>
                      <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${RELEASE_STAGE[current].tone}`}>{RELEASE_STAGE[current].label}</span></td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{next ? `${next.label} — ${next.designations[0]}` : <span className="text-emerald-700">Complete</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {creating && plant.data ? (
        <ReleaseFormDialog
          initial={preset || blankDraft(nextOrderNo(releases))}
          data={plant.data}
          busy={plant.busy}
          serverError={plant.error}
          onClose={() => setCreating(false)}
          onSave={async (draft) => {
            const saved = await plant.post('save-release', draft);
            if (!saved) return false;
            const created = saved.releases.find((item) => item.releaseOrderNo === draft.releaseOrderNo);
            if (created) router.push(`/operations-center/galvanizing/jobs/release/${created.id}`);
            return true;
          }}
        />
      ) : null}
    </div>
  );
}

export function JobReleaseDetail({ releaseId }: { releaseId: string }) {
  const plant = usePlant();
  const router = useRouter();
  const docRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [signing, setSigning] = useState<ReleaseSignRole | null>(null);
  const [withdraw, setWithdraw] = useState<ReleaseSignRole | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const release = (plant.data?.releases || []).find((item) => String(item.id) === releaseId);
  if (!plant.data && !plant.error) return <div className="rounded-2xl border border-slate-200 bg-white p-10 text-sm text-slate-500">Loading job release…</div>;
  if (!release || !plant.data) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center">
        <h1 className="text-base font-semibold text-slate-950">Job release not found</h1>
        <Link href="/operations-center/galvanizing/jobs/release" className="mt-3 inline-flex text-sm font-semibold text-[#0b1f4a]">Back to job releases</Link>
      </div>
    );
  }
  const stage = releaseStage(release);
  const material = materialsOf(plant.data).find((item) => item.key === materialKey(release.jobId, release.receiptId, release.materialRegisterId));
  const next = nextSignOff(release);
  const laterSigned = (role: ReleaseSignRole) => {
    const index = SIGN_OFFS.findIndex((item) => item.role === role);
    return SIGN_OFFS.slice(index + 1).some((item) => release.signOffs[item.role]);
  };
  return (
    <div className="space-y-6">
      <Banner notice={plant.notice} error={plant.error} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/operations-center/galvanizing/jobs/release" className="text-xs font-semibold text-slate-500 hover:text-slate-800">Job Release Orders</Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Job Release Order {release.releaseOrderNo}</h1>
          <p className="mt-2 text-sm text-slate-600">{release.clientName} · Form {release.formNo} · dated {fmtDate(release.dated)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${RELEASE_STAGE[stage].tone}`}>{RELEASE_STAGE[stage].label}</span>
          {plant.data.capabilities.release ? <button type="button" onClick={() => setConfirmDelete(true)} className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50"><Trash2 className="h-4 w-4" /> Delete</button> : null}
          {plant.data.capabilities.intake || plant.data.capabilities.release ? <button type="button" onClick={() => setEditing(true)} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800"><Pencil className="h-4 w-4" /> Edit</button> : null}
          <button type="button" onClick={() => docRef.current && printElement(docRef.current, `Job Release Order ${release.releaseOrderNo}`)} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#0b1f4a] px-3 text-sm font-semibold text-white"><Printer className="h-4 w-4" /> Print / PDF</button>
        </div>
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="overflow-x-auto rounded-2xl bg-slate-100 p-3 sm:p-5">
          <div className="min-w-[640px] shadow-[0_2px_12px_rgba(15,23,42,0.12)]"><ReleaseDocument ref={docRef} release={release} /></div>
        </div>
        <div className="space-y-4 xl:sticky xl:top-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="font-semibold text-slate-950">Sign-off</h2>
            <p className="mt-0.5 text-sm text-slate-500">Recorded in the order printed on the form. Each sign-off is saved to DLE Enterprise.</p>
            <ol className="mt-4 space-y-3">
              {SIGN_OFFS.map((item, index) => {
                const done = release.signOffs[item.role];
                const isNext = item.role === next?.role;
                return (
                  <li key={item.role} className="flex gap-3">
                    <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${done ? 'bg-emerald-600 text-white' : isNext ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>{done ? <Check className="h-3.5 w-3.5" /> : index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-semibold ${done || isNext ? 'text-slate-900' : 'text-slate-400'}`}>{item.label}</p>
                      {done ? (
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm text-slate-600">{done.name}, {done.designation}<span className="block text-xs text-slate-400">{fmtDate(done.date)}</span></p>
                          {canSign(plant.data!, item.role) ? <button type="button" onClick={() => setWithdraw(item.role)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label={`Withdraw ${item.label}`}><Undo2 className="h-4 w-4" /></button> : null}
                        </div>
                      ) : <p className="text-xs text-slate-500">{item.designations.join(' / ')}</p>}
                      {isNext && canSign(plant.data!, item.role) ? <button type="button" onClick={() => setSigning(item.role)} className="mt-2 rounded-lg bg-[#0b1f4a] px-3 py-1.5 text-sm font-semibold text-white">Sign as {item.label.replace(' By', '').toLowerCase()}</button> : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="flex items-center gap-2 font-semibold text-slate-950"><Package className="h-4 w-4 text-slate-400" /> Material record</h2>
            {material ? (
              <div className="mt-3 rounded-xl border border-slate-200 p-3">
                <p className="font-mono text-sm font-semibold text-slate-900">{material.jobNo}</p>
                <p className="truncate text-sm text-slate-500">{material.items}</p>
                <p className="mt-1 text-xs text-slate-500">{material.received ? `Received ${fmtDate(material.received)} · ` : ''}net {kgText(material.net)}</p>
              </div>
            ) : <p className="mt-2 text-sm text-slate-500">Not linked to a material record. Edit the release to link one.</p>}
          </div>
        </div>
      </div>
      {editing ? <ReleaseFormDialog existing={release} initial={draftFrom(release)} data={plant.data} busy={plant.busy} serverError={plant.error} onClose={() => setEditing(false)} onSave={async (draft) => Boolean(await plant.post('save-release', { ...draft, id: release.id }))} /> : null}
      {signing ? <SignDialog role={signing} busy={plant.busy} onClose={() => setSigning(null)} onSign={(name, designation, date) => plant.post('sign-release', { id: release.id, role: signing, name, designation, date }).then((ok) => { if (ok) setSigning(null); })} /> : null}
      {withdraw ? (
        <Modal title="Withdraw sign-off?" text={laterSigned(withdraw) ? 'Sign-offs happen in order, so every later sign-off will be withdrawn too.' : 'The sign-off will be removed from this job release.'} onClose={() => setWithdraw(null)} footer={(
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setWithdraw(null)} className="h-10 rounded-lg px-4 text-sm font-semibold text-slate-600">Cancel</button>
            <button type="button" disabled={plant.busy} onClick={() => void plant.post('revoke-release-sign', { id: release.id, role: withdraw }).then((ok) => { if (ok) setWithdraw(null); })} className="h-10 rounded-lg bg-rose-700 px-4 text-sm font-semibold text-white">Withdraw</button>
          </div>
        )}><span /></Modal>
      ) : null}
      {confirmDelete ? (
        <Modal title="Delete job release?" text={`Job Release Order ${release.releaseOrderNo} will be deleted. The linked material record is kept.`} onClose={() => setConfirmDelete(false)} footer={(
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setConfirmDelete(false)} className="h-10 rounded-lg px-4 text-sm font-semibold text-slate-600">Cancel</button>
            <button type="button" disabled={plant.busy} onClick={() => void plant.post('delete-release', { id: release.id }).then((ok) => { if (ok) router.push('/operations-center/galvanizing/jobs/release'); })} className="h-10 rounded-lg bg-rose-700 px-4 text-sm font-semibold text-white">Delete</button>
          </div>
        )}><span /></Modal>
      ) : null}
    </div>
  );
}

function SignDialog({ role, busy, onClose, onSign }: { role: ReleaseSignRole; busy: boolean; onClose: () => void; onSign: (name: string, designation: string, date: string) => void }) {
  const meta = SIGN_OFFS.find((item) => item.role === role)!;
  const [name, setName] = useState('');
  const [designation, setDesignation] = useState<string>(meta.designations[0]);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [tried, setTried] = useState(false);
  return (
    <Modal title={`${meta.label} — sign-off`} text={meta.purpose} onClose={onClose} footer={(
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="h-10 rounded-lg px-4 text-sm font-semibold text-slate-600">Cancel</button>
        <button type="button" disabled={busy} onClick={() => { setTried(true); if (name.trim() && date) onSign(name.trim(), designation, date); }} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#0b1f4a] px-4 text-sm font-semibold text-white"><Check className="h-4 w-4" /> Record sign-off</button>
      </div>
    )}>
      <div className="space-y-4">
        <TextInput label="Name" value={name} onChange={setName} required error={tried && !name.trim() ? 'Enter the name of the person signing.' : ''} />
        <label className="block"><span className={labelClass}>Designation</span><select value={designation} onChange={(event) => setDesignation(event.target.value)} className={inputClass}>{meta.designations.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <TextInput label="Date" type="date" value={date} onChange={setDate} required />
      </div>
    </Modal>
  );
}
