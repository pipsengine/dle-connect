'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  Filter,
  MoreHorizontal,
  Plus,
  RefreshCcw,
  Scale,
  Settings2,
  ShieldCheck,
  Sparkles,
  Upload,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import type { ApprovalMatrixRule, ApprovalMatrixWorkspace } from '@/lib/finance-intelligence/approval-matrix-service';

type Props = { initialWorkspace: ApprovalMatrixWorkspace };
type TabId = 'limits' | 'dual' | 'types' | 'levels' | 'history';

const money = (value: number | null) => {
  if (value == null) return 'Open';
  return new Intl.NumberFormat('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
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

const typeTone = (paymentType: string) =>
  /cash advance/i.test(paymentType) ? 'bg-violet-50 text-violet-700' : 'bg-amber-50 text-amber-800';

export default function ApprovalLimitsClient({ initialWorkspace }: Props) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [tab, setTab] = useState<TabId>('limits');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ApprovalMatrixRule | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [form, setForm] = useState({
    ruleName: '',
    paymentType: 'Cash Advance Payment',
    entityName: 'Dorman Long Nigeria Ltd',
    companyCode: 'DLE',
    minAmount: '0',
    maxAmount: '',
    approvalLevel: '1',
    approverRoles: 'Line Manager',
    dualControl: false,
    status: 'Active',
  });

  const refresh = async () => {
    setLoading(true);
    setToast('');
    try {
      const res = await fetch('/api/finance/approval-matrix', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Refresh failed');
      setWorkspace(json.data as ApprovalMatrixWorkspace);
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Refresh failed');
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm({
      ruleName: '',
      paymentType: 'Cash Advance Payment',
      entityName: 'Dorman Long Nigeria Ltd',
      companyCode: 'DLE',
      minAmount: '0',
      maxAmount: '',
      approvalLevel: '1',
      approverRoles: 'Line Manager',
      dualControl: false,
      status: 'Active',
    });
    setOpen(true);
  };

  const openEdit = (rule: ApprovalMatrixRule) => {
    setEditing(rule);
    setForm({
      ruleName: rule.ruleName,
      paymentType: rule.paymentType,
      entityName: rule.entityName,
      companyCode: rule.companyCode,
      minAmount: String(rule.minAmount),
      maxAmount: rule.maxAmount == null ? '' : String(rule.maxAmount),
      approvalLevel: String(rule.approvalLevel),
      approverRoles: rule.approverRoles,
      dualControl: rule.dualControl,
      status: rule.status,
    });
    setOpen(true);
  };

  const saveRule = async () => {
    setBusy(true);
    setToast('');
    try {
      const res = await fetch('/api/finance/approval-matrix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'upsert',
          matrixId: editing?.matrixId,
          ...form,
          minAmount: Number(form.minAmount || 0),
          maxAmount: form.maxAmount === '' ? null : Number(form.maxAmount),
          approvalLevel: Number(form.approvalLevel || 1),
        }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to save rule.');
      setWorkspace(json.data.workspace as ApprovalMatrixWorkspace);
      setOpen(false);
      setToast(json.data.message || 'Limit rule saved.');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Unable to save rule.');
    } finally {
      setBusy(false);
    }
  };

  const deleteRule = async (matrixId: string) => {
    if (!window.confirm('Delete this approval limit rule?')) return;
    setBusy(true);
    try {
      const res = await fetch('/api/finance/approval-matrix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', matrixId }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to delete rule.');
      setWorkspace(json.data.workspace as ApprovalMatrixWorkspace);
      setToast('Limit rule deleted.');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Unable to delete rule.');
    } finally {
      setBusy(false);
    }
  };

  const rows = useMemo(() => {
    if (tab === 'dual') return workspace.rules.filter((rule) => rule.dualControl);
    if (tab === 'types') return workspace.rules;
    if (tab === 'levels') return workspace.rules;
    return workspace.rules;
  }, [workspace.rules, tab]);

  const kpis = [
    { label: 'Limit Rules', value: String(workspace.rules.length), detail: 'Configured', icon: Wallet, wrap: 'bg-amber-50', color: 'text-amber-600' },
    { label: 'Approval Levels', value: String(workspace.summary.approvalLevels), detail: 'Active', icon: Users, wrap: 'bg-blue-50', color: 'text-[#008FD5]' },
    { label: 'Payment Types', value: String(workspace.summary.paymentTypes), detail: 'Covered', icon: FileText, wrap: 'bg-violet-50', color: 'text-violet-600' },
    { label: 'Company Coverage', value: `${workspace.summary.companyCoveragePct}%`, detail: workspace.rules.length ? 'Entities covered' : 'No rules yet', icon: ShieldCheck, wrap: 'bg-emerald-50', color: 'text-emerald-600' },
    { label: 'Pending Changes', value: String(workspace.summary.pendingChanges), detail: 'Awaiting publish', icon: Clock3, wrap: 'bg-orange-50', color: 'text-orange-500' },
    { label: 'Compliance', value: `${workspace.summary.compliancePct}%`, detail: workspace.summary.pendingChanges ? 'Pending review' : 'Within policy', icon: CheckCircle2, wrap: 'bg-teal-50', color: 'text-teal-600' },
  ];

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#EAF6FF] text-[#008FD5]">
            <Scale className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">Approval Limits</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              Define monetary limits and dual-control thresholds for approvals.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/finance/configuration/approval-matrix" className="inline-flex items-center gap-2 rounded-xl bg-[#008FD5] px-3.5 py-2 text-sm font-semibold text-white">
            Open workspace
          </Link>
          <Link href="/finance/configuration/sage-x3" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700">
            <Settings2 className="h-4 w-4" /> Configure Sage X3
          </Link>
          <Link href="/finance/ai-copilot" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700">
            <Sparkles className="h-4 w-4" /> Ask Finance AI
            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">New</span>
          </Link>
          <button type="button" onClick={() => void refresh()} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600">
            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {toast ? <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">{toast}</div> : null}

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
        <div className="flex gap-1 overflow-x-auto border-b border-slate-100 px-3 pt-3">
          {[
            { id: 'limits' as const, label: 'Limit Rules', count: workspace.rules.length },
            { id: 'dual' as const, label: 'Dual Control Rules', count: workspace.summary.dualControlRules },
            { id: 'types' as const, label: 'Payment Types', count: workspace.summary.paymentTypes },
            { id: 'levels' as const, label: 'Approval Levels', count: workspace.summary.approvalLevels },
            { id: 'history' as const, label: 'Change History', count: workspace.audit.length },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`whitespace-nowrap rounded-t-lg px-3 py-2 text-xs font-semibold ${
                tab === item.id ? 'bg-[#EAF6FF] text-[#008FD5]' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {item.label}{item.count ? ` (${item.count})` : ''}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
          <button type="button" onClick={openCreate} className="inline-flex items-center gap-1.5 rounded-xl bg-[#008FD5] px-3 py-2 text-xs font-semibold text-white">
            <Plus className="h-3.5 w-3.5" /> New Limit Rule
          </button>
          <button type="button" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">
            <Upload className="h-3.5 w-3.5" /> Import
          </button>
          <button type="button" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">
            <Download className="h-3.5 w-3.5" /> Export
          </button>
          <button type="button" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">
            <Filter className="h-3.5 w-3.5" /> Filters
          </button>
        </div>

        {tab === 'history' ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  {['When', 'Action', 'Rule', 'Actor'].map((column) => (
                    <th key={column} className="px-3 py-2.5 font-semibold">{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {workspace.audit.length ? workspace.audit.map((item) => (
                  <tr key={item.auditId} className="border-t border-slate-100">
                    <td className="px-3 py-2.5">{fmtDateTime(item.createdAt)}</td>
                    <td className="px-3 py-2.5">{item.actionType}</td>
                    <td className="px-3 py-2.5">{item.matrixId || '—'}</td>
                    <td className="px-3 py-2.5">{item.actorName || '—'}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={4} className="px-3 py-12 text-center text-slate-500">No change history yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2.5"><span className="sr-only">Select</span></th>
                  {['Rule Name', 'Payment Type', 'Company / Entity', 'From Amount (NGN)', 'To Amount (NGN)', 'Approval Level', 'Approvers', 'Status', 'Last Updated', ''].map((column) => (
                    <th key={column || 'actions'} className="whitespace-nowrap px-3 py-2.5 font-semibold">{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length ? rows.map((rule) => (
                  <tr key={rule.matrixId} className="border-t border-slate-100 hover:bg-slate-50/70">
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={selected.includes(rule.matrixId)}
                        onChange={() => setSelected((current) => current.includes(rule.matrixId) ? current.filter((id) => id !== rule.matrixId) : [...current, rule.matrixId])}
                        className="rounded border-slate-300 text-[#008FD5]"
                      />
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-slate-800">{rule.ruleName}</td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${typeTone(rule.paymentType)}`}>
                        {rule.paymentType.replace(' Payment', '')}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">{rule.entityName}</td>
                    <td className="px-3 py-2.5 tabular-nums">{money(rule.minAmount)}</td>
                    <td className="px-3 py-2.5 tabular-nums">{money(rule.maxAmount)}</td>
                    <td className="px-3 py-2.5">Level {rule.approvalLevel}</td>
                    <td className="px-3 py-2.5">{rule.approverRoles}</td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${rule.status === 'Active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {rule.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">{fmtDateTime(rule.updatedAt)}</td>
                    <td className="px-3 py-2.5">
                      <div className="relative">
                        <details>
                          <summary className="list-none cursor-pointer rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                            <MoreHorizontal className="h-4 w-4" />
                          </summary>
                          <div className="absolute right-0 z-10 mt-1 w-36 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                            <button type="button" onClick={() => openEdit(rule)} className="block w-full px-3 py-2 text-left hover:bg-slate-50">Edit</button>
                            <button type="button" disabled={busy} onClick={() => void deleteRule(rule.matrixId)} className="block w-full px-3 py-2 text-left text-rose-600 hover:bg-rose-50">Delete</button>
                          </div>
                        </details>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={11} className="px-3 py-14 text-center">
                      <p className="text-sm font-semibold text-slate-800">No approval limit rules yet</p>
                      <p className="mt-1 text-sm text-slate-500">Create Cash Advance and Supplier Invoice amount bands to drive workflow routing.</p>
                      <button type="button" onClick={openCreate} className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#008FD5] px-3.5 py-2 text-xs font-semibold text-white">
                        <Plus className="h-3.5 w-3.5" /> New Limit Rule
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
          Showing {rows.length ? 1 : 0} to {rows.length} of {rows.length} results
        </div>
      </section>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4">
          <div className="w-full max-w-xl overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-900">{editing ? 'Edit limit rule' : 'New limit rule'}</h2>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3 px-5 py-4">
              <label className="block text-sm"><span className="mb-1 block font-medium">Rule name *</span>
                <input value={form.ruleName} onChange={(e) => setForm((p) => ({ ...p, ruleName: e.target.value }))} placeholder="CASH_ADV_001" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm"><span className="mb-1 block font-medium">Payment type *</span>
                  <select value={form.paymentType} onChange={(e) => setForm((p) => ({ ...p, paymentType: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                    <option>Cash Advance Payment</option>
                    <option>Supplier Invoice Payment</option>
                  </select>
                </label>
                <label className="block text-sm"><span className="mb-1 block font-medium">Approval level *</span>
                  <select value={form.approvalLevel} onChange={(e) => setForm((p) => ({ ...p, approvalLevel: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                    {[1, 2, 3, 4, 5].map((level) => <option key={level} value={level}>Level {level}</option>)}
                  </select>
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm"><span className="mb-1 block font-medium">From amount (NGN) *</span>
                  <input type="number" value={form.minAmount} onChange={(e) => setForm((p) => ({ ...p, minAmount: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                </label>
                <label className="block text-sm"><span className="mb-1 block font-medium">To amount (NGN)</span>
                  <input type="number" value={form.maxAmount} onChange={(e) => setForm((p) => ({ ...p, maxAmount: e.target.value }))} placeholder="Blank = open-ended" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                </label>
              </div>
              <label className="block text-sm"><span className="mb-1 block font-medium">Approvers *</span>
                <input value={form.approverRoles} onChange={(e) => setForm((p) => ({ ...p, approverRoles: e.target.value }))} placeholder="Finance Manager" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm"><span className="mb-1 block font-medium">Status</span>
                  <select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                    <option>Active</option>
                    <option>Draft</option>
                    <option>Pending</option>
                    <option>Inactive</option>
                  </select>
                </label>
                <label className="mt-6 inline-flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={form.dualControl} onChange={(e) => setForm((p) => ({ ...p, dualControl: e.target.checked }))} className="rounded border-slate-300 text-[#008FD5]" />
                  Dual control required
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4">
              <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium">Cancel</button>
              <button type="button" disabled={busy} onClick={() => void saveRule()} className="rounded-xl bg-[#008FD5] px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {busy ? 'Saving…' : 'Save rule'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
