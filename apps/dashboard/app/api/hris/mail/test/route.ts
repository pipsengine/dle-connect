import { NextRequest, NextResponse } from 'next/server';
import { readUsers } from '@/lib/auth/auth-store';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { resolveMailProvider, sendDleTestEmail, verifyMailConnection } from '@/lib/mail-service';

const ok = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

const cookieValue = (request: Request, name: string) => {
  const raw = request.headers.get('cookie') || '';
  for (const pair of raw.split(';')) {
    const [key, ...rest] = pair.split('=');
    if (String(key || '').trim() === name) return decodeURIComponent(rest.join('='));
  }
  return '';
};

const resolveRecipient = async (employeeCode: string) => {
  const code = String(employeeCode || '').trim().toUpperCase();
  if (!code) return null;
  const users = await readUsers();
  const user = users.find((item) =>
    String(item.employeeCode || '').trim().toUpperCase() === code
    || String(item.username || '').trim().toUpperCase() === code
    || String(item.employeeId || '').trim().toUpperCase() === code,
  );
  if (!user?.email) return null;
  return {
    employeeCode: code,
    fullName: user.fullName,
    email: String(user.email).trim(),
  };
};

export async function GET(request: NextRequest) {
  const session = await verifySessionToken(cookieValue(request, AUTH_COOKIE));
  if (!session?.isGlobalAdmin) return err(403, 'Only Super Administrators can verify mail configuration.');

  const provider = resolveMailProvider();
  const verification = await verifyMailConnection();
  return ok({
    provider,
    verification,
  });
}

export async function POST(request: NextRequest) {
  const session = await verifySessionToken(cookieValue(request, AUTH_COOKIE));
  if (!session?.isGlobalAdmin) return err(403, 'Only Super Administrators can send test emails.');

  const body = await request.json().catch(() => ({}));
  const employeeCode = String(body.employeeCode || 'P0146').trim();
  const recipient = await resolveRecipient(employeeCode);
  if (!recipient) return err(404, `No email address found for employee ${employeeCode}.`);

  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.DLE_PUBLIC_APP_URL || 'http://localhost:3020';
  const base = String(appUrl).replace(/\/$/, '');
  const result = await sendDleTestEmail({
    to: recipient.email,
    recipientName: recipient.fullName,
    employeeCode: recipient.employeeCode,
    appUrl: base,
    fleetLink: `${base}/logistics-fleet`,
    tripsLink: `${base}/logistics-fleet/trips-dispatch?tab=supervisor`,
    notificationsLink: `${base}/enterprise?scope=notifications`,
  });
  if (!result.sent) {
    const reason = 'reason' in result ? result.reason : 'Unable to send test email.';
    return err(502, reason || 'Unable to send test email.');
  }

  return ok({
    employeeCode: recipient.employeeCode,
    fullName: recipient.fullName,
    email: recipient.email,
    provider: resolveMailProvider(),
    result,
  });
}
