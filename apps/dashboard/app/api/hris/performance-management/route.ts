import { NextRequest, NextResponse } from 'next/server';
import {
  readPerformanceManagementPayload,
  updatePerformanceNavAction,
  writePerformanceNavPreferences,
} from '@/lib/performance-management-store';

const jsonOk = (data: unknown) => NextResponse.json({ status: 'success', data });
const jsonErr = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

export async function GET(request: NextRequest) {
  try {
    const role = request.headers.get('x-hris-role') || request.nextUrl.searchParams.get('role');
    const route = request.nextUrl.searchParams.get('route') || 'dashboard';
    const userKey = request.headers.get('x-user-id') || request.nextUrl.searchParams.get('userKey') || 'default';
    const payload = await readPerformanceManagementPayload(route, role, userKey);
    return jsonOk(payload);
  } catch (error) {
    return jsonErr(500, error instanceof Error ? error.message : 'Unable to load Performance Management.');
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const userKey = request.headers.get('x-user-id') || String(body.userKey || 'default');

    if (body.preferences && typeof body.preferences === 'object') {
      const preferences = writePerformanceNavPreferences(userKey, body.preferences);
      return jsonOk({ preferences });
    }

    const action = body.action as Parameters<typeof updatePerformanceNavAction>[1];
    if (!action?.type) return jsonErr(400, 'Missing navigation action.');
    const preferences = updatePerformanceNavAction(userKey, action);
    return jsonOk({ preferences });
  } catch (error) {
    return jsonErr(500, error instanceof Error ? error.message : 'Unable to update navigation preferences.');
  }
}
