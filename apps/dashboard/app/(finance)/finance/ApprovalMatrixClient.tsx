'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ScrollTable } from '@/components/ui/responsive';
import {
  CheckCircle2,
  Clock3,
  Copy,
  Database,
  Download,
  GitBranch,
  Network,
  Plus,
  RefreshCcw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
  X,
} from 'lucide-react';
import type {
  ApprovalChainResolution,
  ApprovalMatrixWorkspace,
} from '@/lib/finance-intelligence/approval-matrix-service';

type Props = { initialWorkspace: ApprovalMatrixWorkspace };

const money = (value: number) =>
  new Intl.NumberFormat('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

export default function ApprovalMatrixClient({ initialWorkspace }: Props) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [open, setOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ApprovalChainResolution | null>(null);
  const [testForm, setTestForm] = useState({
    amount: '250000',
    currencyCode: 'NGN',
    path: 'Non-project',
    projectCode: '',
  });
  const [form, setForm] = useState({
    ruleName: '',
    pathType: 'Non-project',
    entityName: 'Dorman Long Nigeria Ltd',
    companyCode: 'DLE',
    minAmount: '0',
    maxAmount: '',
    approvalLevel: '2',
    approverRoles: 'Reporting Manager → Finance Manager',
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

  useEffect(() => {
    if (!initialWorkspace.rules.length) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const seedDefaults = async () => {
    setBusy(true);
    setToast('');
    try {
      const res = await fetch('/api/finance/approval-matrix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'seed-defaults' }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to load standard limits');
      setWorkspace(json.data.workspace as ApprovalMatrixWorkspace);
      setToast(json.data.message || 'Standard approval limits loaded.');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Unable to load standard limits');
    } finally {
      setBusy(false);
    }
  };

  const createRule = async () => {
    setBusy(true);
    setToast('');
    try {
      const res = await fetch('/api/finance/approval-matrix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'upsert',
          ...form,
          minAmount: Number(form.minAmount || 0),
          maxAmount: form.maxAmount === '' ? null : Number(form.maxAmount),
          approvalLevel: Number(form.approvalLevel || 1),
        }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to create rule.');
      setWorkspace(json.data.workspace as ApprovalMatrixWorkspace);
      setOpen(false);
      setToast(json.data.message || 'Approval rule created.');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Unable to create rule.');
    } finally {
      setBusy(false);
    }
  };

  const runPreview = async () => {
    setBusy(true);
    setToast('');
    setPreview(null);
    try {
      const isProject = /project/i.test(testForm.path);
      const res = await fetch('/api/finance/approval-matrix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'resolve-preview',
          amount: Number(testForm.amount || 0),
          currencyCode: testForm.currencyCode || 'NGN',
          projectCode: isProject ? (testForm.projectCode || 'PRJ-TEST') : '',
          projectDepartment: isProject,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to resolve chain.');
      setPreview(json.data.chain as ApprovalChainResolution);
      setToast(json.data.message || 'Chain resolved.');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Unable to resolve chain.');
    } finally {
      setBusy(false);
    }
  };

  const summary = [
    { label: 'Approval Paths', value: String(workspace.summary.pathTypes), detail: 'Non-project · Project', icon: Database, wrap: 'bg-blue-50', color: 'text-[#008FD5]' },
    { label: 'Approval Rules', value: String(workspace.summary.activeRules), detail: 'Active', icon: Users, wrap: 'bg-emerald-50', color: 'text-emerald-600' },
    { label: 'Approval Levels', value: String(workspace.summary.approvalLevels), detail: 'Across all rules', icon: Network, wrap: 'bg-violet-50', color: 'text-violet-600' },
    { label: 'Pending Changes', value: String(workspace.summary.pendingChanges), detail: 'Awaiting publish', icon: Clock3, wrap: 'bg-orange-50', color: 'text-orange-500' },
    { label: 'Path Coverage', value: `${workspace.summary.coveragePct}%`, detail: 'Required paths covered', icon: CheckCircle2, wrap: 'bg-teal-50', color: 'text-teal-600' },
  ];

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#EAF6FF] text-[#008FD5]">
            <GitBranch className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">Approval Matrix</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              Workflow view of the same Non-project / Project limit bands used for Cash Advance and Supplier Invoice.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-[#008FD5] px-3.5 py-2 text-sm font-semibold text-white">
            Open workspace
          </button>
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

      {(workspace.warnings?.length || 0) > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">Coverage warnings</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {workspace.warnings.slice(0, 6).map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {summary.map((card) => (
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

      <div className="grid gap-4 xl:grid-cols-3">
        <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Workspace status</h2>
          <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {workspace.rules.length
              ? `${workspace.summary.activeRules} active approval rule${workspace.summary.activeRules === 1 ? '' : 's'} loaded from finance.ApprovalMatrix.`
              : 'No approval rules configured yet. Load standard limits first, then refine bands.'}
          </div>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            {[
              ['Sage X3', workspace.source.includes('Enterprise') ? 'Available' : 'Offline'],
              ['Approval Rules Engine', workspace.rules.length ? 'Active' : 'Awaiting limits'],
              ['Workflow Service', 'Active'],
            ].map(([label, status]) => (
              <li key={label} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span>{label}</span>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {status}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Path bands</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
              <span>Non-project</span>
              <span className="font-semibold text-slate-800">{workspace.summary.nonProjectRules} rules</span>
            </li>
            <li className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
              <span>Project</span>
              <span className="font-semibold text-slate-800">{workspace.summary.projectRules} rules</span>
            </li>
            <li className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
              <span>Band gaps / overlaps</span>
              <span className="font-semibold text-slate-800">
                {(workspace.summary.bandGaps || 0) + (workspace.summary.bandOverlaps || 0)}
              </span>
            </li>
          </ul>
        </section>

        <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Governance</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li className="rounded-lg bg-slate-50 px-3 py-2">Access logged</li>
            <li className="rounded-lg bg-slate-50 px-3 py-2">Seed / save / delete audited</li>
            <li className="rounded-lg bg-slate-50 px-3 py-2">Human review for formal use</li>
          </ul>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Quick actions</h2>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => void seedDefaults()} className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60">
            <Sparkles className="h-3.5 w-3.5" /> Load standard limits
          </button>
          <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            <Plus className="h-3.5 w-3.5" /> Create approval rule
          </button>
          <Link href="/finance/configuration/approval-limits" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            <ShieldCheck className="h-3.5 w-3.5" /> View approval limits
          </Link>
          <button type="button" onClick={() => { setPreview(null); setTestOpen(true); }} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            <Workflow className="h-3.5 w-3.5" /> Test workflow
          </button>
          <button type="button" onClick={() => document.getElementById('matrix-audit')?.scrollIntoView({ behavior: 'smooth' })} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            <Clock3 className="h-3.5 w-3.5" /> Audit trail
          </button>
          <button type="button" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            <Download className="h-3.5 w-3.5" /> Export matrix
          </button>
          <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            <Copy className="h-3.5 w-3.5" /> Clone existing rule
          </button>
        </div>
      </section>

      <section id="matrix-audit" className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Audit trail</h2>
        {workspace.audit.length ? (
          <ul className="space-y-2 text-sm text-slate-600">
            {workspace.audit.slice(0, 8).map((item) => (
              <li key={item.auditId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                <span><span className="font-semibold text-slate-800">{item.actionType}</span> · {item.matrixId || '—'}</span>
                <span className="text-xs text-slate-500">{item.actorName} · {new Date(item.createdAt).toLocaleString('en-GB')}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">No audit events yet. Saves and deletes are logged here.</p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Configured rules</h2>
          <button type="button" onClick={() => setOpen(true)} className="text-xs font-semibold text-[#008FD5]">+ Add rule</button>
        </div>
        {workspace.rules.length ? (
          <ScrollTable minWidth={960}><table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  {['Rule', 'Path', 'Amount band', 'Level', 'Approvers', 'Status'].map((column) => (
                    <th key={column} className="px-3 py-2 font-semibold">{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {workspace.rules.map((rule) => (
                  <tr key={rule.matrixId} className="border-t border-slate-100">
                    <td className="px-3 py-2.5 font-semibold text-slate-800">{rule.ruleName}</td>
                    <td className="px-3 py-2.5">{rule.pathType}</td>
                    <td className="px-3 py-2.5 tabular-nums">
                      {money(rule.minAmount)}
                      {' – '}
                      {rule.maxAmount == null ? 'Open' : money(rule.maxAmount)}
                    </td>
                    <td className="px-3 py-2.5">Level {rule.approvalLevel}</td>
                    <td className="px-3 py-2.5">{rule.approverRoles}</td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${rule.status === 'Active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {rule.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></ScrollTable>
        ) : (
          <div className="rounded-xl bg-slate-50 px-4 py-8 text-center">
            <p className="text-sm font-semibold text-slate-800">No rules in the database yet</p>
            <p className="mt-1 text-sm text-slate-500">Load the standard Non-project and Project bands first.</p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void seedDefaults()}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#008FD5] px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-60"
            >
              <Sparkles className="h-3.5 w-3.5" /> Load standard limits
            </button>
          </div>
        )}
      </section>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4">
          <div className="w-full max-w-xl overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-900">Create approval rule</h2>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3 px-5 py-4">
              <label className="block text-sm"><span className="mb-1 block font-medium">Rule name *</span>
                <input value={form.ruleName} onChange={(e) => setForm((p) => ({ ...p, ruleName: e.target.value }))} placeholder="CASH_ADV_001" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm"><span className="mb-1 block font-medium">Path *</span>
                  <select value={form.pathType} onChange={(e) => setForm((p) => ({ ...p, pathType: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                    <option>Non-project</option>
                    <option>Project</option>
                  </select>
                </label>
                <label className="block text-sm"><span className="mb-1 block font-medium">Approval level *</span>
                  <select value={form.approvalLevel} onChange={(e) => setForm((p) => ({ ...p, approvalLevel: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                    {[1, 2, 3, 4, 5, 6].map((level) => <option key={level} value={level}>Level {level}</option>)}
                  </select>
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm"><span className="mb-1 block font-medium">From amount *</span>
                  <input type="number" value={form.minAmount} onChange={(e) => setForm((p) => ({ ...p, minAmount: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                </label>
                <label className="block text-sm"><span className="mb-1 block font-medium">To amount</span>
                  <input type="number" value={form.maxAmount} onChange={(e) => setForm((p) => ({ ...p, maxAmount: e.target.value }))} placeholder="Leave blank for open-ended" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                </label>
              </div>
              <label className="block text-sm"><span className="mb-1 block font-medium">Approver role(s) *</span>
                <input value={form.approverRoles} onChange={(e) => setForm((p) => ({ ...p, approverRoles: e.target.value }))} placeholder="Reporting Manager → Finance Manager" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={form.dualControl} onChange={(e) => setForm((p) => ({ ...p, dualControl: e.target.checked }))} className="rounded border-slate-300 text-[#008FD5]" />
                Require dual control
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4">
              <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium">Cancel</button>
              <button type="button" disabled={busy} onClick={() => void createRule()} className="rounded-xl bg-[#008FD5] px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {busy ? 'Saving…' : 'Save rule'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {testOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4">
          <div className="w-full max-w-lg overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-900">Test approval workflow</h2>
              <button type="button" onClick={() => setTestOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3 px-5 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm"><span className="mb-1 block font-medium">Amount *</span>
                  <input type="number" value={testForm.amount} onChange={(e) => setTestForm((p) => ({ ...p, amount: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                </label>
                <label className="block text-sm"><span className="mb-1 block font-medium">Currency</span>
                  <select value={testForm.currencyCode} onChange={(e) => setTestForm((p) => ({ ...p, currencyCode: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                    {['NGN', 'USD', 'EUR', 'GBP'].map((code) => <option key={code}>{code}</option>)}
                  </select>
                </label>
              </div>
              <label className="block text-sm"><span className="mb-1 block font-medium">Path</span>
                <select value={testForm.path} onChange={(e) => setTestForm((p) => ({ ...p, path: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                  <option>Non-project</option>
                  <option>Project</option>
                </select>
              </label>
              {/project/i.test(testForm.path) ? (
                <label className="block text-sm"><span className="mb-1 block font-medium">Project code</span>
                  <input value={testForm.projectCode} onChange={(e) => setTestForm((p) => ({ ...p, projectCode: e.target.value }))} placeholder="PRJ-001" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                </label>
              ) : null}
              {preview ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                  <p className="font-semibold text-slate-900">{preview.ruleName} · {preview.pathType}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {money(preview.amountOriginal)} {preview.currencyCode}
                    {preview.currencyCode !== 'NGN' ? ` → ${money(preview.amountNgn)} NGN @ ${preview.fxRate}` : null}
                  </p>
                  <ol className="mt-3 list-decimal space-y-1 pl-5">
                    {preview.stages.map((stage) => (
                      <li key={stage} className={stage === preview.currentStage ? 'font-semibold text-[#008FD5]' : ''}>{stage}</li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4">
              <button type="button" onClick={() => setTestOpen(false)} className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium">Close</button>
              <button type="button" disabled={busy} onClick={() => void runPreview()} className="rounded-xl bg-[#008FD5] px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {busy ? 'Resolving…' : 'Resolve chain'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
