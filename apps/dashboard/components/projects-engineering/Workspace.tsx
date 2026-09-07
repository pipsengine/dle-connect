import Link from 'next/link';
import { Status, Progress } from '@/components/projects-engineering/UI';
import { money, dmy } from '@/lib/projects-engineering/format';
import { workspaceTabs } from '@/lib/projects-engineering/data';
import { getProjectById, listAllProjects } from '@/lib/projects-engineering/project-store';

export async function ProjectHeader({ id, active }: { id: string; active: string }) {
  const project = (await getProjectById(id)) || (await listAllProjects())[0];
  if (!project) {
    return (
      <div className="project-hero">
        <div className="project-identity">
          <div className="project-code">N/A</div>
          <div>
            <h1>Project not found</h1>
            <p>No project is available in your scope.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="project-hero">
        <div className="project-identity">
          <div className="project-code">{project.code}</div>
          <div>
            <h1>{project.name}</h1>
            <p>
              {project.client} · {project.location}
            </p>
          </div>
        </div>
        <div className="project-hero-grid">
          <div>
            <small>Project Manager</small>
            <strong>{project.manager}</strong>
          </div>
          <div>
            <small>Contract Value</small>
            <strong>{money(project.contractValue, project.currency)}</strong>
          </div>
          <div>
            <small>Project Dates</small>
            <strong>
              {dmy(project.start)} – {dmy(project.finish)}
            </strong>
          </div>
          <div>
            <small>Progress</small>
            <Progress value={project.actual} />
          </div>
          <div>
            <small>Health</small>
            <Status>{project.health}</Status>
          </div>
        </div>
      </div>
      <nav className="workspace-tabs">
        {workspaceTabs.map((tab) => (
          <Link
            key={tab.key}
            href={`/projects-engineering/projects/${project.id}/${tab.key}`}
            className={active === tab.key ? 'active' : ''}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
