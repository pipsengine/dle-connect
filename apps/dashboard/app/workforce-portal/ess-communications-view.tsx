'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  BookOpen,
  Building2,
  Cake,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  FileText,
  Gift,
  HandCoins,
  Mail,
  Plus,
  ShieldCheck,
  Sparkles,
  Trophy,
  Workflow,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import EmployeeAvatar from '@/components/hris/EmployeeAvatar';
import type { EssAnnouncement, EssEngagementItem } from '@/lib/ess-portal-derived-data';
import type { EssTab } from './ess-portal-shell';

type LeaveBalanceRow = { type?: string; balance?: number; entitlement?: number; used?: number; leaveType?: string };

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
  events?: Array<{ id: string; label: string; date: string; type: string }>;
  birthdays?: Array<{ id: string; fullName: string; department: string; date: string; employeeId?: string; employeeCode?: string; hasPhoto?: boolean }>;
  anniversaries?: Array<{ id: string; fullName: string; years: number; date: string; department?: string; employeeId?: string; employeeCode?: string; hasPhoto?: boolean }>;
  approvalQueue?: Array<{ id: string; employee: string; type: string; days: number; startDate: string; endDate: string; stage: string }>;
  documents?: Array<{ id: string; title: string; category: string; version: string; status: string; sizeBytes?: number; acknowledgement?: string }>;
  requests?: Array<{ id: string; category: string; title: string; status: string; submittedAt: string; updatedAt?: string }>;
  employee?: {
    fullName?: string;
    jobTitle?: string;
    department?: string;
    location?: string;
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
  leave?: { balances?: LeaveBalanceRow[] };
  attendance?: { shifts?: Array<{ name?: string; start?: string; end?: string; location?: string }> };
};

const TABS = [
  'Overview',
  'News Feed',
  'Circulars & Policies',
  'Surveys & Polls',
  'Events',
  'Recognition',
  'Knowledge Base',
  'My Activity',
] as const;

type HubTab = (typeof TABS)[number];

const FILTERS = ['All', 'Unread', 'News', 'HR', 'IT', 'Policy', 'Events', 'Executive'] as const;

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

const firstName = (fullName?: string) => {
  const parts = String(fullName || 'Employee').trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[parts.length - 1] : parts[0] || 'Employee').toUpperCase();
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
    hour12: true,
  });
};

const formatShortDate = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const daysUntil = (value?: string) => {
  if (!value) return null;
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
};

const untilLabel = (value?: string) => {
  const days = daysUntil(value);
  if (days == null) return 'Upcoming';
  if (days < 0) return 'Past';
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
};

const formatBytes = (bytes?: number) => {
  if (!bytes || bytes <= 0) return 'Document';
  if (bytes < 1024 * 1024) return `PDF · ${(bytes / 1024).toFixed(0)} KB`;
  return `PDF · ${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const dateParts = (value?: string) => {
  if (!value) return { month: '—', day: '—' };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { month: '—', day: '—' };
  return {
    month: date.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase(),
    day: date.toLocaleDateString('en-GB', { day: '2-digit' }),
  };
};

const channelMeta = (channel: string): { label: string; category: string; icon: LucideIcon; tone: string } => {
  const text = channel.toLowerCase();
  if (/executive|ceo|md/i.test(text)) return { label: 'Executive Message', category: 'Executive', icon: Sparkles, tone: 'bg-[#EEF5FF] text-[#1769F7]' };
  if (/hr|leave|people|anniversary|birthday/i.test(text)) return { label: 'HR Update', category: 'HR', icon: FileText, tone: 'bg-[#ECFBF5] text-[#13A773]' };
  if (/it|security/i.test(text)) return { label: 'IT Security Notice', category: 'IT', icon: ShieldCheck, tone: 'bg-[#F5F1FF] text-[#7F4CE0]' };
  if (/event|town hall|holiday|training|cut-off|payroll/i.test(text)) return { label: 'Event', category: 'Events', icon: CalendarDays, tone: 'bg-[#ECFBF5] text-[#16A473]' };
  if (/policy|handbook|conduct|circular/i.test(text)) return { label: 'Circular / Policy', category: 'Policy', icon: BookOpen, tone: 'bg-[#ECFBF5] text-[#14A273]' };
  return { label: 'Company News', category: 'News', icon: Building2, tone: 'bg-[#F0F2F7] text-[#60718C]' };
};

const eventTone = (index: number) => ['bg-[#1E6AF5]', 'bg-[#9461EF]', 'bg-[#19A66A]', 'bg-[#FB8424]'][index % 4];
const resourceTone = (index: number) =>
  ['bg-[#FFF0F3] text-[#EC4C6D]', 'bg-[#EEF5FF] text-[#2E6FF0]', 'bg-[#ECFBF7] text-[#13A385]', 'bg-[#FFF1F4] text-[#EB516C]', 'bg-[#F4EEFF] text-[#8A4FE3]'][index % 5];

function EmptyPanel({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[#D7E0EC] bg-[#F8FAFC] px-4 py-10 text-center">
      <p className="text-sm font-bold text-[#15213A]">{title}</p>
      <p className="mt-1 text-xs font-semibold text-[#66748E]">{detail}</p>
    </div>
  );
}

function PanelCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: { label: string; onClick: () => void };
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-[#E3E9F2] bg-white shadow-[0_1px_2px_rgba(16,42,86,0.04),0_8px_22px_rgba(16,42,86,0.05)]">
      <div className="flex items-center justify-between gap-3 border-b border-[#EFF3F8] px-4 py-3">
        <h3 className="text-sm font-bold text-[#15213A]">{title}</h3>
        {action ? (
          <button type="button" onClick={action.onClick} className="text-[10px] font-bold text-[#1769F7]">
            {action.label}
          </button>
        ) : null}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function EssCommunicationsView({
  payload,
  onNavigate,
}: {
  payload: EssCommunicationsPayload | null;
  onNavigate?: (tab: EssTab | string, options?: { leaveSection?: string }) => void;
}) {
  const [activeTab, setActiveTab] = useState<HubTab>('Overview');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [feedLimit, setFeedLimit] = useState(6);
  const [ackDismissed, setAckDismissed] = useState(false);
  const [showAckToast, setShowAckToast] = useState(false);

  const employee = payload?.employee;
  const announcements = payload?.announcements || [];
  const notifications = payload?.notifications || [];
  const engagements = payload?.communications?.engagements || [];
  const documents = payload?.documents || [];
  const events = payload?.events || [];
  const birthdays = payload?.birthdays || [];
  const anniversaries = payload?.anniversaries || [];
  const requests = payload?.requests || [];
  const widgets = payload?.widgets;
  const shifts = payload?.attendance?.shifts || [];
  const leaveBalances = payload?.leave?.balances || [];

  const feedItems = useMemo(() => {
    const fromAnnouncements = announcements.map((item) => {
      const meta = channelMeta(item.channel);
      return {
        id: item.id,
        type: meta.label,
        title: item.title,
        from: item.channel || 'Corporate Communications',
        date: formatWhen(item.publishedAt),
        rawDate: item.publishedAt,
        category: meta.category,
        unread: !readIds.has(item.id) && /high/i.test(item.priority),
        icon: meta.icon,
        tone: meta.tone,
      };
    });
    if (fromAnnouncements.length) return fromAnnouncements;
    return notifications.map((item) => {
      const meta = channelMeta(`${item.type} ${item.title}`);
      return {
        id: item.id,
        type: meta.label,
        title: item.title,
        from: item.type || 'System',
        date: formatWhen(item.createdAt),
        rawDate: item.createdAt,
        category: meta.category,
        unread: !readIds.has(item.id) && /unread/i.test(item.status),
        icon: meta.icon,
        tone: meta.tone,
      };
    });
  }, [announcements, notifications, readIds]);

  const filteredFeed = useMemo(() => {
    let rows = feedItems;
    if (activeTab === 'News Feed') rows = rows.filter((item) => /News|Executive|HR|IT/i.test(item.category));
    if (activeTab === 'Circulars & Policies') rows = rows.filter((item) => /Policy|HR|Circular/i.test(item.category));
    if (filter === 'Unread') return rows.filter((item) => item.unread);
    if (filter !== 'All' && (activeTab === 'Overview' || activeTab === 'News Feed')) {
      if (filter === 'News') return rows.filter((item) => /News|Executive/i.test(item.category));
      return rows.filter((item) => item.category === filter);
    }
    return rows;
  }, [activeTab, feedItems, filter]);

  const surveys = engagements.filter((item) => /survey|poll|feedback|pulse/i.test(`${item.type} ${item.title}`));
  const policies = engagements.filter((item) => /policy/i.test(item.type));
  const policiesDue = policies.filter((item) => /acknowledgement due|pending|open/i.test(item.status));
  const unreadCount = feedItems.filter((item) => item.unread).length
    || notifications.filter((item) => /unread/i.test(item.status)).length;
  const pendingActions = payload?.approvalQueue?.length ?? widgets?.requests.pending ?? 0;

  const leaveRows = useMemo(() => {
    const source = leaveBalances.length
      ? leaveBalances
      : widgets?.leave
        ? [{
            type: 'Annual Leave',
            leaveType: 'Annual Leave',
            entitlement: widgets.leave.entitlement,
            used: widgets.leave.used,
            balance: widgets.leave.balance,
          }]
        : [];

    return source.slice(0, 4).map((row, index) => {
      const label = String(row.type || row.leaveType || 'Leave');
      const entitlement = Math.max(0, Number(row.entitlement ?? 0));
      const balance = Math.max(0, Number(row.balance ?? 0));
      const used = Math.max(0, Number(row.used ?? Math.max(0, entitlement - balance)));
      const basis = entitlement || Math.max(balance + used, 1);
      const pct = Math.min(100, Math.round((balance / basis) * 100));
      return {
        label,
        value: entitlement ? `${entitlement} days` : `${balance} days`,
        detail: `${used} used · ${balance} available`,
        pct,
        bar: index === 1 ? 'from-[#FF9F1A] to-[#F59E0B]' : index === 3 ? 'from-[#9E68F6] to-[#8B5CF6]' : 'from-[#0BBF88] to-[#28C982]',
      };
    });
  }, [leaveBalances, widgets?.leave]);

  const upcomingEvents = useMemo(
    () =>
      events
        .map((item) => {
          const parts = dateParts(item.date);
          return {
            id: item.id,
            title: item.label,
            type: item.type,
            date: item.date,
            month: parts.month,
            day: parts.day,
            until: untilLabel(item.date),
          };
        })
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
        .slice(0, activeTab === 'Events' ? 12 : 4),
    [activeTab, events],
  );

  const birthdayCards = useMemo(
    () =>
      birthdays
        .map((item) => ({ ...item, until: untilLabel(item.date), ...dateParts(item.date) }))
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
        .slice(0, activeTab === 'Recognition' || activeTab === 'Events' ? 10 : 5),
    [activeTab, birthdays],
  );

  const anniversaryCards = useMemo(
    () =>
      anniversaries
        .map((item) => ({ ...item, until: untilLabel(item.date), ...dateParts(item.date) }))
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
        .slice(0, activeTab === 'Recognition' || activeTab === 'Events' ? 10 : 5),
    [activeTab, anniversaries],
  );

  const celebrationTimeline = useMemo(() => {
    const rows: Array<{
      id: string;
      title: string;
      subtitle: string;
      date: string;
      until: string;
      month: string;
      day: string;
      kind: 'event' | 'birthday' | 'anniversary';
      employeeId?: string;
      employeeCode?: string;
      hasPhoto?: boolean;
      fullName?: string;
    }> = [
      ...upcomingEvents.map((item) => ({
        id: `evt-${item.id}`,
        title: item.title,
        subtitle: item.type,
        date: item.date,
        until: item.until,
        month: item.month,
        day: item.day,
        kind: 'event' as const,
      })),
      ...birthdayCards.map((item) => ({
        id: `bday-${item.id}`,
        title: item.fullName,
        subtitle: `Birthday · ${item.department || 'Dorman Long'}`,
        date: item.date,
        until: item.until,
        month: item.month,
        day: item.day,
        kind: 'birthday' as const,
        employeeId: item.employeeId,
        employeeCode: item.employeeCode,
        hasPhoto: item.hasPhoto,
        fullName: item.fullName,
      })),
      ...anniversaryCards.map((item) => ({
        id: `ann-${item.id}`,
        title: item.fullName,
        subtitle: `${item.years || 1} year work anniversary`,
        date: item.date,
        until: item.until,
        month: item.month,
        day: item.day,
        kind: 'anniversary' as const,
        employeeId: item.employeeId,
        employeeCode: item.employeeCode,
        hasPhoto: item.hasPhoto,
        fullName: item.fullName,
      })),
    ];
    return rows.sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(0, activeTab === 'Events' || activeTab === 'Recognition' ? 16 : 6);
  }, [activeTab, anniversaryCards, birthdayCards, upcomingEvents]);

  const knowledgeDocs = useMemo(
    () =>
      documents
        .filter((doc) => /policy|handbook|conduct|security|leave|travel|guide|manual/i.test(`${doc.title} ${doc.category}`))
        .slice(0, activeTab === 'Knowledge Base' ? 12 : 5)
        .map((doc) => ({
          id: doc.id,
          title: doc.title,
          meta: `${doc.category || 'Policy'} · ${formatBytes(doc.sizeBytes)}`,
          status: doc.acknowledgement || doc.status,
        })),
    [activeTab, documents],
  );

  const myActivity = useMemo(() => {
    const fromRequests = requests.slice(0, 8).map((item) => ({
      id: `req-${item.id}`,
      title: item.title || item.category,
      detail: `${item.category} · ${item.status}`,
      when: formatWhen(item.updatedAt || item.submittedAt),
      tone: /approved|complete/i.test(item.status) ? 'bg-[#E9FAEF] text-[#15915B]' : /reject/i.test(item.status) ? 'bg-[#FEF2F2] text-[#B91C1C]' : 'bg-[#FFF5E8] text-[#B45309]',
    }));
    const fromNotifications = notifications.slice(0, 8).map((item) => ({
      id: `ntf-${item.id}`,
      title: item.title,
      detail: item.type,
      when: formatWhen(item.createdAt),
      tone: /unread/i.test(item.status) ? 'bg-[#EAF1FF] text-[#1769F7]' : 'bg-[#F2F5FA] text-[#425575]',
    }));
    return [...fromRequests, ...fromNotifications].slice(0, 12);
  }, [notifications, requests]);

  const markRead = (id: string) => setReadIds((current) => new Set(current).add(id));
  const acknowledge = () => {
    setAckDismissed(true);
    setShowAckToast(true);
    window.setTimeout(() => setShowAckToast(false), 3200);
  };

  if (!payload) {
    return (
      <div className="space-y-4">
        <div className="h-16 animate-pulse rounded-xl bg-[#E2E8F0]" />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
          <div className="h-[420px] animate-pulse rounded-xl bg-[#F1F5F9]" />
          <div className="h-[420px] animate-pulse rounded-xl bg-[#F1F5F9]" />
        </div>
      </div>
    );
  }

  const metrics = [
    { label: 'Unread Items', value: String(unreadCount), action: 'View all', icon: Mail, iconClass: 'bg-[#EEF5FF] text-[#1769F7]', onClick: () => { setActiveTab('News Feed'); setFilter('Unread'); } },
    { label: 'Pending Actions', value: String(pendingActions), action: 'View tasks', icon: Workflow, iconClass: 'bg-[#FFF5E8] text-[#F58B18]', onClick: () => onNavigate?.('workflow') },
    { label: 'Surveys to Complete', value: String(surveys.filter((item) => /open|pending|due|progress/i.test(item.status)).length), action: 'View surveys', icon: FileText, iconClass: 'bg-[#F5F1FF] text-[#8C4CF0]', onClick: () => setActiveTab('Surveys & Polls') },
    { label: 'Policies to Acknowledge', value: String(policiesDue.length), action: 'View policies', icon: BookOpen, iconClass: 'bg-[#ECFBF5] text-[#14A273]', onClick: () => setActiveTab('Circulars & Policies') },
    { label: 'Announcements', value: String(payload.communications?.summary?.announcementCount ?? feedItems.length), action: 'View all', icon: Bell, iconClass: 'bg-[#FFF0F3] text-[#EF4770]', onClick: () => { setActiveTab('News Feed'); setFilter('All'); } },
  ];

  const quickActions = [
    { label: 'Apply Leave', icon: CalendarDays, onClick: () => onNavigate?.('leave') },
    { label: 'Submit Timesheet', icon: Clock3, onClick: () => onNavigate?.('time') },
    { label: 'Submit Claim', icon: HandCoins, onClick: () => onNavigate?.('claims') },
    { label: 'Request Letter', icon: FileText, onClick: () => onNavigate?.('services') },
    { label: 'Download Payslip', icon: Download, onClick: () => onNavigate?.('payroll') },
    { label: 'Report Incident', icon: AlertTriangle, onClick: () => onNavigate?.('services') },
  ];

  const showOverviewChrome = activeTab === 'Overview';
  const showFeed = ['Overview', 'News Feed', 'Circulars & Policies'].includes(activeTab);
  const showRightRail = ['Overview', 'Events'].includes(activeTab);
  const celebrationTone = (kind: 'event' | 'birthday' | 'anniversary', index: number) => {
    if (kind === 'birthday') return 'bg-gradient-to-br from-[#F472B6] to-[#DB2777]';
    if (kind === 'anniversary') return 'bg-gradient-to-br from-[#818CF8] to-[#4F46E5]';
    return eventTone(index);
  };

  const renderFeed = (rows = filteredFeed.slice(0, activeTab === 'Overview' ? feedLimit : 20)) => (
    <PanelCard
      title={activeTab === 'Circulars & Policies' ? 'Circulars & Policies' : 'Company News & Announcements'}
      action={{ label: 'View all →', onClick: () => { setActiveTab('News Feed'); setFilter('All'); } }}
    >
      {activeTab === 'Overview' || activeTab === 'News Feed' ? (
        <div className="-mx-4 mb-3 flex gap-1.5 overflow-x-auto border-b border-[#E3E9F2] px-4 pb-3">
          {FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-[10px] font-semibold transition ${
                filter === item ? 'bg-[#1769F7] text-white' : 'bg-[#F2F5FA] text-[#425575] hover:bg-[#E8EEF7]'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      ) : null}
      {rows.length ? (
        <div className="-mx-4">
          {rows.map((item) => {
            const Icon = item.icon;
            return (
              <article
                key={item.id}
                className="grid cursor-pointer grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 border-b border-[#E3E9F2] px-4 py-4 last:border-b-0 hover:bg-[#FBFDFF]"
                onClick={() => markRead(item.id)}
              >
                <div className={`grid h-[38px] w-[38px] place-items-center rounded-full ${item.tone}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <span className="text-[9px] text-[#71809A]">{item.type}</span>
                  <h4 className="mt-1 truncate text-[13px] font-bold text-[#15213A]">{item.title}</h4>
                  <p className="mt-0.5 text-[9px] text-[#71809A]">From: {item.from} · {item.date}</p>
                </div>
                <span className={`rounded-full px-2 py-1 text-[9px] font-semibold ${item.unread ? 'bg-[#EAF1FF] text-[#1769F7]' : 'bg-[#E9FAEF] text-[#15915B]'}`}>
                  {item.unread ? 'Unread' : 'Read'}
                </span>
              </article>
            );
          })}
          {activeTab === 'Overview' && filteredFeed.length > feedLimit ? (
            <button
              type="button"
              onClick={() => setFeedLimit((value) => value + 6)}
              className="flex w-full items-center justify-center gap-1 py-3 text-[10px] font-semibold text-[#1769F7]"
            >
              Load more <ChevronDown className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      ) : (
        <EmptyPanel title="Nothing in this feed yet" detail="Updates personalized to your department and role will appear here." />
      )}
    </PanelCard>
  );

  const renderCelebrationTimeline = (title = 'Celebrations & Moments', limit = 8) => (
    <PanelCard title={title} action={activeTab !== 'Recognition' ? { label: 'View all →', onClick: () => setActiveTab('Recognition') } : undefined}>
      {celebrationTimeline.length ? (
        <div className="space-y-2.5">
          {celebrationTimeline.slice(0, limit).map((item, index) => (
            <div key={item.id} className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-[#EFF3F8] bg-[#FAFCFF] px-2.5 py-2.5">
              <div className={`grid h-11 w-[38px] place-items-center rounded-[9px] text-white ${celebrationTone(item.kind, index)}`}>
                <span className="text-[8px] leading-none">{item.month}</span>
                <strong className="-mt-1 text-[15px] font-bold leading-none">{item.day}</strong>
              </div>
              {item.kind === 'event' ? (
                <div className="grid h-9 w-9 place-items-center rounded-full bg-[#EEF5FF] text-[#1769F7]">
                  <CalendarDays className="h-4 w-4" />
                </div>
              ) : (
                <EmployeeAvatar
                  fullName={item.fullName || item.title}
                  employeeCode={item.employeeCode}
                  employeeId={item.employeeId}
                  hasPhoto={item.hasPhoto}
                  tryPhoto
                  size="sm"
                  className="ring-1 ring-[#E3E9F2]"
                />
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  {item.kind === 'birthday' ? <Cake className="h-3.5 w-3.5 shrink-0 text-[#DB2777]" /> : null}
                  {item.kind === 'anniversary' ? <Trophy className="h-3.5 w-3.5 shrink-0 text-[#4F46E5]" /> : null}
                  <strong className="truncate text-[11px] font-bold text-[#15213A]">{item.title}</strong>
                </div>
                <span className="mt-0.5 block text-[9px] text-[#75829A]">{item.subtitle}</span>
              </div>
              <em className={`rounded-full px-1.5 py-1 text-[8px] not-italic ${item.until === 'Today' ? 'bg-[#FEF3C7] text-[#B45309]' : 'bg-[#EEF3FF] text-[#3864B2]'}`}>
                {item.until}
              </em>
            </div>
          ))}
        </div>
      ) : (
        <EmptyPanel title="No upcoming celebrations" detail="Birthdays, anniversaries, and calendar moments for your peers will appear here." />
      )}
    </PanelCard>
  );

  const renderPeopleList = (
    title: string,
    items: Array<{
      id: string;
      fullName: string;
      department?: string;
      years?: number;
      until: string;
      month: string;
      day: string;
      date: string;
      employeeId?: string;
      employeeCode?: string;
      hasPhoto?: boolean;
    }>,
    tone: 'birthday' | 'anniversary',
  ) => (
    <PanelCard title={title} action={{ label: 'View all →', onClick: () => setActiveTab('Recognition') }}>
      {items.length ? (
        <div className="space-y-2.5">
          {items.map((item, index) => (
            <div key={item.id} className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-[#EFF3F8] bg-[#FAFCFF] px-2.5 py-2">
              <div className={`grid h-11 w-[38px] place-items-center rounded-[9px] text-white ${tone === 'birthday' ? 'bg-gradient-to-br from-[#F472B6] to-[#DB2777]' : eventTone(index)}`}>
                <span className="text-[8px] leading-none">{item.month}</span>
                <strong className="-mt-1 text-[15px] font-bold leading-none">{item.day}</strong>
              </div>
              <EmployeeAvatar
                fullName={item.fullName}
                employeeCode={item.employeeCode}
                employeeId={item.employeeId}
                hasPhoto={item.hasPhoto}
                tryPhoto
                size="sm"
                className="ring-1 ring-[#E3E9F2]"
              />
              <div className="min-w-0">
                <strong className="block truncate text-[11px] font-bold text-[#15213A]">{item.fullName}</strong>
                <span className="text-[9px] text-[#75829A]">
                  {tone === 'anniversary' && item.years ? `${item.years} year${item.years === 1 ? '' : 's'} · ` : ''}
                  {item.department || 'Dorman Long'}
                </span>
              </div>
              <em className={`rounded-full px-1.5 py-1 text-[8px] not-italic ${item.until === 'Today' ? 'bg-[#FEF3C7] text-[#B45309]' : 'bg-[#EEF3FF] text-[#3864B2]'}`}>
                {item.until}
              </em>
            </div>
          ))}
        </div>
      ) : (
        <EmptyPanel
          title={tone === 'birthday' ? 'No upcoming birthdays' : 'No upcoming anniversaries'}
          detail="Celebrations from your department peers will show here when dates are available."
        />
      )}
    </PanelCard>
  );

  return (
    <div className="relative space-y-4 text-[#15213A]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#15213A]">Communications Hub</h1>
          <p className="mt-1.5 text-[13px] text-[#66748E]">
            Personalized for {employee?.fullName || 'you'} · Stay informed across Dorman Long.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setActiveTab('News Feed')}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-[9px] bg-[#1769F7] px-4 text-sm font-bold text-white shadow-[0_8px_18px_rgba(23,105,247,0.22)] hover:bg-[#1258d4]"
        >
          <Plus className="h-[18px] w-[18px]" />
          New Message / Announcement
        </button>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-[#E3E9F2]">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => {
              setActiveTab(tab);
              setFilter('All');
            }}
            className={`shrink-0 border-b-2 px-3 py-2.5 text-[13px] transition ${
              activeTab === tab
                ? 'border-[#1769F7] font-bold text-[#1769F7]'
                : 'border-transparent text-[#3E5273] hover:text-[#15213A]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className={`grid grid-cols-1 gap-4 ${showOverviewChrome ? 'xl:grid-cols-[280px_minmax(0,1fr)]' : ''}`}>
        {showOverviewChrome ? (
          <aside className="flex flex-col gap-3.5">
            <section className="overflow-hidden rounded-xl border border-[#E3E9F2] bg-white shadow-[0_1px_2px_rgba(16,42,86,0.04),0_8px_22px_rgba(16,42,86,0.05)]">
              <div className="flex items-center gap-3 bg-gradient-to-br from-[#EEF7FF] to-[#F3EFFF] p-[18px]">
                <EmployeeAvatar
                  fullName={employee?.fullName || 'Employee'}
                  employeeCode={employee?.employeeCode || employee?.employeeId}
                  photoUrl={employee?.photoUrl}
                  hasPhoto={employee?.hasPhoto}
                  size="md"
                  tryPhoto
                  className="h-[52px] w-[52px] ring-2 ring-white"
                />
                <div>
                  <p className="text-[11px] text-[#66748E]">{greeting()},</p>
                  <h2 className="text-[19px] font-bold leading-tight text-[#15213A]">{firstName(employee?.fullName)}! 👋</h2>
                  <p className="mt-0.5 text-[11px] text-[#66748E]">Here’s what’s happening today.</p>
                </div>
              </div>
              <dl className="m-0 space-y-0 px-4 py-2.5">
                {[
                  ['Employee ID', employee?.employeeCode || employee?.employeeId || '—'],
                  ['Department', employee?.department || '—'],
                  ['Location', employee?.location || '—'],
                  ['Current Shift', shifts[0] ? `${shifts[0].start || '09:00'} – ${shifts[0].end || '18:00'}` : 'Standard hours'],
                  ['Employment Type', employee?.status || 'Active'],
                  ['Years of Service', employee?.yearsOfService != null ? `${employee.yearsOfService} Years` : '—'],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-3 border-b border-[#EFF3F8] py-2 text-[11px] last:border-b-0">
                    <dt className="text-[#60708B]">{label}</dt>
                    <dd className="m-0 text-right font-semibold text-[#15213A]">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="rounded-xl border border-[#E3E9F2] bg-white p-3.5 shadow-[0_1px_2px_rgba(16,42,86,0.04),0_8px_22px_rgba(16,42,86,0.05)]">
              <h3 className="text-sm font-bold text-[#15213A]">Quick Actions</h3>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {quickActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.label}
                      type="button"
                      onClick={action.onClick}
                      className="flex min-h-[66px] flex-col items-center justify-center gap-1.5 rounded-[9px] border border-[#E3E9F2] bg-[#FAFCFF] px-1 text-[9px] font-semibold text-[#263B5D] transition hover:-translate-y-px hover:border-[#BFD3F8] hover:bg-[#F3F7FF]"
                    >
                      <Icon className="h-[18px] w-[18px]" />
                      <span className="text-center leading-tight">{action.label}</span>
                    </button>
                  );
                })}
              </div>
              <button type="button" onClick={() => onNavigate?.('services')} className="mt-3 block w-full text-center text-[11px] font-bold text-[#1769F7]">
                View all services →
              </button>
            </section>

            <section className="rounded-xl border border-[#E3E9F2] bg-white p-3.5 shadow-[0_1px_2px_rgba(16,42,86,0.04),0_8px_22px_rgba(16,42,86,0.05)]">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-[#15213A]">My Leave Balance</h3>
                <button type="button" onClick={() => onNavigate?.('leave')} className="text-[10px] font-bold text-[#1769F7]">View all →</button>
              </div>
              {leaveRows.length ? leaveRows.map((row) => (
                <div key={row.label} className="mt-3">
                  <div className="flex items-center justify-between text-[10px]">
                    <strong className="font-semibold text-[#15213A]">{row.label}</strong>
                    <span className="text-[#66748E]">{row.value}</span>
                  </div>
                  <div className="my-1.5 h-1.5 overflow-hidden rounded-full bg-[#E9EEF5]">
                    <span className={`block h-full rounded-full bg-gradient-to-r ${row.bar}`} style={{ width: `${row.pct}%` }} />
                  </div>
                  <small className="text-[9px] text-[#8A96A9]">{row.detail}</small>
                </div>
              )) : (
                <p className="mt-3 text-[11px] font-semibold text-[#66748E]">Your leave balances will appear here once available.</p>
              )}
            </section>
          </aside>
        ) : null}

        <section className="min-w-0 space-y-3.5">
          {showOverviewChrome ? (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-5">
              {metrics.map((metric) => {
                const Icon = metric.icon;
                return (
                  <article
                    key={metric.label}
                    className="grid min-h-[112px] grid-cols-[auto_1fr] gap-x-2.5 rounded-xl border border-[#E3E9F2] bg-white p-3.5 shadow-[0_1px_2px_rgba(16,42,86,0.04),0_8px_22px_rgba(16,42,86,0.05)]"
                  >
                    <div className={`row-span-3 grid h-9 w-9 place-items-center rounded-[11px] ${metric.iconClass}`}>
                      <Icon className="h-[19px] w-[19px]" />
                    </div>
                    <span className="text-[10px] text-[#354969]">{metric.label}</span>
                    <strong className="text-[22px] font-bold leading-none text-[#15213A]">{metric.value}</strong>
                    <button type="button" onClick={metric.onClick} className="justify-self-start text-[10px] font-bold text-[#1769F7]">
                      {metric.action} →
                    </button>
                  </article>
                );
              })}
            </div>
          ) : null}

          {activeTab === 'Surveys & Polls' ? (
            <PanelCard title="Surveys & Polls">
              {surveys.length ? (
                <div className="space-y-2.5">
                  {surveys.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-[#E3E9F2] bg-[#FAFCFF] px-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-[#15213A]">{item.title}</p>
                        <p className="mt-1 text-[11px] text-[#66748E]">{item.type} · {item.status}{item.dueAt ? ` · Due ${formatShortDate(item.dueAt)}` : ''}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onNavigate?.(item.actionHref?.includes('documents') ? 'documents' : 'services')}
                        className="shrink-0 rounded-lg bg-[#1769F7] px-3 py-2 text-[11px] font-bold text-white"
                      >
                        Open
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyPanel title="No surveys assigned to you" detail="Open surveys and polls for your employee profile will appear here." />
              )}
            </PanelCard>
          ) : null}

          {activeTab === 'Circulars & Policies' ? (
            <div className="space-y-3.5">
              {policies.length ? (
                <PanelCard title="Policies requiring action">
                  <div className="space-y-2.5">
                    {policies.map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-[#E3E9F2] bg-[#FAFCFF] px-3 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-[#15213A]">{item.title}</p>
                          <p className="mt-1 text-[11px] text-[#66748E]">{item.type} · {item.status}{item.dueAt ? ` · Due ${formatShortDate(item.dueAt)}` : ''}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onNavigate?.('documents')}
                          className="shrink-0 rounded-lg bg-[#14A273] px-3 py-2 text-[11px] font-bold text-white"
                        >
                          Review
                        </button>
                      </div>
                    ))}
                  </div>
                </PanelCard>
              ) : null}
              {renderFeed()}
            </div>
          ) : null}

          {activeTab === 'Events' ? (
            <div className="space-y-3.5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                  { label: 'Upcoming events', value: String(upcomingEvents.length), icon: CalendarDays, tone: 'from-[#EFF6FF] to-[#DBEAFE] text-[#1D4ED8]' },
                  { label: 'Birthdays', value: String(birthdayCards.length), icon: Cake, tone: 'from-[#FDF2F8] to-[#FCE7F3] text-[#BE185D]' },
                  { label: 'Anniversaries', value: String(anniversaryCards.length), icon: Trophy, tone: 'from-[#EEF2FF] to-[#E0E7FF] text-[#4338CA]' },
                ].map((card) => {
                  const Icon = card.icon;
                  return (
                    <div key={card.label} className={`rounded-xl bg-gradient-to-br p-4 ${card.tone}`}>
                      <Icon className="h-5 w-5" />
                      <p className="mt-3 text-[22px] font-black leading-none">{card.value}</p>
                      <p className="mt-1 text-[11px] font-semibold opacity-80">{card.label}</p>
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-[minmax(0,1fr)_340px]">
                {renderCelebrationTimeline('Events, birthdays & anniversaries', 16)}
                <aside className="flex flex-col gap-3.5">
                  <PanelCard title="Upcoming Events">
                    {upcomingEvents.length ? upcomingEvents.map((event, index) => (
                      <div key={event.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-[#E3E9F2] py-2.5 last:border-b-0">
                        <div className={`grid h-11 w-[38px] place-items-center rounded-[9px] text-white ${eventTone(index)}`}>
                          <span className="text-[8px] leading-none">{event.month}</span>
                          <strong className="-mt-1 text-[15px] font-bold leading-none">{event.day}</strong>
                        </div>
                        <div className="min-w-0">
                          <strong className="block truncate text-[10px] font-bold text-[#15213A]">{event.title}</strong>
                          <span className="text-[9px] text-[#75829A]">{event.type}</span>
                        </div>
                        <em className="rounded-full bg-[#EEF3FF] px-1.5 py-1 text-[8px] not-italic text-[#3864B2]">{event.until}</em>
                      </div>
                    )) : (
                      <EmptyPanel title="No upcoming events" detail="Payroll cut-offs, holidays, and personal milestones will appear here." />
                    )}
                  </PanelCard>
                  {renderPeopleList('Upcoming Birthdays', birthdayCards.slice(0, 5), 'birthday')}
                  {renderPeopleList('Work Anniversaries', anniversaryCards.slice(0, 5), 'anniversary')}
                </aside>
              </div>
            </div>
          ) : null}

          {activeTab === 'Recognition' ? (
            <div className="space-y-3.5">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {[
                  { label: 'Birthdays this month', value: String(birthdayCards.filter((item) => (daysUntil(item.date) ?? 99) <= 31).length), icon: Cake, tone: 'from-[#FDF2F8] to-[#FCE7F3] text-[#BE185D]' },
                  { label: 'Anniversaries', value: String(anniversaryCards.length), icon: Trophy, tone: 'from-[#EEF2FF] to-[#E0E7FF] text-[#4338CA]' },
                  { label: 'Today’s celebrations', value: String([...birthdayCards, ...anniversaryCards].filter((item) => item.until === 'Today').length), icon: Gift, tone: 'from-[#ECFDF5] to-[#D1FAE5] text-[#047857]' },
                ].map((card) => {
                  const Icon = card.icon;
                  return (
                    <div key={card.label} className={`rounded-xl bg-gradient-to-br p-4 ${card.tone}`}>
                      <Icon className="h-5 w-5" />
                      <p className="mt-3 text-[22px] font-black leading-none">{card.value}</p>
                      <p className="mt-1 text-[11px] font-semibold opacity-80">{card.label}</p>
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-2">
                {renderPeopleList('Upcoming Birthdays', birthdayCards, 'birthday')}
                {renderPeopleList('Work Anniversaries', anniversaryCards, 'anniversary')}
              </div>
              {renderCelebrationTimeline('All celebrations & moments', 12)}
            </div>
          ) : null}

          {activeTab === 'Knowledge Base' ? (
            <PanelCard title="Knowledge Base & Policies" action={{ label: 'Browse documents →', onClick: () => onNavigate?.('documents') }}>
              {knowledgeDocs.length ? (
                <div className="space-y-2">
                  {knowledgeDocs.map((doc, index) => (
                    <div key={doc.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-[#EFF3F8] px-3 py-2.5">
                      <div className={`grid h-9 w-9 place-items-center rounded-lg ${resourceTone(index)}`}>
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-bold text-[#15213A]">{doc.title}</p>
                        <p className="text-[10px] text-[#66748E]">{doc.meta}</p>
                      </div>
                      <button type="button" onClick={() => onNavigate?.('documents')} className="rounded-lg border border-[#E3E9F2] px-2.5 py-1.5 text-[10px] font-bold text-[#1769F7]">
                        Open
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyPanel title="No knowledge documents yet" detail="Policies and handbooks assigned to your profile will appear here." />
              )}
            </PanelCard>
          ) : null}

          {activeTab === 'My Activity' ? (
            <PanelCard title="My Activity" action={{ label: 'Open workflow →', onClick: () => onNavigate?.('workflow') }}>
              {myActivity.length ? (
                <div className="space-y-2">
                  {myActivity.map((item) => (
                    <div key={item.id} className="flex items-start justify-between gap-3 rounded-xl border border-[#EFF3F8] px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-bold text-[#15213A]">{item.title}</p>
                        <p className="mt-0.5 text-[10px] text-[#66748E]">{item.detail}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${item.tone}`}>{item.detail.split(' · ').slice(-1)[0]}</span>
                        <p className="mt-1 text-[9px] text-[#94A3B8]">{item.when}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyPanel title="No recent activity" detail="Your requests, acknowledgements, and notification history will show here." />
              )}
            </PanelCard>
          ) : null}

          {showFeed && activeTab !== 'Circulars & Policies' ? (
            <div className={`grid grid-cols-1 gap-3.5 ${showRightRail ? 'xl:grid-cols-[minmax(0,1fr)_340px]' : ''}`}>
              {renderFeed()}

              {showRightRail ? (
                <aside className="flex flex-col gap-3.5">
                  <PanelCard title="Upcoming Events" action={{ label: 'View calendar →', onClick: () => setActiveTab('Events') }}>
                    {upcomingEvents.length ? upcomingEvents.map((event, index) => (
                      <div key={event.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-[#E3E9F2] py-2.5 last:border-b-0">
                        <div className={`grid h-11 w-[38px] place-items-center rounded-[9px] text-white ${eventTone(index)}`}>
                          <span className="text-[8px] leading-none">{event.month}</span>
                          <strong className="-mt-1 text-[15px] font-bold leading-none">{event.day}</strong>
                        </div>
                        <div className="min-w-0">
                          <strong className="block truncate text-[10px] font-bold text-[#15213A]">{event.title}</strong>
                          <span className="text-[9px] text-[#75829A]">{event.type}</span>
                        </div>
                        <em className="rounded-full bg-[#EEF3FF] px-1.5 py-1 text-[8px] not-italic text-[#3864B2]">{event.until}</em>
                      </div>
                    )) : (
                      <EmptyPanel title="No upcoming events" detail="Payroll cut-offs, holidays, and personal milestones will appear here." />
                    )}
                  </PanelCard>

                  {renderPeopleList('Upcoming Birthdays', birthdayCards.slice(0, 4), 'birthday')}
                  {renderPeopleList('Work Anniversaries', anniversaryCards.slice(0, 4), 'anniversary')}
                  {renderCelebrationTimeline('More moments', 4)}

                  <PanelCard title="Popular Resources" action={{ label: 'View all →', onClick: () => setActiveTab('Knowledge Base') }}>
                    {knowledgeDocs.length ? knowledgeDocs.slice(0, 5).map((resource, index) => (
                      <div key={resource.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-[#E3E9F2] py-2.5 last:border-b-0">
                        <div className={`grid h-[29px] w-[29px] place-items-center rounded-lg ${resourceTone(index)}`}>
                          <FileText className="h-[17px] w-[17px]" />
                        </div>
                        <div className="min-w-0">
                          <strong className="block truncate text-[10px] font-bold text-[#15213A]">{resource.title}</strong>
                          <span className="text-[9px] text-[#75829A]">{resource.meta}</span>
                        </div>
                        <button type="button" onClick={() => onNavigate?.('documents')} className="text-[#4B607E]" aria-label={`Open ${resource.title}`}>
                          <Download className="h-[17px] w-[17px]" />
                        </button>
                      </div>
                    )) : (
                      <EmptyPanel title="No resources yet" detail="Assigned policies and handbooks will appear here." />
                    )}
                    <button
                      type="button"
                      onClick={() => onNavigate?.('documents')}
                      className="mt-2.5 w-full rounded-lg border border-[#E3E9F2] bg-white px-3 py-2 text-[10px] font-bold text-[#1769F7]"
                    >
                      Browse all policies & documents
                    </button>
                  </PanelCard>
                </aside>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>

      {!ackDismissed && policiesDue.length > 0 ? (
        <div className="relative grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-[10px] border border-[#F7C56F] bg-[#FFF8EA] px-3.5 py-3">
          <div className="grid h-[38px] w-[38px] place-items-center rounded-full bg-[#FFF0C6] text-[#F09113]">
            <Clock3 className="h-[22px] w-[22px]" />
          </div>
          <div>
            <strong className="text-xs font-bold text-[#AD5B07]">Pending Acknowledgement</strong>
            <p className="mt-1 text-[10px] text-[#7D694B]">
              You have {policiesDue.length} policy document{policiesDue.length === 1 ? '' : 's'} that require{policiesDue.length === 1 ? 's' : ''} your acknowledgement
              {policiesDue[0] ? `: ${policiesDue[0].title}` : '.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              acknowledge();
              onNavigate?.('documents');
            }}
            className="rounded-lg bg-[#F29A10] px-3.5 py-2 text-[10px] font-bold text-white hover:bg-[#e08c0c]"
          >
            Acknowledge Now
          </button>
          <button type="button" onClick={acknowledge} className="text-[#6B7485]" aria-label="Dismiss acknowledgement banner">
            <X className="h-[18px] w-[18px]" />
          </button>
        </div>
      ) : null}

      {showAckToast ? (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-[10px] bg-[#173D2F] px-4 py-3 text-xs font-semibold text-white shadow-[0_15px_35px_rgba(0,0,0,0.18)]">
          <CheckCircle2 className="h-[18px] w-[18px]" />
          Policy acknowledgement completed.
        </div>
      ) : null}
    </div>
  );
}
