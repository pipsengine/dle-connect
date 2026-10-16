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

/** Business approval authority. A super administrator does not inherit GM Commercial or MD authority from the technical role alone. */
export const isBusinessGmCommercial = (roles: string[] = []) =>
  roles.some((role) => /gm\s*commercial|general\s*manager\s*.*commercial/i.test(role));

export const isBusinessManagingDirector = (roles: string[] = []) =>
  roles.some((role) => /managing\s*director|^md(\/ceo)?$|\bmd\/ceo\b/i.test(role));

export type TenderPortalActor = {
  department?: string | null;
  unit?: string | null;
  roles?: string[] | null;
  isGlobalAdmin?: boolean;
  sub?: string | null;
};

const tenderDepartmentAllowed = (department?: string | null, unit?: string | null) => {
  const text = `${department || ''} ${unit || ''}`.toLowerCase();
  return /\bit\b|information technology/.test(text)
    || /proposal/.test(text)
    || /\bsales\b/.test(text)
    || /corporat|corperat/.test(text);
};

const tenderRoleAllowed = (roles: string[] = []) => roles.some((role) => {
  const text = String(role || '').trim();
  return /\bcfo\b|chief financial officer/i.test(text)
    || /gm\s*operations|general\s*manager\s*.*operations/i.test(text)
    || /gm\s*commercial|general\s*manager\s*.*commercial/i.test(text)
    || /managing\s*director|^md(\/ceo)?$|\bmd\/ceo\b/i.test(text);
});

/** Tender portal: IT, Proposal, Sales and Corporate, plus CFO, GM Operations, MD, and the Global Super Administrator. */
export const canAccessTenderPortal = (actor: TenderPortalActor) => {
  if (actor.isGlobalAdmin || actor.sub === 'global-admin') return true;
  if ((actor.roles || []).includes('Super Administrator')) return true;
  if (tenderRoleAllowed(actor.roles || [])) return true;
  return tenderDepartmentAllowed(actor.department, actor.unit);
};
