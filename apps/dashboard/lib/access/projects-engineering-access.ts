import type { SessionPayload } from '@/lib/auth/session';
import { hasAnyPermission } from '@/lib/auth/permission-match';
import { isSuperActor } from '@/lib/auth/role-delegation';
import {
  PROJECTS_ENGINEERING_NAV,
  PROJECTS_ENGINEERING_NAV_GROUPS,
  PROJECTS_ENGINEERING_VIEW_PERMISSIONS,
  type ProjectsEngineeringNavGroup,
  type ProjectsEngineeringNavItem,
} from '@/lib/projects-engineering/nav';
import type { Project } from '@/lib/projects-engineering/types';

export type ProjectsSessionIdentity = Partial<
  Pick<
    SessionPayload,
    'sub' | 'username' | 'fullName' | 'employeeCode' | 'employeeId' | 'department' | 'roles' | 'permissions' | 'isGlobalAdmin'
  >
> & {
  permissions?: string[];
  roles?: string[];
  isGlobalAdmin?: boolean;
};

const compact = (value: unknown) => String(value ?? '').trim();
const normalizeKey = (value: unknown) =>
  compact(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');

const isUnrestricted = (session: ProjectsSessionIdentity | null | undefined) =>
  Boolean(session && isSuperActor(session));

export const isItDepartmentEmployee = (session: ProjectsSessionIdentity | null | undefined) => {
  if (!session) return false;
  if (isUnrestricted(session)) return true;
  const raw = compact(session.department);
  if (!raw) return false;
  if (/information\s*technology|info\.?\s*tech|\bICT\b/i.test(raw)) return true;
  // Exact IT / IT Department labels only (avoid matching words that merely contain "it").
  if (/^IT(\s*DEPARTMENT|\s*DEPT|\s*DIVISION)?$/i.test(raw.trim())) return true;
  return false;
};

export const canAccessProjectsEngineeringPortal = (
  permissions: string[],
  isGlobalAdmin?: boolean,
  roles?: string[],
  sub?: string,
) =>
  isSuperActor({ permissions, isGlobalAdmin, roles, sub })
  || hasAnyPermission(permissions, [...PROJECTS_ENGINEERING_VIEW_PERMISSIONS]);

/** Enterprise portfolio (all projects) — IT, admins, and explicit project admin permissions. */
export const canViewEnterprisePortfolio = (session: ProjectsSessionIdentity | null | undefined) => {
  if (!session) return false;
  if (isUnrestricted(session)) return true;
  if (isItDepartmentEmployee(session)) return true;
  const roles = (session.roles || []).map((role) => role.toLowerCase());
  if (roles.some((role) => /super administrator|md\/ceo|cfo|gm operations|project controls|pmo/i.test(role))) {
    return true;
  }
  return hasAnyPermission(session.permissions || [], [
    'project.admin',
    'project.*',
    'manage_project_integrations',
    '*',
  ]);
};

/** Create Project — IT Department only for now (plus Global Super Administrator). */
export const canCreateProjects = (session: ProjectsSessionIdentity | null | undefined) => {
  if (!session) return false;
  if (isUnrestricted(session)) return true;
  return isItDepartmentEmployee(session);
};

/** Edit Project — same gate as create (IT / Super Admin), plus enterprise portfolio admins. */
export const canEditProjects = (session: ProjectsSessionIdentity | null | undefined) => {
  if (!session) return false;
  if (canCreateProjects(session)) return true;
  return canViewEnterprisePortfolio(session);
};

/** Delete Project — Global Super Administrator only. */
export const canDeleteProjects = (session: ProjectsSessionIdentity | null | undefined) =>
  Boolean(session && isUnrestricted(session));

const sessionIdentityKeys = (session: ProjectsSessionIdentity) =>
  new Set(
    [session.employeeCode, session.employeeId, session.username, session.sub, session.fullName]
      .map(normalizeKey)
      .filter(Boolean),
  );

export const isProjectManagerOf = (session: ProjectsSessionIdentity | null | undefined, project: Project) => {
  if (!session) return false;
  const keys = sessionIdentityKeys(session);
  const candidates = [
    project.managerEmployeeCode,
    project.managerEmployeeId,
    project.managerUsername,
    project.manager,
  ]
    .map(normalizeKey)
    .filter(Boolean);
  return candidates.some((candidate) => keys.has(candidate));
};

export const canAccessProject = (session: ProjectsSessionIdentity | null | undefined, project: Project | null | undefined) => {
  if (!session || !project) return false;
  if (canViewEnterprisePortfolio(session)) return true;
  return isProjectManagerOf(session, project);
};

export const filterProjectsForSession = (
  session: ProjectsSessionIdentity | null | undefined,
  projects: Project[],
) => {
  if (!session) return [];
  if (canViewEnterprisePortfolio(session)) return projects;
  return projects.filter((project) => isProjectManagerOf(session, project));
};

const rewriteNavItem = (
  item: ProjectsEngineeringNavItem,
  managedProjectId?: string | null,
): ProjectsEngineeringNavItem => {
  const workspaceId = managedProjectId || null;
  if ((item.id === 'active-project' || item.id === 'ai' || item.id === 'actions') && workspaceId) {
    const section = item.id === 'active-project' ? 'overview' : item.id === 'ai' ? 'ai' : 'actions';
    return {
      ...item,
      href: `/projects-engineering/projects/${workspaceId}/${section}`,
    };
  }
  return item;
};

const canSeeNavItem = (
  item: ProjectsEngineeringNavItem,
  session: ProjectsSessionIdentity,
  managedProjectId?: string | null,
) => {
  const unrestricted = isUnrestricted(session);
  if (unrestricted) return true;

  const canCreate = canCreateProjects(session);
  const canEnterprise = canViewEnterprisePortfolio(session);

  if (item.id === 'new-project') return canCreate;
  if (item.id === 'integrations' || item.id === 'admin' || item.id === 'configuration' || item.id === 'settings') {
    return canEnterprise || canCreate;
  }
  if (
    item.id === 'dashboard'
    || item.id === 'projects'
    || item.id === 'cost-control'
    || item.id === 'timesheets'
    || item.id === 'reports-portfolio'
    || item.id === 'reports-project'
    || item.id === 'planning'
    || item.id === 'portfolio'
    || item.id === 'reports'
  ) {
    return canEnterprise || hasAnyPermission(session.permissions || [], item.permissionKeys);
  }
  if (item.id === 'active-project' || item.id === 'ai' || item.id === 'actions') {
    return canEnterprise || Boolean(managedProjectId);
  }
  return hasAnyPermission(session.permissions || [], item.permissionKeys);
};

export const filterProjectsEngineeringNav = (
  session: ProjectsSessionIdentity,
  managedProjectId?: string | null,
): ProjectsEngineeringNavItem[] => {
  const canPortal = canAccessProjectsEngineeringPortal(
    session.permissions || [],
    session.isGlobalAdmin,
    session.roles,
    session.sub,
  );
  if (!canPortal) return [];

  return PROJECTS_ENGINEERING_NAV
    .map((item) => rewriteNavItem(item, managedProjectId))
    .filter((item) => canSeeNavItem(item, session, managedProjectId));
};

export const filterProjectsEngineeringNavGroups = (
  session: ProjectsSessionIdentity,
  managedProjectId?: string | null,
): ProjectsEngineeringNavGroup[] => {
  const canPortal = canAccessProjectsEngineeringPortal(
    session.permissions || [],
    session.isGlobalAdmin,
    session.roles,
    session.sub,
  );
  if (!canPortal) return [];

  return PROJECTS_ENGINEERING_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items
      .map((item) => rewriteNavItem(item, managedProjectId))
      .filter((item) => canSeeNavItem(item, session, managedProjectId)),
  })).filter((group) => group.items.length > 0);
};
