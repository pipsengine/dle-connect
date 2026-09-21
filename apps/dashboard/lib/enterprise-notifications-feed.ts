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
import { resolveDirectoryEmployeeForSession } from '@/lib/directory-employee-resolve';
import { listLiveLeaveApprovalNotifications } from '@/lib/leave-workflow-service';
import { readDirectoryEmployees } from '@/lib/payroll-employee-source';
import { resolveNotificationHref } from '@/lib/ess-notification-routing';

const resolveSessionEmployee = async (session: SessionPayload) => {
  const { employees } = await readDirectoryEmployees();
  const employee = resolveDirectoryEmployeeForSession(employees, {
    employeeCode: session.employeeCode,
    employeeId: session.employeeId,
    username: session.username,
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
