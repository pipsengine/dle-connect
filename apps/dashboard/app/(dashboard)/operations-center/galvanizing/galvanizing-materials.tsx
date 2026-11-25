'use client';

import { Download, FilePlus2, PackagePlus, PackageSearch, Printer, Save, Search, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { fmtDate, formDate } from '@/lib/galvanizing/release-meta';
import type { GalvanizingMaterial, GalvanizingSnapshot, NoWaybillMemo } from '@/lib/galvanizing/types';

type Draft = Omit<GalvanizingMaterial, 'id' | 'createdAt' | 'updatedAt'>;

const inputClass = 'h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-[#0b1f4a] focus:ring-4 focus:ring-[#0b1f4a]/10';
const labelClass = 'mb-1.5 block text-xs font-semibold text-slate-600';
const today = () => new Date().toISOString().slice(0, 10);

const blankMemo = (draft: Pick<Draft, 'dateReceived' | 'vehicleNo' | 'clientName' | 'items'>): NoWaybillMemo => ({
  deliveryNote: '',
  date: draft.dateReceived,
  ticketNumber: '',
  vehicle: draft.vehicleNo,
  deliveryNumber: '',
  clientName: draft.clientName,
  orderNumber: '',
  tripNo: '',
  destination: '',
  product: draft.items,
  driverName: '',
  clientSignatoryName: '',
});

const blankMaterial = (jobNo: string): Draft => ({
  dateReceived: today(),
  clientName: '',
  items: '',
  jobNo,
  weighMethod: 'weighbridge',
  vehicleNo: '',
  grossWeight: null,
  emptyWeight: null,
  directNetWeight: null,
  noWaybill: false,
  noWaybillMemo: null,
});

const netWeight = (material: Pick<Draft, 'weighMethod' | 'grossWeight' | 'emptyWeight' | 'directNetWeight'>) => {
  if (material.weighMethod === 'direct') return material.directNetWeight;
  if (material.grossWeight == null || material.emptyWeight == null || material.emptyWeight >= material.grossWeight) return null;
  return Math.round((material.grossWeight - material.emptyWeight) * 1000) / 1000;
};

const monthKey = (date: string) => (date || '').slice(0, 7);
const monthLabel = (key: string) => {
  const parsed = new Date(`${key}-01T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? key : parsed.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
};
const tonnes = (kg: number) => `${(kg / 1000).toLocaleString('en-NG', { maximumFractionDigits: 3 })} t`;
const num = (value: number | null) => (value == null ? '—' : value.toLocaleString('en-GB', { maximumFractionDigits: 1 }));

const nextJobNo = (materials: GalvanizingMaterial[]) => {
  const seq = materials.reduce((max, material) => {
    const match = material.jobNo.match(/(\d+)$/);
    return Math.max(max, match ? Number(match[1]) : 0);
  }, 0) + 1;
  return String(seq).padStart(3, '0');
};

const clientLoads = (client: string, materials: GalvanizingMaterial[]) => materials
  .filter((item) => item.clientName.trim().toLowerCase() === client.trim().toLowerCase())
  .sort((a, b) => a.dateReceived.localeCompare(b.dateReceived) || a.id - b.id);

const loadNo = (material: GalvanizingMaterial, materials: GalvanizingMaterial[]) => {
  const index = clientLoads(material.clientName, materials).findIndex((item) => item.id === material.id);
  return index < 0 ? '' : String(index + 1);
};

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
        if (!ok) setError(json.error || 'Unable to load the material register.');
        else setData(json.data);
      })
      .catch(() => { if (active) setError('Unable to load the material register.'); });
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

function exportCsv(rows: GalvanizingMaterial[], all: GalvanizingMaterial[]) {
  const head = ['Date', 'Client Name', 'Items', 'Job No/Project Code', 'Vehicle', 'Gr. Wt', 'Emt. Wt', 'Net Wt'];
  const cell = (value: unknown) => {
    const text = value == null ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = rows.map((material) => {
    const direct = material.weighMethod === 'direct';
    return [
      formDate(material.dateReceived),
      `${material.clientName} (${loadNo(material, all)})`,
      material.items,
      material.jobNo,
      direct ? 'Direct measurement' : material.vehicleNo,
      direct ? 'NA' : material.grossWeight,
      direct ? 'NA' : material.emptyWeight,
      netWeight(material),
    ].map(cell).join(',');
  });
  const blob = new Blob([`\uFEFF${[head.join(','), ...lines].join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `Galvanizing-Material-Register_${today()}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

export function MaterialRegister() {
  const plant = usePlant();
  const [query, setQuery] = useState('');
  const [month, setMonth] = useState('all');
  const [editing, setEditing] = useState<Draft & { id?: number } | null>(null);
  const materials = plant.data?.materials || [];
  const months = useMemo(() => [...new Set(materials.map((item) => monthKey(item.dateReceived)))].filter(Boolean).sort().reverse(), [materials]);
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return materials
      .filter((item) => month === 'all' || monthKey(item.dateReceived) === month)
      .filter((item) => !needle || [item.clientName, item.items, item.jobNo, item.vehicleNo].some((value) => value.toLowerCase().includes(needle)))
      .sort((a, b) => b.dateReceived.localeCompare(a.dateReceived) || b.jobNo.localeCompare(a.jobNo));
  }, [materials, query, month]);
  const groups = useMemo(() => {
    const map = new Map<string, GalvanizingMaterial[]>();
    for (const material of rows) {
      const key = monthKey(material.dateReceived) || 'undated';
      map.set(key, [...(map.get(key) || []), material]);
    }
    return [...map.entries()];
  }, [rows]);
  const total = rows.reduce((sum, material) => sum + (netWeight(material) || 0), 0);
  const canEdit = Boolean(plant.data && (plant.data.capabilities.intake || plant.data.capabilities.release));
  const releaseFor = new Map((plant.data?.releases || []).filter((item) => item.materialRegisterId > 0).map((item) => [item.materialRegisterId, item]));
  if (!plant.data && !plant.error) return <div className="rounded-2xl border border-slate-200 bg-white p-10 text-sm text-slate-500">Loading the material register…</div>;
  return (
    <div className="space-y-6">
      {plant.notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{plant.notice}</div> : null}
      {plant.error && !editing ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{plant.error}</div> : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Jobs and intake</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Material Register</h1>
          <p className="mt-2 text-sm text-slate-600">Material received for galvanizing: date, client, items, job no., vehicle and weights.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => rows.length && exportCsv(rows, materials)} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800"><Download className="h-4 w-4" /> Export CSV</button>
          <button type="button" disabled={!canEdit} onClick={() => setEditing(blankMaterial(nextJobNo(materials)))} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#0b1f4a] px-4 text-sm font-semibold text-white disabled:opacity-40"><PackagePlus className="h-4 w-4" /> Register Material</button>
        </div>
      </div>
      <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search client, items, job no., vehicle…" className={`${inputClass} pl-10`} />
        </label>
        <select aria-label="Month received" value={month} onChange={(event) => setMonth(event.target.value)} className={inputClass}>
          <option value="all">All months</option>
          {months.map((key) => <option key={key} value={key}>{monthLabel(key)}</option>)}
        </select>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {rows.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <PackageSearch className="mx-auto h-7 w-7 text-slate-400" />
            <h2 className="mt-3 text-base font-semibold text-slate-950">{query || month !== 'all' ? 'No material matches your search' : 'No material registered yet'}</h2>
            <p className="mt-1 text-sm text-slate-500">{query || month !== 'all' ? 'Try a different search or month.' : 'Register the first load received for galvanizing.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Date</th><th className="px-4 py-3">Client name</th><th className="px-4 py-3">Items</th><th className="px-4 py-3">Job no. / project code</th><th className="px-4 py-3">Vehicle</th><th className="px-3 py-3 text-right">Gr. wt</th><th className="px-3 py-3 text-right">Emt. wt</th><th className="px-3 py-3 text-right">Net wt</th><th className="px-4 py-3">Job release</th>
                </tr>
              </thead>
              {groups.map(([key, list]) => {
                const monthTotal = list.reduce((sum, material) => sum + (netWeight(material) || 0), 0);
                return (
                  <tbody key={key} className="divide-y divide-slate-100 border-b border-slate-200">
                    <tr className="bg-slate-50/60"><th colSpan={9} className="px-4 py-2 text-left text-xs font-bold uppercase tracking-wide text-slate-700">{monthLabel(key)}</th></tr>
                    {list.map((material) => {
                      const direct = material.weighMethod === 'direct';
                      const release = releaseFor.get(material.id);
                      return (
                        <tr key={material.id} className="cursor-pointer hover:bg-slate-50" onClick={() => canEdit && setEditing({ ...material })}>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-600">{fmtDate(material.dateReceived)}</td>
                          <td className="max-w-[220px] truncate px-4 py-3 font-medium text-slate-900">{material.clientName} <span className="font-normal text-slate-400">({loadNo(material, materials)})</span></td>
                          <td className="max-w-[260px] truncate px-4 py-3 text-slate-700">{material.items}</td>
                          <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold text-slate-800">{material.jobNo}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-600">{direct ? <span className="text-xs italic">Direct measurement</span> : material.vehicleNo}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-600">{direct ? 'NA' : num(material.grossWeight)}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-600">{direct ? 'NA' : num(material.emptyWeight)}</td>
                          <td className="px-3 py-3 text-right font-semibold tabular-nums text-slate-900">{num(netWeight(material))}</td>
                          <td className="whitespace-nowrap px-4 py-3" onClick={(event) => event.stopPropagation()}>
                            {release ? <Link href={`/operations-center/galvanizing/jobs/release/${release.id}`} className="font-medium text-blue-700">{release.releaseOrderNo}</Link> : <Link href={`/operations-center/galvanizing/jobs/release?material=${material.id}`} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 hover:text-blue-700"><FilePlus2 className="h-3.5 w-3.5" /> Create</Link>}
                          </td>
                        </tr>
                      );
                    })}
                    <tr>
                      <td colSpan={7} className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500">Total received for {monthLabel(key)} · {list.length} load{list.length === 1 ? '' : 's'}</td>
                      <td className="px-3 py-2.5 text-right font-bold tabular-nums">{monthTotal.toLocaleString('en-GB')}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">{tonnes(monthTotal)}</td>
                    </tr>
                  </tbody>
                );
              })}
              {groups.length > 1 ? (
                <tfoot>
                  <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                    <td colSpan={7} className="px-4 py-3 text-right">Total · {rows.length} loads</td>
                    <td className="px-3 py-3 text-right tabular-nums">{total.toLocaleString('en-GB')}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{tonnes(total)}</td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        )}
      </div>
      <p className="text-xs text-slate-400">Weights in kg.</p>
      {editing && plant.data ? (
        <MaterialDialog
          initial={editing}
          materials={materials}
          releaseNo={editing.id ? releaseFor.get(editing.id)?.releaseOrderNo : ''}
          releaseId={editing.id ? releaseFor.get(editing.id)?.id : 0}
          busy={plant.busy}
          serverError={plant.error}
          onClose={() => setEditing(null)}
          onSave={(draft) => plant.post('save-material', draft).then((saved) => Boolean(saved))}
          onDelete={editing.id ? () => plant.post('delete-material', { id: editing.id }).then((saved) => Boolean(saved)) : undefined}
        />
      ) : null}
    </div>
  );
}

function MaterialDialog({ initial, materials, releaseNo, releaseId, busy, serverError, onClose, onSave, onDelete }: {
  initial: Draft & { id?: number };
  materials: GalvanizingMaterial[];
  releaseNo?: string;
  releaseId?: number;
  busy: boolean;
  serverError: string;
  onClose: () => void;
  onSave: (draft: Draft & { id?: number }) => Promise<boolean>;
  onDelete?: () => Promise<boolean>;
}) {
  const router = useRouter();
  const [start] = useState(initial);
  const [draft, setDraft] = useState<Draft & { id?: number }>({ ...initial, noWaybillMemo: initial.noWaybill ? initial.noWaybillMemo || blankMemo(initial) : null });
  const [submitted, setSubmitted] = useState(false);
  const [confirm, setConfirm] = useState<'delete' | 'discard' | null>(null);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const others = materials.filter((item) => item.id !== initial.id);
  const errors = {
    dateReceived: !draft.dateReceived ? 'Enter the date received.' : draft.dateReceived > today() ? 'The date received cannot be in the future.' : '',
    clientName: !draft.clientName.trim() ? 'Enter the client name.' : '',
    items: !draft.items.trim() ? 'Describe the items received.' : '',
    jobNo: !draft.jobNo.trim() ? 'Enter the job no./project code.' : others.some((item) => item.jobNo.trim().toUpperCase() === draft.jobNo.trim().toUpperCase()) ? 'This job no. is already registered.' : '',
    vehicleNo: draft.weighMethod === 'weighbridge' && !draft.vehicleNo.trim() ? 'Enter the vehicle registration.' : '',
    grossWeight: draft.weighMethod === 'weighbridge' && draft.grossWeight == null ? 'Enter the gross weight.' : '',
    emptyWeight: draft.weighMethod === 'weighbridge' && draft.emptyWeight == null ? 'Enter the empty weight.' : draft.weighMethod === 'weighbridge' && draft.grossWeight != null && draft.emptyWeight != null && draft.emptyWeight >= draft.grossWeight ? 'Empty weight must be less than the gross weight.' : '',
    directNetWeight: draft.weighMethod === 'direct' && !(draft.directNetWeight && draft.directNetWeight > 0) ? 'Enter the measured net weight.' : '',
  };
  const shown = submitted ? errors : { dateReceived: '', clientName: '', items: '', jobNo: '', vehicleNo: '', grossWeight: '', emptyWeight: '', directNetWeight: '' };
  const dirty = JSON.stringify(draft) !== JSON.stringify(start);
  const clients = [...new Set(materials.map((item) => item.clientName))].filter(Boolean).sort((a, b) => a.localeCompare(b));
  const saved = initial.id ? materials.find((item) => item.id === initial.id) : undefined;
  const sameClient = Boolean(saved && saved.clientName.trim().toLowerCase() === draft.clientName.trim().toLowerCase());
  const nextLoad = !draft.clientName.trim() ? '' : sameClient && saved ? loadNo(saved, materials) : String(clientLoads(draft.clientName, others).length + 1);
  const requestClose = () => {
    if (confirm) { setConfirm(null); return; }
    if (dirty) setConfirm('discard');
    else onClose();
  };
  const save = async () => {
    setSubmitted(true);
    if (Object.values(errors).some(Boolean)) return;
    const clean: Draft & { id?: number } = {
      ...draft,
      clientName: draft.clientName.trim(),
      items: draft.items.trim(),
      jobNo: draft.jobNo.trim().toUpperCase(),
      noWaybill: draft.noWaybill,
      noWaybillMemo: draft.noWaybill ? draft.noWaybillMemo || blankMemo(draft) : null,
      ...(draft.weighMethod === 'weighbridge' ? { directNetWeight: null } : { vehicleNo: '', grossWeight: null, emptyWeight: null }),
    };
    if (await onSave(clean)) onClose();
  };
  return (
    <Modal title={initial.id ? `Material ${initial.jobNo}` : 'Register Material'} text={initial.id ? initial.clientName : 'Record material received for galvanizing.'} wide={draft.noWaybill} onClose={requestClose} footer={(
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          {onDelete ? <button type="button" onClick={() => setConfirm('delete')} className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50"><Trash2 className="h-4 w-4" /> Delete</button> : null}
          {initial.id && releaseId ? <button type="button" onClick={() => router.push(`/operations-center/galvanizing/jobs/release/${releaseId}`)} className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-semibold">Job Release {releaseNo}</button> : null}
          {initial.id && !releaseId ? <button type="button" disabled={dirty} onClick={() => router.push(`/operations-center/galvanizing/jobs/release?material=${initial.id}`)} className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-semibold disabled:opacity-40">Create Job Release</button> : null}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={requestClose} className="h-10 rounded-lg px-4 text-sm font-semibold text-slate-600">Cancel</button>
          <button type="button" disabled={busy || (Boolean(initial.id) && !dirty)} onClick={() => void save()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#0b1f4a] px-4 text-sm font-semibold text-white disabled:opacity-40"><Save className="h-4 w-4" />{initial.id ? 'Save changes' : 'Register material'}</button>
        </div>
      </div>
    )}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date received" type="date" value={draft.dateReceived} onChange={(value) => set('dateReceived', value)} required error={shown.dateReceived} />
        <Field label="Job No. / Project Code" value={draft.jobNo} onChange={(value) => set('jobNo', value.toUpperCase())} required error={shown.jobNo} hint="Next number is filled in for you" />
        <label className="block sm:col-span-2">
          <span className={labelClass}>Client name *</span>
          <input list="galv-material-clients" value={draft.clientName} onChange={(event) => set('clientName', event.target.value)} className={inputClass} />
          <datalist id="galv-material-clients">{clients.map((client) => <option key={client} value={client} />)}</datalist>
          {shown.clientName ? <span className="mt-1 block text-xs font-medium text-rose-700">{shown.clientName}</span> : <span className="mt-1 block text-xs text-slate-500">{draft.clientName.trim() ? `Load no. ${nextLoad} for this client` : 'Pick an existing client or type a new one'}</span>}
        </label>
        <Field label="Items" value={draft.items} onChange={(value) => set('items', value)} required error={shown.items} placeholder="e.g. Black angle iron" className="sm:col-span-2" />
      </div>
      <div className="mt-5 rounded-xl border border-slate-200 p-4">
        <div className="flex gap-2" role="group" aria-label="Weighing">
          {(['weighbridge', 'direct'] as const).map((method) => (
            <button key={method} type="button" onClick={() => set('weighMethod', method)} className={`h-10 rounded-lg px-4 text-sm font-semibold ${draft.weighMethod === method ? 'bg-[#0b1f4a] text-white' : 'bg-slate-100 text-slate-700'}`}>{method === 'weighbridge' ? 'Weighbridge' : 'Direct measurement'}</button>
          ))}
        </div>
        {draft.weighMethod === 'weighbridge' ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Vehicle" value={draft.vehicleNo} onChange={(value) => set('vehicleNo', value.toUpperCase())} required error={shown.vehicleNo} placeholder="e.g. LND 167 XZ" />
            <Weight label="Gross weight" value={draft.grossWeight} onChange={(value) => set('grossWeight', value)} error={shown.grossWeight} />
            <Weight label="Empty weight" value={draft.emptyWeight} onChange={(value) => set('emptyWeight', value)} error={shown.emptyWeight} />
            <div><div className={labelClass}>Net weight</div><div className="flex h-11 items-center rounded-lg bg-slate-50 px-3 text-sm font-semibold text-slate-900">{netWeight(draft) == null ? '—' : `${netWeight(draft)} kg`}</div><p className="mt-1 text-xs text-slate-500">Gross − empty</p></div>
          </div>
        ) : (
          <div className="mt-4 max-w-sm"><Weight label="Net weight" value={draft.directNetWeight} onChange={(value) => set('directNetWeight', value)} error={shown.directNetWeight} hint="Measured directly, without the weighbridge" /></div>
        )}
      </div>
      <label className="mt-5 flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={draft.noWaybill} onChange={(event) => setDraft((current) => ({ ...current, noWaybill: event.target.checked, noWaybillMemo: event.target.checked ? current.noWaybillMemo || blankMemo(current) : null }))} /> No waybill</label>
      {draft.noWaybill && draft.noWaybillMemo ? <MemoFields memo={draft.noWaybillMemo} onChange={(memo) => set('noWaybillMemo', memo)} /> : null}
      {serverError ? <p className="mt-3 text-sm font-medium text-rose-700">{serverError}</p> : null}
      {confirm ? (
        <Modal title={confirm === 'delete' ? 'Delete registration?' : 'Discard changes?'} text={confirm === 'delete' ? `${initial.jobNo} will be removed from the register. A linked job release is kept, but it will no longer point at this material.` : 'What you entered for this material will be lost.'} onClose={() => setConfirm(null)} footer={(
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setConfirm(null)} className="h-10 rounded-lg px-4 text-sm font-semibold text-slate-600">Cancel</button>
            <button type="button" onClick={() => { if (confirm === 'discard') onClose(); else void onDelete?.().then((ok) => { if (ok) onClose(); }); }} className="h-10 rounded-lg bg-rose-700 px-4 text-sm font-semibold text-white">{confirm === 'delete' ? 'Delete' : 'Discard'}</button>
          </div>
        )}><span /></Modal>
      ) : null}
    </Modal>
  );
}

function MemoFields({ memo, onChange }: { memo: NoWaybillMemo; onChange: (memo: NoWaybillMemo) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const set = <K extends keyof NoWaybillMemo>(key: K, value: NoWaybillMemo[K]) => onChange({ ...memo, [key]: value });
  return (
    <section className="mt-4 rounded-xl border border-blue-200 bg-blue-50/30 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">No-waybill memo</h3>
          <p className="mt-0.5 text-sm text-slate-500">Complete the memo for this material registration.</p>
        </div>
        <button type="button" onClick={() => ref.current && printMemo(ref.current)} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold"><Printer className="h-4 w-4" /> Print memo</button>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="grid content-start gap-4 sm:grid-cols-2">
          <Field label="Delivery note" value={memo.deliveryNote} onChange={(value) => set('deliveryNote', value)} />
          <Field label="Date" type="date" value={memo.date} onChange={(value) => set('date', value)} />
          <Field label="Ticket number" value={memo.ticketNumber} onChange={(value) => set('ticketNumber', value)} />
          <Field label="Vehicle" value={memo.vehicle} onChange={(value) => set('vehicle', value)} />
          <Field label="Delivery number" value={memo.deliveryNumber} onChange={(value) => set('deliveryNumber', value)} />
          <Field label="Client name" value={memo.clientName} onChange={(value) => set('clientName', value)} />
          <Field label="Order number" value={memo.orderNumber} onChange={(value) => set('orderNumber', value)} />
          <Field label="Trip number" value={memo.tripNo} onChange={(value) => set('tripNo', value)} />
          <Field label="Destination" value={memo.destination} onChange={(value) => set('destination', value)} className="sm:col-span-2" />
          <Field label="Driver name" value={memo.driverName} onChange={(value) => set('driverName', value)} />
          <Field label="Client signatory name" value={memo.clientSignatoryName} onChange={(value) => set('clientSignatoryName', value)} />
          <p className="text-sm text-slate-500 sm:col-span-2">Verifier: Anthony Nwaefi. Signature lines are left blank for signing on the printed copy.</p>
          <label className="block sm:col-span-2"><span className={labelClass}>Product</span><textarea rows={3} value={memo.product} onChange={(event) => set('product', event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0b1f4a]" /></label>
        </div>
        <div className="overflow-x-auto rounded-xl bg-slate-100 p-3"><MemoSheet sheetRef={ref} memo={memo} /></div>
      </div>
    </section>
  );
}

function MemoSheet({ memo, sheetRef }: { memo: NoWaybillMemo; sheetRef: RefObject<HTMLDivElement | null> }) {
  return (
  <div ref={sheetRef} className="memo-sheet mx-auto min-h-[560px] w-full max-w-[794px] border border-black bg-white p-6 font-[Arial,Helvetica,sans-serif] text-[13px] leading-relaxed text-black">
    <h2 className="mb-8 text-center text-[16px] font-bold uppercase">Memorandum for Client Without Waybill for Toll Galvanizing</h2>
    <div className="space-y-4">
      <MemoLine label="Delivery note:" value={memo.deliveryNote} />
      <div className="grid grid-cols-2 gap-4">
        <MemoLine label="Date:" value={formDate(memo.date)} />
        <MemoLine label="Ticket Number:" value={memo.ticketNumber} />
        <MemoLine label="Vehicle:" value={memo.vehicle} />
        <MemoLine label="Delivery Number:" value={memo.deliveryNumber} />
        <MemoLine label="Client Name:" value={memo.clientName} />
        <MemoLine label="Order Number:" value={memo.orderNumber} />
      </div>
      <MemoLine label="Trip No:" value={memo.tripNo} />
      <MemoLine label="Destination:" value={memo.destination} />
      <MemoLine label="Product:" value={memo.product} />
    </div>
    <div className="mt-10 grid grid-cols-2 gap-4">
      <MemoLine label="Driver Name:" value={memo.driverName} />
      <MemoLine label="Signature:" value="" />
      <MemoLine label="Client Name:" value={memo.clientSignatoryName} />
      <MemoLine label="Signature:" value="" />
      <MemoLine label="Verifier Name:" value="Anthony Nwaefi" />
      <MemoLine label="Signature:" value="" />
    </div>
  </div>
  );
}

function MemoLine({ label, value }: { label: string; value: string }) {
  return <div className="flex min-w-0 items-end gap-2"><span className="shrink-0 font-medium">{label}</span><span className="min-h-6 flex-1 border-b border-black px-1 font-semibold">{value || '\u00a0'}</span></div>;
}

function printMemo(element: HTMLElement) {
  const frame = document.createElement('iframe');
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc || !frame.contentWindow) return;
  doc.open();
  doc.write(`<!doctype html><html><head><title>No-waybill galvanizing memo</title><style>@page{size:A4;margin:12mm}body{margin:0;font-family:Arial,sans-serif}</style></head><body>${element.outerHTML}</body></html>`);
  doc.close();
  setTimeout(() => { frame.contentWindow?.print(); setTimeout(() => frame.remove(), 1000); }, 200);
}

function Field({ label, value, onChange, type = 'text', required, error, hint, placeholder, className = '' }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; error?: string; hint?: string; placeholder?: string; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className={labelClass}>{label}{required ? ' *' : ''}</span>
      <input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className={inputClass} />
      {error ? <span className="mt-1 block text-xs font-medium text-rose-700">{error}</span> : hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

function Weight({ label, value, onChange, error, hint }: { label: string; value: number | null; onChange: (value: number | null) => void; error?: string; hint?: string }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <input type="number" min="0" step="0.001" value={value ?? ''} onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))} className={inputClass} />
      {error ? <span className="mt-1 block text-xs font-medium text-rose-700">{error}</span> : hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
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
      <div role="dialog" aria-modal="true" className={`relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ${wide ? 'max-w-6xl' : 'max-w-3xl'}`}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div><h2 className="text-lg font-semibold text-slate-950">{title}</h2>{text ? <p className="mt-1 text-sm text-slate-600">{text}</p> : null}</div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100">Close</button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {footer ? <div className="border-t border-slate-100 px-6 py-4">{footer}</div> : null}
      </div>
    </div>
  );
}
