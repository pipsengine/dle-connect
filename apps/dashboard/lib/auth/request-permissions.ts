import { effectivePermissionsForUser } from '@/lib/auth/access-control-store';
import { resolveAccessPermissions } from '@/lib/auth/resolve-access-session';
import { isSuperActor } from '@/lib/auth/role-delegation';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';

const readAuthToken = (request: Request) => {
  const raw = (request.headers.get('cookie') || '')
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${AUTH_COOKIE}=`))
    ?.split('=')
    .slice(1)
    .join('=');
  return raw ? decodeURIComponent(raw) : '';
};

const headerPermissions = (request: Request) =>
  (request.headers.get('x-auth-permissions') || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

/** Resolve live permissions for API/server handlers (not middleware — Node runtime only). */
export const permissionsForRequest = async (request: Request) => {
  const session = await verifySessionToken(readAuthToken(request));
  if (!session) return headerPermissions(request);
  if (isSuperActor(session)) return ['*'];
  try {
    const live = await effectivePermissionsForUser(session.sub, session.roles);
    if (Array.isArray(live) && live.length) return live;
  } catch {
    /* fall through */
  }
  const resolved = resolveAccessPermissions(session);
  return resolved.length ? resolved : headerPermissions(request);
};
