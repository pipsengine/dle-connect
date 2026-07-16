import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import {
  applyPerformanceAction,
  readPerformanceManagementPayload,
  updatePerformanceNavAction,
  writePerformanceNavPreferences,
} from '@/lib/performance-domain-store';
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
    const role = request.headers.get('x-hris-role') || request.nextUrl.searchParams.get('role') || session?.roles?.[0];
    const route = request.nextUrl.searchParams.get('route') || 'dashboard';
    const userKey = request.headers.get('x-user-id')
      || request.nextUrl.searchParams.get('userKey')
      || session?.employeeCode
      || session?.sub
      || 'default';
    const payload = await readPerformanceManagementPayload(route, role, String(userKey));
    if (session?.fullName) {
      payload.actor.fullName = session.fullName;
      payload.actor.employeeCode = session.employeeCode || payload.actor.employeeCode;
      payload.actor.employeeId = String(session.employeeId || session.employeeCode || payload.actor.employeeId);
    }
    return jsonOk(payload);
  } catch (error) {
    return jsonErr(500, error instanceof Error ? error.message : 'Unable to load Performance Management.');
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await readSession(request);
    const body = await request.json().catch(() => ({}));
    const userKey = request.headers.get('x-user-id')
      || String(body.userKey || session?.employeeCode || session?.sub || 'default');

    if (body.preferences && typeof body.preferences === 'object') {
      const preferences = writePerformanceNavPreferences(userKey, body.preferences);
      return jsonOk({ preferences });
    }

    if (body.action && typeof body.action === 'object' && body.action.type) {
      const preferences = updatePerformanceNavAction(userKey, body.action);
      return jsonOk({ preferences });
    }

    if (typeof body.action === 'string') {
      const result = await applyPerformanceAction({
        action: body.action,
        actor: body.actor || session?.fullName || userKey,
        actorRole: body.actorRole || request.headers.get('x-hris-role') || session?.roles?.[0] || 'HR Officer',
        payload: body.payload || body,
      });
      if (!result.ok) return jsonErr(400, result.error || 'Action failed.');
      const payload = await readPerformanceManagementPayload(
        String(body.route || 'dashboard'),
        body.actorRole || request.headers.get('x-hris-role') || session?.roles?.[0],
        userKey,
      );
      return jsonOk({ message: result.message, payload });
    }

    return jsonErr(400, 'Missing action.');
  } catch (error) {
    return jsonErr(500, error instanceof Error ? error.message : 'Unable to update Performance Management.');
  }
}
