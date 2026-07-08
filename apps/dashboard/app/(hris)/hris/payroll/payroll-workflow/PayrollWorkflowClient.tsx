'use client';

import PayrollPeriodContextBar from '../../payroll-management/PayrollPeriodContextBar';
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Coins,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Lock,
  MoreHorizontal,
  Play,
  Plus,
  ReceiptText,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/* ------------------------------------------------------------------ */
/*  Live payroll payload (subset consumed by the command center)       */
/* ------------------------------------------------------------------ */

type Severity = 'Low' | 'Medium' | 'High';

type PayrollRun = {
  id: string;
  period: string;
  status: string;
  employeeCount: number;
  grossPay: number;
  deductions: number;
  netPay: number;
  createdAt: string;
  createdBy: string;
  validatedAt?: string | null;
  validatedBy?: string | null;
  submittedAt?: string | null;
  submittedBy?: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  releasedAt?: string | null;
  releasedBy?: string | null;
  lockedAt: string | null;
  payslipsGeneratedAt?: string | null;
  payslipsGeneratedBy?: string | null;
  bankScheduleGeneratedAt?: string | null;
  bankScheduleGeneratedBy?: string | null;
  statutorySchedulesGeneratedAt?: string | null;
  statutorySchedulesGeneratedBy?: string | null;
  postedAt: string | null;
  postedBy?: string | null;
  artifacts?: Array<{ type: string; label: string; fileName: string; generatedAt: string; generatedBy: string }>;
};

type PayrollException = {
  id: string;
  employeeId: string;
  employeeName: string;
  issue: string;
  severity: Severity;
  owner: string;
  department?: string;
};

type PayrollAuditEntry = {
  id: string;
  at: string;
  user: string;
  role: string;
  action: string;
  record: string;
};

type PayrollPayload = {
  generatedAt: string;
  source: string;
  role: string;
  permissions: {
    canViewMoney: boolean;
    canManageRun: boolean;
    canApprove: boolean;
    canPost: boolean;
    canConfigure?: boolean;
    canReopen?: boolean;
    canExport: boolean;
  };
  period: string;
  periodLabel: string;
  payrollComputed?: boolean;
  dataMode?: 'live' | 'snapshot' | 'run-header' | 'pending';
  isViewingActivePeriod?: boolean;
  activePeriodLabel?: string;
  summary: {
    totalEmployees: number;
    payrollEligible: number;
    readyEmployees: number;
    reviewEmployees: number;
    blockedEmployees: number;
    payrollCoveragePct: number;
    grossPay: number | null;
    deductions: number | null;
    netPay: number | null;
    basePay: number | null;
    allowances: number | null;
    exceptionCount: number;
  };
  runs: PayrollRun[];
  records?: Array<{ department?: string; grossPay?: number | null; netPay?: number | null; deductions?: number | null; payrollStatus?: string }>;
  exceptions: PayrollException[];
  breakdowns: {
    byPayrollGroup: { label: string; employees: number; grossPay: number; netPay: number; exceptions: number }[];
    byDepartment: { label: string; employees: number; grossPay: number; netPay: number; exceptions: number }[];
    byEmploymentType: { label: string; employees: number; grossPay: number; netPay: number; exceptions: number }[];
  };
  workflow?: { currentStatus: string; nextOwner: string; blockedActions: string[]; approvalStage: string };
  auditTrail?: PayrollAuditEntry[];
  periodRecord?: {
    period: string;
    periodLabel: string;
    status: string;
    paymentDate: string | null;
    openedAt: string | null;
    openedBy: string | null;
    closedAt: string | null;
    closedBy: string | null;
  } | null;
  periods?: Array<{
    period: string;
    periodLabel: string;
    status: string;
    runStatus: string | null;
    runId: string | null;
    isActive: boolean;
    paymentDate: string | null;
    openedAt: string | null;
    closedAt: string | null;
  }>;
  currentRun?: PayrollRun | null;
};

type ApiResponse<T> = { status: 'success' | 'error'; data?: T; error?: string };

/* ------------------------------------------------------------------ */
/*  Formatting helpers                                                 */
/* ------------------------------------------------------------------ */

const numberFmt = new Intl.NumberFormat('en-GB');
const moneyFmt = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });

const number = (value: number | null | undefined) => numberFmt.format(Number(value || 0));
const money = (value: number | null | undefined, canView = true) => {
  if (!canView) return 'Restricted';
  if (value == null) return '—';
  return moneyFmt.format(value);
};
const fmtDate = (value?: string | null) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};
const fmtDateTime = (value?: string | null) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const readApiResponse = async <T,>(res: Response): Promise<ApiResponse<T>> => {
  const text = await res.text();
  if (!text.trim()) return { status: 'error', error: `Empty response (${res.status})` };
  try {
    return JSON.parse(text) as ApiResponse<T>;
  } catch {
    return { status: 'error', error: text.slice(0, 200) || `Invalid response (${res.status})` };
  }
};

const runFor = (payload: PayrollPayload | null) =>
  payload?.currentRun || payload?.runs?.find((run) => run.period === payload?.period) || null;

const MAKER_ROLES = new Set(['Super Admin', 'Payroll Officer', 'HR Director', 'HR Manager', 'Finance Manager', 'CFO']);

const RELEASED = ['Released', 'Locked', 'Posted', 'Published', 'Closed'];
const APPROVED = ['Approved', ...RELEASED];
const SUBMITTED = ['Submitted', 'Under Review', ...APPROVED];
const COMPUTED = ['Computed', 'Calculated', 'Ready for Approval', ...SUBMITTED];
const VALIDATED = ['Validated', ...COMPUTED];
const PRE_SUBMISSION = ['Draft', 'Open', 'Validation', 'Validated', 'Computed', 'Calculated', 'Ready for Approval', 'Revision Requested', 'Rejected'];

type StageAction = {
  id: string;
  label: string;
  icon: any;
  variant: 'primary' | 'secondary';
  allowed: boolean;
  reason: string;
};

/* ------------------------------------------------------------------ */
/*  Status badge palette                                               */
/* ------------------------------------------------------------------ */

type BadgeTone = 'completed' | 'pending' | 'blocked' | 'running' | 'closed' | 'neutral';

const badgeStyles: Record<BadgeTone, string> = {
  completed: 'bg-[#ECFDF5] text-[#047857]',
  pending: 'bg-[#FFF7ED] text-[#B45309]',
  blocked: 'bg-[#FEF2F2] text-[#B91C1C]',
  running: 'bg-[#DBEAFE] text-[#1D4ED8]',
  closed: 'bg-[#EFF6FF] text-[#1E40AF]',
  neutral: 'bg-slate-100 text-slate-600',
};

const StatusBadge = ({ tone, children }: { tone: BadgeTone; children: React.ReactNode }) => (
  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${badgeStyles[tone]}`}>
    {children}
  </span>
);

/* ------------------------------------------------------------------ */
/*  Small presentational primitives                                    */
/* ------------------------------------------------------------------ */

const CARD = 'rounded-[20px] border border-[#E2E8F0] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)]';

function Card({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return <section className={`${CARD} ${className}`}>{children}</section>;
}

function SectionHeader({ icon: Icon, title, badge, action }: { icon?: any; title: string; badge?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        {Icon ? <Icon className="h-4 w-4 text-[#2563EB]" /> : null}
        <h3 className="text-[13px] font-extrabold uppercase tracking-wide text-[#0F172A]">{title}</h3>
        {badge}
      </div>
      {action}
    </div>
  );
}

function Sparkline({ data, color = '#2563EB' }: { data: number[]; color?: string }) {
  if (!data.length || data.every((v) => !v)) return <div className="h-8" />;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 120;
  const h = 32;
  const step = data.length > 1 ? w / (data.length - 1) : w;
  const points = data.map((v, i) => `${i * step},${h - ((v - min) / range) * (h - 4) - 2}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-full" preserveAspectRatio="none" aria-hidden>
      <polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ProgressRow({ label, value, total, color = '#2563EB', canView = true }: { label: string; value: number; total: number; color?: string; canView?: boolean }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-[12px] font-semibold text-[#334155]">
        <span>{label}</span>
        <span className="tabular-nums text-[#64748B]">{canView ? `${number(value)} · ${pct}%` : `${pct}%`}</span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function Donut({ segments, total, centerLabel }: { segments: { value: number; color: string }[]; total: number; centerLabel: string }) {
  const radius = 52;
  const stroke = 16;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const safeTotal = total || 1;
  return (
    <div className="relative h-[132px] w-[132px]">
      <svg viewBox="0 0 132 132" className="h-full w-full -rotate-90">
        <circle cx="66" cy="66" r={radius} fill="none" stroke="#F1F5F9" strokeWidth={stroke} />
        {total > 0
          ? segments.map((seg, i) => {
              const len = (seg.value / safeTotal) * circumference;
              const dash = `${len} ${circumference - len}`;
              const el = (
                <circle
                  key={i}
                  cx="66"
                  cy="66"
                  r={radius}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={stroke}
                  strokeDasharray={dash}
                  strokeDashoffset={-offset}
                  strokeLinecap="butt"
                />
              );
              offset += len;
              return el;
            })
          : null}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[26px] font-extrabold leading-none text-[#0F172A]">{centerLabel}</span>
        <span className="text-[11px] font-semibold text-[#94A3B8]">Total Risks</span>
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, title, description }: { icon: any; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#E2E8F0] bg-[#FBFCFE] px-6 py-8 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <Icon className="h-5 w-5" />
      </span>
      <p className="mt-3 text-[13px] font-bold text-[#0F172A]">{title}</p>
      <p className="mt-1 max-w-xs text-[12px] font-medium text-[#64748B]">{description}</p>
    </div>
  );
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-100 ${className}`} />;
}

/* ------------------------------------------------------------------ */
/*  Main client                                                        */
/* ------------------------------------------------------------------ */

export default function PayrollWorkflowClient() {
  const [payload, setPayload] = useState<PayrollPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [toast, setToast] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [viewPeriod, setViewPeriod] = useState<string | null>(null);
  const viewPeriodRef = useRef<string | null>(null);
  const loadSeq = useRef(0);

  useEffect(() => {
    viewPeriodRef.current = viewPeriod;
  }, [viewPeriod]);

  const load = useCallback(async (periodOverride?: string | null) => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setError('');
    try {
      const periodQuery = periodOverride !== undefined && periodOverride !== null ? periodOverride : viewPeriodRef.current;
      const url = periodQuery ? `/api/hris/payroll-management?period=${encodeURIComponent(periodQuery)}` : '/api/hris/payroll-management';
      const res = await fetch(url, { cache: 'no-store' });
      const json = await readApiResponse<PayrollPayload>(res);
      if (seq !== loadSeq.current) return;
      if (!res.ok || json.status !== 'success' || !json.data) throw new Error(json.error || `Payroll request failed (${res.status})`);
      setPayload(json.data);
      setViewPeriod(json.data.period);
    } catch (e) {
      if (seq !== loadSeq.current) return;
      setError(e instanceof Error ? e.message : 'Unable to load payroll workflow');
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live refresh every 30s
  useEffect(() => {
    const interval = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(interval);
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(''), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const runAction = useCallback(
    async (action: string, extra: Record<string, unknown> = {}) => {
      setBusyAction(action);
      setToast('');
      try {
        const res = await fetch('/api/hris/payroll-management', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action, period: payload?.period, runId: runFor(payload)?.id, ...extra }),
        });
        const json = await readApiResponse<{ run: PayrollRun }>(res);
        if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Payroll action failed');
        setToast(`${action.replace(/-/g, ' ')} completed.`);
        await load((extra.period as string | undefined) || viewPeriod || payload?.period || null);
        return true;
      } catch (e) {
        setToast(e instanceof Error ? e.message : 'Payroll action failed');
        return false;
      } finally {
        setBusyAction('');
      }
    },
    [payload, load],
  );

  const run = runFor(payload);
  const canViewMoney = Boolean(payload?.permissions.canViewMoney);
  const canManage = Boolean(payload?.permissions.canManageRun);
  const role = payload?.role || 'Viewer';
  const canCreatePeriod = MAKER_ROLES.has(role) && canManage;
  const runStatus = run?.status || payload?.workflow?.currentStatus || 'Draft';
  const summary = payload?.summary;
  const issues = payload?.exceptions || [];
  const hasActivePeriod = Boolean(payload?.periodRecord || run);

  /* ---- derived: KPI sparklines from live department breakdown ---- */
  const deptGross = useMemo(() => (payload?.breakdowns.byDepartment || []).map((d) => d.grossPay), [payload]);
  const deptNet = useMemo(() => (payload?.breakdowns.byDepartment || []).map((d) => d.netPay), [payload]);
  const deptDeductions = useMemo(
    () => (payload?.breakdowns.byDepartment || []).map((d) => Math.max(0, d.grossPay - d.netPay)),
    [payload],
  );
  const deptEmployees = useMemo(() => (payload?.breakdowns.byDepartment || []).map((d) => d.employees), [payload]);
  const eligible = summary?.payrollEligible || summary?.totalEmployees || 0;

  /* ---- derived: risk buckets from live severity ---- */
  const risk = useMemo(() => {
    const high = issues.filter((i) => i.severity === 'High').length;
    const medium = issues.filter((i) => i.severity === 'Medium').length;
    const low = issues.filter((i) => i.severity === 'Low').length;
    const critical = summary?.blockedEmployees || 0;
    return { critical, high, medium, low, total: critical + high + medium + low };
  }, [issues, summary]);

  /* ---- derived: workflow nodes (spec 6 stages) ---- */
  const nodes = useMemo(() => {
    const done = (statuses: string[], stamp?: string | null) => Boolean(stamp) || statuses.includes(runStatus);
    const raw = [
      { key: 'draft', label: 'Draft', owner: run?.createdBy || 'Payroll Officer', at: run?.createdAt, done: Boolean(run?.createdAt) },
      { key: 'prevalidation', label: 'Pre-Validation', owner: run?.validatedBy || 'Payroll Supervisor', at: run?.validatedAt, done: done(VALIDATED, run?.validatedAt) },
      { key: 'computation', label: 'Payroll Computation', owner: run?.createdBy || 'Payroll Officer', at: run?.createdAt, done: done(COMPUTED) },
      { key: 'approval', label: 'Approval Workflow', owner: run?.approvedBy || payload?.workflow?.nextOwner || 'HR / Finance', at: run?.approvedAt, done: done(APPROVED, run?.approvedAt) },
      { key: 'release', label: 'Payroll Release', owner: run?.releasedBy || 'Payroll Officer', at: run?.releasedAt, done: done(RELEASED, run?.releasedAt) },
      { key: 'lock', label: 'Payroll Lock', owner: run?.postedBy || 'System Control', at: run?.lockedAt || run?.postedAt, done: Boolean(run?.lockedAt) || ['Locked', 'Closed'].includes(runStatus) },
    ];
    const firstPending = raw.findIndex((n) => !n.done);
    return raw.map((n, i) => {
      let state: 'completed' | 'current' | 'pending' | 'blocked' = n.done ? 'completed' : 'pending';
      if (!n.done && i === firstPending) {
        state = issues.length && (n.key === 'prevalidation' || n.key === 'computation') ? 'blocked' : 'current';
      }
      return { ...n, state };
    });
  }, [run, runStatus, issues.length, payload]);

  /* ---- derived: live progress ---- */
  const progress = useMemo(() => {
    const total = summary?.totalEmployees || 0;
    const processed = payload?.payrollComputed || COMPUTED.includes(runStatus) ? eligible : summary?.readyEmployees || 0;
    const validated = VALIDATED.includes(runStatus) || run?.validatedAt ? eligible : 0;
    const approved = APPROVED.includes(runStatus) || run?.approvedAt ? eligible : 0;
    const released = RELEASED.includes(runStatus) || run?.releasedAt ? eligible : 0;
    return { total, processed, validated, approved, released };
  }, [summary, payload, runStatus, run, eligible]);

  /* ---- derived: SLA compliance (truthful stage completion) ---- */
  const sla = useMemo(
    () => [
      { label: 'Data Validation', pct: VALIDATED.includes(runStatus) || run?.validatedAt ? 100 : issues.length ? 40 : 0 },
      { label: 'Payroll Computation', pct: COMPUTED.includes(runStatus) ? 100 : 0 },
      { label: 'Approvals', pct: APPROVED.includes(runStatus) || run?.approvedAt ? 100 : SUBMITTED.includes(runStatus) ? 50 : 0 },
      { label: 'Bank Export', pct: run?.bankScheduleGeneratedAt ? 100 : 0 },
    ],
    [runStatus, run, issues.length],
  );

  /* ---- derived: payroll outputs ---- */
  const outputs = useMemo(
    () => [
      { label: 'Payslip Generated', at: run?.payslipsGeneratedAt, file: run?.artifacts?.find((a) => /payslip/i.test(a.type))?.fileName, count: run?.employeeCount },
      { label: 'Bank Schedule File', at: run?.bankScheduleGeneratedAt, file: run?.artifacts?.find((a) => /bank/i.test(a.type))?.fileName },
      { label: 'Pension Schedule', at: run?.statutorySchedulesGeneratedAt, file: run?.artifacts?.find((a) => /pension/i.test(a.type))?.fileName },
      { label: 'Tax File (PAYE)', at: run?.statutorySchedulesGeneratedAt, file: run?.artifacts?.find((a) => /paye|tax/i.test(a.type))?.fileName },
      { label: 'Accounting Journal', at: run?.postedAt, file: run?.artifacts?.find((a) => /journal|gl/i.test(a.type))?.fileName },
    ],
    [run],
  );

  /* ---- derived: approval matrix ---- */
  const approvalMatrix = useMemo(
    () => [
      { role: 'Payroll Officer', by: run?.createdBy, at: run?.createdAt, complete: Boolean(run?.createdAt) },
      { role: 'Payroll Supervisor', by: run?.validatedBy, at: run?.validatedAt, complete: Boolean(run?.validatedAt) },
      { role: 'HR / Finance', by: run?.submittedBy, at: run?.submittedAt, complete: Boolean(run?.submittedAt) },
      { role: 'Approver', by: run?.approvedBy, at: run?.approvedAt, complete: Boolean(run?.approvedAt) },
      { role: 'Release Control', by: run?.releasedBy, at: run?.releasedAt, complete: Boolean(run?.releasedAt) },
    ],
    [run],
  );

  /* ---- derived: job monitor ---- */
  const jobs = useMemo(() => {
    const jobStatus = (done: boolean, active: boolean): { label: string; tone: BadgeTone } =>
      done ? { label: 'Completed', tone: 'completed' } : active ? { label: 'Running', tone: 'running' } : { label: 'Queued', tone: 'pending' };
    return [
      { name: 'Payroll Engine', ...jobStatus(COMPUTED.includes(runStatus), VALIDATED.includes(runStatus)) },
      { name: 'Tax Engine', ...jobStatus(COMPUTED.includes(runStatus), false) },
      { name: 'Pension Service', ...jobStatus(Boolean(run?.statutorySchedulesGeneratedAt), RELEASED.includes(runStatus)) },
      { name: 'Bank File Generator', ...jobStatus(Boolean(run?.bankScheduleGeneratedAt), RELEASED.includes(runStatus)) },
      { name: 'Payslip Generator', ...jobStatus(Boolean(run?.payslipsGeneratedAt), RELEASED.includes(runStatus)) },
    ];
  }, [runStatus, run]);

  /* ---- derived: notifications & audit from live audit trail ---- */
  const auditEntries = payload?.auditTrail || [];
  const notifications = useMemo(() => auditEntries.slice(0, 6), [auditEntries]);

  /* ---- derived: stage-aware action set ----
     Payroll can be run and re-run any number of times before submission so
     officers can review computed figures before routing for approval. */
  const stageActions = useMemo<StageAction[]>(() => {
    if (!hasActivePeriod) return [];
    const canApprove = Boolean(payload?.permissions.canApprove);
    const blocked = summary?.blockedEmployees || 0;
    const preSubmission = PRE_SUBMISSION.includes(runStatus);
    const computed = COMPUTED.includes(runStatus);
    const list: StageAction[] = [];

    list.push({
      id: 'validate-payroll',
      label: 'Validate Payroll',
      icon: ClipboardCheck,
      variant: 'secondary',
      allowed: canManage && preSubmission,
      reason: canManage ? (preSubmission ? '' : 'Validation repeats only before submission.') : 'You are not permitted to validate payroll.',
    });
    list.push({
      id: 'create-run',
      label: computed ? 'Re-run Payroll' : 'Run Payroll',
      icon: computed ? RefreshCw : Play,
      variant: computed ? 'secondary' : 'primary',
      allowed: canManage && blocked === 0 && runStatus !== 'Closed',
      reason: runStatus === 'Closed'
        ? 'Reopen the payroll period before re-running payroll.'
        : blocked > 0
          ? `Resolve ${number(blocked)} blocked employee(s) before running payroll.`
          : canManage
            ? ''
            : 'You are not permitted to run payroll.',
    });

    if ((computed || VALIDATED.includes(runStatus)) && !SUBMITTED.includes(runStatus)) {
      list.push({
        id: 'submit-run',
        label: 'Submit for Approval',
        icon: Send,
        variant: 'primary',
        allowed: canManage && blocked === 0,
        reason: blocked > 0 ? `Resolve ${number(blocked)} blocked employee(s) before submitting.` : canManage ? '' : 'You are not permitted to submit payroll.',
      });
    }

    if (['Submitted', 'Under Review'].includes(runStatus)) {
      list.push({ id: 'approve-run', label: 'Approve Payroll', icon: ShieldCheck, variant: 'primary', allowed: canApprove, reason: canApprove ? '' : 'Approval is restricted to authorized approvers.' });
    }
    if (runStatus === 'Approved') {
      list.push({ id: 'release-run', label: 'Release Payroll', icon: Banknote, variant: 'primary', allowed: canManage, reason: canManage ? '' : 'You are not permitted to release payroll.' });
    }
    if (RELEASED.includes(runStatus) && !run?.payslipsGeneratedAt) {
      list.push({ id: 'generate-payslips', label: 'Generate Payslips', icon: ReceiptText, variant: 'primary', allowed: canManage, reason: canManage ? '' : 'You are not permitted to generate payslips.' });
    }
    if (runStatus === 'Posted') {
      list.push({ id: 'close-period', label: 'Close Period', icon: Lock, variant: 'primary', allowed: canManage || canApprove, reason: canManage || canApprove ? '' : 'You are not permitted to close the period.' });
    }
    return list;
  }, [hasActivePeriod, runStatus, run, canManage, payload, summary]);

  const runStatusTone: BadgeTone = APPROVED.includes(runStatus) || runStatus === 'Closed' ? 'completed' : issues.length ? 'blocked' : SUBMITTED.includes(runStatus) ? 'running' : 'pending';

  /* ---- derived: draft periods awaiting activation ---- */
  const draftPeriods = useMemo(
    () => (payload?.periods || []).filter((p) => !p.isActive && ['Draft', 'Reopened'].includes(p.status)),
    [payload],
  );

  const exportUrl = (format: 'csv' | 'xls') => {
    const params = new URLSearchParams({ format, report: 'payroll-register', status: 'All' });
    if (payload?.period) params.set('period', payload.period);
    return `/api/hris/payroll-management?${params.toString()}`;
  };

  /* ------------------------------------------------------------------ */

  return (
    <main className="min-h-screen bg-[#F5F7FB] p-4 text-[#0F172A] lg:p-6">
      <div className="mx-auto max-w-[1600px] space-y-4">
        {/* Page header + actions */}
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl bg-[#081A3A] text-white shadow-[0_8px_24px_rgba(15,23,42,0.18)]">
              <Coins className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-[30px] font-extrabold leading-tight tracking-tight text-[#0F172A]">Payroll Workflow</h1>
              <p className="mt-0.5 max-w-2xl text-[13px] font-medium text-[#64748B]">
                Monitor payroll progress, execute workflow stages, approvals, audit trail and payroll release.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canCreatePeriod ? (
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#2563EB] px-4 text-[13px] font-bold text-white shadow-[0_6px_18px_rgba(37,99,235,0.18)] transition hover:-translate-y-0.5 hover:bg-[#1D4ED8]"
              >
                <Plus className="h-4 w-4" />
                Create Payroll Period
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void load(viewPeriod || payload?.period || null)}
              disabled={loading}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-3.5 text-[13px] font-bold text-[#334155] transition hover:-translate-y-0.5 hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            {payload?.permissions.canExport ? (
              <>
                <a href={exportUrl('csv')} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-3.5 text-[13px] font-bold text-[#334155] transition hover:-translate-y-0.5 hover:bg-slate-50">
                  <FileText className="h-4 w-4" />
                  Export CSV
                </a>
                <a href={exportUrl('xls')} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#22C55E] px-3.5 text-[13px] font-bold text-white shadow-[0_6px_18px_rgba(34,197,94,0.18)] transition hover:-translate-y-0.5 hover:bg-emerald-600">
                  <FileSpreadsheet className="h-4 w-4" />
                  Export Excel
                </a>
              </>
            ) : null}
            <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#E2E8F0] bg-white text-[#334155] hover:bg-slate-50">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Payroll period context */}
        <PayrollPeriodContextBar
          payload={payload}
          viewPeriod={viewPeriod}
          showMetaBadges={false}
          onSelectPeriod={(period) => {
            setViewPeriod(period);
            void load(period);
          }}
        />

        {error ? (
          <Card className="border-[#FECACA] bg-[#FEF2F2] p-4">
            <p className="text-[13px] font-bold text-[#B91C1C]">{error}</p>
            <button onClick={() => void load()} className="mt-2 text-[12px] font-bold text-[#2563EB] underline">Retry</button>
          </Card>
        ) : null}

        {toast ? (
          <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-[#0F172A] px-4 py-3 text-[13px] font-bold text-white shadow-lg">{toast}</div>
        ) : null}

        {loading && !payload ? (
          <LoadingSkeleton />
        ) : (
          <>
            {/* Draft periods awaiting activation */}
            {canCreatePeriod && draftPeriods.length ? (
              <Card className="border-[#FDE68A] bg-[#FFF7ED] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-2">
                    <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-[#B45309]" />
                    <div>
                      <p className="text-[13px] font-extrabold text-[#0F172A]">
                        {draftPeriods.length === 1 ? 'A draft payroll period is not yet active' : `${draftPeriods.length} draft payroll periods are not yet active`}
                      </p>
                      <p className="text-[12px] font-medium text-[#92400E]">
                        Opening a draft period makes it the live processing month and closes the current active period across Payroll Management.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {draftPeriods.map((p) => (
                      <button
                        key={p.period}
                        type="button"
                        disabled={busyAction === 'open-period'}
                        onClick={() => void runAction('open-period', { period: p.period })}
                        className="inline-flex h-9 items-center gap-2 rounded-xl bg-[#F59E0B] px-3.5 text-[12px] font-bold text-white hover:bg-amber-600 disabled:opacity-60"
                      >
                        {busyAction === 'open-period' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                        Open {p.periodLabel}
                      </button>
                    ))}
                  </div>
                </div>
              </Card>
            ) : null}

            {/* ---------------- Row 1: Period card + KPI row + Health ---------------- */}
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[300px_1fr]">
              {/* Current period */}
              {hasActivePeriod ? (
                <Card className="p-4">
                  <SectionHeader icon={CalendarClock} title="Current Payroll Period" badge={<StatusBadge tone={payload?.periodRecord?.status === 'Closed' ? 'closed' : 'completed'}>{payload?.periodRecord?.status || (run ? runStatus : 'Active')}</StatusBadge>} />
                  <p className="mt-3 text-[22px] font-extrabold text-[#0F172A]">{payload?.periodLabel}</p>
                  <dl className="mt-3 space-y-2 text-[12px]">
                    <PeriodField label="Payroll Type" value="Monthly" />
                    <PeriodField label="Start Date" value={fmtDate(periodStart(payload?.period))} />
                    <PeriodField label="End Date" value={fmtDate(periodEnd(payload?.period))} />
                    <PeriodField label="Cut-off Date" value={fmtDate(periodCutoff(payload?.period))} />
                    <PeriodField label="Payment Date" value={fmtDate(payload?.periodRecord?.paymentDate || periodPayment(payload?.period))} />
                    <PeriodField label="Status" value={payload?.periodRecord?.status || runStatus} />
                    <PeriodField label="Locked" value={run?.lockedAt ? 'Yes' : 'No'} />
                    <PeriodField label="Released" value={run?.releasedAt ? 'Yes' : 'No'} />
                  </dl>
                  <div className="mt-3 flex gap-2">
                    <a href="/hris/payroll-management" className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-[12px] font-bold text-[#334155] hover:bg-slate-50">
                      View History
                    </a>
                    <a href="/hris/payroll-management" className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-[12px] font-bold text-[#334155] hover:bg-slate-50">
                      Period Settings
                    </a>
                  </div>
                </Card>
              ) : (
                <Card className="flex flex-col items-center justify-center p-6 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400"><CalendarClock className="h-6 w-6" /></span>
                  <p className="mt-3 text-[15px] font-extrabold text-[#0F172A]">No Active Payroll Period</p>
                  <p className="mt-1 text-[12px] font-medium text-[#64748B]">Create a payroll period to begin payroll processing.</p>
                  {canCreatePeriod ? (
                    <button onClick={() => setCreateOpen(true)} className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-[#2563EB] px-4 text-[13px] font-bold text-white hover:bg-[#1D4ED8]">
                      <Plus className="h-4 w-4" /> Create Payroll Period
                    </button>
                  ) : null}
                </Card>
              )}

              {/* KPI row */}
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <KpiCard icon={Users} tone="#2563EB" title="Ready Employees" value={summary ? number(summary.readyEmployees) : '—'} source="Live from HRIS" spark={deptEmployees} />
                <KpiCard icon={Banknote} tone="#22C55E" title="Gross Pay" value={money(summary?.grossPay, canViewMoney)} source="Payroll Engine" spark={deptGross} />
                <KpiCard icon={ReceiptText} tone="#8B5CF6" title="Deductions" value={money(summary?.deductions, canViewMoney)} source="Payroll Engine" spark={deptDeductions} />
                <KpiCard icon={Coins} tone="#06B6D4" title="Net Pay" value={money(summary?.netPay, canViewMoney)} source="Payroll Engine" spark={deptNet} />
              </div>
            </div>

            {/* ---------------- Row 2: Workflow timeline + AI insights ---------------- */}
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
              <Card className="p-4">
                <SectionHeader
                  icon={Sparkles}
                  title="Payroll Workflow"
                  badge={<StatusBadge tone={runStatusTone}>{runStatus}</StatusBadge>}
                  action={
                    stageActions.length ? (
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {stageActions.map((sa) => (
                          <button
                            key={sa.id}
                            type="button"
                            disabled={!sa.allowed || Boolean(busyAction)}
                            title={sa.reason || sa.label}
                            onClick={() => void runAction(sa.id)}
                            className={`inline-flex h-9 items-center gap-2 rounded-xl px-3.5 text-[12px] font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                              sa.variant === 'primary'
                                ? 'bg-[#2563EB] text-white hover:bg-[#1D4ED8]'
                                : 'border border-[#E2E8F0] bg-white text-[#334155] hover:bg-slate-50'
                            }`}
                          >
                            {busyAction === sa.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <sa.icon className="h-4 w-4" />}
                            {sa.label}
                          </button>
                        ))}
                      </div>
                    ) : null
                  }
                />
                <p className="mt-1 text-[12px] font-medium text-[#64748B]">
                  {PRE_SUBMISSION.includes(runStatus)
                    ? 'Run and re-run payroll as many times as needed to review figures before submitting for approval.'
                    : 'Stay informed on every payroll step · Live status auto-refreshes every 30s.'}
                </p>
                <div className="mt-5 overflow-x-auto pb-2">
                  <div className="flex min-w-[880px] items-start">
                    {nodes.map((node, i) => (
                      <div key={node.key} className="flex flex-1 items-start">
                        <WorkflowNode node={node} />
                        {i < nodes.length - 1 ? (
                          <div className={`mt-6 h-0.5 flex-1 rounded-full ${node.state === 'completed' ? 'bg-[#22C55E]' : 'bg-[#E2E8F0]'}`} />
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              <Card className="p-4">
                <SectionHeader icon={Sparkles} title="AI Payroll Insights" badge={<StatusBadge tone="running">BETA</StatusBadge>} />
                {!payload?.payrollComputed && !COMPUTED.includes(runStatus) ? (
                  <div className="mt-3">
                    <EmptyState icon={Sparkles} title="No payroll insights yet" description="Insights will appear after payroll validation and computation." />
                  </div>
                ) : (
                  <ul className="mt-3 space-y-2.5">
                    <InsightItem tone="#EF4444" text={`${number(issues.length)} item(s) require your attention`} detail={`${risk.critical} critical, ${risk.high} high severity`} />
                    <InsightItem tone="#F59E0B" text="Pension configuration" detail={`${number(summary?.blockedEmployees || 0)} employee(s) blocked for setup`} />
                    <InsightItem tone="#2563EB" text="Statutory tax (PAYE)" detail={run?.statutorySchedulesGeneratedAt ? 'Schedules generated' : 'Pending schedule generation'} />
                    <InsightItem tone="#8B5CF6" text="Estimated payroll variance" detail={money(summary?.grossPay, canViewMoney)} />
                    <li className="rounded-xl bg-[#F5F3FF] px-3 py-2 text-[12px] font-semibold text-[#6D28D9]">
                      Recommendation: {issues.length ? 'Resolve validation issues before submitting for approval.' : 'Payroll is clean — proceed to approval routing.'}
                    </li>
                  </ul>
                )}
              </Card>
            </div>

            {/* ---------------- Row 3: Live progress + Risk + SLA ---------------- */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card className="p-4">
                <SectionHeader icon={TrendingUp} title="Live Progress" />
                <div className="mt-4 space-y-3">
                  <ProgressRow label="Total Employees" value={progress.total} total={progress.total} color="#2563EB" canView />
                  <ProgressRow label="Processed" value={progress.processed} total={progress.total} color="#06B6D4" canView />
                  <ProgressRow label="Validated" value={progress.validated} total={progress.total} color="#8B5CF6" canView />
                  <ProgressRow label="Approved" value={progress.approved} total={progress.total} color="#F59E0B" canView />
                  <ProgressRow label="Released" value={progress.released} total={progress.total} color="#22C55E" canView />
                </div>
              </Card>

              <Card className="p-4">
                <SectionHeader icon={AlertTriangle} title="Risk Overview" />
                {risk.total ? (
                  <div className="mt-3 flex items-center gap-4">
                    <Donut
                      total={risk.total}
                      centerLabel={number(risk.total)}
                      segments={[
                        { value: risk.critical, color: '#EF4444' },
                        { value: risk.high, color: '#F59E0B' },
                        { value: risk.medium, color: '#06B6D4' },
                        { value: risk.low, color: '#22C55E' },
                      ]}
                    />
                    <ul className="space-y-1.5 text-[12px] font-semibold">
                      <RiskLegend color="#EF4444" label="Critical" value={risk.critical} />
                      <RiskLegend color="#F59E0B" label="High" value={risk.high} />
                      <RiskLegend color="#06B6D4" label="Medium" value={risk.medium} />
                      <RiskLegend color="#22C55E" label="Low" value={risk.low} />
                    </ul>
                  </div>
                ) : (
                  <div className="mt-3"><EmptyState icon={CheckCircle2} title="No risks detected" description="No payroll risks or blocking issues found for this period." /></div>
                )}
              </Card>

              <Card className="p-4">
                <SectionHeader icon={ShieldCheck} title="SLA Compliance" />
                <div className="mt-4 space-y-3">
                  {sla.map((s) => (
                    <div key={s.label}>
                      <div className="flex items-center justify-between text-[12px] font-semibold text-[#334155]">
                        <span>{s.label}</span>
                        <span className="tabular-nums text-[#64748B]">{s.pct}%</span>
                      </div>
                      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${s.pct}%`, backgroundColor: s.pct >= 90 ? '#22C55E' : s.pct >= 50 ? '#F59E0B' : '#EF4444' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* ---------------- Row 4: Pending issues + Outputs + Audit ---------------- */}
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.5fr_1fr_1fr]">
              <Card className="p-4">
                <SectionHeader icon={AlertTriangle} title={`Pending Issues (${number(issues.length)})`} />
                {issues.length ? (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-left text-[12px]">
                      <thead>
                        <tr className="border-b border-[#E2E8F0] text-[11px] font-bold uppercase text-[#94A3B8]">
                          <th className="pb-2 pr-3">Employee</th>
                          <th className="pb-2 pr-3">Issue</th>
                          <th className="pb-2 pr-3">Severity</th>
                          <th className="pb-2 pr-3">Assigned To</th>
                          <th className="pb-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {issues.slice(0, 8).map((issue) => (
                          <tr key={issue.id}>
                            <td className="py-2 pr-3">
                              <p className="font-bold text-[#0F172A]">{issue.employeeName}</p>
                              <p className="text-[11px] text-[#94A3B8]">{issue.employeeId}{issue.department ? ` · ${issue.department}` : ''}</p>
                            </td>
                            <td className="py-2 pr-3 text-[#475569]">{issue.issue}</td>
                            <td className="py-2 pr-3">
                              <StatusBadge tone={issue.severity === 'High' ? 'blocked' : issue.severity === 'Medium' ? 'pending' : 'neutral'}>{issue.severity}</StatusBadge>
                            </td>
                            <td className="py-2 pr-3 text-[#475569]">{issue.owner}</td>
                            <td className="py-2"><StatusBadge tone="pending">Open</StatusBadge></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {issues.length > 8 ? (
                      <a href="/hris/payroll-management" className="mt-3 inline-flex items-center gap-1 text-[12px] font-bold text-[#2563EB]">
                        View all {number(issues.length)} issues <ArrowRight className="h-3.5 w-3.5" />
                      </a>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-3"><EmptyState icon={CheckCircle2} title="No payroll issues detected" description="All employees passed validation for this payroll period." /></div>
                )}
              </Card>

              <Card className="p-4">
                <SectionHeader icon={Download} title="Payroll Outputs" />
                <ul className="mt-3 space-y-2">
                  {outputs.map((out) => (
                    <li key={out.label} className="flex items-center justify-between rounded-xl border border-[#E2E8F0] px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-bold text-[#0F172A]">{out.label}</p>
                        <p className="text-[11px] text-[#94A3B8]">{out.at ? `Generated ${fmtDateTime(out.at)}` : 'Not generated yet'}</p>
                      </div>
                      {out.at ? (
                        <a href={exportUrl('csv')} className="inline-flex items-center gap-1 rounded-lg bg-[#ECFDF5] px-2.5 py-1 text-[11px] font-bold text-[#047857] hover:bg-emerald-100">
                          <Download className="h-3.5 w-3.5" /> Download
                        </a>
                      ) : (
                        <StatusBadge tone="pending">Pending</StatusBadge>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>

              <Card className="p-4">
                <SectionHeader icon={Clock} title="Audit Trail" />
                {auditEntries.length ? (
                  <ol className="mt-3 space-y-3">
                    {auditEntries.slice(0, 6).map((entry, i) => (
                      <li key={entry.id} className="relative pl-5">
                        <span className={`absolute left-0 top-1 h-2.5 w-2.5 rounded-full ${i === 0 ? 'bg-[#2563EB]' : 'bg-slate-300'}`} />
                        {i < Math.min(auditEntries.length, 6) - 1 ? <span className="absolute left-[4px] top-3.5 h-full w-px bg-slate-200" /> : null}
                        <p className="text-[12px] font-bold text-[#0F172A]">{entry.action}</p>
                        <p className="text-[11px] text-[#64748B]">{entry.record}</p>
                        <p className="text-[11px] text-[#94A3B8]">{fmtDateTime(entry.at)} · {entry.user}</p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="mt-3"><EmptyState icon={Clock} title="No audit events" description="Payroll actions will appear here as the workflow progresses." /></div>
                )}
              </Card>
            </div>

            {/* ---------------- Row 5: Summary + Approval matrix + Job monitor ---------------- */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
              <Card className="p-4">
                <SectionHeader icon={FileText} title="Payroll Summary" />
                <p className="mt-2 text-[12px] font-semibold text-[#64748B]">{payload?.periodLabel || '—'}</p>
                <dl className="mt-3 space-y-2 text-[12px]">
                  <SummaryRow label="Employees" value={summary ? number(summary.totalEmployees) : '—'} />
                  <SummaryRow label="Gross" value={money(summary?.grossPay, canViewMoney)} />
                  <SummaryRow label="Net" value={money(summary?.netPay, canViewMoney)} strong />
                  <SummaryRow label="Deductions" value={money(summary?.deductions, canViewMoney)} />
                  <SummaryRow label="Status" value={runStatus} />
                </dl>
              </Card>

              <Card className="p-4">
                <SectionHeader icon={ClipboardCheck} title="Approval Matrix" />
                <table className="mt-3 w-full text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] text-[11px] font-bold uppercase text-[#94A3B8]">
                      <th className="pb-2 pr-2">Role</th>
                      <th className="pb-2 pr-2">Status</th>
                      <th className="pb-2">Approved On</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {approvalMatrix.map((row) => (
                      <tr key={row.role}>
                        <td className="py-2 pr-2 font-bold text-[#0F172A]">{row.role}<br /><span className="text-[11px] font-medium text-[#94A3B8]">{row.by || '—'}</span></td>
                        <td className="py-2 pr-2"><StatusBadge tone={row.complete ? 'completed' : 'pending'}>{row.complete ? 'Approved' : 'Pending'}</StatusBadge></td>
                        <td className="py-2 text-[11px] text-[#64748B]">{row.at ? fmtDateTime(row.at) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>

              <Card className="p-4">
                <SectionHeader icon={RefreshCw} title="Job Monitor" />
                <ul className="mt-3 space-y-2">
                  {jobs.map((job) => (
                    <li key={job.name} className="flex items-center justify-between rounded-xl border border-[#E2E8F0] px-3 py-2">
                      <span className="text-[12px] font-bold text-[#0F172A]">{job.name}</span>
                      <StatusBadge tone={job.tone}>{job.label}</StatusBadge>
                    </li>
                  ))}
                </ul>
              </Card>

              <Card className="p-4">
                <SectionHeader icon={Sparkles} title="Notifications" />
                {notifications.length ? (
                  <ul className="mt-3 space-y-2.5">
                    {notifications.map((n) => (
                      <li key={n.id} className="flex items-start gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#2563EB]" />
                        <div className="min-w-0">
                          <p className="text-[12px] font-semibold text-[#0F172A]">{n.action}</p>
                          <p className="text-[11px] text-[#94A3B8]">{fmtDateTime(n.at)}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-3"><EmptyState icon={Sparkles} title="No payroll notifications" description="You're all caught up. New payroll events will appear here." /></div>
                )}
              </Card>
            </div>

            {/* ---------------- Row 6: Payroll calendar ---------------- */}
            <Card className="p-4">
              <SectionHeader icon={CalendarClock} title="Payroll Calendar" />
              <PayrollCalendar
                period={payload?.period}
                events={[
                  { date: periodCutoff(payload?.period), label: 'Cut-off / Processing', color: '#F59E0B' },
                  { date: periodPayment(payload?.period) || payload?.periodRecord?.paymentDate || null, label: 'Payment / Release', color: '#22C55E' },
                  { date: periodEnd(payload?.period), label: 'Statutory Filing', color: '#8B5CF6' },
                ]}
              />
            </Card>

            <p className="pb-2 text-center text-[11px] font-medium text-[#94A3B8]">
              Live data from DLE Enterprise HRIS · Last synchronized: {fmtDateTime(payload?.generatedAt)}
            </p>
          </>
        )}
      </div>

      {createOpen ? (
        <CreatePeriodModal
          busy={Boolean(busyAction === 'create-period' || busyAction === 'open-period')}
          onClose={() => setCreateOpen(false)}
          onCreate={async (period, paymentDate, activate) => {
            const created = await runAction('create-period', { period, paymentDate });
            if (!created) return;
            if (activate) {
              const opened = await runAction('open-period', { period });
              setToast(opened ? `${period} created and set as the active payroll period.` : `${period} created as a draft. Open it from Period Management to activate.`);
            } else {
              setToast(`${period} created as a draft. Open it to make it the active payroll period.`);
            }
            setCreateOpen(false);
          }}
        />
      ) : null}
    </main>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function KpiCard({ icon: Icon, tone, title, value, source, spark, progress }: { icon: any; tone: string; title: string; value: string; source: string; spark?: number[]; progress?: number }) {
  return (
    <div className={`${CARD} p-3.5 transition hover:-translate-y-0.5`}>
      <div className="flex items-center justify-between">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg text-white" style={{ backgroundColor: tone }}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">{title}</span>
      </div>
      <p className="mt-2 text-[22px] font-extrabold leading-tight text-[#0F172A]">{value}</p>
      <p className="text-[11px] font-semibold text-[#94A3B8]">{source}</p>
      {typeof progress === 'number' ? (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full" style={{ width: `${progress}%`, backgroundColor: tone }} />
        </div>
      ) : spark ? (
        <div className="mt-1"><Sparkline data={spark} color={tone} /></div>
      ) : null}
    </div>
  );
}

function WorkflowNode({ node }: { node: { label: string; owner: string; at?: string | null; state: 'completed' | 'current' | 'pending' | 'blocked' } }) {
  const map = {
    completed: { ring: 'border-[#22C55E] bg-[#22C55E] text-white', text: 'text-[#047857]', glow: '' },
    current: { ring: 'border-[#2563EB] bg-[#2563EB] text-white', text: 'text-[#1D4ED8]', glow: 'shadow-[0_0_0_6px_rgba(37,99,235,0.15)] animate-pulse' },
    blocked: { ring: 'border-[#EF4444] bg-[#EF4444] text-white', text: 'text-[#B91C1C]', glow: 'shadow-[0_0_0_6px_rgba(239,68,68,0.12)]' },
    pending: { ring: 'border-[#E2E8F0] bg-white text-[#94A3B8]', text: 'text-[#94A3B8]', glow: '' },
  } as const;
  const s = map[node.state];
  return (
    <div className="flex w-[140px] flex-col items-center px-1 text-center">
      <span className={`flex h-12 w-12 items-center justify-center rounded-full border-2 ${s.ring} ${s.glow}`}>
        {node.state === 'completed' ? <CheckCircle2 className="h-5 w-5" /> : node.state === 'blocked' ? <AlertTriangle className="h-5 w-5" /> : node.state === 'current' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Clock className="h-5 w-5" />}
      </span>
      <span className={`mt-2 text-[11px] font-extrabold uppercase leading-tight ${s.text}`}>{node.label}</span>
      <span className="mt-0.5 text-[10px] font-medium text-[#94A3B8]">{node.owner}</span>
      <span className="text-[10px] font-medium text-[#94A3B8]">{node.at ? fmtDateTime(node.at) : node.state === 'pending' ? 'Pending' : ''}</span>
      <span className="mt-1">
        <StatusBadge tone={node.state === 'completed' ? 'completed' : node.state === 'current' ? 'running' : node.state === 'blocked' ? 'blocked' : 'pending'}>
          {node.state === 'completed' ? 'Complete' : node.state === 'current' ? 'In Progress' : node.state === 'blocked' ? 'Blocked' : 'Pending'}
        </StatusBadge>
      </span>
    </div>
  );
}

function InsightItem({ tone, text, detail }: { tone: string; text: string; detail: string }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: tone }} />
      <div className="min-w-0">
        <p className="text-[12px] font-bold text-[#0F172A]">{text}</p>
        <p className="text-[11px] font-medium text-[#64748B]">{detail}</p>
      </div>
    </li>
  );
}

function RiskLegend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <li className="flex items-center gap-2">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-[#475569]">{label}</span>
      <span className="ml-auto tabular-nums font-extrabold text-[#0F172A]">{number(value)}</span>
    </li>
  );
}

function PeriodField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="font-semibold text-[#64748B]">{label}</dt>
      <dd className="font-bold text-[#0F172A]">{value}</dd>
    </div>
  );
}

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="font-semibold text-[#64748B]">{label}</dt>
      <dd className={strong ? 'text-[13px] font-extrabold text-[#047857]' : 'font-bold text-[#0F172A]'}>{value}</dd>
    </div>
  );
}

function PayrollCalendar({ period, events }: { period?: string; events: { date: string | null; label: string; color: string }[] }) {
  const base = period && /^\d{4}-\d{2}$/.test(period) ? new Date(`${period}-01T00:00:00`) : new Date();
  const year = base.getFullYear();
  const month = base.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const eventDays = new Map<number, { color: string; label: string }>();
  events.forEach((e) => {
    if (!e.date) return;
    const d = new Date(e.date);
    if (!Number.isNaN(d.getTime()) && d.getFullYear() === year && d.getMonth() === month) {
      eventDays.set(d.getDate(), { color: e.color, label: e.label });
    }
  });
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);

  return (
    <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-[auto_1fr]">
      <div>
        <p className="mb-2 text-[13px] font-extrabold text-[#0F172A]">{base.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</p>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px]">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <span key={`${d}-${i}`} className="py-1 font-bold text-[#94A3B8]">{d}</span>
          ))}
          {cells.map((d, i) => {
            const evt = d ? eventDays.get(d) : undefined;
            return (
              <span
                key={i}
                title={evt?.label}
                className={`flex h-8 w-8 items-center justify-center rounded-lg font-semibold ${d ? 'text-[#334155]' : ''} ${evt ? 'text-white' : ''}`}
                style={evt ? { backgroundColor: evt.color } : undefined}
              >
                {d || ''}
              </span>
            );
          })}
        </div>
      </div>
      <ul className="space-y-2 self-center">
        {events.filter((e) => e.date).map((e) => (
          <li key={e.label} className="flex items-center gap-2 text-[12px] font-semibold text-[#334155]">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: e.color }} />
            {e.label}
            <span className="ml-auto text-[#64748B]">{fmtDate(e.date)}</span>
          </li>
        ))}
        {!events.some((e) => e.date) ? <li className="text-[12px] font-medium text-[#94A3B8]">No scheduled payroll events.</li> : null}
      </ul>
    </div>
  );
}

function CreatePeriodModal({ busy, onClose, onCreate }: { busy: boolean; onClose: () => void; onCreate: (period: string, paymentDate: string | null, activate: boolean) => void }) {
  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1).padStart(2, '0'));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [payrollType, setPayrollType] = useState('Monthly');
  const [payrollGroup, setPayrollGroup] = useState('All Groups');
  const [paymentDate, setPaymentDate] = useState('');
  const [copyPrevious, setCopyPrevious] = useState(true);
  const [carryEarnings, setCarryEarnings] = useState(true);
  const [carryDeductions, setCarryDeductions] = useState(true);
  const [snapshot, setSnapshot] = useState(true);
  const [activate, setActivate] = useState(true);

  const period = `${year}-${month}`;
  const valid = /^\d{4}-\d{2}$/.test(period);

  const months = [
    ['01', 'January'], ['02', 'February'], ['03', 'March'], ['04', 'April'], ['05', 'May'], ['06', 'June'],
    ['07', 'July'], ['08', 'August'], ['09', 'September'], ['10', 'October'], ['11', 'November'], ['12', 'December'],
  ];
  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(String);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Create Payroll Period">
      <div className="w-full max-w-lg rounded-[20px] bg-white p-5 shadow-[0_18px_42px_rgba(15,23,42,0.18)]">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-[18px] font-extrabold text-[#0F172A]">Create Payroll Period</h2>
            <p className="mt-0.5 text-[12px] font-medium text-[#64748B]">Set up a new payroll period to begin processing.</p>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Field label="Payroll Month">
            <select value={month} onChange={(e) => setMonth(e.target.value)} className="modal-input">
              {months.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label="Payroll Year">
            <select value={year} onChange={(e) => setYear(e.target.value)} className="modal-input">
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </Field>
          <Field label="Payroll Type">
            <select value={payrollType} onChange={(e) => setPayrollType(e.target.value)} className="modal-input">
              <option>Monthly</option><option>Weekly</option><option>Daily Rate</option><option>Off-cycle</option>
            </select>
          </Field>
          <Field label="Payroll Group">
            <select value={payrollGroup} onChange={(e) => setPayrollGroup(e.target.value)} className="modal-input">
              <option>All Groups</option><option>Permanent</option><option>Lumpsum</option><option>Daily Rate</option>
            </select>
          </Field>
          <Field label="Payment Date">
            <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="modal-input" />
          </Field>
          <Field label="Period Code">
            <input value={period} readOnly className="modal-input bg-slate-50 font-bold" />
          </Field>
        </div>

        <div className="mt-4 space-y-2 rounded-xl border border-[#E2E8F0] bg-[#FBFCFE] p-3">
          <Check label="Copy Previous Settings" checked={copyPrevious} onChange={setCopyPrevious} />
          <Check label="Carry Forward Recurring Earnings" checked={carryEarnings} onChange={setCarryEarnings} />
          <Check label="Carry Forward Recurring Deductions" checked={carryDeductions} onChange={setCarryDeductions} />
          <Check label="Generate Employee Snapshot" checked={snapshot} onChange={setSnapshot} />
          <Check label="Set as active payroll period (open now)" checked={activate} onChange={setActivate} />
        </div>
        {activate ? (
          <p className="mt-2 text-[11px] font-medium text-[#B45309]">Opening this period will close the current active period and make it the live processing month across Payroll Management.</p>
        ) : (
          <p className="mt-2 text-[11px] font-medium text-[#64748B]">The period will be saved as a draft. Open it later to make it active.</p>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button onClick={onClose} className="h-10 rounded-xl border border-[#E2E8F0] bg-white px-4 text-[13px] font-bold text-[#334155] hover:bg-slate-50">Cancel</button>
          <button
            disabled={!valid || busy}
            onClick={() => onCreate(period, paymentDate || null, activate)}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#2563EB] px-4 text-[13px] font-bold text-white hover:bg-[#1D4ED8] disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create
          </button>
        </div>
      </div>

      <style jsx>{`
        :global(.modal-input) {
          width: 100%;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          padding: 0.5rem 0.75rem;
          font-size: 13px;
          font-weight: 600;
          color: #0f172a;
          outline: none;
        }
        :global(.modal-input:focus) {
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#64748B]">{label}</span>
      {children}
    </label>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[12px] font-semibold text-[#334155]">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-[#CBD5E1] text-[#2563EB] focus:ring-[#2563EB]" />
      {label}
    </label>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[300px_1fr]">
        <Skeleton className="h-72" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      </div>
      <Skeleton className="h-52" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Skeleton className="h-48" /><Skeleton className="h-48" /><Skeleton className="h-48" />
      </div>
      <p className="text-center text-[12px] font-semibold text-[#94A3B8]">Loading payroll data…</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Period date helpers (derived from YYYY-MM period code)             */
/* ------------------------------------------------------------------ */

function periodStart(period?: string) {
  if (!period || !/^\d{4}-\d{2}$/.test(period)) return null;
  return `${period}-01`;
}
function periodEnd(period?: string) {
  if (!period || !/^\d{4}-\d{2}$/.test(period)) return null;
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m, 0).toISOString().slice(0, 10);
}
function periodCutoff(period?: string) {
  if (!period || !/^\d{4}-\d{2}$/.test(period)) return null;
  return `${period}-20`;
}
function periodPayment(period?: string) {
  if (!period || !/^\d{4}-\d{2}$/.test(period)) return null;
  return `${period}-28`;
}
