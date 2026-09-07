import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { withResolvedAccess } from '@/lib/auth/resolve-access-session';
import {
  canAccessProject,
  canAccessProjectsEngineeringPortal,
  canCreateProjects,
  canViewEnterprisePortfolio,
  filterProjectsForSession,
  isItDepartmentEmployee,
} from '@/lib/access/projects-engineering-access';
import { getProjectById, listAllProjects } from '@/lib/projects-engineering/project-store';

const getSession = async (request: NextRequest) => {
  const session = await verifySessionToken(request.cookies.get(AUTH_COOKIE)?.value);
  return session ? withResolvedAccess(session) : null;
};

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ status: 'error', error: 'Unauthenticated' }, { status: 401 });
  if (!canAccessProjectsEngineeringPortal(session.permissions, session.isGlobalAdmin, session.roles, session.sub)) {
    return NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 });
  }

  const projectId = request.nextUrl.searchParams.get('projectId');
  const all = await listAllProjects();
  const managed = filterProjectsForSession(session, all);
  const project = projectId ? await getProjectById(projectId) : null;

  return NextResponse.json({
    status: 'success',
    data: {
      identity: {
        employeeCode: session.employeeCode || null,
        department: session.department || null,
        fullName: session.fullName || null,
        isItDepartment: isItDepartmentEmployee(session),
        canCreateProjects: canCreateProjects(session),
        canViewEnterprisePortfolio: canViewEnterprisePortfolio(session),
      },
      managedProjects: managed,
      primaryProjectId: managed[0]?.id || null,
      projectAccess: projectId
        ? {
            projectId,
            allowed: canAccessProject(session, project),
            exists: Boolean(project),
          }
        : null,
    },
  });
}
