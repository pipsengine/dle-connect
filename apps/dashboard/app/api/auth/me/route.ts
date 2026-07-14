import { NextResponse } from 'next/server';
import { effectivePermissionsForUser } from '@/lib/auth/access-control-store';
import {
  AUTH_COOKIE,
  authCookieMaxAgeForUser,
  authCookieOptions,
  clearAuthCookieOptions,
  refreshSessionToken,
  verifySessionToken,
} from '@/lib/auth/session';

const readAuthToken = (request: Request) => {
  const cookie = request.headers.get('cookie') || '';
  const raw = cookie
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${AUTH_COOKIE}=`))
    ?.split('=')
    .slice(1)
    .join('=');
  return raw ? decodeURIComponent(raw) : '';
};

export async function GET(request: Request) {
  const session = await verifySessionToken(readAuthToken(request));
  if (!session) {
    const response = NextResponse.json({ status: 'error', error: 'Unauthenticated' }, { status: 401 });
    response.cookies.set(AUTH_COOKIE, '', clearAuthCookieOptions(request));
    return response;
  }

  const permissions = session.isGlobalAdmin || session.sub === 'global-admin'
    ? ['*']
    : await effectivePermissionsForUser(session.sub, session.roles);
  const data = { ...session, permissions, lastActivityAt: Math.floor(Date.now() / 1000) };
  const response = NextResponse.json({ status: 'success', data });
  response.cookies.set(
    AUTH_COOKIE,
    await refreshSessionToken(session, permissions),
    authCookieOptions(request, { maxAgeSeconds: authCookieMaxAgeForUser(session) }),
  );
  return response;
}
