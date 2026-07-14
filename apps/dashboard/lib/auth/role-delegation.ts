import { permissionsForRoles } from '@/lib/auth/rbac';

export type SuperActorInput = {
  sub?: string;
  roles?: string[];
  permissions?: string[];
  isGlobalAdmin?: boolean;
};

/** Global Super Administrator and equivalent accounts bypass delegation limits. */
export const isSuperActor = (input?: SuperActorInput | null) => {
  if (!input) return false;
  if (input.isGlobalAdmin || input.sub === 'global-admin') return true;
  if ((input.roles || []).includes('Super Administrator')) return true;
  if ((input.permissions || []).includes('*')) return true;
  return false;
};

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
  if (targetRole === 'Super Administrator') return false;
  if (isSuperActor({ roles: actorRoles, isGlobalAdmin, sub: isGlobalAdmin ? 'global-admin' : undefined })) return true;
  return roleRank(targetRole) <= actorMaxRoleRank(actorRoles);
};

export const canActorModifyRole = (actorRoles: string[], targetRole: string, isGlobalAdmin = false) => {
  if (targetRole === 'Super Administrator') return false;
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
  if (isSuperActor({ roles: actorRoles, isGlobalAdmin, sub: isGlobalAdmin ? 'global-admin' : undefined })) {
    return roles.filter((role) => role.name !== 'Super Administrator');
  }
  const maxRank = actorMaxRoleRank(actorRoles);
  return roles.filter((role) => role.name !== 'Super Administrator' && roleRank(role.name) <= maxRank);
};

export const assertActorCanAssignRoles = (
  actorRoles: string[],
  requestedRoles: string[],
  actor?: SuperActorInput,
) => {
  if (isSuperActor({ ...actor, roles: actor?.roles || actorRoles })) return;
  const blocked = requestedRoles.filter((role) => !canActorAssignRole(actorRoles, role, actor?.isGlobalAdmin));
  if (blocked.length) {
    throw new Error(`You cannot assign roles above your own access level: ${blocked.join(', ')}`);
  }
};

export const assertActorCanGrantPermissions = (actorPermissions: string[], requested: string[], isGlobalAdmin = false) => {
  if (isSuperActor({ permissions: actorPermissions, isGlobalAdmin })) return;
  const blocked = requested.filter((permission) => isPermissionAboveActor(permission, actorPermissions));
  if (blocked.length) {
    throw new Error('You cannot grant permissions higher than your own access.');
  }
};
