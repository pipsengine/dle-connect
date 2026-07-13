import { hasAnyPermission } from '@/lib/auth/permission-match';

export const IT_ASSET_VIEW_PERMISSIONS = [
  'view_it_assets',
  'page.it-support.asset-management.view',
  'it.assets.view',
  'it.view',
  'it.*',
  'view_it_support',
] as const;

export const IT_ASSET_MANAGE_PERMISSIONS = [
  'it.assets.create',
  'it.assets.edit',
  'it.create',
  'it.edit',
  'it.*',
] as const;

export const IT_ASSET_DELETE_PERMISSIONS = [
  'it.assets.delete',
  'it.delete',
  'it.*',
] as const;

export const IT_ASSET_EXPORT_PERMISSIONS = [
  'it.assets.export',
  'it.export',
  'reports.export',
  'it.*',
] as const;

export const canViewItAssets = (permissions: string[], isGlobalAdmin?: boolean) =>
  Boolean(isGlobalAdmin) || hasAnyPermission(permissions, [...IT_ASSET_VIEW_PERMISSIONS]);

export const canManageItAssets = (permissions: string[], isGlobalAdmin?: boolean) =>
  Boolean(isGlobalAdmin) || hasAnyPermission(permissions, [...IT_ASSET_VIEW_PERMISSIONS, ...IT_ASSET_MANAGE_PERMISSIONS]);

export const canDeleteItAssets = (permissions: string[], isGlobalAdmin?: boolean) =>
  Boolean(isGlobalAdmin) || hasAnyPermission(permissions, [...IT_ASSET_DELETE_PERMISSIONS]);

export const canExportItAssets = (permissions: string[], isGlobalAdmin?: boolean) =>
  Boolean(isGlobalAdmin) || hasAnyPermission(permissions, [...IT_ASSET_EXPORT_PERMISSIONS, ...IT_ASSET_VIEW_PERMISSIONS]);
