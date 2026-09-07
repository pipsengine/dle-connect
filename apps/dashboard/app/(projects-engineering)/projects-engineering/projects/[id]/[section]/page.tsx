import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { canAccessProject, canAccessProjectsEngineeringPortal } from '@/lib/access/projects-engineering-access';
import { ProjectHeader } from '@/components/projects-engineering/Workspace';
import * as S from '@/components/projects-engineering/ProjectSections';
import { getProjectById } from '@/lib/projects-engineering/project-store';

const map: Record<string, React.ComponentType> = {
  overview: S.Overview,
  planning: S.Planning,
  engineering: S.Engineering,
  deliverables: S.Deliverables,
  documents: S.Documents,
  procurement: S.Procurement,
  cost: S.Cost,
  resources: S.Resources,
  construction: S.Construction,
  quality: S.Quality,
  hse: S.HSE,
  risks: S.Risks,
  changes: S.Changes,
  actions: S.Actions,
  interface: S.Interface,
  progress: S.ProgressPage,
  reports: S.Reports,
  ai: S.AI,
  closeout: S.Closeout,
};

export default async function ProjectSectionPage({
  params,
}: {
  params: Promise<{ id: string; section: string }>;
}) {
  const { id, section } = await params;
  const Component = map[section];
  if (!Component) notFound();

  const jar = await cookies();
  const session = await verifySessionToken(jar.get(AUTH_COOKIE)?.value);
  if (!session) redirect('/login');
  if (!canAccessProjectsEngineeringPortal(session.permissions || [], session.isGlobalAdmin)) {
    redirect('/access-denied');
  }

  const project = await getProjectById(id);
  if (!project) notFound();
  if (!canAccessProject(session, project)) redirect('/access-denied');

  return (
    <>
      <ProjectHeader id={project.id} active={section} />
      <div className="workspace-content">
        <Component />
      </div>
    </>
  );
}
