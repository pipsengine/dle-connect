import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, isPublicPath, verifySessionToken } from '@/lib/auth/session';

const denied = (request: NextRequest, status = 403) => {
  if (request.nextUrl.pathname.startsWith('/api')) {
    return NextResponse.json({ status: 'error', error: status === 401 ? 'Unauthenticated' : 'Forbidden' }, { status });
  }
  const url = request.nextUrl.clone();
  url.pathname = status === 401 ? '/login' : '/access-denied';
  if (status === 401) url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(url);
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
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
    const url = request.nextUrl.clone();
    url.pathname = '/change-password';
    url.searchParams.set('next', pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-auth-user', session.username);
  requestHeaders.set('x-auth-roles', session.roles.join(','));
  requestHeaders.set('x-hris-actor', session.fullName || session.username);
  if (!requestHeaders.get('x-hris-role')) {
    requestHeaders.set('x-hris-role', session.roles.includes('Super Administrator') ? 'Super Administrator' : 'OrganizationAdmin');
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('x-auth-user', session.username);
  response.headers.set('x-auth-roles', session.roles.join(','));
  if (pathname.startsWith('/hris') || pathname.startsWith('/api/hris')) {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
