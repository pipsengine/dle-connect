'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, DataTable, KpiCard, MiniBar, PageHeading, Progress, Status, Toolbar } from '@/components/projects-engineering/UI';
import { ManHourUtilizationPanel } from '@/components/projects-engineering/ManHourUtilizationPanel';
import { deriveProjectCostSnapshot } from '@/lib/projects-engineering/cost-control';
import { money } from '@/lib/projects-engineering/format';
import type { Project } from '@/lib/projects-engineering/types';

export const costTabs = [
  ['overview', 'Overview'],
  ['budget-baseline', 'Budget & Baseline'],
  ['cbs', 'CBS & Cost Codes'],
  ['commitments', 'Commitments'],
  ['actuals', 'Actual Costs'],
  ['labour-timesheets', 'Labour & Timesheets'],
  ['forecast', 'Forecast / ETC / EAC'],
  ['earned-value', 'Earned Value'],
  ['variations', 'Variations & Changes'],
  ['cash-flow', 'Cash Flow'],
  ['period-close', 'Period Close'],
  ['reports', 'Cost Reports'],
] as const;

export type CostTabKey = (typeof costTabs)[number][0];

const EmptyCostRegister = ({ title, subtitle }: { title: string; subtitle: string }) => (
  <Card title={title} subtitle={subtitle}>
    <p style={{ margin: 0, color: '#6f7f95', fontSize: 12, lineHeight: 1.5 }}>
      No cost-control register rows yet for this project. Apply `database/pm/003_cost_control_schema.sql` and capture
      baselines, CBS, commitments and actuals in DLE_Enterprise. Headline KPIs below use the live project profile until
      those registers are populated.
    </p>
  </Card>
);

export function CostControlHeader({ project, active = 'overview' }: { project: Project; active?: string }) {
  const snap = deriveProjectCostSnapshot(project);
  return (
    <>
      <div className="cost-hero">
        <div className="cost-hero-top">
          <div>
            <div className="eyebrow">Project Cost Control</div>
            <h1>
              {project.code} · {project.name}
            </h1>
            <p>Budget governance, commitments, actuals, forecasting, earned value, labour-cost validation and period close.</p>
          </div>
          <div className="page-actions">
            <Button variant="secondary" href="/projects-engineering/cost-control">
              Portfolio Workbench
            </Button>
            <Button href={`/projects-engineering/projects/${project.id}/cost-control/forecast`}>Open Forecast</Button>
          </div>
        </div>
        <div className="cost-hero-metrics">
          <div>
            <small>Project Manager</small>
            <strong>{project.manager}</strong>
          </div>
          <div>
            <small>Cost Controller</small>
            <strong>Cost Control Unit</strong>
          </div>
          <div>
            <small>Contract Value</small>
            <strong>{money(project.contractValue, project.currency)}</strong>
          </div>
          <div>
            <small>Physical Progress</small>
            <Progress value={Number(project.actual || 0)} />
          </div>
          <div>
            <small>Cost Health</small>
            <Status>{snap.health}</Status>
          </div>
        </div>
      </div>
      <nav className="cost-tabs">
        {costTabs.map(([key, label]) => (
          <Link
            key={key}
            href={`/projects-engineering/projects/${project.id}/cost-control/${key}`}
            className={active === key ? 'active' : ''}
          >
            {label}
          </Link>
        ))}
      </nav>
    </>
  );
}

export function CostControlWorkbench() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/projects-engineering/projects', { cache: 'no-store', credentials: 'same-origin' });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to load projects');
      setProjects(Array.isArray(json.data?.projects) ? json.data.projects : []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load cost workbench');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(timer);
  }, [load]);

  const portfolio = useMemo(() => {
    const snaps = projects.map((p) => ({ project: p, snap: deriveProjectCostSnapshot(p) }));
    const bac = snaps.reduce((s, x) => s + x.snap.bac, 0);
    const commitments = snaps.reduce((s, x) => s + x.snap.commitments, 0);
    const actual = snaps.reduce((s, x) => s + x.snap.actual, 0);
    const eac = snaps.reduce((s, x) => s + x.snap.eac, 0);
    const atRisk = snaps.filter((x) => x.snap.health !== 'Healthy').length;
    return { snaps, bac, commitments, actual, eac, atRisk };
  }, [projects]);

  const rows = portfolio.snaps.map(({ project, snap }) => [
    <button
      type="button"
      className="project-cell project-cell-btn"
      key={project.id}
      onClick={() => router.push(`/projects-engineering/projects/${project.id}/cost-control/overview`)}
    >
      <span className="project-avatar">{project.code.slice(0, 2)}</span>
      <div>
        <b>{project.name}</b>
        <small>{project.code}</small>
      </div>
    </button>,
    money(snap.bac, project.currency),
    money(snap.commitments, project.currency),
    money(snap.actual, project.currency),
    money(snap.etc, project.currency),
    money(snap.eac, project.currency),
    money(snap.vac, project.currency),
    snap.cpi.toFixed(2),
    <Status key={`${project.id}-h`}>{snap.health}</Status>,
  ]);

  return (
    <>
      <PageHeading
        title="Cost Control Workbench"
        description="Portfolio-wide command centre for project budgets, commitments, labour allocations, forecasts, earned value, variations and monthly cost close — driven by live DLE_Enterprise projects."
        actions={
          <>
            <Button variant="secondary" href="/projects-engineering/projects">
              Projects
            </Button>
            <Button href="/projects-engineering">Portfolio Dashboard</Button>
          </>
        }
      />
      {error ? <div className="audit-strip">⚠ {error}</div> : null}
      {loading ? <div className="audit-strip">Loading live cost portfolio…</div> : null}
      <div className="kpi-grid six">
        <KpiCard label="Controlled Budget" value={money(portfolio.bac, 'NGN')} delta={`${projects.length} projects`} href="/projects-engineering/projects" />
        <KpiCard
          label="Commitments"
          value={money(portfolio.commitments, 'NGN')}
          delta={portfolio.bac ? `${((portfolio.commitments / portfolio.bac) * 100).toFixed(1)}% of budget` : '—'}
          tone="indigo"
          href="/projects-engineering/cost-control"
        />
        <KpiCard
          label="Actual Cost"
          value={money(portfolio.actual, 'NGN')}
          delta={portfolio.bac ? `${((portfolio.actual / portfolio.bac) * 100).toFixed(1)}% of budget` : '—'}
          tone="cyan"
        />
        <KpiCard
          label="Portfolio EAC"
          value={money(portfolio.eac, 'NGN')}
          delta={`${money(portfolio.eac - portfolio.bac, 'NGN')} vs BAC`}
          tone="amber"
        />
        <KpiCard label="At Risk Projects" value={String(portfolio.atRisk)} delta="Watch + Critical CPI/health" tone="rose" />
        <KpiCard label="Live Refresh" value="30s" delta="Auto-updates from enterprise projects" tone="purple" />
      </div>
      <div className="grid two-one">
        <Card title="Portfolio Cost Position" subtitle="Budget, commitments, actuals and forecast by live project" action={<Toolbar placeholder="Search project..." />}>
          {!projects.length && !loading ? (
            <p style={{ margin: 0, color: '#6f7f95', fontSize: 12 }}>No live projects available.</p>
          ) : (
            <DataTable headers={['Project', 'BAC', 'Commitments', 'Actual', 'ETC', 'EAC', 'VAC', 'CPI', 'Cost Health']} rows={rows} />
          )}
        </Card>
        <Card title="Cost Controller Inbox" subtitle="Priority follow-ups from live portfolio">
          <div className="cost-inbox">
            {portfolio.snaps
              .filter((x) => x.snap.health !== 'Healthy')
              .slice(0, 5)
              .map(({ project, snap }) => (
                <button
                  type="button"
                  className={`inbox-row ${snap.health === 'Critical' ? 'danger' : 'warning'} project-cell-btn`}
                  key={project.id}
                  onClick={() => router.push(`/projects-engineering/projects/${project.id}/cost-control/overview`)}
                  style={{ width: '100%', textAlign: 'left' }}
                >
                  <span />
                  <div>
                    <b>{project.code} cost review</b>
                    <small>
                      CPI {snap.cpi.toFixed(2)} · VAC {money(snap.vac, project.currency)}
                    </small>
                  </div>
                  <em>{snap.health}</em>
                  <span className="btn secondary" style={{ padding: '5px 8px', fontSize: 9 }}>
                    Review
                  </span>
                </button>
              ))}
            {!portfolio.snaps.some((x) => x.snap.health !== 'Healthy') ? (
              <div className="inbox-row info">
                <span />
                <div>
                  <b>No escalations</b>
                  <small>All projects in scope are cost-healthy on current profiles.</small>
                </div>
                <em>OK</em>
                <span />
              </div>
            ) : null}
          </div>
        </Card>
      </div>
      <div className="grid two">
        <Card title="Budget Consumption by Project">
          {portfolio.snaps.slice(0, 6).map(({ project, snap }) => (
            <button
              type="button"
              className="bar-link"
              key={project.id}
              onClick={() => router.push(`/projects-engineering/projects/${project.id}/cost-control/overview`)}
            >
              <MiniBar label={project.name} value={snap.bac ? Math.min(100, (snap.actual / snap.bac) * 100) : 0} />
            </button>
          ))}
          {!portfolio.snaps.length ? <p style={{ margin: 0, color: '#6f7f95', fontSize: 12 }}>No projects.</p> : null}
        </Card>
        <Card title="Portfolio Cost Alerts">
          <div className="alert-stack">
            {portfolio.snaps
              .filter((x) => x.snap.vac < 0)
              .slice(0, 3)
              .map(({ project, snap }) => (
                <div key={project.id}>
                  <b>
                    {project.code} forecast exceeds BAC by {money(Math.abs(snap.vac), project.currency)}
                  </b>
                  <p>Open the project cost workspace to challenge ETC and lock an approved forecast period.</p>
                </div>
              ))}
            {!portfolio.snaps.some((x) => x.snap.vac < 0) ? (
              <div>
                <b>No forecast overruns on current profiles</b>
                <p>Continue validating commitments and labour allocation as registers are populated.</p>
              </div>
            ) : null}
          </div>
        </Card>
      </div>
    </>
  );
}

type ProjectProps = { project: Project };

export function CostOverview({ project }: ProjectProps) {
  const snap = deriveProjectCostSnapshot(project);
  return (
    <>
      <div className="kpi-grid six">
        <KpiCard label="Approved BAC" value={money(snap.bac, project.currency)} delta="From live contract value" />
        <KpiCard label="Commitments" value={money(snap.commitments, project.currency)} delta={`${snap.bac ? ((snap.commitments / snap.bac) * 100).toFixed(1) : 0}% of BAC`} tone="indigo" />
        <KpiCard label="Actual Cost" value={money(snap.actual, project.currency)} delta={`${Number(project.actual || 0).toFixed(1)}% physical`} tone="cyan" />
        <KpiCard label="ETC" value={money(snap.etc, project.currency)} delta="Remaining forecast" tone="purple" />
        <KpiCard label="EAC" value={money(snap.eac, project.currency)} delta={`${snap.bac ? (((snap.eac / snap.bac) - 1) * 100).toFixed(1) : 0}% vs BAC`} tone="amber" />
        <KpiCard label="VAC" value={money(snap.vac, project.currency)} delta={snap.vac < 0 ? 'Forecast overrun' : 'Within BAC'} tone="rose" />
      </div>
      <div className="grid two">
        <Card title="Cost Performance Summary">
          <div className="cost-summary-grid">
            <div>
              <span>CPI</span>
              <b>{snap.cpi.toFixed(2)}</b>
              <small>{snap.cpi < 1 ? 'Below target 1.00' : 'On / above target'}</small>
            </div>
            <div>
              <span>SPI</span>
              <b>{snap.spi.toFixed(2)}</b>
              <small>Schedule efficiency</small>
            </div>
            <div>
              <span>Physical %</span>
              <b>{Number(project.actual || 0).toFixed(1)}%</b>
              <small>Measured progress</small>
            </div>
            <div>
              <span>Cost %</span>
              <b>{snap.bac ? ((snap.actual / snap.bac) * 100).toFixed(1) : 0}%</b>
              <small>Actual / BAC</small>
            </div>
          </div>
          <div className="cost-waterfall">
            <div>
              <span>Contract / BAC</span>
              <b>{money(snap.bac, project.currency)}</b>
            </div>
            <div>
              <span>Commitments</span>
              <b>{money(snap.commitments, project.currency)}</b>
            </div>
            <div>
              <span>Actual</span>
              <b>{money(snap.actual, project.currency)}</b>
            </div>
            <div>
              <span>Forecast EAC</span>
              <b>{money(snap.eac, project.currency)}</b>
            </div>
          </div>
        </Card>
        <Card title="Progress vs Cost">
          <MiniBar label="Physical progress" value={Number(project.actual || 0)} />
          <MiniBar label="Planned progress" value={Number(project.planned || 0)} />
          <MiniBar label="Cost consumed" value={snap.bac ? Math.min(100, (snap.actual / snap.bac) * 100) : 0} />
          <MiniBar label="Commitment level" value={snap.bac ? Math.min(100, (snap.commitments / snap.bac) * 100) : 0} />
        </Card>
      </div>
      <EmptyCostRegister title="Cost Control Account Summary" subtitle={`Awaiting control accounts for ${project.code}`} />
    </>
  );
}

export function BudgetBaseline({ project }: ProjectProps) {
  const snap = deriveProjectCostSnapshot(project);
  return (
    <>
      <div className="kpi-grid five">
        <KpiCard label="Current BAC" value={money(snap.bac, project.currency)} delta="Live contract value" />
        <KpiCard label="Status" value={project.status} delta={project.phase} tone="indigo" />
        <KpiCard label="Health" value={snap.health} delta={`CPI ${snap.cpi.toFixed(2)}`} tone="amber" />
        <KpiCard label="Actual" value={money(snap.actual, project.currency)} delta="Profile-derived" tone="cyan" />
        <KpiCard label="Available (proxy)" value={money(Math.max(0, snap.bac - snap.commitments), project.currency)} delta="BAC − commitments" />
      </div>
      <div className="grid two">
        <EmptyCostRegister title="Baseline Governance" subtitle={`No locked baselines for ${project.code} yet`} />
        <Card title="Budget Control Rules">
          <div className="policy-list">
            <div>
              <b>Baseline lock</b>
              <p>Approved budgets cannot be directly edited. Changes require a controlled budget-transfer or variation workflow.</p>
            </div>
            <div>
              <b>Funding validation</b>
              <p>Every commitment must resolve to Project → WBS → CBS → Cost Code before approval.</p>
            </div>
            <div>
              <b>Segregation of duties</b>
              <p>Cost Controller validates budget availability but cannot approve own originated financial transactions.</p>
            </div>
            <div>
              <b>Auditability</b>
              <p>Previous and new values, user, reason, approval reference and timestamp are retained in pm.AuditLog.</p>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}

export function CBS({ project }: ProjectProps) {
  return <EmptyCostRegister title="CBS & Cost Codes" subtitle={`No CBS hierarchy for ${project.code} yet`} />;
}
export function Commitments({ project }: ProjectProps) {
  const snap = deriveProjectCostSnapshot(project);
  return (
    <>
      <div className="kpi-grid five">
        <KpiCard label="Total Commitments" value={money(snap.commitments, project.currency)} delta="Profile estimate until PO register is live" />
        <KpiCard label="BAC" value={money(snap.bac, project.currency)} delta="Contract value" tone="indigo" />
        <KpiCard label="Available" value={money(Math.max(0, snap.bac - snap.commitments), project.currency)} delta="Hard-stop aware" tone="cyan" />
        <KpiCard label="Status" value={project.status} delta={project.health} tone="amber" />
        <KpiCard label="API" value="Ready" delta="/api/projects-engineering/cost-control/commitments" tone="purple" />
      </div>
      <EmptyCostRegister title="Commitment Register" subtitle={`No commitments for ${project.code} yet`} />
      <Card title="Budget Check Workflow">
        <div className="workflow-strip">
          <span>Requirement Raised</span>
          <i>→</i>
          <span>Project/WBS Selected</span>
          <i>→</i>
          <span>CBS/Cost Code</span>
          <i>→</i>
          <span className="active">Cost Control Validation</span>
          <i>→</i>
          <span>Approval Matrix</span>
          <i>→</i>
          <span>PO / Commitment</span>
        </div>
      </Card>
    </>
  );
}
export function Actuals({ project }: ProjectProps) {
  const snap = deriveProjectCostSnapshot(project);
  return (
    <>
      <div className="kpi-grid four">
        <KpiCard label="Actual Cost" value={money(snap.actual, project.currency)} delta="From progress × BAC proxy" />
        <KpiCard label="CPI" value={snap.cpi.toFixed(2)} delta="Live profile" tone="indigo" />
        <KpiCard label="EAC" value={money(snap.eac, project.currency)} delta="Forecast final" tone="amber" />
        <KpiCard label="VAC" value={money(snap.vac, project.currency)} delta="vs BAC" tone="rose" />
      </div>
      <EmptyCostRegister title="Actual Cost Ledger" subtitle={`Awaiting Sage X3 / Finance sync for ${project.code}`} />
    </>
  );
}
export function LabourTimesheets({ project }: ProjectProps) {
  return (
    <>
      <ManHourUtilizationPanel project={project} mode="labour" />
      <div className="grid two">
        <Card title="Validation Rules">
          <div className="policy-list">
            <div>
              <b>Project authorization</b>
              <p>Employee must be assigned to the project or authorized work package.</p>
            </div>
            <div>
              <b>WBS/CBS compatibility</b>
              <p>Selected WBS must map to the chosen financial cost code.</p>
            </div>
            <div>
              <b>Budget availability</b>
              <p>Labour control account must have sufficient forecast / man-hour capacity.</p>
            </div>
            <div>
              <b>Approval chain</b>
              <p>Supervisor → Project Manager → Cost Control → GM Ops → HR / Payroll.</p>
            </div>
          </div>
        </Card>
        <Card title="Workflow">
          <div className="workflow-column">
            <span>Supervisor enters timesheet</span>
            <i>↓</i>
            <span>Project Manager verifies work performed</span>
            <i>↓</i>
            <span className="active">Cost Controller validates project/cost allocation</span>
            <i>↓</i>
            <span>HR validates employee/payroll rules</span>
            <i>↓</i>
            <span>Payroll processing / labour actual</span>
          </div>
        </Card>
      </div>
    </>
  );
}
export function Forecast({ project }: ProjectProps) {
  const snap = deriveProjectCostSnapshot(project);
  return (
    <>
      <div className="kpi-grid five">
        <KpiCard label="BAC" value={money(snap.bac, project.currency)} delta="Approved baseline proxy" />
        <KpiCard label="Actual" value={money(snap.actual, project.currency)} delta="To date" tone="cyan" />
        <KpiCard label="ETC (cost)" value={money(snap.etc, project.currency)} delta="Money remaining proxy" tone="purple" />
        <KpiCard label="EAC" value={money(snap.eac, project.currency)} delta="Forecast final cost" tone="amber" />
        <KpiCard label="VAC" value={money(snap.vac, project.currency)} delta={snap.bac ? `${(((snap.eac / snap.bac) - 1) * 100).toFixed(1)}% vs BAC` : '—'} tone="rose" />
      </div>
      <ManHourUtilizationPanel project={project} mode="forecast" canEditBudget />
      <Card title="Forecast Governance">
        <div className="workflow-strip">
          <span>Period Open</span>
          <i>→</i>
          <span>Owners Update ETC</span>
          <i>→</i>
          <span className="active">Cost Control Challenge / Consolidate</span>
          <i>→</i>
          <span>PM Review</span>
          <i>→</i>
          <span>CFO Approval</span>
          <i>→</i>
          <span>Forecast Locked</span>
        </div>
      </Card>
    </>
  );
}
export function EarnedValue({ project }: ProjectProps) {
  const snap = deriveProjectCostSnapshot(project);
  const cv = snap.ev - snap.actual;
  const sv = snap.ev - snap.pv;
  return (
    <>
      <div className="kpi-grid six">
        <KpiCard label="PV" value={money(snap.pv, project.currency)} delta="Planned value" />
        <KpiCard label="EV" value={money(snap.ev, project.currency)} delta="Earned value" tone="indigo" />
        <KpiCard label="AC" value={money(snap.actual, project.currency)} delta="Actual cost proxy" tone="cyan" />
        <KpiCard label="CPI" value={snap.cpi.toFixed(2)} delta="Cost efficiency" tone="amber" />
        <KpiCard label="SPI" value={snap.spi.toFixed(2)} delta="Schedule efficiency" tone="rose" />
        <KpiCard label="VAC" value={money(snap.vac, project.currency)} delta="vs BAC" tone="purple" />
      </div>
      <div className="grid two">
        <Card title="EVM Interpretation">
          <div className="evm-grid">
            <div>
              <span>CV = EV − AC</span>
              <b>{money(cv, project.currency)}</b>
              <small>{cv < 0 ? 'Cost overrun' : 'Cost underrun'}</small>
            </div>
            <div>
              <span>SV = EV − PV</span>
              <b>{money(sv, project.currency)}</b>
              <small>{sv < 0 ? 'Behind plan' : 'Ahead of plan'}</small>
            </div>
            <div>
              <span>CPI = EV / AC</span>
              <b>{snap.cpi.toFixed(2)}</b>
              <small>Cost efficiency</small>
            </div>
            <div>
              <span>SPI = EV / PV</span>
              <b>{snap.spi.toFixed(2)}</b>
              <small>Schedule efficiency</small>
            </div>
          </div>
        </Card>
        <EmptyCostRegister title="EVM by Discipline" subtitle={`Discipline EV rows not yet stored for ${project.code}`} />
      </div>
    </>
  );
}
export function Variations({ project }: ProjectProps) {
  return <EmptyCostRegister title="Cost Impact Assessment Register" subtitle={`No variations for ${project.code} yet`} />;
}
export function CashFlow({ project }: ProjectProps) {
  return <EmptyCostRegister title="Monthly Project Cash Flow" subtitle={`No cash-flow periods for ${project.code} yet`} />;
}
export function PeriodClose({ project }: ProjectProps) {
  return (
    <div className="grid two">
      <Card title="Cost Period Close Checklist" subtitle={project.code}>
        <div className="control-check">
          <label>
            <input type="checkbox" readOnly /> Lock prior timesheet period
          </label>
          <label>
            <input type="checkbox" readOnly /> Reconcile Sage X3 actuals
          </label>
          <label>
            <input type="checkbox" readOnly /> Import approved payroll labour costs
          </label>
          <label>
            <input type="checkbox" readOnly /> Resolve cost-code exceptions
          </label>
          <label>
            <input type="checkbox" readOnly /> Update ETC by control account
          </label>
          <label>
            <input type="checkbox" readOnly /> Calculate EVM metrics
          </label>
          <label>
            <input type="checkbox" readOnly /> PM review and challenge
          </label>
          <label>
            <input type="checkbox" readOnly /> CFO approval and lock period
          </label>
        </div>
      </Card>
      <EmptyCostRegister title="Close Exceptions" subtitle={`No open period exceptions for ${project.code}`} />
    </div>
  );
}
export function CostReports({ project }: ProjectProps) {
  return (
    <div className="report-grid">
      {[
        ['Monthly Cost Report', 'BAC, commitments, actuals, ETC, EAC, VAC, CPI/SPI'],
        ['Budget vs Actual', 'Control-account and cost-code variance'],
        ['Commitment Report', 'PR, PO, subcontract position'],
        ['Labour Cost Report', 'Approved hours, overtime and exceptions'],
        ['EVM Report', 'PV, EV, AC, CPI, SPI, CV, SV'],
        ['Forecast & EAC Report', 'Bottom-up ETC and EAC movement'],
      ].map((r) => (
        <Card key={r[0]}>
          <div className="report-card">
            <div className="report-icon">▥</div>
            <h3>{r[0]}</h3>
            <p>
              {r[1]} for {project.code}.
            </p>
            <div>
              <span>On demand</span>
              <small>Cost Control · PM · Finance</small>
            </div>
            <Button variant="secondary" href={`/projects-engineering/projects/${project.id}/cost-control/overview`}>
              Open cost overview
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

export const costSectionMap: Record<string, React.ComponentType<ProjectProps>> = {
  overview: CostOverview,
  'budget-baseline': BudgetBaseline,
  cbs: CBS,
  commitments: Commitments,
  actuals: Actuals,
  'labour-timesheets': LabourTimesheets,
  forecast: Forecast,
  'earned-value': EarnedValue,
  variations: Variations,
  'cash-flow': CashFlow,
  'period-close': PeriodClose,
  reports: CostReports,
};
