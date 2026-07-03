'use client';

import PayrollPeriodContextBar from './PayrollPeriodContextBar';
import type { ComponentType, ReactNode } from 'react';
import {
  AlertTriangle,
  Building2,
  ChevronRight,
  ClipboardList,
  Download,
  FileBarChart,
  FileSpreadsheet,
  Landmark,
  RefreshCcw,
  ShieldCheck,
  Users,
} from 'lucide-react';

type StatutoryException = {
  id: string;
  employeeId: string;
  employeeName: string;
  issue: string;
  severity: 'Low' | 'Medium' | 'High';
  owner: string;
};

type StatutoryRun = {
  status: string;
  statutorySchedulesGeneratedAt?: string | null;
};

export type StatutoryPayload = {
  period: string;
  periodLabel: string;
  generatedAt: string;
  dataSource?: { source: string; employeeCount: number };
  periodRecord?: { status: string } | null;
  periods?: Array<{ period: string; periodLabel: string; status: string; isActive: boolean }>;
  workflow?: { currentStatus: string; nextOwner: string };
  summary: { totalEmployees: number };
  exceptions: StatutoryException[];
  currentRun?: StatutoryRun | null;
  permissions?: { canExport?: boolean };
};

export type StatutoryTabId =
  | 'overview'
  | 'paye'
  | 'pension'
  | 'nhf'
  | 'nsitf'
  | 'itf'
  | 'compliance-reports'
  | 'exceptions';

type StatutoryCategoryId = 'paye' | 'pension' | 'nhf' | 'nsitf' | 'itf';

type Props = {
  payload: StatutoryPayload | null;
  activeTab: StatutoryTabId;
  loading: boolean;
  lastLoaded: string;
  viewPeriod: string | null;
  onRefresh: () => void;
  onExportCsv: () => void;
  onExportExcel: () => void;
  onSelectTab: (tab: StatutoryTabId) => void;
  onFixException: (id: string) => void;
  onViewAllExceptions: () => void;
  onGenerateSchedule: (category: StatutoryCategoryId) => void;
  onSelectPeriod: (period: string) => void;
};

const numberFmt = new Intl.NumberFormat('en-GB');
const fmtNum = (value: number) => numberFmt.format(value);
const fmtDateTime = (value: string) => new Date(value).toLocaleString('en-GB');

const statutoryException = (issue: string) =>
  /paye|tax|pension|nhf|nsitf|itf|statutory|remittance|tin|tax number|pension number|rsa|pfa/i.test(issue);

const categoryIssue = (issue: string, category: StatutoryCategoryId) => {
  if (category === 'paye') return /paye|tax|tin|taxable|tax code/i.test(issue);
  if (category === 'pension') return /pension|rsa|pfa/i.test(issue);
  if (category === 'nhf') return /nhf/i.test(issue);
  if (category === 'nsitf') return /nsitf/i.test(issue);
  return /itf/i.test(issue);
};

const tabs: { id: StatutoryTabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'paye', label: 'PAYE' },
  { id: 'pension', label: 'Pension' },
  { id: 'nhf', label: 'NHF' },
  { id: 'nsitf', label: 'NSITF' },
  { id: 'itf', label: 'ITF' },
  { id: 'compliance-reports', label: 'Compliance Reports' },
  { id: 'exceptions', label: 'Exceptions' },
];

const categoryMeta: Record<
  StatutoryCategoryId,
  { label: string; icon: ComponentType<{ className?: string }>; color: string; description: string }
> = {
  paye: {
    label: 'PAYE',
    icon: Landmark,
    color: '#2563EB',
    description: 'Manage tax rules, validation, schedules and PAYE returns.',
  },
  pension: {
    label: 'Pension',
    icon: ShieldCheck,
    color: '#8B5CF6',
    description: 'Manage pension rules, RSA setup, contributions and remittance.',
  },
  nhf: {
    label: 'NHF',
    icon: Building2,
    color: '#F59E0B',
    description: 'Manage NHF setup, employee registration and remittance schedules.',
  },
  nsitf: {
    label: 'NSITF',
    icon: Users,
    color: '#10B981',
    description: 'Manage NSITF employer contributions and compliance reporting.',
  },
  itf: {
    label: 'ITF',
    icon: ClipboardList,
    color: '#06B6D4',
    description: 'Manage ITF employer levy calculations and regulatory submissions.',
  },
};

const categoryStatus = (issues: StatutoryException[]) => {
  if (!issues.length) return { label: 'Ready', tone: 'green' as const };
  if (issues.some((item) => item.severity === 'High')) return { label: 'Blocked', tone: 'red' as const };
  return { label: 'Pending', tone: 'amber' as const };
};

const nextActionFor = (
  categories: Array<{ id: StatutoryCategoryId; issues: StatutoryException[] }>,
  schedulesGenerated: boolean,
  runStatus: string,
) => {
  const blocked = categories.find((item) => item.issues.some((issue) => issue.severity === 'High'));
  if (blocked) {
    return {
      title: `Review ${categoryMeta[blocked.id].label} compliance issues`,
      workspace: blocked.id as StatutoryTabId,
    };
  }
  const pending = categories.find((item) => item.issues.length > 0);
  if (pending) {
    return {
      title: `Review ${categoryMeta[pending.id].label} compliance issues`,
      workspace: pending.id as StatutoryTabId,
    };
  }
  if (!schedulesGenerated && ['Approved', 'Released', 'Locked', 'Posted', 'Published', 'Closed'].includes(runStatus)) {
    return { title: 'Generate Pension Schedule', workspace: 'pension' as StatutoryTabId };
  }
  if (!schedulesGenerated) {
    return { title: 'Generate statutory schedules after payroll approval', workspace: 'compliance-reports' as StatutoryTabId };
  }
  return { title: 'Statutory compliance is ready', workspace: 'compliance-reports' as StatutoryTabId };
};

export default function StatutoryComplianceHub({
  payload,
  activeTab,
  loading,
  lastLoaded,
  viewPeriod,
  onRefresh,
  onExportCsv,
  onExportExcel,
  onSelectTab,
  onFixException,
  onViewAllExceptions,
  onGenerateSchedule,
  onSelectPeriod,
}: Props) {
  const statutoryIssues = (payload?.exceptions || []).filter((item) => statutoryException(item.issue));
  const run = payload?.currentRun;
  const schedulesGenerated = Boolean(run?.statutorySchedulesGeneratedAt);
  const runStatus = run?.status || payload?.workflow?.currentStatus || 'Restricted';
  const workflowOwner = payload?.workflow?.nextOwner || 'Payroll Officer';

  const categories = (['paye', 'pension', 'nhf', 'nsitf', 'itf'] as StatutoryCategoryId[]).map((id) => ({
    id,
    issues: statutoryIssues.filter((item) => categoryIssue(item.issue, id)),
  }));

  const readyCategories = categories.filter((item) => !item.issues.length).length;
  const pendingCategories = categories.filter((item) => item.issues.length > 0 && !item.issues.some((issue) => issue.severity === 'High')).length;
  const blockedCategories = categories.filter((item) => item.issues.some((issue) => issue.severity === 'High')).length;
  const complianceTotal = Math.max(readyCategories + pendingCategories + blockedCategories, 1);

  const complianceSlices = [
    { label: 'Ready', value: readyCategories, color: '#10B981' },
    { label: 'Pending', value: pendingCategories, color: '#F59E0B' },
    { label: 'Blocked', value: blockedCategories, color: '#EF4444' },
  ];
  let complianceOffset = 0;
  const complianceDonut = complianceSlices.map((seg) => {
    const pct = seg.value / complianceTotal;
    const slice = { ...seg, pct, offset: complianceOffset };
    complianceOffset += pct;
    return slice;
  });

  const nextAction = nextActionFor(categories, schedulesGenerated, runStatus);

  const workspaces = [
    ...categories.map((item) => {
      const meta = categoryMeta[item.id];
      const status = categoryStatus(item.issues);
      return {
        tab: item.id as StatutoryTabId,
        title: meta.label,
        description: meta.description,
        icon: meta.icon,
        issues: item.issues.length,
        status: status.label === 'Ready' ? 'Configured' : status.label === 'Pending' ? 'Pending Review' : 'Blocked',
        tone: status.tone === 'green' ? ('green' as const) : status.tone === 'amber' ? ('amber' as const) : ('red' as const),
      };
    }),
    {
      tab: 'compliance-reports' as const,
      title: 'Compliance Reports',
      description: 'Generate returns, regulatory reports, certificates and submission tracking.',
      icon: FileBarChart,
      issues: statutoryIssues.length,
      status: schedulesGenerated ? 'Configured' : 'Pending Review',
      tone: (schedulesGenerated ? 'green' : 'amber') as 'green' | 'amber',
    },
  ];

  const quickActions: Array<
    | { label: string; category: StatutoryCategoryId; icon: ComponentType<{ className?: string }> }
    | { label: string; action: 'export'; icon: ComponentType<{ className?: string }> }
  > = [
    { label: 'Generate PAYE Schedule', category: 'paye', icon: Landmark },
    { label: 'Generate Pension Schedule', category: 'pension', icon: ShieldCheck },
    { label: 'Generate NHF Schedule', category: 'nhf', icon: Building2 },
    { label: 'Generate NSITF Schedule', category: 'nsitf', icon: Users },
    { label: 'Generate ITF Schedule', category: 'itf', icon: ClipboardList },
    { label: 'Export Compliance Report', action: 'export', icon: FileSpreadsheet },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div className="border-b border-[#E5E7EB] bg-white px-6 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#EF4444] text-white">
              <ShieldCheck className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-4xl font-bold tracking-tight">Statutory Deductions</h1>
              <p className="mt-1 text-sm text-[#64748B]">
                Manage PAYE, Pension, NHF, NSITF, ITF, schedules, compliance, and regulatory reporting.
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
              Export CSV
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
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
              {categories.map((item) => {
                const meta = categoryMeta[item.id];
                const status = categoryStatus(item.issues);
                const Icon = meta.icon;
                const badge =
                  status.tone === 'green'
                    ? 'bg-emerald-100 text-emerald-800'
                    : status.tone === 'amber'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-red-100 text-red-800';
                return (
                  <article key={item.id} className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100" style={{ color: meta.color }}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${badge}`}>{status.label}</span>
                    </div>
                    <p className="mt-3 text-sm font-semibold text-[#0F172A]">{meta.label}</p>
                    <p className="mt-1 text-xs text-[#64748B]">{fmtNum(item.issues.length)} issues</p>
                    <button
                      type="button"
                      onClick={() => onSelectTab(item.id)}
                      className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#2563EB] hover:underline"
                    >
                      View details
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </article>
                );
              })}
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
                        Current status: <span className="font-semibold text-[#0F172A]">{runStatus}</span> · Owner:{' '}
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

              <ChartCard title="Compliance Health" actionLabel="View compliance overview" onAction={() => onSelectTab('exceptions')}>
                <div className="flex items-center gap-4">
                  <svg viewBox="0 0 42 42" className="h-28 w-28 shrink-0 -rotate-90">
                    <circle cx="21" cy="21" r="15.9" fill="transparent" stroke="#E5E7EB" strokeWidth="4" />
                    {complianceDonut.map((slice) => (
                      <circle
                        key={slice.label}
                        cx="21"
                        cy="21"
                        r="15.9"
                        fill="transparent"
                        stroke={slice.color}
                        strokeWidth="4"
                        strokeDasharray={`${slice.pct * 100} ${100 - slice.pct * 100}`}
                        strokeDashoffset={25 - slice.offset * 100}
                      />
                    ))}
                  </svg>
                  <div className="space-y-2 text-xs">
                    {complianceSlices.map((seg) => (
                      <div key={seg.label} className="flex items-center gap-2 font-semibold text-slate-700">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: seg.color }} />
                        {seg.label}: {fmtNum(seg.value)}
                      </div>
                    ))}
                  </div>
                </div>
              </ChartCard>
            </section>

            <section>
              <h2 className="text-2xl font-semibold">Statutory Workspaces</h2>
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {workspaces.map((item) => (
                  <WorkspaceCard key={item.tab} {...item} onOpen={() => onSelectTab(item.tab)} />
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-2xl font-semibold">Top Statutory Exceptions</h2>
                <button type="button" onClick={onViewAllExceptions} className="text-sm font-semibold text-[#2563EB] hover:underline">
                  View all statutory exceptions
                  <ChevronRight className="ml-1 inline h-4 w-4" />
                </button>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#E5E7EB] text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                      <th className="px-3 py-2">Employee</th>
                      <th className="px-3 py-2">Employee ID</th>
                      <th className="px-3 py-2">Issue</th>
                      <th className="px-3 py-2">Severity</th>
                      <th className="px-3 py-2">Owner</th>
                      <th className="px-3 py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statutoryIssues.slice(0, 5).map((item) => (
                      <tr key={item.id} className="border-b border-slate-100">
                        <td className="px-3 py-3 font-semibold text-[#0F172A]">{item.employeeName}</td>
                        <td className="px-3 py-3 text-[#64748B]">{item.employeeId}</td>
                        <td className="px-3 py-3 text-slate-700">{item.issue}</td>
                        <td className="px-3 py-3">
                          <SeverityBadge severity={item.severity} />
                        </td>
                        <td className="px-3 py-3 text-[#64748B]">{item.owner}</td>
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            onClick={() => onFixException(item.id)}
                            className="inline-flex items-center gap-1 text-sm font-semibold text-[#2563EB] hover:underline"
                          >
                            Fix
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!statutoryIssues.length ? (
                  <p className="py-4 text-sm font-semibold text-emerald-700">No statutory exceptions found.</p>
                ) : null}
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold">Quick Actions</h2>
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                {quickActions.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => ('action' in item ? onExportExcel() : onGenerateSchedule(item.category))}
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
            issues={statutoryIssues}
            onBack={() => onSelectTab('overview')}
            onFix={onFixException}
            onViewAll={onViewAllExceptions}
          />
        ) : (
          <StatutoryTabPanel tab={activeTab} onBack={() => onSelectTab('overview')} onGenerateSchedule={onGenerateSchedule} />
        )}
      </div>
    </div>
  );
}

function StatutoryTabPanel({
  tab,
  onBack,
  onGenerateSchedule,
}: {
  tab: StatutoryTabId;
  onBack: () => void;
  onGenerateSchedule: (category: StatutoryCategoryId) => void;
}) {
  const tabMeta = tabs.find((item) => item.id === tab);
  const legacyLinks: Partial<Record<StatutoryTabId, string>> = {
    paye: '/hris/payroll/tax-paye',
    pension: '/hris/payroll/pension',
    nhf: '/hris/payroll/nhf-nsitf-itf',
    nsitf: '/hris/payroll/nhf-nsitf-itf',
    itf: '/hris/payroll/nhf-nsitf-itf',
  };
  const drillDowns: Partial<Record<StatutoryTabId, string[]>> = {
    paye: ['Tax Bands', 'Employee Tax Setup', 'PAYE Validation', 'PAYE Compliance'],
    pension: ['Pension Rules', 'RSA Setup', 'Contribution Review', 'Pension Compliance'],
    nhf: ['NHF Setup', 'Employee Registration', 'NHF Validation', 'NHF Remittance'],
    nsitf: ['NSITF Rules', 'Employer Contribution', 'NSITF Validation', 'NSITF Returns'],
    itf: ['ITF Rules', 'Employer Levy', 'ITF Validation', 'ITF Returns'],
    'compliance-reports': ['Monthly Returns', 'Annual Returns', 'Compliance Certificates', 'Submission Tracking'],
  };
  const href = legacyLinks[tab];
  const links = drillDowns[tab] || [];
  const scheduleCategory = tab === 'paye' || tab === 'pension' || tab === 'nhf' || tab === 'nsitf' || tab === 'itf' ? tab : null;

  return (
    <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
      <button type="button" onClick={onBack} className="text-sm font-semibold text-[#2563EB] hover:underline">
        ← Back to Overview
      </button>
      <h2 className="mt-4 text-2xl font-semibold">{tabMeta?.label || tab}</h2>
      <p className="mt-2 text-sm text-[#64748B]">Open the full {tabMeta?.label?.toLowerCase()} workspace for schedules, validation, and compliance controls.</p>
      {links.length ? (
        <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {links.map((label) => (
            <div key={label} className="rounded-xl border border-[#E5E7EB] bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
              {label}
            </div>
          ))}
        </div>
      ) : null}
      <div className="mt-6 flex flex-wrap gap-3">
        {scheduleCategory ? (
          <button
            type="button"
            onClick={() => onGenerateSchedule(scheduleCategory)}
            className="inline-flex items-center gap-2 rounded-xl bg-[#2563EB] px-5 py-3 text-sm font-bold text-white hover:bg-blue-700"
          >
            Generate {categoryMeta[scheduleCategory].label} Schedule
            <ChevronRight className="h-4 w-4" />
          </button>
        ) : null}
        {href ? (
          <a
            href={href}
            className="inline-flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-5 py-3 text-sm font-bold text-[#2563EB] hover:bg-blue-50"
          >
            Open full workspace
            <ChevronRight className="h-4 w-4" />
          </a>
        ) : null}
      </div>
    </section>
  );
}

function ExceptionsPanel({
  issues,
  onBack,
  onFix,
  onViewAll,
}: {
  issues: StatutoryException[];
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
        <p className="mt-2 text-sm text-[#64748B]">Review and resolve statutory exceptions before schedule generation and remittance.</p>
      </div>
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">{fmtNum(issues.length)} statutory exceptions</h3>
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
          {!issues.length ? <p className="text-sm font-semibold text-emerald-700">No statutory exceptions found.</p> : null}
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
  issues: number;
  onOpen: () => void;
}) {
  const badge =
    tone === 'green' ? 'bg-emerald-100 text-emerald-800' : tone === 'amber' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800';
  return (
    <article className="flex flex-col rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-[#EF4444]">
          <Icon className="h-5 w-5" />
        </span>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${badge}`}>{status}</span>
      </div>
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="mt-1 flex-1 text-sm text-[#64748B]">{description}</p>
      <p className="mt-3 text-xs font-semibold text-[#64748B]">
        Issues: <span className={issues > 0 ? 'text-amber-700' : 'text-emerald-700'}>{fmtNum(issues)}</span>
      </p>
      <button
        type="button"
        onClick={onOpen}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 py-2.5 text-sm font-bold text-[#EF4444] hover:bg-red-100"
      >
        Open Workspace
        <ChevronRight className="h-4 w-4" />
      </button>
    </article>
  );
}

function ChartCard({ title, actionLabel, onAction, children }: { title: string; actionLabel: string; onAction: () => void; children: ReactNode }) {
  return (
    <article className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
      <h3 className="text-lg font-semibold">{title}</h3>
      <div className="mt-4">{children}</div>
      <button type="button" onClick={onAction} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#2563EB] hover:underline">
        {actionLabel}
        <ChevronRight className="h-4 w-4" />
      </button>
    </article>
  );
}
