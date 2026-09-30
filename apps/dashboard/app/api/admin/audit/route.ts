import { NextResponse } from 'next/server';
import { isGlobalSuperAdministrator } from '@/lib/access/route-access';
import { effectivePermissionsForUser } from '@/lib/auth/access-control-store';
import { readLoginHistory, readSecurityAudit } from '@/lib/auth/auth-store';
import { lookupIpPlace, type IpPlace } from '@/lib/auth/ip-geolocation';
import { listActivity } from '@/lib/auth/user-activity';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';

const withIpPlace = async <T extends { ipAddress?: string; ipPlace?: IpPlace | null }>(rows: T[]) => {
  const missing = [...new Set(rows.filter((row) => !row.ipPlace).map((row) => String(row.ipAddress || '')).filter(Boolean))].slice(0, 40);
  const places = new Map<string, IpPlace>();
  await Promise.all(missing.map(async (ip) => places.set(ip, await lookupIpPlace(ip))));
  return rows.map((row) => row.ipPlace ? row : { ...row, ipPlace: places.get(String(row.ipAddress || '')) || null });
};

export async function GET(request: Request) {
  const cookie = request.headers.get('cookie') || '';
  const token = cookie.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${AUTH_COOKIE}=`))?.split('=').slice(1).join('=');
  const session = await verifySessionToken(token ? decodeURIComponent(token) : '');
  if (!session) return NextResponse.json({ status: 'error', error: 'Unauthenticated' }, { status: 401 });
  const permissions = await effectivePermissionsForUser(session.sub, session.roles);
  if (!isGlobalSuperAdministrator({ ...session, permissions })) return NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 });
  const [audit, loginHistory, activity] = await Promise.all([readSecurityAudit(), readLoginHistory(), listActivity()]);
  const [auditWithPlace, loginWithPlace] = await Promise.all([withIpPlace(audit), withIpPlace(loginHistory)]);
  return NextResponse.json({ status: 'success', data: { audit: auditWithPlace, loginHistory: loginWithPlace, activity } });
}
