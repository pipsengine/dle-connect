import { NextResponse } from 'next/server';
import { readBrowserPlace } from '@/lib/auth/ip-geolocation';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { recordPresence, requestClientMeta } from '@/lib/auth/user-activity';

const cookieValue = (request: Request, name: string) => {
  const header = request.headers.get('cookie') || '';
  const part = header.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : '';
};

export async function POST(request: Request) {
  const session = await verifySessionToken(cookieValue(request, AUTH_COOKIE));
  if (!session) return NextResponse.json({ status: 'error', error: 'Unauthenticated' }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { kind?: string; path?: string; page?: string; action?: string; browserLocation?: unknown };
  const kind = body.kind === 'action' || body.kind === 'heartbeat' ? body.kind : 'page';
  const meta = requestClientMeta(request);
  const result = await recordPresence({
    session,
    kind,
    path: String(body.path || '/'),
    page: String(body.page || ''),
    action: String(body.action || ''),
    ipAddress: meta.ipAddress,
    device: meta.device,
    browserPlace: kind === 'heartbeat' ? null : readBrowserPlace(body.browserLocation),
  });
  if (result.revoked) {
    return NextResponse.json({ status: 'error', error: 'This session was disconnected.', code: 'session-revoked' }, { status: 401 });
  }
  return NextResponse.json({ status: 'success' });
}
