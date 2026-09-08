'use client';

/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarDays,
  Check,
  Download,
  FileSpreadsheet,
  PieChart,
  Play,
  RefreshCw,
  Settings2,
  TriangleAlert,
  Users,
  WalletCards,
} from 'lucide-react';
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
import styles from '@/styles/process-payroll.module.css';

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

type RunStatus = string;
type RecordStatus = 'Ready' | 'Review' | 'Blocked';
type PayrollPack = 'salaried' | 'daily-rate';
type BottomTab =
  | 'register'
  | 'variance'
  | 'processing'
  | 'outputs'
  | 'issues'
  | 'audit'
  | 'documents';

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
  updatedAt: string;
  validatedAt?: string | null;
  submittedAt?: string | null;
  hrReviewedAt?: string | null;
  financeReviewedAt?: string | null;
  cfoReviewedAt?: string | null;
  approvedAt?: string | null;
  releasedAt?: string | null;
  payslipsGeneratedAt?: string | null;
  bankScheduleGeneratedAt?: string | null;
  statutorySchedulesGeneratedAt?: string | null;
  postedAt?: string | null;
  artifacts?: Array<{ type: string; label: string; fileName: string; generatedAt: string; generatedBy: string }>;
  audit?: Array<{ at: string; actor: string; action: string; from?: string; to?: string; note?: string }>;
};

type PayrollRecord = {
  employeeId: string;
  fullName: string;
  department: string;
  payrollGroup: string;
  employmentType?: string;
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
  company?: PayrollCompany | null;
  packLabel?: string;
  availablePeriods?: Array<{ period: string; periodLabel: string }>;
  permissions: {
    canViewMoney: boolean;
    canCalculate: boolean;
    canSubmit: boolean;
    canApproveHrManager: boolean;
    canApproveFinanceManager: boolean;
    canApproveCfo: boolean;
    canApproveMdCeo: boolean;
    canApproveAnyStage: boolean;
    canLock: boolean;
    canExport: boolean;
  };
  run: PayrollRun | null;
  packs?: Array<{
    pack: PayrollPack;
    company?: PayrollCompany;
    packLabel: string;
    scheduleId?: string;
    run: PayrollRun | null;
    summary: Payload['summary'];
    records: PayrollRecord[];
    payrollComputed?: boolean;
  }>;
  summary: {
    employees: number;
    payrollEligible?: number;
    readyEmployees?: number;
    reviewEmployees?: number;
    blockedEmployees?: number;
    ready?: number;
    review?: number;
    blocked?: number;
    grossPay: number | null;
    totalDeductions: number | null;
    deductions?: number | null;
    netPay: number | null;
    scheduleNetPay?: number | null;
    scheduleGrossPay?: number | null;
    employerCost: number | null;
    exceptionCount: number;
    averageDeductionRatio: number | null;
  };
  monthOverMonth?: PayrollMonthOverMonth | null;
  records: PayrollRecord[];
  artifacts?: Array<{ type: string; label: string; fileName: string; generatedAt: string; generatedBy: string }>;
};

type ApiResponse<T> = { status: 'success' | 'error'; data?: T; error?: string };

type SessionUser = {
  fullName?: string;
  username?: string;
  roles?: string[];
  isGlobalAdmin?: boolean;
};

type WorkflowStep = {
  id: string;
  label: string;
  detail: string;
  done: boolean;
  current: boolean;
  action?: string;
};

const PAGE_SIZE = 15;
const numberFmt = new Intl.NumberFormat('en-GB');

const scheduleVisual: Record<PayrollScheduleScopeId, { icon: string; Icon: typeof Users }> = {
  'dle-salaries': { icon: styles.sched_blue, Icon: Users },
  'dlpc-salaries': { icon: styles.sched_amber, Icon: Users },
  'dle-dayrate': { icon: styles.sched_green, Icon: WalletCards },
  'dlpc-dayrate': { icon: styles.sched_purple, Icon: WalletCards },
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
  employmentType?: string | null;
  status?: string | null;
  issues?: string[] | null;
}>(records: T[], query: string): T[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return records;
  return records.filter((record) => {
    const haystack = [
      record.employeeId,
      record.fullName,
      record.department,
      record.payrollGroup,
      record.employmentType,
      record.status,
      ...(record.issues || []),
    ]
      .map((item) => String(item || '').toLowerCase())
      .join(' ');
    return tokens.every((token) => haystack.includes(token));
  });
}

function MomDelta({
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
    return <div className={styles.metricDelta}>vs prior month —</div>;
  }
  const down = metric.variance < 0;
  const signed = (() => {
    if (metric.kind === 'count') {
      if (metric.variance > 0) return `↗ +${number(metric.variance)}`;
      if (metric.variance < 0) return `↘ -${number(Math.abs(metric.variance))}`;
      return number(metric.variance);
    }
    if (!canViewMoney) return 'Restricted';
    const formatted = formatPayrollMoney(Math.abs(metric.variance), 'NGN', { maximumFractionDigits: 0 });
    if (metric.variance > 0) return `↗ +${formatted}`;
    if (metric.variance < 0) return `↘ -${formatted}`;
    return formatted;
  })();
  const pctValue = Math.abs(metric.pctChange);
  const pctText = `${metric.pctChange > 0 ? '+' : metric.pctChange < 0 ? '-' : ''}${new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 }).format(pctValue)}%`;
  return (
    <div className={`${styles.metricDelta} ${down ? styles.metricDeltaDown : ''}`}>
      {signed} · {pctText} vs {mom.previousPeriodLabel || 'prior month'}
    </div>
  );
}

const statusTone = (status: string) => {
  if (/cfo approved|approved|released|posted|published|closed|locked/i.test(status)) return 'Active';
  if (/ready|computed|validated|submitted|under review|hr approved|finance approved/i.test(status)) return status;
  if (/draft|open|reopened/i.test(status)) return 'Not Started';
  return status || 'Not Started';
};

export default function ProcessPayrollWorkspace({
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
  const [sessionReady, setSessionReady] = useState(false);
  const [activeTab, setActiveTab] = useState<BottomTab>('register');
  const [salaryQuery, setSalaryQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);

  const loadSession = async () => {
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.data) {
        setRole(primaryRoleFromSession({
          fullName: json.data.fullName,
          username: json.data.username,
          roles: Array.isArray(json.data.roles) ? json.data.roles : [],
          isGlobalAdmin: Boolean(json.data.isGlobalAdmin),
        }));
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
        throw new Error(json.error || `Process payroll request failed (${res.status})`);
      }
      setPayload(json.data);
      setPeriod(json.data.period);
      if (json.data.pack) setPack(json.data.pack);
      if (json.data.company === 'DLE' || json.data.company === 'DLPC') setCompany(json.data.company);
    } catch (event) {
      setError(event instanceof Error ? event.message : 'Unable to load process payroll workspace');
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
  const canCalculate = Boolean(payload?.permissions.canCalculate);
  const canSubmit = Boolean(payload?.permissions.canSubmit);
  const canExport = Boolean(payload?.permissions.canExport);
  const canLock = Boolean(payload?.permissions.canLock);

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

  const status = run?.status || 'Draft';
  const releasedStatuses = ['Released', 'Locked', 'Posted', 'Published', 'Closed'];
  const approvedStatuses = ['Approved', ...releasedStatuses];
  const computedStatuses = ['Computed', 'Calculated', 'Ready for Approval', 'Submitted', 'Under Review', 'HR Approved', 'Finance Approved', 'CFO Approved', ...approvedStatuses];
  const submittedStatuses = ['Submitted', 'Under Review', 'HR Approved', 'Finance Approved', 'CFO Approved', ...approvedStatuses];

  const workflowSteps = useMemo((): WorkflowStep[] => {
    const isReleased = releasedStatuses.includes(status);
    const steps: Array<Omit<WorkflowStep, 'current'> & { action?: string }> = [
      {
        id: 'validate-payroll',
        label: 'Validate',
        detail: 'Check master data and setup exceptions',
        done: Boolean(run?.validatedAt) || ['Validated', ...computedStatuses].includes(status),
        action: 'validate-payroll',
      },
      {
        id: 'create-run',
        label: 'Run Payroll',
        detail: 'Compute gross, deductions and net pay',
        done: computedStatuses.includes(status),
        action: 'create-run',
      },
      {
        id: 'submit-run',
        label: 'Submit',
        detail: 'Send payroll for approval',
        done: Boolean(run?.submittedAt) || submittedStatuses.includes(status),
        action: 'submit-run',
      },
      {
        id: 'hr-manager-approve',
        label: 'HR Approve',
        detail: 'HR Manager sign-off',
        done: Boolean(run?.hrReviewedAt) || ['HR Approved', 'Finance Approved', 'CFO Approved', ...approvedStatuses].includes(status),
        action: 'hr-manager-approve',
      },
      {
        id: 'finance-manager-approve',
        label: 'Finance Approve',
        detail: 'Finance Manager sign-off',
        done: Boolean(run?.financeReviewedAt) || ['Finance Approved', 'CFO Approved', ...approvedStatuses].includes(status),
        action: 'finance-manager-approve',
      },
      {
        id: 'cfo-approve',
        label: 'CFO Approve',
        detail: 'CFO sign-off',
        done: Boolean(run?.cfoReviewedAt) || ['CFO Approved', ...approvedStatuses].includes(status),
        action: 'cfo-approve',
      },
      {
        id: 'md-ceo-approve',
        label: 'MD / CEO Approve',
        detail: 'Final executive sign-off',
        done: Boolean(run?.approvedAt) || approvedStatuses.includes(status),
        action: 'md-ceo-approve',
      },
      {
        id: 'release-run',
        label: 'Release',
        detail: 'Unlock payslips, bank and statutory outputs',
        done: Boolean(run?.releasedAt) || isReleased,
        action: 'release-run',
      },
      {
        id: 'generate-bank-schedule',
        label: 'Bank Schedule',
        detail: 'Generate bank payment file',
        done: Boolean(run?.bankScheduleGeneratedAt),
        action: 'generate-bank-schedule',
      },
      {
        id: 'generate-payslips',
        label: 'Payslips',
        detail: 'Publish employee payslips to ESS',
        done: Boolean(run?.payslipsGeneratedAt),
        action: 'generate-payslips',
      },
      {
        id: 'generate-statutory-schedules',
        label: 'Statutory Reports',
        detail: 'PAYE, pension, NHF, NSITF, ITF',
        done: Boolean(run?.statutorySchedulesGeneratedAt),
        action: 'generate-statutory-schedules',
      },
    ];

    const firstOpen = steps.findIndex((step) => !step.done);
    return steps.map((step, index) => ({
      ...step,
      current: firstOpen === index,
    }));
  }, [run, status]);

  const nextStep = workflowSteps.find((step) => step.current) || null;

  const canFire = (step: WorkflowStep | null) => {
    if (!step?.action) return false;
    const perms = payload?.permissions;
    if (!perms) return false;
    if (step.action === 'validate-payroll' || step.action === 'create-run') return canCalculate && !step.done;
    if (step.action === 'submit-run') return canSubmit && !step.done && computedStatuses.includes(status) && !submittedStatuses.includes(status);
    if (step.action === 'hr-manager-approve') return (perms.canApproveHrManager || perms.canApproveAnyStage) && step.current;
    if (step.action === 'finance-manager-approve') return (perms.canApproveFinanceManager || perms.canApproveAnyStage) && step.current;
    if (step.action === 'cfo-approve') return (perms.canApproveCfo || perms.canApproveAnyStage) && step.current;
    if (step.action === 'md-ceo-approve') return (perms.canApproveMdCeo || perms.canApproveAnyStage) && step.current;
    if (step.action === 'release-run') return canLock && step.current;
    if (/generate-/.test(step.action)) return canCalculate && step.current;
    return false;
  };

  const readyCount = Number(payload?.summary.readyEmployees ?? payload?.summary.ready ?? 0);
  const reviewCount = Number(payload?.summary.reviewEmployees ?? payload?.summary.review ?? 0);
  const blockedCount = Number(payload?.summary.blockedEmployees ?? payload?.summary.blocked ?? 0);
  const eligible = Number(payload?.summary.payrollEligible || payload?.summary.employees || 0);
  const readinessPct = eligible ? Math.round((readyCount / eligible) * 100) : 0;
  const exceptionCount = Number(payload?.summary.exceptionCount || 0);
  const gross = payload?.summary.grossPay;
  const net = payload?.summary.netPay;
  const deductions = payload?.summary.totalDeductions ?? payload?.summary.deductions;
  const deductionRatio = gross && Number(gross) > 0 && deductions != null
    ? `${new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 }).format((Number(deductions) / Number(gross)) * 100)}% of gross pay`
    : '—';

  const departments = useMemo(() => {
    const set = new Set<string>();
    for (const record of payload?.records || []) {
      if (record.department) set.add(record.department);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [payload?.records]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const record of payload?.records || []) {
      const label = record.employmentType || record.payrollGroup;
      if (label) set.add(label);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [payload?.records]);

  const employeeRows = useMemo(() => {
    let rows = [...ngnPayrollKpiRecords(payload?.records || [])];
    if (activeTab === 'issues') {
      rows = rows.filter((record) => record.status !== 'Ready' || (record.issues || []).length > 0);
    }
    if (deptFilter !== 'all') rows = rows.filter((record) => record.department === deptFilter);
    if (categoryFilter !== 'all') {
      rows = rows.filter((record) => (record.employmentType || record.payrollGroup) === categoryFilter);
    }
    if (statusFilter !== 'all') rows = rows.filter((record) => record.status === statusFilter);
    rows = searchEmployees(rows, salaryQuery);
    rows.sort((a, b) => Number(b.grossPay || 0) - Number(a.grossPay || 0));
    return rows;
  }, [payload?.records, salaryQuery, activeTab, deptFilter, categoryFilter, statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [salaryQuery, activeTab, payload?.period, scheduleId, deptFilter, categoryFilter, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(employeeRows.length / PAGE_SIZE));
  const pageRows = useMemo(
    () => employeeRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [employeeRows, page],
  );
  const pageWindowStart = Math.max(1, Math.min(page - 2, pageCount - 4));
  const visiblePages = Array.from({ length: Math.min(5, pageCount) }, (_, i) => pageWindowStart + i);

  const artifacts = payload?.artifacts || run?.artifacts || [];
  const audit = run?.audit || [];
  const isActive = Boolean(run && !['Draft', 'Open', 'Reopened'].includes(run.status));

  const selectSchedule = (id: PayrollScheduleScopeId) => {
    const scope = payrollScheduleScopeById(id);
    if (!scope) return;
    setScheduleId(scope.id);
    setPack(scope.pack as PayrollPack);
    setCompany(scope.company);
    setActiveTab('register');
    setSalaryQuery('');
    router.replace(`/hris/payroll-management/process-payroll?schedule=${scope.id}`, { scroll: false });
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
          note: `${actionName} from process payroll workspace (${company} ${pack})`,
        }),
      });
      const json = (await res.json()) as ApiResponse<{ run: PayrollRun }>;
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to update payroll run');
      setToast(`${json.data?.run.packLabel || pack} moved to ${json.data?.run.status || 'updated'}.`);
      await load(period, role, pack, company);
    } catch (event) {
      setToast(event instanceof Error ? event.message : 'Unable to update payroll run');
    } finally {
      setPosting('');
    }
  };

  const exportCsv = async () => {
    setToast('');
    try {
      const params = new URLSearchParams({ format: 'csv', period, pack, company });
      const res = await fetch(`/api/hris/payroll/payroll-processing?${params.toString()}`, {
        headers: { 'x-hris-role': role },
        cache: 'no-store',
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error || `Export failed (${res.status}).`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `process-payroll-${period}-${company}-${pack}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setToast('CSV export downloaded.');
    } catch (event) {
      setToast(event instanceof Error ? event.message : 'Unable to export CSV.');
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
      anchor.download = named || `process-payroll-${period}-${company}-${pack}.xls`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setToast('Excel export downloaded.');
    } catch (event) {
      setToast(event instanceof Error ? event.message : 'Unable to export Excel.');
    }
  };

  const showRegister = activeTab === 'register' || activeTab === 'issues';
  const processPrimaryAction = canCalculate
    ? (computedStatuses.includes(status) ? 'Re-run Payroll' : 'Process Payroll')
    : null;

  const statusBadgeClass = (value: string) => {
    if (/ready/i.test(value)) return styles.ready;
    if (/review/i.test(value)) return styles.review;
    return styles.blocked;
  };

  const loadedLabel = payload?.generatedAt
    ? new Date(payload.generatedAt).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    : '—';

  return (
    <div className={styles.content}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <span className={styles.titleIcon}>
            <Settings2 size={20} />
          </span>
          <div>
            <h1>Process Payroll</h1>
            <div className={styles.subtitle}>
              Prepare, validate and process payroll. Select a schedule below to view details.
            </div>
          </div>
        </div>
        <div className={styles.headerActions}>
          <label className={`${styles.btn} ${styles.periodBtn}`}>
            <CalendarDays size={16} />
            <input
              type="month"
              value={period}
              onChange={(event) => {
                setPeriod(event.target.value);
                void load(event.target.value, role, pack, company);
              }}
              style={{ border: 0, background: 'transparent', font: 'inherit', fontWeight: 800, outline: 'none', width: '110px' }}
            />
          </label>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnBlue}`}
            onClick={() => void load(period, role, pack, company)}
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnGreen}`}
            onClick={() => void exportCsv()}
            disabled={!payload || !canExport || loading}
          >
            <FileSpreadsheet size={16} />
            Export CSV
          </button>
          {processPrimaryAction ? (
            <button
              type="button"
              className={`${styles.btn} ${styles.btnDark}`}
              onClick={() => void action('create-run')}
              disabled={Boolean(posting) || loading}
            >
              <Play size={16} />
              {posting === 'create-run' ? 'Processing…' : processPrimaryAction}
            </button>
          ) : null}
        </div>
      </div>

      {error ? <div className={styles.bannerError}>{error}</div> : null}
      {toast ? <div className={styles.bannerInfo}>{toast}</div> : null}
      {payload?.dataSource?.warning ? <div className={styles.bannerWarn}>{payload.dataSource.warning}</div> : null}

      <div className={styles.scheduleTabs}>
        {packCards.map(({ scope, status: cardStatus, headcount, loaded }) => {
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
              <span className={`${styles.schedIcon} ${visual.icon}`}>
                <Icon size={22} />
              </span>
              <span className={styles.schedBody}>
                <b>{scope.label}</b>
                <span>
                  {loaded && headcount != null
                    ? `${number(headcount)} Employees`
                    : '—'}
                </span>
                <span className={styles.schedStatus}>● {statusTone(cardStatus)}</span>
              </span>
            </button>
          );
        })}
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <h2>
              {payload?.packLabel || selectedScope.label} – {payload?.periodLabel || period || '—'}
              {isActive ? <span className={styles.activeBadge}>● Active</span> : null}
            </h2>
            <p>
              Run: {run?.id || 'Not started'} &nbsp;|&nbsp; Loaded: {loadedLabel}
            </p>
          </div>
          <button
            type="button"
            className={styles.btn}
            onClick={() => router.push(`/hris/payroll-management/payroll-approval?schedule=${selectedScope.id}`)}
          >
            Schedule Details
          </button>
        </div>

        <div className={styles.summaryGrid}>
          <div className={styles.metric}>
            <span className={styles.metricIcon}><Users size={20} /></span>
            <div className={styles.metricLabel}>Ready Employees</div>
            <div className={styles.metricValue}>{number(readyCount)}</div>
            <div className={styles.metricMeta}>{readinessPct}% of total employees</div>
            <MomDelta mom={payload?.monthOverMonth} metricKey="employees" canViewMoney={canViewMoney} />
          </div>
          <div className={`${styles.metric} ${styles.metricGreen}`}>
            <span className={styles.metricIcon}><WalletCards size={20} /></span>
            <div className={styles.metricLabel}>Gross Pay</div>
            <div className={styles.metricValue}>{money(gross, canViewMoney)}</div>
            <div className={styles.metricMeta}>Net Pay: {money(net, canViewMoney)}</div>
            <MomDelta mom={payload?.monthOverMonth} metricKey="grossPay" canViewMoney={canViewMoney} />
          </div>
          <div className={`${styles.metric} ${styles.metricRed}`}>
            <span className={styles.metricIcon}><PieChart size={20} /></span>
            <div className={styles.metricLabel}>Total Deductions</div>
            <div className={styles.metricValue}>{money(deductions, canViewMoney)}</div>
            <div className={styles.metricMeta}>{deductionRatio}</div>
            <MomDelta mom={payload?.monthOverMonth} metricKey="deductions" canViewMoney={canViewMoney} />
          </div>
          <div className={`${styles.metric} ${styles.metricPurple}`}>
            <span className={styles.metricIcon}><TriangleAlert size={20} /></span>
            <div className={styles.metricLabel}>Issues / Exceptions</div>
            <div className={styles.metricValue}>{number(exceptionCount)}</div>
            <div className={styles.metricMeta}>{number(blockedCount)} blocked · {number(reviewCount)} review lines</div>
            <div className={styles.metricDelta}>
              {exceptionCount === 0 ? 'All checks passed' : 'Review open exceptions'}
            </div>
          </div>
        </div>

        <div className={styles.workflowWrap}>
          <div className={styles.workflowCard}>
            <div className={styles.workflowTitle}>Payroll Processing Workflow</div>
            <div className={styles.workflow}>
              {workflowSteps.map((step, index) => (
                <div
                  key={step.id}
                  className={`${styles.step} ${step.done ? styles.done : ''} ${step.current ? styles.current : ''}`}
                >
                  <div className={styles.circle}>
                    {step.done ? <Check size={14} /> : index + 1}
                  </div>
                  <b>{step.label}</b>
                  <span>{step.done ? 'Completed' : step.current ? 'Awaiting approval' : 'Pending'}</span>
                </div>
              ))}
            </div>
          </div>
          <div className={styles.nextCard}>
            <div className={styles.nextLabel}>Next Step</div>
            <div className={styles.nextValue}>{nextStep?.label || 'Complete'}</div>
            <div className={styles.nextMeta}>{nextStep?.detail || 'All processing steps are complete for this schedule.'}</div>
            {nextStep && canFire(nextStep) ? (
              <button
                type="button"
                className={`${styles.btn} ${styles.btnBlue} ${styles.nextAction}`}
                disabled={Boolean(posting)}
                onClick={() => nextStep.action && void action(nextStep.action)}
              >
                {posting === nextStep.action ? 'Working…' : `Run ${nextStep.label}`}
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <div className={styles.tabs}>
        {([
          ['register', 'Payroll Register'],
          ['variance', 'Variance'],
          ['processing', 'Processing'],
          ['outputs', 'Outputs'],
          ['issues', 'Issues'],
          ['audit', 'Audit Trail'],
          ['documents', 'Documents'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`${styles.tab} ${activeTab === id ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(id)}
          >
            {label}
            {id === 'issues' ? <span className={styles.count}>{exceptionCount}</span> : null}
          </button>
        ))}
      </div>

      <section className={styles.tablePanel}>
        {showRegister ? (
          <>
            <div className={styles.toolbar}>
              <input
                value={salaryQuery}
                onChange={(event) => setSalaryQuery(event.target.value)}
                placeholder="Search by name, ID, department..."
              />
              <select value={deptFilter} onChange={(event) => setDeptFilter(event.target.value)}>
                <option value="all">All Departments</option>
                {departments.map((dept) => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
              <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                <option value="all">All Categories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All Statuses</option>
                <option value="Ready">Ready</option>
                <option value="Review">Review</option>
                <option value="Blocked">Blocked</option>
              </select>
              <div className={styles.spacer} />
              <button type="button" className={styles.btn} onClick={() => void exportExcel()} disabled={!payload || !canExport}>
                <Download size={15} /> Export Excel
              </button>
            </div>
            <div className="dle-scroll-x overflow-x-auto">
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Employee</th>
                    <th>ID</th>
                    <th>Department</th>
                    <th>Category</th>
                    <th>Gross Pay</th>
                    <th>Deductions</th>
                    <th>Net Pay</th>
                    <th>Employer Cost</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((record, index) => {
                    const cc = recordCurrency(record);
                    return (
                      <tr key={record.employeeId}>
                        <td>{(page - 1) * PAGE_SIZE + index + 1}</td>
                        <td>
                          <div className={styles.emp}>{record.fullName}</div>
                          {activeTab === 'issues' && record.issues?.length ? (
                            <div className={styles.muted}>{record.issues.slice(0, 2).join('; ')}</div>
                          ) : null}
                        </td>
                        <td>{record.employeeId}</td>
                        <td>{record.department || '—'}</td>
                        <td>{record.employmentType || record.payrollGroup || '—'}</td>
                        <td className={styles.money}>{money(record.grossPay, canViewMoney, cc)}</td>
                        <td className={styles.deduct}>{money(record.totalDeductions, canViewMoney, cc)}</td>
                        <td className={styles.net}>{money(record.netPay, canViewMoney, cc)}</td>
                        <td className={styles.employer}>{money(record.employerCost, canViewMoney, cc)}</td>
                        <td><span className={statusBadgeClass(record.status)}>{record.status}</span></td>
                        <td>
                          <button
                            type="button"
                            className={styles.viewBtn}
                            onClick={() => {
                              setSalaryQuery(record.employeeId);
                              setActiveTab('register');
                            }}
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {!pageRows.length ? (
                    <tr>
                      <td colSpan={11}>
                        <div className={styles.emptyState}>
                          {loading ? 'Loading payroll register…' : 'No employees match the current filters.'}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className={styles.pagination}>
              <span>
                Showing {employeeRows.length ? (page - 1) * PAGE_SIZE + 1 : 0}
                {' '}to {Math.min(page * PAGE_SIZE, employeeRows.length)}
                {' '}of {number(employeeRows.length)} employees
              </span>
              <div className={styles.pages}>
                <button type="button" className={styles.pageBtn} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>‹</button>
                {visiblePages.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`${styles.pageBtn} ${page === p ? styles.pageActive : ''}`}
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </button>
                ))}
                <button type="button" className={styles.pageBtn} disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>›</button>
              </div>
            </div>
          </>
        ) : null}

        {activeTab === 'variance' ? (
          <div className={styles.emptyState}>
            {payload?.monthOverMonth?.available
              ? `Month-over-month variance vs ${payload.monthOverMonth.previousPeriodLabel || 'prior period'} is shown in the KPI cards above.`
              : 'Variance content will appear once a prior payroll period is available for comparison.'}
          </div>
        ) : null}

        {activeTab === 'processing' ? (
          <div className={styles.emptyState}>
            <div style={{ display: 'grid', gap: 8, textAlign: 'left', maxWidth: 520, margin: '0 auto' }}>
              {workflowSteps.map((step) => (
                <div key={step.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <span>{step.label}</span>
                  <strong>{step.done ? 'Completed' : step.current ? 'Current' : 'Pending'}</strong>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {activeTab === 'outputs' ? (
          <div className={styles.emptyState}>
            {artifacts.length
              ? artifacts.map((item) => (
                <div key={`${item.type}-${item.fileName}`} style={{ marginBottom: 8 }}>
                  <strong>{item.label || item.type}</strong> — {item.fileName}
                  <div className={styles.muted}>{item.generatedAt} · {item.generatedBy}</div>
                </div>
              ))
              : 'No output artifacts yet. Complete Release, Bank Schedule, Payslips, and Statutory Reports.'}
          </div>
        ) : null}

        {activeTab === 'audit' ? (
          <div className={styles.emptyState}>
            {audit.length
              ? (
                <div style={{ display: 'grid', gap: 8, textAlign: 'left', maxWidth: 720, margin: '0 auto' }}>
                  {audit.slice().reverse().slice(0, 40).map((entry, index) => (
                    <div key={`${entry.at}-${index}`}>
                      <strong>{entry.action}</strong>
                      <div className={styles.muted}>{entry.at} · {entry.actor}{entry.note ? ` · ${entry.note}` : ''}</div>
                    </div>
                  ))}
                </div>
              )
              : 'No audit events for this schedule yet.'}
          </div>
        ) : null}

        {activeTab === 'documents' ? (
          <div className={styles.emptyState}>
            Documents and generated schedules will appear here after bank, payslip, and statutory outputs are produced.
          </div>
        ) : null}
      </section>
    </div>
  );
}
