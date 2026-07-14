export const AUTH_COOKIE = 'dle_session';

export {
  SESSION_IDLE_TIMEOUT_SECONDS,
  SESSION_MAX_AGE_SECONDS,
  SESSION_PASSWORD_CHANGE_GRACE_SECONDS,
} from '@/lib/auth/session-timeout';

import {
  SESSION_IDLE_TIMEOUT_SECONDS,
  SESSION_MAX_AGE_SECONDS,
  SESSION_PASSWORD_CHANGE_GRACE_SECONDS,
} from '@/lib/auth/session-timeout';

export type SessionUser = {
  userId: string;
  username: string;
  employeeId?: string;
  employeeCode?: string;
  fullName: string;
  email?: string;
  department?: string;
  unit?: string;
  roles: string[];
  permissions: string[];
  status: string;
  firstLoginRequired: boolean;
  passwordResetRequired: boolean;
  isGlobalAdmin?: boolean;
};

export type SessionPayload = {
  sub: string;
  username: string;
  fullName: string;
  employeeId?: string;
  employeeCode?: string;
  department?: string;
  unit?: string;
  roles: string[];
  permissions: string[];
  status: string;
  firstLoginRequired: boolean;
  passwordResetRequired: boolean;
  isGlobalAdmin?: boolean;
  iat: number;
  exp: number;
  /** Unix seconds — updated on each authenticated activity / refresh. */
  lastActivityAt?: number;
};

const enc = new TextEncoder();

const base64UrlEncode = (value: string | Uint8Array) => {
  const bytes = typeof value === 'string' ? enc.encode(value) : value;
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const base64UrlDecode = (value: string) => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return atob(padded);
};

const secret = () => process.env.AUTH_SESSION_SECRET || process.env.NEXTAUTH_SECRET || 'dle-development-session-secret-change-before-production';

export const shouldUseSecureAuthCookie = (request?: Request) => {
  const configured = process.env.AUTH_COOKIE_SECURE;
  if (configured != null && configured !== '') return !['0', 'false', 'no', 'off'].includes(configured.toLowerCase());
  if (request?.url) {
    try {
      const protocol = new URL(request.url).protocol;
      if (protocol === 'http:') return false;
      if (protocol === 'https:') return true;
    } catch {
      return false;
    }
  }
  const forwardedProto = request?.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
  if (forwardedProto) return forwardedProto === 'https';
  return process.env.NODE_ENV === 'production';
};

const sign = async (data: string) => {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return base64UrlEncode(new Uint8Array(signature));
};

const timingSafeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
};

const nowSeconds = () => Math.floor(Date.now() / 1000);

export const sessionUserFromPayload = (session: SessionPayload, permissions?: string[]): SessionUser => ({
  userId: session.sub,
  username: session.username,
  employeeId: session.employeeId,
  employeeCode: session.employeeCode,
  fullName: session.fullName,
  department: session.department,
  unit: session.unit,
  roles: session.roles,
  permissions: permissions || session.permissions,
  status: session.status,
  firstLoginRequired: session.firstLoginRequired,
  passwordResetRequired: session.passwordResetRequired,
  isGlobalAdmin: session.isGlobalAdmin,
});

const idleLimitForSession = (session: Pick<SessionPayload, 'firstLoginRequired' | 'passwordResetRequired'> | Pick<SessionUser, 'firstLoginRequired' | 'passwordResetRequired'>) => (
  session.firstLoginRequired || session.passwordResetRequired
    ? SESSION_PASSWORD_CHANGE_GRACE_SECONDS
    : SESSION_IDLE_TIMEOUT_SECONDS
);

export const createSessionToken = async (
  user: SessionUser,
  options?: { iat?: number; lastActivityAt?: number },
) => {
  const now = nowSeconds();
  const iat = options?.iat && options.iat > 0 ? options.iat : now;
  const lastActivityAt = options?.lastActivityAt && options.lastActivityAt > 0 ? options.lastActivityAt : now;
  const absoluteExp = iat + SESSION_MAX_AGE_SECONDS;
  const idleExp = lastActivityAt + idleLimitForSession(user);
  const payload: SessionPayload = {
    sub: user.userId,
    username: user.username,
    fullName: user.fullName,
    employeeId: user.employeeId,
    employeeCode: user.employeeCode,
    department: user.department,
    unit: user.unit,
    roles: user.roles,
    permissions: user.permissions,
    status: user.status,
    firstLoginRequired: user.firstLoginRequired,
    passwordResetRequired: user.passwordResetRequired,
    isGlobalAdmin: user.isGlobalAdmin,
    iat,
    lastActivityAt,
    exp: Math.min(absoluteExp, idleExp),
  };
  const body = base64UrlEncode(JSON.stringify(payload));
  return `${body}.${await sign(body)}`;
};

/** Refresh sliding idle window while preserving original login time (absolute max). */
export const refreshSessionToken = async (session: SessionPayload, permissions?: string[]) => {
  const now = nowSeconds();
  return createSessionToken(sessionUserFromPayload(session, permissions), {
    iat: session.iat || now,
    lastActivityAt: now,
  });
};

export const normalizeSession = (session: SessionPayload): SessionPayload => ({
  ...session,
  username: String(session.username || '').trim(),
  fullName: String(session.fullName || session.username || 'User').trim(),
  roles: Array.isArray(session.roles) ? session.roles.filter(Boolean) : [],
  permissions: Array.isArray(session.permissions) ? session.permissions.filter(Boolean) : [],
  firstLoginRequired: Boolean(session.firstLoginRequired),
  passwordResetRequired: Boolean(session.passwordResetRequired),
  isGlobalAdmin: Boolean(session.isGlobalAdmin),
  lastActivityAt: Number(session.lastActivityAt || session.iat || 0) || undefined,
});

export const isSessionIdleExpired = (
  session: Pick<SessionPayload, 'iat' | 'lastActivityAt' | 'exp' | 'firstLoginRequired' | 'passwordResetRequired'>,
  at = nowSeconds(),
) => {
  if (session.exp && session.exp < at) {
    // Re-check with password-change grace so a stale exp written under the short idle
    // window does not lock users out of forced password change.
    const lastActivity = Number(session.lastActivityAt || session.iat || 0);
    const idleLimit = idleLimitForSession(session);
    if (lastActivity && at - lastActivity <= idleLimit && (!session.iat || at - session.iat <= SESSION_MAX_AGE_SECONDS)) {
      return false;
    }
    return true;
  }
  const lastActivity = Number(session.lastActivityAt || session.iat || 0);
  if (!lastActivity) return true;
  if (at - lastActivity > idleLimitForSession(session)) return true;
  if (session.iat && at - session.iat > SESSION_MAX_AGE_SECONDS) return true;
  return false;
};

export const verifySessionToken = async (token?: string | null): Promise<SessionPayload | null> => {
  if (!token || !token.includes('.')) return null;
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;
  const expected = await sign(body);
  if (!timingSafeEqual(signature, expected)) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(body)) as SessionPayload;
    if (isSessionIdleExpired(payload)) return null;
    return normalizeSession(payload);
  } catch {
    return null;
  }
};

export const clearAuthCookieOptions = (request?: Request) => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: shouldUseSecureAuthCookie(request),
  path: '/',
  maxAge: 0,
});

export const authCookieOptions = (request?: Request, options?: { maxAgeSeconds?: number }) => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: shouldUseSecureAuthCookie(request),
  path: '/',
  // Cookie itself expires with the idle window; activity refreshes it.
  maxAge: options?.maxAgeSeconds ?? SESSION_IDLE_TIMEOUT_SECONDS,
});

export const authCookieMaxAgeForUser = (user: Pick<SessionUser, 'firstLoginRequired' | 'passwordResetRequired'>) =>
  idleLimitForSession(user);

export const passwordPolicyErrors = (password: string) => {
  const errors: string[] = [];
  if (password.length < 8) errors.push('Minimum 8 characters');
  if (!/[A-Z]/.test(password)) errors.push('At least 1 uppercase letter');
  if (!/[a-z]/.test(password)) errors.push('At least 1 lowercase letter');
  if (!/\d/.test(password)) errors.push('At least 1 digit');
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('At least 1 special character');
  return errors;
};

export const isPublicPath = (pathname: string) => (
  pathname.startsWith('/login') ||
  pathname.startsWith('/change-password') ||
  pathname.startsWith('/access-denied') ||
  pathname.startsWith('/api/auth') ||
  pathname.startsWith('/_next') ||
  pathname.startsWith('/favicon') ||
  pathname.startsWith('/brand') ||
  /\.(png|jpg|jpeg|gif|webp|svg|ico|css|js|map|txt)$/.test(pathname)
);

export const roleHome = (_roles: string[]) => '/';

export { hasPermission } from '@/lib/auth/permission-match';
