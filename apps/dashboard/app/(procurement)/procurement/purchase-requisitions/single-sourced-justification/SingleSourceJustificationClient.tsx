'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Loader2, Plus, RefreshCw, RotateCcw, Send, XCircle } from 'lucide-react';
import { procurementGet, procurementPost } from '../../lib/procurement-api';
import { PROCUREMENT_CURRENCIES } from '@/lib/procurement/catalog';
import { DepartmentLookup, LocationLookup, ProjectLookup } from '../../_components/proc-lookups';
import { SSJ_REASON_CATEGORIES, type SsjRecord } from '@/lib/procurement/ssj-types';
import {
  FilterBar,
  KpiCard,
  ProcModal,
  RegisterTable,
  StatusBadge,
  exportCsv,
  formatWhen,
  inputClass,
  labelClass,
  moneyPlain,
  primaryBtnClass,
  secondaryBtnClass,
  selectClass,
} from '../../_components/proc-ui';

type LookupPayload = {
  records: SsjRecord[];
  suppliers: Array<{ supplierId: string; name: string }>;
  requisitions: Array<{
    prId: string;
    title: string;
    department: string;
    project: string;
    status: string;
    currency: string;
    estimatedAmount: number;
  }>;
};

type FormState = {
  ssjId: string;
  prId: string;
  title: string;
  department: string;
  project: string;
  site: string;
  supplierId: string;
  supplierName: string;
  currency: string;
  estimatedAmount: string;
  reasonCategory: string;
  justification: string;
  alternativesConsidered: string;
  marketSearch: string;
  technicalBasis: string;
  consequence: string;
};

const emptyForm = (): FormState => ({
  ssjId: '',
  prId: '',
  title: '',
  department: '',
  project: '',
  site: '',
  supplierId: '',
  supplierName: '',
  currency: 'NGN',
  estimatedAmount: '',
  reasonCategory: SSJ_REASON_CATEGORIES[0],
  justification: '',
  alternativesConsidered: '',
  marketSearch: '',
  technicalBasis: '',
  consequence: '',
});

const formFromRecord = (row: SsjRecord): FormState => ({
  ssjId: row.ssjId,
  prId: row.prId || '',
  title: row.title || '',
  department: row.department || '',
  project: row.project || '',
  site: row.site || '',
  supplierId: row.supplierId || '',
  supplierName: row.supplierName || '',
  currency: row.currency || 'NGN',
  estimatedAmount: row.estimatedAmount ? String(row.estimatedAmount) : '',
  reasonCategory: row.reasonCategory || SSJ_REASON_CATEGORIES[0],
  justification: row.justification || '',
  alternativesConsidered: row.alternativesConsidered || '',
  marketSearch: row.marketSearch || '',
  technicalBasis: row.technicalBasis || '',
  consequence: row.consequence || '',
});

const STEPS = [
  { key: 'Requester', label: 'Requester' },
  { key: 'Line Manager', label: 'Checked by Line Manager' },
  { key: 'Managing Director', label: 'Approved by MD' },
];

const stepIndex = (status: string, stage: string) => {
  if (status === 'Approved') return 3;
  if (status === 'Pending MD' || (status === 'Rejected' && stage === 'Managing Director')) return 2;
  if (status === 'Pending Line Manager' || (status === 'Rejected' && stage === 'Line Manager')) return 1;
  return 0;
};

export function SingleSourceJustificationClient() {
  const searchParams = useSearchParams();
  const requestedId = searchParams.get('id') || '';
  const openedFromQuery = useRef(false);
  const [payload, setPayload] = useState<LookupPayload>({ records: [], suppliers: [], requisitions: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [comment, setComment] = useState('');
  const [active, setActive] = useState<SsjRecord | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await procurementGet<LookupPayload>('single-source-justifications');
      setPayload(data);
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load justifications');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (openedFromQuery.current || !requestedId || !payload.records.length) return;
    const match = payload.records.find((row) => row.ssjId === requestedId);
    if (!match) return;
    openedFromQuery.current = true;
    setActive(match);
    setForm(formFromRecord(match));
    setComment('');
    setOpen(true);
  }, [payload.records, requestedId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payload.records.filter((row) => {
      if (statusFilter !== 'All' && row.status !== statusFilter) return false;
      if (!q) return true;
      return [row.ssjId, row.title, row.supplierName, row.requesterName, row.prId, row.currentWith, row.status]
        .some((value) => String(value || '').toLowerCase().includes(q));
    });
  }, [payload.records, search, statusFilter]);

  const counts = useMemo(() => {
    const of = (status: string) => payload.records.filter((row) => row.status === status).length;
    return {
      total: payload.records.length,
      draft: of('Draft') + of('Returned'),
      line: of('Pending Line Manager'),
      md: of('Pending MD'),
      approved: of('Approved'),
      rejected: of('Rejected'),
    };
  }, [payload.records]);

  const openCreate = () => {
    setActive(null);
    setForm(emptyForm());
    setComment('');
    setError('');
    setOpen(true);
  };

  const openRow = (row: SsjRecord) => {
    setActive(row);
    setForm(formFromRecord(row));
    setComment('');
    setError('');
    setOpen(true);
  };

  const payloadBody = () => ({
    payload: {
      ...form,
      estimatedAmount: Number(form.estimatedAmount || 0),
    },
  });

  const refreshOpen = async (id?: string) => {
    const data = await load();
    const nextId = id || form.ssjId;
    const match = data?.records.find((row) => row.ssjId === nextId);
    if (match) {
      setActive(match);
      setForm(formFromRecord(match));
    }
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const saved = await procurementPost<SsjRecord>('upsert-ssj', payloadBody());
      await refreshOpen(saved.ssjId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      const saved = await procurementPost<SsjRecord>('submit-ssj', { ...payloadBody(), comment });
      setComment('');
      await refreshOpen(saved.ssjId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submit failed');
    } finally {
      setSaving(false);
    }
  };

  const act = async (decision: 'check' | 'approve' | 'return' | 'reject') => {
    if (!active) return;
    if ((decision === 'return' || decision === 'reject') && !comment.trim()) {
      setError(decision === 'return' ? 'Add a comment before returning this justification.' : 'Add a comment before rejecting this justification.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const saved = await procurementPost<SsjRecord>('action-ssj', {
        payload: { ssjId: active.ssjId, decision, comment },
      });
      setComment('');
      await refreshOpen(saved.ssjId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setSaving(false);
    }
  };

  const onPrChange = (prId: string) => {
    const pr = payload.requisitions.find((row) => row.prId === prId);
    setForm((current) => ({
      ...current,
      prId,
      department: current.department || pr?.department || '',
      project: current.project || pr?.project || '',
      currency: current.currency || pr?.currency || 'NGN',
      estimatedAmount: current.estimatedAmount || (pr?.estimatedAmount ? String(pr.estimatedAmount) : ''),
      title: current.title || pr?.title || '',
    }));
  };

  const locked = Boolean(active && !active.actions.canEdit);
  const current = active?.status || 'Draft';
  const reached = stepIndex(current, active?.currentStage || 'Requester');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Purchase Requisitions</p>
          <h1 className="mt-1 text-2xl font-black text-slate-900">Single Sourced Justification</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Record why a requirement should be awarded without competition. Completed justifications follow Requester, then Checked by Line Manager, then Approved by MD. The live status appears on Approvals & Work Queue.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void load()} className={secondaryBtnClass}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <button type="button" onClick={openCreate} className={primaryBtnClass}>
            <Plus className="h-4 w-4" /> New justification
          </button>
        </div>
      </div>
      {error && !open ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <KpiCard label="Total" value={counts.total} />
        <KpiCard label="Draft / Returned" value={counts.draft} />
        <KpiCard label="With Line Manager" value={counts.line} />
        <KpiCard label="With MD" value={counts.md} />
        <KpiCard label="Approved" value={counts.approved} />
        <KpiCard label="Rejected" value={counts.rejected} />
      </div>
      <FilterBar>
        <div className="min-w-[220px] flex-1">
          <label className={labelClass}>Search</label>
          <input className={inputClass} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="SSJ no, title, supplier, requester…" />
        </div>
        <div className="min-w-[180px]">
          <label className={labelClass}>Status</label>
          <select className={selectClass} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            {['All', 'Draft', 'Pending Line Manager', 'Pending MD', 'Approved', 'Returned', 'Rejected'].map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </div>
      </FilterBar>
      <RegisterTable
        title="Single sourced justifications"
        count={filtered.length}
        onExport={() =>
          exportCsv(
            'single-sourced-justifications.csv',
            ['SSJ', 'Title', 'PR', 'Supplier', 'Status', 'Stage', 'Current with', 'Amount', 'Updated'],
            filtered.map((row) => [row.ssjId, row.title, row.prId, row.supplierName, row.status, row.currentStage, row.currentWith, row.estimatedAmount, formatWhen(row.updatedAt)]),
          )
        }
      >
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading from DLE_Enterprise…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  {['SSJ no', 'Title', 'Supplier', 'Requester', 'Status', 'Current with', 'Estimate', 'Updated'].map((heading) => (
                    <th key={heading} className="px-3 py-3 text-left">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.ssjId} className="border-t border-slate-100 hover:bg-slate-50/80">
                    <td className="px-3 py-3">
                      <button type="button" onClick={() => openRow(row)} className="font-semibold text-blue-700 hover:underline">{row.ssjId}</button>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-semibold text-slate-900">{row.title}</div>
                      <div className="text-xs text-slate-500">{row.prId || 'No linked PR'} · {row.department || '—'}</div>
                    </td>
                    <td className="px-3 py-3">{row.supplierName || '—'}</td>
                    <td className="px-3 py-3">{row.requesterName || '—'}</td>
                    <td className="px-3 py-3"><StatusBadge status={row.status} /></td>
                    <td className="px-3 py-3">{row.currentWith || '—'}</td>
                    <td className="px-3 py-3 tabular-nums">{moneyPlain(row.estimatedAmount, row.currency)}</td>
                    <td className="px-3 py-3 text-slate-600">{formatWhen(row.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length ? <div className="py-12 text-center text-sm text-slate-500">No single sourced justifications yet.</div> : null}
          </div>
        )}
      </RegisterTable>

      <ProcModal
        open={open}
        extraWide
        title={active ? active.ssjId : 'New single sourced justification'}
        subtitle="Requester submits. Line manager checks. Managing Director approves."
        onClose={() => setOpen(false)}
        footer={
          <>
            <button type="button" className={secondaryBtnClass} onClick={() => setOpen(false)}>Close</button>
            {!locked ? (
              <button type="button" className={secondaryBtnClass} disabled={saving} onClick={() => void save()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save draft
              </button>
            ) : null}
            {(!active || active.actions.canSubmit) ? (
              <button type="button" className={primaryBtnClass} disabled={saving} onClick={() => void submit()}>
                <Send className="h-4 w-4" /> Submit
              </button>
            ) : null}
            {active?.actions.canCheck ? (
              <button type="button" className={primaryBtnClass} disabled={saving} onClick={() => void act('check')}>
                <CheckCircle2 className="h-4 w-4" /> Check
              </button>
            ) : null}
            {active?.actions.canApprove ? (
              <button type="button" className={primaryBtnClass} disabled={saving} onClick={() => void act('approve')}>
                <CheckCircle2 className="h-4 w-4" /> Approve
              </button>
            ) : null}
            {active?.actions.canReturn ? (
              <button type="button" className={secondaryBtnClass} disabled={saving} onClick={() => void act('return')}>
                <RotateCcw className="h-4 w-4" /> Return
              </button>
            ) : null}
            {active?.actions.canReject ? (
              <button type="button" className="inline-flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 hover:bg-red-50" disabled={saving} onClick={() => void act('reject')}>
                <XCircle className="h-4 w-4" /> Reject
              </button>
            ) : null}
          </>
        }
      >
        {error && open ? <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
        <ol className="mb-5 grid gap-2 sm:grid-cols-3">
          {STEPS.map((step, index) => {
            const done = reached > index;
            const currentStep = reached === index && current !== 'Approved';
            return (
              <li key={step.key} className={`rounded-xl border px-3 py-2 ${done ? 'border-emerald-200 bg-emerald-50' : currentStep ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-slate-50'}`}>
                <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Step {index + 1}</div>
                <div className="text-sm font-semibold text-slate-900">{step.label}</div>
                <div className="text-xs text-slate-500">{done ? 'Complete' : currentStep ? current : 'Waiting'}</div>
              </li>
            );
          })}
        </ol>
        <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelClass}>Linked purchase requisition</label>
              <select className={selectClass} value={form.prId} disabled={locked} onChange={(e) => onPrChange(e.target.value)}>
                <option value="">None</option>
                {payload.requisitions.map((pr) => (
                  <option key={pr.prId} value={pr.prId}>{pr.prId} — {pr.title}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Title *</label>
              <input className={inputClass} value={form.title} disabled={locked} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <DepartmentLookup value={form.department} disabled={locked} onChange={(name) => setForm((f) => ({ ...f, department: name }))} />
            <ProjectLookup value={form.project} disabled={locked} onChange={(value) => setForm((f) => ({ ...f, project: value }))} />
            <LocationLookup label="Site" value={form.site} disabled={locked} onChange={(name) => setForm((f) => ({ ...f, site: name }))} />
            <div>
              <label className={labelClass}>Reason *</label>
              <select className={selectClass} value={form.reasonCategory} disabled={locked} onChange={(e) => setForm((f) => ({ ...f, reasonCategory: e.target.value }))}>
                {SSJ_REASON_CATEGORIES.map((reason) => <option key={reason}>{reason}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Supplier directory</label>
              <select
                className={selectClass}
                value={form.supplierId}
                disabled={locked}
                onChange={(e) => {
                  const supplier = payload.suppliers.find((row) => row.supplierId === e.target.value);
                  setForm((f) => ({ ...f, supplierId: e.target.value, supplierName: supplier?.name || f.supplierName }));
                }}
              >
                <option value="">Select or type below</option>
                {payload.suppliers.map((supplier) => (
                  <option key={supplier.supplierId} value={supplier.supplierId}>{supplier.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Proposed supplier *</label>
              <input className={inputClass} value={form.supplierName} disabled={locked} onChange={(e) => setForm((f) => ({ ...f, supplierName: e.target.value, supplierId: '' }))} />
            </div>
            <div>
              <label className={labelClass}>Currency</label>
              <select className={selectClass} value={form.currency} disabled={locked} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}>
                {PROCUREMENT_CURRENCIES.map((currency) => <option key={currency}>{currency}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Estimated amount *</label>
              <input className={inputClass} type="number" min="0" step="0.01" value={form.estimatedAmount} disabled={locked} onChange={(e) => setForm((f) => ({ ...f, estimatedAmount: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Justification *</label>
              <textarea className="min-h-28 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" value={form.justification} disabled={locked} onChange={(e) => setForm((f) => ({ ...f, justification: e.target.value }))} placeholder="Why competition is not practical for this requirement." />
            </div>
            <div>
              <label className={labelClass}>Alternatives considered</label>
              <textarea className="min-h-24 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" value={form.alternativesConsidered} disabled={locked} onChange={(e) => setForm((f) => ({ ...f, alternativesConsidered: e.target.value }))} />
            </div>
            <div>
              <label className={labelClass}>Market search</label>
              <textarea className="min-h-24 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" value={form.marketSearch} disabled={locked} onChange={(e) => setForm((f) => ({ ...f, marketSearch: e.target.value }))} />
            </div>
            <div>
              <label className={labelClass}>Technical basis</label>
              <textarea className="min-h-24 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" value={form.technicalBasis} disabled={locked} onChange={(e) => setForm((f) => ({ ...f, technicalBasis: e.target.value }))} />
            </div>
            <div>
              <label className={labelClass}>Consequence if not approved</label>
              <textarea className="min-h-24 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" value={form.consequence} disabled={locked} onChange={(e) => setForm((f) => ({ ...f, consequence: e.target.value }))} />
            </div>
            {active && (active.actions.canCheck || active.actions.canApprove || active.actions.canReturn) ? (
              <div className="sm:col-span-2">
                <label className={labelClass}>Approval comment</label>
                <textarea className="min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Required for return or reject." />
              </div>
            ) : null}
          </div>
      </ProcModal>
    </div>
  );
}
