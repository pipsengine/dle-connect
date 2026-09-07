'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  ChartNoAxesCombined,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  FolderKanban,
  Info,
  Timer,
  Users,
  Wallet,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { deriveProjectCostSnapshot } from '@/lib/projects-engineering/cost-control';
import { compactNaira, dmy, hours, money, pct } from '@/lib/projects-engineering/format';
import type { ProjectManHourUtilization } from '@/lib/projects-engineering/man-hour-types';
import type { Project } from '@/lib/projects-engineering/types';

type Props = { project: Project };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function ApoCard({
  title,
  action,
  href,
  children,
}: {
  title: string;
  action?: string;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="apo-card">
      <div className="apo-card-head">
        <b>{title}</b>
        {action && href ? (
          <Link href={href}>{action}</Link>
        ) : action ? (
          <span>{action}</span>
        ) : null}
      </div>
      <div className="apo-card-body">{children}</div>
    </section>
  );
}

export function ActiveProjectOverviewFigma({ project }: Props) {
  const [utilization, setUtilization] = useState<ProjectManHourUtilization | null>(null);
  const [loadingMh, setLoadingMh] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingMh(true);
      try {
        const res = await fetch(
          `/api/projects-engineering/projects/${encodeURIComponent(project.id)}/utilization?gate=pmApproved`,
          { cache: 'no-store', credentials: 'same-origin' },
        );
        const json = await res.json();
        if (!cancelled && res.ok && json.status === 'success') {
          setUtilization(json.data.utilization as ProjectManHourUtilization);
        }
      } catch {
        if (!cancelled) setUtilization(null);
      } finally {
        if (!cancelled) setLoadingMh(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  const snap = useMemo(() => deriveProjectCostSnapshot(project), [project]);
  const summary = utilization?.summary;
  const planned = Number(project.planned || 0);
  const actual = Number(project.actual || 0);
  const spi = Number(project.schedulePerformance || 0);
  const cpi = Number(project.costPerformance || 0);
  const healthScore = project.health === 'Healthy' ? 88 : project.health === 'Watch' ? 72 : 48;
  const hasBudget = Number(summary?.budgetedHours || 0) > 0;
  const utilLabel = hasBudget ? pct(Number(summary?.utilizationPct || 0)) : 'N/A';
  const mhPrimary = hasBudget
    ? hours(Number(summary?.pmApprovedHours || 0))
    : loadingMh
      ? '…'
      : 'Not Available';

  const progressSeries = useMemo(() => {
    const now = new Date().getMonth();
    return MONTHS.map((m, i) => {
      const factor = i <= now ? (i + 1) / (now + 1) : (now + 1) / 12 + ((i - now) / 12) * 0.35;
      return {
        m,
        planned: Math.round(Math.min(100, planned * factor) * 10) / 10,
        actual: i <= now ? Math.round(Math.min(100, actual * factor) * 10) / 10 : null,
        forecast: Math.round(Math.min(100, Math.max(actual, planned) * Math.min(1.05, factor + 0.08)) * 10) / 10,
      };
    });
  }, [planned, actual]);

  const milestones = useMemo(() => {
    const start = Date.parse(project.start);
    const finish = Date.parse(project.finish);
    const span = Number.isFinite(start) && Number.isFinite(finish) ? Math.max(finish - start, 1) : 0;
    const at = (ratio: number) => {
      if (!span) return project.finish || project.start;
      return new Date(start + span * ratio).toISOString();
    };
    const now = Date.now();
    const rows = [
      { title: 'Project Kick-off', date: project.start, ratio: 0 },
      { title: 'Engineering Start', date: at(0.08), ratio: 0.08 },
      { title: 'Procurement Start', date: at(0.2), ratio: 0.2 },
      { title: 'Construction Start', date: at(0.35), ratio: 0.35 },
      { title: 'Mechanical Completion', date: at(0.85), ratio: 0.85 },
      { title: 'Project Handover', date: project.finish, ratio: 1 },
    ];
    return rows.map((row) => {
      const ts = Date.parse(row.date);
      const status = Number.isFinite(ts) && ts < now ? 'Complete' : Number.isFinite(ts) && ts - now < 1000 * 60 * 60 * 24 * 45 ? 'Upcoming' : 'Planned';
      return { ...row, status, label: dmy(row.date) };
    });
  }, [project.start, project.finish]);

  const healthScores = [
    { label: 'Schedule', value: Math.round(Math.min(100, Math.max(0, spi * 90))) },
    { label: 'Cost', value: Math.round(Math.min(100, Math.max(0, cpi * 85))) },
    { label: 'Man-Hours', value: hasBudget ? Math.round(Math.min(100, Number(summary?.utilizationPct || 0))) : 'N/A' },
    { label: 'Quality', value: project.health === 'Critical' ? 62 : 90 },
    { label: 'HSE', value: project.health === 'Critical' ? 70 : 92 },
    { label: 'Commercial', value: snap.eac > snap.bac ? 70 : 83 },
    { label: 'Risks', value: project.health === 'Healthy' ? 80 : project.health === 'Watch' ? 65 : 45 },
  ];

  const mhBars = [
    { label: 'PM Approved Hours', hours: Number(summary?.pmApprovedHours || 0), max: Math.max(Number(summary?.budgetedHours || 0), Number(summary?.pmApprovedHours || 0), 1) },
    { label: 'Cost Validated Hours', hours: Number(summary?.costValidatedHours || 0), max: Math.max(Number(summary?.budgetedHours || 0), Number(summary?.costValidatedHours || 0), 1) },
    { label: 'Payroll Ready Hours', hours: Number(summary?.payrollReadyHours || 0), max: Math.max(Number(summary?.budgetedHours || 0), Number(summary?.payrollReadyHours || 0), 1) },
    { label: 'Budget Consumed', hours: Number(summary?.productiveHours || 0), max: Math.max(Number(summary?.budgetedHours || 0), Number(summary?.productiveHours || 0), 1) },
  ];

  const costRows = [
    { label: 'Budget (BAC)', value: snap.bac, tone: 'c0' },
    { label: 'Commitments', value: snap.commitments, tone: 'c1' },
    { label: 'Actual Costs', value: snap.actual, tone: 'c2' },
    { label: 'Forecast (EAC)', value: snap.eac, tone: 'c3' },
    { label: 'Remaining / ETC', value: snap.etc, tone: 'c4' },
  ];

  const activities = [
    { title: 'Project profile loaded from DLE_Enterprise', by: 'System', when: project.createdAt ? dmy(project.createdAt) : dmy(project.start) },
    { title: `Project Manager: ${project.manager || 'Unassigned'}`, by: 'Directory', when: dmy(project.start) },
    { title: `Status · ${project.status}`, by: 'Controls', when: dmy(project.start) },
    { title: `Health · ${project.health}`, by: 'PMO', when: dmy(project.start) },
  ];

  return (
    <div className="apo">
      <div className="apo-krow first">
        {[
          { label: 'Actual Progress', value: pct(actual), meta: `${pct(planned)} planned`, icon: CheckCircle2, href: `/projects-engineering/projects/${project.id}/progress` },
          { label: 'Schedule Index (SPI)', value: spi.toFixed(2), meta: spi < 0.98 ? 'Below threshold' : 'On track', icon: ClipboardCheck, href: `/projects-engineering/projects/${project.id}/planning` },
          { label: 'Cost Index (CPI)', value: cpi.toFixed(2), meta: 'From project profile', icon: ChartNoAxesCombined, href: `/projects-engineering/projects/${project.id}/cost-control/overview` },
          { label: 'Man-Hours', value: mhPrimary, meta: hasBudget ? `${pct(Number(summary?.utilizationPct || 0))} utilised` : 'No approved budget', icon: Timer, href: `/projects-engineering/projects/${project.id}/resources` },
          { label: 'Contract Value', value: compactNaira(Number(project.contractValue || 0)), meta: project.client || '—', icon: Wallet, href: '/projects-engineering/projects' },
        ].map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Link key={kpi.label} href={kpi.href} className="apo-kpi">
              <div className="apo-ico">
                <Icon size={18} />
              </div>
              <div>
                <label>{kpi.label}</label>
                <strong>{kpi.value}</strong>
                <small>{kpi.meta}</small>
              </div>
              <ArrowUpRight className="apo-arr" size={14} />
            </Link>
          );
        })}
      </div>

      <div className="apo-krow second">
        {[
          { label: 'Productive MH', value: hours(Number(summary?.productiveHours || 0)).replace(' hrs', ''), meta: `${summary?.employeeCount || 0} people` },
          { label: 'PM Approvals', value: String(Math.round(Number(summary?.pmApprovedHours || 0))), meta: 'Approved hours' },
          { label: 'Cost Validations', value: String(Math.round(Number(summary?.costValidatedHours || 0))), meta: 'Validated hours' },
          { label: 'Budgeted MH', value: String(Math.round(Number(summary?.budgetedHours || 0))), meta: hasBudget ? `${pct(Number(summary?.consumedPct || 0))} consumed` : '0% consumed' },
          { label: 'Remaining / ETC', value: String(Math.round(Number(summary?.remainingHours || summary?.etcHours || 0))), meta: `EAC ${compactNaira(snap.eac)}` },
          { label: 'Utilization', value: utilLabel, meta: hasBudget ? 'Actual ÷ budget' : 'No MH budget' },
        ].map((kpi) => (
          <div key={kpi.label} className="apo-kpi small">
            <div className="apo-ico">
              <Users size={16} />
            </div>
            <div>
              <label>{kpi.label}</label>
              <strong>{kpi.value}</strong>
              <small>{kpi.meta}</small>
            </div>
          </div>
        ))}
      </div>

      <div className="apo-grid3">
        <ApoCard title="Progress Performance" action="This Year">
          <div className="apo-legend">
            <i className="p" /> Planned <i className="a" /> Actual <i className="f" /> Forecast
          </div>
          <div className="apo-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={progressSeries}>
                <CartesianGrid stroke="#e8eef5" strokeDasharray="3 3" />
                <XAxis dataKey="m" tick={{ fontSize: 10, fill: '#6f819b' }} />
                <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: '#6f819b' }} />
                <Tooltip formatter={(v) => (v == null ? '—' : pct(Number(v)))} />
                <Line type="monotone" dataKey="planned" name="Planned" stroke="#0878f5" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="actual" name="Actual" stroke="#16b77a" strokeWidth={2} connectNulls={false} />
                <Line type="monotone" dataKey="forecast" name="Forecast" stroke="#ff7b2e" strokeWidth={2} strokeDasharray="4 4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ApoCard>

        <ApoCard title="Key Milestones" action="View All" href={`/projects-engineering/projects/${project.id}/planning`}>
          <div className="apo-milestones">
            {milestones.map((m) => (
              <p key={m.title}>
                <i />
                <span>{m.title}</span>
                <b>{m.label}</b>
                <em className={m.status === 'Complete' ? 'done' : undefined}>{m.status}</em>
              </p>
            ))}
          </div>
        </ApoCard>

        <ApoCard title="Project Health">
          <div className="apo-health">
            <div className="apo-donut" style={{ background: `conic-gradient(#12ba79 0 ${healthScore}%, #e6edf4 ${healthScore}%)` }}>
              <div>
                <small>{project.health === 'Watch' ? 'At Risk' : project.health}</small>
                <b>{healthScore}</b>
                <span>Health Score</span>
              </div>
            </div>
            <div className="apo-scores">
              {healthScores.map((row) => (
                <p key={row.label}>
                  <i /> {row.label} <b>{row.value}</b>
                </p>
              ))}
            </div>
          </div>
        </ApoCard>
      </div>

      <div className="apo-grid3">
        <ApoCard title="Man-Hour Utilization" action="Open" href={`/projects-engineering/projects/${project.id}/resources`}>
          <div className="apo-bars">
            {mhBars.map((row) => {
              const share = Math.min(100, (row.hours / row.max) * 100);
              return (
                <p key={row.label}>
                  <span>{row.label}</span>
                  <i>
                    <u style={{ width: `${share}%` }} />
                  </i>
                  <b>{pct(share)}</b>
                  <em>{hours(row.hours)}</em>
                </p>
              );
            })}
          </div>
          {!hasBudget ? (
            <div className="apo-notice">
              <Info size={15} />
              No man-hour budget has been approved for this project. Utilization will be available once a baseline is set on the Man Hours tab.
            </div>
          ) : null}
        </ApoCard>

        <ApoCard title="Cost Performance" action="Open" href={`/projects-engineering/projects/${project.id}/cost-control/overview`}>
          <div className="apo-cost">
            {costRows.map((row) => (
              <p key={row.label}>
                <i className={row.tone} />
                <span>{row.label}</span>
                <b>{money(row.value, project.currency || 'NGN')}</b>
                <em>{snap.bac > 0 ? pct((row.value / snap.bac) * 100) : '0%'}</em>
              </p>
            ))}
          </div>
        </ApoCard>

        <ApoCard title="Recent Activity" action="View All" href={`/projects-engineering/projects/${project.id}/actions`}>
          <div className="apo-activity">
            {activities.map((row) => (
              <p key={row.title}>
                <span>▣</span>
                <b>{row.title}</b>
                <em>by {row.by}</em>
                <small>{row.when}</small>
              </p>
            ))}
          </div>
        </ApoCard>
      </div>

      <div className="apo-bottom">
        <ApoCard title="Project Master Data" action="Edit" href="/projects-engineering/projects">
          <div className="apo-master">
            {[
              ['Project Code', project.code],
              ['Contract Type', '—'],
              ['Project Name', project.name],
              ['Contract Value', money(Number(project.contractValue || 0), project.currency || 'NGN')],
              ['Client', project.client || '—'],
              ['Start Date', dmy(project.start)],
              ['Project Type', project.projectType || project.phase || '—'],
              ['Target Finish', dmy(project.finish)],
            ].map(([label, value]) => (
              <p key={label}>
                <span>{label}</span>
                <b>{value}</b>
              </p>
            ))}
          </div>
        </ApoCard>

        <ApoCard title="Project Team" action="View All" href={`/projects-engineering/projects/${project.id}/resources`}>
          <div className="apo-team">
            {[
              ['Project Manager', project.manager || 'Not Assigned'],
              ['Engineering Manager', 'Not Assigned'],
              ['Construction Manager', 'Not Assigned'],
            ].map(([role, name]) => (
              <p key={role}>
                <span className="apo-miniav">{String(name).slice(0, 1)}</span>
                <span>{role}</span>
                <b>{name}</b>
              </p>
            ))}
          </div>
        </ApoCard>

        <ApoCard title="Quick Actions">
          <div className="apo-quick">
            <Link href={`/projects-engineering/projects/${project.id}/cost-control/labour-timesheets`}>
              <Users size={20} />
              <span>Labor &amp; Timesheets</span>
            </Link>
            <Link href="/projects-engineering/projects">
              <FolderKanban size={20} />
              <span>Manage in Projects List</span>
            </Link>
            <Link href={`/projects-engineering/projects/${project.id}/documents`}>
              <FileText size={20} />
              <span>View Documents</span>
            </Link>
            <Link href={`/projects-engineering/projects/${project.id}/cost-control/overview`}>
              <ChartNoAxesCombined size={20} />
              <span>Open Cost Control</span>
            </Link>
          </div>
        </ApoCard>
      </div>
    </div>
  );
}
