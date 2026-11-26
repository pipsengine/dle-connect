/** Sign-in accounts for visitor-portal operators who are not employees. */

export const PORTAL_VISITOR_ROLES = ['Visitor Reception', 'Visitor Security'] as const;

export type PortalVisitorRole = (typeof PORTAL_VISITOR_ROLES)[number];

export const PORTAL_ACCOUNT_KIND = 'portal' as const;

export const isPortalVisitorRole = (value: string): value is PortalVisitorRole =>
  (PORTAL_VISITOR_ROLES as readonly string[]).includes(value);

export const isPortalAccount = (user: { accountKind?: string | null } | null | undefined) =>
  user?.accountKind === PORTAL_ACCOUNT_KIND;

/** Next free login in the form DL-0001. DL-0000 is the pattern, not an issued code. */
export const nextPortalUsername = (taken: Iterable<string>) => {
  const used = new Set<string>();
  let max = 0;
  for (const value of taken) {
    const code = String(value || '').trim().toUpperCase();
    if (!code) continue;
    used.add(code);
    const match = code.match(/^DL-(\d+)$/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  let sequence = max + 1;
  let code = `DL-${String(sequence).padStart(4, '0')}`;
  while (used.has(code)) {
    sequence += 1;
    code = `DL-${String(sequence).padStart(4, '0')}`;
  }
  return code;
};

/** Pages and APIs an other-user session may open. Everything else stays closed. */
export const portalVisitorPathAllowed = (pathname: string) => {
  const path = String(pathname || '').split('?')[0].replace(/\/+$/, '') || '/';
  if (path === '/' || path === '/access-denied' || path === '/change-password') return true;
  if (path === '/security' || path.startsWith('/security/')) return true;
  if (path === '/api/security' || path.startsWith('/api/security/')) return true;
  if (path === '/api/auth' || path.startsWith('/api/auth/')) return true;
  if (path === '/api/notifications' || path.startsWith('/api/notifications/')) return true;
  if (path === '/api/current-user' || path.startsWith('/api/current-user/')) return true;
  return false;
};
