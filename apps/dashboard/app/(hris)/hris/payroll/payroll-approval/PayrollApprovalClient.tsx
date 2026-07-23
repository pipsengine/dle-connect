'use client';

/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  ChevronLeft,
  ChevronRight,
  Download,
  History,
  RefreshCcw,
  Search,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import type { PayrollApprovalStageId } from '@/lib/payroll-approval-workflow';
import { currencyCode, formatPayrollMoney, resolvePayCurrency } from '@/lib/payroll-currency';
import PayrollApprovalStagePanel from './PayrollApprovalStagePanel';

type Role = 'Super Admin' | 'HR Director' | 'HR Manager' | 'Finance Controller' | 'Finance Manager' | 'CFO' | 'Executive Management' | 'Payroll Officer' | 'Auditor' | 'Employee';
type RunStatus = 'Draft' | 'Open' | 'Calculated' | 'Computed' | 'Validated' | 'Ready for Approval' | 'Submitted' | 'Under Review' | 'HR Approved' | 'Finance Approved' | 'CFO Approved' | 'Approved' | 'Released' | 'Revision Requested' | 'Locked' | 'Posted' | 'Published' | 'Closed' | 'Reopened' | 'Rejected';
type RecordStatus = 'Ready' | 'Review' | 'Blocked';
type Tone = 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'cyan' | 'slate';
type PayrollPack = 'salaried' | 'daily-rate';

type PayrollRun = {
  id: string;
  period: string;
  periodLabel: string;
  pack?: PayrollPack;
  packLabel?: string;
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
  payCurrency?: string;
  salaryGrade?: string;
  businessUnit?: string;
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
  pack?: PayrollPack;
  packLabel?: string;
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
  packs?: Array<{
    pack: PayrollPack;
    packLabel: string;
    run: PayrollRun | null;
    summary: Payload['summary'];
    records: PayrollRecord[];
    approvalWorkflow?: Payload['approvalWorkflow'];
  }>;
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
    currentOwnerHint?: string;
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

const numberFmt = new Intl.NumberFormat('en-GB');
const recordCurrency = (record: Pick<PayrollRecord, 'payCurrency' | 'payrollGroup' | 'salaryGrade' | 'businessUnit'>) =>
  resolvePayCurrency({
    payCurrency: record.payCurrency,
    payrollGroup: record.payrollGroup,
    salaryGrade: record.salaryGrade,
    businessUnit: record.businessUnit,
  });
const money = (value: number | null | undefined, allowed = true, currency = 'NGN') => {
  if (!allowed || value === null || value === undefined) return 'Restricted';
  const code = currencyCode(currency);
  return formatPayrollMoney(value, code, { maximumFractionDigits: code === 'USD' ? 2 : 0 });
};
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

const PAGE_SIZE = 15;
type DetailView = 'gross' | 'net' | 'employer' | 'exceptions' | null;

/** Search payroll/salary rows by employee id, name, department, group, or status. */
function searchEmployees<T extends {
  employeeId?: string | null;
  fullName?: string | null;
  department?: string | null;
  payrollGroup?: string | null;
  status?: string | null;
  issues?: string[] | null;
}>(records: T[], query: string): T[] {
  const tokens = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (!tokens.length) return records;

  return records.filter((record) => {
    const haystack = [
      record.employeeId,
      record.fullName,
      record.department,
      record.payrollGroup,
      record.status,
      ...(record.issues || []),
    ]
      .map((item) => String(item || '').toLowerCase())
      .join(' ');

    return tokens.every((token) => haystack.includes(token));
  });
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: string;
  detail: string;
  icon: any;
  tone: Tone;
  active?: boolean;
  onClick?: () => void;
}) {
  const styles = toneStyles[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative overflow-hidden rounded-2xl border p-4 text-left sm:p-5 transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-dle-blue/30 ${styles.card} ${active ? 'ring-2 ring-dle-blue shadow-md' : ''}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-normal text-slate-600">{label}</p>
          <p className="mt-2 truncate text-2xl font-black text-slate-950">{value}</p>
          <p className="mt-1 line-clamp-2 text-xs font-semibold text-slate-600">{detail}</p>
          <p className="mt-2 text-[10px] font-black uppercase tracking-wide text-slate-500">Click for details</p>
        </div>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${styles.icon}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <div className={`absolute bottom-0 left-0 h-1 w-full ${styles.bar}`} />
    </button>
  );
}

type SessionUser = {
  fullName?: string;
  username?: string;
  roles?: string[];
  isGlobalAdmin?: boolean;
};

const primaryRoleFromSession = (user: SessionUser | null): Role => {
  if (!user) return 'Employee';
  const text = `${(user.roles || []).join(' ')} ${user.isGlobalAdmin ? 'Super Admin' : ''}`;
  if (user.isGlobalAdmin || /super administrator|super admin/i.test(text)) return 'Super Admin';
  if (/system administrator/i.test(text)) return 'Super Admin';
  if (/finance manager/i.test(text)) return 'Finance Manager';
  if (/\bcfo\b/i.test(text)) return 'CFO';
  if (/executive director|executive management|md\b|ceo\b/i.test(text)) return 'Executive Management';
  if (/finance controller/i.test(text)) return 'Finance Controller';
  if (/hr director/i.test(text)) return 'HR Director';
  if (/hr manager/i.test(text)) return 'HR Manager';
  if (/payroll officer|payroll administrator|payroll supervisor/i.test(text)) return 'Payroll Officer';
  if (/auditor/i.test(text)) return 'Auditor';
  return 'Employee';
};

export default function PayrollApprovalClient({ initialNow }: { initialNow: string }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [role, setRole] = useState<Role>('Employee');
  const [period, setPeriod] = useState('');
  const [pack, setPack] = useState<PayrollPack>('salaried');
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [note, setNote] = useState('');
  const [activeStageId, setActiveStageId] = useState<PayrollApprovalStageId | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [detailView, setDetailView] = useState<DetailView>('gross');
  const [salaryQuery, setSalaryQuery] = useState('');
  const [page, setPage] = useState(1);

  const loadSession = async () => {
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.data) {
        const user: SessionUser = {
          fullName: json.data.fullName,
          username: json.data.username,
          roles: Array.isArray(json.data.roles) ? json.data.roles : [],
          isGlobalAdmin: Boolean(json.data.isGlobalAdmin),
        };
        setSessionUser(user);
        setRole(primaryRoleFromSession(user));
      }
    } catch {
      // keep existing role defaults
    } finally {
      setSessionReady(true);
    }
  };

  const load = async (targetPeriod = period, sessionRole = role, targetPack = pack) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (targetPeriod) params.set('period', targetPeriod);
      if (targetPack) params.set('pack', targetPack);
      const suffix = params.toString() ? `?${params.toString()}` : '';
      const res = await fetch(`/api/hris/payroll/payroll-processing${suffix}`, {
        headers: { 'x-hris-role': sessionRole },
        cache: 'no-store',
      });
      const json = (await res.json()) as ApiResponse<Payload>;
      if (!res.ok || json.status !== 'success' || !json.data) throw new Error(json.error || `Payroll approval request failed (${res.status})`);
      setPayload(json.data);
      setPeriod(json.data.period);
      if (json.data.pack) setPack(json.data.pack);
    } catch (event) {
      setError(event instanceof Error ? event.message : 'Unable to load payroll approval workspace');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSession();
  }, []);

  useEffect(() => {
    if (!sessionReady) return;
    void load(period, role, pack);
  }, [sessionReady, role]);

  const run = payload?.run || null;
  const canViewMoney = Boolean(payload?.permissions.canViewMoney);
  const runStatus = run?.status || 'Draft';
  const signedInAs = sessionUser?.fullName || sessionUser?.username || role;
  const packSummaries = payload?.packs || [];

  const salaryRows = useMemo(() => {
    let rows = [...(payload?.records || [])];
    if (detailView === 'exceptions') {
      rows = rows.filter((record) => record.status !== 'Ready' || record.issues.length > 0);
    }
    rows = searchEmployees(rows, salaryQuery);
    const sortKey = detailView === 'net' ? 'netPay' : detailView === 'employer' ? 'employerCost' : 'grossPay';
    rows.sort((a, b) => Number(b[sortKey] || 0) - Number(a[sortKey] || 0));
    return rows;
  }, [payload?.records, salaryQuery, detailView]);

  useEffect(() => {
    setPage(1);
  }, [salaryQuery, detailView, payload?.period]);

  const pageCount = Math.max(1, Math.ceil(salaryRows.length / PAGE_SIZE));
  const pageRows = useMemo(
    () => salaryRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [salaryRows, page],
  );
  const pageWindowStart = Math.max(1, Math.min(page - 2, pageCount - 4));
  const visiblePages = Array.from({ length: Math.min(5, pageCount) }, (_, i) => pageWindowStart + i);

  const detailMeta = useMemo(() => {
    if (detailView === 'net') {
      return { title: 'Employee Net Pay Details', subtitle: 'Employees ranked by net pay for the selected payroll period.' };
    }
    if (detailView === 'employer') {
      return { title: 'Employer Cost Details', subtitle: 'Per-employee employer cost including statutory employer portions.' };
    }
    if (detailView === 'exceptions') {
      return { title: 'Approval Exception Details', subtitle: 'Blocked and review employees that affect approval readiness.' };
    }
    return { title: 'Employee Gross Pay Details', subtitle: 'Employees ranked by gross pay in the current payroll run.' };
  }, [detailView]);

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
        body: JSON.stringify({
          action: actionName,
          period,
          pack,
          runId: run?.id || undefined,
          note: note || `${actionName} from payroll approval console (${pack})`,
        }),
      });
      const json = (await res.json()) as ApiResponse<{ run: PayrollRun }>;
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to update payroll approval');
      setToast(`${json.data?.run.packLabel || pack} pack moved to ${json.data?.run.status || 'updated'}.`);
      setNote('');
      await load(period, role, pack);
    } catch (event) {
      setToast(event instanceof Error ? event.message : 'Unable to update payroll approval');
    } finally {
      setPosting('');
    }
  };

  const exportCsv = () => {
    window.location.href = `/api/hris/payroll/payroll-processing?period=${encodeURIComponent(period)}&pack=${encodeURIComponent(pack)}&format=csv`;
  };

  const selectPack = (nextPack: PayrollPack) => {
    setPack(nextPack);
    void load(period, role, nextPack);
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
                Review and approve the payroll run for your authorized stage. Actions follow your logged-in role.
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-extrabold text-blue-800">Period: {payload?.periodLabel || 'Loading'}</span>
            <span className="rounded-full bg-cyan-100 px-3 py-1 text-xs font-extrabold text-cyan-900">Pack: {payload?.packLabel || pack}</span>
            <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${toneStyles[statusTone(runStatus)].chip}`}>Run: {runStatus}</span>
            <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-extrabold text-violet-800">Stage: {payload?.approvalWorkflow?.stageLabel || 'Preparation'}</span>
            <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-extrabold text-indigo-900">Owner: {payload?.approvalWorkflow?.nextOwner || '—'}</span>
            <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-extrabold text-indigo-900">Signed in: {signedInAs} · {role}</span>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-extrabold text-emerald-800">{payload?.summary.employees || 0} employees in pack</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-800 outline-none" />
          <button type="button" onClick={() => void load(period, role, pack)} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-3 text-xs font-extrabold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60">
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

      <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        <p className="font-semibold text-slate-900">Dual-pack approval</p>
        <p className="mt-1 text-xs leading-relaxed">
          Salaried/Stipend (Permanent, Lumpsum, NYSC/IT) and Contract Daily Rate are separate runs with the same Officer → HR → Finance → CFO → MD chain.
          Costs are split per pack. Timesheet HR acknowledgement feeds OT / daily-rate calculation; this screen is the executive pack sign-off.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(packSummaries.length ? packSummaries : [
            { pack: 'salaried' as PayrollPack, packLabel: 'Salaried / Stipend', run: null, summary: payload?.summary, records: [], approvalWorkflow: undefined },
            { pack: 'daily-rate' as PayrollPack, packLabel: 'Daily Rate', run: null, summary: payload?.summary, records: [], approvalWorkflow: undefined },
          ]).map((item) => (
            <button
              key={item.pack}
              type="button"
              onClick={() => selectPack(item.pack)}
              className={`rounded-xl border px-4 py-2 text-left text-xs font-extrabold transition ${
                pack === item.pack ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300'
              }`}
            >
              <div>{item.packLabel}</div>
              <div className={`mt-1 ${pack === item.pack ? 'text-blue-100' : 'text-slate-500'}`}>
                {item.run?.status || 'Draft'} · {money(item.run?.netPay ?? item.summary?.netPay, canViewMoney)} · {number(item.run?.employeeCount ?? item.summary?.employees)} staff
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Gross Pay for Approval"
          value={money(payload?.summary.grossPay, canViewMoney)}
          detail={`${number(payload?.summary.employees)} employees in run scope`}
          icon={Banknote}
          tone="blue"
          active={detailView === 'gross'}
          onClick={() => setDetailView('gross')}
        />
        <MetricCard
          label="Net Pay"
          value={money(payload?.summary.netPay, canViewMoney)}
          detail="Bank schedule value after deductions"
          icon={Wallet}
          tone="green"
          active={detailView === 'net'}
          onClick={() => setDetailView('net')}
        />
        <MetricCard
          label="Employer Cost"
          value={money(payload?.summary.employerCost, canViewMoney)}
          detail="Gross plus employer statutory costs"
          icon={BadgeCheck}
          tone="violet"
          active={detailView === 'employer'}
          onClick={() => setDetailView('employer')}
        />
        <MetricCard
          label="Approval Exceptions"
          value={number(payload?.summary.exceptionCount)}
          detail={`${number(payload?.summary.blocked)} blocked and ${number(payload?.summary.review)} review lines`}
          icon={AlertTriangle}
          tone={(payload?.summary.blocked || 0) > 0 ? 'red' : (payload?.summary.review || 0) > 0 ? 'amber' : 'green'}
          active={detailView === 'exceptions'}
          onClick={() => setDetailView('exceptions')}
        />
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

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-black uppercase tracking-normal text-slate-900">{detailMeta.title}</h2>
              <p className="mt-1 text-xs font-semibold text-slate-500">{detailMeta.subtitle}</p>
            </div>
            <div className="flex min-w-0 flex-col gap-2 sm:w-80">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={salaryQuery}
                  onChange={(event) => setSalaryQuery(event.target.value)}
                  placeholder="Search by name, ID, dept…"
                  aria-label="Search employees"
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-10 text-sm font-semibold outline-none focus:border-dle-blue focus:ring-2 focus:ring-dle-blue/20"
                />
                {salaryQuery ? (
                  <button
                    type="button"
                    onClick={() => setSalaryQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-[11px] font-black uppercase text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Gross</th>
                <th className="px-4 py-3">Deductions</th>
                <th className="px-4 py-3">Net</th>
                <th className="px-4 py-3">Employer Cost</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((record) => (
                <tr key={record.employeeId} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="font-black text-slate-950">{record.fullName}</p>
                    <p className="text-xs font-semibold text-slate-500">{record.employeeId}</p>
                    {detailView === 'exceptions' && record.issues.length ? (
                      <p className="mt-1 text-[11px] font-semibold text-slate-500">{record.issues.slice(0, 2).join('; ')}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-xs font-semibold text-slate-600">
                    <p>{record.department || '—'}</p>
                    <p className="text-slate-400">{record.payrollGroup || '—'} · {recordCurrency(record)}</p>
                  </td>
                  <td className="px-4 py-3 font-black text-slate-900">{money(record.grossPay, canViewMoney, recordCurrency(record))}</td>
                  <td className="px-4 py-3 font-black text-red-700">{money(record.totalDeductions, canViewMoney, recordCurrency(record))}</td>
                  <td className="px-4 py-3 font-black text-emerald-700">{money(record.netPay, canViewMoney, recordCurrency(record))}</td>
                  <td className="px-4 py-3 font-black text-violet-700">{money(record.employerCost, canViewMoney, recordCurrency(record))}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${toneStyles[statusTone(record.status)].chip}`}>{record.status}</span>
                  </td>
                </tr>
              ))}
              {!pageRows.length ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm font-bold text-slate-500">
                    {loading ? 'Loading employee salary details…' : 'No employee salary rows match the current filters.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
          <span className="text-xs font-semibold">
            {salaryRows.length
              ? `${(page - 1) * PAGE_SIZE + 1} to ${Math.min(page * PAGE_SIZE, salaryRows.length)} of ${number(salaryRows.length)} employees`
              : 'No employees'}
            {detailView === 'exceptions' ? ' with approval exceptions' : ''}.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 disabled:opacity-40"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {visiblePages.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPage(p)}
                className={`flex h-9 min-w-[36px] items-center justify-center rounded-lg border px-2 text-sm font-semibold ${
                  page === p ? 'border-dle-blue bg-dle-blue text-white' : 'border-slate-200 text-slate-600'
                }`}
              >
                {p}
              </button>
            ))}
            <button
              type="button"
              disabled={page >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 disabled:opacity-40"
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

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
