'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeading, Card, KpiCard, DataTable, Status, MiniBar, Progress, Button } from '@/components/projects-engineering/UI';
import { money, dmy } from '@/lib/projects-engineering/format';
import type { Project } from '@/lib/projects-engineering/types';

const POLL_MS = 30000;

export default function PortfolioPlanningPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/projects-engineering/projects', { cache: 'no-store', credentials: 'same-origin' });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to load projects');
      setProjects(Array.isArray(json.data?.projects) ? json.data.projects : []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load portfolio');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const stats = useMemo(() => {
    const active = projects.filter((p) => /^(active|approved|open)$/i.test(p.status));
    const avgSpi =
      projects.length
        ? projects.reduce((sum, p) => sum + Number(p.schedulePerformance || 0), 0) / projects.length
        : 0;
    const atRisk = projects.filter((p) => p.health === 'Watch' || p.health === 'Critical');
    const avgActual =
      projects.length ? projects.reduce((sum, p) => sum + Number(p.actual || 0), 0) / projects.length : 0;
    return { active: active.length, avgSpi, atRisk: atRisk.length, avgActual };
  }, [projects]);

  const rows = projects.map((p) => [
    <button
      type="button"
      className="project-cell project-cell-btn"
      key={p.id}
      onClick={() => router.push(`/projects-engineering/projects/${p.id}/planning`)}
    >
      <span className="project-avatar">{p.code.slice(0, 2)}</span>
      <div>
        <b>{p.name}</b>
        <small>
          {p.code} · {p.phase}
        </small>
      </div>
    </button>,
    dmy(p.start),
    dmy(p.finish),
    <Progress key={`${p.id}-p`} value={Number(p.actual || 0)} />,
    Number(p.schedulePerformance || 0).toFixed(2),
    <Status key={`${p.id}-h`}>{p.health}</Status>,
  ]);

  return (
    <>
      <PageHeading
        title="Planning & Portfolio Controls"
        description="Live portfolio planning view driven by DLE_Enterprise projects. Schedule registers will attach as WBS data is captured."
        actions={
          <Button variant="secondary" href="/projects-engineering/projects">
            Projects list
          </Button>
        }
      />
      {error ? <div className="audit-strip">⚠ {error}</div> : null}
      {loading ? <div className="audit-strip">Loading live portfolio…</div> : null}
      <div className="kpi-grid four">
        <KpiCard label="Active Projects" value={String(stats.active)} delta={`${projects.length} total`} href="/projects-engineering/projects" />
        <KpiCard label="Average SPI" value={stats.avgSpi.toFixed(2)} delta="Target ≥ 0.98" tone="indigo" href="/projects-engineering/projects" />
        <KpiCard label="Avg Progress" value={`${stats.avgActual.toFixed(1)}%`} delta="Actual across portfolio" tone="cyan" href="/projects-engineering/projects" />
        <KpiCard label="At Risk" value={String(stats.atRisk)} delta="Watch + Critical" tone="rose" href="/projects-engineering/projects" />
      </div>
      <div className="grid two">
        <Card title="Portfolio Schedule Health" subtitle="Derived from live project progress">
          <MiniBar label="Average actual" value={stats.avgActual} />
          <MiniBar label="Healthy share" value={projects.length ? (projects.filter((p) => p.health === 'Healthy').length / projects.length) * 100 : 0} />
          <MiniBar label="Watch share" value={projects.length ? (projects.filter((p) => p.health === 'Watch').length / projects.length) * 100 : 0} />
          <MiniBar label="Critical share" value={projects.length ? (projects.filter((p) => p.health === 'Critical').length / projects.length) * 100 : 0} />
        </Card>
        <Card title="Commercial Position" subtitle="Contract values from project profiles">
          <div className="metric-stack">
            {projects.slice(0, 4).map((p) => (
              <button
                type="button"
                key={p.id}
                className="metric-stack-btn"
                onClick={() => router.push(`/projects-engineering/projects/${p.id}/overview`)}
                style={{ display: 'contents' }}
              >
                <div>
                  <span>{p.code}</span>
                  <b>{money(p.contractValue, p.currency)}</b>
                  <Status>{p.status}</Status>
                </div>
              </button>
            ))}
            {!projects.length ? (
              <div>
                <span>No projects</span>
                <b>—</b>
                <Status>Draft</Status>
              </div>
            ) : null}
          </div>
        </Card>
      </div>
      <Card title="Project Schedule Board" subtitle="Click a project to open planning workspace">
        {!projects.length && !loading ? (
          <p style={{ margin: 0, color: '#6f7f95', fontSize: 12 }}>No live projects available.</p>
        ) : (
          <DataTable headers={['Project', 'Start', 'Finish', 'Progress', 'SPI', 'Health']} rows={rows} />
        )}
      </Card>
    </>
  );
}
