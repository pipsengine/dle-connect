import { notFound } from 'next/navigation';
import { ProjectHeader } from '@/components/projects-engineering/Workspace';
import * as S from '@/components/projects-engineering/ProjectSections';

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
  return (
    <>
      <ProjectHeader id={id} active={section} />
      <div className="workspace-content">
        <Component />
      </div>
    </>
  );
}
