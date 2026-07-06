'use client';

import { useMemo, useState } from 'react';
import {
  AlertCircle,
  Banknote,
  Bell,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  Fingerprint,
  ListChecks,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { WorkflowIntelligence } from '@/lib/ess-workflow-intelligence';
import {
  EssCard,
  EssDonutChart,
  EssEventItem,
  EssHeroIllustration,
  EssKpiCard,
  EssMiniCalendar,
  EssNotificationItem,
  EssProgressBar,
  EssSectionHeader,
  EssSparkline,
  EssWorkflowStepper,
} from './ess-portal-ui';
import type { EssTab } from './ess-portal-shell';

export type EssDashboardPayload = {
  generatedAt?: string;
  employee?: {
    fullName?: string;
    jobTitle?: string;
    department?: string;
    salaryGrade?: string;
    location?: string;
    payrollGroup?: string;
    yearsOfService?: number;
    photoUrl?: string;
    hasPhoto?: boolean;
    employeeCode?: string;
    employeeId?: string;
    manager?: string;
    dateJoined?: string;
  };
  widgets?: {
    leave: { entitlement: number; used: number; balance: number; carryForward?: number; pending: number };
    attendance: { monthRate: number; lateArrivals: number; overtimeHours: number; remoteDays: number };
    payroll: { monthlyPay: number; currency: string; payslips: number; periodLabel?: string; released?: boolean; deductions: number; pension: number; allowances: number };
    requests: { pending: number; approved: number; total: number };
    loans: { applications: number; outstanding: number };
  };
  dashboardAnalytics?: {
    activityByCategory: Array<{ label: string; value: number; color: string }>;
    totalActivities: number;
    hrInsights: {
      attendanceTrend: { trend: number; series: number[] };
      leaveUtilization: { trend: number; series: number[] };
      payrollSummary: { netPay: number; label: string };
      requestsCompleted: { count: number; trend: number };
      trainingProgress: { percent: number };
    };
  };
  notifications?: Array<{ id: string; title: string; type: string; status: string; createdAt: string; href?: string }>;
  approvalQueue?: Array<{
    id: string;
    employee: string;
    type: string;
    days: number;
    startDate: string;
    endDate: string;
    stage: string;
  }>;
  birthdays?: Array<{ id: string; fullName: string; department: string; date: string }>;
  anniversaries?: Array<{ id: string; fullName: string; years: number; date: string }>;
  events?: Array<{ id: string; label: string; date: string; type: string }>;
  announcements?: Array<{ id: string; title: string; channel: string; publishedAt: string; priority: string }>;
  requests?: Array<{ id: string; title: string; category: string; status: string; submittedAt: string; approvers?: string[] }>;
  attendance?: { records: Array<{ date?: string; clockIn?: string; clockOut?: string; source?: string }> };
  performance?: {
    goals?: Array<{ title?: string; progress?: number }>;
    reviews?: Array<{ id?: string; cycle?: string; status?: string; score?: number | null }>;
    kpis?: Array<{ label?: string; value?: number; target?: number }>;
  };
  learning?: {
    courses?: Array<{ title?: string; progress?: number; status?: string }>;
    certifications?: Array<{ id?: string; title?: string; status?: string }>;
  };
  workflowIntelligence?: WorkflowIntelligence;
  managerMetrics?: {
    teamSize: number;
    pendingApprovals: number;
    onLeave: number;
    missingTimesheets: number;
    teamAttendancePct: number;
    trainingToday: number;
  };
};

const dateText = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

const statusBadge = (status: string) => {
  const value = status.toLowerCase();
  if (value.includes('approv') || value.includes('complete')) return 'bg-[#ECFDF5] text-[#16A34A]';
  if (value.includes('reject') || value.includes('overdue')) return 'bg-[#FEF2F2] text-[#DC2626]';
  if (value.includes('review') || value.includes('pending') || value.includes('progress')) return 'bg-[#FFF7ED] text-[#D97706]';
  return 'bg-[#DBEAFE] text-[#2563EB]';
};

type ApprovalRow = {
  id: string;
  employee: string;
  type: string;
  days: number;
  startDate: string;
  endDate: string;
  stage: string;
};

const buildApprovalRows = (payload: EssDashboardPayload | null): ApprovalRow[] => {
  if (payload?.approvalQueue?.length) return payload.approvalQueue;
  const register = payload?.workflowIntelligence?.register || [];
  return register
    .filter((row) => /pending|review|progress|overdue/i.test(row.status) || /pending|review/i.test(row.slaStatus))
    .slice(0, 6)
    .map((row) => ({
      id: row.id,
      employee: row.employee,
      type: row.requestType || row.request,
      days: 0,
      startDate: row.submittedAt?.slice(0, 10) || '',
      endDate: '',
      stage: row.currentStage || row.status,
    }));
};

const minutesFromClock = (value?: string): number | null => {
  if (!value) return null;
  const match = value.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3]?.toLowerCase();
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  return hour * 60 + minute;
};

const workedDuration = (clockIn?: string, clockOut?: string): string => {
  const start = minutesFromClock(clockIn);
  const end = minutesFromClock(clockOut);
  if (start === null || end === null || end <= start) return '—';
  const total = end - start;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}h ${String(total % 60).padStart(2, '0')}m`;
};

type EssDashboardViewProps = {
  payload: EssDashboardPayload | null;
  initialNow: string;
  onNavigate: (tab: EssTab, options?: { leaveSection?: string }) => void;
};

export function EssDashboardView({ payload, onNavigate }: EssDashboardViewProps) {
  const [requestTab, setRequestTab] = useState('All');
  const employee = payload?.employee;
  const widgets = payload?.widgets;
  const workflow = payload?.workflowIntelligence;
  const approvalRows = buildApprovalRows(payload);
  const approvalCount = payload?.approvalQueue?.length || workflow?.kpis.awaitingMyAction || approvalRows.length;
  const overdueCount = workflow?.slaMonitor.overdueCount || workflow?.register.filter((row) => row.slaStatus === 'Overdue').length || 0;
  const pendingTasksList = workflow?.pendingActions || [];
  const pendingTasks = pendingTasksList.length || widgets?.requests.pending || 0;
  const highPriorityTasks = pendingTasksList.filter((task) => task.severity === 'high').length;
  const firstName = employee?.fullName?.split(' ').find((part) => part.length > 2 && !/^(mr|mrs|ms|dr)\.?$/i.test(part)) || 'there';
  const activeWorkflow = workflow?.register.find((row) => !/approved|rejected|closed|terminated|complete/i.test(row.status))
    || workflow?.selectedRequest
    || null;
  const latestClock = payload?.attendance?.records?.[0];
  const insights = payload?.dashboardAnalytics?.hrInsights;
  const trainingPct = insights?.trainingProgress.percent || 0;
  const certifications = payload?.learning?.certifications || [];
  const certRenewalDue = certifications.filter((cert) => /due|renew|expir/i.test(cert.status || '')).length;
  const reviewScores = (payload?.performance?.reviews || [])
    .map((review) => (typeof review.score === 'number' ? review.score : null))
    .filter((score): score is number => score !== null);
  const attendanceKpi = payload?.performance?.kpis?.find((item) => /attendance/i.test(item.label || ''));
  const performanceRating = reviewScores.length ? reviewScores[0] : null;
  const performanceHeadline = performanceRating !== null
    ? performanceRating.toFixed(1)
    : attendanceKpi?.value !== undefined
      ? `${attendanceKpi.value}%`
      : '—';
  const performanceSubtitle = performanceRating !== null
    ? 'Latest review score'
    : attendanceKpi
      ? attendanceKpi.label || 'Attendance reliability'
      : 'No performance data yet';
  const performanceGoals = payload?.performance?.goals || [];
  const goalsCompleted = performanceGoals.filter((goal) => Number(goal.progress || 0) >= 100).length;
  const goalsTotal = performanceGoals.length;
  const requestRows = useMemo(() => {
    const live = (payload?.requests?.length ? payload.requests : workflow?.register || []).map((row) => ({
      id: row.id,
      title: 'title' in row ? row.title : row.request,
      category: 'category' in row ? row.category : row.requestType,
      status: row.status,
      submittedAt: row.submittedAt,
      currentStage: 'currentStage' in row ? row.currentStage : row.approvers?.[0],
    }));
    if (requestTab === 'All') return live.slice(0, 8);
    return live.filter((row) => row.category?.toLowerCase().includes(requestTab.toLowerCase())).slice(0, 8);
  }, [payload?.requests, workflow?.register, requestTab]);
  const activityRows = workflow?.auditTimeline || [];

  return (
    <div className="space-y-2">
      {/* Hero */}
      <div className="overflow-hidden rounded-[16px] shadow-[0_14px_36px_rgba(15,23,42,0.08)]" style={{ background: 'linear-gradient(135deg, #0F2C8C 0%, #1E40AF 45%, #2563EB 100%)' }}>
        <div className="grid min-h-[176px] grid-cols-1 lg:grid-cols-[1fr_260px]">
          <div className="p-4 sm:p-5">
            <p className="text-[12px] font-medium text-white/70">Here&apos;s what&apos;s happening today and what needs your attention.</p>
            <h2 className="mt-1 text-[28px] font-bold leading-tight text-white sm:text-[32px]">{greeting()}, {firstName}! <span aria-hidden>👋</span></h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {(
                [
                  { label: 'New Request', onClick: () => onNavigate('services'), primary: true },
                  { label: 'My Requests', onClick: () => onNavigate('services'), primary: false },
                  { label: 'My Approvals', onClick: () => onNavigate('leave', { leaveSection: 'Approvals' }), primary: false },
                ] as const
              ).map(({ label, onClick, primary }) => (
                <button
                  key={label}
                  type="button"
                  onClick={onClick}
                  className={`inline-flex h-9 items-center rounded-[10px] px-3.5 text-[12px] font-semibold transition ${
                    primary ? 'bg-white text-[#2563EB] shadow-[0_8px_24px_rgba(37,99,235,0.18)]' : 'border border-white/30 bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="relative hidden p-3 lg:block"><EssHeroIllustration /></div>
        </div>
      </div>

      {/* KPI row — 6 compact cards */}
      {widgets ? (
        <section className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
          <button type="button" onClick={() => onNavigate('leave', { leaveSection: 'Approvals' })} className="text-left">
            <EssKpiCard label="My Approvals" value={String(approvalCount)} subtitle={`${approvalCount} Pending`} detail={overdueCount ? `${overdueCount} Overdue` : 'On track'} icon={ListChecks} accent="#8B5CF6" iconBg="#F5F3FF" />
          </button>
          <EssKpiCard label="My Tasks" value={String(pendingTasks)} subtitle={`${pendingTasks} Due`} detail={highPriorityTasks ? `${highPriorityTasks} High Priority` : 'No urgent items'} icon={CheckCircle2} accent="#22C55E" iconBg="#ECFDF5" />
          <EssKpiCard label="My Requests" value={String(widgets.requests.pending)} subtitle={`${widgets.requests.pending} In Progress`} detail={`${widgets.requests.approved} Approved`} icon={FileText} accent="#F59E0B" iconBg="#FFF7ED" />
          <EssKpiCard label="Attendance Today" value={latestClock?.clockIn || 'Not clocked in'} subtitle={latestClock?.clockIn ? 'Clocked In' : 'Awaiting clock-in'} detail={latestClock?.source ? `Source: ${latestClock.source}` : `Attendance ${widgets.attendance.monthRate}%`} icon={Fingerprint} accent="#06B6D4" iconBg="#ECFEFF" sparkline={insights?.attendanceTrend.series} trend={insights?.attendanceTrend.trend} />
          <EssKpiCard label="Leave Balance" value={`${widgets.leave.balance}`} subtitle="Days Available" detail={`${widgets.leave.pending} Booked`} icon={CalendarCheck} accent="#2563EB" iconBg="#DBEAFE" />
        </section>
      ) : null}

      {/* Approvals + Workflow side by side */}
      <section className="grid grid-cols-1 gap-2 xl:grid-cols-12">
        <EssCard className="p-3 xl:col-span-7">
          <EssSectionHeader title="My Approvals" action={<button type="button" onClick={() => onNavigate('leave', { leaveSection: 'Approvals' })} className="text-[12px] font-semibold text-[#2563EB] hover:underline">View all</button>} />
          {approvalRows.length ? (
            <div className="grid grid-cols-1 gap-1.5 xl:grid-cols-1">
              {approvalRows.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate('leave', { leaveSection: 'Approvals' })}
                  className="flex w-full items-center gap-2.5 rounded-[12px] border border-[#E2E8F0] bg-[#FBFCFE] px-3 py-2 text-left transition hover:border-[#93C5FD]"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#DBEAFE] text-[11px] font-bold text-[#2563EB]">{item.employee.split(' ').map((p) => p[0]).join('').slice(0, 2)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-bold text-[#0F172A]">{item.employee}</span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${statusBadge(item.stage)}`}>{item.stage}</span>
                    </span>
                    <span className="block truncate text-[11px] text-[#64748B]">{item.type}{item.days ? ` · ${item.days} day(s)` : ''}{item.startDate ? ` · ${item.startDate}` : ''}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[#94A3B8]" />
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-1 rounded-[12px] border border-dashed border-[#E2E8F0] bg-[#F8FAFC] px-4 py-8 text-center">
              <CheckCircle2 className="h-6 w-6 text-[#22C55E]" />
              <p className="text-[13px] font-bold text-[#0F172A]">No approvals awaiting you</p>
              <p className="text-[11px] text-[#64748B]">Requests routed to you for approval will appear here.</p>
            </div>
          )}
        </EssCard>

        <EssCard className="p-3 xl:col-span-5">
          <EssSectionHeader title="Workflow Progress" action={<button type="button" onClick={() => onNavigate('workflow')} className="text-[12px] font-semibold text-[#2563EB] hover:underline">Open</button>} />
          {activeWorkflow ? (
            <>
              <p className="mb-2 truncate text-[13px] font-bold text-[#0F172A]">{activeWorkflow.request}</p>
              <EssWorkflowStepper stages={activeWorkflow.stages} />
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {[
                  ['Current Approver', activeWorkflow.approver],
                  ['SLA', activeWorkflow.slaStatus],
                  ['Priority', activeWorkflow.priority],
                  ['Status', activeWorkflow.status],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-[10px] border border-[#E2E8F0] bg-[#F8FAFC] px-2 py-1.5">
                    <p className="text-[10px] font-semibold uppercase text-[#94A3B8]">{label}</p>
                    <p className="truncate text-[12px] font-bold text-[#0F172A]">{value}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center gap-1 rounded-[12px] border border-dashed border-[#E2E8F0] bg-[#F8FAFC] px-4 py-10 text-center">
              <FileText className="h-6 w-6 text-[#94A3B8]" />
              <p className="text-[13px] font-bold text-[#0F172A]">No active workflow</p>
              <p className="text-[11px] text-[#64748B]">Submit a request to track its live approval progress here.</p>
            </div>
          )}
        </EssCard>
      </section>

      {/* Tasks + Attendance */}
      <section className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        <EssCard className="p-3">
          <EssSectionHeader title="My Tasks" action={<button type="button" onClick={() => onNavigate('services')} className="text-[12px] font-semibold text-[#2563EB] hover:underline">View all</button>} />
          {pendingTasksList.length ? (
            <div className="space-y-1">
              {pendingTasksList.slice(0, 5).map((task) => (
                <label key={task.id} className="flex items-center gap-2 rounded-[10px] border border-[#E2E8F0] px-2.5 py-1.5">
                  <input type="checkbox" className="h-3.5 w-3.5 rounded border-[#CBD5E1]" readOnly />
                  <span className="min-w-0 flex-1 text-[12px] font-semibold text-[#0F172A]">{task.title}</span>
                  {task.dueLabel ? <span className="shrink-0 text-[10px] text-[#94A3B8]">{task.dueLabel}</span> : null}
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${task.severity === 'high' ? 'bg-[#FEF2F2] text-[#DC2626]' : task.severity === 'medium' ? 'bg-[#FFF7ED] text-[#D97706]' : 'bg-[#F8FAFC] text-[#64748B]'}`}>{task.severity}</span>
                </label>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-1 rounded-[10px] border border-dashed border-[#E2E8F0] bg-[#F8FAFC] px-4 py-8 text-center">
              <CheckCircle2 className="h-6 w-6 text-[#22C55E]" />
              <p className="text-[12px] font-bold text-[#0F172A]">You&apos;re all caught up</p>
              <p className="text-[11px] text-[#64748B]">No pending workflow actions assigned to you.</p>
            </div>
          )}
        </EssCard>
        <EssCard className="p-3">
          <EssSectionHeader title="Attendance" action={<button type="button" onClick={() => onNavigate('time')} className="text-[12px] font-semibold text-[#2563EB] hover:underline">Details</button>} />
          <div className="grid grid-cols-4 gap-1.5">
            {[
              ['In', latestClock?.clockIn || '—'],
              ['Out', latestClock?.clockOut || '—'],
              ['Worked', workedDuration(latestClock?.clockIn, latestClock?.clockOut)],
              ['OT', `${widgets?.attendance.overtimeHours || 0}h`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-[10px] border border-[#E2E8F0] bg-[#FBFCFE] p-2 text-center">
                <p className="text-[10px] font-semibold uppercase text-[#94A3B8]">{label}</p>
                <p className="mt-0.5 text-[13px] font-bold text-[#0F172A]">{value}</p>
              </div>
            ))}
          </div>
          {insights ? <div className="mt-1.5"><EssSparkline data={insights.attendanceTrend.series} color="#22C55E" /></div> : null}
        </EssCard>
      </section>

      {/* Summary row */}
      <section className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <EssCard className="p-3">
          <EssSectionHeader title="Leave Summary" />
          <EssDonutChart rows={[{ label: 'Available', value: widgets?.leave.balance || 0, color: '#2563EB' }, { label: 'Used', value: widgets?.leave.used || 0, color: '#94A3B8' }, { label: 'Booked', value: widgets?.leave.pending || 0, color: '#F59E0B' }, ...(widgets?.leave.carryForward ? [{ label: 'Carry Fwd', value: widgets.leave.carryForward, color: '#8B5CF6' }] : [])]} centerLabel="Days" centerValue={String(widgets?.leave.balance || 0)} />
        </EssCard>
        <EssCard className="p-3">
          <EssSectionHeader title="Performance" />
          <div className="flex items-center gap-2">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border-[6px] border-[#2563EB] text-[16px] font-bold text-[#2563EB]">{performanceHeadline}</div>
            <div>
              <p className="text-[12px] font-semibold text-[#0F172A]">{performanceSubtitle}</p>
              <p className="text-[11px] text-[#64748B]">{goalsTotal ? `${goalsCompleted}/${goalsTotal} goals completed` : 'No goals on file'}</p>
            </div>
          </div>
        </EssCard>
        <EssCard className="p-3">
          <EssSectionHeader title="Training" />
          <p className="text-[22px] font-bold text-[#0F172A]">{trainingPct}%</p>
          <EssProgressBar value={trainingPct} />
          <p className="mt-1 text-[11px] text-[#64748B]">{certifications.length} certification{certifications.length === 1 ? '' : 's'}{certRenewalDue ? ` · ${certRenewalDue} due soon` : ''}</p>
        </EssCard>
      </section>

      {/* Requests table */}
      <EssCard className="overflow-hidden">
        <div className="border-b border-[#E2E8F0] px-3 py-2.5">
          <EssSectionHeader title="My Requests Overview" action={<button type="button" onClick={() => onNavigate('workflow')} className="text-[12px] font-semibold text-[#2563EB] hover:underline">Workflow</button>} />
          <div className="flex flex-wrap gap-1">
            {['All', 'Leave', 'Claims', 'Services', 'Learning', 'Loans'].map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setRequestTab(tab)}
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                  requestTab === tab ? 'bg-[#2563EB] text-white' : 'bg-[#F8FAFC] text-[#64748B] hover:bg-[#EFF6FF]'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-[12px]">
            <thead className="bg-[#F8FAFC] text-[10px] font-bold uppercase tracking-wide text-[#64748B]">
              <tr>
                <th className="px-3 py-2">Request</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Submitted</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Stage</th>
              </tr>
            </thead>
            <tbody>
              {requestRows.map((row) => (
                <tr key={row.id} className="border-t border-[#E2E8F0] hover:bg-[#F8FAFC]">
                  <td className="px-3 py-2 font-semibold text-[#0F172A]">{row.title}</td>
                  <td className="px-3 py-2 text-[#64748B]">{row.category}</td>
                  <td className="px-3 py-2 text-[#64748B]">{row.submittedAt ? dateText(row.submittedAt) : '—'}</td>
                  <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusBadge(row.status)}`}>{row.status}</span></td>
                  <td className="px-3 py-2 text-[#64748B]">{row.currentStage || '—'}</td>
                </tr>
              ))}
              {!requestRows.length ? (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-[12px] font-semibold text-[#94A3B8]">{requestTab === 'All' ? 'You have not submitted any requests yet.' : `No ${requestTab.toLowerCase()} requests found.`}</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </EssCard>

      {/* Activity + AI */}
      <section className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        <EssCard className="p-3">
          <EssSectionHeader title="Recent Activity" />
          {activityRows.length ? (
            <div className="space-y-1.5">
              {activityRows.slice(0, 5).map((item) => (
                <div key={item.id} className="flex gap-2">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#2563EB]" />
                  <div><p className="text-[12px] font-semibold text-[#0F172A]">{item.action}</p><p className="text-[11px] text-[#64748B]">{item.actor} · {dateText(item.at)}</p></div>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-[10px] border border-dashed border-[#E2E8F0] bg-[#F8FAFC] px-3 py-6 text-center text-[11px] text-[#94A3B8]">No recent workflow activity to show yet.</p>
          )}
        </EssCard>
        <div className="rounded-[16px] border border-[#E2E8F0] bg-gradient-to-b from-[#F5F3FF] to-white p-3 shadow-[0_6px_18px_rgba(15,23,42,0.05)]">
          <EssSectionHeader title="AI Assistant (Beta)" />
          <p className="text-[12px] font-bold text-[#0F172A]">Hello {firstName}! Here&apos;s what you should know today...</p>
          <ul className="mt-1.5 space-y-0.5 text-[11px] text-[#475569]">
            {approvalCount > 0 ? <li>• You have {approvalCount} approval{approvalCount === 1 ? '' : 's'} pending your action.</li> : null}
            {pendingTasks > 0 ? <li>• {pendingTasks} workflow task{pendingTasks === 1 ? '' : 's'} awaiting completion.</li> : null}
            {workflow?.aiInsights?.delayPrediction ? <li>• {workflow.aiInsights.delayPrediction}</li> : null}
            {workflow?.aiInsights?.likelyCompletion ? <li>• {workflow.aiInsights.likelyCompletion}</li> : null}
            {approvalCount === 0 && pendingTasks === 0 && !workflow?.aiInsights ? <li>• No outstanding items — you&apos;re all caught up.</li> : null}
          </ul>
          {workflow?.aiInsights ? (
            <div className="mt-2 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border-[4px] border-[#8B5CF6] bg-white text-[12px] font-bold text-[#8B5CF6]">{workflow.aiInsights.confidenceScore}%</div>
              <p className="text-[11px] text-[#64748B]">Confidence score</p>
            </div>
          ) : null}
        </div>
      </section>

    </div>
  );
}

export function EssRightPanel({ payload, onNavigate }: { payload: EssDashboardPayload | null; onNavigate: (tab: EssTab, options?: { leaveSection?: string }) => void }) {
  const employee = payload?.employee;
  const manager = payload?.managerMetrics;
  const isManager = (manager?.teamSize || 0) > 0 || Boolean(employee?.jobTitle?.match(/manager|head|lead/i));

  return (
    <div className="space-y-2">
      <EssCard className="p-3">
        <EssSectionHeader title="Notifications" />
        <div className="mb-2 flex gap-1.5">
          <span className="rounded-full bg-[#2563EB] px-2.5 py-0.5 text-[10px] font-bold text-white">All</span>
          <span className="rounded-full bg-[#F8FAFC] px-2.5 py-0.5 text-[10px] font-bold text-[#64748B]">Unread</span>
        </div>
        {payload?.notifications?.length ? (
          <div className="space-y-1">
            {payload.notifications.slice(0, 5).map((item) => (
              <EssNotificationItem
                key={item.id}
                compact
                title={item.title}
                meta={`${item.type} · ${dateText(item.createdAt)}`}
                status={item.status}
                icon={item.type.toLowerCase().includes('payroll') ? Banknote : item.type.toLowerCase().includes('leave') ? CalendarCheck : Bell}
                iconBg={item.type.toLowerCase().includes('payroll') ? '#F5F3FF' : '#ECFDF5'}
                iconColor={item.type.toLowerCase().includes('payroll') ? '#8B5CF6' : '#16A34A'}
                onClick={() => {
                  if (item.href) {
                    if (/approval/i.test(item.href) || /leaveSection/i.test(item.href)) onNavigate('leave', { leaveSection: 'Approvals' });
                    else if (/payroll/i.test(item.href)) onNavigate('payroll');
                    else onNavigate('workflow');
                  } else if (/approval/i.test(item.title)) onNavigate('leave', { leaveSection: 'Approvals' });
                  else if (/payslip|payroll/i.test(item.title)) onNavigate('payroll');
                  else onNavigate('workflow');
                }}
              />
            ))}
          </div>
        ) : (
          <p className="rounded-[10px] border border-dashed border-[#E2E8F0] bg-[#F8FAFC] px-3 py-5 text-center text-[11px] text-[#94A3B8]">No new notifications.</p>
        )}
      </EssCard>

      <EssCard className="p-3">
        <EssSectionHeader title="Upcoming Events" action={<button type="button" onClick={() => onNavigate('leave')} className="text-[12px] font-semibold text-[#2563EB] hover:underline">Calendar</button>} />
        <EssMiniCalendar />
        <div className="mt-2 space-y-0.5">
          {payload?.events?.length ? (
            payload.events.slice(0, 4).map((item) => (
              <EssEventItem key={item.id} label={item.label} date={dateText(item.date)} compact />
            ))
          ) : (
            <p className="rounded-[10px] border border-dashed border-[#E2E8F0] bg-[#F8FAFC] px-3 py-4 text-center text-[11px] text-[#94A3B8]">No upcoming events.</p>
          )}
        </div>
      </EssCard>

      <EssCard className="p-3">
        <EssSectionHeader title="Company Announcements" />
        {payload?.announcements?.length ? (
          <div className="space-y-1.5">
            {payload.announcements.slice(0, 4).map((item) => (
              <div key={item.id} className="rounded-[12px] border border-[#E2E8F0] bg-[#FBFCFE] p-2.5">
                <p className="text-[13px] font-bold text-[#0F172A]">{item.title}</p>
                <p className="text-[11px] text-[#64748B]">{item.channel} · {dateText(item.publishedAt)}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-[10px] border border-dashed border-[#E2E8F0] bg-[#F8FAFC] px-3 py-5 text-center text-[11px] text-[#94A3B8]">No company announcements right now.</p>
        )}
      </EssCard>

      {isManager ? (
        <EssCard className="p-3">
          <EssSectionHeader title="My Team" />
          <div className="grid grid-cols-2 gap-1.5">
            {([
              ['Team Members', manager?.teamSize || 0, Users],
              ['On Leave', manager?.onLeave || 0, CalendarCheck],
              ['Pending Approval', manager?.pendingApprovals || 0, AlertCircle],
              ['Missing Timesheets', manager?.missingTimesheets || 0, Clock],
              ['Team Attendance', `${manager?.teamAttendancePct || 0}%`, TrendingUp],
              ['Training Today', manager?.trainingToday || 0, Target],
            ] as const).map(([label, value, Icon]) => (
              <div key={String(label)} className="rounded-[12px] border border-[#E2E8F0] bg-[#F8FAFC] p-2">
                <div className="flex items-center gap-1 text-[#64748B]"><Icon className="h-3.5 w-3.5" /><p className="text-[10px] font-semibold uppercase">{label}</p></div>
                <p className="mt-1 text-[18px] font-bold text-[#0F172A]">{value}</p>
              </div>
            ))}
          </div>
        </EssCard>
      ) : null}
    </div>
  );
}
