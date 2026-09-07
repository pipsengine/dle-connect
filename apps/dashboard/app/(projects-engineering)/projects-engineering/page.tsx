'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  PageHeading,
  Button,
  KpiCard,
  Card,
  DataTable,
  Status,
  Progress,
  MiniBar,
  Sparkline,
} from '@/components/projects-engineering/UI';
import { ProjectFormModal } from '@/components/projects-engineering/ProjectFormModal';
import { money } from '@/lib/projects-engineering/format';
import type { Project } from '@/lib/projects-engineering/types';

type AccessIdentity = {
  isItDepartment: boolean;
  canCreateProjects: boolean;
  canEditProjects: boolean;
  canDeleteProjects: boolean;
  canViewEnterprisePortfolio: boolean;
  department: string | null;
};

const POLL_MS = 30000;

export default function PortfolioDashboardPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [scope, setScope] = useState<'enterprise' | 'managed'>('managed');
  const [identity, setIdentity] = useState<AccessIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string>('');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
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
      setProjects(Array.isArray(projectsJson.data?.projects) ? projectsJson.data.projects : []);
      setScope(projectsJson.data?.scope === 'enterprise' ? 'enterprise' : 'managed');
      setLastRefresh(projectsJson.data?.generatedAt || new Date().toISOString());
      if (accessRes.ok && accessJson.status === 'success') {
        setIdentity(accessJson.data?.identity || null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load dashboard');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const kpis = useMemo(() => {
    const activeCount = projects.filter((project) => /^(active|approved|open)$/i.test(project.status)).length;
    const value = projects.reduce((sum, project) => sum + Number(project.contractValue || 0), 0);
    const progress = projects.length
      ? projects.reduce((sum, project) => sum + Number(project.actual || 0), 0) / projects.length
      : 0;
    const atRisk = projects.filter((project) => project.health === 'Watch' || project.health === 'Critical').length;
    return [
      {
        label: scope === 'enterprise' ? 'Active Projects' : 'My Projects',
        value: String(activeCount || projects.length),
        delta: `${projects.length} in scope`,
        tone: 'blue',
        href: '/projects-engineering/projects',
      },
      {
        label: 'Portfolio Value',
        value: money(value, 'NGN'),
        delta: scope === 'enterprise' ? 'Enterprise view' : 'Managed contracts',
        tone: 'indigo',
        href: '/projects-engineering/projects',
      },
      {
        label: 'Avg Progress',
        value: `${progress.toFixed(1)}%`,
        delta: 'Weighted actual progress',
        tone: 'cyan',
        href: '/projects-engineering/projects',
      },
      {
        label: 'At Risk',
        value: String(atRisk),
        delta: `${projects.filter((p) => p.health === 'Critical').length} critical`,
        tone: 'amber',
        href: '/projects-engineering/projects?health=Watch',
      },
    ];
  }, [projects, scope]);

  const sparkPoints = useMemo(() => {
    if (!projects.length) return [0, 0, 0, 0, 0, 0];
    const avg = projects.reduce((sum, project) => sum + Number(project.actual || 0), 0) / projects.length;
    return [avg * 0.55, avg * 0.65, avg * 0.72, avg * 0.8, avg * 0.9, avg].map((n) => Math.round(n * 10) / 10);
  }, [projects]);

  const rows = projects.map((p) => [
    <button
      type="button"
      className="project-cell project-cell-btn"
      key={p.id}
      onClick={() => router.push(`/projects-engineering/projects/${p.id}/overview`)}
    >
      <span className="project-avatar">{p.code.slice(0, 2)}</span>
      <div>
        <b>{p.name}</b>
        <small>
          {p.code} · {p.phase}
        </small>
      </div>
    </button>,
    p.client,
    p.manager,
    money(p.contractValue, p.currency),
    <Progress key={`${p.id}-p`} value={p.actual} />,
    `${Number(p.schedulePerformance || 0).toFixed(2)}`,
    `${Number(p.costPerformance || 0).toFixed(2)}`,
    <button
      type="button"
      className="status-btn"
      key={`${p.id}-s`}
      onClick={() => {
        if (identity?.canEditProjects) {
          setEditProject(p);
          setModalOpen(true);
        } else {
          router.push(`/projects-engineering/projects/${p.id}/overview`);
        }
      }}
    >
      <Status>{p.health}</Status>
    </button>,
  ]);

  return (
    <>
      <PageHeading
        title={scope === 'enterprise' ? 'Project Management & Engineering' : 'My Project Dashboard'}
        description={
          scope === 'enterprise'
            ? 'Live enterprise portfolio from DLE_Enterprise — engineering, procurement, fabrication and project execution.'
            : 'Live projects assigned to you as Project Manager. Click any card or row for details.'
        }
        actions={
          <>
            <Button variant="secondary" href="/projects-engineering/projects">
              All Projects
            </Button>
            <Button variant="secondary" href="/projects-engineering/reports">
              Reports
            </Button>
            {identity?.canCreateProjects ? (
              <Button
                onClick={() => {
                  setEditProject(null);
                  setModalOpen(true);
                }}
              >
                ＋ New Project
              </Button>
            ) : null}
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
              ? 'No projects exist yet in DLE_Enterprise. Use New Project to register one and assign a Project Manager.'
              : 'You do not currently manage any projects. Ask IT to create the project and assign your employee code as Project Manager.'}
          </p>
        </Card>
      ) : (
        <>
          <div className="grid two-one">
            <Card
              title={scope === 'enterprise' ? 'Portfolio Performance' : 'My Delivery Performance'}
              subtitle="Live planned vs actual progress"
              action={
                <Button variant="ghost" href="/projects-engineering/projects">
                  View register
                </Button>
              }
            >
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
                <Sparkline points={sparkPoints} />
                <div className="bar-group">
                  <button type="button" className="bar-link" onClick={() => router.push('/projects-engineering/projects')}>
                    <MiniBar
                      label="Healthy"
                      value={Math.min(100, projects.filter((p) => p.health === 'Healthy').length * (projects.length ? 100 / projects.length : 0))}
                    />
                  </button>
                  <button type="button" className="bar-link" onClick={() => router.push('/projects-engineering/projects')}>
                    <MiniBar
                      label="Watch"
                      value={Math.min(100, projects.filter((p) => p.health === 'Watch').length * (projects.length ? 100 / projects.length : 0))}
                    />
                  </button>
                  <button type="button" className="bar-link" onClick={() => router.push('/projects-engineering/projects')}>
                    <MiniBar
                      label="Critical"
                      value={Math.min(100, projects.filter((p) => p.health === 'Critical').length * (projects.length ? 100 / projects.length : 0))}
                    />
                  </button>
                  <button type="button" className="bar-link" onClick={() => router.push('/projects-engineering/projects')}>
                    <MiniBar
                      label="Complete"
                      value={Math.min(100, projects.filter((p) => p.actual >= 95 || /completed|closed/i.test(p.status)).length * (projects.length ? 100 / projects.length : 0))}
                    />
                  </button>
                </div>
              </div>
            </Card>
            <Card title="Attention" subtitle="Items requiring action">
              <div className="attention-list">
                {projects
                  .filter((project) => project.health !== 'Healthy')
                  .slice(0, 5)
                  .map((project, index) => (
                    <button
                      type="button"
                      className={`attention ${project.health === 'Critical' ? 'critical' : 'warning'} attention-btn`}
                      key={project.id}
                      onClick={() => router.push(`/projects-engineering/projects/${project.id}/overview`)}
                    >
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      <div>
                        <b>{project.name}</b>
                        <small>
                          {project.code} · {project.health} · SPI {Number(project.schedulePerformance || 0).toFixed(2)}
                        </small>
                      </div>
                    </button>
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
            subtitle={
              scope === 'enterprise'
                ? 'Enterprise health, schedule and commercial position'
                : 'Only projects assigned to you as Project Manager'
            }
            action={
              <Button variant="secondary" href="/projects-engineering/projects">
                Manage list
              </Button>
            }
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
        {identity?.canCreateProjects ? ' · Create: enabled' : ' · Create: IT / Super Admin only'}
        {identity?.canDeleteProjects ? ' · Delete: Super Admin' : ''}
        {lastRefresh ? ` · Refreshed ${new Date(lastRefresh).toLocaleTimeString()}` : ''}
        {` · Live poll ${POLL_MS / 1000}s`}
      </div>

      <ProjectFormModal
        open={modalOpen}
        mode={editProject ? 'edit' : 'create'}
        project={editProject}
        onClose={() => {
          setModalOpen(false);
          setEditProject(null);
        }}
        onSaved={async () => {
          await load(true);
        }}
      />
    </>
  );
}
