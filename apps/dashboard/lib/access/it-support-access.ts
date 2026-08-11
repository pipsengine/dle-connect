import { hasAnyPermission } from '@/lib/auth/permission-match';
import {
  IT_SUPPORT_MODULE_CARDS,
  IT_SUPPORT_NAV_SECTIONS,
  type ItSupportNavSection,
} from '@/lib/it-support/nav';

const PORTAL_ENTRY_PERMISSIONS = [
  'view_it_support',
  'it.view',
  'it.*',
  'service-desk.view',
  'application-support.view',
  'infrastructure.view',
  'view_it_assets',
  'it.assets.view',
  'it.assets.*',
  'page.it-support.asset-management.view',
  'it.account-recovery.view',
  'it.account-recovery.edit',
  'page.it-support.account-recovery.view',
  'view_itsm',
  'view_knowledge_base',
  'view_cybersecurity',
  'view_system_monitoring',
  'admin.users.view',
  'admin.users.edit',
  'security.*',
] as const;

export const canAccessItSupportPortal = (permissions: string[], isGlobalAdmin?: boolean) =>
  Boolean(isGlobalAdmin) || hasAnyPermission(permissions, [...PORTAL_ENTRY_PERMISSIONS]);

export const canAccessItSupportKeys = (
  permissionKeys: string[] | undefined,
  permissions: string[],
  isGlobalAdmin?: boolean,
) => {
  if (isGlobalAdmin) return true;
  if (!permissionKeys?.length) return canAccessItSupportPortal(permissions, isGlobalAdmin);
  return hasAnyPermission(permissions, permissionKeys);
};

export const filterItSupportNavSections = (
  permissions: string[],
  isGlobalAdmin?: boolean,
): ItSupportNavSection[] => {
  return IT_SUPPORT_NAV_SECTIONS
    .map((section) => {
      const children = section.children.filter((child) =>
        canAccessItSupportKeys(child.permissionKeys, permissions, isGlobalAdmin),
      );
      const sectionVisible =
        canAccessItSupportKeys(section.permissionKeys, permissions, isGlobalAdmin) || children.length > 0;
      if (!sectionVisible) return null;
      // Keep section entry usable even if child filter is empty but section itself is allowed.
      const nextChildren =
        children.length > 0
          ? children
          : section.id === 'overview'
            ? section.children
            : [];
      if (!nextChildren.length && section.id !== 'overview') return null;
      return { ...section, children: nextChildren.length ? nextChildren : section.children.slice(0, 1) };
    })
    .filter((section): section is ItSupportNavSection => Boolean(section));
};

export const filterItSupportModuleCards = (permissions: string[], isGlobalAdmin?: boolean) =>
  IT_SUPPORT_MODULE_CARDS.filter((card) =>
    canAccessItSupportKeys([...card.permissionKeys], permissions, isGlobalAdmin),
  );
