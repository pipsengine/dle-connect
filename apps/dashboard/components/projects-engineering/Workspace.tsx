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
            <strong>{project.manager || '—'}</strong>
          </div>
          <div>
            <small>Project Type</small>
            <strong>{project.projectType || project.phase || '—'}</strong>
          </div>
          <div>
            <small>Business Unit</small>
            <strong>{project.businessUnit || '—'}</strong>
          </div>
          <div>
            <small>Contract Value</small>
            <strong>{money(project.contractValue, project.currency)}</strong>
          </div>
          <div>
            <small>Start / Baseline Finish</small>
            <strong>
              {dmy(project.start)} – {dmy(project.finish)}
            </strong>
          </div>
          <div>
            <small>Overall Progress</small>
            <Progress value={project.actual} />
          </div>
          <div>
            <small>SPI / CPI</small>
            <strong>
              {Number(project.schedulePerformance || 0).toFixed(2)} / {Number(project.costPerformance || 0).toFixed(2)}
            </strong>
          </div>
          <div>
            <small>Stage / Health</small>
            <strong>
              {project.phase || project.status} · <Status>{project.health}</Status>
            </strong>
          </div>
        </div>
        <div className="project-hero-actions" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <Link href={`/projects-engineering/projects/${project.id}/reports`} className="btn secondary">
            Generate Report
          </Link>
          <Link href={`/projects-engineering/projects/${project.id}/risks`} className="btn secondary">
            View Alerts
          </Link>
          <Link href={`/projects-engineering/projects/${project.id}/actions`} className="btn secondary">
            Actions
          </Link>
          <Link href={`/projects-engineering/timesheets`} className="btn secondary">
            Man-Hours
          </Link>
        </div>
      </div>
      <nav className="workspace-tabs">
        {workspaceTabs.map((tab) => {
          const href =
            tab.key === 'cost-control'
              ? `/projects-engineering/projects/${project.id}/cost-control/overview`
              : `/projects-engineering/projects/${project.id}/${tab.key}`;
          return (
            <Link key={tab.key} href={href} className={active === tab.key ? 'active' : ''}>
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
