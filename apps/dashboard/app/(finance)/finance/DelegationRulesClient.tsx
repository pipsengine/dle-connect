'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ScrollTable } from '@/components/ui/responsive';
import {
  CalendarRange,
  CheckCircle2,
  Clock3,
  Plus,
  RefreshCcw,
  Settings2,
  Sparkles,
  UserCheck,
  UserPlus,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import type {
  ApprovalDelegation,
  ApprovalDelegationWorkspace,
  DelegationScope,
  DelegationStatus,
} from '@/lib/finance-intelligence/approval-delegation-types';
import {
  DELEGATION_APPROVER_ROLE_OPTIONS,
  DELEGATION_SCOPE_OPTIONS,
} from '@/lib/finance-intelligence/approval-delegation-types';

type Props = { initialWorkspace: ApprovalDelegationWorkspace };

const fmtDate = (value: string | null) => {
  if (!value) return 'Open-ended';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const toDateInput = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const statusTone = (status: DelegationStatus) => {
  if (status === 'Active') return 'bg-emerald-50 text-emerald-700';
  if (status === 'Scheduled') return 'bg-sky-50 text-sky-700';
  if (status === 'Expired') return 'bg-slate-100 text-slate-600';
  return 'bg-rose-50 text-rose-700';
};

const emptyForm = () => ({
  fromEmployeeCode: '',
  fromEmployeeName: '',
  toEmployeeCode: '',
  toEmployeeName: '',
  approverRole: 'All Stages',
  scope: 'All Employee Payments' as DelegationScope,
  startsAt: new Date().toISOString().slice(0, 10),
  endsAt: '',
  reason: '',
  status: 'Active' as DelegationStatus,
});

export default function DelegationRulesClient({ initialWorkspace }: Props) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ApprovalDelegation | null>(null);
  const [filter, setFilter] = useState<'all' | DelegationStatus>('all');
  const [form, setForm] = useState(emptyForm());

  const refresh = async () => {
    setLoading(true);
    setToast('');
    try {
      const res = await fetch('/api/finance/approval-delegations', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Refresh failed');
      setWorkspace(json.data as ApprovalDelegationWorkspace);
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Refresh failed');
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setOpen(true);
  };

  const openEdit = (row: ApprovalDelegation) => {
    setEditing(row);
    setForm({
      fromEmployeeCode: row.fromEmployeeCode,
      fromEmployeeName: row.fromEmployeeName,
      toEmployeeCode: row.toEmployeeCode,
      toEmployeeName: row.toEmployeeName,
      approverRole: row.approverRole,
      scope: row.scope,
      startsAt: toDateInput(row.startsAt),
      endsAt: toDateInput(row.endsAt),
      reason: row.reason,
      status: row.status === 'Expired' || row.status === 'Cancelled' ? 'Active' : row.status,
    });
    setOpen(true);
  };

  const save = async () => {
    setBusy(true);
    setToast('');
    try {
      const res = await fetch('/api/finance/approval-delegations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'upsert',
          delegationId: editing?.delegationId,
          ...form,
          startsAt: form.startsAt ? new Date(`${form.startsAt}T00:00:00`).toISOString() : new Date().toISOString(),
          endsAt: form.endsAt ? new Date(`${form.endsAt}T23:59:59`).toISOString() : null,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to save delegation.');
      setWorkspace(json.data.workspace as ApprovalDelegationWorkspace);
      setOpen(false);
      setToast(json.data.message || 'Delegation saved.');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Unable to save delegation.');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (row: ApprovalDelegation) => {
    if (!window.confirm(`Cancel delegation ${row.delegationId}?`)) return;
    setBusy(true);
    try {
      const res = await fetch('/api/finance/approval-delegations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cancel',
          delegationId: row.delegationId,
          reason: 'Cancelled from Delegation Rules',
        }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to cancel.');
      setWorkspace(json.data.workspace as ApprovalDelegationWorkspace);
      setToast('Delegation cancelled.');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Unable to cancel.');
    } finally {
      setBusy(false);
    }
  };

  const rows = useMemo(() => {
    if (filter === 'all') return workspace.rows;
    return workspace.rows.filter((row) => row.status === filter);
  }, [workspace.rows, filter]);

  const kpis = [
    { label: 'Active', value: String(workspace.summary.active), detail: 'In force now', icon: CheckCircle2, wrap: 'bg-emerald-50', color: 'text-emerald-600' },
    { label: 'Scheduled', value: String(workspace.summary.scheduled), detail: 'Future start', icon: CalendarRange, wrap: 'bg-sky-50', color: 'text-sky-600' },
    { label: 'Standing', value: String(workspace.summary.standing), detail: 'Open-ended', icon: Users, wrap: 'bg-violet-50', color: 'text-violet-600' },
    { label: 'Temporary', value: String(workspace.summary.temporary), detail: 'With end date', icon: Clock3, wrap: 'bg-amber-50', color: 'text-amber-600' },
    { label: 'Expired', value: String(workspace.summary.expired), detail: 'Past end date', icon: XCircle, wrap: 'bg-slate-100', color: 'text-slate-600' },
    { label: 'Cancelled', value: String(workspace.summary.cancelled), detail: 'Manually stopped', icon: UserCheck, wrap: 'bg-rose-50', color: 'text-rose-600' },
  ];

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#EAF6FF] text-[#008FD5]">
            <UserPlus className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">Delegation Rules</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              Temporary and standing cover for payment approval stages. Active rules redirect Cash Advance and Supplier Invoice approvals to the delegate.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={openCreate} className="inline-flex items-center gap-2 rounded-xl bg-[#008FD5] px-3.5 py-2 text-sm font-semibold text-white">
            <Plus className="h-4 w-4" /> New delegation
          </button>
          <Link href="/finance/configuration/approval-limits" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700">
            Approval Limits
          </Link>
          <Link href="/finance/configuration/sage-x3" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700">
            <Settings2 className="h-4 w-4" /> Configure Sage X3
          </Link>
          <Link href="/finance/ai-copilot" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700">
            <Sparkles className="h-4 w-4" /> Ask Finance AI
          </Link>
          <button type="button" onClick={() => void refresh()} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600">
            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {toast ? <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">{toast}</div> : null}

      {(workspace.warnings?.length || 0) > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">Review needed</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {workspace.warnings.slice(0, 6).map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {kpis.map((card) => (
          <article key={card.label} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{card.label}</p>
              <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl ${card.wrap}`}>
                <card.icon className={`h-4 w-4 ${card.color}`} />
              </span>
            </div>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">{card.value}</p>
            <p className="mt-1 text-xs text-slate-500">{card.detail}</p>
          </article>
        ))}
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
          {([
            ['all', 'All'],
            ['Active', 'Active'],
            ['Scheduled', 'Scheduled'],
            ['Expired', 'Expired'],
            ['Cancelled', 'Cancelled'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                filter === id ? 'bg-[#EAF6FF] text-[#008FD5]' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
          <button type="button" onClick={openCreate} className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-[#008FD5] px-3 py-2 text-xs font-semibold text-white">
            <Plus className="h-3.5 w-3.5" /> New delegation
          </button>
        </div>

        <ScrollTable minWidth={960}><table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                {['Principal', 'Delegate', 'Role', 'Scope', 'Window', 'Status', 'Actions'].map((column) => (
                  <th key={column} className="px-3 py-2.5 font-semibold">{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length ? rows.map((row) => (
                <tr key={row.delegationId} className="border-t border-slate-100">
                  <td className="px-3 py-2.5">
                    <div className="font-semibold text-slate-800">{row.fromEmployeeName || row.fromEmployeeCode}</div>
                    <div className="text-[11px] text-slate-500">{row.fromEmployeeCode}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-semibold text-slate-800">{row.toEmployeeName || row.toEmployeeCode}</div>
                    <div className="text-[11px] text-slate-500">{row.toEmployeeCode}</div>
                  </td>
                  <td className="px-3 py-2.5">{row.approverRole}</td>
                  <td className="px-3 py-2.5">{row.scope}</td>
                  <td className="px-3 py-2.5 tabular-nums">
                    {fmtDate(row.startsAt)} → {fmtDate(row.endsAt)}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusTone(row.status)}`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => openEdit(row)} className="font-semibold text-[#008FD5]">Edit</button>
                      {row.status === 'Active' || row.status === 'Scheduled' ? (
                        <button type="button" disabled={busy} onClick={() => void cancel(row)} className="font-semibold text-rose-600 disabled:opacity-60">Cancel</button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={7} className="px-3 py-14 text-center">
                    <p className="text-sm font-semibold text-slate-800">No delegation rules yet</p>
                    <p className="mt-1 text-sm text-slate-500">
                      Create a temporary cover (with end date) or a standing rule for ongoing absence.
                    </p>
                    <button type="button" onClick={openCreate} className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#008FD5] px-3.5 py-2 text-xs font-semibold text-white">
                      <Plus className="h-3.5 w-3.5" /> New delegation
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table></ScrollTable>
      </section>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Change history</h2>
        {workspace.audit.length ? (
          <ul className="space-y-2 text-sm text-slate-600">
            {workspace.audit.slice(0, 10).map((item) => (
              <li key={item.auditId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                <span><span className="font-semibold text-slate-800">{item.actionType}</span> · {item.delegationId || '—'}</span>
                <span className="text-xs text-slate-500">{item.actorName} · {fmtDateTime(item.createdAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">No delegation changes logged yet.</p>
        )}
      </section>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4">
          <div className="w-full max-w-xl overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-900">{editing ? 'Edit delegation' : 'New delegation'}</h2>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="max-h-[70vh] space-y-3 overflow-y-auto px-5 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm"><span className="mb-1 block font-medium">From employee code *</span>
                  <input value={form.fromEmployeeCode} onChange={(e) => setForm((p) => ({ ...p, fromEmployeeCode: e.target.value }))} placeholder="EMP001" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                </label>
                <label className="block text-sm"><span className="mb-1 block font-medium">From employee name</span>
                  <input value={form.fromEmployeeName} onChange={(e) => setForm((p) => ({ ...p, fromEmployeeName: e.target.value }))} placeholder="Finance Manager" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm"><span className="mb-1 block font-medium">Delegate code *</span>
                  <input value={form.toEmployeeCode} onChange={(e) => setForm((p) => ({ ...p, toEmployeeCode: e.target.value }))} placeholder="EMP002" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                </label>
                <label className="block text-sm"><span className="mb-1 block font-medium">Delegate name</span>
                  <input value={form.toEmployeeName} onChange={(e) => setForm((p) => ({ ...p, toEmployeeName: e.target.value }))} placeholder="Acting Finance Manager" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm"><span className="mb-1 block font-medium">Approver role</span>
                  <select value={form.approverRole} onChange={(e) => setForm((p) => ({ ...p, approverRole: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                    {DELEGATION_APPROVER_ROLE_OPTIONS.map((role) => <option key={role}>{role}</option>)}
                  </select>
                </label>
                <label className="block text-sm"><span className="mb-1 block font-medium">Payment scope</span>
                  <select value={form.scope} onChange={(e) => setForm((p) => ({ ...p, scope: e.target.value as DelegationScope }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                    {DELEGATION_SCOPE_OPTIONS.map((scope) => <option key={scope}>{scope}</option>)}
                  </select>
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm"><span className="mb-1 block font-medium">Starts *</span>
                  <input type="date" value={form.startsAt} onChange={(e) => setForm((p) => ({ ...p, startsAt: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                </label>
                <label className="block text-sm"><span className="mb-1 block font-medium">Ends (blank = standing)</span>
                  <input type="date" value={form.endsAt} onChange={(e) => setForm((p) => ({ ...p, endsAt: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                </label>
              </div>
              <label className="block text-sm"><span className="mb-1 block font-medium">Reason</span>
                <input value={form.reason} onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))} placeholder="Leave cover / acting assignment" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4">
              <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium">Cancel</button>
              <button type="button" disabled={busy} onClick={() => void save()} className="rounded-xl bg-[#008FD5] px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {busy ? 'Saving…' : 'Save rule'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
