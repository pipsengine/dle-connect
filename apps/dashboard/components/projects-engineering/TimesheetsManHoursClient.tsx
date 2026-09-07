'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeading, Button, KpiCard, Card, DataTable, Status, Toolbar } from '@/components/projects-engineering/UI';
import { hours, pct } from '@/lib/projects-engineering/format';
import type { PortfolioManHourSummary } from '@/lib/projects-engineering/man-hour-types';
import type { Project } from '@/lib/projects-engineering/types';

const POLL_MS = 30000;

export function TimesheetsManHoursClient() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [rows, setRows] = useState<PortfolioManHourSummary[]>([]);
  const [totals, setTotals] = useState({
    productiveHours: 0,
    pmApprovedHours: 0,
    employeeCount: 0,
    budgetedHours: 0,
    projectsWithHours: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [projectsRes, mhRes] = await Promise.all([
        fetch('/api/projects-engineering/projects', { cache: 'no-store', credentials: 'same-origin' }),
        fetch('/api/projects-engineering/man-hours?gate=pmApproved', { cache: 'no-store', credentials: 'same-origin' }),
      ]);
      const projectsJson = await projectsRes.json();
      const mhJson = await mhRes.json();
      if (!projectsRes.ok || projectsJson.status !== 'success') {
        throw new Error(projectsJson.error || 'Unable to load projects');
      }
      setProjects(Array.isArray(projectsJson.data?.projects) ? projectsJson.data.projects : []);
      if (mhRes.ok && mhJson.status === 'success') {
        setRows(Array.isArray(mhJson.data?.rows) ? mhJson.data.rows : []);
        setTotals({
          productiveHours: Number(mhJson.data?.totals?.productiveHours || 0),
          pmApprovedHours: Number(mhJson.data?.totals?.pmApprovedHours || 0),
          employeeCount: Number(mhJson.data?.totals?.employeeCount || 0),
          budgetedHours: Number(mhJson.data?.totals?.budgetedHours || 0),
          projectsWithHours: Number(mhJson.data?.totals?.projectsWithHours || 0),
        });
      }
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load man-hours');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const projectByCode = useMemo(() => {
    const map = new Map<string, Project>();
    for (const p of projects) map.set(String(p.code || '').toUpperCase(), p);
    return map;
  }, [projects]);

  const utilisation =
    totals.budgetedHours > 0 ? (totals.pmApprovedHours / totals.budgetedHours) * 100 : 0;
  const remaining = Math.max(0, totals.budgetedHours - totals.pmApprovedHours);

  const tableRows = rows.map((row) => {
    const project = projectByCode.get(row.projectCode.toUpperCase());
    const util = row.budgetedHours > 0 ? (row.pmApprovedHours / row.budgetedHours) * 100 : 0;
    return [
      project ? (
        <Link
          key={row.projectCode}
          href={`/projects-engineering/projects/${project.id}`}
          className="font-semibold text-blue-700 hover:underline"
        >
          {row.projectCode}
        </Link>
      ) : (
        row.projectCode
      ),
      hours(row.pmApprovedHours),
      hours(row.budgetedHours),
      row.budgetedHours > 0 ? pct(util) : '—',
      String(row.employeeCount || 0),
      <Status key={`${row.projectCode}-st`}>{util > 100 ? 'Over budget' : util > 85 ? 'Watch' : 'On track'}</Status>,
      project ? (
        <Link
          key={`${row.projectCode}-open`}
          href={`/projects-engineering/projects/${project.id}/resources`}
          className="text-sm font-semibold text-blue-700 hover:underline"
        >
          Open
        </Link>
      ) : (
        '—'
      ),
    ];
  });

  return (
    <>
      <PageHeading
        title="Timesheets & Man-Hours"
        description="DLE workflow: Supervisor → Project Manager → Cost Control → HR → Payroll. Utilisation = approved actual project hours ÷ approved man-hour budget — not timesheet presence alone."
        actions={
          <>
            <Button variant="secondary" href="/hris/time-and-logs/timesheet-entry">
              HRIS Timesheet Entry
            </Button>
            <Button href="/projects-engineering/cost-control">Cost Control Labour</Button>
          </>
        }
      />

      <div className="kpi-grid">
        <KpiCard label="Approved Booked MH" value={hours(totals.pmApprovedHours)} delta="PM-approved+ gate" tone="rose" href="/projects-engineering/timesheets" />
        <KpiCard label="Approved MH Budget" value={hours(totals.budgetedHours)} delta="pm.ManHourBudgets" tone="indigo" />
        <KpiCard
          label="Man-Hour Utilisation"
          value={totals.budgetedHours > 0 ? pct(utilisation) : '—'}
          delta="Actual ÷ budget × 100"
          tone="blue"
        />
        <KpiCard label="Remaining Hours" value={hours(remaining)} delta={`${totals.projectsWithHours} projects with hours`} tone="cyan" />
        <KpiCard label="Employees Booked" value={String(totals.employeeCount)} delta="Distinct people" tone="amber" />
        <KpiCard label="Productive Hours" value={hours(totals.productiveHours)} delta="All productive bookings" tone="purple" />
      </div>

      <Card
        title="Man-hour control centre"
        subtitle="Planned vs actual by project. Open a project workspace Man Hours tab for discipline drill-down and S-curves."
        action={<Button variant="secondary" href="/projects-engineering/resources">Resources</Button>}
      >
        <Toolbar placeholder="Search project code…" />
        {loading ? (
          <div className="py-10 text-center text-sm text-slate-500">Loading approved man-hours…</div>
        ) : error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
        ) : tableRows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-10 text-center">
            <h3 className="text-base font-bold text-slate-900">No approved project man-hours in scope</h3>
            <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600">
              Bookings appear after Supervisor and Project Manager approval against a project code. Set man-hour budgets on the project to compute utilisation correctly.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button href="/hris/time-and-logs/timesheet-entry">Open Timesheet Entry</Button>
              <Button variant="secondary" href="/projects-engineering/projects">Projects Register</Button>
            </div>
          </div>
        ) : (
          <DataTable
            headers={['Project', 'Booked Hours', 'Budget Hours', 'Utilisation %', 'Employees', 'Status', 'Open']}
            rows={tableRows}
          />
        )}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Approval queues" subtitle="Cost Control workbench">
          <ul className="space-y-2 text-sm">
            <li>
              <Link className="font-semibold text-blue-700 hover:underline" href="/hris/time-and-logs/timesheet-entry">
                Pending Supervisor / PM (HRIS)
              </Link>
            </li>
            <li>
              <Link className="font-semibold text-blue-700 hover:underline" href="/projects-engineering/cost-control">
                Pending Cost Control validation
              </Link>
            </li>
            <li className="text-slate-600">HR / Payroll consolidation — after Cost Control gate</li>
          </ul>
        </Card>
        <Card title="Analysis dimensions" subtitle="Filter utilisation">
          <p className="text-sm text-slate-600">
            Project · Discipline · Department · Employee · Supervisor · PM · WBS · Cost Code · Period · Week · Month
          </p>
        </Card>
        <Card title="Formula" subtitle="Do not use presence as utilisation">
          <p className="text-sm font-mono text-slate-800">
            Utilisation % = Approved Actual Project Hours ÷ Approved Planned MH Budget × 100
          </p>
        </Card>
      </div>
    </>
  );
}
