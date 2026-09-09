import { hasAnyPermission, hasUnrestrictedAccess } from '@/lib/auth/permission-match';
import {
  SECURITY_MODULE_CARDS,
  SECURITY_NAV_SECTIONS,
  type SecurityNavSection,
} from '@/lib/security/nav';

export const SECURITY_PORTAL_PERMISSIONS = [
  'view_security',
  'security.view',
  'security.*',
  'security.visitor.view',
  'visitor.view',
  'visitor.*',
] as const;

export const canAccessSecurityPortal = (permissions?: string[], isGlobalAdmin = false) => {
  if (hasUnrestrictedAccess(permissions, isGlobalAdmin)) return true;
  return hasAnyPermission(permissions || [], [...SECURITY_PORTAL_PERMISSIONS]);
};

export const canAccessSecurityKeys = (
  permissionKeys?: readonly string[] | string[],
  permissions?: string[],
  isGlobalAdmin = false,
) => {
  if (hasUnrestrictedAccess(permissions, isGlobalAdmin)) return true;
  if (!permissionKeys?.length) return canAccessSecurityPortal(permissions, isGlobalAdmin);
  return hasAnyPermission(permissions || [], [...permissionKeys]);
};

export const filterSecurityNavSections = (
  permissions?: string[],
  isGlobalAdmin = false,
): SecurityNavSection[] => {
  if (!canAccessSecurityPortal(permissions, isGlobalAdmin)) return [];
  return SECURITY_NAV_SECTIONS
    .map((section) => ({
      ...section,
      children: section.children.filter((child) =>
        canAccessSecurityKeys(child.permissionKeys, permissions, isGlobalAdmin),
      ),
    }))
    .filter((section) =>
      section.children.length > 0
      && canAccessSecurityKeys(section.permissionKeys, permissions, isGlobalAdmin),
    );
};

export const filterSecurityModuleCards = (permissions?: string[], isGlobalAdmin = false) => {
  if (!canAccessSecurityPortal(permissions, isGlobalAdmin)) return [];
  return SECURITY_MODULE_CARDS.filter((card) =>
    canAccessSecurityKeys(card.permissionKeys, permissions, isGlobalAdmin),
  );
};
