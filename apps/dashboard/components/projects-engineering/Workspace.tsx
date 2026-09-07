import Link from 'next/link';
import { Bell, ChevronDown, FileText, HardHat, Pencil } from 'lucide-react';
import { money, dmy } from '@/lib/projects-engineering/format';
import { workspaceTabs } from '@/lib/projects-engineering/data';
import { getProjectById, listAllProjects } from '@/lib/projects-engineering/project-store';

export async function ProjectHeader({ id, active }: { id: string; active: string }) {
  const project = (await getProjectById(id)) || (await listAllProjects())[0];
  if (!project) {
    return (
      <div className="apo-hero">
        <div className="apo-identity">
          <span className="apo-code">N/A</span>
          <h1>Project not found</h1>
          <p>No project is available in your scope.</p>
        </div>
      </div>
    );
  }

  const progress = Math.min(100, Math.max(0, Number(project.actual || 0)));
  const healthLabel = project.health === 'Watch' ? 'At Risk' : project.health;

  return (
    <>
      <div className="apo-crumb">
        <Link href="/projects-engineering">Projects &amp; Engineering</Link>
        <b>›</b>
        <Link href="/projects-engineering/workspace">Active Project Workspace</Link>
        <b>›</b>
        <strong>{project.name}</strong>
      </div>

      <section className="apo-hero">
        <div className="apo-project-img" aria-hidden>
          <HardHat size={36} />
        </div>
        <div className="apo-identity">
          <span className="apo-code">{project.code}</span>
          <h1>{project.name}</h1>
          <p>{project.description || `${project.client} · ${project.location || 'DLE'}`}</p>
          <div className="apo-meta">
            <div className="apo-met">
              <small>Client</small>
              <b>{project.client || '—'}</b>
            </div>
            <div className="apo-met">
              <small>Project Manager</small>
              <b>{project.manager || '—'}</b>
            </div>
            <div className="apo-met">
              <small>Project Type</small>
              <b>{project.projectType || project.phase || '—'}</b>
            </div>
            <div className="apo-met">
              <small>Business Unit</small>
              <b>{project.businessUnit || '—'}</b>
            </div>
            <div className="apo-met">
              <small>Status</small>
              <b className="green">● {project.status || '—'}</b>
            </div>
            <div className="apo-met">
              <small>Health</small>
              <b className={project.health === 'Healthy' ? 'green' : project.health === 'Watch' ? 'amber' : 'red'}>
                ● {healthLabel}
              </b>
            </div>
          </div>
        </div>
        <div className="apo-hero-right">
          <div className="apo-hero-btns">
            <Link href={`/projects-engineering/projects/${project.id}/reports`}>
              <FileText size={13} /> Generate Report
            </Link>
            <Link href={`/projects-engineering/projects/${project.id}/risks`}>
              <Bell size={13} /> View Alerts
            </Link>
            <Link href={`/projects-engineering/projects/${project.id}/actions`}>
              Actions <ChevronDown size={13} />
            </Link>
            <Link className="primary" href="/projects-engineering/projects">
              <Pencil size={13} /> Edit Project
            </Link>
          </div>
          <div className="apo-dates">
            <div className="apo-met">
              <small>Contract Value</small>
              <b>{money(project.contractValue, project.currency)}</b>
            </div>
            <div className="apo-met">
              <small>Start Date</small>
              <b>{dmy(project.start)}</b>
            </div>
            <div className="apo-met">
              <small>Target Finish</small>
              <b>{dmy(project.finish)}</b>
            </div>
            <div className="apo-overall">
              <div>
                <span>Overall Progress</span>
                <b>{progress.toFixed(0)}%</b>
              </div>
              <i>
                <em style={{ width: `${progress}%` }} />
              </i>
            </div>
          </div>
        </div>
      </section>

      <nav className="apo-tabs">
        {workspaceTabs.map((tab) => {
          const href =
            tab.key === 'cost-control'
              ? `/projects-engineering/projects/${project.id}/cost-control/overview`
              : `/projects-engineering/projects/${project.id}/${tab.key}`;
          return (
            <Link key={tab.key} href={href} className={active === tab.key ? 'on' : ''}>
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
