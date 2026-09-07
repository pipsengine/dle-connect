import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import {
  canAccessProject,
  canAccessProjectsEngineeringPortal,
  filterProjectsForSession,
} from '@/lib/access/projects-engineering-access';
import { getProjectById, listAllProjects } from '@/lib/projects-engineering/project-store';

export default async function ProjectIndexPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const jar = await cookies();
  const session = await verifySessionToken(jar.get(AUTH_COOKIE)?.value);
  if (!session) redirect('/login');
  if (!canAccessProjectsEngineeringPortal(session.permissions || [], session.isGlobalAdmin)) {
    redirect('/access-denied');
  }

  const project = await getProjectById(id);
  if (!project) {
    const fallback = filterProjectsForSession(session, await listAllProjects())[0];
    redirect(fallback ? `/projects-engineering/projects/${fallback.id}/overview` : '/projects-engineering');
  }
  if (!canAccessProject(session, project)) redirect('/access-denied');
  redirect(`/projects-engineering/projects/${project.id}/overview`);
}
