'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  PageHeading,
  Button,
  KpiCard,
  Card,
  DataTable,
  Status,
  Progress,
  Toolbar,
  MiniBar,
  Sparkline,
} from '@/components/projects-engineering/UI';
import { money } from '@/lib/projects-engineering/format';
import type { Project } from '@/lib/projects-engineering/types';

type AccessIdentity = {
  isItDepartment: boolean;
  canCreateProjects: boolean;
  canViewEnterprisePortfolio: boolean;
  department: string | null;
};

export default function PortfolioDashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [scope, setScope] = useState<'enterprise' | 'managed'>('managed');
  const [identity, setIdentity] = useState<AccessIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [projectsRes, accessRes] = await Promise.all([
          fetch('/api/projects-engineering/projects', { cache: 'no-store', credentials: 'same-origin' }),
          fetch('/api/projects-engineering/access', { cache: 'no-store', credentials: 'same-origin' }),
        ]);
        const projectsJson = await projectsRes.json();
        const accessJson = await accessRes.json();
        if (!projectsRes.ok || projectsJson.status !== 'success') {
          throw new Error(projectsJson.error || 'Unable to load projects');
        }
        if (!active) return;
        setProjects(Array.isArray(projectsJson.data?.projects) ? projectsJson.data.projects : []);
        setScope(projectsJson.data?.scope === 'enterprise' ? 'enterprise' : 'managed');
        if (accessRes.ok && accessJson.status === 'success') {
          setIdentity(accessJson.data?.identity || null);
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load dashboard');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const kpis = useMemo(() => {
    const activeCount = projects.filter((project) => /active/i.test(project.status)).length || projects.length;
    const value = projects.reduce((sum, project) => sum + Number(project.contractValue || 0), 0);
    const progress = projects.length
      ? projects.reduce((sum, project) => sum + Number(project.actual || 0), 0) / projects.length
      : 0;
    const atRisk = projects.filter((project) => project.health === 'Watch' || project.health === 'Critical').length;
    return [
      { label: scope === 'enterprise' ? 'Active Projects' : 'My Projects', value: String(activeCount), delta: `${projects.length} in scope`, tone: 'blue' },
      { label: 'Portfolio Value', value: money(value, 'NGN'), delta: scope === 'enterprise' ? 'Enterprise view' : 'Managed contracts', tone: 'indigo' },
      { label: 'Avg Progress', value: `${progress.toFixed(1)}%`, delta: 'Weighted actual progress', tone: 'cyan' },
      { label: 'At Risk', value: String(atRisk), delta: `${projects.filter((p) => p.health === 'Critical').length} critical`, tone: 'amber' },
    ];
  }, [projects, scope]);

  const rows = projects.map((p) => [
    <div className="project-cell" key={p.id}>
      <span className="project-avatar">{p.code.slice(0, 2)}</span>
      <div>
        <a href={`/projects-engineering/projects/${p.id}/overview`}>
          <b>{p.name}</b>
        </a>
        <small>
          {p.code} · {p.phase}
        </small>
      </div>
    </div>,
    p.client,
    p.manager,
    money(p.contractValue, p.currency),
    <Progress key={`${p.id}-p`} value={p.actual} />,
    `${Number(p.schedulePerformance || 0).toFixed(2)}`,
    `${Number(p.costPerformance || 0).toFixed(2)}`,
    <Status key={`${p.id}-s`}>{p.health}</Status>,
  ]);

  return (
    <>
      <PageHeading
        title={scope === 'enterprise' ? 'Project Management & Engineering' : 'My Project Dashboard'}
        description={
          scope === 'enterprise'
            ? 'Enterprise portfolio command centre for DLE engineering, procurement, fabrication and project execution.'
            : 'Projects assigned to you as Project Manager. Open a project to manage planning, engineering, cost, quality and HSE details.'
        }
        actions={
          <>
            <Button variant="secondary" href="/projects-engineering/reports">
              Reports
            </Button>
            {identity?.canCreateProjects ? <Button href="/projects-engineering/projects/new">＋ New Project</Button> : null}
          </>
        }
      />

      {error ? <div className="audit-strip">⚠ {error}</div> : null}
      {loading ? <div className="audit-strip">Loading your project dashboard…</div> : null}

      <div className="kpi-grid four">
        {kpis.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </div>

      {!loading && !projects.length ? (
        <Card title="No projects in your scope" subtitle="Assignment or IT setup required">
          <p style={{ margin: 0, color: '#6f7f95', fontSize: 12, lineHeight: 1.5 }}>
            {identity?.canCreateProjects
              ? 'No projects exist yet. Use New Project to register a project and assign a Project Manager employee code.'
              : 'You do not currently manage any projects. Ask IT to create the project and assign your employee code as Project Manager.'}
          </p>
        </Card>
      ) : (
        <>
          <div className="grid two-one">
            <Card title={scope === 'enterprise' ? 'Portfolio Performance' : 'My Delivery Performance'} subtitle="Planned vs actual progress">
              <div className="performance-chart">
                <div className="chart-value">
                  <span>Average progress</span>
                  <strong>
                    {projects.length
                      ? `${(projects.reduce((sum, project) => sum + Number(project.actual || 0), 0) / projects.length).toFixed(1)}%`
                      : '0%'}
                  </strong>
                  <small>{scope === 'enterprise' ? 'Enterprise portfolio' : 'Your managed set'}</small>
                </div>
                <Sparkline points={[18, 22, 27, 29, 34, 36, 39, 41, 44, 45, 47]} />
                <div className="bar-group">
                  <MiniBar label="On track" value={Math.max(8, 100 - projects.filter((p) => p.health !== 'Healthy').length * 18)} />
                  <MiniBar label="Watch" value={Math.min(100, projects.filter((p) => p.health === 'Watch').length * 22 + 10)} />
                  <MiniBar label="Critical" value={Math.min(100, projects.filter((p) => p.health === 'Critical').length * 28 + 5)} />
                  <MiniBar label="Complete" value={Math.min(100, projects.filter((p) => p.actual >= 95).length * 30 + 8)} />
                </div>
              </div>
            </Card>
            <Card title="Attention" subtitle="Items requiring action">
              <div className="attention-list">
                {projects
                  .filter((project) => project.health !== 'Healthy')
                  .slice(0, 3)
                  .map((project, index) => (
                    <div className={`attention ${project.health === 'Critical' ? 'critical' : 'warning'}`} key={project.id}>
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      <div>
                        <b>{project.name}</b>
                        <small>
                          {project.code} · {project.health} · SPI {Number(project.schedulePerformance || 0).toFixed(2)}
                        </small>
                      </div>
                    </div>
                  ))}
                {!projects.some((project) => project.health !== 'Healthy') ? (
                  <div className="attention info">
                    <span>✓</span>
                    <div>
                      <b>No critical escalations</b>
                      <small>All projects in your scope are healthy or on track.</small>
                    </div>
                  </div>
                ) : null}
              </div>
            </Card>
          </div>

          <Card
            title={scope === 'enterprise' ? 'Active Project Portfolio' : 'Projects You Manage'}
            subtitle={scope === 'enterprise' ? 'Enterprise health, schedule and commercial position' : 'Only projects assigned to you as Project Manager'}
            action={<Toolbar placeholder="Search projects, clients, managers..." />}
          >
            <DataTable
              headers={['Project', 'Client', 'Project Manager', 'Contract Value', 'Progress', 'SPI', 'CPI', 'Health']}
              rows={rows}
            />
          </Card>
        </>
      )}

      <div className="audit-strip">
        ⓘ Scope: {scope === 'enterprise' ? 'Enterprise portfolio' : 'Project Manager assignments only'}
        {identity?.department ? ` · Department: ${identity.department}` : ''}
        {identity?.canCreateProjects ? ' · Create Project: enabled' : ' · Create Project: IT / Super Admin only'}
      </div>
    </>
  );
}
