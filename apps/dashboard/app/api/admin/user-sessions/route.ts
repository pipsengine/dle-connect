import { NextResponse } from 'next/server';
import { hasPermission } from '@/lib/auth/permission-match';
import { appendAudit } from '@/lib/auth/auth-store';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { disconnectSession, listLiveSessions, removeSession, requestClientMeta } from '@/lib/auth/user-activity';

const cookieValue = (request: Request, name: string) => {
  const header = request.headers.get('cookie') || '';
  const part = header.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : '';
};

const canView = (request: Request) => {
  if (request.headers.get('x-auth-global-admin') === '1') return true;
  const permissions = (request.headers.get('x-auth-permissions') || '').split(',').map((item) => item.trim()).filter(Boolean);
  return hasPermission(permissions, 'page.admin.user-sessions.view');
};

const canControl = (request: Request) => {
  if (request.headers.get('x-auth-global-admin') === '1') return true;
  const permissions = (request.headers.get('x-auth-permissions') || '').split(',').map((item) => item.trim()).filter(Boolean);
  return hasPermission(permissions, 'button.admin.user-sessions.disconnect')
    || hasPermission(permissions, 'admin.users.edit')
    || hasPermission(permissions, 'security.configure');
};

export async function GET(request: Request) {
  if (!canView(request)) return NextResponse.json({ status: 'error', error: 'You do not have permission to view user sessions.' }, { status: 403 });
  const sessions = await listLiveSessions();
  return NextResponse.json({ status: 'success', data: { sessions } });
}

export async function POST(request: Request) {
  if (!canControl(request)) return NextResponse.json({ status: 'error', error: 'You do not have permission to change user sessions.' }, { status: 403 });
  const session = await verifySessionToken(cookieValue(request, AUTH_COOKIE));
  const body = await request.json().catch(() => ({})) as { action?: string; sessionKey?: string };
  const sessionKey = String(body.sessionKey || '');
  if (!sessionKey) return NextResponse.json({ status: 'error', error: 'Choose a session.' }, { status: 400 });
  const meta = requestClientMeta(request);
  const actor = session?.fullName || session?.username || request.headers.get('x-auth-user') || 'Administrator';
  if (body.action === 'disconnect') {
    await disconnectSession(sessionKey);
    await appendAudit({ user: actor, action: 'Session disconnected', ipAddress: meta.ipAddress, device: meta.device, newValue: sessionKey, performedBy: actor });
  } else if (body.action === 'remove') {
    await removeSession(sessionKey);
    await appendAudit({ user: actor, action: 'Session removed', ipAddress: meta.ipAddress, device: meta.device, newValue: sessionKey, performedBy: actor });
  } else {
    return NextResponse.json({ status: 'error', error: 'Unknown session action.' }, { status: 400 });
  }
  return NextResponse.json({ status: 'success', data: { sessions: await listLiveSessions() } });
}
