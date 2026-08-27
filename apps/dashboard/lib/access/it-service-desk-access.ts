import { hasAnyPermission } from '@/lib/auth/permission-match';

export const IT_SERVICE_DESK_VIEW_PERMISSIONS = [
  'view_itsm',
  'service-desk.view',
  'view_it_support',
  'it.view',
  'it.*',
] as const;

export const IT_SERVICE_DESK_CREATE_PERMISSIONS = [
  'service-desk.create',
  'it.create',
  'it.*',
] as const;

export const IT_SERVICE_DESK_EDIT_PERMISSIONS = [
  'service-desk.edit',
  'it.edit',
  'it.*',
] as const;

export const canViewServiceDesk = (permissions: string[], isGlobalAdmin?: boolean) =>
  Boolean(isGlobalAdmin) || hasAnyPermission(permissions, [...IT_SERVICE_DESK_VIEW_PERMISSIONS]);

export const canCreateServiceDesk = (permissions: string[], isGlobalAdmin?: boolean) =>
  Boolean(isGlobalAdmin) ||
  hasAnyPermission(permissions, [...IT_SERVICE_DESK_VIEW_PERMISSIONS, ...IT_SERVICE_DESK_CREATE_PERMISSIONS]);

export const canEditServiceDesk = (permissions: string[], isGlobalAdmin?: boolean) =>
  Boolean(isGlobalAdmin) ||
  hasAnyPermission(permissions, [
    ...IT_SERVICE_DESK_VIEW_PERMISSIONS,
    ...IT_SERVICE_DESK_CREATE_PERMISSIONS,
    ...IT_SERVICE_DESK_EDIT_PERMISSIONS,
  ]);
