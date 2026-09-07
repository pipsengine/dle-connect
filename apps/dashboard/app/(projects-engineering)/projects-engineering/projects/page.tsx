import { Suspense } from 'react';
import ProjectsListPage from './ProjectsListClient';

export default function ProjectsPage() {
  return (
    <Suspense fallback={<div className="audit-strip">Loading projects…</div>}>
      <ProjectsListPage />
    </Suspense>
  );
}
