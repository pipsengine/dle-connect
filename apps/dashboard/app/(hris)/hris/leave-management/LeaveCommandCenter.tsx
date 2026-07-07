'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  Banknote,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Download,
  FileSpreadsheet,
  History,
  Plus,
  RotateCcw,
  Sparkles,
  TrendingUp,
  Users,
  XCircle,
} from 'lucide-react';

type Summary = {
  totalEmployees: number;
  employeesOnLeave: number;
  returningToday: number;
  pendingApplications: number;
  pendingApprovals: number;
  pendingHrApprovals?: number;
  pendingManagerApprovals?: number;
  leaveUtilizationPct: number;
  leaveLiability: number;
  encashmentRequests: number;
  recallRequests: number;
  cancellationRequests: number;
  allowanceExceptionCount?: number;
  allowancePendingPayrollCount?: number;
};

type AppRecord = {
  id: string;
  fullName: string;
  department: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  status: string;
};

type BalanceRecord = {
  leaveType: string;
  usedBalance: number;
  carryForwardBalance: number;
  department?: string;
};

type LeaveTypeRule = {
  id: string;
  name: string;
  entitlementDays: number;
  active: boolean;
};

type PayloadSlice = {
  summary: Summary;
  applications: AppRecord[];
  balances: BalanceRecord[];
  leaveTypes: LeaveTypeRule[];
  calendar: Array<Record<string, string | number>>;
  current: { policyComplianceStatus: string };
  drilldowns?: {
    onLeaveToday: Array<{ employeeId: string; fullName: string; department: string; leaveType?: string; startDate?: string; endDate?: string; days?: number; status?: string; stage?: string; metricLabel?: string; metricValue?: string | number }>;
    upcomingLeave: Array<{ employeeId: string; fullName: string; department: string; leaveType?: string; startDate?: string; endDate?: string; days?: number; status?: string; stage?: string }>;
    pendingApprovals: Array<{ employeeId: string; fullName: string; department: string; leaveType?: string; startDate?: string; endDate?: string; days?: number; status?: string; stage?: string }>;
    pendingHrApprovals?: Array<{ employeeId: string; fullName: string; department: string; leaveType?: string; startDate?: string; endDate?: string; days?: number; status?: string; stage?: string }>;
    pendingManagerApprovals?: Array<{ employeeId: string; fullName: string; department: string; leaveType?: string; startDate?: string; endDate?: string; days?: number; status?: string; stage?: string }>;
    carryForwardProcessing: Array<{ employeeId: string; fullName: string; department: string; leaveType?: string; days?: number; metricLabel?: string; metricValue?: string | number }>;
    cancellationRequests: Array<{ employeeId: string; fullName: string; department: string; leaveType?: string; startDate?: string; endDate?: string; days?: number; status?: string }>;
    returningToday: Array<{ employeeId: string; fullName: string; department: string; leaveType?: string; startDate?: string; endDate?: string; days?: number; status?: string }>;
    leaveAllowanceExceptions?: Array<{ employeeId: string; fullName: string; department: string; leaveType?: string; startDate?: string; endDate?: string; days?: number; status?: string; stage?: string; metricLabel?: string; metricValue?: string | number }>;
  };
};

type DrilldownPanel = {
  title: string;
  note: string;
  rows: Array<{
    employeeId: string;
    fullName: string;
    department: string;
    leaveType?: string;
    startDate?: string;
    endDate?: string;
    days?: number;
    status?: string;
    stage?: string;
    metricLabel?: string;
    metricValue?: string | number;
  }>;
};

const numberFmt = new Intl.NumberFormat('en-GB');
const number = (value: number | undefined) => numberFmt.format(value || 0);

const money = (value: number | undefined) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(value || 0);

const compactMoney = (value: number | undefined) => {
  const v = value || 0;
  if (v >= 1_000_000_000) return `₦${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `₦${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `₦${(v / 1_000).toFixed(1)}K`;
  return money(v);
};

const statusLabel = (count: number, healthy = 'Normal') => (count > 0 ? 'Action Required' : healthy);

export default function LeaveCommandCenter({
  payload,
  onNavigate,
  onAction,
  onOpenDrilldown,
}: {
  payload: PayloadSlice | null;
  onNavigate: (section: string) => void;
  onAction: (actionId: string) => void;
  onOpenDrilldown: (panel: DrilldownPanel) => void;
}) {
  const summary = payload?.summary;
  const applications = payload?.applications || [];
  const balances = payload?.balances || [];
  const calendar = payload?.calendar || [];
  const leaveTypes = payload?.leaveTypes || [];
  const drilldowns = payload?.drilldowns;

  const upcomingCount = drilldowns?.upcomingLeave.length ?? calendar.filter((item) => String(item.status || '').toLowerCase().includes('upcoming') || String(item.status || '').toLowerCase().includes('approved')).length;
  const availableEmployees = Math.max((summary?.totalEmployees || 0) - (summary?.employeesOnLeave || 0), 0);

  const usageByType = useMemoFromBalances(balances);
  const departmentUsage = useMemoFromApplications(applications);

  const policySummary = useMemoPolicySummary(leaveTypes);

  const insights = [
    {
      label: 'Most Utilized Leave Type',
      value: usageByType.mostUsed?.type || 'Annual Leave',
      detail: usageByType.mostUsed ? `${number(usageByType.mostUsed.used)} days used` : 'No usage recorded',
    },
    {
      label: 'Least Utilized Leave Type',
      value: usageByType.leastUsed?.type || 'Exam Leave',
      detail: usageByType.leastUsed ? `${number(usageByType.leastUsed.used)} days used` : 'No usage recorded',
    },
    {
      label: 'Departments With Highest Leave Usage',
      value: departmentUsage.top?.name || 'Operations',
      detail: departmentUsage.top ? `${number(departmentUsage.top.count)} requests` : 'No department data',
    },
    {
      label: 'Upcoming Leave Peaks',
      value: upcomingCount > 0 ? `${upcomingCount} scheduled` : 'None detected',
      detail: 'Next 30-day horizon',
    },
    {
      label: 'Leave Liability Trend',
      value: compactMoney(summary?.leaveLiability),
      detail: 'Current accrued exposure',
    },
    {
      label: 'Carry Forward Exposure',
      value: number(balances.reduce((sum, row) => sum + row.carryForwardBalance, 0)),
      detail: 'Total carry-forward days',
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[
          {
            label: 'Employees On Leave',
            count: summary?.employeesOnLeave || 0,
            status: statusLabel(summary?.employeesOnLeave || 0, 'Clear'),
            section: 'leave-calendar',
            drilldown: {
              title: 'Employees On Leave Today',
              note: 'Approved leave covering today from DLE_Enterprise leave applications.',
              rows: drilldowns?.onLeaveToday || [],
            },
          },
          {
            label: 'Upcoming Leave',
            count: upcomingCount,
            status: 'Scheduled',
            section: 'leave-calendar',
            drilldown: {
              title: 'Upcoming Leave',
              note: 'Future-dated leave applications that are approved or awaiting approval.',
              rows: drilldowns?.upcomingLeave || [],
            },
          },
          {
            label: 'HR Pending Approvals',
            count: summary?.pendingHrApprovals || 0,
            status: statusLabel(summary?.pendingHrApprovals || 0),
            section: 'approvals',
            drilldown: {
              title: 'HR Pending Approvals',
              note: 'Leave applications awaiting HR review.',
              rows: drilldowns?.pendingHrApprovals || [],
            },
          },
        ].map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => onOpenDrilldown(item.drilldown)}
            className="rounded-xl border border-[#E5E7EB] bg-white p-4 text-left shadow-sm transition-colors hover:border-[#2563EB]/30 hover:bg-blue-50/30"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">{item.label}</p>
            <p className="mt-2 text-2xl font-bold text-[#0F172A]">{number(item.count)}</p>
            <p className="mt-1 text-xs font-semibold text-slate-600">{item.status}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#2563EB]">
              View Details
              <ChevronRight className="h-3.5 w-3.5" />
            </span>
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Action Center</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            {
              label: 'Pending Approvals',
              count: summary?.pendingApprovals || 0,
              section: 'approvals',
              drilldown: {
                title: 'Pending Approvals',
                note: 'All leave applications awaiting supervisor or HR approval.',
                rows: drilldowns?.pendingApprovals || [],
              },
            },
            {
              label: 'Carry Forward Processing',
              count: drilldowns?.carryForwardProcessing.length ?? balances.filter((row) => row.carryForwardBalance > 0).length,
              section: 'carry-forward-processing',
              drilldown: {
                title: 'Carry Forward Processing',
                note: 'Unique employees with carry-forward leave balance in DLE_Enterprise.',
                rows: drilldowns?.carryForwardProcessing || [],
              },
            },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => onOpenDrilldown(item.drilldown)}
              className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-4 text-left hover:bg-white"
            >
              <p className="text-xs font-semibold text-slate-700">{item.label}</p>
              <p className="mt-2 text-xl font-bold text-slate-900">{number(item.count)}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#2563EB]">
                Open Workspace
                <ChevronRight className="h-3.5 w-3.5" />
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,340px)]">
        <div className="space-y-4">
          <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold">Workforce Availability</h3>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <AvailabilityCard label="Available Employees" value={number(availableEmployees)} tone="emerald" />
              <AvailabilityCard label="Employees On Leave" value={number(summary?.employeesOnLeave)} tone="blue" />
              <AvailabilityCard label="Returning This Week" value={number(summary?.returningToday)} tone="violet" />
              <AvailabilityCard label="Critical Departments Impacted" value={number(departmentUsage.impacted)} tone="amber" />
            </div>
          </div>

          <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold">Leave Policy Summary</h3>
            <div className="mt-3 space-y-2">
              {policySummary.map((item) => (
                <div key={item.name} className="flex items-center justify-between rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2.5">
                  <span className="text-sm font-semibold text-slate-900">{item.name}</span>
                  <span className="text-sm font-bold text-[#2563EB]">{item.days} Days</span>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => onNavigate('leave-policies')} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#2563EB] hover:text-blue-700">
              View Leave Policies
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">Leave Planning Calendar</h3>
              <CalendarDays className="h-5 w-5 text-[#2563EB]" />
            </div>
            <div className="mt-4 min-h-[220px] rounded-xl border border-dashed border-[#E5E7EB] bg-[#F8FAFC] p-4">
              {calendar.length ? (
                <div className="space-y-2">
                  {calendar.slice(0, 5).map((item, index) => (
                    <div key={`${item.label}-${index}`} className="flex items-center justify-between rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm">
                      <span className="font-semibold text-slate-900">{String(item.label || 'Leave')}</span>
                      <span className="text-xs text-slate-500">
                        {String(item.from || '')} – {String(item.to || '')}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex h-full min-h-[180px] flex-col items-center justify-center text-center">
                  <CalendarDays className="h-10 w-10 text-slate-300" />
                  <p className="mt-3 text-sm font-medium text-slate-600">No upcoming leaves scheduled</p>
                  <p className="mt-1 text-xs text-slate-500">Approved and upcoming leave will appear here</p>
                </div>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => onNavigate('leave-calendar')} className="rounded-lg border border-[#E5E7EB] px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                View Full Calendar
              </button>
              <button type="button" onClick={() => onNavigate('team-leave-planner')} className="rounded-lg bg-[#2563EB] px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">
                Plan Team Leave
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold">Leave Analytics Snapshot</h3>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <AnalyticsCard label="Leave Utilization" value={`${number(summary?.leaveUtilizationPct)}%`} />
              <AnalyticsCard label="Department Leave Trend" value={departmentUsage.trend} />
              <AnalyticsCard label="Leave Cost Trend" value={compactMoney(summary?.leaveLiability)} />
              <AnalyticsCard label="Absence Trend" value={`${number(summary?.employeesOnLeave)} on leave today`} />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold">Approval Center</h3>
            <div className="mt-3 space-y-2">
              {[
                { label: 'Pending Requests', value: summary?.pendingApplications || 0 },
                { label: 'Manager Approvals', value: applications.filter((item) => item.status === 'Under Review').length },
                { label: 'HR Approvals', value: applications.filter((item) => item.status === 'Submitted').length },
                { label: 'Escalated Requests', value: applications.filter((item) => (item as AppRecord & { exceptions?: string[] }).exceptions?.length).length || 0 },
                { label: 'Approval SLA Status', value: (summary?.pendingApprovals || 0) > 0 ? 'Within SLA' : 'On Track' },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2.5">
                  <span className="text-xs font-semibold text-slate-700">{item.label}</span>
                  <span className="text-sm font-bold text-slate-900">{typeof item.value === 'number' ? number(item.value) : item.value}</span>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => onNavigate('approvals')} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#2563EB] hover:text-blue-700">
              Open Approval Center
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold">Leave Insights</h3>
            <div className="mt-3 space-y-2">
              {insights.slice(0, 4).map((item) => (
                <div key={item.label} className="rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">{item.label}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{item.value}</p>
                  <p className="text-xs text-slate-500">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>

          <QuickActionsPanel onNavigate={onNavigate} onAction={onAction} />
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-[#2563EB]" />
          <p className="text-sm font-medium text-[#0F172A]">
            AI Insight:{' '}
            {(summary?.pendingApprovals || 0) > 0
              ? `${number(summary?.pendingApprovals)} approvals require attention. Review the approval center to maintain SLA compliance.`
              : `No approvals are pending and compliance is ${payload?.current.policyComplianceStatus || 'healthy'}. Leave utilization is at ${number(summary?.leaveUtilizationPct)}% — within operational range.`}
          </p>
        </div>
        <button type="button" onClick={() => onNavigate('approvals')} className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-[#2563EB] hover:text-blue-700">
          View Insights
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function AvailabilityCard({ label, value, tone }: { label: string; value: string; tone: 'emerald' | 'blue' | 'violet' | 'amber' }) {
  const styles = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    blue: 'border-blue-200 bg-blue-50 text-blue-800',
    violet: 'border-violet-200 bg-violet-50 text-violet-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
  }[tone];

  return (
    <div className={`rounded-lg border p-3 ${styles}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}

function AnalyticsCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-900">{value}</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full w-2/3 rounded-full bg-[#2563EB]" />
      </div>
    </div>
  );
}

function QuickActionsPanel({ onNavigate, onAction }: { onNavigate: (section: string) => void; onAction: (actionId: string) => void }) {
  const actions = [
    { label: 'Apply Leave', icon: Plus, action: () => onAction('apply') },
    { label: 'Approve Leave', icon: ClipboardCheck, action: () => onNavigate('approvals') },
    { label: 'Leave Planner', icon: CalendarDays, action: () => onNavigate('team-leave-planner') },
    { label: 'Generate Report', icon: FileSpreadsheet, action: () => onNavigate('leave-reports') },
    { label: 'Leave Calendar', icon: CalendarDays, action: () => onNavigate('leave-calendar') },
    { label: 'Audit Trail', icon: History, action: () => onAction('view-audit-trail') },
  ];

  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold">Quick Actions</h3>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {actions.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.label} type="button" onClick={item.action} className="flex items-center gap-2 rounded-lg border border-[#E5E7EB] px-3 py-2.5 text-left text-xs font-semibold text-slate-700 hover:border-blue-200 hover:bg-blue-50">
              <Icon className="h-4 w-4 shrink-0 text-[#2563EB]" />
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function useMemoFromBalances(balances: BalanceRecord[]) {
  const byType = new Map<string, number>();
  balances.forEach((row) => {
    byType.set(row.leaveType, (byType.get(row.leaveType) || 0) + row.usedBalance);
  });
  const entries = Array.from(byType.entries()).map(([type, used]) => ({ type, used }));
  entries.sort((a, b) => b.used - a.used);
  return {
    mostUsed: entries[0] || null,
    leastUsed: entries[entries.length - 1] || null,
  };
}

function useMemoFromApplications(applications: AppRecord[]) {
  const byDept = new Map<string, number>();
  applications.forEach((row) => {
    if (!row.department) return;
    byDept.set(row.department, (byDept.get(row.department) || 0) + 1);
  });
  const entries = Array.from(byDept.entries()).map(([name, count]) => ({ name, count }));
  entries.sort((a, b) => b.count - a.count);
  return {
    top: entries[0] || null,
    impacted: entries.filter((item) => item.count >= 3).length,
    trend: entries.length ? (entries[0].count > 5 ? 'Rising' : 'Stable') : 'Stable',
  };
}

function useMemoPolicySummary(leaveTypes: LeaveTypeRule[]) {
  const preferred = ['Annual Leave', 'Sick Leave', 'Maternity Leave', 'Compassionate Leave', 'Exam Leave'];
  const fromData = preferred
    .map((name) => {
      const match = leaveTypes.find((item) => item.name.toLowerCase().includes(name.toLowerCase().split(' ')[0]!));
      return match ? { name: match.name, days: match.entitlementDays } : { name, days: name === 'Annual Leave' ? 30 : name === 'Sick Leave' ? 10 : name === 'Maternity Leave' ? 90 : 5 };
    })
    .slice(0, 5);
  return fromData;
}
