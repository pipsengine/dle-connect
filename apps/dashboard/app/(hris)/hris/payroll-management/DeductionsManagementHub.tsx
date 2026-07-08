'use client';

import PayrollPeriodContextBar from './PayrollPeriodContextBar';
import type { ComponentType, ReactNode } from 'react';
import dynamic from 'next/dynamic';
import {
  AlertTriangle,
  ChevronRight,
  ClipboardList,
  Download,
  FileSpreadsheet,
  Landmark,
  Plus,
  RefreshCcw,
  Scale,
  ShieldCheck,
  Upload,
  Users,
  WalletCards,
} from 'lucide-react';

const TaxPayeClient = dynamic(() => import('../payroll/tax-paye/TaxPayeClient'), {
  ssr: false,
  loading: () => <WorkspaceLoading label="PAYE" />,
});
const PensionClient = dynamic(() => import('../payroll/pension/PensionClient'), {
  ssr: false,
  loading: () => <WorkspaceLoading label="pension" />,
});
const LoansAndSalaryAdvancesClient = dynamic(
  () => import('../payroll/loans-and-salary-advances/LoansAndSalaryAdvancesClient'),
  {
    ssr: false,
    loading: () => <WorkspaceLoading label="NHF / loans" />,
  },
);
const DeductionsClient = dynamic(() => import('../payroll/deductions/DeductionsClient'), {
  ssr: false,
  loading: () => <WorkspaceLoading label="deduction rules" />,
});

type DeductionException = {
  id: string;
  employeeId: string;
  employeeName: string;
  issue: string;
  severity: 'Low' | 'Medium' | 'High';
  owner: string;
};

type DeductionRecord = {
  employeeId: string;
  payrollStatus: string;
  paye?: number | null;
  pension?: number | null;
  otherDeductions?: number | null;
  exceptions?: string[];
};

export type DeductionsPayload = {
  period: string;
  periodLabel: string;
  generatedAt: string;
  dataSource?: { source: string; employeeCount: number };
  periodRecord?: { status: string } | null;
  periods?: Array<{ period: string; periodLabel: string; status: string; isActive: boolean }>;
  workflow?: { currentStatus: string; nextOwner: string };
  summary: {
    totalEmployees: number;
    reviewEmployees: number;
    blockedEmployees: number;
    exceptionCount: number;
  };
  records: DeductionRecord[];
  exceptions: DeductionException[];
  permissions?: { canExport?: boolean };
};

export type DeductionsTabId =
  | 'overview'
  | 'paye'
  | 'pension'
  | 'nhf-loans'
  | 'rules-engine'
  | 'exceptions';

type Props = {
  payload: DeductionsPayload | null;
  activeTab: DeductionsTabId;
  loading: boolean;
  lastLoaded: string;
  viewPeriod: string | null;
  onRefresh: () => void;
  onExportCsv: () => void;
  onExportExcel: () => void;
  onSelectTab: (tab: DeductionsTabId) => void;
  onFixException: (id: string) => void;
  onViewAllExceptions: () => void;
  onViewAudit: () => void;
  onSelectPeriod: (period: string) => void;
};

const numberFmt = new Intl.NumberFormat('en-GB');
const fmtNum = (value: number) => numberFmt.format(value);
const fmtDateTime = (value: string) => new Date(value).toLocaleString('en-GB');

const deductionException = (issue: string) =>
  /deduction|paye|tax|pension|nhf|loan|union|cooperative|suspension|refund|statutory|rsa/i.test(issue);

const payeIssue = (issue: string) => /paye|tax|tin|taxable/i.test(issue);
const pensionIssue = (issue: string) => /pension|rsa|pfa/i.test(issue);
const nhfLoanIssue = (issue: string) => /nhf|loan|union|cooperative|advance/i.test(issue);
const rulesIssue = (issue: string) => /rule|formula|threshold|exemption|deduction setup|eligibility/i.test(issue);

const tabs: { id: DeductionsTabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'paye', label: 'PAYE' },
  { id: 'pension', label: 'Pension' },
  { id: 'nhf-loans', label: 'NHF / Loans' },
  { id: 'rules-engine', label: 'Rules Engine' },
  { id: 'exceptions', label: 'Exceptions' },
];

const workspaceStatus = (issues: number) => ({
  status: issues > 0 ? 'Review Required' : 'Configured',
  tone: (issues > 0 ? 'amber' : 'green') as 'amber' | 'green',
});

export default function DeductionsManagementHub({
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
  onViewAudit,
  onSelectPeriod,
}: Props) {
  const records = payload?.records || [];
  const deductionIssues = (payload?.exceptions || []).filter((item) => deductionException(item.issue));
  const issueEmployeeIds = new Set(deductionIssues.map((item) => item.employeeId));

  const readyCount = records.filter((record) => !issueEmployeeIds.has(record.employeeId)).length;
  const reviewCount = records.filter((record) => issueEmployeeIds.has(record.employeeId) && record.payrollStatus === 'Review').length;
  const blockedCount = records.filter((record) => issueEmployeeIds.has(record.employeeId) && record.payrollStatus === 'Blocked').length;
  const coveragePct = records.length ? Math.round((readyCount / records.length) * 100) : 0;
  const validationWarnings = deductionIssues.filter((item) => item.severity === 'Medium' || item.severity === 'Low').length;

  const payeIssues = deductionIssues.filter((item) => payeIssue(item.issue));
  const pensionIssues = deductionIssues.filter((item) => pensionIssue(item.issue));
  const nhfLoanIssues = deductionIssues.filter((item) => nhfLoanIssue(item.issue));
  const rulesIssues = deductionIssues.filter((item) => rulesIssue(item.issue));

  const workspaces = [
    {
      tab: 'paye' as const,
      title: 'PAYE Tax',
      description: 'Manage PAYE tax rules, tax bands, employee tax setup, and tax compliance.',
      icon: Landmark,
      issues: payeIssues.length,
      ...workspaceStatus(payeIssues.length),
    },
    {
      tab: 'pension' as const,
      title: 'Pension (Employee & Employer)',
      description: 'Manage pension setup, contribution rates, RSA compliance, and pension validation.',
      icon: ShieldCheck,
      issues: pensionIssues.length,
      ...workspaceStatus(pensionIssues.length),
    },
    {
      tab: 'nhf-loans' as const,
      title: 'NHF, Union & Loans',
      description: 'Manage NHF deductions, staff loans, cooperative deductions, and union deductions.',
      icon: WalletCards,
      issues: nhfLoanIssues.length,
      ...workspaceStatus(nhfLoanIssues.length),
    },
    {
      tab: 'rules-engine' as const,
      title: 'Deduction Rules Engine',
      description: 'Configure deduction rules, eligibility, validation, and payroll deduction governance.',
      icon: Scale,
      issues: rulesIssues.length,
      ...workspaceStatus(rulesIssues.length),
    },
  ];

  const coverageSlices = [
    { label: 'Ready', value: readyCount, color: '#10B981' },
    { label: 'Review', value: reviewCount, color: '#F59E0B' },
    { label: 'Blocked', value: blockedCount, color: '#EF4444' },
  ];
  const coverageSum = Math.max(coverageSlices.reduce((sum, item) => sum + item.value, 0), 1);
  let coverageOffset = 0;
  const coverageDonut = coverageSlices.map((seg) => {
    const pct = seg.value / coverageSum;
    const slice = { ...seg, pct, offset: coverageOffset };
    coverageOffset += pct;
    return slice;
  });

  const hasUnion = (record: DeductionRecord) =>
    (record.exceptions || []).some((item) => /union/i.test(item)) || /union/i.test((record.exceptions || []).join(' '));
  const hasLoan = (record: DeductionRecord) =>
    (record.otherDeductions || 0) > 0 && (record.exceptions || []).some((item) => /loan|advance/i.test(item));
  const hasNhf = (record: DeductionRecord) => (record.exceptions || []).some((item) => /nhf/i.test(item));

  const categoryStats = [
    { label: 'PAYE', count: records.filter((record) => (record.paye || 0) > 0).length },
    { label: 'Pension', count: records.filter((record) => (record.pension || 0) > 0).length },
    { label: 'NHF', count: records.filter((record) => hasNhf(record) || /nhf/i.test((record.exceptions || []).join(' '))).length },
    { label: 'Loans', count: records.filter((record) => hasLoan(record) || /loan/i.test((record.exceptions || []).join(' '))).length },
    { label: 'Union', count: records.filter((record) => hasUnion(record)).length },
    {
      label: 'Others',
      count: records.filter((record) => (record.otherDeductions || 0) > 0).length,
    },
  ];
  const categoryMax = Math.max(...categoryStats.map((item) => item.count), 1);
  const categoryColors = ['#EF4444', '#8B5CF6', '#2563EB', '#F59E0B', '#10B981', '#64748B'];

  const severityData = [
    { label: 'High', value: deductionIssues.filter((item) => item.severity === 'High').length, color: '#EF4444' },
    { label: 'Medium', value: deductionIssues.filter((item) => item.severity === 'Medium').length, color: '#F59E0B' },
    { label: 'Low', value: deductionIssues.filter((item) => item.severity === 'Low').length, color: '#EAB308' },
  ];
  const severityTotal = Math.max(severityData.reduce((sum, item) => sum + item.value, 0), 1);
  let severityOffset = 0;
  const severityDonut = severityData.map((seg) => {
    const pct = seg.value / severityTotal;
    const slice = { ...seg, pct, offset: severityOffset };
    severityOffset += pct;
    return slice;
  });

  const workflowStatus = payload?.workflow?.currentStatus || payload?.periodRecord?.status || 'Restricted';
  const workflowOwner = payload?.workflow?.nextOwner || 'Payroll Officer';

  const quickActions: Array<
    | { label: string; tab: DeductionsTabId; icon: ComponentType<{ className?: string }> }
    | { label: string; action: 'export' | 'audit'; icon: ComponentType<{ className?: string }> }
  > = [
    { label: 'Add Deduction Rule', tab: 'rules-engine', icon: Plus },
    { label: 'Import Deduction Setup', tab: 'rules-engine', icon: Upload },
    { label: 'Validate Deductions', tab: 'exceptions', icon: AlertTriangle },
    { label: 'Run Compliance Check', tab: 'exceptions', icon: ShieldCheck },
    { label: 'Export Deduction Report', action: 'export', icon: FileSpreadsheet },
    { label: 'View Audit Trail', action: 'audit', icon: ClipboardList },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div className="border-b border-[#E5E7EB] bg-white px-6 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#8B5CF6] text-white">
              <FileSpreadsheet className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-4xl font-bold tracking-tight">Deductions Management</h1>
              <p className="mt-1 text-sm text-[#64748B]">
                Manage PAYE, pension, NHF, loans, union deductions, and payroll deduction compliance from one centralized workspace.
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
          <PayrollPeriodContextBar payload={payload} viewPeriod={viewPeriod} onSelectPeriod={onSelectPeriod} showMetaBadges={false} />
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
                actionLabel="View deductions"
                onAction={() => onSelectTab('paye')}
              />
              <KpiCard
                title="Deduction Coverage"
                value={`${coveragePct}%`}
                subtitle={`${fmtNum(readyCount)} employees deduction-ready`}
                tone="green"
                icon={ShieldCheck}
                actionLabel="View coverage"
                onAction={() => onSelectTab('exceptions')}
              />
              <KpiCard
                title="Deduction Exceptions"
                value={fmtNum(deductionIssues.length)}
                subtitle="Issues affecting deduction accuracy"
                tone="danger"
                icon={AlertTriangle}
                actionLabel="Review exceptions"
                onAction={onViewAllExceptions}
              />
              <KpiCard
                title="Validation Warnings"
                value={fmtNum(validationWarnings)}
                subtitle="Medium and low severity warnings"
                tone="purple"
                icon={Scale}
                actionLabel="Open validation queue"
                onAction={() => onSelectTab('exceptions')}
              />
            </section>

            <section className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                    <AlertTriangle className="h-6 w-6" />
                  </span>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-amber-800">Next Required Action</p>
                    <h2 className="mt-1 text-2xl font-bold text-[#0F172A]">
                      {deductionIssues.length > 0
                        ? 'Resolve deduction validation issues before payroll approval'
                        : 'Deductions are ready for payroll processing'}
                    </h2>
                    <p className="mt-1 text-sm text-[#64748B]">
                      Current status: <span className="font-semibold text-[#0F172A]">{workflowStatus}</span> · Owner:{' '}
                      <span className="font-semibold text-[#0F172A]">{workflowOwner}</span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onViewAllExceptions}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#0F172A] px-6 text-sm font-bold text-white hover:bg-slate-800"
                >
                  Review Exceptions
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold">Deduction Workspaces</h2>
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {workspaces.map((item) => (
                  <WorkspaceCard key={item.tab} {...item} onOpen={() => onSelectTab(item.tab)} />
                ))}
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold">Deduction Health</h2>
              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
                <ChartCard title="Deduction Coverage" actionLabel="View details" onAction={() => onSelectTab('exceptions')}>
                  <div className="flex items-center gap-4">
                    <svg viewBox="0 0 42 42" className="h-28 w-28 shrink-0 -rotate-90">
                      <circle cx="21" cy="21" r="15.9" fill="transparent" stroke="#E5E7EB" strokeWidth="4" />
                      {coverageDonut.map((slice) => (
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
                      {coverageSlices.map((seg) => (
                        <div key={seg.label} className="flex items-center gap-2 font-semibold text-slate-700">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: seg.color }} />
                          {seg.label}: {fmtNum(seg.value)}
                        </div>
                      ))}
                    </div>
                  </div>
                </ChartCard>

                <ChartCard title="Deduction Categories" actionLabel="View breakdown" onAction={() => onSelectTab('paye')}>
                  <div className="flex h-36 items-end justify-center gap-2">
                    {categoryStats.map((cat, index) => (
                      <div key={cat.label} className="flex flex-col items-center gap-1">
                        <div className="flex h-28 w-7 items-end rounded-t bg-slate-100">
                          <div
                            className="w-full rounded-t"
                            style={{
                              height: cat.count ? `${Math.max(8, (cat.count / categoryMax) * 100)}%` : '4px',
                              background: categoryColors[index % categoryColors.length],
                              opacity: cat.count ? 1 : 0.35,
                            }}
                          />
                        </div>
                        <span className="max-w-[40px] truncate text-[8px] font-bold text-slate-600">{cat.label}</span>
                      </div>
                    ))}
                  </div>
                </ChartCard>

                <ChartCard title="Deduction Exceptions" actionLabel="View exceptions" onAction={onViewAllExceptions}>
                  <div className="flex items-center gap-4">
                    <svg viewBox="0 0 42 42" className="h-28 w-28 shrink-0 -rotate-90">
                      <circle cx="21" cy="21" r="15.9" fill="transparent" stroke="#E5E7EB" strokeWidth="4" />
                      {severityDonut.map((slice) => (
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
                      {severityData.map((seg) => (
                        <div key={seg.label} className="flex items-center gap-2 font-semibold text-slate-700">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: seg.color }} />
                          {seg.label}: {fmtNum(seg.value)}
                        </div>
                      ))}
                    </div>
                  </div>
                </ChartCard>
              </div>
            </section>

            <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-2xl font-semibold">Deduction Exceptions</h2>
                <button type="button" onClick={onViewAllExceptions} className="text-sm font-semibold text-[#2563EB] hover:underline">
                  View all exceptions
                  <ChevronRight className="ml-1 inline h-4 w-4" />
                </button>
              </div>
              <div className="mt-4 space-y-3">
                {deductionIssues.slice(0, 5).map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col gap-3 rounded-xl border border-[#E5E7EB] bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-[#0F172A]">{item.employeeName}</p>
                      <p className="text-xs text-[#64748B]">{item.employeeId}</p>
                      <p className="mt-1 text-sm text-slate-700">{item.issue}</p>
                      <p className="mt-1 text-xs font-semibold text-[#64748B]">
                        {item.severity} · {item.owner}
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
                {!deductionIssues.length ? (
                  <p className="text-sm font-semibold text-emerald-700">No deduction exceptions found.</p>
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
                      onClick={() => {
                        if ('action' in item) {
                          if (item.action === 'export') onExportExcel();
                          else onViewAudit();
                        } else {
                          onSelectTab(item.tab);
                        }
                      }}
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
            issues={deductionIssues}
            onBack={() => onSelectTab('overview')}
            onFix={onFixException}
            onViewAll={onViewAllExceptions}
            onViewAudit={onViewAudit}
          />
        ) : (
          <DeductionsTabPanel
            tab={activeTab}
            lastLoaded={lastLoaded}
            onBack={() => onSelectTab('overview')}
          />
        )}
      </div>
    </div>
  );
}

function WorkspaceLoading({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-white p-8 text-sm font-semibold text-[#64748B] shadow-sm">
      Loading {label} workspace…
    </div>
  );
}

function DeductionsTabPanel({
  tab,
  lastLoaded,
  onBack,
}: {
  tab: DeductionsTabId;
  lastLoaded: string;
  onBack: () => void;
}) {
  const tabMeta = tabs.find((item) => item.id === tab);
  const now = lastLoaded || new Date().toISOString();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="text-sm font-semibold text-[#2563EB] hover:underline">
          ← Back to Overview
        </button>
        <p className="text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">{tabMeta?.label || tab}</p>
      </div>

      {tab === 'paye' ? <TaxPayeClient initialNow={now} /> : null}
      {tab === 'pension' ? <PensionClient initialNow={now} /> : null}
      {tab === 'nhf-loans' ? <LoansAndSalaryAdvancesClient initialNow={now} /> : null}
      {tab === 'rules-engine' ? <DeductionsClient initialNow={now} /> : null}
    </div>
  );
}

function ExceptionsPanel({
  issues,
  onBack,
  onFix,
  onViewAll,
  onViewAudit,
}: {
  issues: DeductionException[];
  onBack: () => void;
  onFix: (id: string) => void;
  onViewAll: () => void;
  onViewAudit: () => void;
}) {
  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
        <button type="button" onClick={onBack} className="text-sm font-semibold text-[#2563EB] hover:underline">
          ← Back to Overview
        </button>
        <h2 className="mt-4 text-2xl font-semibold">Exception Register</h2>
        <p className="mt-2 text-sm text-[#64748B]">Review and resolve deduction exceptions before payroll processing.</p>
      </div>
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">{fmtNum(issues.length)} deduction exceptions</h3>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={onViewAudit} className="text-sm font-semibold text-[#64748B] hover:underline">
              Audit trail
            </button>
            <button type="button" onClick={onViewAll} className="text-sm font-semibold text-[#2563EB] hover:underline">
              Open resolution workflow
              <ChevronRight className="ml-1 inline h-4 w-4" />
            </button>
          </div>
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
                  {item.severity} · {item.owner}
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
          {!issues.length ? <p className="text-sm font-semibold text-emerald-700">No deduction exceptions found.</p> : null}
        </div>
      </div>
    </section>
  );
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
  tone: 'green' | 'amber';
  issues: number;
  onOpen: () => void;
}) {
  const badge = tone === 'green' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800';
  return (
    <article className="flex flex-col rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-[#8B5CF6]">
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
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 py-2.5 text-sm font-bold text-[#8B5CF6] hover:bg-violet-100"
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
