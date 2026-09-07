import { hasAnyPermission } from '@/lib/auth/permission-match';
import {
  PROJECTS_ENGINEERING_NAV,
  PROJECTS_ENGINEERING_VIEW_PERMISSIONS,
  type ProjectsEngineeringNavItem,
} from '@/lib/projects-engineering/nav';

export const canAccessProjectsEngineeringPortal = (permissions: string[], isGlobalAdmin?: boolean) =>
  Boolean(isGlobalAdmin) || hasAnyPermission(permissions, [...PROJECTS_ENGINEERING_VIEW_PERMISSIONS]);

export const filterProjectsEngineeringNav = (
  permissions: string[],
  isGlobalAdmin?: boolean,
): ProjectsEngineeringNavItem[] =>
  PROJECTS_ENGINEERING_NAV.filter(
    (item) => Boolean(isGlobalAdmin) || hasAnyPermission(permissions, item.permissionKeys),
  );
