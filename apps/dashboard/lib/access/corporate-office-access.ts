import { hasAnyPermission, hasUnrestrictedAccess } from '@/lib/auth/permission-match';

export const CORPORATE_OFFICE_PARTICIPANT_PERMISSION = 'corporate.front-desk.participant';
import {
  CORPORATE_OFFICE_MODULE_CARDS,
  CORPORATE_OFFICE_NAV_SECTIONS,
  type CorporateOfficeNavSection,
} from '@/lib/corporate-office/nav';

export const CORPORATE_OFFICE_PORTAL_PERMISSIONS = [
  'view_corporate_office',
  'corporate.view',
  'corporate.*',
  'corporate.front-desk.view',
  'corporate.front-desk.*',
  'page.corporate-office.view',
  'page.corporate-office.front-desk.view',
  CORPORATE_OFFICE_PARTICIPANT_PERMISSION,
] as const;

export const hasFullCorporateOfficeAccess = (permissions?: string[], isGlobalAdmin = false) => {
  if (hasUnrestrictedAccess(permissions, isGlobalAdmin)) return true;
  return hasAnyPermission(
    permissions || [],
    CORPORATE_OFFICE_PORTAL_PERMISSIONS.filter((permission) => permission !== CORPORATE_OFFICE_PARTICIPANT_PERMISSION),
  );
};

export const canAccessCorporateOfficePortal = (permissions?: string[], isGlobalAdmin = false) => {
  if (hasUnrestrictedAccess(permissions, isGlobalAdmin)) return true;
  return hasAnyPermission(permissions || [], [...CORPORATE_OFFICE_PORTAL_PERMISSIONS]);
};

export const canAccessCorporateOfficeKeys = (
  permissionKeys?: readonly string[] | string[],
  permissions?: string[],
  isGlobalAdmin = false,
) => {
  if (hasUnrestrictedAccess(permissions, isGlobalAdmin)) return true;
  if (!permissionKeys?.length) return canAccessCorporateOfficePortal(permissions, isGlobalAdmin);
  return hasAnyPermission(permissions || [], [...permissionKeys]);
};

export const filterCorporateOfficeNavSections = (
  permissions?: string[],
  isGlobalAdmin = false,
): CorporateOfficeNavSection[] => {
  if (!canAccessCorporateOfficePortal(permissions, isGlobalAdmin)) return [];
  return CORPORATE_OFFICE_NAV_SECTIONS
    .map((section) => ({
      ...section,
      children: section.children.filter((child) =>
        canAccessCorporateOfficeKeys(child.permissionKeys, permissions, isGlobalAdmin),
      ),
    }))
    .filter((section) =>
      canAccessCorporateOfficeKeys(section.permissionKeys, permissions, isGlobalAdmin)
      && (section.children.length > 0 || section.id === 'overview'),
    );
};

export const filterCorporateOfficeModuleCards = (permissions?: string[], isGlobalAdmin = false) => {
  if (!canAccessCorporateOfficePortal(permissions, isGlobalAdmin)) return [];
  return CORPORATE_OFFICE_MODULE_CARDS.filter((card) =>
    canAccessCorporateOfficeKeys(card.permissionKeys, permissions, isGlobalAdmin),
  );
};
