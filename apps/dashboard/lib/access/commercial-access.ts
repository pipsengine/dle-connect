import { hasAnyPermission, hasUnrestrictedAccess } from '@/lib/auth/permission-match';

export const COMMERCIAL_VIEW_PERMISSIONS = [
  'view_sales_crm',
  'commercial.view',
  'commercial.*',
  'enterprise.view',
] as const;

export const canAccessCommercial = (permissions: string[], isGlobalAdmin?: boolean) =>
  hasUnrestrictedAccess(permissions, isGlobalAdmin) || hasAnyPermission(permissions, [...COMMERCIAL_VIEW_PERMISSIONS]);

export const canEditCommercial = (permissions: string[], isGlobalAdmin?: boolean) =>
  hasUnrestrictedAccess(permissions, isGlobalAdmin) ||
  hasAnyPermission(permissions, [...COMMERCIAL_VIEW_PERMISSIONS, 'commercial.edit', 'commercial.create']);
