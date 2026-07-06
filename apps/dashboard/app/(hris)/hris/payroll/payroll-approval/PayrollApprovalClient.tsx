'use client';

/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  Download,
  History,
  RefreshCcw,
  Search,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import type { PayrollApprovalStageId } from '@/lib/payroll-approval-workflow';
import PayrollApprovalStagePanel from './PayrollApprovalStagePanel';

type Role = 'Super Admin' | 'HR Director' | 'HR Manager' | 'Finance Controller' | 'Finance Manager' | 'CFO' | 'Executive Management' | 'Payroll Officer' | 'Auditor' | 'Employee';
type RunStatus = 'Draft' | 'Calculated' | 'Submitted' | 'HR Approved' | 'Finance Approved' | 'CFO Approved' | 'Approved' | 'Locked' | 'Posted' | 'Rejected';
type RecordStatus = 'Ready' | 'Review' | 'Blocked';
type Tone = 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'cyan' | 'slate';

type PayrollRun = {
  id: string;
  period: string;
  periodLabel: string;
  status: RunStatus;
  employeeCount: number;
  grossPay: number;
  netPay: number;
  totalDeductions: number;
  employerCost: number;
  exceptionCount: number;
  createdAt: string;
  createdBy: Role;
  updatedAt: string;
  updatedBy: Role;
  audit: Array<{ at: string; actor: Role; action: string; from?: RunStatus; to?: RunStatus; note?: string }>;
};

type PayrollRecord = {
  employeeId: string;
  fullName: string;
  department: string;
  payrollGroup: string;
  grossPay: number | null;
  totalDeductions: number | null;
  netPay: number | null;
  employerCost: number | null;
  status: RecordStatus;
  issues: string[];
};

type Payload = {
  generatedAt: string;
  dataSource?: { source: string; databaseAvailable: boolean; warning: string | null; employeeCount: number };
  period: string;
  periodLabel: string;
  permissions: {
    canViewMoney: boolean;
    canCalculate: boolean;
    canSubmit: boolean;
    canApproveHrManager: boolean;
    canApproveFinanceManager: boolean;
    canApproveCfo: boolean;
    canApproveMdCeo: boolean;
    canApproveAnyStage: boolean;
    canApproveFinance: boolean;
    canApproveHr: boolean;
    canLock: boolean;
    canExport: boolean;
  };
  run: PayrollRun | null;
  runs: PayrollRun[];
  summary: {
    employees: number;
    grossPay: number | null;
    totalDeductions: number | null;
    netPay: number | null;
    employerCost: number | null;
    ready: number;
    review: number;
    blocked: number;
    exceptionCount: number;
    averageDeductionRatio: number | null;
  };
  records: PayrollRecord[];
  controls: Array<{ id: string; label: string; status: string; detail: string; tone: Tone }>;
  approvalWorkflow?: {
    stageLabel: string;
    nextOwner: string;
    stages: Array<{
      id: PayrollApprovalStageId;
      code: string;
      title: string;
      owner: string;
      action: string;
      done: boolean;
      current: boolean;
      stamp: string | null;
      signedBy: string | null;
    }>;
  };
};

type ApiResponse<T> = { status: 'success' | 'error'; data?: T; error?: string };

const moneyFmt = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });
const numberFmt = new Intl.NumberFormat('en-GB');
const money = (value: number | null | undefined, allowed = true) => (!allowed || value === null || value === undefined ? 'Restricted' : moneyFmt.format(value));
const number = (value: number | null | undefined) => numberFmt.format(Number(value || 0));

const toneStyles: Record<Tone, { card: string; icon: string; chip: string; bar: string }> = {
  blue: { card: 'bg-blue-50 border-blue-200', icon: 'bg-blue-600 text-white', chip: 'bg-blue-100 text-blue-800', bar: 'bg-blue-600' },
  green: { card: 'bg-emerald-50 border-emerald-200', icon: 'bg-emerald-600 text-white', chip: 'bg-emerald-100 text-emerald-800', bar: 'bg-emerald-600' },
  amber: { card: 'bg-amber-50 border-amber-200', icon: 'bg-amber-500 text-white', chip: 'bg-amber-100 text-amber-800', bar: 'bg-amber-500' },
  red: { card: 'bg-red-50 border-red-200', icon: 'bg-red-600 text-white', chip: 'bg-red-100 text-red-800', bar: 'bg-red-600' },
  violet: { card: 'bg-violet-50 border-violet-200', icon: 'bg-violet-600 text-white', chip: 'bg-violet-100 text-violet-800', bar: 'bg-violet-600' },
  cyan: { card: 'bg-cyan-50 border-cyan-200', icon: 'bg-cyan-600 text-white', chip: 'bg-cyan-100 text-cyan-800', bar: 'bg-cyan-600' },
  slate: { card: 'bg-slate-50 border-slate-200', icon: 'bg-slate-800 text-white', chip: 'bg-slate-100 text-slate-800', bar: 'bg-slate-700' },
};

const statusTone = (status: string): Tone =>
  status === 'Posted' || status === 'Locked' || status === 'HR Approved' || status === 'Finance Approved' || status === 'Ready' || status === 'Passed'
    ? 'green'
    : status === 'Rejected' || status === 'Blocked'
      ? 'red'
      : status === 'Review'
        ? 'amber'
        : 'violet';

function MetricCard({ label, value, detail, icon: Icon, tone }: { label: string; value: string; detail: string; icon: any; tone: Tone }) {
  const styles = toneStyles[tone];
  return (
    <div className={`relative overflow-hidden rounded-2xl border p-4 sm:p-5 ${styles.card}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-normal text-slate-600">{label}</p>
          <p className="mt-2 truncate text-2xl font-black text-slate-950">{value}</p>
          <p className="mt-1 line-clamp-2 text-xs font-semibold text-slate-600">{detail}</p>
        </div>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${styles.icon}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <div className={`absolute bottom-0 left-0 h-1 w-full ${styles.bar}`} />
    </div>
  );
}

export default function PayrollApprovalClient({ initialNow }: { initialNow: string }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [role, setRole] = useState<Role>('Finance Controller');
  const [period, setPeriod] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [note, setNote] = useState('');
  const [activeStageId, setActiveStageId] = useState<PayrollApprovalStageId | null>(null);

  const load = async (targetPeriod = period) => {
    setLoading(true);
    setError('');
    try {
      const suffix = targetPeriod ? `?period=${encodeURIComponent(targetPeriod)}` : '';
      const res = await fetch(`/api/hris/payroll/payroll-processing${suffix}`, { headers: { 'x-hris-role': role }, cache: 'no-store' });
      const json = (await res.json()) as ApiResponse<Payload>;
      if (!res.ok || json.status !== 'success' || !json.data) throw new Error(json.error || `Payroll approval request failed (${res.status})`);
      setPayload(json.data);
      setPeriod(json.data.period);
    } catch (event) {
      setError(event instanceof Error ? event.message : 'Unable to load payroll approval queue');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(period);
  }, [role]);

  const run = payload?.run || null;
  const canViewMoney = Boolean(payload?.permissions.canViewMoney);
  const runStatus = run?.status || 'Draft';
  const lastLoaded = payload?.generatedAt || initialNow;
  const exceptionRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (payload?.records || [])
      .filter((record) => record.status !== 'Ready' || record.issues.length > 0)
      .filter((record) => {
        if (!q) return true;
        return [record.employeeId, record.fullName, record.department, record.payrollGroup, record.issues.join(' ')].some((item) => String(item || '').toLowerCase().includes(q));
      })
      .slice(0, 80);
  }, [payload?.records, query]);

  const stages = payload?.approvalWorkflow?.stages || [];
  useEffect(() => {
    const current = stages.find((stage) => stage.current);
    if (current) setActiveStageId(current.id);
  }, [payload?.approvalWorkflow?.stageLabel, stages]);

  const action = async (actionName: string) => {
    setPosting(actionName);
    setToast('');
    try {
      const res = await fetch('/api/hris/payroll/payroll-processing', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-hris-role': role },
        body: JSON.stringify({ action: actionName, period, note: note || `${actionName} from payroll approval console` }),
      });
      const json = (await res.json()) as ApiResponse<{ run: PayrollRun }>;
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to update payroll approval');
      setToast(`Payroll run moved to ${json.data?.run.status || 'updated'}.`);
      setNote('');
      await load(period);
    } catch (event) {
      setToast(event instanceof Error ? event.message : 'Unable to update payroll approval');
    } finally {
      setPosting('');
    }
  };

  const exportCsv = () => {
    window.location.href = `/api/hris/payroll/payroll-processing?period=${encodeURIComponent(period)}&format=csv`;
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-white">
              <ShieldCheck className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-950">Payroll Approval</h1>
              <p className="mt-1 max-w-5xl text-sm font-semibold text-slate-600">
                Sequential HR Manager → Finance Manager → CFO → MD / CEO approval with role-specific checklists, authenticated email notifications, and full audit trail.
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-extrabold text-blue-800">Period: {payload?.periodLabel || 'Loading'}</span>
            <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${toneStyles[statusTone(runStatus)].chip}`}>Run: {runStatus}</span>
            <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-extrabold text-violet-800">Stage: {payload?.approvalWorkflow?.stageLabel || 'Preparation'}</span>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-extrabold text-amber-900">Owner: {payload?.approvalWorkflow?.nextOwner || 'Payroll Officer'}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-extrabold text-slate-700">Loaded: {new Date(lastLoaded).toLocaleString('en-GB')}</span>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-extrabold text-emerald-800">{payload?.dataSource?.employeeCount || 0} employees</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-800 outline-none" />
          <select value={role} onChange={(event) => setRole(event.target.value as Role)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-800 outline-none">
            {['HR Manager', 'HR Director', 'Finance Manager', 'Finance Controller', 'CFO', 'Executive Management', 'Payroll Officer', 'Super Admin', 'Auditor', 'Employee'].map((item) => <option key={item}>{item}</option>)}
          </select>
          <button type="button" onClick={() => void load(period)} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-3 text-xs font-extrabold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60">
            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button type="button" onClick={exportCsv} disabled={!payload?.permissions.canExport} className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-3 text-xs font-extrabold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>
      </div>

      {error && <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">{error}</div>}
      {toast && <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">{toast}</div>}
      {payload?.dataSource?.warning && <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">{payload.dataSource.warning}</div>}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Gross Pay for Approval" value={money(payload?.summary.grossPay, canViewMoney)} detail={`${number(payload?.summary.employees)} employees in run scope`} icon={Banknote} tone="blue" />
        <MetricCard label="Net Pay" value={money(payload?.summary.netPay, canViewMoney)} detail="Bank schedule value after deductions" icon={Wallet} tone="green" />
        <MetricCard label="Employer Cost" value={money(payload?.summary.employerCost, canViewMoney)} detail="Gross plus employer statutory costs" icon={BadgeCheck} tone="violet" />
        <MetricCard label="Approval Exceptions" value={number(payload?.summary.exceptionCount)} detail={`${number(payload?.summary.blocked)} blocked and ${number(payload?.summary.review)} review lines`} icon={AlertTriangle} tone={(payload?.summary.blocked || 0) > 0 ? 'red' : (payload?.summary.review || 0) > 0 ? 'amber' : 'green'} />
      </div>

      <section className="mt-6">
        <PayrollApprovalStagePanel
          stages={stages}
          payload={{
            blockedEmployees: payload?.summary.blocked,
            reviewEmployees: payload?.summary.review,
            exceptionCount: payload?.summary.exceptionCount,
            payrollEligible: payload?.summary.employees,
            readyEmployees: payload?.summary.ready,
            grossPay: payload?.summary.grossPay,
            netPay: payload?.summary.netPay,
            employerCost: payload?.summary.employerCost,
            records: payload?.records,
          }}
          activeStageId={activeStageId}
          onSelectStage={setActiveStageId}
          onApprove={(actionName) => void action(actionName)}
          onReject={() => void action('reject-run')}
          onRequestRevision={() => void action('request-revision')}
          posting={posting}
          canApproveHrManager={Boolean(payload?.permissions.canApproveHrManager)}
          canApproveFinanceManager={Boolean(payload?.permissions.canApproveFinanceManager)}
          canApproveCfo={Boolean(payload?.permissions.canApproveCfo)}
          canApproveMdCeo={Boolean(payload?.permissions.canApproveMdCeo)}
          canApproveAnyStage={Boolean(payload?.permissions.canApproveAnyStage)}
          canSubmit={Boolean(payload?.permissions.canSubmit)}
          note={note}
          onNoteChange={setNote}
        />
      </section>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-black uppercase tracking-normal text-slate-900">Approval Gates</h2>
          <div className="mt-4 space-y-3">
            {(payload?.controls || []).map((control) => {
              const styles = toneStyles[control.tone];
              return (
                <div key={control.id} className={`rounded-2xl border p-4 ${styles.card}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-black text-slate-950">{control.label}</p>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${styles.chip}`}>{control.status}</span>
                  </div>
                  <p className="mt-2 text-xs font-semibold text-slate-600">{control.detail}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-black uppercase tracking-normal text-slate-900">Exception Review Queue</h2>
                <p className="mt-1 text-xs font-semibold text-slate-500">Top blocked and review lines that affect approval readiness.</p>
              </div>
              <div className="relative min-w-0 sm:w-72">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search exceptions" className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm font-semibold outline-none focus:border-dle-blue focus:ring-2 focus:ring-dle-blue/20" />
              </div>
            </div>
          </div>
          <div className="max-h-[520px] overflow-y-auto divide-y divide-slate-100">
            {exceptionRows.map((record) => (
              <div key={record.employeeId} className="p-4 hover:bg-slate-50">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-950">{record.fullName}</p>
                    <p className="text-xs font-semibold text-slate-500">{record.employeeId} - {record.department} - {record.payrollGroup}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${toneStyles[statusTone(record.status)].chip}`}>{record.status}</span>
                </div>
                <p className="mt-2 text-xs font-semibold text-slate-600">{record.issues.slice(0, 4).join('; ')}</p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-slate-50 p-2"><p className="text-[10px] font-black uppercase text-slate-500">Gross</p><p className="text-xs font-black text-slate-900">{money(record.grossPay, canViewMoney)}</p></div>
                  <div className="rounded-xl bg-slate-50 p-2"><p className="text-[10px] font-black uppercase text-slate-500">Deduct.</p><p className="text-xs font-black text-red-700">{money(record.totalDeductions, canViewMoney)}</p></div>
                  <div className="rounded-xl bg-slate-50 p-2"><p className="text-[10px] font-black uppercase text-slate-500">Net</p><p className="text-xs font-black text-emerald-700">{money(record.netPay, canViewMoney)}</p></div>
                </div>
              </div>
            ))}
            {exceptionRows.length === 0 && <div className="p-8 text-center text-sm font-bold text-slate-500">No approval exceptions match the current search.</div>}
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-black uppercase tracking-normal text-slate-900">Run Audit Trail</h2>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {(run?.audit || []).slice().reverse().map((event) => (
            <div key={`${event.at}-${event.action}`} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-black text-slate-950">{event.action}</p>
                <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-slate-600">{event.actor}</span>
              </div>
              <p className="mt-1 text-xs font-semibold text-slate-500">{new Date(event.at).toLocaleString('en-GB')} {event.from ? `- ${event.from} to ${event.to}` : ''}</p>
              {event.note && <p className="mt-2 text-xs font-semibold text-slate-600">{event.note}</p>}
            </div>
          ))}
          {!run?.audit?.length && <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm font-bold text-slate-500">No approval audit events yet. Submit or approve the run to start the trace.</div>}
        </div>
      </section>
    </div>
  );
}
