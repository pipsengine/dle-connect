import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import {
  createEnterpriseNotification,
  updateEnterpriseNotifications,
  updateLiveNotificationOverrides,
  type NotificationScope,
} from '@/lib/enterprise-notifications-store';
import {
  buildMergedNotificationFeed,
  loadLiveLeaveFeed,
} from '@/lib/enterprise-notifications-feed';
import {
  isLiveNotificationId,
  resolveNotificationHref,
  shouldUseEssNotificationRouting,
} from '@/lib/ess-notification-routing';

const getSession = async (request: NextRequest) => verifySessionToken(request.cookies.get(AUTH_COOKIE)?.value);

const scopeFrom = (request: NextRequest): NotificationScope => {
  const scope = request.nextUrl.searchParams.get('scope');
  if (scope === 'messages' || scope === 'notifications' || scope === 'approvals') return scope;
  return 'all';
};

const essContextFrom = (request: NextRequest) =>
  request.headers.get('x-ess-context') === 'workforce-portal';

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ status: 'error', error: 'Unauthenticated' }, { status: 401 });

  const essContext = essContextFrom(request);
  const scope = scopeFrom(request);
  const data = await buildMergedNotificationFeed(session, scope, essContext);
  return NextResponse.json({ status: 'success', data });
}

export async function PATCH(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ status: 'error', error: 'Unauthenticated' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { action?: string; ids?: string[] };
  if (body.action !== 'mark-read' && body.action !== 'archive' && body.action !== 'mark-all-read') {
    return NextResponse.json({ status: 'error', error: 'Unsupported notification action' }, { status: 400 });
  }

  const requestedIds = Array.isArray(body.ids) ? body.ids : [];
  const liveIds = requestedIds.filter((id) => isLiveNotificationId(id));
  const persistedIds = requestedIds.filter((id) => !isLiveNotificationId(id));
  const essContext = essContextFrom(request);

  if (body.action === 'mark-all-read') {
    await updateEnterpriseNotifications(session, [], 'mark-all-read');
    const live = await loadLiveLeaveFeed(session);
    await updateLiveNotificationOverrides(
      session,
      live.map((item) => item.id),
      'mark-all-read',
    );
  } else {
    if (persistedIds.length) {
      await updateEnterpriseNotifications(session, persistedIds, body.action);
    }
    if (liveIds.length) {
      await updateLiveNotificationOverrides(session, liveIds, body.action);
    }
    if (!persistedIds.length && !liveIds.length) {
      return NextResponse.json({ status: 'error', error: 'No notification ids provided' }, { status: 400 });
    }
  }

  const data = await buildMergedNotificationFeed(session, 'all', essContext);
  if (shouldUseEssNotificationRouting(session, essContext)) {
    data.notifications = data.notifications.map((item) => ({
      ...item,
      href: resolveNotificationHref(session, item.href, essContext),
    }));
  }
  return NextResponse.json({ status: 'success', data });
}

export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ status: 'error', error: 'Unauthenticated' }, { status: 401 });
  if (!session.permissions.includes('*') && !session.permissions.some((permission) => permission.includes('admin') || permission.includes('workflow'))) {
    return NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { title?: string; body?: string; module?: string };
  if (!body.title || !body.body || !body.module) {
    return NextResponse.json({ status: 'error', error: 'title, body, and module are required' }, { status: 400 });
  }
  const notification = await createEnterpriseNotification(session, body as Parameters<typeof createEnterpriseNotification>[1]);
  return NextResponse.json({ status: 'success', data: { notification } }, { status: 201 });
}
