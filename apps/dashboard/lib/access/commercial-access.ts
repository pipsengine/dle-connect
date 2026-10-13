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

export const isGmCommercial = (roles: string[] = [], isGlobalAdmin?: boolean) =>
  Boolean(isGlobalAdmin) || roles.some((role) => /gm\s*commercial|general\s*manager\s*.*commercial/i.test(role));

export const isManagingDirector = (roles: string[] = [], isGlobalAdmin?: boolean) =>
  Boolean(isGlobalAdmin) || roles.some((role) => /managing\s*director|^md(\/ceo)?$|\bmd\/ceo\b/i.test(role));
