import { hasAnyPermission } from '@/lib/auth/permission-match';

export const FLEET_VIEW_PERMISSIONS = [
  'view_logistics_fleet',
  'fleet.view',
  'fleet.*',
  'logistics.view',
  'logistics.*',
  'driver.view',
] as const;

export const FLEET_SUBMIT_PERMISSIONS = [
  'fleet.submit',
  'fleet.*',
  'view_logistics_fleet',
  'fleet.view',
] as const;

export const FLEET_LINE_APPROVE_PERMISSIONS = [
  'fleet.approve',
  'fleet.*',
] as const;

export const FLEET_ALLOCATE_PERMISSIONS = [
  'driver.approve',
  'fleet.approve',
  'fleet.*',
] as const;

export const FLEET_DISPATCH_PERMISSIONS = [
  'fleet.approve',
  'fleet.*',
  'driver.approve',
] as const;

export const FLEET_MANAGE_PERMISSIONS = [
  'fleet.*',
  'fleet.submit',
  'fleet.approve',
  'fleet.export',
  'driver.approve',
  'logistics.*',
] as const;

export const FLEET_OPERATIONS_PERMISSIONS = [
  ...FLEET_VIEW_PERMISSIONS,
  ...FLEET_MANAGE_PERMISSIONS,
  'driver.approve',
] as const;

export const FLEET_ADMIN_PERMISSIONS = [
  'fleet.*',
  'fleet.approve',
  'fleet.export',
  'logistics.*',
] as const;

/** Explicit Driver Supervisor employee codes (comma/space separated). Defaults to L2770. */
export const configuredFleetDriverSupervisorCodes = () =>
  String(process.env.FLEET_DRIVER_SUPERVISOR_CODES || 'L2770')
    .split(/[,;\s]+/)
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);

const codeMatchesSupervisor = (employeeCode?: string | null) => {
  const code = String(employeeCode || '').trim().toUpperCase();
  return Boolean(code && configuredFleetDriverSupervisorCodes().includes(code));
};

/** Logistics & Fleet portal is open to every authenticated user; section ACL is separate. */
export const canViewFleet = (_permissions: string[], _isGlobalAdmin?: boolean) => true;

export const canManageFleet = (permissions: string[], isGlobalAdmin?: boolean) =>
  Boolean(isGlobalAdmin) || hasAnyPermission(permissions, [...FLEET_VIEW_PERMISSIONS, ...FLEET_MANAGE_PERMISSIONS]);

/** Any authenticated user may request a trip. */
export const canSubmitFleetTrip = (_permissions: string[], _isGlobalAdmin?: boolean) => true;

export const canLineApproveFleetTrip = (permissions: string[], isGlobalAdmin?: boolean) =>
  Boolean(isGlobalAdmin) || hasAnyPermission(permissions, [...FLEET_LINE_APPROVE_PERMISSIONS]);

export const canAllocateFleetTrip = (permissions: string[], isGlobalAdmin?: boolean, employeeCode?: string | null) =>
  Boolean(isGlobalAdmin)
  || hasAnyPermission(permissions, [...FLEET_ALLOCATE_PERMISSIONS])
  || codeMatchesSupervisor(employeeCode);

export const canDispatchFleetTrip = (permissions: string[], isGlobalAdmin?: boolean, employeeCode?: string | null) =>
  Boolean(isGlobalAdmin)
  || hasAnyPermission(permissions, [...FLEET_DISPATCH_PERMISSIONS])
  || codeMatchesSupervisor(employeeCode);

export const canAccessFleetOperations = (permissions: string[], isGlobalAdmin?: boolean) =>
  Boolean(isGlobalAdmin) || hasAnyPermission(permissions, [...FLEET_OPERATIONS_PERMISSIONS]);

export const canAccessFleetAdministration = (permissions: string[], isGlobalAdmin?: boolean) =>
  Boolean(isGlobalAdmin) || hasAnyPermission(permissions, [...FLEET_ADMIN_PERMISSIONS]);

export type FleetWorkspaceAccessId =
  | 'dashboard'
  | 'vehicles'
  | 'drivers'
  | 'allocations'
  | 'trips-dispatch'
  | 'fuel'
  | 'maintenance'
  | 'inspections-compliance'
  | 'incidents'
  | 'telematics'
  | 'vendors-contracts'
  | 'costs-budgets'
  | 'reports'
  | 'administration';

/** Open workspaces for every authenticated user; others require fleet/driver permissions. */
export const canAccessFleetWorkspace = (
  workspace: FleetWorkspaceAccessId,
  permissions: string[],
  isGlobalAdmin?: boolean,
  employeeCode?: string | null,
) => {
  if (workspace === 'dashboard' || workspace === 'trips-dispatch') return true;
  if (workspace === 'administration' || workspace === 'reports' || workspace === 'costs-budgets' || workspace === 'vendors-contracts' || workspace === 'telematics') {
    return canAccessFleetAdministration(permissions, isGlobalAdmin);
  }
  if (workspace === 'allocations') {
    return canAllocateFleetTrip(permissions, isGlobalAdmin, employeeCode);
  }
  return canAccessFleetOperations(permissions, isGlobalAdmin);
};
