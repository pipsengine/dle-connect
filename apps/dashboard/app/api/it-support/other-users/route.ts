import { NextResponse } from 'next/server';
import { createPortalUser, listPortalUsers, updatePortalUser } from '@/lib/auth/auth-store';
import { effectivePermissionsForUser } from '@/lib/auth/access-control-store';
import { hasPermission } from '@/lib/auth/permission-match';
import { isSuperActor } from '@/lib/auth/role-delegation';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';

const tokenFrom = (request: Request) =>
  request.headers.get('cookie')?.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${AUTH_COOKIE}=`))?.split('=').slice(1).join('=');

const canView = (permissions: string[]) =>
  permissions.includes('*')
  || hasPermission(permissions, 'it.other-users.view')
  || hasPermission(permissions, 'page.it-support.other-users.view')
  || hasPermission(permissions, 'it.*')
  || hasPermission(permissions, 'security.*');

const canEdit = (permissions: string[]) =>
  permissions.includes('*')
  || hasPermission(permissions, 'it.other-users.edit')
  || hasPermission(permissions, 'it.*')
  || hasPermission(permissions, 'security.*');

const authorize = async (request: Request) => {
  const raw = tokenFrom(request);
  const session = await verifySessionToken(raw ? decodeURIComponent(raw) : '');
  if (!session) return { error: NextResponse.json({ status: 'error', error: 'Unauthenticated' }, { status: 401 }) };
  const superActor = isSuperActor(session);
  const permissions = superActor ? ['*'] : await effectivePermissionsForUser(session.sub, session.roles);
  if (!superActor && !canView(permissions)) {
    return { error: NextResponse.json({ status: 'error', error: 'Forbidden. You need IT Other Users access.' }, { status: 403 }) };
  }
  return { session: { ...session, permissions } };
};

export async function GET(request: Request) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  const users = await listPortalUsers();
  return NextResponse.json({
    status: 'success',
    data: {
      users,
      summary: {
        total: users.length,
        active: users.filter((user) => !['Disabled', 'Inactive'].includes(user.status)).length,
        disabled: users.filter((user) => user.status === 'Disabled').length,
      },
    },
  });
}

export async function POST(request: Request) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  if (!canEdit(auth.session?.permissions || [])) {
    return NextResponse.json({ status: 'error', error: 'Forbidden. You need IT Other Users edit rights.' }, { status: 403 });
  }
  try {
    const body = await request.json().catch(() => ({})) as {
      fullName?: string;
      email?: string;
      phone?: string;
      organisation?: string;
      role?: string;
    };
    const actor = auth.session?.fullName || auth.session?.username || 'IT Support';
    const created = await createPortalUser({
      fullName: String(body.fullName || ''),
      email: body.email,
      phone: body.phone,
      organisation: body.organisation,
      role: String(body.role || ''),
    }, request.headers, actor);
    return NextResponse.json({
      status: 'success',
      data: {
        user: created.user,
        temporaryPassword: created.temporaryPassword,
        message: `${created.user.fullName} can sign in as ${created.user.username}. Temporary password: ${created.temporaryPassword}. They must change it at first sign-in. This account is not on the employee directory.`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create the other user.';
    return NextResponse.json({ status: 'error', error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  if (!canEdit(auth.session?.permissions || [])) {
    return NextResponse.json({ status: 'error', error: 'Forbidden. You need IT Other Users edit rights.' }, { status: 403 });
  }
  try {
    const body = await request.json().catch(() => ({})) as {
      userId?: string;
      action?: 'disable' | 'enable' | 'reset-password' | 'update';
      fullName?: string;
      email?: string;
      phone?: string;
      organisation?: string;
      role?: string;
    };
    const action = body.action;
    if (!body.userId || !action || !['disable', 'enable', 'reset-password', 'update'].includes(action)) {
      return NextResponse.json({ status: 'error', error: 'Choose an account and an action.' }, { status: 400 });
    }
    const actor = auth.session?.fullName || auth.session?.username || 'IT Support';
    const result = await updatePortalUser(body.userId, action, {
      fullName: body.fullName,
      email: body.email,
      phone: body.phone,
      organisation: body.organisation,
      role: body.role,
    }, request.headers, actor);
    const message = result.temporaryPassword
      ? `Password reset for ${result.user.username}. Temporary password: ${result.temporaryPassword}.`
      : action === 'disable'
        ? `${result.user.username} can no longer sign in.`
        : action === 'enable'
          ? `${result.user.username} can sign in again.`
          : `${result.user.username} was updated.`;
    return NextResponse.json({
      status: 'success',
      data: { user: result.user, temporaryPassword: result.temporaryPassword, message },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update the other user.';
    return NextResponse.json({ status: 'error', error: message }, { status: 400 });
  }
}
