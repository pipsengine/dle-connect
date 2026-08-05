import { promises as fs } from 'fs';
import path from 'path';
import type { SessionPayload } from '@/lib/auth/session';
import {
  essSeedNotificationHrefs,
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

type NotificationFile = {
  schemaVersion: number;
  notifications: EnterpriseNotification[];
};

export type NotificationScope = 'all' | 'messages' | 'notifications' | 'approvals';

const compact = (value: unknown) => String(value || '').trim();
const normalizeRecipientKey = (value: unknown) => compact(value).toUpperCase();

const notificationsCandidatePaths = () => {
  const override = compact(process.env.DLE_NOTIFICATIONS_PATH);
  if (override) return [override];
  const cwd = process.cwd();
  const dashboardRoot = /[\\/]apps[\\/]dashboard$/i.test(cwd) ? cwd : path.join(cwd, 'apps', 'dashboard');
  // Prefer apps/dashboard/data so Next/IIS/scripts share one store regardless of process.cwd().
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

const readStore = async (): Promise<NotificationFile> => {
  let lastAccessError: unknown = null;
  for (const dataFile of notificationsCandidatePaths()) {
    try {
      const raw = await fs.readFile(dataFile, 'utf8');
      const parsed = JSON.parse(raw) as NotificationFile;
      return {
        schemaVersion: parsed.schemaVersion || 1,
        notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
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
  return { schemaVersion: 1, notifications: [] };
};

const writeStore = async (store: NotificationFile) => {
  const payload = `${JSON.stringify(store, null, 2)}\n`;
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

const seededNotifications = (session: SessionPayload): EnterpriseNotification[] => {
  const essMode = isEssSelfServiceSession(session);
  const base = {
    recipientUserId: session.sub,
    recipientUsername: session.username,
    recipientEmployeeCode: session.employeeCode || session.employeeId,
    recipientRoles: session.roles,
    channels: ['In-App', 'Email'] as Array<'In-App' | 'Email'>,
  };
  const managerLike = session.permissions.includes('*') || session.permissions.some((permission) => permission.includes('approval') || permission.includes('admin') || permission.includes('payroll') || permission.includes('hris'));
  const seeds: EnterpriseNotification[] = [
    {
      ...base,
      id: `security-session-${session.sub}`,
      kind: 'Security',
      module: 'Security & MFA',
      title: 'Enterprise session secured',
      body: 'Your current enterprise access is protected by RBAC, session controls, and activity logging.',
      severity: 'success',
      status: 'Unread',
      href: essMode ? '/workforce-portal?tab=security' : '/hris/administration/audit-trail',
      createdAt: nowIso(),
      actor: 'Security Service',
      metadata: { persistentSeed: true },
    },
    {
      ...base,
      id: `profile-review-${session.sub}`,
      kind: 'Notification',
      module: 'Employee Profile',
      title: 'Review your employee profile',
      body: 'Keep contact details, emergency contacts, bank details, and supporting documents up to date.',
      severity: 'info',
      status: 'Unread',
      href: essMode ? '/workforce-portal?tab=profile' : '/hris/employees/employee-profile',
      createdAt: nowIso(),
      actor: 'HRIS',
      metadata: { persistentSeed: true },
    },
    {
      ...base,
      id: `payslip-ready-${session.sub}`,
      kind: 'Notification',
      module: 'Payroll Management',
      title: 'Payroll self-service available',
      body: 'Payslips, deductions, pension contributions, allowances, and loan deductions can be reviewed from payroll self-service.',
      severity: 'info',
      status: 'Unread',
      href: essMode ? '/workforce-portal?tab=payroll' : '/hris/payroll/payslip-generation',
      createdAt: nowIso(),
      actor: 'Payroll Service',
      metadata: { persistentSeed: true },
    },
    {
      ...base,
      id: `hr-message-${session.sub}`,
      kind: 'Message',
      module: 'Communication Center',
      title: 'HR communication center is active',
      body: 'Company announcements, policy updates, request comments, and service messages will appear here.',
      severity: 'info',
      status: 'Unread',
      href: essMode ? '/workforce-portal?tab=communication' : '/hris/announcements',
      createdAt: nowIso(),
      actor: 'Human Capital',
      metadata: { persistentSeed: true },
    },
  ];

  if (managerLike) {
    seeds.push(
      {
        ...base,
        id: `approval-queue-${session.sub}`,
        kind: 'Approval',
        module: 'Workflow & Approvals',
        title: 'Approval queue requires review',
        body: 'Review pending HR, payroll, leave, workforce, and employee service requests according to your role permissions.',
        severity: 'warning',
        status: 'Unread',
        href: essMode ? '/workforce-portal?tab=leave&leaveSection=Approvals' : '/hris/administration/approval-workflow',
        createdAt: nowIso(),
        actor: 'Workflow Engine',
        metadata: { persistentSeed: true },
      },
      {
        ...base,
        id: `timesheet-approval-${session.sub}`,
        kind: 'Workflow',
        module: 'Workforce Management',
        title: 'Timesheet and attendance actions available',
        body: 'Timesheet periods, project approvals, attendance exceptions, and payroll-ready hours are available for review.',
        severity: 'warning',
        status: 'Unread',
        href: essMode ? '/workforce-portal?tab=time' : '/hris/time-and-logs/timesheet-approval',
        createdAt: nowIso(),
        actor: 'Workforce Management',
        metadata: { persistentSeed: true },
      }
    );
  }

  return seeds;
};

const migrateSeededHrefs = (session: SessionPayload, store: NotificationFile) => {
  if (!isEssSelfServiceSession(session)) return store;
  const hrefs = essSeedNotificationHrefs(session);
  store.notifications = store.notifications.map((item) => {
    const nextHref = hrefs[item.id] || normalizeEssNotificationHref(item.href);
    if (!nextHref || nextHref === item.href) return item;
    return { ...item, href: nextHref };
  });
  return store;
};

const ensureSeeded = async (session: SessionPayload) => {
  let store = await readStore();
  const existingIds = new Set(store.notifications.map((item) => item.id));
  const missing = seededNotifications(session).filter((item) => !existingIds.has(item.id));
  if (missing.length) store.notifications.push(...missing);
  const before = JSON.stringify(store.notifications);
  store = migrateSeededHrefs(session, store);
  if (missing.length || JSON.stringify(store.notifications) !== before) await writeStore(store);
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

export const listEnterpriseNotifications = async (session: SessionPayload, scope: NotificationScope = 'all') => {
  const store = await ensureSeeded(session);
  const items = store.notifications
    .filter((item) => ownerMatches(item, session))
    .filter(byScope(scope))
    .filter((item) => item.status !== 'Archived')
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const allVisible = store.notifications.filter((item) => ownerMatches(item, session) && item.status !== 'Archived');
  return {
    notifications: withResolvedHrefs(session, items),
    counts: {
      unread: allVisible.filter((item) => item.status === 'Unread').length,
      notifications: allVisible.filter((item) => item.kind !== 'Message' && item.status === 'Unread').length,
      messages: allVisible.filter((item) => item.kind === 'Message' && item.status === 'Unread').length,
      approvals: allVisible.filter((item) => ['Approval', 'Workflow'].includes(item.kind) && item.status === 'Unread').length,
      critical: allVisible.filter((item) => item.severity === 'critical' && item.status === 'Unread').length,
    },
  };
};

export const updateEnterpriseNotifications = async (session: SessionPayload, ids: string[], action: 'mark-read' | 'archive' | 'mark-all-read') => {
  const store = await ensureSeeded(session);
  const idSet = new Set(ids);
  const at = nowIso();
  store.notifications = store.notifications.map((item) => {
    const selected = action === 'mark-all-read' ? ownerMatches(item, session) && item.status !== 'Archived' : idSet.has(item.id) && ownerMatches(item, session);
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
