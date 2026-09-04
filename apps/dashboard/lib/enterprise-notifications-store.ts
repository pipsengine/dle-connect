import { promises as fs } from 'fs';
import path from 'path';
import type { SessionPayload } from '@/lib/auth/session';
import {
  isEssSelfServiceSession,
  normalizeEssNotificationHref,
  resolveNotificationHref,
} from '@/lib/ess-notification-routing';

export type NotificationSeverity = 'info' | 'success' | 'warning' | 'critical';
export type NotificationStatus = 'Unread' | 'Read' | 'Archived';
export type NotificationKind = 'Notification' | 'Message' | 'Approval' | 'Security' | 'Workflow';

export type EnterpriseNotification = {
  id: string;
  recipientUserId: string;
  recipientUsername: string;
  recipientEmployeeCode?: string;
  recipientRoles: string[];
  kind: NotificationKind;
  module: string;
  title: string;
  body: string;
  severity: NotificationSeverity;
  status: NotificationStatus;
  href?: string;
  createdAt: string;
  readAt?: string;
  archivedAt?: string;
  actor?: string;
  channels: Array<'In-App' | 'Email' | 'SMS'>;
  metadata?: Record<string, string | number | boolean>;
};

export type LiveNotificationOverride = {
  id: string;
  userKey: string;
  status: 'Read' | 'Archived';
  updatedAt: string;
};

type NotificationFile = {
  schemaVersion: number;
  notifications: EnterpriseNotification[];
  liveOverrides?: LiveNotificationOverride[];
};

export type NotificationScope = 'all' | 'messages' | 'notifications' | 'approvals';

export type NotificationCounts = {
  unread: number;
  notifications: number;
  messages: number;
  approvals: number;
  critical: number;
};

const compact = (value: unknown) => String(value || '').trim();
const normalizeRecipientKey = (value: unknown) => compact(value).toUpperCase();

const notificationsCandidatePaths = () => {
  const override = compact(process.env.DLE_NOTIFICATIONS_PATH);
  if (override) return [override];
  const cwd = process.cwd();
  const dashboardRoot = /[\\/]apps[\\/]dashboard$/i.test(cwd) ? cwd : path.join(cwd, 'apps', 'dashboard');
  return [
    path.join(dashboardRoot, 'data', 'enterprise', 'notifications.json'),
    path.join(cwd, 'data', 'enterprise', 'notifications.json'),
  ];
};

const isStorageAccessError = (error: unknown) => {
  const code = (error as NodeJS.ErrnoException).code;
  return code === 'EPERM' || code === 'EACCES' || code === 'EROFS';
};

const nowIso = () => new Date().toISOString();

const emptyCounts = (): NotificationCounts => ({
  unread: 0,
  notifications: 0,
  messages: 0,
  approvals: 0,
  critical: 0,
});

const isPersistentSeed = (item: EnterpriseNotification) => {
  if (item.metadata?.persistentSeed === true) return true;
  return /^(security-session|profile-review|payslip-ready|hr-message|approval-queue|timesheet-approval)-/i.test(item.id);
};

const readStore = async (): Promise<NotificationFile> => {
  let lastAccessError: unknown = null;
  for (const dataFile of notificationsCandidatePaths()) {
    try {
      const raw = await fs.readFile(dataFile, 'utf8');
      const parsed = JSON.parse(raw) as NotificationFile;
      return {
        schemaVersion: parsed.schemaVersion || 1,
        notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
        liveOverrides: Array.isArray(parsed.liveOverrides) ? parsed.liveOverrides : [],
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') continue;
      if (isStorageAccessError(error)) {
        lastAccessError = error;
        continue;
      }
      throw error;
    }
  }
  if (lastAccessError) {
    console.warn('[enterprise-notifications] Unable to read notifications store; continuing with empty feed.', lastAccessError);
  }
  return { schemaVersion: 1, notifications: [], liveOverrides: [] };
};

const writeStore = async (store: NotificationFile) => {
  const payload = `${JSON.stringify({
    schemaVersion: store.schemaVersion || 1,
    notifications: store.notifications || [],
    liveOverrides: store.liveOverrides || [],
  }, null, 2)}\n`;
  let lastAccessError: unknown = null;
  for (const dataFile of notificationsCandidatePaths()) {
    try {
      await fs.mkdir(path.dirname(dataFile), { recursive: true });
      await fs.writeFile(dataFile, payload, 'utf8');
      return true;
    } catch (error) {
      if (isStorageAccessError(error)) {
        lastAccessError = error;
        continue;
      }
      throw error;
    }
  }
  if (lastAccessError) {
    console.warn('[enterprise-notifications] Unable to persist notifications store.', lastAccessError);
  }
  return false;
};

const ownerMatches = (item: EnterpriseNotification, session: SessionPayload) => {
  const sessionKeys = new Set([
    normalizeRecipientKey(session.sub),
    normalizeRecipientKey(session.username),
    normalizeRecipientKey(session.employeeCode),
    normalizeRecipientKey(session.employeeId),
  ].filter(Boolean));

  const recipientKeys = new Set([
    normalizeRecipientKey(item.recipientUserId),
    normalizeRecipientKey(item.recipientUsername),
    normalizeRecipientKey(item.recipientEmployeeCode),
  ].filter(Boolean));

  if ([...sessionKeys].some((key) => recipientKeys.has(key))) return true;
  if (item.recipientRoles.some((role) => session.roles.map((entry) => entry.toLowerCase()).includes(role.toLowerCase()))) return true;
  return false;
};

const sessionOverrideKeys = (session: SessionPayload) =>
  new Set([
    normalizeRecipientKey(session.sub),
    normalizeRecipientKey(session.username),
    normalizeRecipientKey(session.employeeCode),
    normalizeRecipientKey(session.employeeId),
  ].filter(Boolean));

const migrateEssHrefs = (session: SessionPayload, store: NotificationFile) => {
  if (!isEssSelfServiceSession(session)) return store;
  store.notifications = store.notifications.map((item) => {
    const nextHref = normalizeEssNotificationHref(item.href);
    if (!nextHref || nextHref === item.href) return item;
    return { ...item, href: nextHref };
  });
  return store;
};

/** Remove static demo seeds that previously flooded every inbox with the same messages. */
const purgePersistentSeeds = async (session: SessionPayload) => {
  let store = await readStore();
  const before = store.notifications.length;
  store.notifications = store.notifications.filter((item) => !isPersistentSeed(item));
  const beforeJson = JSON.stringify(store.notifications);
  store = migrateEssHrefs(session, store);
  if (store.notifications.length !== before || JSON.stringify(store.notifications) !== beforeJson) {
    await writeStore(store);
  }
  return store;
};

const withResolvedHrefs = (session: SessionPayload, items: EnterpriseNotification[]) =>
  items.map((item) => ({
    ...item,
    href: resolveNotificationHref(session, item.href),
  }));

const byScope = (scope: NotificationScope) => (item: EnterpriseNotification) => {
  if (scope === 'messages') return item.kind === 'Message';
  if (scope === 'approvals') return item.kind === 'Approval' || item.kind === 'Workflow';
  if (scope === 'notifications') return item.kind !== 'Message';
  return true;
};

export const computeNotificationCounts = (items: EnterpriseNotification[]): NotificationCounts => {
  const visible = items.filter((item) => item.status !== 'Archived');
  return {
    unread: visible.filter((item) => item.status === 'Unread').length,
    notifications: visible.filter((item) => item.kind !== 'Message' && item.status === 'Unread').length,
    messages: visible.filter((item) => item.kind === 'Message' && item.status === 'Unread').length,
    approvals: visible.filter((item) => ['Approval', 'Workflow'].includes(item.kind) && item.status === 'Unread').length,
    critical: visible.filter((item) => item.severity === 'critical' && item.status === 'Unread').length,
  };
};

export const listEnterpriseNotifications = async (session: SessionPayload, scope: NotificationScope = 'all') => {
  const store = await purgePersistentSeeds(session);
  const items = store.notifications
    .filter((item) => ownerMatches(item, session))
    .filter(byScope(scope))
    .filter((item) => item.status !== 'Archived')
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const allVisible = store.notifications.filter((item) => ownerMatches(item, session) && item.status !== 'Archived');
  return {
    notifications: withResolvedHrefs(session, items),
    counts: computeNotificationCounts(allVisible),
  };
};

export const applyLiveNotificationOverrides = async <T extends { id: string; status: NotificationStatus }>(
  session: SessionPayload,
  items: T[],
): Promise<T[]> => {
  const store = await readStore();
  const keys = sessionOverrideKeys(session);
  const byId = new Map(
    (store.liveOverrides || [])
      .filter((entry) => keys.has(normalizeRecipientKey(entry.userKey)))
      .map((entry) => [entry.id, entry] as const),
  );
  return items
    .map((item) => {
      const override = byId.get(item.id);
      if (!override) return item;
      return { ...item, status: override.status as T['status'] };
    })
    .filter((item) => item.status !== 'Archived');
};

export const updateLiveNotificationOverrides = async (
  session: SessionPayload,
  ids: string[],
  action: 'mark-read' | 'archive' | 'mark-all-read',
) => {
  if (!ids.length) return;
  const store = await readStore();
  const keys = sessionOverrideKeys(session);
  const primaryKey = normalizeRecipientKey(session.sub || session.username || session.employeeCode || session.employeeId);
  if (!primaryKey) return;
  const at = nowIso();
  const idSet = new Set(ids);
  const next = (store.liveOverrides || []).filter((entry) => {
    if (!keys.has(normalizeRecipientKey(entry.userKey))) return true;
    return !idSet.has(entry.id);
  });
  for (const id of idSet) {
    next.push({
      id,
      userKey: primaryKey,
      status: action === 'archive' ? 'Archived' : 'Read',
      updatedAt: at,
    });
  }
  store.liveOverrides = next;
  await writeStore(store);
};

export const updateEnterpriseNotifications = async (
  session: SessionPayload,
  ids: string[],
  action: 'mark-read' | 'archive' | 'mark-all-read',
) => {
  const store = await purgePersistentSeeds(session);
  const idSet = new Set(ids);
  const at = nowIso();
  store.notifications = store.notifications.map((item) => {
    const selected = action === 'mark-all-read'
      ? ownerMatches(item, session) && item.status !== 'Archived'
      : idSet.has(item.id) && ownerMatches(item, session);
    if (!selected) return item;
    if (action === 'archive') return { ...item, status: 'Archived', archivedAt: at, readAt: item.readAt || at };
    return { ...item, status: 'Read', readAt: item.readAt || at };
  });
  const wrote = await writeStore(store);
  if (!wrote) {
    return listEnterpriseNotifications(session);
  }
  return listEnterpriseNotifications(session);
};

export const mergeNotificationFeeds = (
  persisted: EnterpriseNotification[],
  live: Array<Omit<EnterpriseNotification, 'recipientUserId' | 'recipientUsername' | 'recipientEmployeeCode' | 'recipientRoles'>>,
) => {
  const seen = new Set(persisted.map((item) => item.id));
  const merged = [...persisted];
  for (const item of live) {
    if (seen.has(item.id)) continue;
    merged.unshift({
      ...item,
      recipientUserId: '',
      recipientUsername: '',
      recipientEmployeeCode: undefined,
      recipientRoles: [],
    });
  }
  return merged.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
};

export const createEnterpriseNotification = async (
  session: SessionPayload,
  notification: Pick<EnterpriseNotification, 'title' | 'body' | 'module'> &
    Partial<Omit<EnterpriseNotification, 'id' | 'recipientUserId' | 'recipientUsername' | 'title' | 'body' | 'module' | 'createdAt' | 'status'>>
) => {
  const id = `ntf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const recipientCode = notification.recipientEmployeeCode || session.employeeCode;
  const record: EnterpriseNotification = {
    id,
    recipientUserId: recipientCode || session.sub,
    recipientUsername: recipientCode || session.username,
    recipientEmployeeCode: recipientCode,
    recipientRoles: notification.recipientRoles || [],
    kind: notification.kind || 'Notification',
    module: notification.module,
    title: notification.title,
    body: notification.body,
    severity: notification.severity || 'info',
    status: 'Unread',
    href: notification.href,
    createdAt: nowIso(),
    actor: notification.actor || session.fullName,
    channels: notification.channels || ['In-App'],
    metadata: notification.metadata,
  };
  try {
    const store = await readStore();
    store.notifications.unshift(record);
    await writeStore(store);
  } catch (error) {
    console.warn('[enterprise-notifications] Notification created in-memory only.', error);
  }
  return record;
};

export { emptyCounts };
