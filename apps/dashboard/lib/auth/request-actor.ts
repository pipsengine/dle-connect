import { AUTH_COOKIE, verifySessionToken, type SessionPayload } from '@/lib/auth/session';

const readAuthCookie = (request: Request) => {
  const pair = (request.headers.get('cookie') || '')
    .split(';')
    .map((chunk) => chunk.trim())
    .find((chunk) => chunk.startsWith(`${AUTH_COOKIE}=`));
  return pair ? decodeURIComponent(pair.split('=').slice(1).join('=')) : '';
};

/** "Full Name (CODE)" for audit trails, or null when no one is signed in. */
export const auditActorFromSession = (session: Pick<SessionPayload, 'fullName' | 'username' | 'employeeCode' | 'employeeId'> | null | undefined) => {
  if (!session) return null;
  const name = String(session.fullName || session.username || '').trim();
  const code = String(session.employeeCode || session.employeeId || '').trim();
  if (!name && !code) return null;
  if (!name) return code;
  return code && !name.includes(code) ? `${name} (${code})` : name;
};

/** Signed-in person making this request, for audit logs. */
export const auditActorFromRequest = async (request: Request) => {
  const session = await verifySessionToken(readAuthCookie(request)).catch(() => null);
  return auditActorFromSession(session);
};
