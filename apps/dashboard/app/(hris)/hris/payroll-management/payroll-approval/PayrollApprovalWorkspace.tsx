'use client';

/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  Download,
  FileText,
  History,
  Minus,
  PlayCircle,
  RefreshCcw,
  Search,
  ShieldCheck,
  UserCheck,
  Wallet,
  WalletCards,
  X,
} from 'lucide-react';
import type { PayrollApprovalStageId } from '@/lib/payroll-approval-workflow';
import { currencyCode, formatPayrollMoney, resolvePayCurrency } from '@/lib/payroll-currency';
import { ngnPayrollKpiRecords } from '@/lib/payroll-bank-schedule-packs';
import {
  PAYROLL_SCHEDULE_SCOPES,
  payrollScheduleScopeById,
  type PayrollCompany,
  type PayrollScheduleScopeId,
} from '@/lib/payroll-schedule-scope';
import type { PayrollMonthOverMonth, PayrollMomMetricKey } from '@/lib/payroll-month-over-month';
import { payrollMomMetric } from '@/lib/payroll-month-over-month';
import PayrollMonthOverMonthPanel from '@/app/(hris)/hris/payroll/PayrollMonthOverMonth';
import { PayrollCommentsControl } from '../PayrollCommentsThread';
import styles from '@/styles/payroll-approval.module.css';

type Role =
  | 'Super Admin'
  | 'HR Director'
  | 'HR Manager'
  | 'Finance Controller'
  | 'Finance Manager'
  | 'CFO'
  | 'Executive Management'
  | 'Payroll Officer'
  | 'Auditor'
  | 'Employee';
type RunStatus =
  | 'Draft'
  | 'Open'
  | 'Calculated'
  | 'Computed'
  | 'Validated'
  | 'Ready for Approval'
  | 'Submitted'
  | 'Under Review'
  | 'HR Approved'
  | 'Finance Approved'
  | 'CFO Approved'
  | 'Approved'
  | 'Released'
  | 'Revision Requested'
  | 'Locked'
  | 'Posted'
  | 'Published'
  | 'Closed'
  | 'Reopened'
  | 'Rejected';
type RecordStatus = 'Ready' | 'Review' | 'Blocked';
type Tone = 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'cyan' | 'slate';
type PayrollPack = 'salaried' | 'daily-rate';
type BottomTab = 'employees' | 'variance' | 'exceptions' | 'audit' | 'documents';

type PayrollRun = {
  id: string;
  period: string;
  periodLabel: string;
  pack?: PayrollPack;
  company?: PayrollCompany | null;
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
  submittedAt?: string | null;
  submittedBy?: string | null;
  approvedAt?: string | null;
  approvedBy?: string | null;
  lastReminderAt?: string | null;
  lastReminderStageId?: string | null;
  artifacts?: Array<{ type: string; label: string; fileName: string; generatedAt: string; generatedBy: string }>;
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

type StageState = {
  id: PayrollApprovalStageId;
  code: string;
  title: string;
  owner: string;
  action: string;
  done: boolean;
  current: boolean;
  stamp: string | null;
  signedBy: string | null;
};

type Payload = {
  generatedAt: string;
  dataSource?: { source: string; databaseAvailable: boolean; warning: string | null; employeeCount: number };
  period: string;
  periodLabel: string;
  pack?: PayrollPack;
  company?: PayrollCompany | null;
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
    company?: PayrollCompany;
    packLabel: string;
    scheduleId?: string;
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
    scheduleNetPay?: number | null;
    scheduleGrossPay?: number | null;
    employerCost: number | null;
    ready: number;
    review: number;
    blocked: number;
    exceptionCount: number;
    averageDeductionRatio: number | null;
  };
  monthOverMonth?: PayrollMonthOverMonth | null;
  records: PayrollRecord[];
  controls: Array<{ id: string; label: string; status: string; detail: string; tone: Tone }>;
  artifacts?: Array<{ type: string; label: string; fileName: string; generatedAt: string; generatedBy: string }>;
  approvalWorkflow?: {
    stageLabel: string;
    nextOwner: string;
    currentOwnerHint?: string;
    stages: Array<StageState>;
  };
};

type ApiResponse<T> = { status: 'success' | 'error'; data?: T; error?: string };

type SessionUser = {
  fullName?: string;
  username?: string;
  roles?: string[];
  isGlobalAdmin?: boolean;
};

const PAGE_SIZE = 15;
const numberFmt = new Intl.NumberFormat('en-GB');

const scheduleVisual: Record<PayrollScheduleScopeId, { icon: string; dot: string; Icon: typeof PlayCircle }> = {
  'dle-salaries': { icon: styles.schedule_blue, dot: styles.dot_blue, Icon: PlayCircle },
  'dlpc-salaries': { icon: styles.schedule_amber, dot: styles.dot_amber, Icon: PlayCircle },
  'dle-dayrate': { icon: styles.schedule_green, dot: styles.dot_green, Icon: WalletCards },
  'dlpc-dayrate': { icon: styles.schedule_purple, dot: styles.dot_purple, Icon: WalletCards },
};

const recordCurrency = (record: Pick<PayrollRecord, 'payCurrency' | 'payrollGroup' | 'salaryGrade' | 'businessUnit'>) =>
  resolvePayCurrency({
    payCurrency: record.payCurrency,
    payrollGroup: record.payrollGroup,
    salaryGrade: record.salaryGrade,
    businessUnit: record.businessUnit,
  });

const money = (value: number | null | undefined, allowed = true, currency = 'NGN') => {
  if (!allowed) return 'Restricted';
  if (value == null) return 'Not computed';
  const code = currencyCode(currency);
  return formatPayrollMoney(value, code, { maximumFractionDigits: code === 'USD' ? 2 : 0 });
};

const sumRecordPay = (
  records:
    | {
        grossPay?: number | null;
        totalDeductions?: number | null;
        netPay?: number | null;
        employerCost?: number | null;
        payCurrency?: string | null;
        payrollGroup?: string | null;
      }[]
    | undefined,
) =>
  ngnPayrollKpiRecords(records).reduce<{ grossPay: number; deductions: number; netPay: number; employerCost: number }>(
    (acc, record) => ({
      grossPay: acc.grossPay + Number(record.grossPay || 0),
      deductions: acc.deductions + Number(record.totalDeductions || 0),
      netPay: acc.netPay + Number(record.netPay || 0),
      employerCost: acc.employerCost + Number(record.employerCost || 0),
    }),
    { grossPay: 0, deductions: 0, netPay: 0, employerCost: 0 },
  );

const payrollAmount = (official: number | null | undefined, preview: number, computed?: boolean) =>
  computed ? official : preview;
const number = (value: number | null | undefined) => numberFmt.format(Number(value || 0));

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

const controlPassed = (status: string) =>
  /pass|ok|ready|complete|enabled|validated|approved|posted|locked|calculated|split/i.test(status)
  && !/attention|fail|block|reject|required/i.test(status);

const shortStepLabel = (title: string) => {
  if (/officer/i.test(title)) return 'Officer';
  if (/hr/i.test(title)) return 'HR';
  if (/finance/i.test(title)) return 'Finance';
  if (/cfo/i.test(title)) return 'CFO';
  if (/md|ceo/i.test(title)) return 'MD/CEO';
  return title;
};

function MomLine({
  mom,
  metricKey,
  canViewMoney,
}: {
  mom?: PayrollMonthOverMonth | null;
  metricKey: PayrollMomMetricKey;
  canViewMoney: boolean;
}) {
  const metric = payrollMomMetric(mom, metricKey);
  if (!mom?.available || !metric) {
    return <div className={styles.vs}>vs prior month —</div>;
  }
  const signed = (value: number, kind: 'money' | 'count') => {
    if (kind === 'count') {
      if (value > 0) return `+${number(value)}`;
      if (value < 0) return `-${number(Math.abs(value))}`;
      return number(value);
    }
    if (!canViewMoney) return 'Restricted';
    const formatted = formatPayrollMoney(Math.abs(value), 'NGN', { maximumFractionDigits: 0 });
    if (value > 0) return `+${formatted}`;
    if (value < 0) return `-${formatted}`;
    return formatted;
  };
  const pctValue = Math.abs(metric.pctChange);
  const pctText = `${metric.pctChange > 0 ? '+' : metric.pctChange < 0 ? '-' : ''}${new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 }).format(pctValue)}%`;
  return (
    <>
      <div className={styles.variance}>
        {signed(metric.variance, metric.kind)} · {pctText}
      </div>
      <div className={styles.vs}>vs {mom.previousPeriodLabel || 'prior month'}</div>
    </>
  );
}

export default function PayrollApprovalWorkspace({
  initialSchedule,
}: {
  initialSchedule?: string;
}) {
  const router = useRouter();
  const initialScope = payrollScheduleScopeById(initialSchedule) || PAYROLL_SCHEDULE_SCOPES[0];

  const [payload, setPayload] = useState<Payload | null>(null);
  const [role, setRole] = useState<Role>('Employee');
  const [period, setPeriod] = useState('');
  const [pack, setPack] = useState<PayrollPack>(initialScope.pack as PayrollPack);
  const [company, setCompany] = useState<PayrollCompany>(initialScope.company);
  const [scheduleId, setScheduleId] = useState<PayrollScheduleScopeId>(initialScope.id);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [note, setNote] = useState('');
  const [sessionReady, setSessionReady] = useState(false);
  const [activeTab, setActiveTab] = useState<BottomTab>('employees');
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
        setRole(primaryRoleFromSession(user));
      }
    } catch {
      // keep defaults
    } finally {
      setSessionReady(true);
    }
  };

  const load = async (
    targetPeriod = period,
    sessionRole = role,
    targetPack = pack,
    targetCompany = company,
  ) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (targetPeriod) params.set('period', targetPeriod);
      if (targetPack) params.set('pack', targetPack);
      if (targetCompany) params.set('company', targetCompany);
      const suffix = params.toString() ? `?${params.toString()}` : '';
      const res = await fetch(`/api/hris/payroll/payroll-processing${suffix}`, {
        headers: { 'x-hris-role': sessionRole },
        cache: 'no-store',
      });
      const json = (await res.json()) as ApiResponse<Payload>;
      if (!res.ok || json.status !== 'success' || !json.data) {
        throw new Error(json.error || `Payroll approval request failed (${res.status})`);
      }
      setPayload(json.data);
      setPeriod(json.data.period);
      if (json.data.pack) setPack(json.data.pack);
      if (json.data.company === 'DLE' || json.data.company === 'DLPC') setCompany(json.data.company);
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
    void load(period, role, pack, company);
  }, [sessionReady, role]);

  const run = payload?.run || null;
  const canViewMoney = Boolean(payload?.permissions.canViewMoney);
  const stages = payload?.approvalWorkflow?.stages || [];
  const activeStage = stages.find((stage) => stage.current) || stages[0] || null;
  const pendingApproverStage = stages.find((stage) => stage.current && stage.id !== 'payroll-officer') || null;
  const canSendReminder = Boolean(payload?.permissions.canSubmit && pendingApproverStage);

  const canActOnStage = (stage: StageState | null) => {
    if (!stage) return false;
    const perms = payload?.permissions;
    if (!perms) return false;
    if (perms.canApproveAnyStage && !stage.done) return true;
    if (!stage.current) return false;
    if (stage.id === 'payroll-officer') return perms.canSubmit;
    if (stage.id === 'hr-manager') return perms.canApproveHrManager;
    if (stage.id === 'finance-manager') return perms.canApproveFinanceManager;
    if (stage.id === 'cfo') return perms.canApproveCfo;
    return perms.canApproveMdCeo;
  };

  const approveLabel =
    activeStage?.id === 'payroll-officer'
      ? 'Submit for Approval'
      : activeStage?.id === 'hr-manager'
        ? 'Approve'
        : activeStage?.id === 'finance-manager'
          ? 'Approve'
          : activeStage?.id === 'cfo'
            ? 'Approve'
            : 'Approve';

  const payrollComputed = Boolean(run && !['Draft', 'Open', 'Reopened'].includes(run.status));
  const previewPay = sumRecordPay(payload?.records);
  const previewGross = Number(payload?.summary.scheduleGrossPay || 0) || previewPay.grossPay;
  const previewNet = Number(payload?.summary.scheduleNetPay || 0) || previewPay.netPay;
  const previewDeductions = previewPay.deductions;

  const selectedScope =
    PAYROLL_SCHEDULE_SCOPES.find((scope) => scope.id === scheduleId)
    || PAYROLL_SCHEDULE_SCOPES.find((scope) => scope.pack === pack && scope.company === company)
    || PAYROLL_SCHEDULE_SCOPES[0];

  const packCards = useMemo(() => {
    const packs = payload?.packs || [];
    return PAYROLL_SCHEDULE_SCOPES.map((scope) => {
      const match = packs.find(
        (item) =>
          (item.scheduleId && item.scheduleId === scope.id)
          || (item.pack === scope.pack && (item.company || 'DLE') === scope.company),
      );
      const status = match?.run?.status
        || (scope.id === selectedScope.id ? run?.status : null)
        || null;
      const headcount = match?.run?.employeeCount
        ?? match?.summary?.employees
        ?? (scope.id === selectedScope.id ? payload?.summary.employees : null);
      return {
        scope,
        status: status || (packs.length || scope.id === selectedScope.id ? 'Draft' : '—'),
        headcount,
        loaded: Boolean(match) || scope.id === selectedScope.id,
      };
    });
  }, [payload?.packs, payload?.summary.employees, run?.status, selectedScope.id]);

  const controls = useMemo(() => {
    if (payload?.controls?.length) return payload.controls;
    const summary = payload?.summary;
    if (!summary) return [];
    return [
      {
        id: 'ready',
        label: 'Employee readiness',
        status: (summary.blocked || 0) > 0 ? 'Attention Required' : 'Passed',
        detail: `${number(summary.ready)} ready · ${number(summary.review)} review · ${number(summary.blocked)} blocked`,
        tone: ((summary.blocked || 0) > 0 ? 'red' : 'green') as Tone,
      },
      {
        id: 'exceptions',
        label: 'Exceptions cleared',
        status: (summary.exceptionCount || 0) > 0 ? 'Attention Required' : 'Passed',
        detail: `${number(summary.exceptionCount)} open exceptions`,
        tone: ((summary.exceptionCount || 0) > 0 ? 'amber' : 'green') as Tone,
      },
      {
        id: 'gross',
        label: 'Gross computed',
        status: summary.grossPay != null || payrollComputed ? 'Passed' : 'Pending',
        detail: money(payrollAmount(summary.grossPay, previewGross, payrollComputed), canViewMoney),
        tone: (summary.grossPay != null || payrollComputed ? 'green' : 'slate') as Tone,
      },
      {
        id: 'net',
        label: 'Net computed',
        status: summary.netPay != null || payrollComputed ? 'Passed' : 'Pending',
        detail: money(payrollAmount(summary.netPay, previewNet, payrollComputed), canViewMoney),
        tone: (summary.netPay != null || payrollComputed ? 'green' : 'slate') as Tone,
      },
    ];
  }, [payload?.controls, payload?.summary, payrollComputed, previewGross, previewNet, canViewMoney]);

  const employeeRows = useMemo(() => {
    let rows = [...ngnPayrollKpiRecords(payload?.records || [])];
    if (activeTab === 'exceptions') {
      rows = rows.filter((record) => record.status !== 'Ready' || record.issues.length > 0);
    }
    rows = searchEmployees(rows, salaryQuery);
    rows.sort((a, b) => Number(b.grossPay || 0) - Number(a.grossPay || 0));
    return rows;
  }, [payload?.records, salaryQuery, activeTab]);

  useEffect(() => {
    setPage(1);
  }, [salaryQuery, activeTab, payload?.period, scheduleId]);

  const pageCount = Math.max(1, Math.ceil(employeeRows.length / PAGE_SIZE));
  const pageRows = useMemo(
    () => employeeRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [employeeRows, page],
  );
  const pageWindowStart = Math.max(1, Math.min(page - 2, pageCount - 4));
  const visiblePages = Array.from({ length: Math.min(5, pageCount) }, (_, i) => pageWindowStart + i);

  const artifacts = payload?.artifacts || run?.artifacts || [];
  const validated = Boolean(
    run
    && !['Draft', 'Open', 'Calculated', 'Computed', 'Reopened', 'Rejected', 'Revision Requested'].includes(run.status),
  );

  const selectSchedule = (id: PayrollScheduleScopeId) => {
    const scope = payrollScheduleScopeById(id);
    if (!scope) return;
    setScheduleId(scope.id);
    setPack(scope.pack as PayrollPack);
    setCompany(scope.company);
    setActiveTab('employees');
    setSalaryQuery('');
    router.replace(`/hris/payroll-management/payroll-approval?schedule=${scope.id}`, { scroll: false });
    void load(period, role, scope.pack as PayrollPack, scope.company);
  };

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
          company,
          runId: run?.id || undefined,
          note: note || `${actionName} from payroll approval workspace (${company} ${pack})`,
        }),
      });
      const json = (await res.json()) as ApiResponse<{
        run: PayrollRun;
        reminder?: { stageTitle?: string; emailed?: number; notified?: number };
      }>;
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to update payroll approval');
      if (actionName === 'send-reminder') {
        const reminder = json.data?.reminder;
        setToast(
          `Reminder sent to ${reminder?.stageTitle || 'current approver'}`
          + (typeof reminder?.emailed === 'number'
            ? ` (${reminder.emailed} email${reminder.emailed === 1 ? '' : 's'}).`
            : '.'),
        );
      } else {
        setToast(`${json.data?.run.packLabel || pack} pack moved to ${json.data?.run.status || 'updated'}.`);
        setNote('');
      }
      await load(period, role, pack, company);
    } catch (event) {
      setToast(event instanceof Error ? event.message : 'Unable to update payroll approval');
    } finally {
      setPosting('');
    }
  };

  const exportExcel = async () => {
    setToast('');
    try {
      const report = pack === 'daily-rate' ? 'dayrate-schedule' : 'payroll-register';
      const res = await fetch(
        `/api/hris/payroll-management?format=xls&report=${encodeURIComponent(report)}&period=${encodeURIComponent(period)}&pack=${encodeURIComponent(pack)}&company=${encodeURIComponent(company)}&currency=ngn`,
        { cache: 'no-store' },
      );
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error || `Export failed (${res.status}).`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const disposition = res.headers.get('content-disposition') || '';
      const named = /filename="([^"]+)"/i.exec(disposition)?.[1];
      anchor.href = url;
      anchor.download = named || `payroll-approval-${period}-${company}-${pack || 'salaried'}.xls`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setToast('Excel export downloaded.');
    } catch (event) {
      setToast(event instanceof Error ? event.message : 'Unable to export Excel.');
    }
  };

  const showEmployeeTable = activeTab === 'employees' || activeTab === 'exceptions';
  const exceptionCount = payload?.summary.exceptionCount || 0;

  return (
    <div className={styles.content} style={{ padding: 0 }}>
      <div className={styles.pageHeader}>
        <div className={styles.titleGroup}>
          <span className={styles.titleIcon}>
            <ShieldCheck size={22} />
          </span>
          <div>
            <h1>Payroll Approval</h1>
            <p>Review schedule packs, validation, and stage approvals for the selected payroll period.</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <label className={styles.periodBtn}>
            <span className="sr-only">Payroll period</span>
            <input
              type="month"
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
              style={{ border: 0, background: 'transparent', font: 'inherit', fontWeight: 700, outline: 'none' }}
            />
          </label>
          <button
            type="button"
            className={styles.periodBtn}
            onClick={() => void load(period, role, pack, company)}
            disabled={loading}
          >
            <RefreshCcw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => void exportExcel()}
            disabled={!payload || loading}
          >
            <Download size={14} />
            Export
          </button>
        </div>
      </div>

      {error ? (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">{error}</div>
      ) : null}
      {toast ? (
        <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">{toast}</div>
      ) : null}
      {payload?.dataSource?.warning ? (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
          {payload.dataSource.warning}
        </div>
      ) : null}

      <div className={styles.scheduleGrid}>
        {packCards.map(({ scope, status, headcount, loaded }) => {
          const visual = scheduleVisual[scope.id];
          const Icon = visual.Icon;
          const active = scope.id === selectedScope.id;
          return (
            <button
              key={scope.id}
              type="button"
              className={`${styles.scheduleCard} ${active ? styles.scheduleActive : ''}`}
              onClick={() => selectSchedule(scope.id)}
            >
              <span className={`${styles.scheduleIcon} ${visual.icon}`}>
                <Icon size={18} />
              </span>
              <span className={styles.scheduleText}>
                <strong>{scope.label}</strong>
                <span>
                  {loaded && headcount != null
                    ? `${number(headcount)} ${scope.pack === 'daily-rate' ? 'contractors' : 'staff'}`
                    : '—'}
                </span>
                <small>
                  <span className={`${styles.dot} ${visual.dot}`} />
                  {status}
                </small>
              </span>
            </button>
          );
        })}
      </div>

      <div className={styles.workspaceGrid}>
        <div className={styles.workspaceMain}>
          <div className={styles.scheduleHeaderRow}>
            <div>
              <h2>
                {payload?.packLabel || selectedScope.label}{' '}
                {validated ? (
                  <span className={styles.validated}>
                    <BadgeCheck size={12} />
                    Validated
                  </span>
                ) : null}
              </h2>
              <p>
                {payload?.periodLabel || 'Loading period'}
                {run?.submittedAt
                  ? ` · Submitted ${new Date(run.submittedAt).toLocaleString('en-GB')}${run.submittedBy ? ` by ${run.submittedBy}` : ''}`
                  : run?.status
                    ? ` · ${run.status}`
                    : ''}
              </p>
            </div>
            <div className={styles.miniActions}>
              <button type="button" onClick={() => setActiveTab('audit')}>
                <History size={13} /> Audit
              </button>
              <button type="button" onClick={() => void load(period, role, pack, company)} disabled={loading}>
                <RefreshCcw size={13} /> Sync
              </button>
            </div>
          </div>

          <div className={styles.moneyGrid}>
            <div className={`${styles.moneyCard} ${styles.money_blue}`}>
              <span className={styles.moneyIcon}><Banknote size={18} /></span>
              <div>
                <div className={styles.moneyLabel}>Gross Pay</div>
                <div className={styles.moneyValue}>
                  {money(payrollAmount(payload?.summary.grossPay, previewGross, payrollComputed), canViewMoney)}
                </div>
                <MomLine mom={payload?.monthOverMonth} metricKey="grossPay" canViewMoney={canViewMoney} />
              </div>
            </div>
            <div className={`${styles.moneyCard} ${styles.money_red}`}>
              <span className={styles.moneyIcon}><Minus size={18} /></span>
              <div>
                <div className={styles.moneyLabel}>Deductions</div>
                <div className={styles.moneyValue}>
                  {money(payrollAmount(payload?.summary.totalDeductions, previewDeductions, payrollComputed), canViewMoney)}
                </div>
                <MomLine mom={payload?.monthOverMonth} metricKey="deductions" canViewMoney={canViewMoney} />
              </div>
            </div>
            <div className={`${styles.moneyCard} ${styles.money_green}`}>
              <span className={styles.moneyIcon}><Wallet size={18} /></span>
              <div>
                <div className={styles.moneyLabel}>Net Pay</div>
                <div className={styles.moneyValue}>
                  {money(payrollAmount(payload?.summary.netPay, previewNet, payrollComputed), canViewMoney)}
                </div>
                <MomLine mom={payload?.monthOverMonth} metricKey="netPay" canViewMoney={canViewMoney} />
              </div>
            </div>
            <div className={`${styles.moneyCard} ${styles.money_purple}`}>
              <span className={styles.moneyIcon}><BadgeCheck size={18} /></span>
              <div>
                <div className={styles.moneyLabel}>Employer Cost</div>
                <div className={styles.moneyValue}>
                  {money(payrollAmount(payload?.summary.employerCost, previewPay.employerCost, payrollComputed), canViewMoney)}
                </div>
                <MomLine mom={payload?.monthOverMonth} metricKey="employerCost" canViewMoney={canViewMoney} />
              </div>
            </div>
          </div>

          <div className={styles.infoGrid}>
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h3>Approval Progress</h3>
                <button type="button" onClick={() => setActiveTab('audit')}>
                  View trail <ArrowRight size={12} />
                </button>
              </div>
              <div className={styles.progressSteps}>
                {stages.map((stage, index) => (
                  <div key={stage.id} style={{ display: 'contents' }}>
                    <div className={styles.step}>
                      <span className={`${styles.stepCircle} ${stage.done ? styles.done : stage.current ? styles.pending : ''}`} style={!stage.done && !stage.current ? { background: '#e8eef6', color: '#7a8da8' } : undefined}>
                        {stage.done ? <Check size={14} /> : stage.current ? <Clock3 size={14} /> : <Circle size={12} />}
                      </span>
                      <b>{shortStepLabel(stage.title)}</b>
                      <span>{stage.done ? 'Done' : stage.current ? 'Current' : 'Pending'}</span>
                    </div>
                    {index < stages.length - 1 ? (
                      <span className={styles.stepArrow} aria-hidden>
                        <ArrowRight size={12} />
                      </span>
                    ) : null}
                  </div>
                ))}
                {!stages.length ? (
                  <p style={{ color: '#657894', fontSize: 11, margin: '18px 0 0' }}>
                    {loading ? 'Loading approval stages…' : 'No approval workflow for this schedule yet.'}
                  </p>
                ) : null}
              </div>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h3>Validation & Exceptions</h3>
                <button type="button" onClick={() => setActiveTab('exceptions')}>
                  Open <ArrowRight size={12} />
                </button>
              </div>
              <div className={styles.validationGrid}>
                {controls.slice(0, 6).map((item) => {
                  const ok = controlPassed(item.status);
                  return (
                    <div key={item.id} className={styles.checkItem}>
                      {ok ? <CheckCircle2 size={14} /> : <X size={14} style={{ color: '#e52d41' }} />}
                      <span>
                        {item.label}
                        <span style={{ display: 'block', color: '#8a9ab0' }}>{item.status}</span>
                      </span>
                    </div>
                  );
                })}
                {!controls.length ? (
                  <div className={styles.checkItem}>
                    <Circle size={14} />
                    <span>{loading ? 'Loading controls…' : 'No validation controls returned.'}</span>
                  </div>
                ) : null}
              </div>
              {(payload?.summary.exceptionCount || 0) === 0 && controls.length ? (
                <div className={styles.validationPass}>
                  <CheckCircle2 size={18} />
                  <div>
                    <b>Validation clear</b>
                    <span>No open exceptions on this schedule pack.</span>
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        </div>

        <aside className={styles.currentApproval}>
          <div className={styles.approvalTop}>
            <h3>Current Approval</h3>
            <span>{activeStage?.current ? 'Awaiting action' : activeStage?.done ? 'Complete' : 'Pending'}</span>
          </div>
          <div className={styles.approver}>
            <span className={styles.approverIcon}>
              <UserCheck size={18} />
            </span>
            <div>
              <b>{activeStage?.owner || payload?.approvalWorkflow?.nextOwner || '—'}</b>
              <span>{activeStage?.title || payload?.approvalWorkflow?.stageLabel || 'No active stage'}</span>
            </div>
          </div>
          <dl className={styles.approvalMeta}>
            <div>
              <dt>Schedule</dt>
              <dd>{payload?.packLabel || selectedScope.label}</dd>
            </div>
            <div>
              <dt>Period</dt>
              <dd>{payload?.periodLabel || period || '—'}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{run?.status || 'Draft'}</dd>
            </div>
            <div>
              <dt>Exceptions</dt>
              <dd>{number(exceptionCount)}</dd>
            </div>
          </dl>

          <PayrollCommentsControl
            period={payload?.period || period}
            periodLabel={payload?.periodLabel}
            className="mb-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 text-[11px] font-extrabold text-sky-900 hover:bg-sky-100"
          />

          <label className={styles.commentLabel} htmlFor="payroll-approval-note">Comment</label>
          <textarea
            id="payroll-approval-note"
            className={styles.commentBox}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Approval note, rejection reason, or return comment"
          />

          {canSendReminder ? (
            <button
              type="button"
              disabled={posting === 'send-reminder'}
              onClick={() => void action('send-reminder')}
              className="mt-2 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-sky-300 bg-white px-3 text-[11px] font-extrabold text-sky-900 hover:bg-sky-50 disabled:opacity-50"
            >
              Send reminder to {pendingApproverStage?.owner || 'approver'}
            </button>
          ) : null}

          {activeStage && (activeStage.current || (payload?.permissions.canApproveAnyStage && !activeStage.done)) ? (
            <div className={styles.approvalBtns}>
              {activeStage.id !== 'payroll-officer' ? (
                <>
                  <button
                    type="button"
                    className={styles.reject}
                    disabled={posting === 'reject-run'}
                    onClick={() => void action('reject-run')}
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    className={styles.return}
                    disabled={posting === 'request-revision'}
                    onClick={() => void action('request-revision')}
                  >
                    Return for Revision
                  </button>
                </>
              ) : (
                <span />
              )}
              <button
                type="button"
                className={styles.approve}
                style={activeStage.id === 'payroll-officer' ? { gridColumn: '1 / -1' } : undefined}
                disabled={!canActOnStage(activeStage) || posting === activeStage.action}
                onClick={() => void action(activeStage.action)}
              >
                <CheckCircle2 size={14} className={posting === activeStage.action ? 'animate-spin' : ''} />
                {approveLabel}
              </button>
            </div>
          ) : (
            <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-600">
              {activeStage?.done
                ? 'This stage is complete.'
                : 'This stage is not active yet.'}
            </p>
          )}

          {activeStage?.current && !canActOnStage(activeStage) ? (
            <p className="mt-2 text-[11px] font-bold text-amber-700">
              Your signed-in role cannot action this stage. Wait for the stage owner, or sign in with an authorized role.
            </p>
          ) : null}
        </aside>
      </div>

      <div className={styles.tabs}>
        <button type="button" className={activeTab === 'employees' ? styles.tabActive : ''} onClick={() => setActiveTab('employees')}>
          Employees <em>{number(payload?.summary.employees)}</em>
        </button>
        <button type="button" className={activeTab === 'variance' ? styles.tabActive : ''} onClick={() => setActiveTab('variance')}>
          Variance
        </button>
        <button type="button" className={activeTab === 'exceptions' ? styles.tabActive : ''} onClick={() => setActiveTab('exceptions')}>
          Exceptions <em>{number(exceptionCount)}</em>
        </button>
        <button type="button" className={activeTab === 'audit' ? styles.tabActive : ''} onClick={() => setActiveTab('audit')}>
          Audit Trail
        </button>
        <button type="button" className={activeTab === 'documents' ? styles.tabActive : ''} onClick={() => setActiveTab('documents')}>
          Documents
        </button>
      </div>

      <div className={styles.tablePanel}>
        {showEmployeeTable ? (
          <>
            <div className={styles.tableToolbar}>
              <div className={styles.tableSearch}>
                <Search size={14} />
                <input
                  value={salaryQuery}
                  onChange={(event) => setSalaryQuery(event.target.value)}
                  placeholder="Search by name, ID, dept…"
                  aria-label="Search employees"
                  style={{ border: 0, outline: 'none', width: '100%', background: 'transparent', font: 'inherit' }}
                />
              </div>
              <button type="button" className={styles.downloadBtn} onClick={() => void exportExcel()} disabled={!payload}>
                <Download size={13} /> Export
              </button>
            </div>
            <div className="dle-scroll-x overflow-x-auto">
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Department</th>
                    <th>Gross</th>
                    <th>Deductions</th>
                    <th>Net</th>
                    <th>Employer Cost</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((record) => (
                    <tr key={record.employeeId}>
                      <td>
                        <div className={styles.empName}>{record.fullName}</div>
                        <div style={{ color: '#7a8da8' }}>{record.employeeId}</div>
                        {activeTab === 'exceptions' && record.issues.length ? (
                          <div style={{ color: '#9a6b00', marginTop: 2 }}>{record.issues.slice(0, 2).join('; ')}</div>
                        ) : null}
                      </td>
                      <td>
                        {record.department || '—'}
                        <div style={{ color: '#7a8da8' }}>
                          {record.payrollGroup || '—'} · {recordCurrency(record)}
                        </div>
                      </td>
                      <td>{money(record.grossPay, canViewMoney, recordCurrency(record))}</td>
                      <td>{money(record.totalDeductions, canViewMoney, recordCurrency(record))}</td>
                      <td>{money(record.netPay, canViewMoney, recordCurrency(record))}</td>
                      <td>{money(record.employerCost, canViewMoney, recordCurrency(record))}</td>
                      <td>
                        <span className={styles.ready}>{record.status}</span>
                      </td>
                    </tr>
                  ))}
                  {!pageRows.length ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '28px 10px', color: '#6c7f98' }}>
                        {loading
                          ? 'Loading employee rows…'
                          : activeTab === 'exceptions'
                            ? 'No exception rows for this schedule.'
                            : 'No employee rows match the current filters.'}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className={styles.pagination}>
              <span>
                {employeeRows.length
                  ? `${(page - 1) * PAGE_SIZE + 1} to ${Math.min(page * PAGE_SIZE, employeeRows.length)} of ${number(employeeRows.length)}`
                  : 'No employees'}
              </span>
              <div>
                <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} aria-label="Previous page">
                  <ChevronLeft size={14} />
                </button>
                {visiblePages.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={page === p ? styles.pageActive : ''}
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </button>
                ))}
                <button type="button" disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))} aria-label="Next page">
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </>
        ) : null}

        {activeTab === 'variance' ? (
          <div style={{ padding: 12 }}>
            <PayrollMonthOverMonthPanel
              mom={payload?.monthOverMonth}
              packLabel={payload?.packLabel || selectedScope.label}
              canViewMoney={canViewMoney}
            />
            {!payload?.monthOverMonth ? (
              <p style={{ color: '#6c7f98', fontSize: 12, fontWeight: 600, padding: '12px 4px' }}>
                {loading ? 'Loading variance…' : 'No month-over-month variance available for this schedule yet.'}
              </p>
            ) : null}
          </div>
        ) : null}

        {activeTab === 'audit' ? (
          <div style={{ padding: 12, display: 'grid', gap: 8 }}>
            {(run?.audit || []).slice().reverse().map((event) => (
              <div key={`${event.at}-${event.action}`} style={{ border: '1px solid #e5edf6', borderRadius: 8, padding: 12, background: '#f8fbff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong style={{ fontSize: 12 }}>{event.action}</strong>
                  <span style={{ fontSize: 10, color: '#657894' }}>{event.actor}</span>
                </div>
                <div style={{ fontSize: 10, color: '#6c7f98', marginTop: 4 }}>
                  {new Date(event.at).toLocaleString('en-GB')}
                  {event.from ? ` · ${event.from} → ${event.to}` : ''}
                </div>
                {event.note ? <div style={{ fontSize: 11, marginTop: 6, color: '#334a67' }}>{event.note}</div> : null}
              </div>
            ))}
            {!run?.audit?.length ? (
              <div style={{ padding: 28, textAlign: 'center', color: '#6c7f98', fontSize: 12, fontWeight: 600 }}>
                No approval audit events yet. Submit or approve the run to start the trace.
              </div>
            ) : null}
          </div>
        ) : null}

        {activeTab === 'documents' ? (
          <div style={{ padding: 12 }}>
            {artifacts.length ? (
              <div style={{ display: 'grid', gap: 8 }}>
                {artifacts.map((item) => (
                  <div key={`${item.fileName}-${item.generatedAt}`} style={{ border: '1px solid #e5edf6', borderRadius: 8, padding: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
                    <FileText size={16} color="#1167f6" />
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 12 }}>{item.label || item.fileName}</div>
                      <div style={{ fontSize: 10, color: '#6c7f98' }}>
                        {item.fileName} · {new Date(item.generatedAt).toLocaleString('en-GB')} · {item.generatedBy}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '36px 16px', textAlign: 'center', color: '#6c7f98' }}>
                <FileText size={28} style={{ margin: '0 auto 10px', opacity: 0.45 }} />
                <div style={{ fontWeight: 800, fontSize: 13, color: '#334a67' }}>No documents attached yet</div>
                <div style={{ fontSize: 11, marginTop: 4 }}>Artifacts generated for this payroll run will appear here.</div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
