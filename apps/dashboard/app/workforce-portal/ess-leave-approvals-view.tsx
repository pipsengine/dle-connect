'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  FileText,
  Filter,
  Gauge,
  Info,
  Inbox,
  Loader2,
  MessageSquare,
  Paperclip,
  Save,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  ThumbsUp,
  TimerReset,
  UserCog,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  EssCard,
  EssKpiCard,
  EssProgressBar,
} from './ess-portal-ui';

type SimpleRecord = Record<string, unknown>;

type ApprovalItem = {
  id: string;
  requestId: string;
  title: string;
  employee: string;
  employeeId: string;
  employeeCode: string;
  type: string;
  days: number;
  startDate: string;
  endDate: string;
  stage: string;
  status: string;
  reliever: string;
  handover: string;
  conflict: string;
  department: string;
  designation: string;
  costCentre: string;
  appliedOn: string;
  priority: string;
  reason: string;
  slaStatus: string;
  elapsedWorkingDays: number;
  slaWorkingDays: number;
  leaveBalance: number;
  attachmentNames: string[];
  comments: Array<{ at: string; actor: string; comment: string }>;
};

export type EssLeaveApprovalsPayload = {
  employee?: {
    fullName?: string;
    department?: string;
    jobTitle?: string;
  };
  managerMetrics?: {
    teamSize?: number;
    pendingApprovals?: number;
    onLeave?: number;
    missingTimesheets?: number;
    teamAttendancePct?: number;
    trainingToday?: number;
  };
  leave?: {
    approvals?: SimpleRecord[];
    pendingApprovalCount?: number;
    approvalMetrics?: {
      pendingApprovals?: number;
      approvedToday?: number;
      rejectedToday?: number;
      escalated?: number;
      slaCompliance?: number;
      avgApprovalLabel?: string;
    };
  };
};

const WORKFLOW_ORDER = ['Employee', 'Supervisor', 'Line Manager', 'HR Manager', 'Payroll', 'Completed'];

const currentStageIndex = (item: ApprovalItem): number => {
  const stage = (item.stage || '').toLowerCase();
  const status = (item.status || '').toLowerCase();
  if (status.includes('approv') || status.includes('complete') || status.includes('closed')) return 5;
  if (status.includes('reject')) return 2;
  if (stage.includes('hr')) return 3;
  if (stage.includes('line manager') || stage.includes('supervisor')) return 2;
  return 2;
};

const buildStages = (item: ApprovalItem) => {
  const current = currentStageIndex(item);
  const rejected = (item.status || '').toLowerCase().includes('reject');
  return WORKFLOW_ORDER.map((label, index) => {
    let state: 'completed' | 'current' | 'pending' | 'rejected' = 'pending';
    if (rejected && index === current) state = 'rejected';
    else if (index < current) state = 'completed';
    else if (index === current) state = 'current';
    return { id: label, label, state };
  });
};

const fmtDate = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value.includes('T') ? value : `${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

const fmtDateTime = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const initials = (name: string) => name.split(' ').map((part) => part[0]).filter(Boolean).join('').slice(0, 2).toUpperCase();

const displayPriority = (priority: string) => (priority || '').toLowerCase() === 'normal' ? 'Medium' : (priority || 'Medium');

const statusBadge = (status: string) => {
  const value = (status || '').toLowerCase();
  if (value.includes('approv') || value.includes('complete') || value.includes('track')) return 'bg-[#ECFDF5] text-[#16A34A]';
  if (value.includes('reject') || value.includes('overdue')) return 'bg-[#FEF2F2] text-[#DC2626]';
  if (value.includes('escalat')) return 'bg-[#FDF2F8] text-[#BE185D]';
  if (value.includes('risk') || value.includes('pending')) return 'bg-[#FFF7ED] text-[#D97706]';
  if (value.includes('progress') || value.includes('review')) return 'bg-[#DBEAFE] text-[#2563EB]';
  return 'bg-[#EFF6FF] text-[#2563EB]';
};

const priorityBadge = (priority: string) => {
  const value = (priority || '').toLowerCase();
  if (value.includes('high')) return 'bg-[#FEF2F2] text-[#DC2626]';
  if (value.includes('low')) return 'bg-[#F1F5F9] text-[#64748B]';
  return 'bg-[#FFF7ED] text-[#D97706]';
};

const slaTone = (item?: ApprovalItem) => {
  const value = (item?.slaStatus || 'On Track').toLowerCase();
  const elapsed = item?.elapsedWorkingDays || 0;
  const total = item?.slaWorkingDays || 5;
  const pct = Math.min(100, Math.round((elapsed / Math.max(total, 1)) * 100));
  if (value.includes('overdue')) return { text: 'text-[#DC2626]', bar: '#EF4444', pct: 100 };
  if (value.includes('risk')) return { text: 'text-[#D97706]', bar: '#F59E0B', pct: Math.max(pct, 70) };
  return { text: 'text-[#16A34A]', bar: '#22C55E', pct: Math.max(pct, 15) };
};

const slaRemainingLabel = (item?: ApprovalItem) => {
  if (!item) return '—';
  const remaining = (item.slaWorkingDays || 5) - (item.elapsedWorkingDays || 0);
  if (remaining <= 0) return 'Overdue';
  return `${remaining} working day${remaining === 1 ? '' : 's'}`;
};

const mapApprovals = (rows: SimpleRecord[]): ApprovalItem[] =>
  rows.map((row, index) => ({
    id: String(row.id ?? `live-${index}`),
    requestId: String(row.requestId ?? row.id ?? ''),
    title: String(row.title ?? `${row.type ?? 'Leave'} Request`),
    employee: String(row.employee ?? 'Employee'),
    employeeId: String(row.employeeId ?? ''),
    employeeCode: String(row.employeeCode ?? row.employeeId ?? ''),
    type: String(row.type ?? 'Leave'),
    days: Number(row.days ?? 0),
    startDate: String(row.startDate ?? ''),
    endDate: String(row.endDate ?? ''),
    stage: String(row.stage ?? 'Line Manager Review'),
    status: String(row.status ?? 'In Progress'),
    reliever: String(row.reliever ?? 'Not configured'),
    handover: String(row.handover ?? '—'),
    conflict: String(row.conflict ?? 'No conflict'),
    department: String(row.department ?? 'Unassigned'),
    designation: String(row.designation ?? 'Employee'),
    costCentre: String(row.costCentre ?? 'Unassigned'),
    appliedOn: String(row.appliedOn ?? row.startDate ?? ''),
    priority: String(row.priority ?? 'Normal'),
    reason: String(row.reason ?? ''),
    slaStatus: String(row.slaStatus ?? 'On Track'),
    elapsedWorkingDays: Number(row.elapsedWorkingDays ?? 0),
    slaWorkingDays: Number(row.slaWorkingDays ?? 5),
    leaveBalance: Number(row.leaveBalance ?? 0),
    attachmentNames: Array.isArray(row.attachmentNames) ? (row.attachmentNames as string[]) : [],
    comments: Array.isArray(row.comments) ? (row.comments as ApprovalItem['comments']) : [],
  }));

type EssLeaveApprovalsViewProps = {
  payload: EssLeaveApprovalsPayload | null;
  saving?: boolean;
  actingRequestId?: string;
  onLeaveAction?: (input: { requestId: string; action: 'approve' | 'reject'; comment?: string }) => Promise<void>;
};

export function EssLeaveApprovalsView({ payload, saving, actingRequestId, onLeaveAction }: EssLeaveApprovalsViewProps) {
  const approvals = useMemo(() => mapApprovals(payload?.leave?.approvals || []), [payload?.leave?.approvals]);
  const metrics = payload?.leave?.approvalMetrics;
  const manager = payload?.managerMetrics;

  const [selectedId, setSelectedId] = useState('');
  const [comment, setComment] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (approvals.length && !approvals.some((item) => item.id === selectedId)) {
      setSelectedId(approvals[0].id);
    }
  }, [approvals, selectedId]);

  const selected = approvals.find((item) => item.id === selectedId) || approvals[0] || null;
  const stages = selected ? buildStages(selected) : [];
  const sla = slaTone(selected || undefined);

  const filtered = approvals.filter((item) => {
    const matchesPriority = priorityFilter === 'All' || displayPriority(item.priority).toLowerCase() === priorityFilter.toLowerCase();
    const matchesQuery = !query || `${item.employee} ${item.type} ${item.department}`.toLowerCase().includes(query.toLowerCase());
    return matchesPriority && matchesQuery;
  });
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const kpis: Array<{ label: string; value: string; subtitle: string; icon: LucideIcon; accent: string; bg: string }> = [
    { label: 'Pending Approvals', value: String(metrics?.pendingApprovals ?? approvals.length), subtitle: 'Awaiting your action', icon: Clock, accent: '#2563EB', bg: '#DBEAFE' },
    { label: 'Approved Today', value: String(metrics?.approvedToday ?? 0), subtitle: 'Team decisions today', icon: CheckCircle2, accent: '#22C55E', bg: '#ECFDF5' },
    { label: 'Rejected', value: String(metrics?.rejectedToday ?? 0), subtitle: 'Declined today', icon: XCircle, accent: '#F59E0B', bg: '#FFF7ED' },
    { label: 'Escalated', value: String(metrics?.escalated ?? 0), subtitle: 'Breached SLA', icon: AlertTriangle, accent: '#EF4444', bg: '#FEF2F2' },
    { label: 'SLA Compliance', value: `${metrics?.slaCompliance ?? 100}%`, subtitle: 'Department active requests', icon: Gauge, accent: '#8B5CF6', bg: '#F5F3FF' },
    { label: 'Avg. Approval Time', value: metrics?.avgApprovalLabel || '—', subtitle: 'Working time to decision', icon: TimerReset, accent: '#06B6D4', bg: '#ECFEFF' },
  ];

  const canAct = Boolean(selected && onLeaveAction);
  const runLeaveAction = (input: { requestId: string; action: 'approve' | 'reject'; comment?: string }) => {
    if (!onLeaveAction || saving) return;
    void onLeaveAction(input);
  };
  const managerActions: Array<{ label: string; icon: LucideIcon; className: string; onClick?: () => void; disabled?: boolean }> = [
    {
      label: 'Approve',
      icon: ThumbsUp,
      className: 'bg-[#ECFDF5] text-[#16A34A] hover:bg-[#DCFCE7] ring-1 ring-[#BBF7D0]',
      onClick: () => selected && runLeaveAction({ requestId: selected.requestId || selected.id, action: 'approve', comment }),
      disabled: saving || !canAct,
    },
    {
      label: 'Reject',
      icon: XCircle,
      className: 'bg-[#FEF2F2] text-[#DC2626] hover:bg-[#FEE2E2] ring-1 ring-[#FECACA]',
      onClick: () => selected && runLeaveAction({ requestId: selected.requestId || selected.id, action: 'reject', comment }),
      disabled: saving || !canAct,
    },
    { label: 'Return for Correction', icon: ArrowLeftRight, className: 'bg-[#FFF7ED] text-[#D97706] hover:bg-[#FFEDD5] ring-1 ring-[#FED7AA]', disabled: !canAct },
    { label: 'Delegate', icon: UserCog, className: 'bg-[#F5F3FF] text-[#7C3AED] hover:bg-[#EDE9FE] ring-1 ring-[#DDD6FE]', disabled: !canAct },
    { label: 'Escalate', icon: ArrowUpRight, className: 'bg-[#FDF2F8] text-[#BE185D] hover:bg-[#FCE7F3] ring-1 ring-[#FBCFE8]', disabled: !canAct },
    { label: 'Request More Information', icon: Info, className: 'bg-[#EFF6FF] text-[#2563EB] hover:bg-[#DBEAFE] ring-1 ring-[#BFDBFE]', disabled: !canAct },
    { label: 'Save as Draft', icon: Save, className: 'bg-[#F8FAFC] text-[#475569] hover:bg-[#F1F5F9] ring-1 ring-[#E2E8F0]', disabled: !canAct },
  ];

  // Live audit trail from request comments + submission event
  const auditTrail = selected
    ? [
        { label: 'Leave request submitted', by: selected.employee, at: fmtDateTime(selected.appliedOn), icon: Send, color: '#2563EB' },
        ...selected.comments.map((entry) => ({
          label: entry.comment.length > 60 ? `${entry.comment.slice(0, 60)}…` : entry.comment,
          by: entry.actor,
          at: fmtDateTime(entry.at),
          icon: MessageSquare as LucideIcon,
          color: '#8B5CF6',
        })),
        { label: `Pending ${selected.stage.replace(' Review', '')} approval`, by: selected.stage.replace(' Review', ''), at: 'In progress', icon: Clock, color: '#F59E0B' },
      ]
    : [];

  // Live impact analysis from manager metrics + selected request
  const teamSize = manager?.teamSize || 0;
  const onLeave = manager?.onLeave || 0;
  const available = Math.max(teamSize - onLeave, 0);
  const workloadRatio = teamSize ? onLeave / teamSize : 0;
  const workloadLabel = workloadRatio >= 0.4 ? 'High impact' : workloadRatio >= 0.2 ? 'Moderate impact' : 'Low impact';
  const balanceAfter = selected ? Math.max(selected.leaveBalance - selected.days, 0) : 0;
  const withinBalance = selected ? selected.days <= selected.leaveBalance : true;
  const impact = selected
    ? [
        { label: 'Team Availability', value: teamSize ? `${available} of ${teamSize} available` : 'No direct reports', tone: available > 0 ? 'ok' : 'warn', icon: Users },
        { label: 'Workload Impact', value: workloadLabel, tone: workloadRatio >= 0.4 ? 'warn' : 'ok', icon: Gauge },
        { label: 'Leave Overlap', value: selected.conflict || 'No conflict', tone: /no conflict|no overlap/i.test(selected.conflict) ? 'ok' : 'warn', icon: CalendarDays },
        { label: 'Policy Compliance', value: withinBalance ? 'Within balance' : 'Exceeds balance', tone: withinBalance ? 'ok' : 'warn', icon: ShieldCheck },
        { label: 'Leave Balance After Approval', value: `${balanceAfter} days`, tone: 'info', icon: FileText },
        { label: 'Reliever', value: selected.reliever, tone: /not configured/i.test(selected.reliever) ? 'warn' : 'ok', icon: UserCog },
      ]
    : [];

  // Live AI decision support derived from real signals
  const aiInsights = selected
    ? [
        /no conflict|no overlap/i.test(selected.conflict) ? 'No leave conflict detected for the requested period.' : `Potential conflict flagged: ${selected.conflict}.`,
        /not configured/i.test(selected.reliever) ? 'No reliever assigned — confirm coverage before approval.' : `Reliever ${selected.reliever} assigned for coverage.`,
        withinBalance ? 'Request is within the employee’s available leave balance.' : 'Request exceeds available balance — policy review required.',
        selected.slaStatus === 'Overdue' ? 'SLA breached — this request requires immediate action.' : selected.slaStatus === 'At Risk' ? 'SLA at risk — action recommended today.' : 'Request is within SLA target.',
      ]
    : [];
  const positiveSignals = selected
    ? [/no conflict|no overlap/i.test(selected.conflict), !/not configured/i.test(selected.reliever), withinBalance, selected.slaStatus !== 'Overdue'].filter(Boolean).length
    : 0;
  const aiConfidence = selected ? Math.round((positiveSignals / 4) * 100) : 0;
  const aiRecommendation = positiveSignals >= 3 ? 'Approve' : 'Review';

  const comments = selected?.comments || [];

  return (
    <div className="space-y-2">
      {/* Executive KPI Row */}
      <section className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map((kpi) => (
          <EssKpiCard
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            subtitle={kpi.subtitle}
            icon={kpi.icon}
            accent={kpi.accent}
            iconBg={kpi.bg}
          />
        ))}
      </section>

      {!selected ? (
        <EssCard className="flex flex-col items-center justify-center gap-2 px-4 py-14 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#EFF6FF] text-[#2563EB]"><Inbox className="h-7 w-7" /></span>
          <h3 className="text-[16px] font-bold text-[#0F172A]">No leave requests are awaiting your approval</h3>
          <p className="max-w-md text-[13px] text-[#64748B]">When a team member submits a leave request routed to you as line manager or HR, it will appear here with full workflow, SLA, and decision tools.</p>
        </EssCard>
      ) : (
        <>
          {/* Main: Approval Details + Workflow + Manager Actions */}
          <section className="grid grid-cols-1 gap-2 xl:grid-cols-12">
            {/* Approval Details */}
            <EssCard className="p-3 xl:col-span-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[15px] font-bold text-[#0F172A]">Approval Details</h3>
                <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${statusBadge(selected.slaStatus)}`}>{selected.slaStatus}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#DBEAFE] text-[16px] font-bold text-[#2563EB]">{initials(selected.employee)}</span>
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-bold text-[#0F172A]">{selected.employee}</p>
                  <p className="truncate text-[12px] font-semibold text-[#2563EB]">{selected.designation}</p>
                  <p className="truncate text-[11px] text-[#94A3B8]">Employee ID {selected.employeeCode || '—'}</p>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-1.5">
                {[
                  ['Leave Type', selected.type],
                  ['Request ID', selected.requestId],
                  ['Duration', `${selected.days} Days`],
                  ['Start Date', fmtDate(selected.startDate)],
                  ['End Date', fmtDate(selected.endDate)],
                  ['Total Days', `${selected.days} Working Days`],
                  ['Department', selected.department],
                  ['Cost Centre', selected.costCentre],
                  ['Leave Balance', `${selected.leaveBalance} Days`],
                  ['Applied On', fmtDate(selected.appliedOn)],
                  ['Reliever', selected.reliever],
                  ['Reason', selected.reason || 'Not provided'],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-[10px] border border-[#E2E8F0] bg-[#F8FAFC] px-2 py-1.5">
                    <p className="text-[9px] font-semibold uppercase tracking-wide text-[#94A3B8]">{label}</p>
                    <p className="truncate text-[12px] font-bold text-[#0F172A]">{value || '—'}</p>
                  </div>
                ))}
              </div>

              <div className="mt-3">
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">Attachments</p>
                {selected.attachmentNames.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {selected.attachmentNames.map((file) => (
                      <span key={file} className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#E2E8F0] bg-white px-2 py-1.5 text-[11px] font-semibold text-[#475569]">
                        <FileText className="h-3.5 w-3.5 text-[#EF4444]" />
                        {file}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-[10px] border border-dashed border-[#E2E8F0] bg-[#F8FAFC] px-2.5 py-2 text-[11px] text-[#94A3B8]">No supporting documents attached.</p>
                )}
              </div>
            </EssCard>

            {/* Workflow + Comments */}
            <EssCard className="p-3 xl:col-span-5">
              <h3 className="mb-2 text-[15px] font-bold text-[#0F172A]">Approval Workflow</h3>
              <div className="flex flex-wrap items-start gap-1">
                {stages.map((stage, index) => (
                  <div key={stage.id} className="flex items-start gap-1">
                    <div className="flex w-[62px] flex-col items-center text-center">
                      <span
                        className={`flex h-9 w-9 items-center justify-center rounded-full text-[11px] font-bold ${
                          stage.state === 'completed'
                            ? 'bg-[#22C55E] text-white'
                            : stage.state === 'current'
                              ? 'bg-[#2563EB] text-white shadow-[0_0_0_4px_rgba(37,99,235,0.18)]'
                              : stage.state === 'rejected'
                                ? 'bg-[#EF4444] text-white'
                                : 'bg-[#F1F5F9] text-[#94A3B8]'
                        }`}
                      >
                        {stage.state === 'completed' ? <Check className="h-4 w-4" /> : stage.state === 'rejected' ? <X className="h-4 w-4" /> : index + 1}
                      </span>
                      <p className="mt-1 text-[10px] font-bold leading-tight text-[#0F172A]">{stage.label}</p>
                      <p className={`text-[9px] font-semibold ${stage.state === 'completed' ? 'text-[#16A34A]' : stage.state === 'current' ? 'text-[#2563EB]' : 'text-[#94A3B8]'}`}>
                        {stage.state === 'completed' ? 'Completed' : stage.state === 'current' ? 'In Progress' : stage.state === 'rejected' ? 'Rejected' : 'Pending'}
                      </p>
                    </div>
                    {index < stages.length - 1 ? <span className={`mt-4 h-0.5 w-3 ${index < currentStageIndex(selected) ? 'bg-[#22C55E]' : 'bg-[#E2E8F0]'}`} /> : null}
                  </div>
                ))}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {[
                  ['Current Approver', selected.stage.replace(' Review', '')],
                  ['SLA Due In', slaRemainingLabel(selected)],
                  ['Priority', displayPriority(selected.priority)],
                  ['Status', selected.status],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-[10px] border border-[#E2E8F0] bg-[#F8FAFC] px-2 py-1.5">
                    <p className="text-[9px] font-semibold uppercase tracking-wide text-[#94A3B8]">{label}</p>
                    <p className="truncate text-[12px] font-bold text-[#0F172A]">{value}</p>
                  </div>
                ))}
              </div>

              {/* Comments */}
              <div className="mt-3 border-t border-[#E2E8F0] pt-3">
                <p className="mb-2 flex items-center gap-1.5 text-[12px] font-bold text-[#0F172A]"><MessageSquare className="h-4 w-4 text-[#2563EB]" /> Approval Comments</p>
                <div className="space-y-2">
                  {comments.length ? comments.map((c, i) => (
                    <div key={`${c.at}-${i}`} className="flex gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#DBEAFE] text-[10px] font-bold text-[#2563EB]">{initials(c.actor)}</span>
                      <div className="min-w-0 flex-1 rounded-[10px] border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 py-1.5">
                        <p className="flex flex-wrap items-center gap-1.5 text-[11px]"><span className="font-bold text-[#0F172A]">{c.actor}</span><span className="ml-auto text-[10px] text-[#94A3B8]">{fmtDateTime(c.at)}</span></p>
                        <p className="mt-0.5 text-[12px] text-[#475569]">{c.comment}</p>
                      </div>
                    </div>
                  )) : (
                    <p className="rounded-[10px] border border-dashed border-[#E2E8F0] bg-[#F8FAFC] px-2.5 py-2 text-[11px] text-[#94A3B8]">No comments yet. Add the first note below.</p>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-2 rounded-[12px] border border-[#E2E8F0] bg-white px-2.5 py-1.5">
                  <input
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Add a comment (included with your approval or rejection)..."
                    className="min-w-0 flex-1 bg-transparent text-[12px] text-[#0F172A] outline-none placeholder:text-[#94A3B8]"
                  />
                  <button type="button" className="text-[#94A3B8] hover:text-[#475569]" aria-label="Attach file"><Paperclip className="h-4 w-4" /></button>
                  <button type="button" className="text-[#94A3B8] hover:text-[#475569]" aria-label="Mention"><Users className="h-4 w-4" /></button>
                  <button
                    type="button"
                    onClick={() => selected && comment.trim() && runLeaveAction({ requestId: selected.requestId || selected.id, action: 'approve', comment })}
                    disabled={saving || !canAct || !comment.trim()}
                    className="inline-flex items-center gap-1 rounded-[10px] bg-[#2563EB] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#1D4ED8] disabled:opacity-50"
                  >
                    {actingRequestId === (selected?.requestId || selected?.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} Post & Approve
                  </button>
                </div>
              </div>
            </EssCard>

            {/* Manager Actions + SLA + Audit */}
            <div className="space-y-2 xl:col-span-3">
              <EssCard className="p-3">
                <h3 className="mb-2 text-[15px] font-bold text-[#0F172A]">Manager Actions</h3>
                <div className="space-y-1.5">
                  {managerActions.map((action) => (
                    <button
                      key={action.label}
                      type="button"
                      onClick={action.onClick}
                      disabled={action.disabled}
                      className={`flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-[12px] font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${action.className}`}
                    >
                      <action.icon className="h-4 w-4" />
                      {action.label}
                    </button>
                  ))}
                </div>
              </EssCard>

              <EssCard className="p-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-[14px] font-bold text-[#0F172A]">SLA Monitor</h3>
                  <span className={`text-[11px] font-bold ${sla.text}`}>{sla.pct}%</span>
                </div>
                <div className="mt-2"><EssProgressBar value={sla.pct} color={sla.bar} /></div>
                <div className="mt-2 space-y-1 text-[11px]">
                  <p className="flex justify-between"><span className="text-[#94A3B8]">Target</span><span className="font-semibold text-[#0F172A]">{selected.slaWorkingDays} working days</span></p>
                  <p className="flex justify-between"><span className="text-[#94A3B8]">Time Remaining</span><span className={`font-semibold ${sla.text}`}>{slaRemainingLabel(selected)}</span></p>
                  <p className="flex justify-between"><span className="text-[#94A3B8]">Elapsed</span><span className="font-semibold text-[#0F172A]">{selected.elapsedWorkingDays} working day{selected.elapsedWorkingDays === 1 ? '' : 's'}</span></p>
                </div>
              </EssCard>

              <EssCard className="p-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-[14px] font-bold text-[#0F172A]">Audit Trail</h3>
                </div>
                <div className="mt-2 space-y-2">
                  {auditTrail.map((event, index) => (
                    <div key={`${event.label}-${index}`} className="flex gap-2">
                      <div className="flex flex-col items-center">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full text-white" style={{ backgroundColor: event.color }}>
                          <event.icon className="h-3 w-3" />
                        </span>
                        {index < auditTrail.length - 1 ? <span className="mt-0.5 h-full w-px flex-1 bg-[#E2E8F0]" /> : null}
                      </div>
                      <div className="pb-1">
                        <p className="text-[12px] font-semibold text-[#0F172A]">{event.label}</p>
                        <p className="text-[10px] text-[#94A3B8]">by {event.by} · {event.at}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </EssCard>
            </div>
          </section>

          {/* Impact Analysis + Team Calendar + AI */}
          <section className="grid grid-cols-1 gap-2 xl:grid-cols-12">
            <EssCard className="p-3 xl:col-span-4">
              <h3 className="mb-2 text-[15px] font-bold text-[#0F172A]">Impact Analysis</h3>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {impact.map((item) => (
                  <div key={item.label} className="flex items-start gap-2 rounded-[10px] border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 py-2">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] ${item.tone === 'ok' ? 'bg-[#ECFDF5] text-[#16A34A]' : item.tone === 'warn' ? 'bg-[#FFF7ED] text-[#D97706]' : 'bg-[#EFF6FF] text-[#2563EB]'}`}>
                      <item.icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#94A3B8]">{item.label}</p>
                      <p className="truncate text-[12px] font-bold text-[#0F172A]">{item.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </EssCard>

            <EssCard className="p-3 xl:col-span-5">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[15px] font-bold text-[#0F172A]">Leave Calendar (Team View)</h3>
                <span className="text-[11px] font-semibold text-[#94A3B8]">Next 14 days</span>
              </div>
              <TeamLeaveCalendar approvals={approvals} />
              <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-medium text-[#64748B]">
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#22C55E]" /> Approved</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#F59E0B]" /> Pending</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#EF4444]" /> Escalated</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#CBD5E1]" /> Weekend</span>
              </div>
            </EssCard>

            <EssCard className="p-3 xl:col-span-3">
              <h3 className="mb-2 flex items-center gap-1.5 text-[15px] font-bold text-[#0F172A]"><Sparkles className="h-4 w-4 text-[#8B5CF6]" /> AI Decision Support</h3>
              <ul className="space-y-1.5">
                {aiInsights.map((insight) => (
                  <li key={insight} className="flex gap-1.5 rounded-[10px] bg-[#F5F3FF] px-2.5 py-1.5 text-[11px] text-[#475569]">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8B5CF6]" />
                    {insight}
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex items-center gap-2 rounded-[10px] border border-[#DDD6FE] bg-white px-2.5 py-2">
                <div className="flex h-11 w-11 items-center justify-center rounded-full border-[4px] border-[#8B5CF6] text-[12px] font-bold text-[#8B5CF6]">{aiConfidence}%</div>
                <div>
                  <p className="text-[11px] font-bold text-[#0F172A]">Recommended: {aiRecommendation}</p>
                  <p className="text-[10px] text-[#94A3B8]">Based on {positiveSignals}/4 positive signals</p>
                </div>
              </div>
            </EssCard>
          </section>
        </>
      )}

      {/* Pending Approvals Grid */}
      <EssCard className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] px-3 py-2.5">
          <h3 className="text-[15px] font-bold text-[#0F172A]">Pending Approvals ({filtered.length})</h3>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#94A3B8]" />
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                placeholder="Search requests..."
                className="h-8 w-44 rounded-[10px] border border-[#E2E8F0] bg-[#F8FAFC] pl-8 pr-3 text-[12px] outline-none focus:border-[#93C5FD]"
              />
            </div>
            <select
              value={priorityFilter}
              onChange={(e) => { setPriorityFilter(e.target.value); setPage(1); }}
              className="h-8 rounded-[10px] border border-[#E2E8F0] bg-white px-2 text-[12px] font-semibold text-[#475569] outline-none"
            >
              {['All', 'High', 'Medium', 'Low'].map((p) => <option key={p} value={p}>{p === 'All' ? 'All Priority' : p}</option>)}
            </select>
            <button type="button" className="inline-flex h-8 items-center gap-1 rounded-[10px] border border-[#E2E8F0] bg-white px-2.5 text-[12px] font-semibold text-[#475569] hover:bg-[#F8FAFC]"><Filter className="h-3.5 w-3.5" /> Filter</button>
            <button type="button" className="inline-flex h-8 items-center gap-1 rounded-[10px] border border-[#E2E8F0] bg-white px-2.5 text-[12px] font-semibold text-[#475569] hover:bg-[#F8FAFC]"><Download className="h-3.5 w-3.5" /> Export</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-[12px]">
            <thead className="bg-[#F8FAFC] text-[10px] font-bold uppercase tracking-wide text-[#64748B]">
              <tr>
                <th className="px-3 py-2">Employee</th>
                <th className="px-3 py-2">Leave Type</th>
                <th className="px-3 py-2">Duration</th>
                <th className="px-3 py-2">Dates</th>
                <th className="px-3 py-2">Applied On</th>
                <th className="px-3 py-2">Current Stage</th>
                <th className="px-3 py-2">SLA Due</th>
                <th className="px-3 py-2">Priority</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => setSelectedId(row.id)}
                  className={`cursor-pointer border-t border-[#E2E8F0] transition hover:bg-[#F8FAFC] ${row.id === selectedId ? 'bg-[#EFF6FF]' : ''}`}
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#DBEAFE] text-[10px] font-bold text-[#2563EB]">{initials(row.employee)}</span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-[#0F172A]">{row.employee}</p>
                        <p className="truncate text-[10px] text-[#94A3B8]">{row.designation || row.department}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-[#475569]">{row.type}</td>
                  <td className="px-3 py-2 text-[#475569]">{row.days} Days</td>
                  <td className="px-3 py-2 text-[#475569]">{fmtDate(row.startDate)} – {fmtDate(row.endDate)}</td>
                  <td className="px-3 py-2 text-[#475569]">{fmtDate(row.appliedOn)}</td>
                  <td className="px-3 py-2 text-[#475569]">{row.stage.replace(' Review', '')}</td>
                  <td className="px-3 py-2"><span className={`text-[11px] font-semibold ${slaTone(row).text}`}>{slaRemainingLabel(row)}</span></td>
                  <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${priorityBadge(displayPriority(row.priority))}`}>{displayPriority(row.priority)}</span></td>
                  <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusBadge(row.status)}`}>{row.status}</span></td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); runLeaveAction({ requestId: row.requestId || row.id, action: 'approve', comment }); }}
                        disabled={saving || !onLeaveAction}
                        className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[#ECFDF5] text-[#16A34A] hover:bg-[#DCFCE7] disabled:opacity-50"
                        aria-label="Approve"
                        title={actingRequestId === (row.requestId || row.id) ? 'Processing approval…' : 'Approve'}
                      >
                        {actingRequestId === (row.requestId || row.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); runLeaveAction({ requestId: row.requestId || row.id, action: 'reject', comment }); }}
                        disabled={saving || !onLeaveAction}
                        className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[#FEF2F2] text-[#DC2626] hover:bg-[#FEE2E2] disabled:opacity-50"
                        aria-label="Reject"
                        title={actingRequestId === (row.requestId || row.id) ? 'Processing rejection…' : 'Reject'}
                      >
                        {actingRequestId === (row.requestId || row.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!pageRows.length ? (
                <tr><td colSpan={10} className="px-3 py-8 text-center text-[13px] font-semibold text-[#94A3B8]">No leave requests are awaiting your approval.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 ? (
          <div className="flex items-center justify-between border-t border-[#E2E8F0] px-3 py-2 text-[11px] text-[#64748B]">
            <span>Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of {filtered.length}</span>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="flex h-7 w-7 items-center justify-center rounded-[8px] border border-[#E2E8F0] disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
              {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
                <button key={p} type="button" onClick={() => setPage(p)} className={`h-7 w-7 rounded-[8px] text-[11px] font-bold ${p === page ? 'bg-[#2563EB] text-white' : 'border border-[#E2E8F0] text-[#475569]'}`}>{p}</button>
              ))}
              <button type="button" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page === pageCount} className="flex h-7 w-7 items-center justify-center rounded-[8px] border border-[#E2E8F0] disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        ) : null}
      </EssCard>
    </div>
  );
}

function TeamLeaveCalendar({ approvals }: { approvals: ApprovalItem[] }) {
  const today = new Date();
  const window = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  });
  const rows = approvals.slice(0, 6);
  const kindColor = (status: string) => {
    const value = status.toLowerCase();
    if (value.includes('approv') || value.includes('complete')) return 'bg-[#22C55E]';
    if (value.includes('escalat')) return 'bg-[#EF4444]';
    return 'bg-[#F59E0B]';
  };
  const inRange = (d: Date, start: string, end: string) => {
    if (!start || !end) return false;
    const iso = d.toISOString().slice(0, 10);
    return iso >= start.slice(0, 10) && iso <= end.slice(0, 10);
  };

  if (!rows.length) {
    return <p className="rounded-[10px] border border-dashed border-[#E2E8F0] bg-[#F8FAFC] px-3 py-6 text-center text-[12px] text-[#94A3B8]">No scheduled team leave in the current window.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[520px]">
        <div className="grid grid-cols-[90px_repeat(14,1fr)] gap-0.5">
          <div />
          {window.map((d, i) => {
            const weekend = d.getDay() === 0 || d.getDay() === 6;
            return (
              <div key={i} className={`text-center text-[8px] font-bold uppercase ${weekend ? 'text-[#EF4444]' : 'text-[#94A3B8]'}`}>
                <p>{['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][d.getDay()]}</p>
                <p className="text-[10px] text-[#475569]">{String(d.getDate()).padStart(2, '0')}</p>
              </div>
            );
          })}
        </div>
        <div className="mt-1 space-y-0.5">
          {rows.map((row) => (
            <div key={row.id} className="grid grid-cols-[90px_repeat(14,1fr)] items-center gap-0.5">
              <p className="truncate text-[10px] font-semibold text-[#0F172A]">{row.employee}</p>
              {window.map((d, i) => {
                const active = inRange(d, row.startDate, row.endDate);
                const weekend = d.getDay() === 0 || d.getDay() === 6;
                return <div key={i} className={`h-5 rounded-[4px] ${active ? kindColor(row.status) : weekend ? 'bg-[#F1F5F9]' : 'bg-[#F8FAFC]'}`} />;
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
