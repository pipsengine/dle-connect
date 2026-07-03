'use client';

import PayrollPeriodContextBar from './PayrollPeriodContextBar';
import type { ComponentType } from 'react';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  ChevronRight,
  Circle,
  CreditCard,
  Download,
  FileSpreadsheet,
  FileText,
  Landmark,
  Printer,
  RefreshCcw,
  Scale,
  Users,
} from 'lucide-react';

type FinanceException = {
  id: string;
  employeeId: string;
  employeeName: string;
  issue: string;
  severity: 'Low' | 'Medium' | 'High';
  owner: string;
};

type FinanceRecord = {
  employeeId: string;
  fullName: string;
  bankName?: string;
  accountNo?: string;
  sortCode?: string;
  branchCode?: string;
  bankCode?: string;
  netPay: number | null;
  grossPay?: number | null;
  deductions?: number | null;
  location?: string;
  payrollStatus: string;
  exceptionCount?: number;
  exceptions?: string[];
};

type PayrollArtifact = {
  type: string;
  label: string;
  fileName: string;
  generatedAt: string;
  generatedBy: string;
};

type FinanceRun = {
  status: string;
  bankScheduleGeneratedAt?: string | null;
  bankScheduleGeneratedBy?: string | null;
  statutorySchedulesGeneratedAt?: string | null;
  postedAt?: string | null;
  postedBy?: string | null;
  artifacts?: PayrollArtifact[];
};

export type BankFinancePayload = {
  period: string;
  periodLabel: string;
  generatedAt: string;
  payrollComputed?: boolean;
  dataSource?: { source: string; employeeCount: number };
  periodRecord?: { status: string } | null;
  periods?: Array<{ period: string; periodLabel: string; status: string; isActive: boolean }>;
  workflow?: { currentStatus: string; nextOwner: string };
  summary: {
    totalEmployees: number;
    payrollEligible?: number;
    netPay: number | null;
    grossPay?: number | null;
    deductions?: number | null;
    readyEmployees?: number;
    exceptionCount?: number;
  };
  records?: FinanceRecord[];
  exceptions: FinanceException[];
  currentRun?: FinanceRun | null;
  permissions?: { canViewMoney?: boolean; canExport?: boolean };
};

export type BankFinanceTabId =
  | 'overview'
  | 'bank-schedule'
  | 'payment-files'
  | 'payroll-journal'
  | 'reconciliation'
  | 'exceptions';

type WorkspaceId = 'bank-schedule' | 'payment-files' | 'payroll-journal' | 'reconciliation';

type Props = {
  payload: BankFinancePayload | null;
  activeTab: BankFinanceTabId;
  loading: boolean;
  lastLoaded: string;
  viewPeriod: string | null;
  canViewMoney: boolean;
  busyAction?: string;
  onRefresh: () => void;
  onExportCsv: () => void;
  onExportExcel: () => void;
  onExportPdf?: () => void;
  onSelectTab: (tab: BankFinanceTabId) => void;
  onFixException: (id: string) => void;
  onViewAllExceptions: () => void;
  onFinanceAction: (actionId: string) => void;
  onSelectPeriod: (period: string) => void;
};

const numberFmt = new Intl.NumberFormat('en-GB');
const moneyFmt = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });
const fmtNum = (value: number) => numberFmt.format(value);
const fmtMoney = (value: number | null | undefined, canView: boolean, payrollComputed?: boolean) => {
  if (!payrollComputed) return 'Not computed';
  if (!canView || value == null) return 'Restricted';
  return moneyFmt.format(value);
};
const fmtDateTime = (value: string) => new Date(value).toLocaleString('en-GB');

const financeException = (issue: string) =>
  /bank|account|payment|finance|journal|gl|cost|reconcil|sort code|branch|net pay|salary payment/i.test(issue);

const workspaceIssue = (issue: string, workspace: WorkspaceId) => {
  if (workspace === 'bank-schedule') return /bank|account|payment schedule|sort code|branch|net pay missing/i.test(issue);
  if (workspace === 'payment-files') return /payment file|bank file|export|invalid account/i.test(issue);
  if (workspace === 'payroll-journal') return /journal|posting|gl|mapping|ledger/i.test(issue);
  return /reconcil|variance|mismatch|unmatched/i.test(issue);
};

const tabs: { id: BankFinanceTabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'bank-schedule', label: 'Bank Schedule' },
  { id: 'payment-files', label: 'Payment Files' },
  { id: 'payroll-journal', label: 'Payroll Journal' },
  { id: 'reconciliation', label: 'Reconciliation' },
  { id: 'exceptions', label: 'Finance Exceptions' },
];

const financeStatusLabel = (run: FinanceRun | null | undefined, issueCount: number, payrollComputed?: boolean) => {
  if (!payrollComputed) return 'Awaiting Payroll';
  if (issueCount > 0) return 'Review Required';
  if (run?.postedAt && run?.bankScheduleGeneratedAt) return 'Ready for Finance';
  if (run?.bankScheduleGeneratedAt) return 'Schedule Ready';
  if (['Released', 'Locked', 'Posted', 'Published', 'Closed'].includes(run?.status || '')) return 'Ready';
  return 'Pending Release';
};

const readinessLabel = (run: FinanceRun | null | undefined, issueCount: number, payrollComputed?: boolean) => {
  if (!payrollComputed) return 'Pending';
  if (issueCount > 0) return 'Review';
  if (run?.postedAt && run?.bankScheduleGeneratedAt) return 'Ready';
  if (run?.bankScheduleGeneratedAt) return 'Ready';
  return 'Pending';
};

const nextActionFor = (
  run: FinanceRun | null | undefined,
  workspaces: Array<{ id: WorkspaceId; issues: FinanceException[]; status: string }>,
) => {
  const blocked = workspaces.find((item) => item.issues.some((issue) => issue.severity === 'High'));
  if (blocked) {
    return { title: `Resolve ${blocked.id.replace('-', ' ')} issues`, workspace: blocked.id as BankFinanceTabId };
  }
  if (!run?.bankScheduleGeneratedAt) {
    return { title: 'Generate Bank Schedule', workspace: 'bank-schedule' as BankFinanceTabId };
  }
  const paymentIssues = workspaces.find((item) => item.id === 'payment-files');
  if ((paymentIssues?.issues.length || 0) > 0) {
    return { title: 'Review payment file validation issues', workspace: 'payment-files' as BankFinanceTabId };
  }
  if (!run?.postedAt) {
    return { title: 'Post Payroll Journal', workspace: 'payroll-journal' as BankFinanceTabId };
  }
  const reconIssues = workspaces.find((item) => item.id === 'reconciliation');
  if ((reconIssues?.issues.length || 0) > 0) {
    return { title: 'Run payroll reconciliation', workspace: 'reconciliation' as BankFinanceTabId };
  }
  return { title: 'Finance outputs are ready', workspace: 'reconciliation' as BankFinanceTabId };
};

export default function BankFinanceHub({
  payload,
  activeTab,
  loading,
  lastLoaded,
  viewPeriod,
  canViewMoney,
  busyAction = '',
  onRefresh,
  onExportCsv,
  onExportExcel,
  onExportPdf,
  onSelectTab,
  onFixException,
  onViewAllExceptions,
  onFinanceAction,
  onSelectPeriod,
}: Props) {
  const run = payload?.currentRun;
  const payrollComputed = payload?.payrollComputed !== false;
  const financeIssues = (payload?.exceptions || []).filter((item) => financeException(item.issue));

  const workspaceDefs: Array<{
    id: WorkspaceId;
    tab: BankFinanceTabId;
    title: string;
    description: string;
    icon: ComponentType<{ className?: string }>;
  }> = [
    {
      id: 'bank-schedule',
      tab: 'bank-schedule',
      title: 'Bank Schedule',
      description: 'Generate employee payment schedules for bank processing.',
      icon: Landmark,
    },
    {
      id: 'payment-files',
      tab: 'payment-files',
      title: 'Salary Payment File',
      description: 'Generate and export payroll payment files in bank-specific formats.',
      icon: CreditCard,
    },
    {
      id: 'payroll-journal',
      tab: 'payroll-journal',
      title: 'Payroll Journal',
      description: 'Post payroll journals to Finance, ERP, and General Ledger.',
      icon: FileSpreadsheet,
    },
    {
      id: 'reconciliation',
      tab: 'reconciliation',
      title: 'Reconciliation',
      description: 'Reconcile payroll against bank payments and finance records.',
      icon: Scale,
    },
  ];

  const workspaces = workspaceDefs.map((item) => {
    const issues = financeIssues.filter((issue) => workspaceIssue(issue.issue, item.id));
    let status = 'Pending';
    let tone: 'green' | 'amber' | 'red' = 'amber';
    if (item.id === 'bank-schedule') {
      status = run?.bankScheduleGeneratedAt ? 'Ready' : issues.length ? 'Pending' : 'Ready';
      tone = run?.bankScheduleGeneratedAt ? 'green' : 'amber';
    } else if (item.id === 'payment-files') {
      status = issues.length ? 'Pending' : run?.bankScheduleGeneratedAt ? 'Ready' : 'Pending';
      tone = issues.length ? 'amber' : run?.bankScheduleGeneratedAt ? 'green' : 'amber';
    } else if (item.id === 'payroll-journal') {
      status = run?.postedAt ? 'Posted' : 'Not Posted';
      tone = run?.postedAt ? 'green' : issues.length ? 'red' : 'amber';
    } else {
      status = issues.length ? 'Pending' : run?.postedAt ? 'Ready' : 'Pending';
      tone = issues.length ? 'amber' : run?.postedAt ? 'green' : 'amber';
    }
    if (issues.some((issue) => issue.severity === 'High')) tone = 'red';
    return { ...item, issues, status, tone };
  });

  const readyCount = workspaces.filter((item) => item.tone === 'green').length;
  const pendingCount = workspaces.filter((item) => item.tone === 'amber').length;
  const blockedCount = workspaces.filter((item) => item.tone === 'red').length;
  const healthTotal = Math.max(readyCount + pendingCount + blockedCount, 1);

  const healthCards = [
    { label: 'Ready', count: readyCount, pct: Math.round((readyCount / healthTotal) * 100), color: '#10B981' },
    { label: 'Pending', count: pendingCount, pct: Math.round((pendingCount / healthTotal) * 100), color: '#F59E0B' },
    { label: 'Blocked', count: blockedCount, pct: Math.round((blockedCount / healthTotal) * 100), color: '#EF4444' },
  ];

  const nextAction = nextActionFor(run, workspaces);
  const financeStatus = financeStatusLabel(run, financeIssues.length, payrollComputed);
  const readiness = readinessLabel(run, financeIssues.length, payrollComputed);
  const workflowOwner = payload?.workflow?.nextOwner || 'Finance Manager';
  const workflowStatus = run?.status || payload?.workflow?.currentStatus || 'Ready';

  const quickActions: Array<
    | { label: string; action: string; icon: ComponentType<{ className?: string }> }
    | { label: string; export: true; icon: ComponentType<{ className?: string }> }
  > = [
    { label: 'Generate Bank Schedule', action: 'generate-bank-schedule', icon: Landmark },
    { label: 'Export Payment File', action: 'export-bank-file', icon: CreditCard },
    { label: 'Post Payroll Journal', action: 'post-run', icon: FileSpreadsheet },
    { label: 'Run Reconciliation', action: 'reconcile-bank-payment', icon: Scale },
    { label: 'Export Finance Report', export: true, icon: Download },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div className="border-b border-[#E5E7EB] bg-white px-6 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#0F172A] text-white">
              <Landmark className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-4xl font-bold tracking-tight">Bank & Finance</h1>
              <p className="mt-1 text-sm text-[#64748B]">
                Manage bank schedules, payment files, payroll journals, reconciliation, and finance outputs from one centralized workspace.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={onExportCsv}
              className="inline-flex items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-4 w-4" />
              Export Report
            </button>
            <button
              type="button"
              onClick={onExportExcel}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Export Excel
            </button>
          </div>
        </div>

        <div className="mt-4">
          <PayrollPeriodContextBar payload={payload} viewPeriod={viewPeriod} onSelectPeriod={onSelectPeriod} />
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-700">
              Net Payroll: {fmtMoney(payload?.summary.netPay, canViewMoney, payrollComputed)}
            </span>
            <span
              className={`rounded-full px-3 py-1.5 font-semibold ${
                financeStatus === 'Ready for Finance' || financeStatus === 'Schedule Ready' || financeStatus === 'Ready'
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-amber-50 text-amber-800'
              }`}
            >
              Finance: {financeStatus}
            </span>
          </div>
        </div>

        <nav className="mt-4 overflow-x-auto">
          <div className="flex min-w-max gap-1 rounded-xl border border-[#E5E7EB] bg-slate-50 p-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectTab(tab.id)}
                className={`min-h-10 rounded-lg px-4 text-sm font-semibold transition-colors ${
                  activeTab === tab.id ? 'bg-[#2563EB] text-white shadow-sm' : 'text-slate-600 hover:bg-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </nav>
      </div>

      <div className={`mx-auto max-w-[1400px] space-y-6 px-4 py-6 ${loading ? 'opacity-60' : ''}`}>
        {activeTab === 'overview' ? (
          <>
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                title="Employees"
                value={fmtNum(payload?.summary.totalEmployees || 0)}
                subtitle="Payroll population"
                tone="blue"
                icon={Users}
                actionLabel="View bank schedule"
                onAction={() => onSelectTab('bank-schedule')}
              />
              <KpiCard
                title="Net Payroll"
                value={fmtMoney(payload?.summary.netPay, canViewMoney, payrollComputed)}
                subtitle="Total net pay for period"
                tone="green"
                icon={Banknote}
                actionLabel="View journal"
                onAction={() => onSelectTab('payroll-journal')}
              />
              <KpiCard
                title="Finance Exceptions"
                value={fmtNum(financeIssues.length)}
                subtitle="Issues blocking finance outputs"
                tone="danger"
                icon={AlertTriangle}
                actionLabel="Review exceptions"
                onAction={() => onSelectTab('exceptions')}
              />
              <KpiCard
                title="Finance Readiness"
                value={readiness}
                subtitle={`${fmtNum(readyCount)} of ${fmtNum(workspaces.length)} workspaces ready`}
                tone="purple"
                icon={Scale}
                actionLabel="View finance health"
                onAction={() => onSelectTab('exceptions')}
              />
            </section>

            <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_0.8fr]">
              <div className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-start gap-4">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                      <AlertTriangle className="h-6 w-6" />
                    </span>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-amber-800">Next Required Action</p>
                      <h2 className="mt-1 text-2xl font-bold text-[#0F172A]">{nextAction.title}</h2>
                      <p className="mt-1 text-sm text-[#64748B]">
                        Current status: <span className="font-semibold text-[#0F172A]">{workflowStatus}</span> · Next owner:{' '}
                        <span className="font-semibold text-[#0F172A]">{workflowOwner}</span>
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectTab(nextAction.workspace)}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#0F172A] px-6 text-sm font-bold text-white hover:bg-slate-800"
                  >
                    Open Workspace
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
                <h3 className="text-lg font-semibold">Finance Health</h3>
                <div className="mt-4 space-y-3">
                  {healthCards.map((item) => (
                    <div key={item.label} className="rounded-xl border border-[#E5E7EB] bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
                          <span className="text-sm font-semibold text-[#0F172A]">{item.label}</span>
                        </div>
                        <span className="text-sm font-bold text-[#0F172A]">
                          {fmtNum(item.count)} · {item.pct}%
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 rounded-full bg-white">
                        <div className="h-1.5 rounded-full" style={{ width: `${item.pct}%`, background: item.color }} />
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => onSelectTab('exceptions')}
                  className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#2563EB] hover:underline"
                >
                  View finance health overview
                  <ChevronRight className="h-4 w-4" />
                </button>
              </section>
            </section>

            <section>
              <h2 className="text-2xl font-semibold">Finance Workspaces</h2>
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {workspaces.map((item) => (
                  <WorkspaceCard key={item.id} {...item} onOpen={() => onSelectTab(item.tab)} />
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-2xl font-semibold">Finance Exceptions</h2>
                <button type="button" onClick={onViewAllExceptions} className="text-sm font-semibold text-[#2563EB] hover:underline">
                  View all exceptions
                  <ChevronRight className="ml-1 inline h-4 w-4" />
                </button>
              </div>
              <div className="mt-4 space-y-3">
                {financeIssues.slice(0, 5).map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col gap-3 rounded-xl border border-[#E5E7EB] bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-[#0F172A]">{item.employeeName || 'Finance Reference'}</p>
                      <p className="text-xs text-[#64748B]">{item.employeeId || 'System'}</p>
                      <p className="mt-1 text-sm text-slate-700">{item.issue}</p>
                      <p className="mt-1 text-xs font-semibold text-[#64748B]">
                        <SeverityBadge severity={item.severity} /> · {item.owner}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onFixException(item.id)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-semibold text-[#2563EB] hover:bg-blue-50"
                    >
                      Fix
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                {!financeIssues.length ? (
                  <p className="text-sm font-semibold text-emerald-700">No finance exceptions found.</p>
                ) : null}
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold">Quick Actions</h2>
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                {quickActions.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => ('export' in item ? onExportExcel() : onFinanceAction(item.action))}
                      className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 py-4 text-center text-sm font-semibold text-slate-800 shadow-sm hover:border-blue-200 hover:bg-blue-50"
                    >
                      <Icon className="h-5 w-5 text-[#2563EB]" />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </section>
          </>
        ) : activeTab === 'exceptions' ? (
          <ExceptionsPanel
            issues={financeIssues}
            onBack={() => onSelectTab('overview')}
            onFix={onFixException}
            onViewAll={onViewAllExceptions}
          />
        ) : activeTab === 'bank-schedule' ? (
          <BankSchedulePanel
            payload={payload}
            run={run}
            canViewMoney={canViewMoney}
            busyAction={busyAction}
            onBack={() => onSelectTab('overview')}
            onFinanceAction={onFinanceAction}
            onExportExcel={onExportExcel}
            onExportPdf={onExportPdf}
          />
        ) : activeTab === 'payment-files' ? (
          <PaymentFilesPanel
            payload={payload}
            run={run}
            canViewMoney={canViewMoney}
            onBack={() => onSelectTab('overview')}
            onExportExcel={onExportExcel}
          />
        ) : activeTab === 'payroll-journal' ? (
          <PayrollJournalPanel run={run} busyAction={busyAction} onBack={() => onSelectTab('overview')} onFinanceAction={onFinanceAction} />
        ) : activeTab === 'reconciliation' ? (
          <ReconciliationPanel onBack={() => onSelectTab('overview')} onFinanceAction={onFinanceAction} />
        ) : null}
      </div>
    </div>
  );
}

const releasedStatuses = ['Released', 'Locked', 'Posted', 'Published', 'Closed'];

const bankScheduleRowsFor = (records: FinanceRecord[] = []) => {
  const ready = records.filter((record) => record.payrollStatus === 'Ready');
  return ready.length ? ready : records.filter((record) => record.payrollStatus !== 'Blocked');
};

const bankScheduleReadyFor = (run: FinanceRun | null | undefined) =>
  Boolean(
    run?.bankScheduleGeneratedAt ||
      run?.artifacts?.some((item) => item.type === 'bank-schedule'),
  );

const bankValidationIssues = (records: FinanceRecord[] = []) =>
  records.filter(
    (record) =>
      record.payrollStatus !== 'Blocked' &&
      (!record.bankName || !record.accountNo || !record.netPay || Number(record.netPay) <= 0),
  );

function WorkflowStepCard({
  title,
  status,
  detail,
  done,
}: {
  title: string;
  status: string;
  detail: string;
  done: boolean;
}) {
  return (
    <div className={`rounded-xl border p-4 ${done ? 'border-emerald-200 bg-emerald-50' : 'border-[#E5E7EB] bg-slate-50'}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${done ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-slate-400'}`}>
          {done ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
        </span>
        <div className="min-w-0">
          <p className={`text-sm font-bold ${done ? 'text-emerald-900' : 'text-[#0F172A]'}`}>{title}</p>
          <p className={`mt-1 text-xs font-semibold ${done ? 'text-emerald-700' : 'text-[#64748B]'}`}>{status}</p>
          <p className="mt-2 text-xs text-slate-600">{detail}</p>
        </div>
      </div>
    </div>
  );
}

function BankSchedulePanel({
  payload,
  run,
  canViewMoney,
  busyAction,
  onBack,
  onFinanceAction,
  onExportExcel,
  onExportPdf,
}: {
  payload: BankFinancePayload | null;
  run: FinanceRun | null | undefined;
  canViewMoney: boolean;
  busyAction: string;
  onBack: () => void;
  onFinanceAction: (actionId: string) => void;
  onExportExcel: () => void;
  onExportPdf?: () => void;
}) {
  const records = payload?.records || [];
  const bankRows = bankScheduleRowsFor(records);
  const previewRows = bankRows.slice(0, 25);
  const validationIssues = bankValidationIssues(records);
  const bankScheduleReady = bankScheduleReadyFor(run);
  const payrollReleased = releasedStatuses.includes(run?.status || '');
  const generating = busyAction === 'generate-bank-schedule';
  const totals = bankRows.reduce(
    (sum, record) => ({
      grossPay: sum.grossPay + Number(record.grossPay || 0),
      deductions: sum.deductions + Number(record.deductions || 0),
      netPay: sum.netPay + Number(record.netPay || 0),
    }),
    { grossPay: 0, deductions: 0, netPay: 0 },
  );
  const bankArtifact = run?.artifacts?.find((item) => item.type === 'bank-schedule');

  return (
    <div className="space-y-4">
      <style jsx global>{`
        @media print {
          body * { visibility: hidden; }
          #bank-schedule-print-area, #bank-schedule-print-area * { visibility: visible; }
          #bank-schedule-print-area { position: absolute; left: 0; top: 0; width: 100%; background: white; padding: 18px; }
          #bank-schedule-print-area table { width: 100%; border-collapse: collapse; }
          #bank-schedule-print-area th, #bank-schedule-print-area td { border: 1px solid #cbd5e1; padding: 6px; font-size: 11px; }
          #bank-schedule-print-area th { background: #0f172a !important; color: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
      <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
        <button type="button" onClick={onBack} className="text-sm font-semibold text-[#2563EB] hover:underline">
          ← Back to Overview
        </button>
        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Bank Schedule</h2>
            <p className="mt-2 text-sm text-[#64748B]">
              {payload?.periodLabel || 'Current period'} · {fmtNum(bankRows.length)} employees in payment schedule
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {bankScheduleReady ? (
              <>
                <button type="button" onClick={onExportExcel} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700">
                  <FileSpreadsheet className="h-4 w-4" />
                  Export Excel (all {fmtNum(bankRows.length)})
                </button>
                {onExportPdf ? (
                  <button type="button" onClick={onExportPdf} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50">
                    <FileText className="h-4 w-4" />
                    Export PDF
                  </button>
                ) : null}
                <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50">
                  <Printer className="h-4 w-4" />
                  Print Preview
                </button>
              </>
            ) : payrollReleased ? (
              <button
                type="button"
                disabled={generating}
                onClick={() => onFinanceAction('generate-bank-schedule')}
                className="inline-flex items-center gap-2 rounded-xl bg-[#2563EB] px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {generating ? 'Generating…' : 'Generate Bank Schedule'}
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <span className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800">Release payroll before generating the bank schedule.</span>
            )}
          </div>
        </div>

        {bankScheduleReady ? (
          <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            Bank schedule generated
            {run?.bankScheduleGeneratedAt ? ` on ${new Date(run.bankScheduleGeneratedAt).toLocaleString('en-GB')}` : ''}
            {run?.bankScheduleGeneratedBy ? ` by ${run.bankScheduleGeneratedBy}` : ''}.
            {bankArtifact ? ` File: ${bankArtifact.fileName}.` : ''} Use Export Excel to download the full schedule.
          </p>
        ) : null}

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <WorkflowStepCard
            title="Schedule Generation"
            done={bankScheduleReady || payrollReleased}
            status={bankScheduleReady ? 'Complete' : payrollReleased ? 'Ready to generate' : 'Waiting for payroll release'}
            detail={bankScheduleReady ? 'Bank payment schedule stamped and audit logged.' : 'Confirm generation to stamp this payroll period for bank processing.'}
          />
          <WorkflowStepCard
            title="Employee Payment Schedule"
            done={bankRows.length > 0}
            status={`${fmtNum(bankRows.length)} employees`}
            detail={`Net payroll exposure ${fmtMoney(totals.netPay, canViewMoney, payload?.payrollComputed !== false)} across salary payment lines.`}
          />
          <WorkflowStepCard
            title="Validation"
            done={validationIssues.length === 0}
            status={validationIssues.length ? `${fmtNum(validationIssues.length)} bank detail issues` : 'All payment lines validated'}
            detail={validationIssues.length ? 'Some employees are missing bank name, account number, or net pay.' : 'Bank name, account number, and net pay are present for schedule lines.'}
          />
          <WorkflowStepCard
            title="Export"
            done={bankScheduleReady}
            status={bankScheduleReady ? 'Ready for download' : 'Pending generation'}
            detail={bankScheduleReady ? 'Export formatted Excel for all employees or PDF for a summary extract.' : 'Generate the schedule first, then export to Excel or PDF.'}
          />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
          <p className="text-xs font-bold uppercase text-blue-700">Gross</p>
          <p className="mt-2 text-2xl font-bold text-[#0F172A]">{fmtMoney(totals.grossPay, canViewMoney, payload?.payrollComputed !== false)}</p>
        </div>
        <div className="rounded-xl border border-violet-100 bg-violet-50 p-4">
          <p className="text-xs font-bold uppercase text-violet-700">Deductions</p>
          <p className="mt-2 text-2xl font-bold text-[#0F172A]">{fmtMoney(totals.deductions, canViewMoney, payload?.payrollComputed !== false)}</p>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
          <p className="text-xs font-bold uppercase text-emerald-700">Net Salary</p>
          <p className="mt-2 text-2xl font-bold text-[#0F172A]">{fmtMoney(totals.netPay, canViewMoney, payload?.payrollComputed !== false)}</p>
        </div>
      </section>

      <section id="bank-schedule-print-area" className="rounded-2xl border border-[#E5E7EB] bg-white shadow-sm">
        <div className="border-b border-[#E5E7EB] p-5">
          <h3 className="text-lg font-semibold">Employee Payment Schedule Preview</h3>
          <p className="mt-1 text-sm text-[#64748B]">Review bank details and net salaries before export. Showing first {fmtNum(previewRows.length)} of {fmtNum(bankRows.length)} employees.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[960px] w-full text-left">
            <thead className="bg-[#0F172A] text-xs font-bold uppercase text-white">
              <tr>
                {['Employee Code', 'Employee Name', 'Bank', 'Account No', 'Sort Code', 'NET Salary', 'Location'].map((head) => (
                  <th key={head} className="px-4 py-3">
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {previewRows.map((record) => (
                <tr key={record.employeeId} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm font-semibold text-[#0F172A]">{record.employeeId}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-[#0F172A]">{record.fullName}</td>
                  <td className="px-4 py-3 text-xs text-slate-700">{record.bankName || 'Not configured'}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-slate-700">{record.accountNo || 'Not configured'}</td>
                  <td className="px-4 py-3 text-xs text-slate-700">{record.sortCode || record.branchCode || record.bankCode || '—'}</td>
                  <td className="px-4 py-3 text-sm font-bold text-emerald-700">{fmtMoney(record.netPay, canViewMoney, payload?.payrollComputed !== false)}</td>
                  <td className="px-4 py-3 text-xs text-slate-700">{record.location || '—'}</td>
                </tr>
              ))}
              {!previewRows.length ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm font-semibold text-slate-600">
                    No payment lines are ready. Process payroll and resolve blocked employees first.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {bankRows.length > previewRows.length ? (
          <p className="border-t border-slate-100 px-5 py-3 text-xs font-semibold text-[#64748B] print:hidden">
            Export Excel for the complete {fmtNum(bankRows.length)}-employee bank schedule.
          </p>
        ) : null}
      </section>
    </div>
  );
}

function PaymentFilesPanel({
  payload,
  run,
  canViewMoney,
  onBack,
  onExportExcel,
}: {
  payload: BankFinancePayload | null;
  run: FinanceRun | null | undefined;
  canViewMoney: boolean;
  onBack: () => void;
  onExportExcel: () => void;
}) {
  const records = payload?.records || [];
  const bankRows = bankScheduleRowsFor(records);
  const validationIssues = bankValidationIssues(records);
  const bankScheduleReady = bankScheduleReadyFor(run);
  const netTotal = bankRows.reduce((sum, record) => sum + Number(record.netPay || 0), 0);
  const bankArtifact = run?.artifacts?.find((item) => item.type === 'bank-schedule');

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
        <button type="button" onClick={onBack} className="text-sm font-semibold text-[#2563EB] hover:underline">
          ← Back to Overview
        </button>
        <h2 className="mt-4 text-2xl font-semibold">Payment Files</h2>
        <p className="mt-2 text-sm text-[#64748B]">Generate and export bank payment files for {payload?.periodLabel || 'the current period'}.</p>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <WorkflowStepCard
            title="Bank File Generation"
            done={bankScheduleReady}
            status={bankScheduleReady ? 'Schedule available' : 'Not generated'}
            detail={bankScheduleReady ? `Payment file based on ${fmtNum(bankRows.length)} salary lines.` : 'Generate the bank schedule on the Bank Schedule tab first.'}
          />
          <WorkflowStepCard
            title="File Validation"
            done={validationIssues.length === 0}
            status={validationIssues.length ? `${fmtNum(validationIssues.length)} issues` : 'Validated'}
            detail={validationIssues.length ? 'Fix missing bank accounts before sending to the bank.' : 'All schedule lines have bank account details and net pay.'}
          />
          <WorkflowStepCard
            title="Export History"
            done={Boolean(bankArtifact)}
            status={bankArtifact ? bankArtifact.fileName : 'No exports yet'}
            detail={bankArtifact ? `Last generated ${new Date(bankArtifact.generatedAt).toLocaleString('en-GB')} by ${bankArtifact.generatedBy}` : 'Export Excel to create the bank payment file.'}
          />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div>
            <p className="text-xs font-bold uppercase text-slate-500">Payment batch</p>
            <p className="mt-1 text-lg font-bold text-[#0F172A]">{fmtMoney(netTotal, canViewMoney, payload?.payrollComputed !== false)}</p>
            <p className="text-xs text-[#64748B]">{fmtNum(bankRows.length)} employees</p>
          </div>
          <button
            type="button"
            onClick={onExportExcel}
            disabled={!bankScheduleReady && bankRows.length === 0}
            className="ml-auto inline-flex items-center gap-2 rounded-xl bg-[#2563EB] px-5 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Export Payment File (Excel)
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      {validationIssues.length ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h3 className="text-sm font-bold text-amber-900">{fmtNum(validationIssues.length)} employees need bank details before payment file export</h3>
          <div className="mt-3 space-y-2">
            {validationIssues.slice(0, 8).map((record) => (
              <p key={record.employeeId} className="text-xs font-semibold text-amber-800">
                {record.employeeId} · {record.fullName} — {!record.bankName ? 'missing bank' : !record.accountNo ? 'missing account' : 'invalid net pay'}
              </p>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function PayrollJournalPanel({
  run,
  busyAction,
  onBack,
  onFinanceAction,
}: {
  run: FinanceRun | null | undefined;
  busyAction: string;
  onBack: () => void;
  onFinanceAction: (actionId: string) => void;
}) {
  const posted = Boolean(run?.postedAt);
  return (
    <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
      <button type="button" onClick={onBack} className="text-sm font-semibold text-[#2563EB] hover:underline">
        ← Back to Overview
      </button>
      <h2 className="mt-4 text-2xl font-semibold">Payroll Journal</h2>
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <WorkflowStepCard title="Journal Mapping" done={bankScheduleReadyFor(run)} status="GL mapping ready" detail="Payroll components mapped to finance ledger accounts." />
        <WorkflowStepCard title="Journal Posting" done={posted} status={posted ? `Posted ${run?.postedAt ? new Date(run.postedAt).toLocaleString('en-GB') : ''}` : 'Not posted'} detail={posted ? `Posted by ${run?.postedBy || 'Finance'}` : 'Post payroll journal after bank schedule and statutory schedules are generated.'} />
        <WorkflowStepCard title="Posting History" done={posted} status={posted ? 'Recorded in audit trail' : 'No postings'} detail="All journal postings are audit logged." />
      </div>
      {!posted ? (
        <button type="button" disabled={busyAction === 'post-run'} onClick={() => onFinanceAction('post-run')} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
          {busyAction === 'post-run' ? 'Posting…' : 'Post Payroll Journal'}
          <ChevronRight className="h-4 w-4" />
        </button>
      ) : null}
    </section>
  );
}

function ReconciliationPanel({ onBack, onFinanceAction }: { onBack: () => void; onFinanceAction: (actionId: string) => void }) {
  return (
    <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
      <button type="button" onClick={onBack} className="text-sm font-semibold text-[#2563EB] hover:underline">
        ← Back to Overview
      </button>
      <h2 className="mt-4 text-2xl font-semibold">Reconciliation</h2>
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <WorkflowStepCard title="Bank Reconciliation" done={false} status="Pending" detail="Match bank payment confirmations against the payroll schedule." />
        <WorkflowStepCard title="Payroll Reconciliation" done={false} status="Pending" detail="Compare gross, deductions, and net pay against finance records." />
        <WorkflowStepCard title="Variance Review" done={false} status="Pending" detail="Review and sign off any payment variances." />
      </div>
      <button type="button" onClick={() => onFinanceAction('reconcile-bank-payment')} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#2563EB] px-5 py-3 text-sm font-bold text-white hover:bg-blue-700">
        Run Reconciliation
        <ChevronRight className="h-4 w-4" />
      </button>
    </section>
  );
}

function ExceptionsPanel({
  issues,
  onBack,
  onFix,
  onViewAll,
}: {
  issues: FinanceException[];
  onBack: () => void;
  onFix: (id: string) => void;
  onViewAll: () => void;
}) {
  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
        <button type="button" onClick={onBack} className="text-sm font-semibold text-[#2563EB] hover:underline">
          ← Back to Overview
        </button>
        <h2 className="mt-4 text-2xl font-semibold">Exception Register</h2>
        <p className="mt-2 text-sm text-[#64748B]">Review and resolve finance exceptions before payment release and journal posting.</p>
      </div>
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">{fmtNum(issues.length)} finance exceptions</h3>
          <button type="button" onClick={onViewAll} className="text-sm font-semibold text-[#2563EB] hover:underline">
            Open resolution workflow
            <ChevronRight className="ml-1 inline h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {issues.slice(0, 20).map((item) => (
            <div
              key={item.id}
              className="flex flex-col gap-3 rounded-xl border border-[#E5E7EB] bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-semibold text-[#0F172A]">{item.employeeName}</p>
                <p className="text-xs text-[#64748B]">{item.employeeId}</p>
                <p className="mt-1 text-sm text-slate-700">{item.issue}</p>
                <p className="mt-1 text-xs font-semibold text-[#64748B]">
                  <SeverityBadge severity={item.severity} /> · {item.owner}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onFix(item.id)}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-semibold text-[#2563EB] hover:bg-blue-50"
              >
                Fix
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          ))}
          {!issues.length ? <p className="text-sm font-semibold text-emerald-700">No finance exceptions found.</p> : null}
        </div>
      </div>
    </section>
  );
}

function SeverityBadge({ severity }: { severity: 'Low' | 'Medium' | 'High' }) {
  const tones = {
    High: 'bg-red-100 text-red-800',
    Medium: 'bg-amber-100 text-amber-800',
    Low: 'bg-slate-100 text-slate-700',
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${tones[severity]}`}>{severity}</span>;
}

function KpiCard({
  title,
  value,
  subtitle,
  tone,
  icon: Icon,
  actionLabel,
  onAction,
}: {
  title: string;
  value: string;
  subtitle: string;
  tone: 'blue' | 'green' | 'purple' | 'danger';
  icon: ComponentType<{ className?: string }>;
  actionLabel: string;
  onAction: () => void;
}) {
  const tones = {
    blue: { accent: '#2563EB', icon: 'bg-blue-50 text-[#2563EB]' },
    green: { accent: '#10B981', icon: 'bg-emerald-50 text-[#10B981]' },
    purple: { accent: '#8B5CF6', icon: 'bg-violet-50 text-[#8B5CF6]' },
    danger: { accent: '#EF4444', icon: 'bg-red-50 text-[#EF4444]' },
  };
  const palette = tones[tone];
  return (
    <article className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm" style={{ borderTopWidth: 4, borderTopColor: palette.accent }}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-[#64748B]">{title}</p>
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${palette.icon}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-3 text-3xl font-bold text-[#0F172A]">{value}</p>
      <p className="mt-1 text-xs text-[#64748B]">{subtitle}</p>
      <button type="button" onClick={onAction} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#2563EB] hover:underline">
        {actionLabel}
        <ChevronRight className="h-4 w-4" />
      </button>
    </article>
  );
}

function WorkspaceCard({
  title,
  description,
  icon: Icon,
  status,
  tone,
  issues,
  onOpen,
}: {
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  status: string;
  tone: 'green' | 'amber' | 'red';
  issues: FinanceException[];
  onOpen: () => void;
}) {
  const badge =
    tone === 'green' ? 'bg-emerald-100 text-emerald-800' : tone === 'amber' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800';
  return (
    <article className="flex flex-col rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-[#0F172A]">
          <Icon className="h-5 w-5" />
        </span>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${badge}`}>{status}</span>
      </div>
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="mt-1 flex-1 text-sm text-[#64748B]">{description}</p>
      <p className="mt-3 text-xs font-semibold text-[#64748B]">
        Issues: <span className={issues.length > 0 ? 'text-amber-700' : 'text-emerald-700'}>{fmtNum(issues.length)}</span>
      </p>
      <button
        type="button"
        onClick={onOpen}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 py-2.5 text-sm font-bold text-[#0F172A] hover:bg-slate-100"
      >
        Open Workspace
        <ChevronRight className="h-4 w-4" />
      </button>
    </article>
  );
}
