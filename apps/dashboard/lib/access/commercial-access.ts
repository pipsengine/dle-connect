import { hasAnyPermission, hasUnrestrictedAccess } from '@/lib/auth/permission-match';
import { isPayrollNamedMdCeo } from '@/lib/payroll-acting-approvers';

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

export type CommercialAuthorityActor = {
  roles?: string[] | null;
  isGlobalAdmin?: boolean;
  employeeCode?: string | null;
  username?: string | null;
  sub?: string | null;
  department?: string | null;
  unit?: string | null;
  jobTitle?: string | null;
};

const rolesOf = (rolesOrActor: string[] | CommercialAuthorityActor | null | undefined) => {
  if (Array.isArray(rolesOrActor)) return rolesOrActor;
  return Array.isArray(rolesOrActor?.roles) ? rolesOrActor.roles : [];
};

const actorOf = (
  rolesOrActor: string[] | CommercialAuthorityActor | null | undefined,
  isGlobalAdmin?: boolean,
): CommercialAuthorityActor => {
  if (Array.isArray(rolesOrActor) || rolesOrActor == null) {
    return { roles: rolesOrActor || [], isGlobalAdmin };
  }
  return {
    ...rolesOrActor,
    isGlobalAdmin: Boolean(rolesOrActor.isGlobalAdmin || isGlobalAdmin),
  };
};

/** Directory MD defaults to enterprise role "Executive Director" (same mapping as payroll / payments). */
const roleIsManagingDirector = (role: string) =>
  /managing\s*director|^md(\/ceo)?$|\bmd\/ceo\b|^executive director$|^executive management$/i.test(String(role || '').trim());

const roleIsGmCommercial = (role: string) =>
  /gm\s*commercial|general\s*manager\s*.*commercial/i.test(String(role || '').trim());

const isNamedManagingDirector = (actor: CommercialAuthorityActor) =>
  isPayrollNamedMdCeo(actor.employeeCode, actor.username);

/** Global Super Administrator may perform every commercial / tender approval action. */
export const isCommercialSuperActor = (rolesOrActor: string[] | CommercialAuthorityActor = [], isGlobalAdmin?: boolean) => {
  const actor = actorOf(rolesOrActor, isGlobalAdmin);
  if (actor.isGlobalAdmin || actor.sub === 'global-admin') return true;
  return rolesOf(actor).some((role) => /^super administrator$/i.test(String(role || '').trim()));
};

export const isGmCommercial = (
  rolesOrActor: string[] | CommercialAuthorityActor = [],
  isGlobalAdmin?: boolean,
) => {
  if (isCommercialSuperActor(rolesOrActor, isGlobalAdmin)) return true;
  return isBusinessGmCommercial(rolesOrActor);
};

export const isManagingDirector = (
  rolesOrActor: string[] | CommercialAuthorityActor = [],
  isGlobalAdmin?: boolean,
) => {
  if (isCommercialSuperActor(rolesOrActor, isGlobalAdmin)) return true;
  const actor = actorOf(rolesOrActor, isGlobalAdmin);
  if (isNamedManagingDirector(actor)) return true;
  return rolesOf(actor).some(roleIsManagingDirector);
};

/** Mrs Nkechi Eke Kalu — first commercial review (priority, review, approve) before GM Commercial. */
export const PROPOSAL_REVIEWER_EMPLOYEE_CODE = 'P0051';

/** Mrs Chinwe Natasha Iloh — GM Commercial tender approval seat. */
export const GM_COMMERCIAL_EMPLOYEE_CODE = 'P0463';

const codeOf = (actor: CommercialAuthorityActor) =>
  String(actor.employeeCode || actor.username || '').trim().toUpperCase();

const isNamedProposalReviewer = (actor: CommercialAuthorityActor) =>
  codeOf(actor) === PROPOSAL_REVIEWER_EMPLOYEE_CODE;

const isNamedGmCommercial = (actor: CommercialAuthorityActor) =>
  codeOf(actor) === GM_COMMERCIAL_EMPLOYEE_CODE;

/** Business seat only (directory / named role / job title). Used where the seat holder must be distinguished from admin. */
export const isBusinessGmCommercial = (rolesOrActor: string[] | CommercialAuthorityActor = []) => {
  const actor = actorOf(rolesOrActor);
  if (isNamedGmCommercial(actor)) return true;
  if (rolesOf(rolesOrActor).some(roleIsGmCommercial)) return true;
  const title = String(actor.jobTitle || '').trim();
  if (title && roleIsGmCommercial(title)) return true;
  const department = `${actor.department || ''} ${actor.unit || ''}`.toLowerCase();
  const titleText = title.toLowerCase();
  // Directory often stores "General Manager" under Commercial rather than the role name alone.
  if (/\bcommercial\b/.test(department) && (/general\s*manager|\bgm\b/.test(titleText))) return true;
  return false;
};

export const isBusinessManagingDirector = (rolesOrActor: string[] | CommercialAuthorityActor = []) => {
  const actor = actorOf(rolesOrActor);
  if (isNamedManagingDirector(actor)) return true;
  return rolesOf(actor).some(roleIsManagingDirector);
};

/** Named Proposal reviewer only — does not inherit from admin or department roles. */
export const isBusinessProposalReviewer = (rolesOrActor: string[] | CommercialAuthorityActor = []) =>
  isNamedProposalReviewer(actorOf(rolesOrActor));

export const canActAsProposalReviewer = (rolesOrActor: string[] | CommercialAuthorityActor = [], isGlobalAdmin?: boolean) =>
  isCommercialSuperActor(rolesOrActor, isGlobalAdmin) || isBusinessProposalReviewer(rolesOrActor);

export const canActAsGmCommercial = (rolesOrActor: string[] | CommercialAuthorityActor = [], isGlobalAdmin?: boolean) =>
  isCommercialSuperActor(rolesOrActor, isGlobalAdmin) || isBusinessGmCommercial(rolesOrActor);

export const canActAsManagingDirector = (rolesOrActor: string[] | CommercialAuthorityActor = [], isGlobalAdmin?: boolean) =>
  isCommercialSuperActor(rolesOrActor, isGlobalAdmin) || isBusinessManagingDirector(rolesOrActor);

export type TenderPortalActor = CommercialAuthorityActor;

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
    || roleIsGmCommercial(text)
    || roleIsManagingDirector(text);
});

/** Tender portal: IT, Proposal, Sales and Corporate, plus CFO, GM Operations, MD, GM Commercial, and the Global Super Administrator. */
export const canAccessTenderPortal = (actor: TenderPortalActor) => {
  if (actor.isGlobalAdmin || actor.sub === 'global-admin') return true;
  if ((actor.roles || []).includes('Super Administrator')) return true;
  if (isNamedManagingDirector(actor)) return true;
  if (tenderRoleAllowed(actor.roles || [])) return true;
  return tenderDepartmentAllowed(actor.department, actor.unit);
};
