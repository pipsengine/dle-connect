import { NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth/auth-store';
import {
  AUTH_COOKIE,
  authCookieMaxAgeForUser,
  authCookieOptions,
  createSessionToken,
  roleHome,
} from '@/lib/auth/session';

const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

export async function POST(request: Request) {
  const started = Date.now();
  try {
    const body = await request.json().catch(() => ({}));
    const user = await authenticate(String(body.login || ''), String(body.password || ''), request.headers);
    const token = await createSessionToken(user);
    const redirectTo = user.firstLoginRequired || user.passwordResetRequired ? '/change-password' : roleHome(user.roles);
    const response = NextResponse.json({ status: 'success', data: { user, redirectTo } });
    response.cookies.set(AUTH_COOKIE, token, authCookieOptions(request, { maxAgeSeconds: authCookieMaxAgeForUser(user) }));
    console.info('[perf] POST /api/auth/login', { ms: Date.now() - started, ok: true });
    return response;
  } catch (error) {
    console.info('[perf] POST /api/auth/login', { ms: Date.now() - started, ok: false });
    return err(401, error instanceof Error ? error.message : 'Unable to login.');
  }
}
