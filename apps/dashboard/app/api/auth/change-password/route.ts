import { NextResponse } from 'next/server';
import { changePassword } from '@/lib/auth/auth-store';
import { AUTH_COOKIE, authCookieOptions, createSessionToken, roleHome, verifySessionToken } from '@/lib/auth/session';

const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

export async function POST(request: Request) {
  try {
    const cookie = request.headers.get('cookie') || '';
    const token = cookie.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${AUTH_COOKIE}=`))?.split('=').slice(1).join('=');
    const session = await verifySessionToken(token ? decodeURIComponent(token) : '');
    if (!session) return err(401, 'Unauthenticated.');
    const body = await request.json().catch(() => ({}));
    if (String(body.newPassword || '') !== String(body.confirmPassword || '')) return err(400, 'New password and confirmation do not match.');
    const user = await changePassword(session.sub, body.currentPassword ? String(body.currentPassword) : undefined, String(body.newPassword || ''), request.headers, session.username);
    const nextToken = await createSessionToken(user);
    const response = NextResponse.json({ status: 'success', data: { user, redirectTo: roleHome(user.roles) } });
    response.cookies.set(AUTH_COOKIE, nextToken, authCookieOptions(request));
    return response;
  } catch (error) {
    return err(400, error instanceof Error ? error.message : 'Unable to change password.');
  }
}
