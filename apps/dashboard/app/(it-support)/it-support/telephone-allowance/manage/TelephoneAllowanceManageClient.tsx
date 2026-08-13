'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Search, Send, ShieldCheck, UserMinus, UserPlus } from 'lucide-react';
import {
  badgeTone,
  moneyNgn,
  statusTone,
  TaShell,
  useTelephoneAllowanceApi,
  WorkflowStepper,
  type TaCapabilities,
} from '../_components/ta-shared';

type CycleEmployee = {
  id: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  jobTitle: string;
  monthlyRate: number;
  month1Eligible: boolean;
  month1Amount: number;
  month2Eligible: boolean;
  month2Amount: number;
  bimonthlyTotal: number;
  changeBadge: string;
  status: string;
  exceptionFlags?: string[];
};

type Cycle = {
  id: string;
  cycleCode: string;
  pairLabel: string;
  year: number;
  month1: number;
  month2: number;
  status: string;
  locked: boolean;
  rowVersion: number;
  preparedBy: string;
  hrReviewedBy?: string | null;
  currentOwnerRole: string;
  month1Total: number;
  month2Total: number;
  bimonthlyTotal: number;
  beneficiaryCount: number;
  originalBeneficiaryCount?: number | null;
  originalBimonthlyTotal?: number | null;
  employees: CycleEmployee[];
  changes: Array<{ changeType: string; employeeCode: string; employeeName: string; reason: string }>;
  versions: Array<{ versionNo: number; label: string; createdAt: string; createdBy: string; beneficiaryCount: number; bimonthlyTotal: number }>;
  updatedAt: string;
};

type Entitlement = {
  id: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  monthlyAmount: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: string;
};

const tabs = ['Current Cycle', 'Entitlements', 'Previous Cycles'] as const;
const filters = ['All', 'Month 1', 'Month 2', 'Changes'] as const;

export default function TelephoneAllowanceManageClient() {
  const { get, post, busy, toast, error } = useTelephoneAllowanceApi();
  const [tab, setTab] = useState<(typeof tabs)[number]>('Current Cycle');
  const [filter, setFilter] = useState<(typeof filters)[number]>('All');
  const [search, setSearch] = useState('');
  const [caps, setCaps] = useState<TaCapabilities | null>(null);
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [entitlements, setEntitlements] = useState<Entitlement[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showChanges, setShowChanges] = useState(false);
  const [dirQuery, setDirQuery] = useState('');
  const [dirHits, setDirHits] = useState<Array<{ employeeCode: string; employeeName: string; department: string; jobTitle: string }>>([]);
  const [addForm, setAddForm] = useState({
    employeeCode: '',
    employeeName: '',
    department: '',
    jobTitle: '',
    monthlyRate: 10000,
    month1Eligible: false,
    month2Eligible: true,
    reason: 'New eligibility',
    comment: '',
  });

  const load = useCallback(async () => {
    const [cycleRes, cyclesRes, entRes] = await Promise.all([
      get<{ cycle: Cycle | null; capabilities: TaCapabilities }>('cycle'),
      get<{ cycles: Cycle[]; capabilities: TaCapabilities }>('cycles'),
      get<{ entitlements: Entitlement[]; capabilities: TaCapabilities }>('entitlements'),
    ]);
    setCycle(cycleRes.cycle);
    setCaps(cycleRes.capabilities || cyclesRes.capabilities);
    setCycles(cyclesRes.cycles || []);
    setEntitlements(entRes.entitlements || []);
  }, [get]);

  useEffect(() => {
    void load().catch(console.error);
  }, [load]);

  const month1Name = cycle ? new Date(Date.UTC(cycle.year, cycle.month1 - 1, 1)).toLocaleString('en', { month: 'long' }) : 'Month 1';
  const month2Name = cycle ? new Date(Date.UTC(cycle.year, cycle.month2 - 1, 1)).toLocaleString('en', { month: 'long' }) : 'Month 2';

  const rows = useMemo(() => {
    if (!cycle) return [];
    let list = [...cycle.employees];
    if (filter === 'Month 1') list = list.filter((e) => e.month1Eligible || e.month1Amount > 0);
    if (filter === 'Month 2') list = list.filter((e) => e.month2Eligible || e.month2Amount > 0);
    if (filter === 'Changes') list = list.filter((e) => e.changeBadge && e.changeBadge !== 'UNCHANGED');
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((e) =>
        `${e.employeeCode} ${e.employeeName} ${e.department}`.toLowerCase().includes(q),
      );
    }
    return list.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  }, [cycle, filter, search]);

  const hrMode = cycle?.status === 'PENDING_HR_REVIEW' && caps?.canHrReview;
  const itEditable = cycle && !cycle.locked && ['DRAFT', 'RETURNED_TO_IT', 'RETURNED_FOR_CORRECTION', 'IT_VALIDATION'].includes(cycle.status) && caps?.canPrepare;

  const searchDirectory = async (q: string) => {
    setDirQuery(q);
    if (q.trim().length < 2) {
      setDirHits([]);
      return;
    }
    const res = await get<{ employees: typeof dirHits }>('directory-search', { q });
    setDirHits(res.employees || []);
  };

  const run = async (action: string, body: Record<string, unknown> = {}) => {
    if (!cycle && action !== 'create-cycle') return;
    await post(action, {
      cycleId: cycle?.id,
      rowVersion: cycle?.rowVersion,
      ...body,
    });
    await load();
  };

  const previousCycles = cycles.filter((c) => !cycle || c.id !== cycle.id);

  return (
    <TaShell
      title="Allowance Management"
      subtitle="Prepare, review, and maintain bimonthly telephone allowance schedules and entitlements."
      toast={toast}
      error={error}
    >
      <div className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`min-h-10 rounded-lg px-3 text-xs font-black ${tab === item ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-700'}`}
          >
            {item}
          </button>
        ))}
        <button type="button" onClick={() => void load()} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {tab === 'Current Cycle' ? (
        <div className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase text-teal-700">Employee Telephone Allowance</p>
                <h2 className="text-xl font-black text-slate-950">
                  {cycle ? `${cycle.pairLabel.toUpperCase()} ${cycle.year}` : 'No active cycle'}
                </h2>
                {cycle ? (
                  <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                    <span className={`rounded-full border px-2 py-0.5 font-black ${statusTone(cycle.status)}`}>{cycle.status.replaceAll('_', ' ')}</span>
                    <span>Prepared by {cycle.preparedBy}</span>
                    <span>Owner: {cycle.currentOwnerRole}</span>
                    {cycle.locked ? <span className="text-rose-700">Locked</span> : null}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {caps?.canPrepare ? (
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => void run('create-cycle')}
                    className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-teal-700 px-3 text-xs font-black text-white hover:bg-teal-800 disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" /> Create Next Cycle
                  </button>
                ) : null}
                {itEditable ? (
                  <button type="button" disabled={Boolean(busy)} onClick={() => void run('send-to-hr')} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-slate-900 px-3 text-xs font-black text-white disabled:opacity-50">
                    <Send className="h-4 w-4" /> Send to HR for Review
                  </button>
                ) : null}
                {hrMode ? (
                  <>
                    <button type="button" onClick={() => setShowAdd(true)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-black text-emerald-900">
                      <UserPlus className="h-4 w-4" /> Add Employee
                    </button>
                    <button type="button" disabled={Boolean(busy)} onClick={() => void run('complete-hr-review', { comment: 'HR review completed' })} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-amber-600 px-3 text-xs font-black text-white disabled:opacity-50">
                      Complete Review & Return to IT
                    </button>
                  </>
                ) : null}
                {cycle && caps?.canPrepare && ['RETURNED_TO_IT', 'IT_VALIDATION'].includes(cycle.status) ? (
                  <>
                    <button type="button" onClick={() => setShowChanges(true)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-800">
                      View Changes
                    </button>
                    <button type="button" disabled={Boolean(busy)} onClick={() => {
                      if (!window.confirm('This will lock the schedule and initiate formal approval. Continue?')) return;
                      void run('initiate-approval');
                    }} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-indigo-700 px-3 text-xs font-black text-white disabled:opacity-50">
                      <ShieldCheck className="h-4 w-4" /> Initiate Approval
                    </button>
                  </>
                ) : null}
              </div>
            </div>

            {cycle ? (
              <>
                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  {[
                    ['Month 1 Total', moneyNgn(cycle.month1Total)],
                    ['Month 2 Total', moneyNgn(cycle.month2Total)],
                    ['Bimonthly Total', moneyNgn(cycle.bimonthlyTotal)],
                    ['Beneficiaries', String(cycle.beneficiaryCount)],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <p className="text-[11px] font-black uppercase text-slate-500">{label}</p>
                      <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4"><WorkflowStepper status={cycle.status} /></div>
              </>
            ) : (
              <p className="mt-4 text-sm font-semibold text-slate-600">Create the next bimonthly cycle to populate beneficiaries from active entitlements.</p>
            )}
          </section>

          {hrMode && cycle ? (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <h3 className="text-sm font-black text-amber-950">HR REVIEW MODE</h3>
              <div className="mt-2 grid gap-2 text-sm font-semibold text-amber-950 md:grid-cols-3">
                <p>Original employees: {cycle.originalBeneficiaryCount ?? cycle.beneficiaryCount}</p>
                <p>Added: {cycle.changes.filter((c) => c.changeType === 'ADD').length}</p>
                <p>Removed: {cycle.changes.filter((c) => c.changeType === 'REMOVE').length}</p>
                <p>Amount changes: {cycle.changes.filter((c) => c.changeType === 'AMOUNT').length}</p>
                <p>Final beneficiaries: {cycle.beneficiaryCount}</p>
                <p>Revised total: {moneyNgn(cycle.bimonthlyTotal)} {cycle.originalBimonthlyTotal != null ? `(was ${moneyNgn(cycle.originalBimonthlyTotal)})` : ''}</p>
              </div>
            </section>
          ) : null}

          {cycle ? (
            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="relative max-w-md flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee, code, department" className="min-h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm font-semibold" />
                </div>
                <div className="flex flex-wrap gap-2">
                  {filters.map((item) => (
                    <button key={item} type="button" onClick={() => setFilter(item)} className={`rounded-full px-3 py-1.5 text-[11px] font-black ${filter === item ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-700'}`}>
                      {item === 'Month 1' ? month1Name : item === 'Month 2' ? month2Name : item}
                    </button>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-[11px] font-black uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Employee</th>
                      <th className="px-3 py-2">Department</th>
                      <th className="px-3 py-2 text-right">Monthly Rate</th>
                      <th className="px-3 py-2 text-right">{month1Name}</th>
                      <th className="px-3 py-2 text-right">{month2Name}</th>
                      <th className="px-3 py-2 text-right">Total</th>
                      <th className="px-3 py-2">Change</th>
                      <th className="px-3 py-2">Status</th>
                      {hrMode ? <th className="px-3 py-2">Actions</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-semibold text-slate-900">
                          <div>{row.employeeName}</div>
                          <div className="text-xs text-slate-500">{row.employeeCode}</div>
                        </td>
                        <td className="px-3 py-2 text-slate-700">{row.department}</td>
                        <td className="px-3 py-2 text-right font-semibold">{moneyNgn(row.monthlyRate)}</td>
                        <td className="px-3 py-2 text-right">{moneyNgn(row.month1Amount)}</td>
                        <td className="px-3 py-2 text-right">{moneyNgn(row.month2Amount)}</td>
                        <td className="px-3 py-2 text-right font-black">{moneyNgn(row.bimonthlyTotal)}</td>
                        <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${badgeTone(row.changeBadge)}`}>{row.changeBadge.replaceAll('_', ' ')}</span></td>
                        <td className="px-3 py-2 text-xs font-semibold text-slate-600">{row.status}</td>
                        {hrMode ? (
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              <button
                                type="button"
                                className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-900"
                                onClick={() => {
                                  const next = Number(window.prompt('New monthly rate', String(row.monthlyRate)) || row.monthlyRate);
                                  const reason = window.prompt('Reason for amount change', 'Entitlement revision') || '';
                                  if (!reason) return;
                                  void run('hr-adjust-amount', {
                                    employeeCode: row.employeeCode,
                                    newMonthlyRate: next,
                                    effectiveMonth: 2,
                                    reason,
                                  });
                                }}
                              >
                                Adjust
                              </button>
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 rounded border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-black text-rose-800"
                                onClick={() => {
                                  if (!window.confirm(`Remove ${row.employeeName} from ${month2Name}?`)) return;
                                  const reason = window.prompt('Removal reason', 'No longer eligible') || '';
                                  if (!reason) return;
                                  void run('hr-remove-employee', {
                                    employeeCode: row.employeeCode,
                                    effectiveMonth: 2,
                                    reason,
                                  });
                                }}
                              >
                                <UserMinus className="h-3 w-3" /> Remove
                              </button>
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!rows.length ? <p className="p-6 text-sm font-semibold text-slate-500">No employees match this filter.</p> : null}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {tab === 'Entitlements' ? (
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 p-4">
            <h2 className="text-sm font-black text-slate-950">Employee Entitlements (monthly master)</h2>
            {(caps?.canPrepare || caps?.canHrReview) ? (
              <button
                type="button"
                className="rounded-lg bg-teal-700 px-3 py-2 text-xs font-black text-white"
                onClick={() => {
                  const employeeCode = window.prompt('Employee code') || '';
                  const monthlyAmount = Number(window.prompt('Monthly entitlement amount', '10000') || 0);
                  const effectiveFrom = window.prompt('Effective from (YYYY-MM-DD)', new Date().toISOString().slice(0, 10)) || '';
                  if (!employeeCode || !monthlyAmount || !effectiveFrom) return;
                  void post('upsert-entitlement', { employeeCode, monthlyAmount, effectiveFrom, status: 'Active' }).then(() => load());
                }}
              >
                Add / Change Entitlement
              </button>
            ) : null}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-[11px] font-black uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Employee</th>
                  <th className="px-3 py-2 text-left">Department</th>
                  <th className="px-3 py-2 text-right">Monthly Entitlement</th>
                  <th className="px-3 py-2 text-left">Effective From</th>
                  <th className="px-3 py-2 text-left">Effective To</th>
                  <th className="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {entitlements.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-semibold">{row.employeeName}<div className="text-xs text-slate-500">{row.employeeCode}</div></td>
                    <td className="px-3 py-2">{row.department}</td>
                    <td className="px-3 py-2 text-right font-black">{moneyNgn(row.monthlyAmount)}</td>
                    <td className="px-3 py-2">{row.effectiveFrom?.slice(0, 10)}</td>
                    <td className="px-3 py-2">{row.effectiveTo?.slice(0, 10) || '—'}</td>
                    <td className="px-3 py-2"><span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${statusTone(row.status)}`}>{row.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!entitlements.length ? <p className="p-6 text-sm font-semibold text-slate-500">No entitlements yet. Import historical schedule or add entitlements before creating a cycle.</p> : null}
          </div>
        </section>
      ) : null}

      {tab === 'Previous Cycles' ? (
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-[11px] font-black uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Cycle</th>
                <th className="px-3 py-2 text-right">Employees</th>
                <th className="px-3 py-2 text-right">Month 1</th>
                <th className="px-3 py-2 text-right">Month 2</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {(previousCycles.length ? previousCycles : cycles).map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-semibold">{row.pairLabel} {row.year}<div className="text-xs text-slate-500">{row.cycleCode}</div></td>
                  <td className="px-3 py-2 text-right">{row.beneficiaryCount}</td>
                  <td className="px-3 py-2 text-right">{moneyNgn(row.month1Total)}</td>
                  <td className="px-3 py-2 text-right">{moneyNgn(row.month2Total)}</td>
                  <td className="px-3 py-2 text-right font-black">{moneyNgn(row.bimonthlyTotal)}</td>
                  <td className="px-3 py-2"><span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${statusTone(row.status)}`}>{row.status.replaceAll('_', ' ')}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {showAdd ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-black text-slate-950">Add Employee</h3>
            <p className="mt-1 text-sm font-semibold text-slate-600">Search Employee Directory. Do not create duplicate master records.</p>
            <input
              value={dirQuery}
              onChange={(e) => void searchDirectory(e.target.value)}
              placeholder="Search by code, name, department"
              className="mt-3 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold"
            />
            <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-slate-100">
              {dirHits.map((hit) => (
                <button
                  key={hit.employeeCode}
                  type="button"
                  className="block w-full border-b border-slate-50 px-3 py-2 text-left text-sm hover:bg-teal-50"
                  onClick={() => setAddForm((prev) => ({
                    ...prev,
                    employeeCode: hit.employeeCode,
                    employeeName: hit.employeeName,
                    department: hit.department,
                    jobTitle: hit.jobTitle,
                  }))}
                >
                  <span className="font-black">{hit.employeeCode}</span> · {hit.employeeName}
                  <span className="block text-xs text-slate-500">{hit.department} · {hit.jobTitle}</span>
                </button>
              ))}
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <label className="text-xs font-bold text-slate-600">Monthly rate<input type="number" value={addForm.monthlyRate} onChange={(e) => setAddForm({ ...addForm, monthlyRate: Number(e.target.value) })} className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold" /></label>
              <label className="text-xs font-bold text-slate-600">Reason<input value={addForm.reason} onChange={(e) => setAddForm({ ...addForm, reason: e.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold" /></label>
              <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={addForm.month1Eligible} onChange={(e) => setAddForm({ ...addForm, month1Eligible: e.target.checked })} /> {month1Name} eligible</label>
              <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={addForm.month2Eligible} onChange={(e) => setAddForm({ ...addForm, month2Eligible: e.target.checked })} /> {month2Name} eligible</label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setShowAdd(false)} className="min-h-10 rounded-lg border border-slate-200 px-3 text-xs font-black">Cancel</button>
              <button
                type="button"
                disabled={!addForm.employeeCode || Boolean(busy)}
                className="min-h-10 rounded-lg bg-teal-700 px-3 text-xs font-black text-white disabled:opacity-50"
                onClick={() => void run('hr-add-employee', addForm).then(() => setShowAdd(false))}
              >
                Add to Cycle
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showChanges && cycle ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="max-h-[80vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-black">View Changes</h3>
            <div className="mt-3 space-y-2">
              {cycle.versions.map((v) => (
                <div key={`${v.versionNo}-${v.label}`} className="rounded-xl border border-slate-200 p-3 text-sm">
                  <p className="font-black">Version {v.versionNo} — {v.label}</p>
                  <p className="text-xs text-slate-500">{v.createdBy} · {new Date(v.createdAt).toLocaleString()} · {v.beneficiaryCount} beneficiaries · {moneyNgn(v.bimonthlyTotal)}</p>
                </div>
              ))}
              {cycle.changes.map((c, idx) => (
                <div key={`${c.employeeCode}-${idx}`} className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-sm">
                  <p className="font-black">{c.changeType} · {c.employeeCode} {c.employeeName}</p>
                  <p className="text-xs text-slate-600">{c.reason}</p>
                </div>
              ))}
              {!cycle.changes.length ? <p className="text-sm font-semibold text-slate-500">No HR changes recorded.</p> : null}
            </div>
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={() => setShowChanges(false)} className="min-h-10 rounded-lg border border-slate-200 px-3 text-xs font-black">Close</button>
            </div>
          </div>
        </div>
      ) : null}
    </TaShell>
  );
}
