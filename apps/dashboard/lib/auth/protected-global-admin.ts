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

export const assertProtectedGlobalSuperAdminMutable = (
  target: { id?: string | null; username?: string | null; employeeCode?: string | null; employeeId?: string | null },
  action = 'modify',
) => {
  if (!isProtectedGlobalSuperAdminIdentity(target)) return;
  throw new Error(
    `The protected Global Super Administrator account (${target.employeeCode || target.username || target.id}) cannot be ${action}. Roles and unrestricted access are locked.`,
  );
};
