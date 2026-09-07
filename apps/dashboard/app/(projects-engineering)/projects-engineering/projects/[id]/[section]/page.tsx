import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { withResolvedAccess } from '@/lib/auth/resolve-access-session';
import { canAccessProject, canAccessProjectsEngineeringPortal } from '@/lib/access/projects-engineering-access';
import { ProjectHeader } from '@/components/projects-engineering/Workspace';
import * as S from '@/components/projects-engineering/ProjectSections';
import { getProjectById } from '@/lib/projects-engineering/project-store';
import type { Project } from '@/lib/projects-engineering/types';

const map: Record<string, React.ComponentType<{ project: Project }>> = {
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
  // Cost Control is a nested workspace (not a single [section] page).
  if (section === 'cost-control') {
    redirect(`/projects-engineering/projects/${id}/cost-control/overview`);
  }
  const Component = map[section];
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
      <ProjectHeader id={project.id} active={section} />
      <div className="workspace-content">
        <Component project={project} />
      </div>
    </>
  );
}
