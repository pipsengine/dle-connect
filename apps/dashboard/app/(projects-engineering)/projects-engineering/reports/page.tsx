'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeading, Card, Button, KpiCard } from '@/components/projects-engineering/UI';
import { money } from '@/lib/projects-engineering/format';
import type { Project } from '@/lib/projects-engineering/types';

const POLL_MS = 30000;

const reportTemplates = [
  ['Executive Project Report', 'One-page project health, progress, cost, risk and decisions', 'Weekly', 'MD/CEO · CFO · GMs'],
  ['Monthly Progress Report', 'Client-facing engineering, procurement, construction and HSE pack', 'Monthly', 'Client · Project Team'],
  ['Cost & Forecast Report', 'Budget, commitments, actuals, EAC, cash flow and variances', 'Monthly', 'CFO · Project Manager'],
  ['Portfolio Status Pack', 'Live register summary across all projects in scope', 'On demand', 'PMO · Management'],
];

export default function PortfolioReportsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/projects-engineering/projects', { cache: 'no-store', credentials: 'same-origin' });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to load projects');
      setProjects(Array.isArray(json.data?.projects) ? json.data.projects : []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load reports data');
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const stats = useMemo(() => {
    const value = projects.reduce((sum, p) => sum + Number(p.contractValue || 0), 0);
    const atRisk = projects.filter((p) => p.health !== 'Healthy').length;
    const active = projects.filter((p) => /^(active|approved|open)$/i.test(p.status)).length;
    return { value, atRisk, active, total: projects.length };
  }, [projects]);

  return (
    <>
      <PageHeading
        title="Portfolio Reporting Centre"
        description="Report templates use live DLE_Enterprise project data. Operational pack generation will expand as registers are populated."
        actions={
          <Button variant="secondary" href="/projects-engineering/projects">
            Projects list
          </Button>
        }
      />
      {error ? <div className="audit-strip">⚠ {error}</div> : null}
      <div className="kpi-grid four">
        <KpiCard label="Projects in Scope" value={String(stats.total)} delta={`${stats.active} active`} href="/projects-engineering/projects" />
        <KpiCard label="Portfolio Value" value={money(stats.value, 'NGN')} delta="Contract total" tone="indigo" href="/projects-engineering/projects" />
        <KpiCard label="At Risk" value={String(stats.atRisk)} delta="Watch + Critical" tone="amber" href="/projects-engineering/projects" />
        <KpiCard label="Refresh" value={`${POLL_MS / 1000}s`} delta="Live polling" tone="cyan" href="/projects-engineering" />
      </div>
      <div className="report-grid">
        {reportTemplates.map((r) => (
          <Card key={r[0]}>
            <div className="report-card">
              <div className="report-icon">▥</div>
              <h3>{r[0]}</h3>
              <p>{r[1]}</p>
              <div>
                <span>{r[2]}</span>
                <small>{r[3]}</small>
              </div>
              <Button variant="secondary" href="/projects-engineering/projects">
                Open live data
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
