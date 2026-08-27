import { hasAnyPermission } from '@/lib/auth/permission-match';
import { PROCUREMENT_NAV, type ProcurementNavItem } from '@/lib/procurement/nav';

export const PROCUREMENT_VIEW_PERMISSIONS = [
  'view_procurement',
  'procurement.view',
  'procurement.*',
  'vendor.view',
] as const;

export const PROCUREMENT_CREATE_PERMISSIONS = [
  'procurement.create',
  'procurement.*',
  'vendor.create',
] as const;

export const PROCUREMENT_EDIT_PERMISSIONS = [
  'procurement.edit',
  'procurement.*',
  'vendor.edit',
] as const;

export const PROCUREMENT_APPROVE_PERMISSIONS = [
  'procurement.approve',
  'procurement.reject',
  'procurement.*',
] as const;

export const canAccessProcurementPortal = (permissions: string[], isGlobalAdmin?: boolean) =>
  Boolean(isGlobalAdmin) || hasAnyPermission(permissions, [...PROCUREMENT_VIEW_PERMISSIONS]);

export const canViewProcurement = canAccessProcurementPortal;

export const canCreateProcurement = (permissions: string[], isGlobalAdmin?: boolean) =>
  Boolean(isGlobalAdmin) ||
  hasAnyPermission(permissions, [...PROCUREMENT_VIEW_PERMISSIONS, ...PROCUREMENT_CREATE_PERMISSIONS]);

export const canEditProcurement = (permissions: string[], isGlobalAdmin?: boolean) =>
  Boolean(isGlobalAdmin) ||
  hasAnyPermission(permissions, [
    ...PROCUREMENT_VIEW_PERMISSIONS,
    ...PROCUREMENT_CREATE_PERMISSIONS,
    ...PROCUREMENT_EDIT_PERMISSIONS,
  ]);

export const canApproveProcurement = (permissions: string[], isGlobalAdmin?: boolean) =>
  Boolean(isGlobalAdmin) ||
  hasAnyPermission(permissions, [...PROCUREMENT_VIEW_PERMISSIONS, ...PROCUREMENT_APPROVE_PERMISSIONS]);

export const filterProcurementNav = (permissions: string[], isGlobalAdmin?: boolean): ProcurementNavItem[] =>
  PROCUREMENT_NAV.filter(
    (item) =>
      Boolean(isGlobalAdmin) || hasAnyPermission(permissions, item.permissionKeys),
  );
