'use client';

import { useState } from 'react';
import { tenderPost, tenderUpload } from './tender-api';
import { ActingEmployee } from './acting-employee';

const inputClass = 'h-9 rounded-lg border border-slate-200 px-2 text-[12px]';

export function ItemCapture({
  opportunityId,
  kind,
  kinds,
  onSaved,
}: {
  opportunityId: string;
  kind?: string;
  kinds?: string[];
  onSaved: () => void;
}) {
  const [selectedKind, setSelectedKind] = useState(kind || kinds?.[0] || 'TASK');
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [assignee, setAssignee] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await tenderPost({ action: 'item', id: opportunityId, item: { kind: kind || selectedKind, title, details, assignee, dueAt } });
      setTitle('');
      setDetails('');
      setAssignee('');
      setDueAt('');
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The record was not saved.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="mb-3 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-6" onSubmit={(event) => { event.preventDefault(); save(); }}>
      <div className="md:col-span-6"><ActingEmployee /></div>
      {kind ? null : (
        <select value={selectedKind} onChange={(event) => setSelectedKind(event.target.value)} className={inputClass} aria-label="Record type">
          {(kinds || ['TASK']).map((item) => <option key={item}>{item}</option>)}
        </select>
      )}
      <input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Title" className={`${inputClass} md:col-span-2`} />
      <input value={assignee} onChange={(event) => setAssignee(event.target.value)} placeholder="Owner" className={inputClass} />
      <input type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} className={inputClass} aria-label="Due date" />
      <input value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Details" className={inputClass} />
      <button type="submit" disabled={busy} className="h-9 rounded-lg bg-[#2563eb] px-3 text-[12px] font-bold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save to register'}</button>
      {error ? <p className="md:col-span-6 text-[12px] text-rose-600">{error}</p> : null}
    </form>
  );
}

export function LineCapture({ opportunityId, currency = 'NGN', onSaved }: { opportunityId: string; currency?: string; onSaved: () => void }) {
  const [section, setSection] = useState('Direct Cost');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('ea');
  const [unitCost, setUnitCost] = useState('');
  const [markupPct, setMarkupPct] = useState('0');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await tenderPost({ action: 'line', id: opportunityId, line: { section, description, quantity: Number(quantity || 0), unit, unitCost: Number(unitCost || 0), markupPct: Number(markupPct || 0) } });
      setDescription('');
      setUnitCost('');
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The line was not saved.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="mb-3 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-7" onSubmit={(event) => { event.preventDefault(); save(); }}>
      <div className="md:col-span-7"><ActingEmployee /><p className="text-[12px] text-slate-500">Line rates are saved in the bid currency: {currency === 'USD' ? 'USD - US Dollar' : currency === 'NGN' ? 'NGN - Nigerian Naira' : currency}.</p></div>
      <select value={section} onChange={(event) => setSection(event.target.value)} className={inputClass} aria-label="Cost section">
        {['Direct Cost', 'Indirect Cost', 'Preliminaries', 'Contingency', 'Management Fee'].map((item) => <option key={item}>{item}</option>)}
      </select>
      <input required value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description" className={`${inputClass} md:col-span-2`} />
      <input value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="Qty" className={inputClass} aria-label="Quantity" />
      <input value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="Unit" className={inputClass} aria-label="Unit" />
      <input required value={unitCost} onChange={(event) => setUnitCost(event.target.value)} placeholder="Unit rate" className={inputClass} aria-label="Unit rate" />
      <input value={markupPct} onChange={(event) => setMarkupPct(event.target.value)} placeholder="Markup %" className={inputClass} aria-label="Markup percent" />
      <button type="submit" disabled={busy} className="h-9 rounded-lg bg-[#2563eb] px-3 text-[12px] font-bold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save line'}</button>
      {error ? <p className="md:col-span-7 text-[12px] text-rose-600">{error}</p> : null}
    </form>
  );
}

export function SubmissionCapture({ opportunityId, onSaved }: { opportunityId: string; onSaved: () => void }) {
  const [channel, setChannel] = useState('Electronic Portal');
  const [receiptReference, setReceiptReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await tenderPost({ action: 'submission', id: opportunityId, submission: { channel, receiptReference, notes } });
      setReceiptReference('');
      setNotes('');
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The submission was not saved.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="mb-3 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-4" onSubmit={(event) => { event.preventDefault(); save(); }}>
      <div className="md:col-span-4"><ActingEmployee /></div>
      <select value={channel} onChange={(event) => setChannel(event.target.value)} className={inputClass} aria-label="Submission channel">
        {['Electronic Portal', 'Email', 'Courier', 'Hand Delivery'].map((item) => <option key={item}>{item}</option>)}
      </select>
      <input required value={receiptReference} onChange={(event) => setReceiptReference(event.target.value)} placeholder="Receipt / acknowledgement reference" className={inputClass} />
      <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Remarks" className={inputClass} />
      <button type="submit" disabled={busy} className="h-9 rounded-lg bg-[#2563eb] px-3 text-[12px] font-bold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Record submission'}</button>
      {error ? <p className="md:col-span-4 text-[12px] text-rose-600">{error}</p> : null}
    </form>
  );
}

export function DocumentCapture({ opportunityId, category = 'General', onSaved }: { opportunityId: string; category?: string; onSaved: () => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="mb-3">
      <ActingEmployee />
    <label className="mt-2 inline-flex cursor-pointer items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700">
      {busy ? 'Uploading…' : 'Upload document'}
      <input type="file" className="hidden" onChange={(event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setBusy(true);
        setError('');
        tenderUpload(opportunityId, file, category)
          .then(() => onSaved())
          .catch((reason) => setError(reason instanceof Error ? reason.message : 'Upload failed.'))
          .finally(() => setBusy(false));
      }} />
      {error ? <span className="ml-2 font-normal text-rose-600">{error}</span> : null}
    </label>
    </div>
  );
}
