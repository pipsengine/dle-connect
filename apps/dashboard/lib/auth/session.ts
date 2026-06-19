export const AUTH_COOKIE = 'dle_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

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

export const createSessionToken = async (user: SessionUser) => {
  const now = Math.floor(Date.now() / 1000);
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
    iat: now,
    exp: now + SESSION_MAX_AGE_SECONDS,
  };
  const body = base64UrlEncode(JSON.stringify(payload));
  return `${body}.${await sign(body)}`;
};

export const verifySessionToken = async (token?: string | null): Promise<SessionPayload | null> => {
  if (!token || !token.includes('.')) return null;
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;
  const expected = await sign(body);
  if (!timingSafeEqual(signature, expected)) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(body)) as SessionPayload;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
};

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

export const roleHome = (roles: string[]) => {
  return '/';
};

export const hasPermission = (permissions: string[], required: string) => {
  if (permissions.includes('*')) return true;
  if (permissions.includes(required)) return true;
  const [module] = required.split('.');
  return permissions.includes(`${module}.*`);
};
