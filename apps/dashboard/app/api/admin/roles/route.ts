import { NextResponse } from 'next/server';
import { effectivePermissionsForUser } from '@/lib/auth/access-control-store';
import { rolesPayload } from '@/lib/auth/auth-store';
import { AUTH_COOKIE, hasPermission, verifySessionToken } from '@/lib/auth/session';

export async function GET(request: Request) {
  const cookie = request.headers.get('cookie') || '';
  const token = cookie.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${AUTH_COOKIE}=`))?.split('=').slice(1).join('=');
  const session = await verifySessionToken(token ? decodeURIComponent(token) : '');
  if (!session) return NextResponse.json({ status: 'error', error: 'Unauthenticated' }, { status: 401 });
  const permissions = await effectivePermissionsForUser(session.sub, session.roles);
  if (!hasPermission(permissions, 'admin.roles.view') && !hasPermission(permissions, 'admin.*')) return NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 });
  return NextResponse.json({ status: 'success', data: rolesPayload() });
}
