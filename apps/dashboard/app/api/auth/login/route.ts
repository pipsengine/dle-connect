import { NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth/auth-store';
import {
  AUTH_COOKIE,
  authCookieOptions,
  createSessionToken,
  roleHome,
} from '@/lib/auth/session';

const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const user = await authenticate(String(body.login || ''), String(body.password || ''), request.headers);
    const token = await createSessionToken(user);
    const redirectTo = user.firstLoginRequired || user.passwordResetRequired ? '/change-password' : roleHome(user.roles);
    const response = NextResponse.json({ status: 'success', data: { user, redirectTo } });
    response.cookies.set(AUTH_COOKIE, token, authCookieOptions(request));
    return response;
  } catch (error) {
    return err(401, error instanceof Error ? error.message : 'Unable to login.');
  }
}
