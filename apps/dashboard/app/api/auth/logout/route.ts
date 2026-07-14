import { NextResponse } from 'next/server';
import { logoutAudit } from '@/lib/auth/auth-store';
import { AUTH_COOKIE, clearAuthCookieOptions, verifySessionToken } from '@/lib/auth/session';

export async function POST(request: Request) {
  const raw = request.headers.get('cookie')?.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${AUTH_COOKIE}=`))?.split('=').slice(1).join('=');
  const session = await verifySessionToken(raw ? decodeURIComponent(raw) : '');
  if (session) await logoutAudit(session.username, session.sub, request.headers);
  const response = NextResponse.json({ status: 'success', data: { loggedOut: true } });
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  response.cookies.set(AUTH_COOKIE, '', clearAuthCookieOptions(request));
  return response;
}

export async function GET(request: Request) {
  const raw = request.headers.get('cookie')?.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${AUTH_COOKIE}=`))?.split('=').slice(1).join('=');
  const session = await verifySessionToken(raw ? decodeURIComponent(raw) : '');
  if (session) await logoutAudit(session.username, session.sub, request.headers);
  const response = NextResponse.redirect(new URL('/login', request.url));
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  response.cookies.set(AUTH_COOKIE, '', clearAuthCookieOptions(request));
  return response;
}
