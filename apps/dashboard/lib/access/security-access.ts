import {
  SECURITY_MODULE_CARDS,
  SECURITY_NAV_SECTIONS,
  type SecurityNavSection,
} from '@/lib/security/nav';

/**
 * Soft-open during rollout (same reachability pattern as Logistics)
 * while Security ACL keys are published in Access Control.
 */
export const canAccessSecurityPortal = (_permissions?: string[], _isGlobalAdmin?: boolean) => true;

export const canAccessSecurityKeys = (
  _permissionKeys?: string[],
  _permissions?: string[],
  _isGlobalAdmin?: boolean,
) => true;

export const filterSecurityNavSections = (
  _permissions?: string[],
  _isGlobalAdmin?: boolean,
): SecurityNavSection[] =>
  SECURITY_NAV_SECTIONS.map((section) => ({ ...section, children: [...section.children] }));

export const filterSecurityModuleCards = (_permissions?: string[], _isGlobalAdmin?: boolean) =>
  [...SECURITY_MODULE_CARDS];
