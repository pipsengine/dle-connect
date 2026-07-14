import { NextResponse } from 'next/server';
import { authenticate, changePassword } from '@/lib/auth/auth-store';
import {
  AUTH_COOKIE,
  authCookieMaxAgeForUser,
  authCookieOptions,
  createSessionToken,
  roleHome,
  verifySessionToken,
} from '@/lib/auth/session';

const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

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

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const currentPassword = body.currentPassword ? String(body.currentPassword) : '';
    const newPassword = String(body.newPassword || '');
    const confirmPassword = String(body.confirmPassword || '');
    const login = String(body.login || body.username || '').trim();

    if (newPassword !== confirmPassword) return err(400, 'New password and confirmation do not match.');

    let session = await verifySessionToken(readAuthToken(request));
    let userId = session?.sub || '';
    let actor = session?.username || '';

    // Password-reset / first-login pages often lose the short idle cookie. Allow
    // completing the change with username + current password in one step.
    if (!session) {
      if (!login || !currentPassword) {
        return err(401, 'Your login session expired. Enter your username/employee code and current password, then update the new password.');
      }
      const authenticated = await authenticate(login, currentPassword, request.headers);
      userId = authenticated.userId;
      actor = authenticated.username;
    }

    const user = await changePassword(
      userId,
      session ? (currentPassword || undefined) : undefined,
      newPassword,
      request.headers,
      actor,
    );
    const nextToken = await createSessionToken(user);
    const response = NextResponse.json({ status: 'success', data: { user, redirectTo: roleHome(user.roles) } });
    response.cookies.set(AUTH_COOKIE, nextToken, authCookieOptions(request, { maxAgeSeconds: authCookieMaxAgeForUser(user) }));
    return response;
  } catch (error) {
    return err(400, error instanceof Error ? error.message : 'Unable to change password.');
  }
}
