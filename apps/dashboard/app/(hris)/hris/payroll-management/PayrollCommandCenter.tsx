'use client';

import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Banknote,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  PlayCircle,
  ReceiptText,
  RefreshCcw,
  Send,
  Users,
  WalletCards,
} from 'lucide-react';

type CommandCenterRun = {
  id: string;
  status: string;
  validatedAt?: string | null;
  submittedAt?: string | null;
  approvedAt?: string | null;
  releasedAt?: string | null;
  payslipsGeneratedAt?: string | null;
  createdAt?: string;
};

type CommandCenterPayload = {
  period: string;
  periodLabel: string;
  generatedAt: string;
  dataMode?: 'live' | 'snapshot' | 'run-header' | 'pending';
  payrollComputed?: boolean;
  isViewingActivePeriod?: boolean;
  activePeriod?: string;
  activePeriodLabel?: string;
  periodRecord?: { period: string; periodLabel: string; status: string } | null;
  dataSource?: { source: string; employeeCount: number };
  summary: {
    payrollEligible: number;
    totalEmployees: number;
    readyEmployees: number;
    reviewEmployees: number;
    blockedEmployees: number;
    readinessReadyEmployees?: number;
    readinessAwaitingTimesheetEmployees?: number;
    readinessReviewEmployees?: number;
    readinessBlockedEmployees?: number;
    grossPay: number | null;
    netPay: number | null;
    deductions: number | null;
    exceptionCount: number;
  };
  workflow?: { currentStatus: string; nextOwner: string; approvalStage: string };
  breakdowns: {
    byEmploymentType: { label: string; employees: number }[];
  };
  permissions: { canManageRun: boolean; canApprove: boolean };
  periods?: Array<{ period: string; periodLabel: string; status: string; isActive: boolean; runStatus?: string | null }>;
};

export type CommandCenterNavTab = 'overview' | 'processing' | 'approvals' | 'exceptions' | 'outputs' | 'analytics' | 'reports';

type Props = {
  payload: CommandCenterPayload | null;
  currentRun: CommandCenterRun | null;
  canViewMoney: boolean;
  loading: boolean;
  lastLoaded: string;
  viewPeriod: string | null;
  busyAction: string;
  onRefresh: () => void;
  onSelectPeriod: (period: string) => void;
  onAction: (actionId: string) => void;
  onNavigate: (tab: CommandCenterNavTab) => void;
};

const moneyFmt = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });
const numberFmt = new Intl.NumberFormat('en-GB');
const fmtMoney = (value: number | null | undefined, canView: boolean) => (canView && value != null ? moneyFmt.format(value) : 'Restricted');
const fmtPayrollAmount = (value: number | null | undefined, canView: boolean, payrollComputed: boolean) => {
  if (!payrollComputed) return 'Not computed';
  return fmtMoney(value, canView);
};
const fmtNum = (value: number | null | undefined) => numberFmt.format(Number(value || 0));
const fmtDateTime = (value?: string | null) => (value ? new Date(value).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

const CATEGORY_COLORS = ['#2563EB', '#8B5CF6', '#F59E0B', '#0F172A', '#10B981', '#06B6D4'];

const periodStatusTone = (status: string) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'open' || normalized === 'in progress' || normalized === 'reopened') {
    return { chip: 'bg-emerald-50 text-emerald-700 border border-emerald-200', label: status || 'Open' };
  }
  if (normalized === 'closed') return { chip: 'bg-slate-200 text-slate-700 border border-slate-300', label: 'Closed' };
  if (normalized === 'draft') return { chip: 'bg-amber-50 text-amber-800 border border-amber-200', label: 'Draft' };
  return { chip: 'bg-slate-100 text-slate-700 border border-slate-200', label: status || 'Unknown' };
};

const dataModeLabel = (mode?: string) => {
  if (mode === 'pending') return 'Payroll not run';
  if (mode === 'snapshot') return 'Finalized payroll';
  if (mode === 'run-header') return 'Computed run totals';
  return 'Computed payroll';
};

export default function PayrollCommandCenter({
  payload,
  currentRun,
  canViewMoney,
  loading,
  lastLoaded,
  viewPeriod,
  busyAction,
  onRefresh,
  onSelectPeriod,
  onAction,
  onNavigate,
}: Props) {
  const status = currentRun?.status || payload?.workflow?.currentStatus || 'Draft';
  const exceptions = payload?.summary.exceptionCount || 0;
  const validationBlocked = payload?.summary.blockedEmployees || 0;
  const validationReview = payload?.summary.reviewEmployees || 0;
  const ready = payload?.summary.readinessReadyEmployees ?? payload?.summary.readyEmployees ?? 0;
  const awaitingTimesheet = payload?.summary.readinessAwaitingTimesheetEmployees ?? 0;
  const review = (payload?.summary.readinessReviewEmployees ?? 0) + awaitingTimesheet;
  const blocked = payload?.summary.readinessBlockedEmployees ?? payload?.summary.blockedEmployees ?? 0;
  const eligible = payload?.summary.payrollEligible || 0;
  const workforcePct = eligible ? Math.round((ready / eligible) * 100) : 0;
  const viewingPeriod = payload?.periods?.find((item) => item.period === (viewPeriod || payload?.period)) || null;
  const periodStatus = viewingPeriod?.status || payload?.periodRecord?.status || 'Open';
  const periodTone = periodStatusTone(periodStatus);
  const isActivePeriod = Boolean(payload?.isViewingActivePeriod ?? viewingPeriod?.isActive);
  const payrollComputed = Boolean(payload?.payrollComputed);

  const completedStatuses = ['Computed', 'Ready for Approval', 'Submitted', 'Under Review', 'Approved', 'Released', 'Locked', 'Posted', 'Published', 'Closed'];
  const submittedStatuses = ['Submitted', 'Under Review', 'Approved', 'Released', 'Locked', 'Posted', 'Published', 'Closed'];
  const approvedStatuses = ['Approved', 'Released', 'Locked', 'Posted', 'Published', 'Closed'];

  const workflowStages = [
    {
      label: 'Validate',
      done: Boolean(currentRun?.validatedAt),
      current: !currentRun?.validatedAt,
      date: currentRun?.validatedAt,
      owner: 'Payroll Supervisor',
    },
    {
      label: 'Compute',
      done: completedStatuses.includes(status),
      current: Boolean(currentRun?.validatedAt) && !completedStatuses.includes(status),
      date: completedStatuses.includes(status) ? currentRun?.createdAt : null,
      owner: 'Payroll Officer',
    },
    {
      label: 'Submit',
      done: Boolean(currentRun?.submittedAt) || submittedStatuses.includes(status),
      current: completedStatuses.includes(status) && !currentRun?.submittedAt && !submittedStatuses.includes(status),
      date: currentRun?.submittedAt,
      owner: 'Payroll Officer',
    },
    {
      label: 'HR Review',
      done: ['Under Review', ...approvedStatuses].includes(status),
      current: submittedStatuses.includes(status) && status === 'Submitted',
      date: currentRun?.submittedAt,
      owner: 'HR Manager',
    },
    {
      label: 'Finance Review',
      done: approvedStatuses.includes(status),
      current: status === 'Under Review',
      date: null,
      owner: 'Finance Manager',
    },
    {
      label: 'CFO Approval',
      done: Boolean(currentRun?.approvedAt) || approvedStatuses.includes(status),
      current: status === 'Under Review' && !currentRun?.approvedAt,
      date: currentRun?.approvedAt,
      owner: 'CFO',
    },
    {
      label: 'Released',
      done: Boolean(currentRun?.releasedAt) || ['Released', 'Locked', 'Posted', 'Published', 'Closed'].includes(status),
      current: Boolean(currentRun?.approvedAt) && !currentRun?.releasedAt,
      date: currentRun?.releasedAt,
      owner: 'Payroll / Finance',
    },
  ];

  const currentStage = workflowStages.find((s) => s.current) || workflowStages.find((s) => !s.done) || workflowStages[workflowStages.length - 1];

  const readinessSegments = [
    { label: 'Ready', value: ready, color: '#10B981' },
    { label: awaitingTimesheet > 0 ? 'Awaiting Timesheet' : 'Review', value: review, color: '#F59E0B' },
    { label: 'Blocked', value: blocked, color: '#EF4444' },
  ];
  const readinessTotal = Math.max(ready + review + blocked, 1);
  let donutOffset = 0;
  const donutSlices = readinessSegments.map((seg) => {
    const pct = seg.value / readinessTotal;
    const slice = { ...seg, pct, offset: donutOffset };
    donutOffset += pct;
    return slice;
  });

  const gross = payrollComputed ? payload?.summary.grossPay || 0 : 0;
  const deductions = payrollComputed ? payload?.summary.deductions || 0 : 0;
  const net = payrollComputed ? payload?.summary.netPay || 0 : 0;
  const valueMax = payrollComputed ? Math.max(gross, deductions, net, 1) : 1;

  const categories = (payload?.breakdowns.byEmploymentType || [])
    .slice()
    .sort((a, b) => b.employees - a.employees)
    .slice(0, 5);
  const categoryMax = Math.max(...categories.map((c) => c.employees), 1);

  const payrollHasRun = ['Computed', 'Calculated', 'Ready for Approval', 'Validated', 'Submitted', 'Under Review', 'HR Approved', 'Finance Approved', 'CFO Approved', 'Approved', 'Released', 'Locked', 'Posted', 'Published', 'Closed'].includes(status);

  const quickActions = [
    { id: 'validate-payroll', label: 'Run Payroll Validation', icon: ClipboardCheck, enabled: payload?.permissions.canManageRun },
    { id: 'create-run', label: payrollHasRun ? 'Re-run Payroll' : 'Run Payroll', icon: PlayCircle, enabled: payload?.permissions.canManageRun && status !== 'Closed' },
    { id: 'submit-run', label: 'Submit for Approval', icon: Send, enabled: payload?.permissions.canManageRun },
    { id: 'approve-run', label: 'Approve Payroll', icon: BadgeCheck, enabled: payload?.permissions.canApprove },
    { id: 'release-run', label: 'Release Payroll', icon: CheckCircle2, enabled: payload?.permissions.canManageRun },
    { id: 'generate-payslips', label: 'Publish Payslips', icon: ReceiptText, enabled: payload?.permissions.canManageRun },
  ];

  const nextTitle = exceptions > 0 ? 'Fix payroll issues before approval' : `Continue: ${currentStage?.label || 'Validate'}`;

  const navTabs: { id: CommandCenterNavTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'processing', label: 'Processing' },
    { id: 'approvals', label: 'Approvals' },
    { id: 'exceptions', label: 'Exceptions' },
    { id: 'outputs', label: 'Outputs' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'reports', label: 'Reports' },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div className="border-b border-[#E5E7EB] bg-white px-6 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#0F172A] text-white">
              <WalletCards className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-[28px] font-bold leading-tight tracking-tight sm:text-4xl">Payroll Dashboard</h1>
              <p className="mt-1 text-sm text-slate-600">Overview of payroll status, next actions and key insights.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-2 self-start rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-[#2563EB]">
            Period: {payload?.periodLabel || 'Loading'}
          </span>
          <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${periodTone.chip}`}>{periodTone.label}</span>
          {isActivePeriod ? (
            <span className="rounded-full border border-[#2563EB] bg-blue-50 px-3 py-1.5 text-xs font-bold text-[#2563EB]">Active Payroll Period</span>
          ) : payload?.activePeriodLabel ? (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">
              Active: {payload.activePeriodLabel}
            </span>
          ) : null}
          <span className="rounded-full border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
            {dataModeLabel(payload?.dataMode)}
          </span>
          {(payload?.periods?.length || 0) > 0 ? (
            <label className="inline-flex items-center gap-2 rounded-full border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
              <span>View</span>
              <select
                value={viewPeriod || payload?.period || ''}
                onChange={(e) => onSelectPeriod(e.target.value)}
                disabled={loading}
                className="max-w-[220px] bg-transparent font-semibold text-slate-900 focus:outline-none disabled:opacity-60"
              >
                {(payload?.periods || []).map((item) => (
                  <option key={item.period} value={item.period}>
                    {item.periodLabel} — {item.status}
                    {item.isActive ? ' · Active' : ''}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-[#10B981]">Source: {payload?.dataSource?.source || 'DLE Enterprise HRIS'}</span>
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">Employees: {fmtNum(payload?.summary.totalEmployees)}</span>
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">Loaded: {new Date(lastLoaded).toLocaleString('en-GB')}</span>
        </div>

        {(payload?.periods?.length || 0) > 1 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Payroll periods</span>
            {(payload?.periods || []).map((item) => {
              const tone = periodStatusTone(item.status);
              const selected = (viewPeriod || payload?.period) === item.period;
              return (
                <button
                  key={item.period}
                  type="button"
                  disabled={loading}
                  onClick={() => onSelectPeriod(item.period)}
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-60 ${
                    selected ? 'bg-[#2563EB] text-white shadow-sm' : `${tone.chip} hover:brightness-95`
                  }`}
                >
                  <span>{item.periodLabel}</span>
                  {!selected ? <span className="opacity-80">{item.status}</span> : null}
                  {item.isActive ? <span className={selected ? 'text-blue-100' : 'font-bold text-[#2563EB]'}>Active</span> : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className={`mx-auto grid max-w-[1600px] grid-cols-1 gap-6 px-4 py-6 xl:grid-cols-[1fr_320px] ${loading ? 'opacity-60' : ''}`}>
        {!payrollComputed ? (
          <div className="xl:col-span-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p className="font-bold">Payroll has not been run for {payload?.periodLabel || 'this period'}.</p>
            <p className="mt-1 text-amber-900">Gross pay, net pay, and deductions appear only after you validate and run payroll. Readiness and issues below reflect pre-run validation.</p>
          </div>
        ) : null}
        <div className="min-w-0 space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              title="Ready Employees"
              value={fmtNum(ready)}
              subtitle={
                awaitingTimesheet > 0
                  ? `${workforcePct}% ready · ${fmtNum(awaitingTimesheet)} C-code awaiting timesheet`
                  : `${workforcePct}% ready (${fmtNum(eligible)} eligible)`
              }
              actionLabel="View employees"
              href="/hris/employees/employee-directory"
              icon={Users}
              tone="blue"
            />
            <KpiCard
              title="Gross Pay"
              value={fmtPayrollAmount(payload?.summary.grossPay, canViewMoney, payrollComputed)}
              subtitle={payrollComputed ? `Net: ${fmtPayrollAmount(payload?.summary.netPay, canViewMoney, payrollComputed)}` : 'Run payroll to compute totals'}
              actionLabel="View summary"
              onAction={() => onNavigate(payrollComputed ? 'analytics' : 'processing')}
              icon={Banknote}
              tone="green"
              muted={!payrollComputed}
            />
            <KpiCard
              title="Deductions"
              value={fmtPayrollAmount(payload?.summary.deductions, canViewMoney, payrollComputed)}
              subtitle={payrollComputed ? 'PAYE, pension & statutory' : 'Available after payroll run'}
              actionLabel="View details"
              onAction={() => onNavigate(payrollComputed ? 'analytics' : 'processing')}
              icon={ReceiptText}
              tone="purple"
              muted={!payrollComputed}
            />
            <KpiCard
              title="Issues"
              value={fmtNum(exceptions)}
              subtitle={`${fmtNum(validationBlocked)} blocked, ${fmtNum(validationReview)} to review`}
              actionLabel="Review issues"
              onAction={() => onNavigate('exceptions')}
              icon={AlertTriangle}
              tone="danger"
            />
          </div>

          <section className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-semibold text-[#0F172A]">Payroll Status</h2>
              <span className="w-fit rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-[#2563EB]">Current Stage: {currentStage?.label || 'Validate'}</span>
            </div>
            <div className="mt-6 overflow-x-auto pb-2">
              <div className="flex min-w-[760px] items-start justify-between gap-2">
                {workflowStages.map((stage, index) => {
                  const isDone = stage.done;
                  const isCurrent = stage.current && !isDone;
                  return (
                    <div key={stage.label} className="flex flex-1 flex-col items-center text-center">
                      <div className="flex w-full items-center">
                        {index > 0 ? <div className={`h-0.5 flex-1 ${workflowStages[index - 1].done ? 'bg-[#10B981]' : 'bg-[#E5E7EB]'}`} /> : <div className="flex-1" />}
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                            isDone ? 'bg-[#10B981] text-white' : isCurrent ? 'bg-[#2563EB] text-white ring-4 ring-blue-100' : 'bg-white text-slate-400 ring-2 ring-[#E5E7EB]'
                          }`}
                        >
                          {isDone ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                        </div>
                        {index < workflowStages.length - 1 ? <div className={`h-0.5 flex-1 ${isDone ? 'bg-[#10B981]' : 'bg-[#E5E7EB]'}`} /> : <div className="flex-1" />}
                      </div>
                      <p className="mt-2 text-xs font-bold text-slate-900">{stage.label}</p>
                      <p className={`mt-0.5 text-[10px] font-semibold ${isDone ? 'text-[#10B981]' : isCurrent ? 'text-[#2563EB]' : 'text-slate-400'}`}>
                        {isDone ? 'Completed' : isCurrent ? 'In Progress' : 'Pending'}
                      </p>
                      {stage.date ? <p className="mt-1 text-[10px] text-slate-500">{fmtDateTime(stage.date)}</p> : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50 to-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-bold text-[#0F172A]">{nextTitle}</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Current status is <span className="font-bold text-slate-900">{status}</span>. Next owner:{' '}
                  <span className="font-bold text-slate-900">{payload?.workflow?.nextOwner || 'Payroll Officer'}</span>.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate(exceptions > 0 ? 'exceptions' : 'processing')}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#2563EB] px-5 text-sm font-bold text-white hover:bg-blue-700"
              >
                {exceptions > 0 ? 'Go to Issues' : 'Continue Processing'}
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <ChartCard title="Payroll Readiness" actionLabel="View readiness details" onAction={() => onNavigate('exceptions')}>
              <div className="flex items-center gap-4">
                <svg viewBox="0 0 42 42" className="h-28 w-28 shrink-0 -rotate-90">
                  <circle cx="21" cy="21" r="15.9" fill="transparent" stroke="#E5E7EB" strokeWidth="4" />
                  {donutSlices.map((slice) => (
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
                  {readinessSegments.map((seg) => (
                    <div key={seg.label} className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: seg.color }} />
                      <span className="font-semibold text-slate-700">
                        {seg.label}: {fmtNum(seg.value)} / {readinessTotal ? Math.round((seg.value / readinessTotal) * 100) : 0}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </ChartCard>

            <ChartCard title="Payroll Value" actionLabel="View breakdown" onAction={() => onNavigate(payrollComputed ? 'analytics' : 'processing')}>
              {payrollComputed ? (
              <div className="flex h-36 items-end justify-center gap-6">
                {[
                  { label: 'Gross Pay', value: gross, color: '#2563EB' },
                  { label: 'Deductions', value: deductions, color: '#8B5CF6' },
                  { label: 'Net Pay', value: net, color: '#10B981' },
                ].map((bar) => (
                  <div key={bar.label} className="flex flex-col items-center gap-2">
                    <div className="flex h-28 w-12 items-end rounded-t-md bg-slate-100">
                      <div className="w-full rounded-t-md" style={{ height: `${Math.max(8, (bar.value / valueMax) * 100)}%`, background: bar.color }} />
                    </div>
                    <span className="text-[10px] font-bold text-slate-600">{bar.label}</span>
                  </div>
                ))}
              </div>
              ) : (
                <div className="flex h-36 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 text-center text-sm font-semibold text-slate-500">
                  Payroll value chart appears after you run payroll for this period.
                </div>
              )}
            </ChartCard>

            <ChartCard title="Category Processing" actionLabel="View all categories" onAction={() => onNavigate('analytics')}>
              <div className="space-y-3">
                {categories.map((cat, i) => (
                  <div key={cat.label}>
                    <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-700">
                      <span>{cat.label}</span>
                      <span>{fmtNum(cat.employees)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100">
                      <div
                        className="h-2 rounded-full"
                        style={{ width: `${Math.max(4, (cat.employees / categoryMax) * 100)}%`, background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </ChartCard>
          </div>

          <nav className="overflow-x-auto rounded-xl border border-[#E5E7EB] bg-white p-2 shadow-sm">
            <div className="flex min-w-max gap-1">
              {navTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onNavigate(tab.id)}
                  className={`min-h-10 rounded-lg px-4 text-sm font-semibold transition-colors ${
                    tab.id === 'overview' ? 'bg-[#2563EB] text-white' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </nav>
        </div>

        <aside className="space-y-4">
          <section className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900">Payroll Summary</h3>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <SummaryTile label="Employees" value={fmtNum(eligible)} detail={`${fmtNum(eligible)} eligible`} color="#2563EB" />
              <SummaryTile
                label="Gross Payroll"
                value={fmtPayrollAmount(gross, canViewMoney, payrollComputed)}
                detail={payrollComputed ? 'Before deductions' : 'Not computed yet'}
                color="#2563EB"
              />
              <SummaryTile
                label="Net Pay"
                value={fmtPayrollAmount(net, canViewMoney, payrollComputed)}
                detail={payrollComputed ? 'After deductions' : 'Not computed yet'}
                color="#10B981"
              />
              <SummaryTile
                label="Approvals"
                value={['Submitted', 'Under Review'].includes(status) ? 'Pending' : approvedStatuses.includes(status) ? 'Approved' : 'Not due'}
                detail={payload?.workflow?.nextOwner || 'Payroll Officer'}
                color="#8B5CF6"
              />
              <SummaryTile label="Exceptions" value={fmtNum(exceptions)} detail={exceptions ? 'Needs attention' : 'Clear'} color="#EF4444" className="col-span-2" />
            </div>
          </section>

          <section className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900">Quick Actions</h3>
            <div className="mt-3 space-y-2">
              {quickActions.map((item) => {
                const Icon = item.icon;
                const disabled = !item.enabled || busyAction === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => onAction(item.id)}
                    className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-colors ${
                      disabled ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400' : 'border-[#E5E7EB] bg-white text-slate-800 hover:border-blue-200 hover:bg-blue-50'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <Icon className="h-4 w-4 text-[#2563EB]" />
                      {busyAction === item.id ? 'Working…' : item.label}
                    </span>
                    <ArrowRight className="h-4 w-4 text-slate-400" />
                  </button>
                );
              })}
            </div>
            <Link href="/hris/payroll-management/payroll-processing" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#2563EB] hover:underline">
              View all actions
              <ChevronRight className="h-4 w-4" />
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}

function KpiCard({
  title,
  value,
  subtitle,
  actionLabel,
  onAction,
  href,
  icon: Icon,
  tone,
  muted = false,
}: {
  title: string;
  value: string;
  subtitle: string;
  actionLabel: string;
  onAction?: () => void;
  href?: string;
  icon: ComponentType<{ className?: string }>;
  tone: 'blue' | 'green' | 'purple' | 'danger';
  muted?: boolean;
}) {
  const tones = {
    blue: 'border-blue-300 bg-blue-100',
    green: 'border-emerald-300 bg-emerald-100',
    purple: 'border-violet-300 bg-violet-100',
    danger: 'border-red-300 bg-red-100',
  };
  const iconWrap = {
    blue: 'bg-blue-200 text-blue-800',
    green: 'bg-emerald-200 text-emerald-800',
    purple: 'bg-violet-200 text-violet-800',
    danger: 'bg-red-200 text-red-800',
  };
  return (
    <article className={`rounded-xl border p-4 shadow-sm ${tones[tone]} ${muted ? 'opacity-90' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-700">{title}</p>
          <p className={`mt-2 text-2xl font-bold tracking-tight ${muted ? 'text-slate-600' : 'text-[#0F172A]'}`}>{value}</p>
          <p className="mt-1 text-xs text-slate-600">{subtitle}</p>
        </div>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconWrap[tone]}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      {href ? (
        <Link href={href} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#2563EB] hover:underline">
          {actionLabel}
          <ChevronRight className="h-4 w-4" />
        </Link>
      ) : (
        <button type="button" onClick={onAction} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#2563EB] hover:underline">
          {actionLabel}
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </article>
  );
}

function ChartCard({ title, actionLabel, onAction, children }: { title: string; actionLabel: string; onAction: () => void; children: ReactNode }) {
  return (
    <article className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
      <h3 className="text-base font-semibold text-[#0F172A]">{title}</h3>
      <div className="mt-4">{children}</div>
      <button type="button" onClick={onAction} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#2563EB] hover:underline">
        {actionLabel}
        <ChevronRight className="h-4 w-4" />
      </button>
    </article>
  );
}

function SummaryTile({ label, value, detail, color, className = '' }: { label: string; value: string; detail: string; color: string; className?: string }) {
  return (
    <div className={`rounded-lg border border-[#E5E7EB] bg-slate-50 p-3 ${className}`}>
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold" style={{ color }}>{value}</p>
      <p className="mt-0.5 text-[11px] font-medium text-slate-500">{detail}</p>
    </div>
  );
}
