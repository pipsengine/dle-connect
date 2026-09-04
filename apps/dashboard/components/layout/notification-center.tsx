'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Archive, Bell, CheckCheck, ChevronRight, Mail, RefreshCcw, ShieldCheck, X } from 'lucide-react';
import { isLiveNotificationId, normalizeEssNotificationHref } from '@/lib/ess-notification-routing';

type NotificationSeverity = 'info' | 'success' | 'warning' | 'critical';
type NotificationKind = 'Notification' | 'Message' | 'Approval' | 'Security' | 'Workflow';
type NotificationRecord = {
  id: string;
  kind: NotificationKind;
  module: string;
  title: string;
  body: string;
  severity: NotificationSeverity;
  status: 'Unread' | 'Read' | 'Archived';
  href?: string;
  createdAt: string;
  actor?: string;
};
type NotificationPayload = {
  notifications: NotificationRecord[];
  counts: { unread: number; notifications: number; messages: number; approvals: number; critical: number };
};
type ApiResponse = { status: 'success' | 'error'; data?: NotificationPayload; error?: string };

const DISMISS_KEY = 'ess-dismissed-notifications';
const READ_KEY = 'ess-read-notifications';

const essFetchHeaders = (essMode: boolean): Record<string, string> =>
  essMode ? { 'x-ess-context': 'workforce-portal' } : {};

const severityClass: Record<NotificationSeverity, string> = {
  info: 'border-blue-200 bg-blue-50 text-blue-800',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  critical: 'border-red-200 bg-red-50 text-red-800',
};

const dotClass: Record<NotificationSeverity, string> = {
  info: 'bg-blue-600',
  success: 'bg-emerald-600',
  warning: 'bg-amber-500',
  critical: 'bg-red-600',
};

const timeText = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const readDismissedIds = () => {
  if (typeof window === 'undefined') return new Set<string>();
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(DISMISS_KEY) || '[]') as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set<string>();
  }
};

const writeDismissedIds = (ids: Set<string>) => {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(DISMISS_KEY, JSON.stringify([...ids]));
};

const readReadIds = () => {
  if (typeof window === 'undefined') return new Set<string>();
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(READ_KEY) || '[]') as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set<string>();
  }
};

const writeReadIds = (ids: Set<string>) => {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(READ_KEY, JSON.stringify([...ids]));
};

export function NotificationCenter({
  scope = 'notifications',
  className = '',
  essMode = false,
}: {
  scope?: 'notifications' | 'messages' | 'approvals' | 'all';
  className?: string;
  essMode?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<NotificationPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set());
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const panelRef = useRef<HTMLDivElement | null>(null);
  const inEssPortal = essMode || pathname.startsWith('/workforce-portal');

  const isMessages = scope === 'messages';
  const Icon = isMessages ? Mail : Bell;
  const title = isMessages ? 'Messages' : scope === 'approvals' ? 'Approvals' : 'Notifications';

  const resolveHref = useCallback((href?: string) => {
    if (!href) return undefined;
    return inEssPortal ? normalizeEssNotificationHref(href) : href;
  }, [inEssPortal]);

  const visibleItems = useMemo(() => {
    const items = (payload?.notifications || [])
      .filter((item) => !dismissedIds.has(item.id))
      .map((item) => ({
        ...item,
        href: resolveHref(item.href),
        status: readIds.has(item.id) ? 'Read' as const : item.status,
      }));
    return items;
  }, [payload?.notifications, dismissedIds, readIds, resolveHref]);

  const unread = useMemo(() => {
    if (!visibleItems.length) return 0;
    if (scope === 'messages') return visibleItems.filter((item) => item.kind === 'Message' && item.status === 'Unread').length;
    if (scope === 'approvals') return visibleItems.filter((item) => ['Approval', 'Workflow'].includes(item.kind) && item.status === 'Unread').length;
    if (scope === 'all') return visibleItems.filter((item) => item.status === 'Unread').length;
    return visibleItems.filter((item) => item.kind !== 'Message' && item.status === 'Unread').length;
  }, [visibleItems, scope]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/notifications?scope=${scope}`, { cache: 'no-store', headers: essFetchHeaders(inEssPortal) });
      const json = (await res.json()) as ApiResponse;
      if (!res.ok || json.status !== 'success' || !json.data) throw new Error(json.error || `Unable to load ${title.toLowerCase()}`);
      const dismissed = readDismissedIds();
      const read = readReadIds();
      setDismissedIds(dismissed);
      setReadIds(read);
      setPayload({
        ...json.data,
        notifications: json.data.notifications
          .filter((item) => !dismissed.has(item.id))
          .map((item) => ({
            ...item,
            // Prefer server status; only apply sessionStorage read overlay for live ids still Unread.
            status: item.status === 'Unread' && read.has(item.id) ? 'Read' as const : item.status,
          })),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : `Unable to load ${title.toLowerCase()}`);
    } finally {
      setLoading(false);
    }
  }, [scope, title, inEssPortal]);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const interval = window.setInterval(() => void load(), 60000);
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, []);

  const markReadLocally = (ids: string[]) => {
    const next = new Set(readIds);
    ids.forEach((id) => next.add(id));
    setReadIds(next);
    writeReadIds(next);
    setPayload((current) => current
      ? {
          ...current,
          notifications: current.notifications.map((item) => ids.includes(item.id) ? { ...item, status: 'Read' as const } : item),
        }
      : current);
  };

  const dismissLocally = (ids: string[]) => {
    const next = new Set(dismissedIds);
    ids.forEach((id) => next.add(id));
    setDismissedIds(next);
    writeDismissedIds(next);
    setPayload((current) => current
      ? {
          ...current,
          notifications: current.notifications.filter((item) => !ids.includes(item.id)),
        }
      : current);
  };

  const persistUpdate = async (action: 'mark-read' | 'archive' | 'mark-all-read', persistedIds: string[] = []) => {
    try {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', ...essFetchHeaders(inEssPortal) },
        body: JSON.stringify({ action, ids: action === 'mark-all-read' ? [] : persistedIds }),
      });
      const json = (await res.json()) as ApiResponse;
      if (!res.ok || json.status !== 'success' || !json.data) throw new Error(json.error || 'Notification update failed');
      // Reload scoped feed so bell/mail panels stay accurate after updates.
      await load();
    } catch {
      // Keep optimistic UI state when persistence is unavailable (for example IIS EPERM).
    }
  };

  const update = (action: 'mark-read' | 'archive' | 'mark-all-read', ids: string[] = []) => {
    setError('');
    const liveIds = ids.filter((id) => isLiveNotificationId(id));
    const persistedIds = ids.filter((id) => !isLiveNotificationId(id));

    if (action === 'archive' && ids.length) dismissLocally(ids);
    if (action === 'mark-read' && ids.length) markReadLocally(ids);
    if (action === 'mark-all-read') {
      const allIds = (payload?.notifications || []).map((item) => item.id);
      markReadLocally(allIds);
    }

    // Persist both stored and live notification state so badges/messages stay updated after refresh.
    if (action === 'mark-all-read' || persistedIds.length || liveIds.length) {
      void persistUpdate(action, action === 'mark-all-read' ? [] : [...persistedIds, ...liveIds]);
    }
  };

  const openNotification = (item: NotificationRecord) => {
    if (item.href) {
      setOpen(false);
      router.push(item.href);
    }
    if (item.status === 'Unread') {
      update('mark-read', [item.id]);
    }
  };

  return (
    <div ref={panelRef} className={`relative ${className}`}>
      <button
        type="button"
        aria-label={`Open ${title.toLowerCase()}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
      >
        <Icon className="h-5 w-5" />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-red-600 px-1 text-center text-[9px] font-black leading-4 text-white ring-2 ring-white">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="fixed inset-x-2 top-16 z-50 max-h-[calc(100vh-5rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl sm:absolute sm:inset-auto sm:right-0 sm:top-11 sm:w-[390px]">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-black text-slate-950">{title}</p>
              <p className="text-xs font-semibold text-slate-500">{unread} unread across enterprise modules</p>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => void load()} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-50" aria-label="Refresh notifications">
                <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button type="button" onClick={() => update('mark-all-read')} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-50" aria-label="Mark all as read">
                <CheckCheck className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => setOpen(false)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-50" aria-label="Close notifications">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {error ? <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-xs font-bold text-red-800">{error}</div> : null}

          <div className="max-h-[62vh] space-y-2 overflow-y-auto p-2">
            {visibleItems.map((item) => (
              <article
                key={item.id}
                className={`group rounded-lg border p-3 ${item.status === 'Unread' ? severityClass[item.severity] : 'border-slate-200 bg-white text-slate-700'} ${item.href ? 'cursor-pointer hover:shadow-sm' : ''}`}
                onClick={() => item.href && openNotification(item)}
                onKeyDown={(event) => {
                  if (item.href && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    openNotification(item);
                  }
                }}
                role={item.href ? 'button' : undefined}
                tabIndex={item.href ? 0 : undefined}
              >
                <div className="flex items-start gap-3">
                  <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${item.status === 'Unread' ? dotClass[item.severity] : 'bg-slate-300'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-black uppercase text-slate-500">{item.module}</p>
                      <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-black text-slate-600 ring-1 ring-slate-200">{item.kind}</span>
                    </div>
                    <h3 className="mt-1 text-sm font-black leading-5 text-slate-950">{item.title}</h3>
                    <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">{item.body}</p>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        {item.actor || 'System'} · {timeText(item.createdAt)}
                      </span>
                      <div className="flex items-center gap-1">
                        {item.status === 'Unread' ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              update('mark-read', [item.id]);
                            }}
                            className="rounded-md px-2 py-1 text-[11px] font-black text-slate-600 hover:bg-white"
                            aria-label={`Mark ${item.title} as read`}
                          >
                            Read
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            update('archive', [item.id]);
                          }}
                          className="rounded-md p-1.5 text-slate-500 hover:bg-white"
                          aria-label={`Archive ${item.title}`}
                        >
                          <Archive className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    {item.href ? (
                      <Link
                        href={item.href}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          openNotification(item);
                        }}
                        className="mt-3 inline-flex items-center gap-1 text-xs font-black text-blue-700 hover:text-blue-900"
                      >
                        Open item <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
            {!loading && !visibleItems.length ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center">
                <p className="text-sm font-black text-slate-800">No {title.toLowerCase()}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">New workflow alerts and enterprise communications will appear here.</p>
              </div>
            ) : null}
            {loading && !visibleItems.length ? <div className="px-4 py-8 text-center text-sm font-bold text-slate-500">Loading {title.toLowerCase()}...</div> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
