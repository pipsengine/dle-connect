import { NextResponse } from 'next/server';
import { effectivePermissionsForUser } from '@/lib/auth/access-control-store';
import { readLoginHistory, readUsers, updateUser } from '@/lib/auth/auth-store';
import { hasPermission } from '@/lib/auth/permission-match';
import { isSuperActor } from '@/lib/auth/role-delegation';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';

const tokenFrom = (request: Request) =>
  request.headers.get('cookie')?.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${AUTH_COOKIE}=`))?.split('=').slice(1).join('=');

const RECOVERY_PERMISSIONS = [
  'it.account-recovery.view',
  'it.account-recovery.edit',
  'page.it-support.account-recovery.view',
  'admin.users.edit',
  'admin.users.view',
  'security.*',
  'it.*',
];

const canRecover = (permissions: string[]) =>
  permissions.includes('*')
  || RECOVERY_PERMISSIONS.some((permission) => hasPermission(permissions, permission));

const canMutateRecovery = (permissions: string[]) =>
  permissions.includes('*')
  || hasPermission(permissions, 'it.account-recovery.edit')
  || hasPermission(permissions, 'admin.users.edit')
  || hasPermission(permissions, 'security.*')
  || hasPermission(permissions, 'it.*');

const authorize = async (request: Request) => {
  const raw = tokenFrom(request);
  const session = await verifySessionToken(raw ? decodeURIComponent(raw) : '');
  if (!session) return { error: NextResponse.json({ status: 'error', error: 'Unauthenticated' }, { status: 401 }) };
  const superActor = isSuperActor(session);
  const permissions = superActor ? ['*'] : await effectivePermissionsForUser(session.sub, session.roles);
  if (!superActor && !canRecover(permissions)) {
    return { error: NextResponse.json({ status: 'error', error: 'Forbidden. You need IT Account Recovery or User Administration rights.' }, { status: 403 }) };
  }
  return { session: { ...session, permissions } };
};

const accountIssues = (user: Awaited<ReturnType<typeof readUsers>>[number]) => {
  const issues: string[] = [];
  if (user.status === 'Locked' || (user.lockedUntil && new Date(user.lockedUntil) > new Date())) issues.push('Locked');
  if (user.status === 'Disabled' || user.disabledAt) issues.push('Disabled');
  if (user.status === 'Inactive') issues.push('Inactive');
  if (user.failedAttempts > 0) issues.push(`${user.failedAttempts} failed login attempt(s)`);
  if (user.passwordResetRequired || user.status === 'Password Reset Required') issues.push('Password reset required');
  if (user.firstLoginRequired || user.status === 'Pending First Login') issues.push('Pending first login / password change');
  if (user.deleted) issues.push('Marked deleted');
  return issues;
};

export async function GET(request: Request) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  const url = new URL(request.url);
  const q = String(url.searchParams.get('q') || '').trim().toLowerCase();
  const issuesOnly = url.searchParams.get('issuesOnly') !== '0';
  const users = await readUsers();
  const history = await readLoginHistory();
  const enriched = users
    .map((user) => {
      const issues = accountIssues(user);
      const recentHistory = history.filter((item) => item.username.toLowerCase() === user.username.toLowerCase()).slice(0, 8);
      return { ...user, issues, recentHistory };
    })
    .filter((user) => {
      if (issuesOnly && !user.issues.length) return false;
      if (!q) return true;
      return [user.username, user.employeeCode, user.employeeId, user.fullName, user.email, user.department, user.status, user.issues.join(' ')]
        .some((value) => String(value || '').toLowerCase().includes(q));
    })
    .sort((a, b) => b.issues.length - a.issues.length || a.username.localeCompare(b.username));

  return NextResponse.json({
    status: 'success',
    data: {
      users: enriched,
      summary: {
        total: users.length,
        withIssues: users.filter((user) => accountIssues(user).length).length,
        locked: users.filter((user) => user.status === 'Locked' || (user.lockedUntil && new Date(user.lockedUntil) > new Date())).length,
        disabled: users.filter((user) => user.status === 'Disabled').length,
        passwordFlags: users.filter((user) => user.passwordResetRequired || user.firstLoginRequired).length,
      },
    },
  });
}

export async function POST(request: Request) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  if (!canMutateRecovery(auth.session?.permissions || [])) {
    return NextResponse.json({ status: 'error', error: 'Forbidden. You need IT Account Recovery edit rights.' }, { status: 403 });
  }
  try {
    const body = await request.json().catch(() => ({})) as {
      userId?: string;
      username?: string;
      action?: 'recover-account' | 'unlock' | 'activate' | 'reset-password';
      resetPassword?: boolean;
      clearPasswordFlags?: boolean;
    };
    const users = await readUsers();
    const target = users.find((user) => user.id === body.userId)
      || users.find((user) => user.username.toLowerCase() === String(body.username || '').trim().toLowerCase())
      || users.find((user) => user.employeeCode?.toLowerCase() === String(body.username || '').trim().toLowerCase());
    if (!target) {
      return NextResponse.json({ status: 'error', error: 'User account was not found. Search by username or employee code.' }, { status: 404 });
    }

    const action = body.action || 'recover-account';
    const payload = {
      resetPassword: Boolean(body.resetPassword),
      clearPasswordFlags: body.clearPasswordFlags !== false,
    };
    const updated = await updateUser(
      target.id,
      action,
      payload,
      request.headers,
      auth.session?.username || 'IT Support',
      auth.session,
    );
    const issues = accountIssues(updated as typeof target);
    return NextResponse.json({
      status: 'success',
      data: {
        user: updated,
        issues,
        message: issues.length
          ? `Recovery applied. Remaining notes: ${issues.join(', ')}.`
          : `Account ${updated.username} is clear for login.`,
      },
    });
  } catch (error) {
    return NextResponse.json({ status: 'error', error: error instanceof Error ? error.message : 'Unable to recover account.' }, { status: 400 });
  }
}
