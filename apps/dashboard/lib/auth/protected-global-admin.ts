/**
 * Immutable Global Super Administrator identities.
 * These accounts always have unrestricted access (`*`) and cannot be role-edited,
 * demoted, disabled, or permission-restricted via User Management / Access Control.
 */

export const PROTECTED_GLOBAL_SUPER_ADMIN_USER_IDS = [
  'global-admin',
  'usr-P0146',
] as const;

export const PROTECTED_GLOBAL_SUPER_ADMIN_CODES = [
  'P0146',
  'Admin',
] as const;

const normalize = (value: unknown) => String(value || '').trim().toLowerCase();

export const isProtectedGlobalSuperAdminIdentity = (input?: {
  id?: string | null;
  userId?: string | null;
  sub?: string | null;
  username?: string | null;
  employeeCode?: string | null;
  employeeId?: string | null;
} | string | null) => {
  if (!input) return false;
  if (typeof input === 'string') {
    const key = normalize(input);
    return PROTECTED_GLOBAL_SUPER_ADMIN_USER_IDS.some((id) => normalize(id) === key)
      || PROTECTED_GLOBAL_SUPER_ADMIN_CODES.some((code) => normalize(code) === key);
  }
  const keys = [
    input.id,
    input.userId,
    input.sub,
    input.username,
    input.employeeCode,
    input.employeeId,
  ].map(normalize).filter(Boolean);
  return keys.some((key) =>
    PROTECTED_GLOBAL_SUPER_ADMIN_USER_IDS.some((id) => normalize(id) === key)
    || PROTECTED_GLOBAL_SUPER_ADMIN_CODES.some((code) => normalize(code) === key),
  );
};

export const protectedGlobalSuperAdminRoles = () => ['Super Administrator'] as string[];

/** Break-glass `Admin` login — not an HRIS employee. P0146 stays a linked employee with global rights. */
export const isEmergencyUnlinkedGlobalAdmin = (input?: {
  isGlobalAdmin?: boolean;
  sub?: string | null;
  userId?: string | null;
  id?: string | null;
  username?: string | null;
  employeeCode?: string | null;
  employeeId?: string | null;
} | null) => {
  if (!input?.isGlobalAdmin) return false;
  const id = normalize(input.sub || input.userId || input.id);
  const username = normalize(input.username);
  if (id !== 'global-admin' && username !== 'admin') return false;
  const code = normalize(input.employeeCode || input.employeeId);
  return !code || code === 'admin';
};

export const assertProtectedGlobalSuperAdminMutable = (
  target: { id?: string | null; username?: string | null; employeeCode?: string | null; employeeId?: string | null },
  action = 'modify',
) => {
  if (!isProtectedGlobalSuperAdminIdentity(target)) return;
  throw new Error(
    `The protected Global Super Administrator account (${target.employeeCode || target.username || target.id}) cannot be ${action}. Roles and unrestricted access are locked.`,
  );
};
