import { Card, KpiCard, DataTable, Status, MiniBar, Progress, Button } from '@/components/projects-engineering/UI';
import { ActiveProjectOverviewFigma } from '@/components/projects-engineering/ActiveProjectOverviewFigma';
import { ManHourUtilizationPanel } from '@/components/projects-engineering/ManHourUtilizationPanel';
import { money, dmy } from '@/lib/projects-engineering/format';
import type { Project } from '@/lib/projects-engineering/types';

type ProjectProps = { project: Project };

const EmptyRegister = ({ title, subtitle }: { title: string; subtitle: string }) => (
  <Card title={title} subtitle={subtitle}>
    <p style={{ margin: 0, color: '#6f7f95', fontSize: 12, lineHeight: 1.5 }}>
      No register records are stored for this project yet. Update the project master data from Projects → Edit, then capture operational registers as they are implemented against DLE_Enterprise.
    </p>
  </Card>
);

export function Overview({ project }: ProjectProps) {
  return <ActiveProjectOverviewFigma project={project} />;
}

export function Planning({ project }: ProjectProps) {
  return (
    <>
      <div className="kpi-grid four">
        <KpiCard label="SPI" value={Number(project.schedulePerformance || 0).toFixed(2)} delta="Live profile" tone="amber" />
        <KpiCard label="Planned" value={`${Number(project.planned || 0).toFixed(1)}%`} delta="Baseline progress" />
        <KpiCard label="Actual" value={`${Number(project.actual || 0).toFixed(1)}%`} delta="Measured progress" />
        <KpiCard label="Finish" value={dmy(project.finish)} delta={`Start ${dmy(project.start)}`} tone="purple" />
      </div>
      <EmptyRegister title="Integrated Master Schedule" subtitle={`No WBS/activities loaded for ${project.code} yet`} />
    </>
  );
}

export function Engineering({ project }: ProjectProps) {
  return <EmptyRegister title="Engineering Deliverables" subtitle={`No MDR records for ${project.code} yet`} />;
}
export function Deliverables({ project }: ProjectProps) {
  return <EmptyRegister title="Master Deliverables Register" subtitle={`No deliverables for ${project.code} yet`} />;
}
export function Documents({ project }: ProjectProps) {
  return <EmptyRegister title="Controlled Documents" subtitle={`No EDMS links for ${project.code} yet`} />;
}
export function Procurement({ project }: ProjectProps) {
  return <EmptyRegister title="Procurement Packages" subtitle={`No packages for ${project.code} yet`} />;
}
export function Cost({ project }: ProjectProps) {
  const snapNote = `${Number(project.costPerformance || 0).toFixed(2)} CPI · ${project.status}`;
  return (
    <>
      <div className="kpi-grid four">
        <KpiCard label="Contract Value" value={money(project.contractValue, project.currency)} delta="Approved contract" href={`/projects-engineering/projects/${project.id}/cost-control/overview`} />
        <KpiCard label="CPI" value={Number(project.costPerformance || 0).toFixed(2)} delta="Cost performance" tone="indigo" href={`/projects-engineering/projects/${project.id}/cost-control/earned-value`} />
        <KpiCard label="Actual Progress" value={`${Number(project.actual || 0).toFixed(1)}%`} delta="Earned proxy" href={`/projects-engineering/projects/${project.id}/cost-control/forecast`} />
        <KpiCard label="Status" value={project.status} delta={snapNote} tone="amber" href={`/projects-engineering/projects/${project.id}/cost-control/overview`} />
      </div>
      <Card title="Cost Control Unit" subtitle="Full budget, commitments, actuals, forecast and EVM workspaces">
        <p style={{ margin: '0 0 12px', color: '#6f7f95', fontSize: 12, lineHeight: 1.5 }}>
          Open the dedicated Cost Control workspace for {project.code}. Portfolio workbench is also available from the rail.
        </p>
        <div className="page-actions">
          <Button href={`/projects-engineering/projects/${project.id}/cost-control/overview`}>Open Project Cost Control</Button>
          <Button variant="secondary" href="/projects-engineering/cost-control">
            Portfolio Cost Workbench
          </Button>
        </div>
      </Card>
    </>
  );
}
export function Resources({ project }: ProjectProps) {
  return (
    <>
      <div className="kpi-grid four">
        <KpiCard label="Project" value={project.code} delta={project.name} href={`/projects-engineering/projects/${project.id}/overview`} />
        <KpiCard label="Manager" value={project.manager} delta={project.managerEmployeeCode || 'Assign PM'} tone="indigo" />
        <KpiCard label="Status" value={project.status} delta={project.phase} tone="cyan" />
        <KpiCard
          label="Labour Workspace"
          value="Live"
          delta="Timesheet MH utilization"
          tone="purple"
          href={`/projects-engineering/projects/${project.id}/cost-control/labour-timesheets`}
        />
      </div>
      <ManHourUtilizationPanel project={project} mode="resources" canEditBudget />
    </>
  );
}
export function Construction({ project }: ProjectProps) {
  return <EmptyRegister title="Construction Work Packages" subtitle={`No CWPs for ${project.code} yet`} />;
}
export function Quality({ project }: ProjectProps) {
  return <EmptyRegister title="Quality / NCR Register" subtitle={`No NCRs for ${project.code} yet`} />;
}
export function HSE({ project }: ProjectProps) {
  return <EmptyRegister title="HSE Events" subtitle={`No HSE events for ${project.code} yet`} />;
}
export function Risks({ project }: ProjectProps) {
  return <EmptyRegister title="Risk Register" subtitle={`No risks logged for ${project.code} yet`} />;
}
export function Changes({ project }: ProjectProps) {
  return <EmptyRegister title="Change Register" subtitle={`No changes for ${project.code} yet`} />;
}
export function Actions({ project }: ProjectProps) {
  return <EmptyRegister title="Action Register" subtitle={`No actions for ${project.code} yet`} />;
}
export function Interface({ project }: ProjectProps) {
  return <EmptyRegister title="Client Interface" subtitle={`No correspondence for ${project.code} yet`} />;
}
export function ProgressPage({ project }: ProjectProps) {
  return (
    <>
      <div className="kpi-grid five">
        <KpiCard label="Overall Progress" value={`${Number(project.actual || 0).toFixed(1)}%`} delta={`${Number(project.planned || 0).toFixed(1)}% planned`} />
        <KpiCard label="SPI" value={Number(project.schedulePerformance || 0).toFixed(2)} delta="Schedule performance" tone="amber" />
        <KpiCard label="CPI" value={Number(project.costPerformance || 0).toFixed(2)} delta="Cost performance" tone="indigo" />
        <KpiCard label="Health" value={project.health} delta={project.status} tone={project.health === 'Critical' ? 'rose' : 'blue'} />
        <KpiCard label="Finish" value={dmy(project.finish)} delta={`Start ${dmy(project.start)}`} />
      </div>
      <Card title="Progress Profile">
        <Progress value={Number(project.actual || 0)} />
        <div style={{ marginTop: 12 }}>
          <MiniBar label="Planned" value={Number(project.planned || 0)} />
          <MiniBar label="Actual" value={Number(project.actual || 0)} />
        </div>
      </Card>
    </>
  );
}
export function Reports({ project }: ProjectProps) {
  return <EmptyRegister title="Project Reports" subtitle={`Generate reports once operational registers are populated for ${project.code}`} />;
}
export function AI({ project }: ProjectProps) {
  return (
    <Card title="Project Intelligence" subtitle={project.code}>
      <p style={{ margin: 0, color: '#6f7f95', fontSize: 12, lineHeight: 1.5 }}>
        AI insights will use live DLE_Enterprise project data for <b>{project.name}</b>. No mock assessments are shown.
      </p>
    </Card>
  );
}
export function Closeout({ project }: ProjectProps) {
  return (
    <Card title="Closeout" subtitle={project.code}>
      <p style={{ margin: 0, color: '#6f7f95', fontSize: 12, lineHeight: 1.5 }}>
        Closeout checklist will activate when {project.name} moves to Completed / Closed status.
      </p>
      <div style={{ marginTop: 12 }}>
        <Status>{project.status}</Status>
      </div>
    </Card>
  );
}
