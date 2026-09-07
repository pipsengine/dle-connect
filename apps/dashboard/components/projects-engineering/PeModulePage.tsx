'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { PageHeading, Button, KpiCard, Card, DataTable, Toolbar, Status } from '@/components/projects-engineering/UI';
import type { PeModuleDefinition } from '@/lib/projects-engineering/module-catalog';
import type { Project } from '@/lib/projects-engineering/types';
import { money, pct } from '@/lib/projects-engineering/format';

type Props = {
  module: PeModuleDefinition;
  /** When true, loads projects into the register table for drill-down. */
  projectAware?: boolean;
};

export function PeModulePage({ module, projectAware = true }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(projectAware);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!projectAware) {
      setLoading(false);
      return;
    }
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/projects-engineering/projects', { cache: 'no-store', credentials: 'same-origin' });
        const json = await res.json();
        if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to load projects');
        if (active) {
          setProjects(Array.isArray(json.data?.projects) ? json.data.projects : []);
          setError('');
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load module data');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [projectAware]);

  const activeCount = projects.filter((p) => /active|approved|open|engineering|fabrication|construction/i.test(p.status)).length;
  const atRisk = projects.filter((p) => /critical|watch|hold|risk/i.test(`${p.health || ''} ${p.status || ''}`)).length;
  const contractValue = projects.reduce((sum, p) => sum + Number(p.contractValue || 0), 0);
  const avgProgress =
    projects.length > 0
      ? projects.reduce((sum, p) => sum + Number(p.actual ?? 0), 0) / projects.length
      : 0;

  const liveKpis = module.kpis.map((kpi, index) => {
    if (kpi.value !== '—' && kpi.value !== 'Live') return kpi;
    const liveValues = [String(activeCount || projects.length), money(contractValue), pct(avgProgress), String(atRisk)];
    return { ...kpi, value: liveValues[index % liveValues.length] || '0' };
  });

  const rows =
    projects.length > 0
      ? projects.slice(0, 25).map((p) => {
          const cells: (string | number | ReactNode)[] = [
            <Link key="code" href={`/projects-engineering/projects/${p.id}`} className="font-semibold text-blue-700 hover:underline">
              {p.code}
            </Link>,
            p.name,
            p.client || '—',
            p.manager || '—',
            money(Number(p.contractValue || 0)),
            pct(Number(p.actual ?? 0)),
            <Status key="health">{p.health || p.status || '—'}</Status>,
          ];
          // Pad/truncate to match column count
          while (cells.length < module.columns.length) cells.push('—');
          return cells.slice(0, module.columns.length);
        })
      : [];

  return (
    <>
      <PageHeading
        title={module.title}
        description={module.subtitle}
        actions={
          <>
            {module.secondaryAction ? (
              <Button variant="secondary" href={module.secondaryAction.href}>
                {module.secondaryAction.label}
              </Button>
            ) : null}
            {module.primaryAction ? <Button href={module.primaryAction.href}>{module.primaryAction.label}</Button> : null}
          </>
        }
      />

      <div className="kpi-grid">
        {liveKpis.map((kpi) => (
          <KpiCard key={kpi.label} label={kpi.label} value={kpi.value} delta={kpi.hint} tone={kpi.tone || 'blue'} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <Card title={`${module.title} register`} subtitle="Project-scoped operational view — select a project to open the workspace.">
          <Toolbar placeholder={`Search ${module.title.toLowerCase()}…`} />
          {loading ? (
            <div className="py-10 text-center text-sm text-slate-500">Loading module data…</div>
          ) : error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-10 text-center">
              <h3 className="text-base font-bold text-slate-900">{module.emptyTitle}</h3>
              <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600">{module.emptyBody}</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {module.primaryAction ? (
                  <Button href={module.primaryAction.href}>{module.primaryAction.label}</Button>
                ) : null}
                {module.secondaryAction ? (
                  <Button variant="secondary" href={module.secondaryAction.href}>
                    {module.secondaryAction.label}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : (
            <DataTable headers={module.columns} rows={rows} />
          )}
        </Card>

        <div className="space-y-4">
          <Card title="Related modules" subtitle="Continue the EPC workflow">
            <ul className="space-y-2">
              {module.related.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="text-sm font-semibold text-blue-700 hover:underline">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="States" subtitle="Enterprise UX contract">
            <ul className="space-y-2 text-sm text-slate-600">
              <li>Loading — skeleton / inline progress</li>
              <li>Empty — business context + permitted actions</li>
              <li>Error — recoverable message</li>
              <li>Permission — portal RBAC + project scope</li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
