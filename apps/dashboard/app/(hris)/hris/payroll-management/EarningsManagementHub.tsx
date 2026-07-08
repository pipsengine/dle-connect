'use client';

import PayrollPeriodContextBar from './PayrollPeriodContextBar';
import AllowancesClient from '../payroll/allowances/AllowancesClient';
import OvertimePayClient from '../payroll/overtime-pay/OvertimePayClient';
import DailyRatePayClient from '../payroll/daily-rate-pay/DailyRatePayClient';
import { BonusInputsPanel, EarningsExceptionsPanel, type EarningsException, type EarningsRecord } from './earnings-tab-content';
import type { ComponentType, ReactNode } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  ChevronRight,
  Clock3,
  Download,
  FileSpreadsheet,
  Plus,
  RefreshCcw,
  Sparkles,
  TrendingUp,
  Upload,
  Users,
  WalletCards,
} from 'lucide-react';

export type { EarningsException, EarningsRecord } from './earnings-tab-content';

export type EarningsPayload = {
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
  records: EarningsRecord[];
  exceptions: EarningsException[];
  permissions?: { canExport?: boolean; canViewMoney?: boolean };
};

export type EarningsTabId =
  | 'overview'
  | 'allowances'
  | 'overtime-pay'
  | 'daily-rate-pay'
  | 'bonus-inputs'
  | 'exceptions';

type Props = {
  payload: EarningsPayload | null;
  activeTab: EarningsTabId;
  loading: boolean;
  lastLoaded: string;
  viewPeriod: string | null;
  onRefresh: () => void;
  onExportCsv: () => void;
  onExportExcel: () => void;
  onSelectTab: (tab: EarningsTabId) => void;
  onFixException: (id: string) => void;
  onViewAllExceptions: () => void;
  onSelectPeriod: (period: string) => void;
};

const numberFmt = new Intl.NumberFormat('en-GB');
const fmtNum = (value: number) => numberFmt.format(value);
const fmtDateTime = (value: string) => new Date(value).toLocaleString('en-GB');

const earningsException = (issue: string) =>
  /allowance|overtime|earning|gross pay|daily.rate|timesheet|bonus|arrears|rate per day|hours worked/i.test(issue);

const allowanceIssue = (issue: string) => /allowance/i.test(issue);
const overtimeIssue = (issue: string) => /overtime|\bot\b/i.test(issue);
const dailyRateIssue = (issue: string) => /daily.rate|timesheet|rate per day|day rate|hours/i.test(issue);
const bonusIssue = (issue: string) => /bonus|arrears|merit/i.test(issue);

const tabs: { id: EarningsTabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'allowances', label: 'Allowances' },
  { id: 'overtime-pay', label: 'Overtime' },
  { id: 'daily-rate-pay', label: 'Daily Rate Pay' },
  { id: 'bonus-inputs', label: 'Bonus Inputs' },
  { id: 'exceptions', label: 'Exceptions' },
];

const workspaceStatus = (issues: number, readyWhenClear = false) => {
  if (issues > 0) return { status: 'Review Required', tone: 'amber' as const };
  if (readyWhenClear) return { status: 'Ready', tone: 'green' as const };
  return { status: 'Configured', tone: 'green' as const };
};

export default function EarningsManagementHub({
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
  onSelectPeriod,
}: Props) {
  const records = payload?.records || [];
  const earningsIssues = (payload?.exceptions || []).filter((item) => earningsException(item.issue));
  const issueEmployeeIds = new Set(earningsIssues.map((item) => item.employeeId));

  const readyCount = records.filter((record) => !issueEmployeeIds.has(record.employeeId)).length;
  const reviewCount = records.filter((record) => issueEmployeeIds.has(record.employeeId) && record.payrollStatus === 'Review').length;
  const blockedCount = records.filter((record) => issueEmployeeIds.has(record.employeeId) && record.payrollStatus === 'Blocked').length;
  const coverageTotal = Math.max(records.length, 1);
  const coveragePct = Math.round((readyCount / coverageTotal) * 100);
  const pendingReview = Math.max(reviewCount, new Set(earningsIssues.filter((item) => item.severity === 'Medium').map((item) => item.employeeId)).size);

  const allowanceIssues = earningsIssues.filter((item) => allowanceIssue(item.issue));
  const overtimeIssues = earningsIssues.filter((item) => overtimeIssue(item.issue));
  const dailyRateIssues = earningsIssues.filter((item) => dailyRateIssue(item.issue));
  const bonusIssues = earningsIssues.filter((item) => bonusIssue(item.issue));

  const dailyRateRows = records.filter(
    (record) => record.isDailyRate || /daily|day/i.test(`${record.employmentType} ${record.payrollGroup} ${record.paymentType || ''}`),
  );
  const allowanceRows = records.filter((record) => (record.allowances || 0) > 0);

  const workspaces = [
    {
      tab: 'allowances' as const,
      title: 'Allowances',
      description: 'Manage housing, transport, utility, meal, medical, leave and special allowances.',
      icon: WalletCards,
      issues: allowanceIssues.length,
      ...workspaceStatus(allowanceIssues.length),
    },
    {
      tab: 'overtime-pay' as const,
      title: 'Overtime Pay',
      description: 'Manage overtime rules, approvals and payable overtime earnings.',
      icon: Clock3,
      issues: overtimeIssues.length,
      ...workspaceStatus(overtimeIssues.length),
    },
    {
      tab: 'daily-rate-pay' as const,
      title: 'Daily Rate Pay',
      description: 'Manage attendance-driven daily-rate payroll earnings.',
      icon: Users,
      issues: dailyRateIssues.length,
      ...workspaceStatus(dailyRateIssues.length, true),
    },
    {
      tab: 'bonus-inputs' as const,
      title: 'Bonus Inputs',
      description: 'Manage bonuses, merit awards and special payroll earnings.',
      icon: Sparkles,
      issues: bonusIssues.length,
      ...workspaceStatus(bonusIssues.length, true),
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

  const categoryStats = [
    { label: 'Allowances', count: allowanceRows.length },
    { label: 'Overtime', count: records.filter((record) => /overtime|\bot\b/i.test((record.exceptions || []).join(' '))).length },
    { label: 'Daily Rate', count: dailyRateRows.length },
    { label: 'Bonus', count: records.filter((record) => /bonus|arrears/i.test((record.exceptions || []).join(' '))).length },
  ];
  const categoryMax = Math.max(...categoryStats.map((item) => item.count), 1);
  const categoryColors = ['#2563EB', '#F59E0B', '#8B5CF6', '#10B981'];

  const severityData = [
    { label: 'High', value: earningsIssues.filter((item) => item.severity === 'High').length, color: '#EF4444' },
    { label: 'Medium', value: earningsIssues.filter((item) => item.severity === 'Medium').length, color: '#F59E0B' },
    { label: 'Low', value: earningsIssues.filter((item) => item.severity === 'Low').length, color: '#EAB308' },
  ];
  const severityTotal = Math.max(severityData.reduce((sum, item) => sum + item.value, 0), 1);
  let severityOffset = 0;
  const severityDonut = severityData.map((seg) => {
    const pct = seg.value / severityTotal;
    const slice = { ...seg, pct, offset: severityOffset };
    severityOffset += pct;
    return slice;
  });

  const workflowStatus = payload?.workflow?.currentStatus || payload?.periodRecord?.status || 'Open';
  const workflowOwner = payload?.workflow?.nextOwner || 'Payroll Officer';
  const canViewMoney = payload?.permissions?.canViewMoney !== false;
  const earningsPeriod = viewPeriod || payload?.period || '';

  const quickActions: Array<
    | { label: string; tab: EarningsTabId; icon: ComponentType<{ className?: string }> }
    | { label: string; action: 'export'; icon: ComponentType<{ className?: string }> }
  > = [
    { label: 'Add Allowance', tab: 'allowances', icon: Plus },
    { label: 'Import Earnings', tab: 'allowances', icon: Upload },
    { label: 'Review Overtime', tab: 'overtime-pay', icon: CalendarClock },
    { label: 'Review Daily Rate', tab: 'daily-rate-pay', icon: Users },
    { label: 'Review Bonuses', tab: 'bonus-inputs', icon: Sparkles },
    { label: 'Export Earnings Report', action: 'export', icon: FileSpreadsheet },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div className="border-b border-[#E5E7EB] bg-white px-6 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#2563EB] text-white">
              <TrendingUp className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-4xl font-bold tracking-tight">Earnings Management</h1>
              <p className="mt-1 text-sm text-[#64748B]">
                Manage allowances, bonuses, overtime, daily-rate pay, and payroll earnings from one centralized workspace.
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

      <div className={`${activeTab === 'overview' || activeTab === 'exceptions' || activeTab === 'bonus-inputs' ? 'mx-auto max-w-[1400px]' : ''} space-y-6 px-4 py-6 ${loading ? 'opacity-60' : ''}`}>
        {activeTab === 'overview' ? (
          <>
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                title="Employees"
                value={fmtNum(payload?.summary.totalEmployees || 0)}
                subtitle="Payroll population"
                tone="blue"
                icon={Users}
                actionLabel="View earnings"
                onAction={() => onSelectTab('allowances')}
              />
              <KpiCard
                title="Earnings Coverage"
                value={`${coveragePct}%`}
                subtitle={`${fmtNum(readyCount)} employees earnings-ready`}
                tone="green"
                icon={TrendingUp}
                actionLabel="View coverage"
                onAction={() => onSelectTab('exceptions')}
              />
              <KpiCard
                title="Earnings Exceptions"
                value={fmtNum(earningsIssues.length)}
                subtitle="Issues affecting earnings accuracy"
                tone="danger"
                icon={AlertTriangle}
                actionLabel="Review exceptions"
                onAction={onViewAllExceptions}
              />
              <KpiCard
                title="Pending Review"
                value={fmtNum(pendingReview)}
                subtitle="Employees requiring earnings review"
                tone="purple"
                icon={Clock3}
                actionLabel="Open review queue"
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
                      {earningsIssues.length > 0
                        ? 'Review earnings exceptions before payroll processing'
                        : 'Earnings are ready for payroll processing'}
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
              <h2 className="text-2xl font-semibold">Earnings Workspaces</h2>
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {workspaces.map((item) => (
                  <WorkspaceCard key={item.tab} {...item} onOpen={() => onSelectTab(item.tab)} />
                ))}
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold">Earnings Health</h2>
              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
                <ChartCard title="Earnings Coverage" actionLabel="View details" onAction={() => onSelectTab('exceptions')}>
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

                <ChartCard title="Earnings Categories" actionLabel="View details" onAction={() => onSelectTab('allowances')}>
                  <div className="flex h-36 items-end justify-center gap-3">
                    {categoryStats.map((cat, index) => (
                      <div key={cat.label} className="flex flex-col items-center gap-1">
                        <div className="flex h-28 w-9 items-end rounded-t bg-slate-100">
                          <div
                            className="w-full rounded-t"
                            style={{
                              height: cat.count ? `${Math.max(8, (cat.count / categoryMax) * 100)}%` : '4px',
                              background: categoryColors[index % categoryColors.length],
                              opacity: cat.count ? 1 : 0.35,
                            }}
                          />
                        </div>
                        <span className="max-w-[52px] truncate text-[9px] font-bold text-slate-600">{cat.label}</span>
                      </div>
                    ))}
                  </div>
                </ChartCard>

                <ChartCard title="Earnings Exceptions" actionLabel="View details" onAction={onViewAllExceptions}>
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
                <h2 className="text-2xl font-semibold">Earnings Exceptions</h2>
                <button type="button" onClick={onViewAllExceptions} className="text-sm font-semibold text-[#2563EB] hover:underline">
                  View all exceptions
                  <ChevronRight className="ml-1 inline h-4 w-4" />
                </button>
              </div>
              <div className="mt-4 space-y-3">
                {earningsIssues.slice(0, 5).map((item) => (
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
                {!earningsIssues.length ? (
                  <p className="text-sm font-semibold text-emerald-700">No earnings exceptions found.</p>
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
                      onClick={() => ('action' in item ? onExportExcel() : onSelectTab(item.tab))}
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
          <EarningsExceptionsPanel issues={earningsIssues} onFix={onFixException} />
        ) : activeTab === 'allowances' ? (
          <AllowancesClient embedded initialPeriod={earningsPeriod} />
        ) : activeTab === 'overtime-pay' ? (
          <OvertimePayClient embedded initialPeriod={earningsPeriod} />
        ) : activeTab === 'daily-rate-pay' ? (
          <DailyRatePayClient embedded initialPeriod={earningsPeriod} />
        ) : activeTab === 'bonus-inputs' ? (
          <BonusInputsPanel
            records={records}
            issues={earningsIssues}
            periodLabel={payload?.periodLabel || 'Current period'}
            period={earningsPeriod}
            canViewMoney={canViewMoney}
          />
        ) : null}
      </div>
    </div>
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
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-[#2563EB]">
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
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 py-2.5 text-sm font-bold text-[#2563EB] hover:bg-blue-100"
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
