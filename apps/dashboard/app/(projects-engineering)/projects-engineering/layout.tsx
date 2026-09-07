import type { ReactNode } from 'react';
import { ProjectsEngineeringPortalShell } from './projects-engineering-portal-shell';

export const metadata = {
  title: 'Projects & Engineering',
  description: 'DLE Connect project management and engineering portal — portfolio, planning, controls, and integrations.',
};

export default function ProjectsEngineeringLayout({ children }: { children: ReactNode }) {
  return <ProjectsEngineeringPortalShell>{children}</ProjectsEngineeringPortalShell>;
}
