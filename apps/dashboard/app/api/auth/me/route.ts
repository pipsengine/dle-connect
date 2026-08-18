import { NextResponse } from 'next/server';
import { effectivePermissionsForUser } from '@/lib/auth/access-control-store';
import { permissionsForRoles } from '@/lib/auth/rbac';
import {
  AUTH_COOKIE,
  authCookieMaxAgeForUser,
  authCookieOptions,
  clearAuthCookieOptions,
  refreshSessionToken,
  verifySessionToken,
} from '@/lib/auth/session';

const PERMISSIONS_BUDGET_MS = 4000;

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

const resolvePermissionsWithBudget = async (session: NonNullable<Awaited<ReturnType<typeof verifySessionToken>>>) => {
  if (session.isGlobalAdmin || session.sub === 'global-admin') return ['*'];
  const roleFallback = permissionsForRoles(session.roles || []);
  try {
    const live = await Promise.race([
      effectivePermissionsForUser(session.sub, session.roles),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), PERMISSIONS_BUDGET_MS);
      }),
    ]);
    if (Array.isArray(live) && live.length) return live;
  } catch (error) {
    console.warn('[api/auth/me] effective permissions failed; using role fallback', error);
  }
  return roleFallback;
};

export async function GET(request: Request) {
  const session = await verifySessionToken(readAuthToken(request));
  if (!session) {
    const response = NextResponse.json({ status: 'error', error: 'Unauthenticated' }, { status: 401 });
    response.cookies.set(AUTH_COOKIE, '', clearAuthCookieOptions(request));
    return response;
  }

  const permissions = await resolvePermissionsWithBudget(session);
  const data = { ...session, permissions, lastActivityAt: Math.floor(Date.now() / 1000) };
  const response = NextResponse.json({ status: 'success', data });
  response.cookies.set(
    AUTH_COOKIE,
    await refreshSessionToken(session, permissions),
    authCookieOptions(request, { maxAgeSeconds: authCookieMaxAgeForUser(session) }),
  );
  return response;
}
