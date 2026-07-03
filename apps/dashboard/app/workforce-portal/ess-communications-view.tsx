'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Award,
  Bell,
  Cake,
  CalendarDays,
  ClipboardList,
  FileText,
  Megaphone,
  MessageSquare,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { EssAnnouncement, EssEngagementItem } from '@/lib/ess-portal-derived-data';
import { EssCard, EssEmptyState, EssEventItem, EssKpiCard, EssMiniCalendar, EssNotificationItem, EssSectionHeader } from './ess-portal-ui';

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
  employee?: {
    fullName?: string;
    department?: string;
  };
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
    hour12: false,
  }) + ' UTC';
};

const formatDay = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' });
};

const priorityTone = (priority: string) => {
  if (/high/i.test(priority)) return 'border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]';
  if (/low/i.test(priority)) return 'border-[#E2E8F0] bg-[#F8FAFC] text-[#64748B]';
  return 'border-[#BFDBFE] bg-[#EFF6FF] text-[#2563EB]';
};

const engagementTone = (status: string) => {
  if (/acknowledgement due|open|in progress/i.test(status)) return 'border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]';
  if (/completed|acknowledged|read/i.test(status)) return 'border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]';
  return 'border-[#E2E8F0] bg-[#F8FAFC] text-[#475569]';
};

const engagementIcon = (type: string): { icon: LucideIcon; bg: string; color: string } => {
  if (/survey/i.test(type)) return { icon: ClipboardList, bg: '#F5F3FF', color: '#7C3AED' };
  if (/feedback/i.test(type)) return { icon: MessageSquare, bg: '#ECFEFF', color: '#0891B2' };
  if (/policy/i.test(type)) return { icon: ShieldCheck, bg: '#FFF7ED', color: '#EA580C' };
  return { icon: FileText, bg: '#EFF6FF', color: '#2563EB' };
};

const notificationIcon = (type: string): { icon: LucideIcon; bg: string; color: string } => {
  if (/workflow|approval|leave/i.test(type)) return { icon: ClipboardList, bg: '#F5F3FF', color: '#7C3AED' };
  if (/payroll/i.test(type)) return { icon: Sparkles, bg: '#ECFDF5', color: '#047857' };
  if (/security/i.test(type)) return { icon: ShieldCheck, bg: '#FEF2F2', color: '#DC2626' };
  return { icon: Bell, bg: '#EFF6FF', color: '#2563EB' };
};

export function EssCommunicationsView({
  payload,
  onNavigate,
}: {
  payload: EssCommunicationsPayload | null;
  onNavigate?: (tab: string, options?: { leaveSection?: string }) => void;
}) {
  const [query, setQuery] = useState('');
  const announcements = payload?.announcements || [];
  const engagements = payload?.communications?.engagements || [];
  const notifications = payload?.notifications || [];
  const summary = payload?.communications?.summary;
  const birthdays = payload?.birthdays || [];
  const anniversaries = payload?.anniversaries || [];
  const events = payload?.events || [];

  const filteredNotifications = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return notifications;
    return notifications.filter((item) => [item.title, item.type, item.status].join(' ').toLowerCase().includes(needle));
  }, [notifications, query]);

  const loadedLabel = payload?.generatedAt ? formatWhen(payload.generatedAt) : '—';

  if (!payload) {
    return (
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <EssCard key={index} className="p-6">
            <div className="h-6 w-44 animate-pulse rounded-lg bg-[#E2E8F0]" />
            <div className="mt-5 space-y-3">
              {[0, 1, 2, 3].map((row) => (
                <div key={row} className="h-16 animate-pulse rounded-[14px] bg-[#F1F5F9]" />
              ))}
            </div>
          </EssCard>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold text-[#64748B]">HR communication center</p>
          <p className="mt-0.5 text-[12px] text-[#94A3B8]">
            Announcements, engagement items, and system notifications for {payload.employee?.fullName || 'signed-in employee'} · Last synced {loadedLabel}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <EssKpiCard label="Announcements" value={String(summary?.announcementCount ?? announcements.length)} subtitle="Circulars & notices" icon={Megaphone} accent="#2563EB" iconBg="#EFF6FF" />
        <EssKpiCard label="Engagements" value={String(summary?.engagementCount ?? engagements.length)} subtitle="Surveys, feedback & policies" icon={ClipboardList} accent="#7C3AED" iconBg="#F5F3FF" />
        <EssKpiCard label="Notifications" value={String(summary?.notificationCount ?? notifications.length)} subtitle="System & workflow alerts" icon={Bell} accent="#0891B2" iconBg="#ECFEFF" />
        <EssKpiCard label="Unread" value={String(summary?.unreadCount ?? notifications.filter((item) => /unread/i.test(item.status)).length)} subtitle="Requires attention" icon={MessageSquare} accent="#B45309" iconBg="#FFFBEB" />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <EssCard className="overflow-hidden">
          <div className="border-b border-[#E9EEF5] px-6 py-5">
            <EssSectionHeader
              title="Announcements, Circulars & Notices"
              action={
                <span className="rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-1 text-[11px] font-bold text-[#2563EB]">
                  {announcements.length}
                </span>
              }
            />
            <p className="mt-1 text-[12px] text-[#64748B]">Company-wide updates, payroll notices, and HR calendar events.</p>
          </div>
          <div className="max-h-[560px] space-y-3 overflow-auto p-5">
            {announcements.length ? (
              announcements.map((item) => (
                <article key={item.id} className="rounded-[14px] border border-[#E9EEF5] bg-[#FCFDFF] p-4 transition hover:border-[#CBD5E1] hover:bg-white">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[14px] font-bold leading-snug text-[#0F172A]">{item.title}</p>
                      <p className="mt-1 text-[11px] font-medium text-[#64748B]">
                        {item.channel} · {formatWhen(item.publishedAt)}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold ${priorityTone(item.priority)}`}>
                      {item.priority}
                    </span>
                  </div>
                </article>
              ))
            ) : (
              <EssEmptyState
                icon={Megaphone}
                title="No announcements"
                description="Payroll releases, HR circulars, and calendar notices will appear here when they are available."
              />
            )}
          </div>
        </EssCard>

        <EssCard className="overflow-hidden">
          <div className="border-b border-[#E9EEF5] px-6 py-5">
            <EssSectionHeader
              title="Surveys, Feedback & Policy Updates"
              action={
                <span className="rounded-full border border-[#DDD6FE] bg-[#F5F3FF] px-3 py-1 text-[11px] font-bold text-[#7C3AED]">
                  {engagements.length}
                </span>
              }
            />
            <p className="mt-1 text-[12px] text-[#64748B]">Live policy acknowledgements, surveys, and feedback routed from HRIS records.</p>
          </div>
          <div className="max-h-[560px] space-y-3 overflow-auto p-5">
            {engagements.length ? (
              engagements.map((item) => {
                const visual = engagementIcon(item.type);
                const Icon = visual.icon;
                const content = (
                  <>
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]" style={{ backgroundColor: visual.bg, color: visual.color }}>
                        <Icon className="h-4 w-4" strokeWidth={2} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[14px] font-bold leading-snug text-[#0F172A]">{item.title}</p>
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${engagementTone(item.status)}`}>
                            {item.status}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] font-semibold text-[#64748B]">{item.type}</p>
                        {item.dueAt ? <p className="mt-1 text-[10px] text-[#94A3B8]">Updated {formatWhen(item.dueAt)}</p> : null}
                      </div>
                    </div>
                  </>
                );
                if (item.actionHref) {
                  return (
                    <Link
                      key={item.id}
                      href={item.actionHref}
                      className="block rounded-[14px] border border-[#E9EEF5] bg-white p-4 transition hover:border-[#CBD5E1] hover:bg-[#F8FAFC]"
                    >
                      {content}
                    </Link>
                  );
                }
                return (
                  <div key={item.id} className="rounded-[14px] border border-[#E9EEF5] bg-white p-4">
                    {content}
                  </div>
                );
              })
            ) : (
              <EssEmptyState
                icon={ClipboardList}
                title="No engagement items"
                description="Policy updates, surveys, and feedback requests will appear here when they are issued or recorded in HRIS."
              />
            )}
          </div>
        </EssCard>

        <EssCard className="overflow-hidden">
          <div className="border-b border-[#E9EEF5] px-6 py-5">
            <EssSectionHeader
              title="System Notifications"
              action={
                <span className="rounded-full border border-[#A7F3D0] bg-[#ECFDF5] px-3 py-1 text-[11px] font-bold text-[#047857]">
                  {summary?.unreadCount ?? 0} unread
                </span>
              }
            />
            <p className="mt-1 text-[12px] text-[#64748B]">Workflow, payroll, security, and portal activity alerts.</p>
            <div className="relative mt-4">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter notifications..."
                className="h-10 w-full rounded-[12px] border border-[#E2E8F0] bg-white pl-10 pr-10 text-sm outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15"
                aria-label="Filter notifications"
              />
              {query ? (
                <button type="button" onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#0F172A]" aria-label="Clear filter">
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>
          <div className="max-h-[500px] space-y-2 overflow-auto p-5">
            {filteredNotifications.length ? (
              filteredNotifications.map((item) => {
                const visual = notificationIcon(item.type);
                const href = item.href;
                return (
                  <EssNotificationItem
                    key={item.id}
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
                              const tab = new URL(href, 'http://local').searchParams.get('tab');
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
              <EssEmptyState
                icon={Bell}
                title={notifications.length ? 'No matching notifications' : 'No notifications'}
                description={
                  notifications.length
                    ? 'Try a different search term to locate the alert you need.'
                    : 'Portal, payroll, and workflow notifications will appear here as they are generated.'
                }
              />
            )}
          </div>
        </EssCard>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <EssCard className="overflow-hidden">
          <div className="border-b border-[#E9EEF5] px-6 py-5">
            <EssSectionHeader
              title="Upcoming Birthdays"
              action={
                <span className="rounded-full border border-[#FBCFE8] bg-[#FDF2F8] px-3 py-1 text-[11px] font-bold text-[#DB2777]">
                  {birthdays.length}
                </span>
              }
            />
            <p className="mt-1 text-[12px] text-[#64748B]">Celebrate colleagues across your team and department.</p>
          </div>
          <div className="max-h-[360px] space-y-2 overflow-auto p-5">
            {birthdays.length ? (
              birthdays.map((item) => (
                <div key={item.id} className="flex items-center gap-3 rounded-[14px] border border-[#E9EEF5] bg-[#FCFDFF] p-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[#FDF2F8] text-[#DB2777]">
                    <Cake className="h-4 w-4" strokeWidth={2} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-bold text-[#0F172A]">{item.fullName}</p>
                    <p className="text-[11px] font-medium text-[#64748B]">{item.department}</p>
                  </div>
                  <span className="shrink-0 text-[11px] font-semibold text-[#94A3B8]">{formatDay(item.date)}</span>
                </div>
              ))
            ) : (
              <EssEmptyState icon={Cake} title="No upcoming birthdays" description="Birthdays for your team and department will appear here when available in the HRIS." />
            )}
          </div>
        </EssCard>

        <EssCard className="overflow-hidden">
          <div className="border-b border-[#E9EEF5] px-6 py-5">
            <EssSectionHeader
              title="Work Anniversaries"
              action={
                <span className="rounded-full border border-[#FDE68A] bg-[#FFFBEB] px-3 py-1 text-[11px] font-bold text-[#B45309]">
                  {anniversaries.length}
                </span>
              }
            />
            <p className="mt-1 text-[12px] text-[#64748B]">Recognise years of service milestones.</p>
          </div>
          <div className="max-h-[360px] space-y-2 overflow-auto p-5">
            {anniversaries.length ? (
              anniversaries.map((item) => (
                <div key={item.id} className="flex items-center gap-3 rounded-[14px] border border-[#E9EEF5] bg-[#FCFDFF] p-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[#FFFBEB] text-[#B45309]">
                    <Award className="h-4 w-4" strokeWidth={2} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-bold text-[#0F172A]">{item.fullName}</p>
                    <p className="text-[11px] font-medium text-[#64748B]">
                      {item.years} {item.years === 1 ? 'year' : 'years'} of service
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] font-semibold text-[#94A3B8]">{formatDay(item.date)}</span>
                </div>
              ))
            ) : (
              <EssEmptyState icon={Award} title="No upcoming anniversaries" description="Work anniversaries for your team will appear here when available in the HRIS." />
            )}
          </div>
        </EssCard>

        <EssCard className="overflow-hidden">
          <div className="border-b border-[#E9EEF5] px-6 py-5">
            <EssSectionHeader
              title="Events & Calendar"
              action={
                <span className="rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-1 text-[11px] font-bold text-[#2563EB]">
                  {events.length}
                </span>
              }
            />
            <p className="mt-1 text-[12px] text-[#64748B]">Payroll cut-offs, leave, and company events.</p>
          </div>
          <div className="p-5">
            <EssMiniCalendar />
            <div className="mt-3 space-y-1">
              {events.length ? (
                events.slice(0, 6).map((item) => (
                  <EssEventItem key={item.id} label={item.label} date={formatDay(item.date)} compact />
                ))
              ) : (
                <EssEmptyState icon={CalendarDays} title="No upcoming events" description="Scheduled HR and payroll events will appear here." />
              )}
            </div>
          </div>
        </EssCard>
      </div>
    </div>
  );
}
