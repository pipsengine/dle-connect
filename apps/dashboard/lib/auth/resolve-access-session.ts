import { permissionsForRoles } from '@/lib/auth/rbac';
import { isSuperActor, type SuperActorInput } from '@/lib/auth/role-delegation';

type AccessSession = SuperActorInput & {
  permissions?: string[];
  roles?: string[];
};

const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

const COOKIE_EXTRA_PERMISSIONS_BUDGET = 1200;

/**
 * JWT cannot carry the full role pack (cookie size). Store only Access Control
 * extras so middleware can honour user-level page grants.
 */
export const cookieSafeExtraPermissions = (
  roles: string[] | undefined,
  livePermissions: string[] | undefined,
  isGlobalAdmin?: boolean,
) => {
  if (isGlobalAdmin || (livePermissions || []).includes('*') || (roles || []).includes('Super Administrator')) {
    return [] as string[];
  }
  const rolePack = new Set(permissionsForRoles(roles || []));
  const extras = unique((livePermissions || []).filter((permission) => permission !== '*' && !rolePack.has(permission)));
  const pageFirst = [
    ...extras.filter((permission) => permission.startsWith('page.')),
    ...extras.filter((permission) => !permission.startsWith('page.')),
  ];
  const packed: string[] = [];
  let used = 0;
  for (const permission of pageFirst) {
    if (used + permission.length + 1 > COOKIE_EXTRA_PERMISSIONS_BUDGET) break;
    packed.push(permission);
    used += permission.length + 1;
  }
  return packed;
};

/**
 * Global Super Administrator (account or role) always receives unrestricted `*`.
 * Other sessions merge role seed with compact JWT extras (user page grants).
 */
export const resolveAccessPermissions = (session: AccessSession | null | undefined): string[] => {
  if (!session) return [];
  if (isSuperActor(session) || (session.permissions || []).includes('*')) return ['*'];
  return unique([...permissionsForRoles(session.roles || []), ...(session.permissions || [])]);
};

/** Attach resolved permissions for API/RSC access checks (JWT often stores an empty permission list). */
export const withResolvedAccess = <T extends AccessSession>(session: T): T & { permissions: string[] } => ({
  ...session,
  permissions: resolveAccessPermissions(session),
});
