'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Download,
  Factory,
  Gauge,
  Layers3,
  RefreshCcw,
  Users,
} from 'lucide-react';
import { PageTemplate } from '@/components/layout/page-template';
import type { OperationsPayload, OperationsSection } from '@/lib/operations-center-store';

type Props = {
  initialSection: OperationsSection;
};

const sectionTitle: Record<OperationsSection, string> = {
  'operations-dashboard': 'Operations Dashboard',
  timesheets: 'Timesheets',
  'workforce-allocation': 'Workforce Allocation',
  'resource-planning': 'Resource Planning',
  'daily-activity-reports': 'Daily Activity Reports',
  'production-tracking': 'Production Tracking',
};

const iconFor = (id: OperationsSection) => {
  if (id === 'timesheets') return ClipboardList;
  if (id === 'workforce-allocation') return Users;
  if (id === 'resource-planning') return CalendarDays;
  if (id === 'daily-activity-reports') return Activity;
  if (id === 'production-tracking') return Factory;
  return Gauge;
};

const toneClass = {
  blue: 'border-blue-200 bg-blue-50 text-blue-900',
  green: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  amber: 'border-amber-200 bg-amber-50 text-amber-900',
  red: 'border-rose-200 bg-rose-50 text-rose-900',
  slate: 'border-slate-200 bg-slate-50 text-slate-900',
};

const number = (value: number) => Intl.NumberFormat('en-NG', { maximumFractionDigits: 1 }).format(value || 0);
const dateText = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

function KpiStrip({ payload }: { payload: OperationsPayload }) {
  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
      {payload.kpis.map((kpi) => (
        <div key={kpi.label} className={`rounded-lg border p-3 shadow-sm ${toneClass[kpi.tone]}`}>
          <div className="text-[11px] font-black uppercase tracking-normal opacity-75">{kpi.label}</div>
          <div className="mt-2 text-2xl font-black">{kpi.value}</div>
          <div className="mt-1 text-xs font-semibold leading-5 opacity-80">{kpi.detail}</div>
        </div>
      ))}
    </section>
  );
}

function SectionTabs({ payload, active }: { payload: OperationsPayload; active: OperationsSection }) {
  return (
    <nav className="flex gap-2 overflow-x-auto rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
      {payload.sections.map((section) => {
        const Icon = iconFor(section.id);
        const selected = active === section.id;
        return (
          <Link key={section.id} href={section.href} className={`flex h-10 shrink-0 items-center gap-2 rounded-md px-3 text-xs font-black transition-colors ${selected ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'}`}>
            <Icon className="h-4 w-4" />
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}

function WorkflowPanel({ payload }: { payload: OperationsPayload }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-4">
        <h2 className="text-sm font-black text-slate-950">Approval Workflow</h2>
        <p className="mt-1 text-xs font-semibold text-slate-500">Supervisor to Project Manager to Cost Control to HR, with payroll readiness tracked.</p>
      </div>
      <div className="grid grid-cols-1 divide-y divide-slate-100 md:grid-cols-4 md:divide-x md:divide-y-0">
        {payload.approvalWorkflow.map((step) => (
          <div key={step.stage} className="p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-black uppercase text-slate-500">{step.stage}</span>
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-700">{step.status}</span>
            </div>
            <div className="mt-3 text-sm font-black text-slate-950">{step.owner}</div>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{step.rule}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function TimesheetPanel({ payload }: { payload: OperationsPayload }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-sm font-black text-slate-950">Timesheet Control Desk</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">Crew booking, project/cost-centre time allocation, approval status, and payroll readiness.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/hris/workforce-management/timesheet-entry" className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-3 text-xs font-black text-white hover:bg-blue-700"><ClipboardList className="h-4 w-4" />Enter Timesheet</Link>
          <Link href="/hris/workforce-management/timesheet-approval" className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-50"><CheckCircle2 className="h-4 w-4" />Approval Queue</Link>
          <button type="button" onClick={() => { window.location.href = '/api/operations-center?format=csv'; }} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-50"><Download className="h-4 w-4" />CSV</button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 p-4 lg:grid-cols-4">
        {[
          ['Headers', payload.timesheets.summary.totalHeaders],
          ['Pending', payload.timesheets.summary.pendingApprovals],
          ['Payroll Ready', payload.timesheets.summary.payrollReady],
          ['Exceptions', payload.timesheets.summary.exceptions],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg bg-slate-50 p-3">
            <div className="text-[11px] font-black uppercase text-slate-500">{label}</div>
            <div className="mt-1 text-xl font-black text-slate-950">{number(Number(value))}</div>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
            <tr>
              {['Date', 'Supervisor', 'Work Center', 'Stage', 'Status', 'Employees', 'Hours', 'Payroll'].map((header) => <th key={header} className="px-4 py-3 font-black">{header}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {payload.timesheets.records.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-bold text-slate-900">{dateText(row.date)}</td>
                <td className="px-4 py-3 font-semibold text-slate-700">{row.supervisor}</td>
                <td className="px-4 py-3 font-semibold text-slate-700">{row.workCenter}</td>
                <td className="px-4 py-3"><span className="rounded-full bg-blue-50 px-2 py-1 font-black text-blue-700">{row.stage}</span></td>
                <td className="px-4 py-3 font-semibold text-slate-700">{row.status}</td>
                <td className="px-4 py-3 font-semibold text-slate-700">{row.employees}</td>
                <td className="px-4 py-3 font-semibold text-slate-700">{number(row.totalHours)}</td>
                <td className="px-4 py-3 font-semibold text-slate-700">{row.payrollStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AllocationPanel({ payload }: { payload: OperationsPayload }) {
  return (
    <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4"><h2 className="text-sm font-black text-slate-950">Workforce Allocation</h2></div>
        <div className="divide-y divide-slate-100">
          {payload.workforceAllocation.byDepartment.map((row) => (
            <div key={row.name} className="grid grid-cols-[1fr_auto] gap-3 p-4">
              <div>
                <div className="text-sm font-black text-slate-950">{row.name}</div>
                <div className="mt-1 text-xs font-semibold text-slate-500">{row.employees} employees | {number(row.hours)} hours</div>
              </div>
              <div className="text-right text-sm font-black text-blue-700">{row.utilizationPct}%</div>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4"><h2 className="text-sm font-black text-slate-950">Project / Cost Centre Allocation</h2></div>
        <div className="divide-y divide-slate-100">
          {payload.workforceAllocation.byProject.map((row) => (
            <div key={`${row.code}-${row.name}`} className="grid grid-cols-[1fr_auto] gap-3 p-4">
              <div>
                <div className="text-sm font-black text-slate-950">{row.code} - {row.name}</div>
                <div className="mt-1 text-xs font-semibold text-slate-500">{row.costCenter} | {row.employees} employees</div>
              </div>
              <div className="text-right text-sm font-black text-slate-900">{number(row.hours)}h</div>
            </div>
          ))}
          {!payload.workforceAllocation.byProject.length ? <div className="p-4 text-xs font-bold text-slate-500">No project allocation lines found for the active period.</div> : null}
        </div>
      </div>
    </section>
  );
}

function PlanningProductionPanel({ payload }: { payload: OperationsPayload }) {
  return (
    <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4">
          <h2 className="text-sm font-black text-slate-950">Resource Planning</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">Demand vs availability, capacity risk, and scheduling signal.</p>
        </div>
        <div className="grid grid-cols-3 gap-3 p-4">
          <div className="rounded-lg bg-slate-50 p-3"><div className="text-[11px] font-black uppercase text-slate-500">Demand</div><div className="mt-1 text-xl font-black">{number(payload.resourcePlanning.demand)}</div></div>
          <div className="rounded-lg bg-slate-50 p-3"><div className="text-[11px] font-black uppercase text-slate-500">Available</div><div className="mt-1 text-xl font-black">{number(payload.resourcePlanning.availability)}</div></div>
          <div className="rounded-lg bg-slate-50 p-3"><div className="text-[11px] font-black uppercase text-slate-500">Gap</div><div className="mt-1 text-xl font-black">{number(payload.resourcePlanning.gap)}</div></div>
        </div>
        <div className="divide-y divide-slate-100">
          {payload.resourcePlanning.forecast.map((row) => (
            <div key={row.period} className="grid grid-cols-4 gap-3 px-4 py-3 text-xs font-bold text-slate-700">
              <span>{row.period}</span><span>Demand {row.demand}</span><span>Avail. {row.availability}</span><span className={row.gap < 0 ? 'text-rose-600' : 'text-emerald-600'}>Gap {row.gap}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4">
          <h2 className="text-sm font-black text-slate-950">Production Tracking</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">Target vs actual labor productivity by operational area.</p>
        </div>
        <div className="p-4">
          <div className="rounded-lg bg-blue-50 p-4 text-blue-950">
            <div className="text-[11px] font-black uppercase">Productivity</div>
            <div className="mt-1 text-3xl font-black">{payload.production.productivityPct}%</div>
            <div className="mt-1 text-xs font-semibold">{number(payload.production.actualHours)} actual hours vs {number(payload.production.targetHours)} target hours</div>
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {payload.production.outputs.map((row) => (
            <div key={row.area} className="grid grid-cols-[1fr_auto] gap-3 p-4">
              <div>
                <div className="text-sm font-black text-slate-950">{row.area}</div>
                <div className="mt-1 text-xs font-semibold text-slate-500">Target {row.target} | Actual {row.actual} | Variance {row.variance}</div>
              </div>
              <span className={`self-start rounded-full px-2 py-1 text-[10px] font-black ${row.status === 'On Target' ? 'bg-emerald-50 text-emerald-700' : row.status === 'Watch' ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}`}>{row.status}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function DailyReportsPanel({ payload }: { payload: OperationsPayload }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-4">
        <h2 className="text-sm font-black text-slate-950">Daily Activity Reports</h2>
        <p className="mt-1 text-xs font-semibold text-slate-500">Site activities, completed work, issues, delays, incidents, manpower, and evidence readiness.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 p-4 lg:grid-cols-2">
        {payload.dailyReports.map((report) => (
          <div key={report.id} className="rounded-lg border border-slate-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-black text-slate-950">{report.site}</div>
                <div className="mt-1 text-xs font-bold text-slate-500">{dateText(report.date)} | {report.manpower} manpower deployed</div>
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-700">{report.status}</span>
            </div>
            <p className="mt-3 text-xs font-semibold leading-5 text-slate-600">{report.activities}</p>
            <div className="mt-3 grid grid-cols-1 gap-2 text-xs font-bold text-slate-600 sm:grid-cols-2">
              <div className="rounded-md bg-amber-50 p-2 text-amber-800">Issues: {report.issues}</div>
              <div className="rounded-md bg-rose-50 p-2 text-rose-800">Incidents: {report.incidents}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function IntegrationPanel({ payload }: { payload: OperationsPayload }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Layers3 className="h-4 w-4 text-blue-600" />
        <h2 className="text-sm font-black text-slate-950">Enterprise Integration</h2>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {payload.integrations.map((item) => (
          <div key={item.module} className="rounded-lg bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-black text-slate-950">{item.module}</span>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">{item.status}</span>
            </div>
            <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">{item.purpose}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function OperationsCenterClient({ initialSection }: Props) {
  const [payload, setPayload] = useState<OperationsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const activeSection = initialSection;

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/operations-center?section=${activeSection}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to load Operations Center.');
      setPayload(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load Operations Center.');
    } finally {
      setLoading(false);
    }
  }, [activeSection]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const title = sectionTitle[activeSection];
  const updated = useMemo(() => payload ? new Date(payload.generatedAt).toLocaleString('en-GB') : '', [payload]);

  return (
    <PageTemplate
      title="Operations Center"
      description="Enterprise hub for workforce execution, labor allocation, resource utilization, operational reporting, and production performance."
      breadcrumbs={[{ label: 'Enterprise', href: '/' }, { label: title }]}
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white"><BarChart3 className="h-5 w-5" /></div>
            <div>
              <div className="text-sm font-black text-slate-950">{title}</div>
              <div className="text-xs font-semibold text-slate-500">{payload?.source || 'Loading enterprise operations data'}{updated ? ` | Refreshed ${updated}` : ''}</div>
            </div>
          </div>
          <button type="button" onClick={() => { void load(); }} className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-50">
            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh
          </button>
        </div>

        {payload ? <SectionTabs payload={payload} active={activeSection} /> : null}

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">{error}</div>
        ) : null}

        {payload ? (
          <>
            <KpiStrip payload={payload} />
            {payload.resourcePlanning.risks.length ? (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                {payload.resourcePlanning.risks.map((risk) => (
                  <div key={risk.title} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                    <div className="flex items-center gap-2 text-sm font-black"><AlertTriangle className="h-4 w-4" />{risk.title}</div>
                    <p className="mt-1 text-xs font-semibold leading-5">{risk.detail}</p>
                  </div>
                ))}
              </div>
            ) : null}

            {(activeSection === 'operations-dashboard' || activeSection === 'timesheets') ? <TimesheetPanel payload={payload} /> : null}
            {(activeSection === 'operations-dashboard' || activeSection === 'workforce-allocation') ? <AllocationPanel payload={payload} /> : null}
            {(activeSection === 'operations-dashboard' || activeSection === 'resource-planning' || activeSection === 'production-tracking') ? <PlanningProductionPanel payload={payload} /> : null}
            {(activeSection === 'operations-dashboard' || activeSection === 'daily-activity-reports') ? <DailyReportsPanel payload={payload} /> : null}
            <WorkflowPanel payload={payload} />
            <IntegrationPanel payload={payload} />

            <div className="flex flex-wrap gap-2">
              <Link href="/hris/workforce-management/timesheet-entry" className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-black text-white hover:bg-slate-800">Open Timesheet Entry <ArrowRight className="h-4 w-4" /></Link>
              <Link href="/hris/workforce-management/timesheet-approval" className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-black text-slate-700 hover:bg-slate-50">Open Approval Workflow <ArrowRight className="h-4 w-4" /></Link>
            </div>
          </>
        ) : loading ? (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-sm font-bold text-slate-500 shadow-sm">Loading Operations Center...</div>
        ) : null}
      </div>
    </PageTemplate>
  );
}
