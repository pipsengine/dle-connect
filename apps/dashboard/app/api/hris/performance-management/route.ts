import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import {
  applyPerformanceAction,
  buildPerformanceActorContext,
  readPerformanceManagementPayload,
  updatePerformanceNavAction,
  writePerformanceNavPreferences,
} from '@/lib/performance-domain-store';
import { canAccessHrisPath } from '@/lib/access/route-access';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';

const jsonOk = (data: unknown) => NextResponse.json({ status: 'success', data });
const jsonErr = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

const readSession = async (request: NextRequest) => {
  const headerToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(AUTH_COOKIE)?.value;
  return verifySessionToken(headerToken || cookieToken);
};

export async function GET(request: NextRequest) {
  try {
    const session = await readSession(request);
    if (!session) return jsonErr(401, 'Unauthenticated.');
    if (!canAccessHrisPath(session, '/hris/performance-management')) {
      return jsonErr(403, 'You do not have permission to access Performance Management.');
    }

    const actorContext = buildPerformanceActorContext(session);
    const route = request.nextUrl.searchParams.get('route') || 'dashboard';
    const userKey = request.headers.get('x-user-id')
      || request.nextUrl.searchParams.get('userKey')
      || session.employeeCode
      || session.sub
      || 'default';

    const payload = await readPerformanceManagementPayload(route, actorContext, String(userKey));
    return jsonOk(payload);
  } catch (error) {
    return jsonErr(500, error instanceof Error ? error.message : 'Unable to load Performance Management.');
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await readSession(request);
    if (!session) return jsonErr(401, 'Unauthenticated.');
    if (!canAccessHrisPath(session, '/hris/performance-management')) {
      return jsonErr(403, 'You do not have permission to access Performance Management.');
    }

    const actorContext = buildPerformanceActorContext(session);
    const body = await request.json().catch(() => ({}));
    const userKey = request.headers.get('x-user-id')
      || String(body.userKey || session.employeeCode || session.sub || 'default');

    if (body.preferences && typeof body.preferences === 'object') {
      const preferences = await writePerformanceNavPreferences(userKey, body.preferences);
      return jsonOk({ preferences });
    }

    if (body.action && typeof body.action === 'object' && body.action.type) {
      const preferences = await updatePerformanceNavAction(userKey, body.action);
      return jsonOk({ preferences });
    }

    if (typeof body.action === 'string') {
      const result = await applyPerformanceAction(
        {
          action: body.action,
          actor: session.fullName || session.username,
          actorRole: actorContext.performanceRole,
          payload: body.payload || body,
        },
        actorContext,
      );
      if (!result.ok) return jsonErr(400, result.error || 'Action failed.');
      const payload = await readPerformanceManagementPayload(
        String(body.route || 'dashboard'),
        actorContext,
        userKey,
      );
      return jsonOk({ message: result.message, payload });
    }

    return jsonErr(400, 'Missing action.');
  } catch (error) {
    return jsonErr(500, error instanceof Error ? error.message : 'Unable to update Performance Management.');
  }
}
