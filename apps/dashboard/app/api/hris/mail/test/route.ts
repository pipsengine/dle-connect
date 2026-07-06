import { NextRequest, NextResponse } from 'next/server';
import { readUsers } from '@/lib/auth/auth-store';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { sendTransactionalEmail, verifyMailConnection, resolveMailProvider } from '@/lib/mail-service';

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

  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3020';
  const subject = `DLE Connect — email test for ${recipient.employeeCode}`;
  const text = [
    `Dear ${recipient.fullName},`,
    '',
    'This is a test email from DLE Connect confirming your mail provider is working.',
    `Employee code: ${recipient.employeeCode}`,
    `Mail provider: ${resolveMailProvider() || 'not configured'}`,
    `Sent at: ${new Date().toISOString()}`,
    '',
    `Open DLE Connect: ${appUrl}`,
    '',
    'Dorman Long Engineering — HRIS',
  ].join('\n');
  const html = `<p>Dear <strong>${recipient.fullName}</strong>,</p>
<p>This is a <strong>test email</strong> from DLE Connect confirming your mail provider is working.</p>
<ul>
  <li><strong>Employee code:</strong> ${recipient.employeeCode}</li>
  <li><strong>Mail provider:</strong> ${resolveMailProvider() || 'not configured'}</li>
  <li><strong>Sent at:</strong> ${new Date().toISOString()}</li>
</ul>
<p><a href="${appUrl}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#2563eb;color:#fff;text-decoration:none;font-weight:700">Open DLE Connect</a></p>
<p style="color:#64748b;font-size:12px">Dorman Long Engineering — HRIS</p>`;

  const result = await sendTransactionalEmail({ to: recipient.email, subject, text, html });
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
