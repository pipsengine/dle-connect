import { PageHeading, Card, KpiCard, DataTable, Status, Toolbar, MiniBar } from '@/components/projects-engineering/UI';

export default function PortfolioPlanningPage() {
  return (
    <>
      <PageHeading
        title="Planning & Portfolio Controls"
        description="Integrated portfolio planning, schedule performance, resource demand and milestone governance. Schedule truth can be imported from Primavera P6 / MS Project."
      />
      <div className="kpi-grid four">
        <KpiCard label="Baseline Activities" value="8,426" delta="Across 12 active projects" />
        <KpiCard label="Critical Activities" value="314" delta="38 newly critical" tone="amber" />
        <KpiCard label="Average SPI" value="0.94" delta="Target ≥ 0.98" tone="indigo" />
        <KpiCard label="Milestones at Risk" value="18" delta="6 within 30 days" tone="rose" />
      </div>
      <div className="grid two">
        <Card title="Portfolio Schedule Health" subtitle="Discipline-weighted progress">
          <MiniBar label="Engineering" value={71} />
          <MiniBar label="Procurement" value={54} />
          <MiniBar label="Fabrication" value={42} />
          <MiniBar label="Construction" value={24} />
          <MiniBar label="Commissioning" value={8} />
        </Card>
        <Card title="Resource Demand – Next 12 Weeks" subtitle="Planned capacity vs approved availability">
          <div className="metric-stack">
            <div>
              <span>Engineering</span>
              <b>118 / 126 FTE</b>
              <Status>Watch</Status>
            </div>
            <div>
              <span>Fabrication</span>
              <b>246 / 280 FTE</b>
              <Status>Healthy</Status>
            </div>
            <div>
              <span>Construction</span>
              <b>196 / 174 FTE</b>
              <Status>Critical</Status>
            </div>
            <div>
              <span>Project Controls</span>
              <b>28 / 31 FTE</b>
              <Status>Healthy</Status>
            </div>
          </div>
        </Card>
      </div>
      <Card title="Portfolio Milestone Register" action={<Toolbar />}>
        <DataTable
          headers={['Project', 'Milestone', 'Baseline', 'Forecast', 'Variance', 'Owner', 'Status']}
          rows={[
            ['HDJK-001', 'Structural steel available', '15 Sep 2026', '27 Sep 2026', '+12d', 'Procurement Lead', <Status key="c">Critical</Status>],
            ['PIPE-014', 'IFC package 70%', '11 Sep 2026', '18 Sep 2026', '+7d', 'Engineering Manager', <Status key="w">Watch</Status>],
            ['DLE-ENG-026', 'Fabrication 65%', '14 Sep 2026', '12 Sep 2026', '-2d', 'Yard Manager', <Status key="h">Healthy</Status>],
            ['TERM-011', 'Mechanical Completion', '28 Sep 2026', '29 Sep 2026', '+1d', 'Construction Manager', <Status key="h2">Healthy</Status>],
          ]}
        />
      </Card>
    </>
  );
}
