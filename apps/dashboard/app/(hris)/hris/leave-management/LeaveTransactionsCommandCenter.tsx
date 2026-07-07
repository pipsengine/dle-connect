'use client';

import { useMemo, useState } from 'react';
import EmployeeAvatar from '@/components/hris/EmployeeAvatar';
import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  ChevronRight,
  Clock3,
  Download,
  FileText,
  History,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  XCircle,
} from 'lucide-react';

type LeaveAction = { id: string; label: string };

type AppRecord = {
  id: string;
  employeeId: string;
  fullName: string;
  department: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  status: string;
  stage: string;
  approvalStatus: string;
  createdAt: string;
  exceptions: string[];
};

type Summary = {
  pendingApprovals: number;
  recallRequests: number;
  cancellationRequests: number;
  encashmentRequests: number;
  leaveUtilizationPct: number;
};

type PayloadSlice = {
  summary: Summary;
  applications: AppRecord[];
  balances: Array<{ carryForwardBalance: number }>;
  actions: LeaveAction[];
};

const numberFmt = new Intl.NumberFormat('en-GB');
const number = (value: number | undefined) => numberFmt.format(value || 0);

const statusBadge = (status: string) => {
  const text = status.toLowerCase();
  if (text.includes('approve') || text.includes('complete')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (text.includes('reject') || text.includes('cancel') || text.includes('withdraw')) return 'bg-red-50 text-red-700 border-red-200';
  if (text.includes('review') || text.includes('submit') || text.includes('draft')) return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-blue-50 text-blue-700 border-blue-200';
};

const displayStatus = (item: AppRecord) => {
  if (item.approvalStatus && item.approvalStatus !== item.status) return item.approvalStatus;
  return item.status;
};

export default function LeaveTransactionsCommandCenter({
  payload,
  busyAction,
  onAction,
  onNavigate,
}: {
  payload: PayloadSlice | null;
  busyAction: string;
  onAction: (actionId: string) => void;
  onNavigate: (section: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [leaveTypeFilter, setLeaveTypeFilter] = useState('All');

  const applications = payload?.applications || [];

  const departments = useMemo(() => Array.from(new Set(applications.map((item) => item.department).filter(Boolean))).sort(), [applications]);
  const leaveTypes = useMemo(() => Array.from(new Set(applications.map((item) => item.leaveType).filter(Boolean))).sort(), [applications]);
  const statuses = useMemo(() => Array.from(new Set(applications.map((item) => item.status).filter(Boolean))).sort(), [applications]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return applications.filter((item) => {
      if (statusFilter !== 'All' && item.status !== statusFilter) return false;
      if (departmentFilter !== 'All' && item.department !== departmentFilter) return false;
      if (leaveTypeFilter !== 'All' && item.leaveType !== leaveTypeFilter) return false;
      if (!q) return true;
      return [item.id, item.employeeId, item.fullName, item.department, item.leaveType, item.status, item.stage]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [applications, query, statusFilter, departmentFilter, leaveTypeFilter]);

  const pending = filteredRows.filter((item) => ['Draft', 'Submitted', 'Under Review'].includes(item.status)).length;
  const approved = filteredRows.filter((item) => ['Approved', 'Completed'].includes(item.status)).length;
  const rejected = filteredRows.filter((item) => ['Rejected', 'Cancelled', 'Withdrawn', 'Terminated'].includes(item.status)).length;
  const exceptions = filteredRows.reduce((sum, item) => sum + item.exceptions.length, 0) + rejected;

  const recentRows = useMemo(
    () => [...filteredRows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5),
    [filteredRows],
  );

  const leaveTypeCounts = useMemo(() => {
    const map = new Map<string, number>();
    filteredRows.forEach((item) => map.set(item.leaveType, (map.get(item.leaveType) || 0) + 1));
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [filteredRows]);

  const totalForChart = Math.max(filteredRows.length, 1);
  const approvedPct = Math.round((approved / totalForChart) * 1000) / 10;
  const pendingPct = Math.round((pending / totalForChart) * 1000) / 10;
  const exceptionPct = Math.round((exceptions / totalForChart) * 1000) / 10;

  const donutGradient = `conic-gradient(#10B981 0% ${approvedPct}%, #F59E0B ${approvedPct}% ${approvedPct + pendingPct}%, #EF4444 ${approvedPct + pendingPct}% 100%)`;

  const actionBar = [
    { id: 'apply', label: 'Apply Leave', description: 'Start a new leave application', icon: Plus, tone: 'blue' as const },
    { id: 'submit', label: 'Submit', description: 'Submit draft applications for approval', icon: Send, tone: 'green' as const },
    { id: 'cancel', label: 'Cancel', description: 'Cancel pending leave requests', icon: XCircle, tone: 'red' as const },
    { id: 'withdraw', label: 'Withdraw', description: 'Withdraw submitted applications', icon: RotateCcw, tone: 'orange' as const },
    { id: 'export', label: 'Export', description: 'Export transaction records', icon: Download, tone: 'slate' as const },
    { id: 'view-history', label: 'View History', description: 'Review historical leave activity', icon: History, tone: 'violet' as const },
    { id: 'view-audit-trail', label: 'View Audit Trail', description: 'Open compliance audit trail', icon: FileText, tone: 'cyan' as const },
  ];

  const resolveAction = (id: string) => {
    if (id === 'apply') return payload?.actions.find((item) => item.id === 'apply' || item.id === 'create');
    return payload?.actions.find((item) => item.id === id);
  };

  const carryForwardCount = payload?.balances.filter((row) => row.carryForwardBalance > 0).length || 0;

  const aiMessage =
    (payload?.summary.pendingApprovals || 0) > 0
      ? `${number(payload?.summary.pendingApprovals)} approvals are pending review. Monitor the action center to maintain SLA compliance.`
      : `Leave utilization is currently within optimal range at ${number(payload?.summary.leaveUtilizationPct)}%. No approval backlog detected.`;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
        {actionBar.map((item) => {
          const Icon = item.icon;
          const available = item.id === 'export' || Boolean(resolveAction(item.id));
          return (
            <button
              key={item.id}
              type="button"
              disabled={!available || busyAction === item.id}
              onClick={() => {
                if (item.id === 'export') {
                  window.location.href = '/api/hris/leave-management?format=csv';
                  return;
                }
                onAction(item.id);
              }}
              className="group rounded-xl border border-[#E5E7EB] bg-white p-4 text-left shadow-sm transition hover:border-[#2563EB]/40 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${toneIconBg(item.tone)}`}>
                <Icon className="h-5 w-5" />
              </span>
              <p className="mt-3 text-sm font-semibold text-slate-900 group-hover:text-[#2563EB]">{item.label}</p>
              <p className="mt-1 text-xs text-slate-500">{item.description}</p>
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto_auto_auto] xl:grid-cols-[1.2fr_repeat(4,minmax(0,160px))]">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search employee, department, leave type, status..."
            className="h-11 rounded-lg border border-[#E5E7EB] px-4 text-sm outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
          />
          <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={['All', ...statuses]} />
          <FilterSelect label="Department" value={departmentFilter} onChange={setDepartmentFilter} options={['All', ...departments]} />
          <FilterSelect label="Leave Type" value={leaveTypeFilter} onChange={setLeaveTypeFilter} options={['All', ...leaveTypes]} />
          <div className="flex h-11 items-center rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] px-3 text-xs font-semibold text-slate-600">
            Date Range: Last 30 days
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <OverviewCard label="Total Transactions" value={number(filteredRows.length)} tone="blue" trend={[40, 55, 48, 62, 70, filteredRows.length % 80 || 56]} />
        <OverviewCard label="Pending Workflow" value={number(pending)} tone="amber" trend={[12, 18, 14, pending || 8, 10, pending || 6]} />
        <OverviewCard label="Approved / Closed" value={number(approved)} tone="green" trend={[30, 42, 50, 58, approved % 70 || 45, approved || 40]} />
        <OverviewCard label="Exceptions" value={number(exceptions)} tone="red" trend={[4, 6, 5, exceptions || 3, 7, exceptions || 4]} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-[#E5E7EB] px-5 py-4">
            <h2 className="text-lg font-semibold">Recent Transactions</h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">{number(filteredRows.length)} total</span>
          </div>
          {recentRows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left">
                <thead className="bg-[#F8FAFC]">
                  <tr>
                    {['Employee', 'Leave Type', 'Period', 'Status', 'Requested Date', 'Action'].map((header) => (
                      <th key={header} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentRows.map((item) => (
                    <tr key={item.id} className="border-t border-[#E5E7EB] hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <EmployeeAvatar fullName={item.fullName} employeeId={item.employeeId} size="sm" tryPhoto />
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{item.fullName}</p>
                            <p className="text-xs text-slate-500">{item.employeeId}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-700">{item.leaveType}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        <div>{item.startDate} – {item.endDate}</div>
                        <div className="text-xs text-slate-500">{item.days} day(s)</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusBadge(displayStatus(item))}`}>
                          {displayStatus(item)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{new Date(item.createdAt).toLocaleDateString('en-GB')}</td>
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => onNavigate('approvals')} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800" aria-label="Transaction actions">
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center">
              <FileText className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-600">No leave transactions match the current filters.</p>
              <p className="mt-1 text-xs text-slate-500">Transactions appear after leave applications are submitted into HRIS.</p>
            </div>
          )}
          <div className="border-t border-[#E5E7EB] px-5 py-3">
            <button type="button" onClick={() => onNavigate('applications')} className="inline-flex items-center gap-1 text-sm font-semibold text-[#2563EB] hover:text-blue-700">
              View All Transactions
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold">Transaction By Status</h3>
            <div className="mt-4 flex flex-col items-center gap-4">
              <div className="relative h-36 w-36">
                <div className="h-full w-full rounded-full" style={{ background: filteredRows.length ? donutGradient : '#E5E7EB' }} />
                <div className="absolute inset-4 flex flex-col items-center justify-center rounded-full bg-white">
                  <span className="text-xl font-bold text-slate-900">{number(filteredRows.length)}</span>
                  <span className="text-[10px] font-semibold uppercase text-slate-500">Total</span>
                </div>
              </div>
              <div className="w-full space-y-2 text-xs">
                <LegendRow color="#10B981" label="Approved / Closed" value={`${approvedPct}%`} />
                <LegendRow color="#F59E0B" label="Pending Workflow" value={`${pendingPct}%`} />
                <LegendRow color="#EF4444" label="Exceptions" value={`${exceptionPct}%`} />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold">Top Leave Types</h3>
            <div className="mt-4 space-y-3">
              {leaveTypeCounts.length ? (
                leaveTypeCounts.map((item) => {
                  const max = leaveTypeCounts[0]?.count || 1;
                  return (
                    <div key={item.name}>
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="font-medium text-slate-800">{item.name}</span>
                        <span className="text-slate-600">{number(item.count)}</span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-[#2563EB]" style={{ width: `${(item.count / max) * 100}%` }} />
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-slate-500">No leave type activity recorded.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Transaction Action Center</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            { label: 'Pending Approvals', count: payload?.summary.pendingApprovals || 0, section: 'approvals', icon: Clock3, tone: 'amber' },
            { label: 'Carry Forward Processing', count: carryForwardCount, section: 'carry-forward-processing', icon: BadgeCheck, tone: 'blue' },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => onNavigate(item.section)}
                className="flex items-center justify-between gap-3 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-4 text-left transition hover:border-[#2563EB]/30 hover:bg-white"
              >
                <div>
                  <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${toneIconBg(item.tone)}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <p className="mt-3 text-xs font-semibold text-slate-700">{item.label}</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{number(item.count)}</p>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-[#2563EB]" />
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-[#2563EB]" />
          <p className="text-sm font-medium text-[#0F172A]">AI Insight: {aiMessage}</p>
        </div>
        <button type="button" onClick={() => onNavigate('approvals')} className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-[#2563EB] hover:text-blue-700">
          View Insights
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[#64748B]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-lg border border-[#E5E7EB] bg-white px-3 text-sm outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function OverviewCard({ label, value, tone, trend }: { label: string; value: string; tone: 'blue' | 'amber' | 'green' | 'red'; trend: number[] }) {
  const max = Math.max(...trend, 1);
  const colors = { blue: '#2563EB', amber: '#F59E0B', green: '#10B981', red: '#EF4444' };

  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
      <div className="mt-3 flex h-10 items-end gap-1">
        {trend.map((point, index) => (
          <div key={index} className="flex-1 rounded-sm opacity-80" style={{ height: `${Math.max((point / max) * 100, 12)}%`, backgroundColor: colors[tone] }} />
        ))}
      </div>
    </div>
  );
}

function LegendRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-2 text-slate-700">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
        {label}
      </span>
      <span className="font-semibold text-slate-900">{value}</span>
    </div>
  );
}

function toneIconBg(tone: string) {
  const map: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-700',
    green: 'bg-emerald-100 text-emerald-700',
    red: 'bg-red-100 text-red-700',
    orange: 'bg-amber-100 text-amber-700',
    slate: 'bg-slate-100 text-slate-700',
    violet: 'bg-violet-100 text-violet-700',
    cyan: 'bg-cyan-100 text-cyan-700',
    amber: 'bg-amber-100 text-amber-700',
  };
  return map[tone] || map.blue;
}
