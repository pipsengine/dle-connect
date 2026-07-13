import { NextResponse } from 'next/server';
import {
  cloneRolePermissions,
  compareRolePermissions,
  effectivePermissionsForUser,
  readAccessControlPayload,
  saveAccessAssignment,
} from '@/lib/auth/access-control-store';
import { readUsersForAccessControl } from '@/lib/auth/auth-store';
import { hasPermission } from '@/lib/auth/permission-match';
import { isSuperActor } from '@/lib/auth/role-delegation';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';

const tokenFrom = (request: Request) => request.headers.get('cookie')?.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${AUTH_COOKIE}=`))?.split('=').slice(1).join('=');

const authorize = async (request: Request, write = false) => {
  const token = tokenFrom(request);
  const session = await verifySessionToken(token ? decodeURIComponent(token) : '');
  if (!session) return { error: NextResponse.json({ status: 'error', error: 'Unauthenticated' }, { status: 401 }) };

  const superActor = isSuperActor(session);
  const permissions = superActor
    ? ['*']
    : await effectivePermissionsForUser(session.sub, session.roles);

  const canView = superActor || hasPermission(permissions, 'admin.roles.view') || hasPermission(permissions, 'admin.*');
  const canWrite = superActor || hasPermission(permissions, 'admin.roles.assign') || hasPermission(permissions, 'admin.roles.edit') || hasPermission(permissions, 'admin.*');
  if (!canView || (write && !canWrite)) return { error: NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 }) };

  return { session: { ...session, permissions }, superActor, canWrite };
};

export async function GET(request: Request) {
  try {
    const auth = await authorize(request);
    if (auth.error) return auth.error;
    const url = new URL(request.url);
    const compare = url.searchParams.get('compare');
    if (compare) {
      const [left, right] = compare.split(':');
      if (!left || !right) return NextResponse.json({ status: 'error', error: 'Provide compare as leftRole:rightRole.' }, { status: 400 });
      return NextResponse.json({ status: 'success', data: await compareRolePermissions(left, right) });
    }
    const [payload, users] = await Promise.all([readAccessControlPayload(), readUsersForAccessControl()]);
    return NextResponse.json({
      status: 'success',
      data: {
        ...payload,
        users,
        actor: {
          sub: auth.session!.sub,
          roles: auth.session!.roles,
          permissions: auth.session!.permissions,
          isGlobalAdmin: auth.superActor,
          canWrite: auth.canWrite,
        },
      },
    });
  } catch (error) {
    return NextResponse.json({ status: 'error', error: error instanceof Error ? error.message : 'Unable to load access control data.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authorize(request, true);
    if (auth.error) return auth.error;
    const body = await request.json().catch(() => ({}));
    if (body.action === 'clone-role') {
      const result = await cloneRolePermissions(String(body.sourceRole || ''), String(body.targetRole || ''), request.headers, auth.session!, String(body.reason || ''));
      return NextResponse.json({ status: 'success', data: result });
    }
    const result = await saveAccessAssignment(body, request.headers, auth.session!);
    return NextResponse.json({ status: 'success', data: result });
  } catch (error) {
    return NextResponse.json({ status: 'error', error: error instanceof Error ? error.message : 'Unable to save access changes.' }, { status: 400 });
  }
}
