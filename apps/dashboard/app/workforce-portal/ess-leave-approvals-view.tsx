'use client';

import { useMemo, useState } from 'react';
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
  employee: string;
  employeeId?: string;
  type: string;
  days: number;
  startDate: string;
  endDate: string;
  stage: string;
  status: string;
  reliever: string;
  handover?: string;
  conflict?: string;
  appliedOn?: string;
  priority?: string;
  slaStatus?: string;
  department?: string;
  costCentre?: string;
  reason?: string;
  photoUrl?: string;
  designation?: string;
  leaveBalance?: number;
  requestId?: string;
  sample?: boolean;
};

export type EssLeaveApprovalsPayload = {
  employee?: {
    fullName?: string;
    department?: string;
    jobTitle?: string;
  };
  leave?: {
    approvals?: SimpleRecord[];
    workflows?: SimpleRecord[];
    pendingApprovalCount?: number;
    calendar?: SimpleRecord[];
  };
};

const SAMPLE_APPROVALS: ApprovalItem[] = [
  {
    id: 'sample-1',
    employee: 'Christian O.',
    employeeId: 'DLE/2026/0146',
    type: 'Annual Leave',
    days: 4,
    startDate: '2026-06-30',
    endDate: '2026-07-03',
    stage: 'Line Manager Review',
    status: 'In Progress',
    reliever: 'Ezekiel Johnson',
    appliedOn: '2026-06-20',
    priority: 'Medium',
    slaStatus: 'On Track',
    department: 'Information Technology',
    costCentre: 'IT-1001',
    designation: 'Ag. IT Manager',
    reason: 'Family vacation',
    leaveBalance: 19,
    requestId: 'LEAVE/2026/0765',
    sample: true,
  },
  {
    id: 'sample-2',
    employee: 'Jane Okafor',
    employeeId: 'DLE/2026/0210',
    type: 'Sick Leave',
    days: 2,
    startDate: '2026-06-30',
    endDate: '2026-07-01',
    stage: 'Line Manager Review',
    status: 'Pending',
    reliever: 'Musa Bello',
    appliedOn: '2026-06-22',
    priority: 'High',
    slaStatus: 'At Risk',
    department: 'Business Analysis',
    costCentre: 'BA-2200',
    designation: 'Business Analyst',
    reason: 'Medical recovery',
    leaveBalance: 8,
    requestId: 'LEAVE/2026/0766',
    sample: true,
  },
  {
    id: 'sample-3',
    employee: 'Daniel Umeh',
    employeeId: 'DLE/2026/0311',
    type: 'Casual Leave',
    days: 1,
    startDate: '2026-07-05',
    endDate: '2026-07-05',
    stage: 'HR Review',
    status: 'In Progress',
    reliever: 'Grace Ibrahim',
    appliedOn: '2026-06-24',
    priority: 'Low',
    slaStatus: 'On Track',
    department: 'Procurement',
    costCentre: 'PR-3100',
    designation: 'Procurement Officer',
    reason: 'Personal errand',
    leaveBalance: 6,
    requestId: 'LEAVE/2026/0767',
    sample: true,
  },
  {
    id: 'sample-4',
    employee: 'Amaka Nwosu',
    employeeId: 'DLE/2026/0418',
    type: 'Annual Leave',
    days: 7,
    startDate: '2026-07-08',
    endDate: '2026-07-16',
    stage: 'Line Manager Review',
    status: 'Escalated',
    reliever: 'Tunde Alabi',
    appliedOn: '2026-06-18',
    priority: 'High',
    slaStatus: 'Overdue',
    department: 'Finance',
    costCentre: 'FN-1200',
    designation: 'Finance Officer',
    reason: 'Annual break',
    leaveBalance: 15,
    requestId: 'LEAVE/2026/0768',
    sample: true,
  },
];

const WORKFLOW_ORDER = ['Employee', 'Supervisor', 'Line Manager', 'HR Manager', 'Payroll', 'Completed'];

const currentStageIndex = (item: ApprovalItem): number => {
  const stage = (item.stage || '').toLowerCase();
  const status = (item.status || '').toLowerCase();
  if (status.includes('approv') || status.includes('complete')) return 5;
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
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

const initials = (name: string) => name.split(' ').map((part) => part[0]).filter(Boolean).join('').slice(0, 2).toUpperCase();

const statusBadge = (status: string) => {
  const value = (status || '').toLowerCase();
  if (value.includes('approv') || value.includes('complete')) return 'bg-[#ECFDF5] text-[#16A34A]';
  if (value.includes('reject')) return 'bg-[#FEF2F2] text-[#DC2626]';
  if (value.includes('escalat')) return 'bg-[#FDF2F8] text-[#BE185D]';
  if (value.includes('pending')) return 'bg-[#FFF7ED] text-[#D97706]';
  if (value.includes('progress') || value.includes('review')) return 'bg-[#DBEAFE] text-[#2563EB]';
  return 'bg-[#EFF6FF] text-[#2563EB]';
};

const priorityBadge = (priority: string) => {
  const value = (priority || '').toLowerCase();
  if (value.includes('high')) return 'bg-[#FEF2F2] text-[#DC2626]';
  if (value.includes('low')) return 'bg-[#F1F5F9] text-[#64748B]';
  return 'bg-[#FFF7ED] text-[#D97706]';
};

const slaTone = (sla: string) => {
  const value = (sla || '').toLowerCase();
  if (value.includes('overdue')) return { text: 'text-[#DC2626]', bar: '#EF4444', pct: 100 };
  if (value.includes('risk')) return { text: 'text-[#D97706]', bar: '#F59E0B', pct: 78 };
  return { text: 'text-[#16A34A]', bar: '#22C55E', pct: 42 };
};

const mapApprovals = (rows: SimpleRecord[]): ApprovalItem[] =>
  rows.map((row, index) => ({
    id: String(row.id ?? `live-${index}`),
    requestId: String(row.requestId ?? row.id ?? `LEAVE/${index}`),
    employee: String(row.employee ?? 'Employee'),
    employeeId: row.employeeId ? String(row.employeeId) : undefined,
    type: String(row.type ?? 'Leave'),
    days: Number(row.days ?? 0),
    startDate: String(row.startDate ?? ''),
    endDate: String(row.endDate ?? ''),
    stage: String(row.stage ?? 'Line Manager Review'),
    status: String(row.status ?? 'In Progress'),
    reliever: String(row.reliever ?? 'Not configured'),
    handover: row.handover ? String(row.handover) : undefined,
    conflict: row.conflict ? String(row.conflict) : 'No conflict',
    appliedOn: row.appliedOn ? String(row.appliedOn) : String(row.startDate ?? ''),
    priority: String(row.priority ?? 'Medium'),
    slaStatus: String(row.slaStatus ?? 'On Track'),
    department: row.department ? String(row.department) : undefined,
    costCentre: row.costCentre ? String(row.costCentre) : undefined,
    reason: row.reason ? String(row.reason) : undefined,
    designation: row.designation ? String(row.designation) : undefined,
    leaveBalance: row.leaveBalance !== undefined ? Number(row.leaveBalance) : undefined,
  }));

type EssLeaveApprovalsViewProps = {
  payload: EssLeaveApprovalsPayload | null;
  saving?: boolean;
  onLeaveAction?: (input: { requestId: string; action: 'approve' | 'reject'; comment?: string }) => Promise<void>;
};

export function EssLeaveApprovalsView({ payload, saving, onLeaveAction }: EssLeaveApprovalsViewProps) {
  const liveApprovals = useMemo(() => mapApprovals(payload?.leave?.approvals || []), [payload?.leave?.approvals]);
  const hasLive = liveApprovals.length > 0;
  const approvals = hasLive ? liveApprovals : SAMPLE_APPROVALS;

  const [selectedId, setSelectedId] = useState(approvals[0]?.id || '');
  const [comment, setComment] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const selected = approvals.find((item) => item.id === selectedId) || approvals[0];
  const stages = selected ? buildStages(selected) : [];
  const sla = slaTone(selected?.slaStatus || 'On Track');

  const pendingCount = hasLive ? (payload?.leave?.pendingApprovalCount || liveApprovals.length) : approvals.length;
  const escalatedCount = approvals.filter((item) => (item.status || '').toLowerCase().includes('escalat')).length;

  const filtered = approvals.filter((item) => {
    const matchesPriority = priorityFilter === 'All' || (item.priority || '').toLowerCase() === priorityFilter.toLowerCase();
    const matchesQuery = !query || `${item.employee} ${item.type} ${item.department}`.toLowerCase().includes(query.toLowerCase());
    return matchesPriority && matchesQuery;
  });
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const kpis: Array<{ label: string; value: string; subtitle: string; detail?: string; icon: LucideIcon; accent: string; bg: string; spark: number[]; trend: number }> = [
    { label: 'Pending Approvals', value: String(pendingCount), subtitle: '+20% vs yesterday', icon: Clock, accent: '#2563EB', bg: '#DBEAFE', spark: [6, 8, 7, 10, 9, pendingCount || 12], trend: 20 },
    { label: 'Approved Today', value: '8', subtitle: '+33% vs yesterday', icon: CheckCircle2, accent: '#22C55E', bg: '#ECFDF5', spark: [2, 4, 3, 6, 5, 8], trend: 33 },
    { label: 'Rejected', value: '1', subtitle: '-10% vs yesterday', icon: XCircle, accent: '#F59E0B', bg: '#FFF7ED', spark: [3, 2, 2, 1, 2, 1], trend: -10 },
    { label: 'Escalated', value: String(escalatedCount), subtitle: 'No change', icon: AlertTriangle, accent: '#EF4444', bg: '#FEF2F2', spark: [1, 0, 1, 0, 0, escalatedCount], trend: 0 },
    { label: 'SLA Compliance', value: '92%', subtitle: '+8% vs yesterday', icon: Gauge, accent: '#8B5CF6', bg: '#F5F3FF', spark: [80, 84, 88, 90, 91, 92], trend: 8 },
    { label: 'Avg. Approval Time', value: '1d 4h', subtitle: '-15% vs yesterday', icon: TimerReset, accent: '#06B6D4', bg: '#ECFEFF', spark: [40, 38, 34, 32, 30, 28], trend: -15 },
  ];

  const managerActions: Array<{ label: string; icon: LucideIcon; className: string; onClick?: () => void; disabled?: boolean }> = [
    {
      label: 'Approve',
      icon: ThumbsUp,
      className: 'bg-[#ECFDF5] text-[#16A34A] hover:bg-[#DCFCE7] ring-1 ring-[#BBF7D0]',
      onClick: () => selected && !selected.sample && onLeaveAction?.({ requestId: selected.requestId || selected.id, action: 'approve', comment }),
      disabled: saving || !selected || selected?.sample,
    },
    {
      label: 'Reject',
      icon: XCircle,
      className: 'bg-[#FEF2F2] text-[#DC2626] hover:bg-[#FEE2E2] ring-1 ring-[#FECACA]',
      onClick: () => selected && !selected.sample && onLeaveAction?.({ requestId: selected.requestId || selected.id, action: 'reject', comment }),
      disabled: saving || !selected || selected?.sample,
    },
    { label: 'Return for Correction', icon: ArrowLeftRight, className: 'bg-[#FFF7ED] text-[#D97706] hover:bg-[#FFEDD5] ring-1 ring-[#FED7AA]' },
    { label: 'Delegate', icon: UserCog, className: 'bg-[#F5F3FF] text-[#7C3AED] hover:bg-[#EDE9FE] ring-1 ring-[#DDD6FE]' },
    { label: 'Escalate', icon: ArrowUpRight, className: 'bg-[#FDF2F8] text-[#BE185D] hover:bg-[#FCE7F3] ring-1 ring-[#FBCFE8]' },
    { label: 'Request More Information', icon: Info, className: 'bg-[#EFF6FF] text-[#2563EB] hover:bg-[#DBEAFE] ring-1 ring-[#BFDBFE]' },
    { label: 'Save as Draft', icon: Save, className: 'bg-[#F8FAFC] text-[#475569] hover:bg-[#F1F5F9] ring-1 ring-[#E2E8F0]' },
  ];

  const auditTrail = [
    { label: 'Leave request submitted', by: selected?.employee || 'Employee', at: '30 Jun, 09:15 AM', icon: Send, color: '#2563EB' },
    { label: 'Approved by Supervisor', by: 'David K.', at: '30 Jun, 11:40 AM', icon: Check, color: '#22C55E' },
    { label: 'Pending approval', by: 'Line Manager', at: '01 Jul, 11:20 AM', icon: Clock, color: '#F59E0B' },
  ];

  const impact = [
    { label: 'Team Availability', value: '8 of 12 available', tone: 'ok', icon: Users },
    { label: 'Workload Impact', value: 'Low impact', tone: 'ok', icon: Gauge },
    { label: 'Leave Overlap', value: 'No overlap detected', tone: 'ok', icon: CalendarDays },
    { label: 'Policy Compliance', value: 'Compliant', tone: 'ok', icon: ShieldCheck },
    { label: 'Leave Balance After Approval', value: `${Math.max((selected?.leaveBalance || 19) - (selected?.days || 0), 0)} days`, tone: 'info', icon: FileText },
    { label: 'Payroll Impact', value: '₦162,320.00', tone: 'info', icon: FileText },
  ];

  const aiInsights = [
    'No staffing conflict detected for the requested period.',
    'Reliever coverage confirmed — department capacity remains healthy.',
    'Request complies with DLE annual leave policy and notice period.',
    'No duplicate or overlapping leave found for this employee.',
  ];

  const comments = [
    { id: 'c1', name: 'Michael O.', role: 'Line Manager', at: '01 Jul, 11:20 AM', text: 'Request looks good. Please confirm coverage for the project during this period.' },
    { id: 'c2', name: (selected?.employee || 'Christian O.').split(' ')[0] + ' O.', role: selected?.designation || 'Ag. IT Manager', at: '01 Jul, 11:27 AM', text: `Project coverage is confirmed. ${selected?.reliever || 'The reliever'} will be handling all responsibilities.` },
  ];

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
            sparkline={kpi.spark}
            trend={kpi.trend}
          />
        ))}
      </section>

      {/* Main: Approval Details + Workflow + Manager Actions */}
      <section className="grid grid-cols-1 gap-2 xl:grid-cols-12">
        {/* Approval Details */}
        <EssCard className="p-3 xl:col-span-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[15px] font-bold text-[#0F172A]">Approval Details</h3>
            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${statusBadge(selected?.slaStatus || 'On Track')}`}>{selected?.slaStatus || 'On Track'}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#DBEAFE] text-[16px] font-bold text-[#2563EB]">{initials(selected?.employee || 'E')}</span>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-bold text-[#0F172A]">{selected?.employee}</p>
              <p className="truncate text-[12px] font-semibold text-[#2563EB]">{selected?.designation || 'Employee'}</p>
              <p className="truncate text-[11px] text-[#94A3B8]">Employee ID {selected?.employeeId || '—'}</p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-1.5">
            {[
              ['Leave Type', selected?.type],
              ['Request ID', selected?.requestId],
              ['Duration', `${selected?.days || 0} Days`],
              ['Start Date', fmtDate(selected?.startDate)],
              ['End Date', fmtDate(selected?.endDate)],
              ['Total Days', `${selected?.days || 0} Working Days`],
              ['Department', selected?.department],
              ['Cost Centre', selected?.costCentre],
              ['Leave Balance', `${selected?.leaveBalance ?? 0} Days`],
              ['Applied On', fmtDate(selected?.appliedOn)],
              ['Reliever', selected?.reliever],
              ['Reason', selected?.reason],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-[10px] border border-[#E2E8F0] bg-[#F8FAFC] px-2 py-1.5">
                <p className="text-[9px] font-semibold uppercase tracking-wide text-[#94A3B8]">{label}</p>
                <p className="truncate text-[12px] font-bold text-[#0F172A]">{value || '—'}</p>
              </div>
            ))}
          </div>

          <div className="mt-3">
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">Attachments</p>
            <div className="flex flex-wrap gap-1.5">
              {['Flight Ticket.pdf', 'Hotel Booking.pdf', 'Itinerary.pdf'].map((file, i) => (
                <span key={file} className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#E2E8F0] bg-white px-2 py-1.5 text-[11px] font-semibold text-[#475569]">
                  <FileText className="h-3.5 w-3.5 text-[#EF4444]" />
                  {file}
                  <span className="text-[9px] text-[#94A3B8]">{180 + i * 30} KB</span>
                  <X className="h-3 w-3 text-[#CBD5E1]" />
                </span>
              ))}
              <span className="inline-flex items-center rounded-[10px] bg-[#EFF6FF] px-2 py-1.5 text-[11px] font-bold text-[#2563EB]">+2 More</span>
            </div>
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
                {index < stages.length - 1 ? <span className={`mt-4 h-0.5 w-3 ${index < currentStageIndex(selected!) ? 'bg-[#22C55E]' : 'bg-[#E2E8F0]'}`} /> : null}
              </div>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {[
              ['Current Approver', selected?.stage?.replace(' Review', '') || 'Line Manager'],
              ['SLA Due In', selected?.slaStatus === 'Overdue' ? 'Overdue' : '1d 4h 32m'],
              ['Priority', selected?.priority || 'Medium'],
              ['Status', selected?.status || 'In Progress'],
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
              {comments.map((c) => (
                <div key={c.id} className="flex gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#DBEAFE] text-[10px] font-bold text-[#2563EB]">{initials(c.name)}</span>
                  <div className="min-w-0 flex-1 rounded-[10px] border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 py-1.5">
                    <p className="flex flex-wrap items-center gap-1.5 text-[11px]"><span className="font-bold text-[#0F172A]">{c.name}</span><span className="text-[#94A3B8]">{c.role}</span><span className="ml-auto text-[10px] text-[#94A3B8]">{c.at}</span></p>
                    <p className="mt-0.5 text-[12px] text-[#475569]">{c.text}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2 rounded-[12px] border border-[#E2E8F0] bg-white px-2.5 py-1.5">
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a comment..."
                className="min-w-0 flex-1 bg-transparent text-[12px] text-[#0F172A] outline-none placeholder:text-[#94A3B8]"
              />
              <button type="button" className="text-[#94A3B8] hover:text-[#475569]" aria-label="Attach file"><Paperclip className="h-4 w-4" /></button>
              <button type="button" className="text-[#94A3B8] hover:text-[#475569]" aria-label="Mention"><Users className="h-4 w-4" /></button>
              <button type="button" className="inline-flex items-center gap-1 rounded-[10px] bg-[#2563EB] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#1D4ED8]"><Send className="h-3 w-3" /> Post</button>
            </div>
          </div>
        </EssCard>

        {/* Manager Actions + SLA + Audit */}
        <div className="space-y-2 xl:col-span-3">
          <EssCard className="p-3">
            <h3 className="mb-2 text-[15px] font-bold text-[#0F172A]">Manager Actions</h3>
            {selected?.sample ? <p className="mb-2 rounded-[8px] bg-[#FFF7ED] px-2 py-1 text-[10px] font-semibold text-[#B45309]">Sample request — actions enabled for live approvals.</p> : null}
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
              <p className="flex justify-between"><span className="text-[#94A3B8]">SLA Due Date</span><span className="font-semibold text-[#0F172A]">{fmtDate(selected?.endDate)}, 05:00 PM</span></p>
              <p className="flex justify-between"><span className="text-[#94A3B8]">Time Remaining</span><span className={`font-semibold ${sla.text}`}>{selected?.slaStatus === 'Overdue' ? 'Overdue' : '1d 4h 32m'}</span></p>
              <p className="flex justify-between"><span className="text-[#94A3B8]">Elapsed Time</span><span className="font-semibold text-[#0F172A]">2h 07m</span></p>
            </div>
          </EssCard>

          <EssCard className="p-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[14px] font-bold text-[#0F172A]">Audit Trail</h3>
              <button type="button" className="text-[11px] font-semibold text-[#2563EB] hover:underline">View all</button>
            </div>
            <div className="mt-2 space-y-2">
              {auditTrail.map((event, index) => (
                <div key={event.label} className="flex gap-2">
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

      {/* Impact Analysis + Team Calendar */}
      <section className="grid grid-cols-1 gap-2 xl:grid-cols-12">
        <EssCard className="p-3 xl:col-span-4">
          <h3 className="mb-2 text-[15px] font-bold text-[#0F172A]">Impact Analysis</h3>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {impact.map((item) => (
              <div key={item.label} className="flex items-start gap-2 rounded-[10px] border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 py-2">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] ${item.tone === 'ok' ? 'bg-[#ECFDF5] text-[#16A34A]' : 'bg-[#EFF6FF] text-[#2563EB]'}`}>
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
            <span className="text-[11px] font-semibold text-[#94A3B8]">Jun 29 – Jul 12, 2026</span>
          </div>
          <TeamLeaveCalendar />
          <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-medium text-[#64748B]">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#22C55E]" /> Approved</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#F59E0B]" /> Pending</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#2563EB]" /> Training</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#EF4444]" /> Public Holiday</span>
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
            <div className="flex h-11 w-11 items-center justify-center rounded-full border-[4px] border-[#8B5CF6] text-[12px] font-bold text-[#8B5CF6]">96%</div>
            <div>
              <p className="text-[11px] font-bold text-[#0F172A]">Recommended: Approve</p>
              <p className="text-[10px] text-[#94A3B8]">AI confidence score</p>
            </div>
          </div>
        </EssCard>
      </section>

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
                        <p className="truncate text-[10px] text-[#94A3B8]">{row.designation || row.department || '—'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-[#475569]">{row.type}</td>
                  <td className="px-3 py-2 text-[#475569]">{row.days} Days</td>
                  <td className="px-3 py-2 text-[#475569]">{fmtDate(row.startDate)} – {fmtDate(row.endDate)}</td>
                  <td className="px-3 py-2 text-[#475569]">{fmtDate(row.appliedOn)}</td>
                  <td className="px-3 py-2 text-[#475569]">{row.stage?.replace(' Review', '')}</td>
                  <td className="px-3 py-2 text-[#475569]">{fmtDate(row.endDate)}, 05:00 PM</td>
                  <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${priorityBadge(row.priority || '')}`}>{row.priority}</span></td>
                  <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusBadge(row.status)}`}>{row.status}</span></td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); if (!row.sample) onLeaveAction?.({ requestId: row.requestId || row.id, action: 'approve', comment }); }}
                        disabled={saving || row.sample}
                        className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[#ECFDF5] text-[#16A34A] hover:bg-[#DCFCE7] disabled:opacity-50"
                        aria-label="Approve"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); if (!row.sample) onLeaveAction?.({ requestId: row.requestId || row.id, action: 'reject', comment }); }}
                        disabled={saving || row.sample}
                        className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[#FEF2F2] text-[#DC2626] hover:bg-[#FEE2E2] disabled:opacity-50"
                        aria-label="Reject"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!pageRows.length ? (
                <tr><td colSpan={10} className="px-3 py-8 text-center text-[13px] font-semibold text-[#94A3B8]">No leave requests match your filters.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
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
      </EssCard>
    </div>
  );
}

function TeamLeaveCalendar() {
  const days = ['SAT', 'SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN', 'MON', 'TUE', 'WED', 'THU'];
  const dates = ['29', '30', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11'];
  const rows = [
    { name: 'Christian O.', cells: { 1: 'approved', 2: 'approved', 3: 'approved', 4: 'approved' } as Record<number, string> },
    { name: 'Ezekiel J.', cells: { 0: 'working', 1: 'working', 2: 'working' } as Record<number, string> },
    { name: 'Michael O.', cells: { 5: 'sick', 6: 'sick' } as Record<number, string> },
    { name: 'Grace I.', cells: { 8: 'training', 9: 'training' } as Record<number, string> },
  ];
  const color = (kind?: string) => {
    if (kind === 'approved') return 'bg-[#22C55E]';
    if (kind === 'pending') return 'bg-[#F59E0B]';
    if (kind === 'sick') return 'bg-[#F59E0B]';
    if (kind === 'training') return 'bg-[#2563EB]';
    if (kind === 'working') return 'bg-[#DBEAFE]';
    return '';
  };
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[520px]">
        <div className="grid grid-cols-[80px_repeat(13,1fr)] gap-0.5">
          <div />
          {days.map((d, i) => (
            <div key={i} className={`text-center text-[8px] font-bold uppercase ${i === 5 || i === 6 || i === 12 ? 'text-[#EF4444]' : 'text-[#94A3B8]'}`}>
              <p>{d}</p>
              <p className="text-[10px] text-[#475569]">{dates[i]}</p>
            </div>
          ))}
        </div>
        <div className="mt-1 space-y-0.5">
          {rows.map((row) => (
            <div key={row.name} className="grid grid-cols-[80px_repeat(13,1fr)] items-center gap-0.5">
              <p className="truncate text-[10px] font-semibold text-[#0F172A]">{row.name}</p>
              {Array.from({ length: 13 }, (_, i) => (
                <div key={i} className={`h-5 rounded-[4px] ${row.cells[i] ? color(row.cells[i]) : (i === 6 || i === 5 || i === 12) ? 'bg-[#F1F5F9]' : 'bg-[#F8FAFC]'}`} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
