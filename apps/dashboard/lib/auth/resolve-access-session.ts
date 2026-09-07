import { permissionsForRoles } from '@/lib/auth/rbac';
import { isSuperActor, type SuperActorInput } from '@/lib/auth/role-delegation';

type AccessSession = SuperActorInput & {
  permissions?: string[];
  roles?: string[];
};

/**
 * Global Super Administrator (account or role) always receives unrestricted `*`.
 * Other sessions keep JWT permissions when present, otherwise seed from roles.
 */
export const resolveAccessPermissions = (session: AccessSession | null | undefined): string[] => {
  if (!session) return [];
  if (isSuperActor(session)) return ['*'];
  if (Array.isArray(session.permissions) && session.permissions.length) return session.permissions;
  return permissionsForRoles(session.roles || []);
};

/** Attach resolved permissions for API/RSC access checks (JWT often stores an empty permission list). */
export const withResolvedAccess = <T extends AccessSession>(session: T): T & { permissions: string[] } => ({
  ...session,
  permissions: resolveAccessPermissions(session),
});
