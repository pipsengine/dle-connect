import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import {
  createEnterpriseNotification,
  listEnterpriseNotifications,
  updateEnterpriseNotifications,
  type NotificationScope,
} from '@/lib/enterprise-notifications-store';

const getSession = async (request: NextRequest) => verifySessionToken(request.cookies.get(AUTH_COOKIE)?.value);

const scopeFrom = (request: NextRequest): NotificationScope => {
  const scope = request.nextUrl.searchParams.get('scope');
  if (scope === 'messages' || scope === 'notifications' || scope === 'approvals') return scope;
  return 'all';
};

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ status: 'error', error: 'Unauthenticated' }, { status: 401 });
  const data = await listEnterpriseNotifications(session, scopeFrom(request)).catch(() => ({
    notifications: [],
    counts: { unread: 0, notifications: 0, messages: 0, approvals: 0, critical: 0 },
  }));
  return NextResponse.json({ status: 'success', data });
}

export async function PATCH(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ status: 'error', error: 'Unauthenticated' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { action?: string; ids?: string[] };
  if (body.action !== 'mark-read' && body.action !== 'archive' && body.action !== 'mark-all-read') {
    return NextResponse.json({ status: 'error', error: 'Unsupported notification action' }, { status: 400 });
  }
  const data = await updateEnterpriseNotifications(session, Array.isArray(body.ids) ? body.ids : [], body.action);
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
