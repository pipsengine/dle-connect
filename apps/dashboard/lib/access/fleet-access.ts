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

export const canViewFleet = (permissions: string[], isGlobalAdmin?: boolean) =>
  Boolean(isGlobalAdmin) || hasAnyPermission(permissions, [...FLEET_VIEW_PERMISSIONS]);

export const canManageFleet = (permissions: string[], isGlobalAdmin?: boolean) =>
  Boolean(isGlobalAdmin) || hasAnyPermission(permissions, [...FLEET_VIEW_PERMISSIONS, ...FLEET_MANAGE_PERMISSIONS]);

export const canSubmitFleetTrip = (permissions: string[], isGlobalAdmin?: boolean) =>
  Boolean(isGlobalAdmin) || hasAnyPermission(permissions, [...FLEET_SUBMIT_PERMISSIONS, ...FLEET_VIEW_PERMISSIONS]);

export const canLineApproveFleetTrip = (permissions: string[], isGlobalAdmin?: boolean) =>
  Boolean(isGlobalAdmin) || hasAnyPermission(permissions, [...FLEET_LINE_APPROVE_PERMISSIONS]);

export const canAllocateFleetTrip = (permissions: string[], isGlobalAdmin?: boolean) =>
  Boolean(isGlobalAdmin) || hasAnyPermission(permissions, [...FLEET_ALLOCATE_PERMISSIONS]);

export const canDispatchFleetTrip = (permissions: string[], isGlobalAdmin?: boolean) =>
  Boolean(isGlobalAdmin) || hasAnyPermission(permissions, [...FLEET_DISPATCH_PERMISSIONS]);
