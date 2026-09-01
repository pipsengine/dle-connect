'use client';

import type { ComponentType } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Coins,
  FileSpreadsheet,
  FileText,
  GitBranch,
  Landmark,
  Lock,
  PlayCircle,
  ReceiptText,
  Settings,
  ShieldCheck,
  TrendingUp,
  WalletCards,
} from 'lucide-react';
import { PAYROLL_SCHEDULE_SCOPES } from '@/lib/payroll-schedule-scope';

type HubRun = {
  id: string;
  status: string;
};

type HubException = {
  id: string;
  issue: string;
  severity: string;
};

type HubAudit = {
  id: string;
  at: string;
  action: string;
  user: string;
  newValue?: string | null;
};

export type HubPayload = {
  period: string;
  periodLabel: string;
  generatedAt: string;
  payrollComputed?: boolean;
  periodRecord?: { status: string } | null;
  summary: {
    totalEmployees: number;
    payrollEligible: number;
    readinessReadyEmployees?: number;
    exceptionCount: number;
    blockedEmployees: number;
    reviewEmployees: number;
  };
  workflow?: { currentStatus: string; nextOwner: string };
  exceptions: HubException[];
  auditTrail?: HubAudit[];
};

export type HubWorkspaceId =
  | 'salary-management'
  | 'earnings-management'
  | 'deductions-management'
  | 'payroll-processing'
  | 'compliance-statutory-management'
  | 'finance-integration'
  | 'payroll-computation-workflow'
  | 'reports-analytics';

export type HubQuickLinkId =
  | 'payroll-calendar'
  | 'approval-center'
  | 'payslip-publishing'
  | 'audit-trail'
  | 'period-lock'
  | 'settings';

type Props = {
  payload: HubPayload | null;
  currentRun: HubRun | null;
  loading: boolean;
  onOpenWorkspace: (section: HubWorkspaceId, tab?: string) => void;
  onQuickLink: (link: HubQuickLinkId) => void;
  onReviewIssues: () => void;
  onChangePeriod: () => void;
};

const numberFmt = new Intl.NumberFormat('en-GB');
const fmtNum = (value: number | null | undefined) => numberFmt.format(Number(value || 0));
const fmtDateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

const countIssues = (exceptions: HubException[], patterns: RegExp[]) =>
  exceptions.filter((item) => patterns.some((pattern) => pattern.test(item.issue))).length;

const workspaceIssueCounts = (exceptions: HubException[]) => ({
  paySetup: countIssues(exceptions, [/payroll setup|payroll group|salary grade|salary structure|setup is not assigned|pay currency/i]),
  earnings: countIssues(exceptions, [/allowance|overtime|earning|gross pay is missing|daily.rate|timesheet hours/i]),
  deductions: countIssues(exceptions, [/paye|pension|nhf|deduction|loan recovery|union dues/i]),
  processing: countIssues(exceptions, [/validation|blocked|sage|variance|not payroll active/i]),
  statutory: countIssues(exceptions, [/paye|pension|nhf|nsitf|itf|statutory|compliance/i]),
  finance: countIssues(exceptions, [/bank|account no|journal|payment schedule/i]),
});

const workflowPendingCount = (run: HubRun | null, status: string) => {
  if (!run) return 0;
  if (status === 'Submitted') return 2;
  if (status === 'Under Review') return 3;
  if (['Validated', 'Computed', 'Ready for Approval'].includes(status)) return 1;
  return 0;
};

const nextActionTitle = (payload: HubPayload | null) => {
  const exceptions = payload?.summary.exceptionCount || 0;
  if (exceptions > 0) return 'Fix payroll issues before approval';
  const status = payload?.workflow?.currentStatus || 'Open';
  if (status === 'Open' || status === 'Draft') return 'Run payroll validation';
  if (['Validated', 'Computed'].includes(status)) return 'Submit payroll for approval';
  if (['Submitted', 'Under Review'].includes(status)) return 'Complete payroll approvals';
  if (status === 'Approved') return 'Release payroll and generate outputs';
  return 'Continue payroll processing';
};

const recentActivity = (payload: HubPayload | null, readyCount: number) => {
  const items: string[] = [];
  if (payload?.generatedAt) items.push('Payroll data loaded');
  const status = payload?.workflow?.currentStatus || payload?.periodRecord?.status || 'Open';
  if (status) items.push(`Status changed to ${status}`);
  if (readyCount > 0) items.push(`${fmtNum(readyCount)} employees ready`);
  for (const row of (payload?.auditTrail || []).slice(0, 3)) {
    const label = row.action.replace(/-/g, ' ');
    items.push(`${label}${row.newValue ? `: ${row.newValue}` : ''}`);
  }
  if (items.length < 5) items.push('Audit trail updated');
  return items.slice(0, 5);
};

export default function PayrollManagementHub({
  payload,
  currentRun,
  loading,
  onOpenWorkspace,
  onQuickLink,
  onReviewIssues,
  onChangePeriod,
}: Props) {
  const exceptions = payload?.exceptions || [];
  const issueCounts = workspaceIssueCounts(exceptions);
  const status = currentRun?.status || payload?.workflow?.currentStatus || payload?.periodRecord?.status || 'Open';
  const readyCount = payload?.summary.readinessReadyEmployees ?? payload?.summary.payrollEligible ?? 0;
  const nextTitle = nextActionTitle(payload);
  const pendingWorkflow = workflowPendingCount(currentRun, status);
  const activities = recentActivity(payload, readyCount);

  const contextCards = [
    {
      label: 'Payroll Period',
      value: payload?.periodLabel || 'Loading',
      detail: currentRun?.id || `payroll-${payload?.period || ''}`,
      action: 'Change period',
      onClick: onChangePeriod,
      tone: 'blue' as const,
    },
    {
      label: 'Status',
      value: status,
      detail: payload?.periodRecord?.status === 'Closed' ? 'Closed payroll period' : 'Active payroll period',
      tone: status === 'Closed' ? ('slate' as const) : ('green' as const),
    },
    {
      label: 'Employees',
      value: fmtNum(payload?.summary.totalEmployees),
      detail: `${fmtNum(payload?.summary.payrollEligible)} eligible`,
      tone: 'blue' as const,
    },
    {
      label: 'Issues',
      value: fmtNum(payload?.summary.exceptionCount),
      detail: `${fmtNum(payload?.summary.blockedEmployees)} blocked, ${fmtNum(payload?.summary.reviewEmployees)} to review`,
      action: 'Review issues',
      onClick: onReviewIssues,
      tone: 'danger' as const,
    },
    {
      label: 'Next Action',
      value: nextTitle,
      detail: `Owner: ${payload?.workflow?.nextOwner || 'Payroll Officer'}`,
      action: 'Go to issues',
      onClick: onReviewIssues,
      tone: 'violet' as const,
    },
  ];

  const workspaces: Array<{
    id: HubWorkspaceId;
    tab?: string;
    title: string;
    description: string;
    icon: ComponentType<{ className?: string }>;
    status: string;
    statusTone: 'green' | 'blue' | 'amber' | 'slate';
    issues?: number;
    pending?: number;
  }> = [
    {
      id: 'salary-management',
      tab: 'employee-salary-setup',
      title: 'Pay Setup',
      description: 'Configure salary grades, payroll groups, components and rules.',
      icon: Coins,
      status: issueCounts.paySetup > 0 ? 'Needs Review' : 'Configured',
      statusTone: issueCounts.paySetup > 0 ? 'amber' : 'green',
      issues: issueCounts.paySetup,
    },
    {
      id: 'earnings-management',
      tab: 'allowances',
      title: 'Earnings',
      description: 'Manage earnings, allowances and compensation items.',
      icon: TrendingUp,
      status: issueCounts.earnings > 0 ? 'Needs Review' : 'Configured',
      statusTone: issueCounts.earnings > 0 ? 'amber' : 'green',
      issues: issueCounts.earnings,
    },
    {
      id: 'deductions-management',
      tab: 'overview',
      title: 'Deductions',
      description: 'Manage taxes, pension, NHF and deductions.',
      icon: FileSpreadsheet,
      status: issueCounts.deductions > 0 ? 'Needs Review' : 'Configured',
      statusTone: issueCounts.deductions > 0 ? 'amber' : 'green',
      issues: issueCounts.deductions,
    },
    {
      id: 'payroll-processing',
      tab: 'payroll-run',
      title: 'Process Payroll',
      description: 'Opens DLE Salaries. DLPC Salaries and both day-rate schedules have their own pages in the menu.',
      icon: PlayCircle,
      status: ['Computed', 'Submitted', 'Under Review', 'Approved', 'Released', 'Closed'].includes(status) ? 'In Progress' : 'Ready',
      statusTone: 'green',
      issues: issueCounts.processing,
    },
    {
      id: 'compliance-statutory-management',
      tab: 'overview',
      title: 'Statutory',
      description: 'Manage statutory schedules, compliance and submissions.',
      icon: ShieldCheck,
      status: issueCounts.statutory > 0 ? 'Review' : 'Up to date',
      statusTone: issueCounts.statutory > 0 ? 'amber' : 'green',
      issues: issueCounts.statutory,
    },
    {
      id: 'finance-integration',
      tab: 'overview',
      title: 'Bank & Finance',
      description: 'Generate bank schedules, journals and finance outputs.',
      icon: Landmark,
      status: 'Ready',
      statusTone: 'green',
      issues: issueCounts.finance,
    },
    {
      id: 'payroll-computation-workflow',
      title: 'Workflow',
      description: 'Manage approvals, routing and payroll responsibilities.',
      icon: GitBranch,
      status: pendingWorkflow > 0 ? 'In Progress' : 'On Track',
      statusTone: pendingWorkflow > 0 ? 'blue' : 'green',
      pending: pendingWorkflow,
    },
    {
      id: 'reports-analytics',
      tab: 'standard-reports',
      title: 'Reports',
      description: 'Payroll reports, audit reports and compliance outputs.',
      icon: FileText,
      status: 'Available',
      statusTone: 'green',
    },
  ];

  const quickLinks: Array<{ id: HubQuickLinkId; label: string; icon: ComponentType<{ className?: string }> }> = [
    { id: 'payroll-calendar', label: 'Payroll Calendar', icon: CalendarDays },
    { id: 'approval-center', label: 'Approval Center', icon: BadgeCheck },
    { id: 'payslip-publishing', label: 'Payslip Publishing', icon: ReceiptText },
    { id: 'audit-trail', label: 'Audit Trail', icon: ClipboardList },
    { id: 'period-lock', label: 'Period Lock', icon: Lock },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div className="border-b border-[#E5E7EB] bg-white px-6 py-6">
        <div className="flex items-start gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#0F172A] text-white">
            <WalletCards className="h-7 w-7" />
          </span>
          <div>
            <h1 className="text-4xl font-bold tracking-tight">Payroll Management</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Manage payroll setup, processing, statutory compliance, outputs and reporting from a centralized workspace.
            </p>
          </div>
        </div>
      </div>

      <div className={`mx-auto max-w-[1400px] space-y-6 px-4 py-6 ${loading ? 'opacity-60' : ''}`}>
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {contextCards.map((card) => (
            <ContextCard key={card.label} {...card} />
          ))}
        </section>

        <section className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <AlertTriangle className="h-6 w-6" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-amber-800">Next Required Action</p>
                <h2 className="mt-1 text-2xl font-bold text-[#0F172A]">{nextTitle}</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Current status is <span className="font-bold text-slate-900">{status}</span>. Next owner:{' '}
                  <span className="font-bold text-slate-900">{payload?.workflow?.nextOwner || 'Payroll Officer'}</span>.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onReviewIssues}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#0F172A] px-6 text-sm font-bold text-white hover:bg-slate-800"
            >
              Review Issues
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-[#0F172A]">Payroll Schedules</h2>
          <p className="mt-1 text-sm text-slate-600">Each company and pay type has its own page, approval, Excel download, and bank schedule.</p>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {PAYROLL_SCHEDULE_SCOPES.map((scope) => (
              <button
                key={scope.id}
                type="button"
                onClick={() => { window.location.href = scope.href; }}
                className="rounded-2xl border border-[#E5E7EB] bg-white p-5 text-left shadow-sm transition hover:border-blue-300 hover:shadow-md"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0F172A] text-white">
                  {scope.pack === 'daily-rate' ? <WalletCards className="h-5 w-5" /> : <PlayCircle className="h-5 w-5" />}
                </span>
                <h3 className="mt-4 text-lg font-bold text-[#0F172A]">{scope.label}</h3>
                <p className="mt-1 text-sm text-slate-600">{scope.kindLabel} for {scope.company}.</p>
                <span className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-[#2563EB]">
                  Open schedule
                  <ArrowRight className="h-4 w-4" />
                </span>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-[#0F172A]">Payroll Workspaces</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {workspaces.map((item) => (
              <WorkspaceCard key={item.id} {...item} onOpen={() => onOpenWorkspace(item.id, item.tab)} />
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-[#0F172A]">Quick Links</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {quickLinks.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onQuickLink(item.id)}
                  className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 py-4 text-center text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:border-blue-200 hover:bg-blue-50"
                >
                  <Icon className="h-5 w-5 text-[#2563EB]" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
          <h2 className="text-2xl font-semibold text-[#0F172A]">Recent Activity</h2>
          <ul className="mt-4 space-y-3">
            {activities.map((item, index) => (
              <li key={`${item}-${index}`} className="flex items-center gap-3 text-sm text-slate-700">
                <span className="h-2 w-2 shrink-0 rounded-full bg-[#2563EB]" />
                <span className="font-medium">{item}</span>
                {index === 0 && payload?.generatedAt ? (
                  <span className="text-xs text-slate-400">{fmtDateTime(payload.generatedAt)}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function ContextCard({
  label,
  value,
  detail,
  action,
  onClick,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  action?: string;
  onClick?: () => void;
  tone: 'blue' | 'green' | 'danger' | 'violet' | 'slate';
}) {
  const tones = {
    blue: 'border-blue-200 bg-blue-50',
    green: 'border-emerald-200 bg-emerald-50',
    danger: 'border-red-200 bg-red-50',
    violet: 'border-violet-200 bg-violet-50',
    slate: 'border-slate-200 bg-slate-50',
  };
  const valueTone = {
    blue: 'text-[#2563EB]',
    green: 'text-[#10B981]',
    danger: 'text-[#EF4444]',
    violet: 'text-[#8B5CF6]',
    slate: 'text-slate-700',
  };
  return (
    <article className={`rounded-xl border p-4 shadow-sm ${tones[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-xl font-bold leading-tight ${valueTone[tone]}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-600">{detail}</p>
      {action && onClick ? (
        <button type="button" onClick={onClick} className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#2563EB] hover:underline">
          {action}
          <ArrowRight className="h-3 w-3" />
        </button>
      ) : null}
    </article>
  );
}

function WorkspaceCard({
  title,
  description,
  icon: Icon,
  status,
  statusTone,
  issues,
  pending,
  onOpen,
}: {
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  status: string;
  statusTone: 'green' | 'blue' | 'amber' | 'slate';
  issues?: number;
  pending?: number;
  onOpen: () => void;
}) {
  const badgeTone = {
    green: 'bg-emerald-100 text-emerald-800',
    blue: 'bg-blue-100 text-blue-800',
    amber: 'bg-amber-100 text-amber-800',
    slate: 'bg-slate-100 text-slate-700',
  };
  return (
    <article className="flex flex-col rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-[#2563EB]">
          <Icon className="h-5 w-5" />
        </span>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${badgeTone[statusTone]}`}>{status}</span>
      </div>
      <h3 className="mt-4 text-lg font-semibold text-[#0F172A]">{title}</h3>
      <p className="mt-1 flex-1 text-sm text-slate-600">{description}</p>
      <div className="mt-4 flex items-center justify-between text-xs font-semibold">
        {typeof issues === 'number' && issues > 0 ? <span className="text-[#EF4444]">{fmtNum(issues)} issues</span> : <span className="text-slate-400">No open issues</span>}
        {typeof pending === 'number' && pending > 0 ? <span className="text-[#F59E0B]">{fmtNum(pending)} pending</span> : null}
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 py-2.5 text-sm font-bold text-[#2563EB] hover:bg-blue-100"
      >
        Open
        <ChevronRight className="h-4 w-4" />
      </button>
    </article>
  );
}
