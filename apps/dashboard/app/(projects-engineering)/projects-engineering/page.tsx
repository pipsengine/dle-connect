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
import { projects, portfolioKpis, milestones, risks } from '@/lib/projects-engineering/data';
import { money } from '@/lib/projects-engineering/format';

export default function PortfolioDashboardPage() {
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
    `${p.schedulePerformance.toFixed(2)}`,
    `${p.costPerformance.toFixed(2)}`,
    <Status key={`${p.id}-s`}>{p.health}</Status>,
  ]);

  return (
    <>
      <PageHeading
        title="Project Management & Engineering"
        description="Enterprise portfolio command centre for DLE engineering, procurement, fabrication and project execution."
        actions={
          <>
            <Button variant="secondary">Export Portfolio</Button>
            <Button href="/projects-engineering/projects/new">＋ New Project</Button>
          </>
        }
      />
      <div className="kpi-grid six">
        {portfolioKpis.map((k, i) => (
          <KpiCard
            key={k.label}
            {...k}
            icon={['projects', 'cost', 'progress', 'risk', 'engineering', 'quality'][i]}
          />
        ))}
      </div>
      <div className="grid two-one">
        <Card
          title="Portfolio Performance"
          subtitle="Planned vs actual progress and earned-value health"
          action={
            <select className="select">
              <option>All active projects</option>
            </select>
          }
        >
          <div className="performance-chart">
            <div className="chart-value">
              <span>Portfolio progress</span>
              <strong>46.8%</strong>
              <small>2.4% behind baseline</small>
            </div>
            <Sparkline points={[18, 22, 27, 29, 34, 36, 39, 41, 44, 45, 47]} />
            <div className="bar-group">
              <MiniBar label="Engineering" value={71} />
              <MiniBar label="Procurement" value={54} />
              <MiniBar label="Fabrication" value={42} />
              <MiniBar label="Construction" value={24} />
            </div>
          </div>
        </Card>
        <Card title="Executive Attention" subtitle="Items requiring management intervention">
          <div className="attention-list">
            <div className="attention critical">
              <span>01</span>
              <div>
                <b>Structural steel delivery slippage</b>
                <small>HDJK-001 · 12-day forecast delay</small>
              </div>
            </div>
            <div className="attention warning">
              <span>02</span>
              <div>
                <b>IFC engineering backlog</b>
                <small>PIPE-014 · 17 overdue deliverables</small>
              </div>
            </div>
            <div className="attention info">
              <span>03</span>
              <div>
                <b>Cost forecast approval</b>
                <small>3 projects pending CFO review</small>
              </div>
            </div>
          </div>
        </Card>
      </div>
      <Card
        title="Active Project Portfolio"
        subtitle="Real-time project health, schedule and commercial position"
        action={<Toolbar placeholder="Search projects, clients, managers..." />}
      >
        <DataTable
          headers={['Project', 'Client', 'Project Manager', 'Contract Value', 'Progress', 'SPI', 'CPI', 'Health']}
          rows={rows}
        />
      </Card>
      <div className="grid two">
        <Card title="Upcoming Critical Milestones" subtitle="Next 45 days">
          <DataTable
            headers={['Milestone', 'Description', 'Discipline', 'Due', 'Progress', 'Status']}
            rows={milestones.map((r) => r.map((x, i) => (i === 5 ? <Status key={String(x)}>{x}</Status> : x)))}
          />
        </Card>
        <Card title="Portfolio Risk Radar" subtitle="Top enterprise project risks">
          <div className="risk-list">
            {risks.map((r) => (
              <div className="risk-row" key={r[0]}>
                <div className="risk-score">{r[5] === 'Critical' ? '16' : r[5] === 'High' ? '12' : '8'}</div>
                <div>
                  <b>{r[1]}</b>
                  <small>
                    {r[0]} · {r[2]} · Owner: {r[6]}
                  </small>
                </div>
                <Status>{r[5]}</Status>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <div className="audit-strip">
        ⓘ Portfolio refreshed · Data classification: DLE Internal · Permission: view_projects_engineering · Connectors: P6 / EDMS / Sage X3
      </div>
    </>
  );
}
