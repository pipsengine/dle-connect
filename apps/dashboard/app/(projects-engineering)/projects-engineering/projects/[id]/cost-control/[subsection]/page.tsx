import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { withResolvedAccess } from '@/lib/auth/resolve-access-session';
import { canAccessProject, canAccessProjectsEngineeringPortal } from '@/lib/access/projects-engineering-access';
import { ProjectHeader } from '@/components/projects-engineering/Workspace';
import { CostControlHeader, costSectionMap } from '@/components/projects-engineering/CostControl';
import { getProjectById } from '@/lib/projects-engineering/project-store';

export default async function ProjectCostControlPage({
  params,
}: {
  params: Promise<{ id: string; subsection: string }>;
}) {
  const { id, subsection } = await params;
  const Component = costSectionMap[subsection];
  if (!Component) notFound();

  const jar = await cookies();
  const raw = await verifySessionToken(jar.get(AUTH_COOKIE)?.value);
  if (!raw) redirect('/login');
  const session = withResolvedAccess(raw);
  if (!canAccessProjectsEngineeringPortal(session.permissions, session.isGlobalAdmin, session.roles, session.sub)) {
    redirect('/access-denied');
  }

  const project = await getProjectById(id);
  if (!project) notFound();
  if (!canAccessProject(session, project)) redirect('/access-denied');

  return (
    <>
      <ProjectHeader id={project.id} active="cost-control" />
      <div className="workspace-content">
        <CostControlHeader project={project} active={subsection} />
        <Component project={project} />
      </div>
    </>
  );
}
