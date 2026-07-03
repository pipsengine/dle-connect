'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import EmployeeAvatar from '@/components/hris/EmployeeAvatar';
import {
  Award,
  Banknote,
  Bell,
  Bookmark,
  BriefcaseBusiness,
  Building2,
  Cake,
  CalendarCheck,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Clock,
  FileText,
  GraduationCap,
  HelpCircle,
  Landmark,
  Megaphone,
  MessageSquare,
  MoreHorizontal,
  Plane,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Users,
  WalletCards,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { EssAnnouncement, EssEngagementItem } from '@/lib/ess-portal-derived-data';
import {
  EssCard,
  EssEmptyState,
  EssNotificationItem,
  EssProgressBar,
  EssSectionHeader,
} from './ess-portal-ui';
import type { EssTab } from './ess-portal-shell';

type LeaveBalanceRow = { type?: string; balance?: number; entitlement?: number; used?: number };
type ShiftRow = { id?: string; name?: string; start?: string; end?: string; location?: string };

export type EssCommunicationsPayload = {
  generatedAt?: string;
  announcements?: EssAnnouncement[];
  notifications?: Array<{ id: string; title: string; type: string; status: string; createdAt: string; href?: string }>;
  communications?: {
    summary?: {
      announcementCount: number;
      engagementCount: number;
      notificationCount: number;
      unreadCount: number;
      lastUpdated: string;
    };
    engagements?: EssEngagementItem[];
  };
  birthdays?: Array<{ id: string; fullName: string; department: string; date: string }>;
  anniversaries?: Array<{ id: string; fullName: string; years: number; date: string }>;
  events?: Array<{ id: string; label: string; date: string; type: string }>;
  approvalQueue?: Array<{ id: string; employee: string; type: string; days: number; startDate: string; endDate: string; stage: string }>;
  employee?: {
    fullName?: string;
    jobTitle?: string;
    department?: string;
    location?: string;
    manager?: string;
    employeeCode?: string;
    employeeId?: string;
    photoUrl?: string;
    hasPhoto?: boolean;
    email?: string;
    status?: string;
  };
  widgets?: {
    leave: { entitlement: number; used: number; balance: number; pending: number };
    payroll: { monthlyPay: number; currency: string; payslips: number; periodLabel?: string; released?: boolean };
    requests: { pending: number; approved: number; total: number };
  };
  leave?: { balances?: LeaveBalanceRow[]; calendar?: Array<{ label?: string; from?: string; to?: string; status?: string }> };
  attendance?: { shifts?: ShiftRow[]; clockingState?: string };
  payrollAccess?: { currentPeriod?: string; currentPeriodReleased?: boolean; message?: string };
  dashboardAnalytics?: { hrInsights?: { trainingProgress?: { percent: number } } };
};

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

const formatWhen = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    hour12: true,
  });
};

const formatDay = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' });
};

const formatEventDate = (value?: string) => {
  if (!value) return { day: '—', month: '—' };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { day: '—', month: '—' };
  return {
    day: date.toLocaleDateString('en-GB', { day: '2-digit', timeZone: 'UTC' }),
    month: date.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }).toUpperCase(),
  };
};

const firstName = (fullName?: string) => {
  const parts = String(fullName || 'Employee').trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : parts[0];
};

const channelIcon = (channel: string): { icon: LucideIcon; bg: string; color: string } => {
  const text = channel.toLowerCase();
  if (/payroll/i.test(text)) return { icon: Banknote, bg: '#F5F3FF', color: '#7C3AED' };
  if (/hr|leave|people/i.test(text)) return { icon: Users, bg: '#FFF7ED', color: '#EA580C' };
  if (/it|security/i.test(text)) return { icon: ShieldCheck, bg: '#EFF6FF', color: '#2563EB' };
  if (/policy|safety/i.test(text)) return { icon: FileText, bg: '#ECFDF5', color: '#047857' };
  return { icon: Megaphone, bg: '#EFF6FF', color: '#2563EB' };
};

const priorityTone = (priority: string) => {
  if (/high/i.test(priority)) return 'bg-[#FEF2F2] text-[#DC2626] border-[#FECACA]';
  if (/low/i.test(priority)) return 'bg-[#F8FAFC] text-[#64748B] border-[#E2E8F0]';
  return 'bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]';
};

const notificationIcon = (type: string): { icon: LucideIcon; bg: string; color: string } => {
  if (/workflow|approval|leave/i.test(type)) return { icon: ClipboardList, bg: '#F5F3FF', color: '#7C3AED' };
  if (/payroll/i.test(type)) return { icon: Sparkles, bg: '#ECFDF5', color: '#047857' };
  if (/security/i.test(type)) return { icon: ShieldCheck, bg: '#FEF2F2', color: '#DC2626' };
  return { icon: Bell, bg: '#EFF6FF', color: '#2563EB' };
};

function CommMetricCard({
  label,
  icon: Icon,
  accent,
  iconBg,
  primary,
  lines,
  actionLabel,
  onAction,
}: {
  label: string;
  icon: LucideIcon;
  accent: string;
  iconBg: string;
  primary: string;
  lines: string[];
  actionLabel: string;
  onAction?: () => void;
}) {
  return (
    <EssCard className="group flex min-h-[148px] flex-col justify-between p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(15,23,42,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold text-[#64748B]">{label}</p>
          <p className="mt-1 text-[28px] font-bold leading-none tracking-tight text-[#0F172A]">{primary}</p>
        </div>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]" style={{ backgroundColor: iconBg, color: accent }}>
          <Icon className="h-5 w-5" strokeWidth={2} />
        </span>
      </div>
      <div className="mt-3 space-y-0.5">
        {lines.map((line) => (
          <p key={line} className="text-[11px] font-medium text-[#64748B]">{line}</p>
        ))}
      </div>
      <button
        type="button"
        onClick={onAction}
        className="mt-3 inline-flex items-center gap-1 text-[12px] font-bold text-[#2563EB] transition group-hover:gap-2"
      >
        {actionLabel}
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </EssCard>
  );
}

function TabBar({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (tab: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-[#E9EEF5] px-1 pb-0">
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onChange(tab)}
          className={`rounded-t-[10px] px-3 py-2 text-[12px] font-bold transition ${
            active === tab
              ? 'border border-b-white border-[#E2E8F0] bg-white text-[#2563EB] -mb-px'
              : 'text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A]'
          }`}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

export function EssCommunicationsView({
  payload,
  onNavigate,
}: {
  payload: EssCommunicationsPayload | null;
  onNavigate?: (tab: string, options?: { leaveSection?: string }) => void;
}) {
  const [announcementTab, setAnnouncementTab] = useState('All');
  const [notificationTab, setNotificationTab] = useState('All');
  const [notificationQuery, setNotificationQuery] = useState('');

  const announcements = payload?.announcements || [];
  const engagements = payload?.communications?.engagements || [];
  const notifications = payload?.notifications || [];
  const summary = payload?.communications?.summary;
  const birthdays = payload?.birthdays || [];
  const anniversaries = payload?.anniversaries || [];
  const events = payload?.events || [];
  const employee = payload?.employee;
  const widgets = payload?.widgets;
  const leaveBalances = payload?.leave?.balances || [];
  const shifts = payload?.attendance?.shifts || [];
  const pendingApprovals = payload?.approvalQueue?.length ?? widgets?.requests.pending ?? 0;
  const unreadCount = summary?.unreadCount ?? notifications.filter((item) => /unread/i.test(item.status)).length;
  const highPriorityAnnouncements = announcements.filter((item) => /high/i.test(item.priority)).length;
  const surveyEngagements = engagements.filter((item) => /survey/i.test(item.type));
  const policyEngagements = engagements.filter((item) => /policy/i.test(item.type));
  const upcomingSurvey = surveyEngagements.find((item) => /open|pending|due/i.test(item.status));

  const filteredAnnouncements = useMemo(() => {
    if (announcementTab === 'All') return announcements;
    if (announcementTab === 'Unread') return announcements.filter((item) => /high/i.test(item.priority));
    return announcements.filter((item) => {
      const channel = item.channel.toLowerCase();
      if (announcementTab === 'Payroll') return /payroll/i.test(channel);
      if (announcementTab === 'HR') return /hr|leave|people|anniversary/i.test(channel);
      if (announcementTab === 'IT') return /it|security|workflow/i.test(channel);
      if (announcementTab === 'Policy') return /policy/i.test(channel);
      if (announcementTab === 'Safety') return /safety|payroll/i.test(channel);
      return true;
    });
  }, [announcementTab, announcements]);

  const filteredNotifications = useMemo(() => {
    let rows = notifications;
    if (notificationTab === 'Unread') rows = rows.filter((item) => /unread/i.test(item.status));
    if (notificationTab === 'Important') rows = rows.filter((item) => /workflow|approval|security|payroll/i.test(`${item.type} ${item.title}`));
    const needle = notificationQuery.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((item) => [item.title, item.type, item.status].join(' ').toLowerCase().includes(needle));
  }, [notificationQuery, notificationTab, notifications]);

  const scheduleItems = useMemo(() => {
    const items: Array<{ time: string; title: string; location: string; tone: string }> = [];
    for (const shift of shifts.slice(0, 1)) {
      items.push({
        time: `${shift.start || '09:00'} – ${shift.end || '18:00'}`,
        title: shift.name || 'Scheduled Shift',
        location: shift.location || employee?.location || 'Office',
        tone: 'border-[#BFDBFE] bg-[#EFF6FF]',
      });
    }
    for (const event of events.slice(0, 3)) {
      items.push({
        time: formatDay(event.date),
        title: event.label,
        location: event.type,
        tone: /payroll/i.test(event.type) ? 'border-[#DDD6FE] bg-[#F5F3FF]' : 'border-[#E9EEF5] bg-[#F8FAFC]',
      });
    }
    for (const approval of (payload?.approvalQueue || []).slice(0, 2)) {
      items.push({
        time: approval.startDate ? formatDay(approval.startDate) : 'Pending',
        title: `${approval.type} — ${approval.employee}`,
        location: approval.stage,
        tone: 'border-[#FDE68A] bg-[#FFFBEB]',
      });
    }
    return items;
  }, [employee?.location, events, payload?.approvalQueue, shifts]);

  const upcomingEvents = useMemo(() => {
    const merged = [
      ...events.map((item) => ({ id: item.id, title: item.label, date: item.date, type: item.type, accent: '#2563EB' })),
      ...birthdays.map((item) => ({ id: item.id, title: `${item.fullName} — Birthday`, date: item.date, type: 'Birthday', accent: '#DB2777' })),
      ...anniversaries.map((item) => ({ id: item.id, title: `${item.fullName} — ${item.years}yr Anniversary`, date: item.date, type: 'Anniversary', accent: '#B45309' })),
    ];
    return merged.sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(0, 6);
  }, [anniversaries, birthdays, events]);

  const leaveRows = useMemo(() => {
    if (leaveBalances.length) {
      return leaveBalances
        .filter((row) => Number(row.balance ?? row.entitlement ?? 0) > 0 || /annual|sick|casual|compassion/i.test(String(row.type)))
        .slice(0, 4)
        .map((row) => {
          const entitlement = Math.max(1, Number(row.entitlement ?? row.balance ?? 0));
          const balance = Number(row.balance ?? 0);
          const used = Number(row.used ?? Math.max(0, entitlement - balance));
          const pct = entitlement > 0 ? Math.round((balance / entitlement) * 100) : 0;
          return {
            label: String(row.type || 'Leave'),
            balance,
            pct,
            color: /sick/i.test(String(row.type)) ? '#F59E0B' : /casual/i.test(String(row.type)) ? '#2563EB' : '#10B981',
            detail: `${used} used · ${balance} available`,
          };
        });
    }
    return [
      { label: 'Annual Leave', balance: widgets?.leave.balance ?? 0, pct: widgets?.leave.entitlement ? Math.round(((widgets.leave.balance) / widgets.leave.entitlement) * 100) : 0, color: '#10B981', detail: `${widgets?.leave.used ?? 0} used · ${widgets?.leave.balance ?? 0} available` },
      { label: 'Pending Requests', balance: widgets?.leave.pending ?? 0, pct: 0, color: '#F59E0B', detail: `${widgets?.leave.pending ?? 0} awaiting approval` },
    ];
  }, [leaveBalances, widgets?.leave]);

  const navigate = (tab: string, options?: { leaveSection?: string }) => onNavigate?.(tab, options);

  if (!payload) {
    return (
      <div className="space-y-5">
        <div className="h-36 animate-pulse rounded-[20px] bg-[#E2E8F0]" />
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <div key={item} className="h-36 animate-pulse rounded-[20px] bg-[#F1F5F9]" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-80 animate-pulse rounded-[20px] bg-[#F1F5F9]" />
          ))}
        </div>
      </div>
    );
  }

  const payrollLabel = payload.payrollAccess?.currentPeriod || widgets?.payroll.periodLabel || 'Current period';
  const payrollReleased = payload.payrollAccess?.currentPeriodReleased ?? widgets?.payroll.released;

  return (
    <div className="space-y-6">
      {/* Employee summary banner */}
      <EssCard className="overflow-hidden">
        <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between lg:p-6">
          <div className="flex items-center gap-4">
            <EmployeeAvatar
              fullName={employee?.fullName || 'Employee'}
              employeeId={employee?.employeeCode || employee?.employeeId}
              photoUrl={employee?.photoUrl}
              hasPhoto={employee?.hasPhoto}
              size="lg"
              tryPhoto
            />
            <div>
              <h2 className="text-[22px] font-bold tracking-tight text-[#0F172A]">
                {greeting()}, {firstName(employee?.fullName)}! <span aria-hidden>👋</span>
              </h2>
              <p className="mt-1 text-[13px] text-[#64748B]">
                You have <span className="font-bold text-[#2563EB]">{unreadCount} unread notifications</span>
                {' '}and <span className="font-bold text-[#B45309]">{pendingApprovals} pending tasks</span>.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 border-t border-[#E9EEF5] pt-4 sm:grid-cols-4 lg:border-t-0 lg:pt-0">
            {[
              { label: 'Last Login', value: formatWhen(payload.generatedAt) },
              { label: 'Department', value: employee?.department || '—' },
              { label: 'Location', value: employee?.location || '—' },
              { label: 'Current Shift', value: shifts[0] ? `${shifts[0].start || '09:00'} – ${shifts[0].end || '18:00'}` : 'Standard hours' },
            ].map((item) => (
              <div key={item.label} className="min-w-[120px] border-l border-[#E9EEF5] pl-4 first:border-l-0 first:pl-0">
                <p className="text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">{item.label}</p>
                <p className="mt-1 text-[13px] font-semibold text-[#0F172A]">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </EssCard>

      {/* KPI strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <CommMetricCard
          label="Announcements"
          icon={Megaphone}
          accent="#2563EB"
          iconBg="#EFF6FF"
          primary={String(summary?.announcementCount ?? announcements.length)}
          lines={[`${highPriorityAnnouncements} high priority`, `${announcements.length} total`]}
          actionLabel="View all"
          onAction={() => setAnnouncementTab('All')}
        />
        <CommMetricCard
          label="Surveys"
          icon={ClipboardList}
          accent="#7C3AED"
          iconBg="#F5F3FF"
          primary={String(surveyEngagements.length)}
          lines={[`${surveyEngagements.filter((item) => /open|due/i.test(item.status)).length} active`, `${policyEngagements.length} policy items`]}
          actionLabel="View all"
        />
        <CommMetricCard
          label="Notifications"
          icon={Bell}
          accent="#0891B2"
          iconBg="#ECFEFF"
          primary={String(summary?.notificationCount ?? notifications.length)}
          lines={[`${unreadCount} unread`, `${notifications.length} total`]}
          actionLabel="View all"
          onAction={() => setNotificationTab('Unread')}
        />
        <CommMetricCard
          label="Pending Approvals"
          icon={Clock}
          accent="#B45309"
          iconBg="#FFFBEB"
          primary={String(pendingApprovals)}
          lines={[`${widgets?.requests.pending ?? 0} service requests`, 'Workflow queue']}
          actionLabel="View all"
          onAction={() => navigate('workflow')}
        />
        <CommMetricCard
          label="Upcoming Leave"
          icon={CalendarCheck}
          accent="#047857"
          iconBg="#ECFDF5"
          primary={`${widgets?.leave.balance ?? 0} days`}
          lines={[`${widgets?.leave.pending ?? 0} pending`, `Balance available`]}
          actionLabel="View calendar"
          onAction={() => navigate('leave')}
        />
        <CommMetricCard
          label="Payroll Status"
          icon={Banknote}
          accent="#7C3AED"
          iconBg="#F5F3FF"
          primary={payrollLabel}
          lines={[payrollReleased ? 'Released' : 'In progress', widgets?.payroll.payslips ? `${widgets.payroll.payslips} payslip(s)` : 'Self-service']}
          actionLabel="View payslip"
          onAction={() => navigate('payroll')}
        />
      </div>

      {/* Main communication panels */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* Announcements — wider */}
        <EssCard className="overflow-hidden xl:col-span-5">
          <div className="border-b border-[#E9EEF5] px-5 py-4">
            <EssSectionHeader title="Announcements & Circulars" action={<button type="button" className="text-[12px] font-bold text-[#2563EB]">View all</button>} />
          </div>
          <TabBar tabs={['All', 'Unread', 'Payroll', 'HR', 'IT', 'Policy', 'Safety']} active={announcementTab} onChange={setAnnouncementTab} />
          <div className="max-h-[520px] space-y-2 overflow-auto p-4">
            {filteredAnnouncements.length ? (
              filteredAnnouncements.map((item) => {
                const visual = channelIcon(item.channel);
                const Icon = visual.icon;
                return (
                  <article key={item.id} className="flex items-start gap-3 rounded-[14px] border border-[#E9EEF5] bg-white p-3 transition hover:border-[#CBD5E1] hover:shadow-sm">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]" style={{ backgroundColor: visual.bg, color: visual.color }}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[14px] font-bold leading-snug text-[#0F172A]">{item.title}</p>
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${priorityTone(item.priority)}`}>
                          {item.priority}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-[#64748B]">{item.channel} · {formatWhen(item.publishedAt)}</p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <button type="button" className="rounded-lg p-1 text-[#94A3B8] hover:bg-[#F8FAFC] hover:text-[#2563EB]" aria-label="Bookmark">
                        <Bookmark className="h-4 w-4" />
                      </button>
                      <button type="button" className="rounded-lg p-1 text-[#94A3B8] hover:bg-[#F8FAFC]" aria-label="More actions">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </div>
                  </article>
                );
              })
            ) : (
              <EssEmptyState icon={Megaphone} title="No announcements" description="Company circulars and notices will appear here when available." />
            )}
          </div>
        </EssCard>

        {/* Surveys & engagement */}
        <EssCard className="overflow-hidden xl:col-span-4">
          <div className="border-b border-[#E9EEF5] px-5 py-4">
            <EssSectionHeader title="Surveys, Feedback & Policy Updates" />
          </div>
          <div className="space-y-4 p-4">
            {upcomingSurvey ? (
              <div className="rounded-[16px] border border-[#DDD6FE] bg-gradient-to-br from-[#F5F3FF] to-[#EFF6FF] p-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-[#7C3AED]">Upcoming Survey</p>
                <p className="mt-2 text-[15px] font-bold text-[#0F172A]">{upcomingSurvey.title}</p>
                <p className="mt-1 text-[12px] text-[#64748B]">
                  {upcomingSurvey.dueAt ? `Updated ${formatDay(upcomingSurvey.dueAt)}` : 'Open for participation'}
                </p>
                {upcomingSurvey.actionHref ? (
                  <Link href={upcomingSurvey.actionHref} className="mt-3 inline-flex h-9 items-center rounded-[10px] bg-[#7C3AED] px-4 text-[12px] font-bold text-white hover:bg-[#6D28D9]">
                    Preview Survey
                  </Link>
                ) : null}
              </div>
            ) : (
              <div className="rounded-[16px] border border-dashed border-[#E2E8F0] bg-[#F8FAFC] px-4 py-6 text-center">
                <ClipboardList className="mx-auto h-8 w-8 text-[#94A3B8]" />
                <p className="mt-2 text-[13px] font-bold text-[#0F172A]">No active surveys</p>
                <p className="mt-1 text-[11px] text-[#64748B]">Engagement surveys will appear when HR publishes them.</p>
              </div>
            )}
            <div>
              <p className="mb-2 text-[12px] font-bold text-[#0F172A]">Recent Policy Updates</p>
              <div className="space-y-2">
                {policyEngagements.length ? (
                  policyEngagements.slice(0, 4).map((item) => (
                    <Link
                      key={item.id}
                      href={item.actionHref || '/workforce-portal?tab=documents'}
                      className="flex items-center justify-between rounded-[12px] border border-[#E9EEF5] bg-[#FCFDFF] px-3 py-2.5 transition hover:bg-white"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-[#0F172A]">{item.title}</p>
                        <p className="text-[10px] text-[#94A3B8]">{item.status}</p>
                      </div>
                      {/due|pending|open/i.test(item.status) ? (
                        <span className="shrink-0 rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[10px] font-bold text-[#B45309]">New</span>
                      ) : null}
                    </Link>
                  ))
                ) : engagements.length ? (
                  engagements.slice(0, 4).map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-[12px] border border-[#E9EEF5] bg-[#FCFDFF] px-3 py-2.5">
                      <p className="truncate text-[13px] font-semibold text-[#0F172A]">{item.title}</p>
                      <span className="text-[10px] font-bold text-[#64748B]">{item.type}</span>
                    </div>
                  ))
                ) : (
                  <p className="rounded-[12px] border border-dashed border-[#E2E8F0] bg-[#F8FAFC] px-3 py-4 text-center text-[11px] text-[#94A3B8]">No policy updates on file.</p>
                )}
              </div>
            </div>
          </div>
        </EssCard>

        {/* Notifications */}
        <EssCard className="overflow-hidden xl:col-span-3">
          <div className="border-b border-[#E9EEF5] px-5 py-4">
            <EssSectionHeader
              title="System Notifications"
              action={<button type="button" className="text-[12px] font-bold text-[#2563EB]">Mark all read</button>}
            />
          </div>
          <TabBar tabs={['All', 'Unread', 'Important']} active={notificationTab} onChange={setNotificationTab} />
          <div className="border-b border-[#E9EEF5] px-4 py-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
              <input
                value={notificationQuery}
                onChange={(event) => setNotificationQuery(event.target.value)}
                placeholder="Filter notifications..."
                className="h-9 w-full rounded-[10px] border border-[#E2E8F0] bg-white pl-9 pr-9 text-[13px] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15"
                aria-label="Filter notifications"
              />
              {notificationQuery ? (
                <button type="button" onClick={() => setNotificationQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" aria-label="Clear">
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>
          <div className="max-h-[440px] space-y-2 overflow-auto p-4">
            {filteredNotifications.length ? (
              filteredNotifications.map((item) => {
                const visual = notificationIcon(item.type);
                const href = item.href;
                return (
                  <EssNotificationItem
                    key={item.id}
                    compact
                    title={item.title}
                    meta={`${item.type} · ${formatWhen(item.createdAt)}`}
                    status={item.status}
                    icon={visual.icon}
                    iconBg={visual.bg}
                    iconColor={visual.color}
                    onClick={
                      href
                        ? () => {
                            if (href.startsWith('/workforce-portal?tab=')) {
                              const tab = new URL(href, 'http://local').searchParams.get('tab') as EssTab | null;
                              const leaveSection = new URL(href, 'http://local').searchParams.get('leaveSection') || undefined;
                              if (tab && onNavigate) {
                                onNavigate(tab, leaveSection ? { leaveSection } : undefined);
                                return;
                              }
                            }
                            window.location.href = href;
                          }
                        : undefined
                    }
                  />
                );
              })
            ) : (
              <EssEmptyState icon={Bell} title="No notifications" description="System alerts will appear here." />
            )}
          </div>
        </EssCard>
      </div>

      {/* Bottom widgets */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        <EssCard className="p-4">
          <EssSectionHeader
            title="Today's Schedule"
            action={<button type="button" onClick={() => navigate('time')} className="text-[12px] font-bold text-[#2563EB]">View calendar</button>}
          />
          <div className="mt-4 space-y-3">
            {scheduleItems.length ? (
              scheduleItems.map((item, index) => (
                <div key={`${item.title}-${index}`} className={`rounded-[12px] border-l-4 p-3 ${item.tone}`}>
                  <p className="text-[11px] font-bold text-[#64748B]">{item.time}</p>
                  <p className="mt-1 text-[13px] font-bold text-[#0F172A]">{item.title}</p>
                  <p className="mt-0.5 text-[11px] text-[#94A3B8]">{item.location}</p>
                </div>
              ))
            ) : (
              <EssEmptyState icon={CalendarDays} title="No schedule items" description="Shifts and calendar events will appear here." />
            )}
          </div>
        </EssCard>

        <EssCard className="p-4">
          <EssSectionHeader title="My Leave Balance" action={<button type="button" onClick={() => navigate('leave')} className="text-[12px] font-bold text-[#2563EB]">Apply leave</button>} />
          <div className="mt-4 space-y-4">
            {leaveRows.map((row) => (
              <div key={row.label}>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold text-[#0F172A]">{row.label}</p>
                  <p className="text-[12px] font-bold text-[#0F172A]">{row.balance} days</p>
                </div>
                <EssProgressBar value={row.pct} color={row.color} />
                <p className="mt-1 text-[10px] text-[#94A3B8]">{row.detail}</p>
              </div>
            ))}
          </div>
        </EssCard>

        <EssCard className="p-4">
          <EssSectionHeader title="Upcoming Events" />
          <div className="mt-4 space-y-2">
            {upcomingEvents.length ? (
              upcomingEvents.map((item) => {
                const dateParts = formatEventDate(item.date);
                return (
                  <div key={item.id} className="flex items-center gap-3 rounded-[12px] border border-[#E9EEF5] bg-[#FCFDFF] p-2.5">
                    <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-[10px] text-white" style={{ backgroundColor: item.accent }}>
                      <span className="text-[11px] font-bold leading-none">{dateParts.month}</span>
                      <span className="text-[16px] font-bold leading-none">{dateParts.day}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-bold text-[#0F172A]">{item.title}</p>
                      <p className="text-[10px] font-medium text-[#94A3B8]">{item.type}</p>
                    </div>
                  </div>
                );
              })
            ) : (
              <EssEmptyState icon={CalendarDays} title="No upcoming events" description="HR calendar events will appear here." />
            )}
          </div>
        </EssCard>

        <EssCard className="p-4">
          <EssSectionHeader title="Quick Links & Feedback" />
          <div className="mt-4 grid grid-cols-2 gap-2">
            {[
              { label: 'HR Policy', icon: FileText, tab: 'documents' },
              { label: 'Org Chart', icon: Building2, href: '/hris/organization' },
              { label: 'Training', icon: GraduationCap, tab: 'learning' },
              { label: 'Help & Support', icon: HelpCircle, tab: 'services' },
              { label: 'Leave Portal', icon: CalendarCheck, tab: 'leave' },
              { label: 'Payroll', icon: Banknote, tab: 'payroll' },
              { label: 'Assets', icon: BriefcaseBusiness, tab: 'assets' },
              { label: 'Workflow', icon: Target, tab: 'workflow' },
            ].map((item) => {
              const Icon = item.icon;
              const content = (
                <span className="flex flex-col items-center gap-2 rounded-[12px] border border-[#E9EEF5] bg-[#F8FAFC] px-2 py-3 text-center transition hover:border-[#BFDBFE] hover:bg-[#EFF6FF]">
                  <Icon className="h-5 w-5 text-[#2563EB]" />
                  <span className="text-[11px] font-bold text-[#0F172A]">{item.label}</span>
                </span>
              );
              if (item.href) {
                return (
                  <Link key={item.label} href={item.href}>
                    {content}
                  </Link>
                );
              }
              return (
                <button key={item.label} type="button" onClick={() => item.tab && navigate(item.tab)} className="text-left">
                  {content}
                </button>
              );
            })}
          </div>
          <div className="mt-4 rounded-[14px] border border-[#BFDBFE] bg-gradient-to-br from-[#EFF6FF] to-[#F5F3FF] p-4 text-center">
            <Star className="mx-auto h-6 w-6 text-[#F59E0B]" />
            <p className="mt-2 text-[13px] font-bold text-[#0F172A]">We value your feedback!</p>
            <p className="mt-1 text-[11px] text-[#64748B]">Help us improve the employee experience.</p>
            <button
              type="button"
              onClick={() => navigate('services')}
              className="mt-3 inline-flex h-9 items-center rounded-[10px] bg-[#2563EB] px-4 text-[12px] font-bold text-white hover:bg-[#1D4ED8]"
            >
              Give Feedback
            </button>
          </div>
        </EssCard>
      </div>
    </div>
  );
}
