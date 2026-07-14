import { permissionsForRoles } from '@/lib/auth/rbac';

export type SuperActorInput = {
  sub?: string;
  roles?: string[];
  permissions?: string[];
  isGlobalAdmin?: boolean;
};

/** Global Super Administrator account OR Super Administrator role holders. */
export const isSuperActor = (input?: SuperActorInput | null) => {
  if (!input) return false;
  if (input.isGlobalAdmin || input.sub === 'global-admin') return true;
  if ((input.roles || []).includes('Super Administrator')) return true;
  if ((input.permissions || []).includes('*')) return true;
  return false;
};

/** Only Global / Super Administrators may grant, remove, or modify the Super Administrator role. */
export const canManageSuperAdministratorRole = (input?: SuperActorInput | null) => isSuperActor(input);

/** Higher rank = more authority. Non-listed roles default to module/enterprise rank. */
export const GLOBAL_SYSTEM_ROLE_RANK: Record<string, number> = {
  'Super Administrator': 1000,
  'System Administrator': 900,
  Admin: 880,
  'Application Administrator': 850,
  'Security Administrator': 800,
  'Audit Administrator': 800,
  'Integration Administrator': 800,
};

const DEFAULT_ROLE_RANK = 100;

export const roleRank = (roleName: string) => GLOBAL_SYSTEM_ROLE_RANK[roleName] ?? DEFAULT_ROLE_RANK;

export const actorMaxRoleRank = (roles: string[], isGlobalAdmin = false) => {
  if (isGlobalAdmin || roles.includes('Super Administrator')) return GLOBAL_SYSTEM_ROLE_RANK['Super Administrator'];
  if (!roles.length) return DEFAULT_ROLE_RANK;
  return Math.max(DEFAULT_ROLE_RANK, ...roles.map(roleRank));
};

export const canActorAssignRole = (actorRoles: string[], targetRole: string, isGlobalAdmin = false) => {
  // Super Administrator may only be assigned by Global / Super Administrators.
  if (targetRole === 'Super Administrator') {
    return isSuperActor({ roles: actorRoles, isGlobalAdmin, sub: isGlobalAdmin ? 'global-admin' : undefined });
  }
  if (isSuperActor({ roles: actorRoles, isGlobalAdmin, sub: isGlobalAdmin ? 'global-admin' : undefined })) return true;
  return roleRank(targetRole) <= actorMaxRoleRank(actorRoles);
};

export const canActorModifyRole = (actorRoles: string[], targetRole: string, isGlobalAdmin = false) => {
  if (targetRole === 'Super Administrator') return false; // role definition itself is never editable
  if (isSuperActor({ roles: actorRoles, isGlobalAdmin, sub: isGlobalAdmin ? 'global-admin' : undefined })) return true;
  return roleRank(targetRole) <= actorMaxRoleRank(actorRoles);
};

export const canActorGrantPermission = (actorPermissions: string[], permission: string) => {
  if (!permission) return true;
  if (actorPermissions.includes('*')) return true;
  if (actorPermissions.includes(permission)) return true;
  const [module] = permission.split('.');
  if (module && actorPermissions.includes(`${module}.*`)) return true;
  return false;
};

export const isPermissionAboveActor = (permission: string, actorPermissions: string[]) =>
  !canActorGrantPermission(actorPermissions, permission);

export const clampPermissionsToActor = (permissions: string[], actorPermissions: string[]) => {
  if (actorPermissions.includes('*')) return permissions;
  return permissions.filter((permission) => canActorGrantPermission(actorPermissions, permission));
};

export const baselinePermissionCeiling = (roles: string[], isGlobalAdmin = false) => {
  if (isGlobalAdmin || roles.includes('Super Administrator')) return ['*'] as string[];
  return permissionsForRoles(roles);
};

export const clampPermissionsToRoleCeiling = (permissions: string[], roles: string[], isGlobalAdmin = false) => {
  const ceiling = baselinePermissionCeiling(roles, isGlobalAdmin);
  return clampPermissionsToActor(permissions, ceiling);
};

export const filterAssignableRoles = <T extends { name: string }>(
  roles: T[],
  actorRoles: string[],
  isGlobalAdmin = false,
) => {
  const actorIsSuper = isSuperActor({ roles: actorRoles, isGlobalAdmin, sub: isGlobalAdmin ? 'global-admin' : undefined });
  // Only Global / Super Administrators may see or select Super Administrator.
  if (actorIsSuper) return roles;
  const maxRank = actorMaxRoleRank(actorRoles);
  return roles.filter((role) => role.name !== 'Super Administrator' && roleRank(role.name) <= maxRank);
};

export const assertActorCanAssignRoles = (
  actorRoles: string[],
  requestedRoles: string[],
  actor?: SuperActorInput,
) => {
  const actorInput = { ...actor, roles: actor?.roles || actorRoles };
  const touchesSuper = requestedRoles.includes('Super Administrator');
  if (touchesSuper && !canManageSuperAdministratorRole(actorInput)) {
    throw new Error('Only Global / Super Administrators can grant or modify the Super Administrator role. Admin and System Administrator cannot self-elevate or promote others to Super Administrator.');
  }
  if (isSuperActor(actorInput)) return;
  const blocked = requestedRoles.filter((role) => !canActorAssignRole(actorRoles, role, actor?.isGlobalAdmin));
  if (blocked.length) {
    throw new Error(`You cannot assign roles above your own access level: ${blocked.join(', ')}`);
  }
};

export const assertActorCanGrantPermissions = (actorPermissions: string[], requested: string[], isGlobalAdmin = false) => {
  if (isSuperActor({ permissions: actorPermissions, isGlobalAdmin })) return;
  if (requested.includes('*')) {
    throw new Error('Only Global / Super Administrators can grant unrestricted (*) access.');
  }
  const blocked = requested.filter((permission) => isPermissionAboveActor(permission, actorPermissions));
  if (blocked.length) {
    throw new Error('You cannot grant permissions higher than your own access.');
  }
};
