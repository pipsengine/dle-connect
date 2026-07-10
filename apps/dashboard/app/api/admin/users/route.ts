import { NextResponse } from 'next/server';
import { effectivePermissionsForUser } from '@/lib/auth/access-control-store';
import { readLoginHistory, readUsers, syncUsersFromEmployeeDirectory, updateUser } from '@/lib/auth/auth-store';
import { AUTH_COOKIE, hasPermission, verifySessionToken } from '@/lib/auth/session';

const tokenFrom = (request: Request) => request.headers.get('cookie')?.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${AUTH_COOKIE}=`))?.split('=').slice(1).join('=');

const authorize = async (request: Request, permission: string) => {
  const session = await verifySessionToken(tokenFrom(request) ? decodeURIComponent(tokenFrom(request) || '') : '');
  if (!session) return { error: NextResponse.json({ status: 'error', error: 'Unauthenticated' }, { status: 401 }) };
  const permissions = await effectivePermissionsForUser(session.sub, session.roles);
  if (!hasPermission(permissions, permission) && !hasPermission(permissions, 'admin.*')) return { error: NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 }) };
  return { session: { ...session, permissions } };
};

export async function GET(request: Request) {
  const auth = await authorize(request, 'admin.users.view');
  if (auth.error) return auth.error;
  const url = new URL(request.url);
  const users = url.searchParams.get('sync') === '1' ? (await syncUsersFromEmployeeDirectory()).users : await readUsers();
  const history = await readLoginHistory();
  return NextResponse.json({ status: 'success', data: { users, loginHistory: history } });
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || '');
  let auth = await authorize(request, action === 'assign-roles' ? 'admin.roles.assign' : 'admin.users.edit');
  if (auth.error && action === 'assign-roles') {
    auth = await authorize(request, 'admin.users.edit');
  }
  if (auth.error) return auth.error;
  try {
    const user = await updateUser(String(body.userId || ''), action, body, request.headers, auth.session?.username || 'Admin', auth.session);
    return NextResponse.json({ status: 'success', data: user });
  } catch (error) {
    return NextResponse.json({ status: 'error', error: error instanceof Error ? error.message : 'Unable to update user.' }, { status: 400 });
  }
}
