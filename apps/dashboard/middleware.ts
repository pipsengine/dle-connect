import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, clearAuthCookieOptions, isPublicPath, verifySessionToken } from '@/lib/auth/session';
import { canAccessRoute } from '@/lib/access/route-access';
import { deriveHrisRole } from '@/lib/hris-access';
import { permissionsForRoles } from '@/lib/auth/rbac';

const denied = (request: NextRequest, status = 403) => {
  if (request.nextUrl.pathname.startsWith('/api')) {
    const response = NextResponse.json({ status: 'error', error: status === 401 ? 'Unauthenticated' : 'Forbidden' }, { status });
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    if (status === 401) response.cookies.set(AUTH_COOKIE, '', clearAuthCookieOptions(request));
    return response;
  }
  const url = request.nextUrl.clone();
  url.pathname = status === 401 ? '/login' : '/access-denied';
  if (status === 401) url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
  const response = NextResponse.redirect(url);
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  if (status === 401) response.cookies.set(AUTH_COOKIE, '', clearAuthCookieOptions(request));
  return response;
};

/** Prefer loopback so public-hostname hairpin (e.g. dleconnect…:1432) does not break permission refresh. */
const AUTH_ME_TIMEOUT_MS = 2500;

const authMeCandidates = (request: NextRequest) => {
  const path = '/api/auth/me';
  const urls: string[] = [];
  const push = (origin: string) => {
    try {
      const value = new URL(path, origin).toString();
      if (!urls.includes(value)) urls.push(value);
    } catch {
      // ignore invalid origin
    }
  };

  const port = String(process.env.PORT || process.env.HTTP_PLATFORM_PORT || '').trim();
  if (port) {
    push(`http://127.0.0.1:${port}`);
    push(`http://localhost:${port}`);
  }

  // HttpPlatform often presents the public Host while Node listens on loopback.
  // Never use the incoming public origin here — hairpin NAT can hang forever.
  try {
    const incoming = new URL(request.url);
    const host = incoming.hostname.toLowerCase();
    const isLoopback = host === '127.0.0.1' || host === 'localhost' || host === '::1';
    if (incoming.port && !isLoopback) {
      push(`http://127.0.0.1:${incoming.port}`);
      push(`http://localhost:${incoming.port}`);
    } else if (isLoopback) {
      push(incoming.origin);
    }
  } catch {
    // ignore
  }

  // Last-resort local defaults used by IIS HttpPlatform / local dev.
  push('http://127.0.0.1:3020');
  push('http://localhost:3020');

  return urls;
};

const fetchAuthMe = async (meUrl: string, cookie: string) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AUTH_ME_TIMEOUT_MS);
  try {
    return await fetch(meUrl, {
      headers: { cookie },
      cache: 'no-store',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
};

const loadLivePermissions = async (request: NextRequest) => {
  const cookie = request.headers.get('cookie') || '';
  for (const meUrl of authMeCandidates(request)) {
    try {
      const liveSessionResponse = await fetchAuthMe(meUrl, cookie);
      if (!liveSessionResponse.ok) continue;
      const meJson = await liveSessionResponse.json().catch(() => null);
      if (Array.isArray(meJson?.data?.permissions) && meJson.data.permissions.length) {
        return { permissions: meJson.data.permissions as string[], liveSessionResponse };
      }
      // Reachable /api/auth/me with empty permissions — stop trying further candidates
      // (especially public hairpin) and let the caller fall back to role permissions.
      if (meJson?.data) {
        return { permissions: null as string[] | null, liveSessionResponse };
      }
    } catch {
      // try next candidate
    }
  }
  return { permissions: null as string[] | null, liveSessionResponse: null as Response | null };
};

export async function middleware(request: NextRequest) {
  try {
    const { pathname } = request.nextUrl;
    const hostname = request.nextUrl.hostname.toLowerCase();
    if (hostname === '0.0.0.0' || hostname === '::' || hostname === '[::]') {
      const url = request.nextUrl.clone();
      url.hostname = 'localhost';
      return NextResponse.redirect(url, 307);
    }
    if (pathname.startsWith('/change-password')) {
      const session = await verifySessionToken(request.cookies.get(AUTH_COOKIE)?.value);
      if (session?.isGlobalAdmin || (session && !session.firstLoginRequired && !session.passwordResetRequired)) {
        const url = request.nextUrl.clone();
        url.pathname = '/';
        url.search = '';
        return NextResponse.redirect(url);
      }
    }
    if (isPublicPath(pathname)) return NextResponse.next();

    const session = await verifySessionToken(request.cookies.get(AUTH_COOKIE)?.value);
    if (!session) return denied(request, 401);

    if (!session.isGlobalAdmin && (session.firstLoginRequired || session.passwordResetRequired) && !pathname.startsWith('/change-password') && !pathname.startsWith('/api/auth/change-password')) {
      if (pathname.startsWith('/api')) {
        return NextResponse.json({ status: 'error', error: 'Password change required' }, { status: 401 });
      }
      const url = request.nextUrl.clone();
      url.pathname = '/change-password';
      url.searchParams.set('next', pathname + request.nextUrl.search);
      return NextResponse.redirect(url);
    }

    const roles = session.roles;
    let permissions = session.isGlobalAdmin ? ['*'] : session.permissions;

    const needsLivePermissions =
      !session.isGlobalAdmin &&
      (
        !permissions.length
        || !pathname.startsWith('/api')
        || pathname.startsWith('/api/hris')
        || pathname.startsWith('/api/it-support')
        || pathname.startsWith('/api/finance')
        || pathname.startsWith('/administration')
        || pathname.startsWith('/it-support')
        || pathname.startsWith('/security')
        || pathname.startsWith('/finance')
        || pathname.startsWith('/hris')
      );

    let liveSessionResponse: Response | null = null;

    if (needsLivePermissions) {
      // JWT omits permissions for cookie size. Seed from roles immediately so a
      // hung /api/auth/me (public HTTPS hairpin) cannot blank finance email links.
      const rolePermissions = permissionsForRoles(roles);
      if (!permissions.length) permissions = rolePermissions;

      const livePromise = loadLivePermissions(request);
      const raced = await Promise.race([
        livePromise.then((live) => ({ live, timedOut: false as const })),
        new Promise<{ live: null; timedOut: true }>((resolve) => {
          setTimeout(() => resolve({ live: null, timedOut: true }), 3000);
        }),
      ]);

      if (!raced.timedOut && raced.live) {
        liveSessionResponse = raced.live.liveSessionResponse;
        if (raced.live.permissions?.length) {
          permissions = raced.live.permissions;
        } else if (!permissions.length) {
          permissions = rolePermissions;
        }
      }
    }

    if ((!pathname.startsWith('/api') || pathname.startsWith('/api/hris') || pathname.startsWith('/api/it-support')) && !canAccessRoute({ ...session, permissions }, pathname)) {
      return denied(request, 403);
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-auth-user', session.username || '');
    requestHeaders.set('x-auth-roles', roles.join(','));
    requestHeaders.set('x-auth-permissions', permissions.join(','));
    requestHeaders.set('x-auth-global-admin', session.isGlobalAdmin ? '1' : '0');
    requestHeaders.set('x-hris-actor', session.fullName || session.username || 'HRIS User');
    if (!requestHeaders.get('x-hris-role')) {
      requestHeaders.set('x-hris-role', deriveHrisRole(roles));
    }

    const response = NextResponse.next({ request: { headers: requestHeaders } });
    const setCookie = liveSessionResponse?.headers.get('set-cookie');
    if (setCookie) response.headers.append('set-cookie', setCookie);
    response.headers.set('x-auth-user', session.username || '');
    response.headers.set('x-auth-roles', roles.join(','));
    response.headers.set('x-auth-global-admin', session.isGlobalAdmin ? '1' : '0');
    if (!pathname.startsWith('/api/auth') && !pathname.startsWith('/_next')) {
      response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      response.headers.set('Pragma', 'no-cache');
      response.headers.set('Expires', '0');
    }
    return response;
  } catch (error) {
    console.error('[middleware] request failed', error);
    const detail = error instanceof Error ? error.message : String(error);
    if (request.nextUrl.pathname.startsWith('/api')) {
      return NextResponse.json({ status: 'error', error: 'Internal Server Error', detail: process.env.NODE_ENV === 'development' ? detail : undefined }, { status: 500 });
    }
    const body = process.env.NODE_ENV === 'development'
      ? `Internal Server Error\n\n${detail}\n\nTry: npm run dev:3020:restart`
      : 'Internal Server Error';
    return new NextResponse(body, { status: 500 });
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|_next/webpack-hmr|favicon.ico|brand/).*)'],
};
