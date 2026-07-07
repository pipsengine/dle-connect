'use client';

import { useMemo } from 'react';
import {
  AlertTriangle,
  Baby,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Clock,
  FileText,
  GraduationCap,
  Heart,
  History,
  Palmtree,
  Stethoscope,
  Sun,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  EssCard,
  EssKpiCard,
  EssNotificationItem,
  EssProgressBar,
  EssSectionHeader,
} from './ess-portal-ui';

export type LeaveBalanceCard = {
  id?: string;
  type: string;
  entitlement?: number;
  used?: number;
  pending?: number;
  balance?: number;
  basis?: string;
  expiryDate?: string;
  eligibilityStatus?: string;
  allowanceStatus?: string;
  policyNote?: string;
};

export type LeaveCalendarItem = {
  id?: string;
  label?: string;
  from?: string;
  to?: string;
  status?: string;
  scope?: string;
};

export type EssLeavePayload = {
  generatedAt?: string;
  employee?: {
    fullName?: string;
    jobTitle?: string;
    department?: string;
    salaryGrade?: string;
    location?: string;
    payrollGroup?: string;
    employeeCode?: string;
    employeeId?: string;
    photoUrl?: string;
    hasPhoto?: boolean;
    status?: string;
    yearsOfService?: number;
  };
  widgets?: {
    leave: { entitlement: number; used: number; balance: number; pending: number };
    requests: { pending: number; approved: number; total: number };
  };
  notifications?: Array<{ id: string; title: string; type: string; status: string; createdAt: string }>;
  leave?: {
    balances: LeaveBalanceCard[];
    calendar: LeaveCalendarItem[];
    history: Array<{ type?: string; from?: string; to?: string; days?: number; status?: string; year?: number }>;
    allowance: Array<{ label?: string; value?: string; status?: string }>;
    relieverOptions?: Array<{ employeeId: string; fullName: string; jobTitle?: string; department?: string }>;
  };
};

export type LeaveWorkspaceTab =
  | 'Leave Dashboard'
  | 'Apply Leave'
  | 'My Applications'
  | 'Leave Calendar'
  | 'Leave History'
  | 'Approvals'
  | 'Policy & Entitlement';

const leaveTabs: Array<{ id: LeaveWorkspaceTab; icon: LucideIcon }> = [
  { id: 'Leave Dashboard', icon: CalendarCheck },
  { id: 'Apply Leave', icon: ClipboardList },
  { id: 'My Applications', icon: FileText },
  { id: 'Leave Calendar', icon: CalendarDays },
  { id: 'Leave History', icon: History },
  { id: 'Approvals', icon: Users },
  { id: 'Policy & Entitlement', icon: BookOpen },
];

const stableDateTime = (value: string) => {
  const iso = new Date(value).toISOString();
  return `${iso.slice(8, 10)} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}, ${iso.slice(11, 16)} UTC`;
};

const todayIso = () => new Date().toISOString().slice(0, 10);
const currentYear = () => new Date().getFullYear();

const balanceFor = (balances: LeaveBalanceCard[], type: string) =>
  balances.find((item) => String(item.type).toLowerCase() === type.toLowerCase())
  || balances.find((item) => String(item.type).toLowerCase().includes(type.toLowerCase().split(' ')[0]!));

const statusChipClass = (status: string) => {
  const text = status.toLowerCase();
  if (text.includes('lock') || text.includes('block')) return 'bg-[#FEF2F2] text-[#B91C1C] ring-1 ring-[#FECACA]';
  if (text.includes('not eligible') || text.includes('ineligible')) return 'bg-[#FEF2F2] text-[#B91C1C] ring-1 ring-[#FECACA]';
  if (text.includes('eligible') || text.includes('healthy') || text.includes('compliant')) return 'bg-[#ECFDF5] text-[#047857] ring-1 ring-[#A7F3D0]';
  if (text.includes('review') || text.includes('conditional') || text.includes('attention')) return 'bg-[#FFFBEB] text-[#B45309] ring-1 ring-[#FCD34D]';
  return 'bg-[#EFF6FF] text-[#1D4ED8] ring-1 ring-[#93C5FD]';
};

const policyIcon = (type: string): { Icon: LucideIcon; accent: string; bg: string } => {
  const t = type.toLowerCase();
  if (t.includes('annual')) return { Icon: Palmtree, accent: '#10B981', bg: '#ECFDF5' };
  if (t.includes('sick')) return { Icon: Stethoscope, accent: '#2563EB', bg: '#DBEAFE' };
  if (t.includes('casual')) return { Icon: Sun, accent: '#F59E0B', bg: '#FFFBEB' };
  if (t.includes('compassion')) return { Icon: Heart, accent: '#7C3AED', bg: '#F5F3FF' };
  if (t.includes('exam')) return { Icon: GraduationCap, accent: '#06B6D4', bg: '#ECFEFF' };
  if (t.includes('maternity')) return { Icon: Baby, accent: '#F97316', bg: '#FFF7ED' };
  if (t.includes('carry')) return { Icon: CalendarDays, accent: '#2563EB', bg: '#EFF6FF' };
  return { Icon: CalendarCheck, accent: '#10B981', bg: '#ECFDF5' };
};

const kpiIcon = (label: string): { Icon: LucideIcon; accent: string; bg: string } => {
  const t = label.toLowerCase();
  if (t.includes('annual')) return { Icon: Palmtree, accent: '#10B981', bg: '#ECFDF5' };
  if (t.includes('sick')) return { Icon: Stethoscope, accent: '#2563EB', bg: '#DBEAFE' };
  if (t.includes('casual')) return { Icon: Sun, accent: '#F59E0B', bg: '#FFFBEB' };
  if (t.includes('compassion')) return { Icon: Heart, accent: '#7C3AED', bg: '#F5F3FF' };
  if (t.includes('exam')) return { Icon: GraduationCap, accent: '#06B6D4', bg: '#ECFEFF' };
  if (t.includes('maternity')) return { Icon: Baby, accent: '#F97316', bg: '#FFF7ED' };
  if (t.includes('carry')) return { Icon: CalendarDays, accent: '#2563EB', bg: '#EFF6FF' };
  if (t.includes('pending')) return { Icon: Clock, accent: '#F59E0B', bg: '#FFFBEB' };
  if (t.includes('approved')) return { Icon: CalendarCheck, accent: '#10B981', bg: '#ECFDF5' };
  if (t.includes('allowance')) return { Icon: FileText, accent: '#7C3AED', bg: '#F5F3FF' };
  if (t.includes('scheduled')) return { Icon: CalendarDays, accent: '#2563EB', bg: '#DBEAFE' };
  return { Icon: ClipboardList, accent: '#64748B', bg: '#F1F5F9' };
};

function LeaveHeroIllustration() {
  return (
    <div className="relative hidden h-[180px] w-[180px] shrink-0 lg:block">
      <div className="absolute inset-0 rounded-[24px] bg-gradient-to-br from-[#DBEAFE] to-[#EFF6FF] shadow-[0_18px_45px_rgba(15,23,42,0.10)]">
        <div className="absolute left-1/2 top-1/2 h-24 w-20 -translate-x-1/2 -translate-y-1/2 rounded-2xl border-2 border-[#2563EB]/30 bg-white p-2 shadow-lg">
          <div className="mb-2 grid grid-cols-7 gap-0.5">
            {Array.from({ length: 7 }).map((_, index) => (
              <div key={index} className="h-1.5 w-1.5 rounded-full bg-[#2563EB]/20" />
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: 28 }).map((_, index) => (
              <div key={index} className={`h-2 w-2 rounded-sm ${index === 18 ? 'bg-[#10B981]' : index === 25 ? 'bg-[#2563EB]' : 'bg-[#E2E8F0]'}`} />
            ))}
          </div>
        </div>
        <div className="absolute bottom-4 right-4 h-10 w-10 rounded-full bg-[#10B981]/20" />
        <div className="absolute left-4 top-4 h-6 w-6 rounded-lg bg-[#F59E0B]/30" />
      </div>
    </div>
  );
}

function MiniCalendar({ calendar }: { calendar: LeaveCalendarItem[] }) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthLabel = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = now.getDate();

  const approvedDays = new Set<number>();
  const pendingDays = new Set<number>();
  for (const item of calendar) {
    if (!item.from) continue;
    const start = new Date(`${item.from}T00:00:00`);
    const end = new Date(`${item.to || item.from}T00:00:00`);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (d.getMonth() !== month || d.getFullYear() !== year) continue;
      const day = d.getDate();
      if (/approved|completed/i.test(String(item.status))) approvedDays.add(day);
      else pendingDays.add(day);
    }
  }

  const cells: Array<{ day: number | null; kind?: 'today' | 'approved' | 'pending' | 'sun' }> = [];
  for (let index = 0; index < firstDay; index += 1) cells.push({ day: null });
  for (let day = 1; day <= daysInMonth; day += 1) {
    const weekday = new Date(year, month, day).getDay();
    let kind: 'today' | 'approved' | 'pending' | 'sun' | undefined;
    if (day === today) kind = 'today';
    else if (approvedDays.has(day)) kind = 'approved';
    else if (pendingDays.has(day)) kind = 'pending';
    else if (weekday === 0) kind = 'sun';
    cells.push({ day, kind });
  }

  return (
    <EssCard className="p-5">
      <EssSectionHeader title="Leave Calendar" />
      <p className="-mt-2 mb-3 text-[13px] font-semibold text-[#2563EB]">{monthLabel}</p>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-[#94A3B8]">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((label) => (
          <div key={label} className={label === 'Su' ? 'text-[#EF4444]' : ''}>{label}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((cell, index) => (
          <div
            key={`${cell.day}-${index}`}
            className={`flex h-8 items-center justify-center rounded-lg text-[12px] font-semibold ${
              !cell.day
                ? ''
                : cell.kind === 'today'
                  ? 'bg-[#2563EB] text-white ring-2 ring-[#93C5FD]'
                  : cell.kind === 'approved'
                    ? 'bg-[#ECFDF5] text-[#047857]'
                    : cell.kind === 'pending'
                      ? 'bg-[#FFFBEB] text-[#B45309]'
                      : cell.kind === 'sun'
                        ? 'text-[#EF4444]'
                        : 'text-[#475569] hover:bg-[#F8FAFC]'
            }`}
          >
            {cell.day || ''}
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-3 text-[11px] font-medium text-[#64748B]">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#10B981]" /> Approved</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#F59E0B]" /> Pending</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#2563EB]" /> Today</span>
      </div>
    </EssCard>
  );
}

type EssLeaveDashboardViewProps = {
  payload: EssLeavePayload | null;
  initialNow: string;
  activeTab: LeaveWorkspaceTab;
  onTabChange: (tab: LeaveWorkspaceTab) => void;
  onApplyLeave: (leaveType?: string) => void;
  managerMetrics?: {
    teamSize: number;
    pendingApprovals: number;
    onLeave: number;
    missingTimesheets: number;
    teamAttendancePct: number;
    trainingToday: number;
  };
};

export function EssLeaveDashboardView({ payload, initialNow, activeTab, onTabChange, onApplyLeave, managerMetrics }: EssLeaveDashboardViewProps) {
  const employee = payload?.employee;
  const balances = payload?.leave?.balances || [];
  const calendar = payload?.leave?.calendar || [];
  const history = payload?.leave?.history || [];
  const allowance = payload?.leave?.allowance || [];
  const teamPeers = payload?.leave?.relieverOptions || [];

  const approvedThisYear = useMemo(
    () => history.filter((item) => /approved|completed/i.test(String(item.status || '')) && Number(item.year || String(item.from || '').slice(0, 4)) === currentYear()).length,
    [history],
  );

  const nextLeave = calendar.find((item) => item.from && item.from >= todayIso() && /approved/i.test(String(item.status || '')));
  const allowanceRow = allowance.find((item) => /allowance/i.test(String(item.label || '')));
  const confirmed = !String(balances.find((b) => /annual/i.test(String(b.type)))?.eligibilityStatus || '').toLowerCase().includes('lock');

  const onLeaveToday = useMemo(() => {
    const today = todayIso();
    return calendar.filter((item) => item.from && item.to && item.from <= today && item.to >= today && /approved|completed/i.test(String(item.status || ''))).length;
  }, [calendar]);

  const teamTotal = Math.max(teamPeers.length, 1);
  const teamAvailable = Math.max(teamTotal - onLeaveToday, 0);
  const coveragePct = teamTotal ? Math.round((teamAvailable / teamTotal) * 1000) / 10 : 100;

  const kpiRows = [
    { label: 'Annual Leave Balance', value: `${balanceFor(balances, 'Annual Leave')?.balance ?? payload?.widgets?.leave.balance ?? 0} days`, subtitle: 'Current entitlement' },
    { label: 'Sick Leave Balance', value: `${balanceFor(balances, 'Sick Leave')?.balance ?? 0} days`, subtitle: 'Working days' },
    { label: 'Compassionate Balance', value: `${balanceFor(balances, 'Compassionate Leave')?.balance ?? 0} days`, subtitle: 'Working days' },
    { label: 'Exam Leave Balance', value: `${balanceFor(balances, 'Exam Leave')?.balance ?? 0} days`, subtitle: 'Working days' },
    { label: 'Maternity Balance', value: `${balanceFor(balances, 'Maternity Leave')?.balance ?? 0} days`, subtitle: 'Calendar days' },
    { label: 'Carry Forward', value: `${balanceFor(balances, 'Carry Forward Leave')?.balance ?? 0} days`, subtitle: `Expires 31 Mar ${currentYear() + 1}` },
    { label: 'Pending Applications', value: String(payload?.widgets?.requests.pending ?? 0), subtitle: 'Workflow queue' },
    { label: 'Approved This Year', value: String(approvedThisYear), subtitle: 'Approved requests' },
    { label: 'Leave Allowance', value: allowanceRow?.value?.includes('Eligible') ? 'Eligible' : 'Conditional', subtitle: '10+ annual days' },
    { label: 'Next Scheduled Leave', value: nextLeave?.from ? String(nextLeave.from) : '—', subtitle: nextLeave ? String(nextLeave.label || 'Approved schedule') : 'No upcoming leave' },
    { label: 'Return-to-Work Pending', value: '0', subtitle: 'No pending action' },
  ];

  const alerts = [
    {
      title: allowanceRow?.value || 'Annual leave allowance is conditional',
      meta: 'Leave Allowance · Policy',
      status: allowanceRow?.status || 'Review',
      icon: FileText,
      iconBg: '#EFF6FF',
      iconColor: '#2563EB',
    },
    {
      title: Number(balanceFor(balances, 'Carry Forward Leave')?.balance || 0) > 0 ? 'Carry forward leave expires soon' : 'No carry-forward balance to expire',
      meta: 'Carry Forward · Expiry',
      status: 'Info',
      icon: CalendarDays,
      iconBg: '#FFFBEB',
      iconColor: '#F59E0B',
    },
    ...(payload?.notifications || []).slice(0, 2).map((item) => ({
      title: item.title,
      meta: `${item.type} · Notification`,
      status: item.status,
      icon: AlertTriangle,
      iconBg: '#FEF2F2',
      iconColor: '#EF4444',
    })),
  ];

  const timeline = [
    { label: nextLeave ? `${nextLeave.label || 'Scheduled leave'} (${nextLeave.from})` : 'No upcoming leave', tone: nextLeave ? 'blue' : 'muted' },
    { label: 'Return to work', detail: 'No pending return', tone: 'muted' },
    { label: 'Leave year period', detail: `01 Jan – 31 Dec ${currentYear()}`, tone: 'blue' },
    { label: 'Leave allowance status', detail: allowanceRow?.value || 'Not eligible yet', tone: allowanceRow?.value?.includes('Eligible') ? 'green' : 'amber' },
  ];

  return (
    <div className="space-y-5">
      {managerMetrics && (managerMetrics.teamSize > 0 || managerMetrics.pendingApprovals > 0) ? (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <EssCard className="p-4 sm:p-5">
            <EssSectionHeader title="Manager Leave Dashboard" />
            <p className="text-[13px] text-[#64748B]">Team leave oversight for managers within ESS.</p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => onTabChange('Leave Calendar')} className="rounded-[14px] border border-[#E5E7EB] bg-[#F8FAFC] p-4 text-left transition hover:border-[#2563EB]/30 hover:bg-[#EFF6FF]">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">Employees on Leave</p>
                <p className="mt-2 text-[28px] font-bold text-[#0F172A]">{managerMetrics.onLeave}</p>
                <p className="mt-1 text-[12px] text-[#64748B]">{managerMetrics.teamSize} team member{managerMetrics.teamSize === 1 ? '' : 's'}</p>
              </button>
              <button type="button" onClick={() => onTabChange('Approvals')} className="rounded-[14px] border border-[#E5E7EB] bg-[#F8FAFC] p-4 text-left transition hover:border-[#2563EB]/30 hover:bg-[#EFF6FF]">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">Leave Requests</p>
                <p className="mt-2 text-[28px] font-bold text-[#0F172A]">{managerMetrics.pendingApprovals}</p>
                <p className="mt-1 text-[12px] text-[#64748B]">Pending your approval</p>
              </button>
            </div>
          </EssCard>
        </section>
      ) : null}

      {/* Hero */}
      <div className="overflow-hidden rounded-[20px] border border-[#E5E7EB] bg-white shadow-[0_18px_45px_rgba(15,23,42,0.10)]">
        <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-[auto_1fr_320px] lg:items-start">
          <LeaveHeroIllustration />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[#EFF6FF] px-3 py-1 text-[12px] font-semibold text-[#2563EB] ring-1 ring-[#BFDBFE]">Standalone ESS Module</span>
              <span className="rounded-full bg-[#ECFDF5] px-3 py-1 text-[12px] font-semibold text-[#047857] ring-1 ring-[#A7F3D0]">Cloud-ready</span>
              <span className="text-[12px] text-[#94A3B8]">Loaded {stableDateTime(payload?.generatedAt || initialNow)}</span>
            </div>
            <h1 className="mt-4 text-[36px] font-bold leading-tight tracking-tight text-[#0F172A]">Leave Dashboard</h1>
            <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-[#475569]">
              Manage your leave balance, applications, approvals and entitlements. Plan your time off with ease.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button type="button" onClick={() => onApplyLeave()} className="inline-flex h-11 items-center gap-2 rounded-[14px] bg-[#2563EB] px-5 text-[14px] font-semibold text-white shadow-[0_10px_30px_rgba(37,99,235,0.25)] transition hover:bg-[#1D4ED8]">
                Apply Leave
              </button>
              <button type="button" onClick={() => onTabChange('My Applications')} className="inline-flex h-11 items-center gap-2 rounded-[14px] border border-[#E5E7EB] bg-white px-5 text-[14px] font-semibold text-[#0F172A] hover:bg-[#F8FAFC]">
                My Applications
              </button>
              <button type="button" onClick={() => onTabChange('Leave Calendar')} className="inline-flex h-11 items-center gap-2 rounded-[14px] border border-[#E5E7EB] bg-white px-5 text-[14px] font-semibold text-[#0F172A] hover:bg-[#F8FAFC]">
                Leave Calendar
              </button>
            </div>
          </div>

          <EssCard className="p-5">
            {/* Employee identity (photo, name, title) lives in the portal header */}
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              <span className="text-[12px] font-medium text-emerald-600">Online</span>
            </div>
            <h3 className="mt-3 text-[15px] font-bold text-[#0F172A]">Employee Summary</h3>
            <p className="mt-0.5 text-[12px] text-[#94A3B8]">{employee?.department || '—'}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {[
                ['Grade', employee?.salaryGrade],
                ['Location', employee?.location],
                ['Payroll', employee?.payrollGroup],
                ['Status', employee?.status || 'Permanent'],
                ['Confirmed', confirmed ? 'Yes' : 'Pending'],
                ['Leave Year', `${currentYear()}`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-[14px] border border-[#E9EEF5] bg-[#F5F8FC] p-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">{label}</p>
                  <p className={`mt-0.5 truncate text-[12px] font-semibold text-[#0F172A] ${label === 'Confirmed' && value === 'Yes' ? 'text-[#047857]' : ''}`}>{value || '—'}</p>
                </div>
              ))}
            </div>
          </EssCard>
        </div>
      </div>

      {/* Leave tabs */}
      <div className="overflow-x-auto rounded-[20px] border border-[#E5E7EB] bg-white p-2 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
        <div className="flex min-w-max gap-1">
          {leaveTabs.map(({ id, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onTabChange(id)}
              className={`inline-flex h-10 items-center gap-2 rounded-[14px] px-4 text-[13px] font-semibold transition ${
                activeTab === id ? 'bg-[#2563EB] text-white shadow-[0_8px_24px_rgba(37,99,235,0.25)]' : 'text-[#475569] hover:bg-[#F8FAFC]'
              }`}
            >
              <Icon className="h-4 w-4" strokeWidth={2} />
              {id}
            </button>
          ))}
        </div>
      </div>

      {/* Main grid + right sidebar */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          {/* 12 KPI cards */}
          <section>
            <EssSectionHeader title="Leave Overview" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {kpiRows.map((row) => {
                const { Icon, accent, bg } = kpiIcon(row.label);
                return (
                  <EssKpiCard key={row.label} label={row.label} value={row.value} subtitle={row.subtitle} icon={Icon} accent={accent} iconBg={bg} />
                );
              })}
            </div>
          </section>

          {/* Policy cards */}
          <section>
            <EssSectionHeader title="Leave Policy & Entitlements" />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {balances.map((item) => {
                const { Icon, accent, bg } = policyIcon(String(item.type));
                const entitlement = Number(item.entitlement || 0);
                const used = Number(item.used || 0);
                const balance = Number(item.balance || 0);
                const pending = Number(item.pending || 0);
                const utilPct = entitlement > 0 ? Math.round((used / entitlement) * 100) : 0;
                const status = String(item.eligibilityStatus || 'Eligible');

                return (
                  <EssCard key={String(item.id || item.type)} className="flex flex-col p-5 transition-all hover:shadow-[0_24px_60px_rgba(37,99,235,0.12)]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px]" style={{ backgroundColor: bg, color: accent }}>
                          <Icon className="h-6 w-6" strokeWidth={2} />
                        </span>
                        <div>
                          <h4 className="text-[16px] font-bold text-[#0F172A]">{String(item.type)}</h4>
                          <p className="mt-1 text-[13px] leading-snug text-[#64748B]">{String(item.policyNote || 'DLE Enterprise leave policy')}</p>
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusChipClass(status)}`}>{status}</span>
                    </div>

                    <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                      {[
                        ['Entitlement', entitlement],
                        ['Used', used],
                        ['Pending', pending],
                        ['Balance', balance],
                      ].map(([label, val]) => (
                        <div key={String(label)} className="rounded-[14px] border border-[#EDF2F7] bg-[#F8FAFC] p-2.5">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#94A3B8]">{label}</p>
                          <p className="mt-1 text-[18px] font-bold text-[#0F172A]">{val}</p>
                          <p className="text-[10px] text-[#94A3B8]">{String(item.basis || 'days').toLowerCase()}</p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4">
                      <div className="mb-1 flex items-center justify-between text-[12px] font-medium text-[#64748B]">
                        <span>Usage</span>
                        <span>{utilPct}%</span>
                      </div>
                      <EssProgressBar value={utilPct} color={accent} />
                    </div>

                    {item.expiryDate ? <p className="mt-3 text-[12px] font-semibold text-[#B45309]">Expires: {String(item.expiryDate)}</p> : null}
                    {item.allowanceStatus ? <p className="mt-1 text-[12px] font-medium text-[#2563EB]">{String(item.allowanceStatus)}</p> : null}

                    <div className="mt-4 flex flex-wrap gap-2 border-t border-[#EDF2F7] pt-4">
                      <button type="button" onClick={() => onApplyLeave(String(item.type))} className="rounded-[14px] bg-[#2563EB] px-3 py-2 text-[12px] font-semibold text-white hover:bg-[#1D4ED8]">Apply</button>
                      <button type="button" onClick={() => onTabChange('Policy & Entitlement')} className="rounded-[14px] border border-[#E5E7EB] px-3 py-2 text-[12px] font-semibold text-[#475569] hover:bg-[#F8FAFC]">View Policy</button>
                      <button type="button" onClick={() => onTabChange('Leave History')} className="rounded-[14px] border border-[#E5E7EB] px-3 py-2 text-[12px] font-semibold text-[#475569] hover:bg-[#F8FAFC]">History</button>
                    </div>
                  </EssCard>
                );
              })}
            </div>
          </section>

          {/* Team availability */}
          <EssCard className="p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <EssSectionHeader title="Team Availability Impact" />
                <p className="-mt-2 text-[13px] text-[#64748B]">Department coverage based on peers and approved leave today.</p>
              </div>
              <button type="button" onClick={() => onTabChange('Leave Calendar')} className="inline-flex h-10 items-center gap-2 rounded-[14px] border border-[#2563EB] px-4 text-[13px] font-semibold text-[#2563EB] hover:bg-[#EFF6FF]">
                View Team Calendar
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                ['Team Members', teamTotal, '#2563EB', '#EFF6FF'],
                ['On Leave', onLeaveToday, '#F59E0B', '#FFFBEB'],
                ['Available', teamAvailable, '#10B981', '#ECFDF5'],
                ['Coverage', `${coveragePct}%`, '#7C3AED', '#F5F3FF'],
              ].map(([label, value, accent, bg]) => (
                <div key={String(label)} className="rounded-[14px] border border-[#EDF2F7] p-4" style={{ backgroundColor: String(bg) }}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">{label}</p>
                  <p className="mt-1 text-[28px] font-bold" style={{ color: String(accent) }}>{value}</p>
                </div>
              ))}
            </div>
          </EssCard>
        </div>

        {/* Right operations sidebar */}
        <div className="space-y-5">
          <MiniCalendar calendar={calendar} />

          <EssCard className="p-5">
            <EssSectionHeader title="Alerts & Notifications" />
            <div className="space-y-2">
              {alerts.map((item, index) => (
                <EssNotificationItem
                  key={`${item.title}-${index}`}
                  title={item.title}
                  meta={item.meta}
                  status={item.status}
                  icon={item.icon}
                  iconBg={item.iconBg}
                  iconColor={item.iconColor}
                />
              ))}
            </div>
          </EssCard>

          <EssCard className="p-5">
            <EssSectionHeader title="Upcoming & Timeline" />
            <div className="space-y-1">
              {timeline.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className="flex w-full items-center justify-between gap-2 rounded-[14px] px-2 py-3 text-left transition hover:bg-[#F8FAFC]"
                >
                  <div>
                    <p className="text-[14px] font-semibold text-[#0F172A]">{item.label}</p>
                    {'detail' in item && item.detail ? <p className="text-[12px] text-[#94A3B8]">{item.detail}</p> : null}
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[#CBD5E1]" />
                </button>
              ))}
            </div>
          </EssCard>
        </div>
      </div>
    </div>
  );
}
