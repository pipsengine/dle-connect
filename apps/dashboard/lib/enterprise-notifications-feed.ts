import type { SessionPayload } from '@/lib/auth/session';
import {
  applyLiveNotificationOverrides,
  computeNotificationCounts,
  emptyCounts,
  listEnterpriseNotifications,
  mergeNotificationFeeds,
  type EnterpriseNotification,
  type NotificationScope,
} from '@/lib/enterprise-notifications-store';
import { buildEssEmployeeLookupKeys } from '@/lib/ess-dashboard-store';
import { listLiveLeaveApprovalNotifications } from '@/lib/leave-workflow-service';
import { readDirectoryEmployees } from '@/lib/payroll-employee-source';
import { resolveNotificationHref } from '@/lib/ess-notification-routing';
import { normalizePayrollMatchKey } from '@/lib/sage-people-payroll-store';
import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';

const resolveSessionEmployee = async (session: SessionPayload) => {
  const { employees } = await readDirectoryEmployees();
  const identities = [session.employeeCode, session.employeeId, session.username]
    .map((value) => normalizePayrollMatchKey(value))
    .filter(Boolean);
  const employee = employees.find((item: DleEmployeeDirectoryRow) => {
    const keys = buildEssEmployeeLookupKeys(item).map((key: string) => normalizePayrollMatchKey(key)).filter(Boolean);
    return identities.some((identity) => keys.includes(identity));
  });
  return { employee, employees };
};

export const loadLiveLeaveFeed = async (session: SessionPayload) => {
  try {
    const { employee, employees } = await resolveSessionEmployee(session);
    if (!employee) return [] as Awaited<ReturnType<typeof listLiveLeaveApprovalNotifications>>;
    return await listLiveLeaveApprovalNotifications({
      actor: employee,
      employees,
      roles: session.roles || [],
      isGlobalAdmin: session.isGlobalAdmin,
    });
  } catch (error) {
    console.warn('[notifications] live leave feed unavailable', error);
    return [] as Awaited<ReturnType<typeof listLiveLeaveApprovalNotifications>>;
  }
};

export const buildMergedNotificationFeed = async (
  session: SessionPayload,
  scope: NotificationScope = 'all',
  essContext = false,
) => {
  const base = await listEnterpriseNotifications(session, scope).catch(() => ({
    notifications: [] as EnterpriseNotification[],
    counts: emptyCounts(),
  }));

  let notifications = base.notifications;
  if (scope === 'all' || scope === 'approvals' || scope === 'notifications') {
    const live = await loadLiveLeaveFeed(session);
    notifications = mergeNotificationFeeds(notifications, live).filter((item) => {
      if (scope === 'approvals') return item.kind === 'Approval' || item.kind === 'Workflow';
      if (scope === 'notifications') return item.kind !== 'Message';
      return true;
    });
    notifications = await applyLiveNotificationOverrides(session, notifications);
  }

  notifications = notifications.map((item) => ({
    ...item,
    href: resolveNotificationHref(session, item.href, essContext),
  }));

  return {
    notifications,
    counts: computeNotificationCounts(notifications),
  };
};

export const unreadNotificationCountForSession = async (session: SessionPayload) => {
  const data = await buildMergedNotificationFeed(session, 'all');
  return data.counts.unread;
};
