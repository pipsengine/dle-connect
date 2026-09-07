'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Calculator,
  Coins,
  Download,
  Gauge,
  Layers3,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { deriveProjectCostSnapshot } from '@/lib/projects-engineering/cost-control';
import { money } from '@/lib/projects-engineering/format';
import type { ProjectManHourUtilization } from '@/lib/projects-engineering/man-hour-types';
import type { Project } from '@/lib/projects-engineering/types';

type Props = { project: Project };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const BAR_COLORS = ['#3b8ef3', '#31c57a', '#f0a13b', '#ef6262', '#7b61d9', '#24b5b9', '#78a4c7'];
const KPI_TONES = {
  blue: { bg: '#eaf4ff', fg: '#1375e8' },
  purple: { bg: '#f0ecff', fg: '#7866db' },
  green: { bg: '#e7f8ef', fg: '#11a260' },
  orange: { bg: '#fff0e4', fg: '#ef7b23' },
} as const;

const toBillions = (naira: number) => Math.round((naira / 1_000_000_000) * 100) / 100;
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

function OverviewKpi({
  label,
  value,
  meta,
  tone,
  fill,
  icon: Icon,
}: {
  label: string;
  value: string;
  meta: string;
  tone: keyof typeof KPI_TONES;
  fill: number;
  icon: typeof Layers3;
}) {
  const c = KPI_TONES[tone];
  return (
    <div className="cc-kpi">
      <div className="cc-kpi-top">
        <div className="cc-kpi-icon" style={{ background: c.bg, color: c.fg }}>
          <Icon size={20} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="cc-kpi-label">{label}</div>
          <div className="cc-kpi-value">{value}</div>
          <div className="cc-kpi-meta">{meta}</div>
          <div className="cc-track">
            <div className="cc-fill" style={{ width: `${Math.min(100, Math.max(0, fill))}%`, background: c.fg }} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function CostControlOverviewFigma({ project }: Props) {
  const snap = useMemo(() => deriveProjectCostSnapshot(project), [project]);
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

  const mh = utilization?.summary;
  const mhUtil = mh
    ? mh.budgetedHours > 0
      ? mh.consumedPct
      : mh.utilizationPct
    : 0;
  const plannedHrs = mh?.budgetedHours || 0;
  const actualHrs = mh?.productiveHours || mh?.pmApprovedHours || 0;

  const costTrend = useMemo(() => {
    const progress = Math.max(0.05, Math.min(1, snap.bac ? snap.actual / snap.bac : Number(project.actual || 0) / 100));
    return MONTHS.map((m, i) => {
      const t = (i + 1) / 12;
      return {
        m,
        budget: toBillions(snap.bac * t),
        commitment: toBillions(snap.commitments * Math.min(1, t * 1.05)),
        actual: toBillions(snap.actual * Math.min(1, t / progress)),
        forecast: toBillions(snap.eac * t),
      };
    });
  }, [snap, project.actual]);

  const manHourRows = useMemo(() => {
    if (actualHrs <= 0 && plannedHrs <= 0) {
      return [
        { discipline: 'Project Labour', planned: 0, actual: 0, utilization: 0, variance: 0, status: 'On Track' as const },
      ];
    }
    // Live timesheets do not yet carry discipline tags — surface project total + top employees as effort bands.
    const employees = utilization?.byEmployee?.slice(0, 5) || [];
    if (!employees.length) {
      return [
        {
          discipline: 'Project Labour',
          planned: plannedHrs || actualHrs,
          actual: actualHrs,
          utilization: Math.min(100, mhUtil),
          variance: Math.max(0, (plannedHrs || actualHrs) - actualHrs),
          status: mhUtil >= 95 ? ('At Risk' as const) : ('On Track' as const),
        },
      ];
    }
    const totalEmp = employees.reduce((s, e) => s + e.hours, 0) || 1;
    return employees.map((emp) => {
      const share = emp.hours / totalEmp;
      const planned = Math.round((plannedHrs || actualHrs) * share);
      const util = planned > 0 ? Math.round((emp.hours / planned) * 100) : 100;
      return {
        discipline: emp.employeeName || emp.employeeNo || 'Crew',
        planned,
        actual: Math.round(emp.hours),
        utilization: Math.min(100, util),
        variance: Math.max(0, planned - Math.round(emp.hours)),
        status: util >= 95 ? ('At Risk' as const) : ('On Track' as const),
      };
    });
  }, [utilization, actualHrs, plannedHrs, mhUtil]);

  const pieData = useMemo(() => {
    const total = Math.max(snap.actual, 1);
    const slices = [
      { name: 'Labour', share: 0.36, color: '#3389ef' },
      { name: 'Materials', share: 0.27, color: '#2fbf7b' },
      { name: 'Subcontract', share: 0.24, color: '#f4a43b' },
      { name: 'Equipment', share: 0.08, color: '#7458d6' },
      { name: 'Others', share: 0.05, color: '#91a0b4' },
    ];
    return slices.map((s) => ({
      name: s.name,
      value: Math.round((total * s.share) / 1_000_000),
      color: s.color,
      naira: total * s.share,
    }));
  }, [snap.actual]);

  const costCodes = pieData.map((s, i) => ({
    code: ['LAB-001', 'MAT-001', 'SUB-001', 'EQP-001', 'OTH-001'][i],
    description:
      s.name === 'Labour'
        ? 'Direct Labour'
        : s.name === 'Materials'
          ? 'Structural Materials'
          : s.name === 'Subcontract'
            ? 'Fabrication Subcontract'
            : s.name === 'Equipment'
              ? 'Plant & Equipment'
              : 'Other Costs',
    actual: money(s.naira, project.currency),
    pct: `${[36, 27, 24, 8, 5][i]}%`,
  }));

  const queueCount = utilization?.labourQueue?.length || 0;
  const alerts = [
    snap.vac < 0
      ? { kind: 'critical' as const, title: `Forecast EAC exceeds BAC by ${money(Math.abs(snap.vac), project.currency)}`, meta: `Cost · ${project.code}`, status: 'Open' }
      : null,
    snap.cpi < 1
      ? { kind: 'warning' as const, title: `CPI below target (${snap.cpi.toFixed(2)})`, meta: `Performance · ${project.code}`, status: 'Open' }
      : null,
    queueCount > 0
      ? { kind: 'warning' as const, title: `Timesheet validation pending (${queueCount} lines)`, meta: 'Labour · Cost Control queue', status: 'Open' }
      : null,
    actualHrs <= 0
      ? { kind: 'info' as const, title: 'No PM-approved timesheet hours booked yet', meta: 'Labour · Utilization', status: 'Open' }
      : null,
    { kind: 'info' as const, title: 'Monthly forecast submission due', meta: 'Forecast · Period close', status: 'Open' },
  ].filter(Boolean) as Array<{ kind: 'critical' | 'warning' | 'info'; title: string; meta: string; status: string }>;

  const periodLabel = new Date().toLocaleString('en-GB', { month: 'short', year: 'numeric' });

  return (
    <div className="cc-figma">
      <div className="cc-actions-row">
        <div className="cc-selects">
          <span className="cc-pill">{project.code} — {project.name}</span>
          <span className="cc-pill">{periodLabel}</span>
        </div>
        <div className="cc-actions">
          <Link className="cc-btn primary" href={`/projects-engineering/projects/${project.id}/cost-control/reports`}>
            <Download size={14} /> Export
          </Link>
          <Link className="cc-btn" href={`/projects-engineering/projects/${project.id}/resources`}>
            Man Hours
          </Link>
        </div>
      </div>

      <div className="cc-kpi-grid">
        <OverviewKpi label="Project Budget (BAC)" value={money(snap.bac, project.currency)} meta="Live contract value" tone="blue" fill={100} icon={Layers3} />
        <OverviewKpi label="Total Commitments" value={money(snap.commitments, project.currency)} meta={`${pct(snap.commitments, snap.bac)}% of Budget`} tone="purple" fill={pct(snap.commitments, snap.bac)} icon={ShoppingCart} />
        <OverviewKpi label="Actual Cost" value={money(snap.actual, project.currency)} meta={`${pct(snap.actual, snap.bac)}% of Budget`} tone="green" fill={pct(snap.actual, snap.bac)} icon={Coins} />
        <OverviewKpi label="Estimate to Complete (ETC)" value={money(snap.etc, project.currency)} meta={`${pct(snap.etc, snap.bac)}% of Budget`} tone="orange" fill={pct(snap.etc, snap.bac)} icon={TrendingUp} />
        <OverviewKpi label="Estimate at Completion (EAC)" value={money(snap.eac, project.currency)} meta={`${snap.vac >= 0 ? '' : '+ '}${money(Math.abs(snap.eac - snap.bac), project.currency)} vs BAC`} tone="purple" fill={pct(snap.eac, snap.bac || snap.eac)} icon={Calculator} />
        <OverviewKpi label="Cost Performance Index (CPI)" value={snap.cpi.toFixed(2)} meta={snap.cpi >= 1 ? '> 1.00 (Good)' : '< 1.00 (Watch)'} tone="blue" fill={Math.min(100, snap.cpi * 86)} icon={Gauge} />
        <OverviewKpi
          label="Man Hours Utilization"
          value={loadingMh ? '…' : `${Math.round(mhUtil)}%`}
          meta={loadingMh ? 'Loading timesheets…' : `${actualHrs.toLocaleString()} / ${(plannedHrs || actualHrs || 0).toLocaleString()} Hrs`}
          tone="blue"
          fill={mhUtil}
          icon={Users}
        />
      </div>

      <div className="cc-grid3">
        <section className="cc-card">
          <div className="cc-card-head">
            <div>
              <div className="cc-card-title">Cost Performance Trend</div>
              <div className="cc-card-sub">Budget, commitments, actuals and forecast</div>
            </div>
            <span className="cc-right-select">Profile curve</span>
          </div>
          <div className="cc-card-body">
            <div className="cc-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={costTrend} margin={{ left: -18, right: 8, top: 6, bottom: 0 }}>
                  <CartesianGrid stroke="#e7edf4" />
                  <XAxis dataKey="m" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => `₦${Number(v).toFixed(1)}B`} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v) => `₦${Number(v).toFixed(2)}B`} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line type="monotone" dataKey="budget" name="Budget (BAC)" stroke="#2d8cff" strokeWidth={2.2} dot={false} />
                  <Line type="monotone" dataKey="commitment" name="Commitments" stroke="#7b61d9" strokeWidth={2.2} dot={false} />
                  <Line type="monotone" dataKey="actual" name="Actual Cost" stroke="#2abb78" strokeWidth={2.2} dot={false} />
                  <Line type="monotone" dataKey="forecast" name="Forecast (EAC)" stroke="#ff971f" strokeWidth={2.2} strokeDasharray="5 4" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        <section className="cc-card">
          <div className="cc-card-head">
            <div>
              <div className="cc-card-title">Man Hour Utilization</div>
              <div className="cc-card-sub">Live timesheet effort{plannedHrs ? ' vs MH budget' : ' (set budget on Man Hours tab)'}</div>
            </div>
            <span className="cc-right-select">{periodLabel}</span>
          </div>
          <div className="cc-card-body">
            <div className="cc-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={manHourRows} margin={{ left: -15, right: 4, top: 10, bottom: 4 }}>
                  <CartesianGrid stroke="#e7edf4" vertical={false} />
                  <XAxis dataKey="discipline" interval={0} tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v) => `${v}%`} />
                  <Bar dataKey="utilization" radius={[4, 4, 0, 0]}>
                    {manHourRows.map((_, i) => (
                      <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        <section className="cc-card">
          <div className="cc-card-head">
            <div>
              <div className="cc-card-title">Cost Breakdown (Actual)</div>
              <div className="cc-card-sub">Composition proxy until cost-code ledger syncs</div>
            </div>
            <span className="cc-right-select">{periodLabel}</span>
          </div>
          <div className="cc-card-body">
            <div className="cc-pie-wrap">
              <div className="cc-pie-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" innerRadius={62} outerRadius={92}>
                      {pieData.map((d) => (
                        <Cell key={d.name} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => `₦${v}M`} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="cc-pie-center">
                  <strong>{money(snap.actual, project.currency)}</strong>
                  <div>Total Actual</div>
                </div>
              </div>
              <div className="cc-pie-legend">
                {pieData.map((d) => (
                  <div key={d.name} className="cc-legend-row">
                    <span style={{ background: d.color }} />
                    <span>{d.name}</span>
                    <strong>₦{d.value}M</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="cc-grid-bottom">
        <section className="cc-card">
          <div className="cc-card-head">
            <div>
              <div className="cc-card-title">Man Hour Utilization Details</div>
              <div className="cc-card-sub">Planned vs actual effort from live timesheets</div>
            </div>
            <Link className="cc-btn" href={`/projects-engineering/projects/${project.id}/resources`}>
              View All
            </Link>
          </div>
          <div className="cc-card-body">
            <table className="cc-table">
              <thead>
                <tr>
                  <th>Discipline / Resource</th>
                  <th>Planned Hrs</th>
                  <th>Actual Hrs</th>
                  <th>Utilization</th>
                  <th>Variance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {manHourRows.map((r) => (
                  <tr key={r.discipline}>
                    <td>
                      <strong>{r.discipline}</strong>
                    </td>
                    <td>{r.planned.toLocaleString()}</td>
                    <td>{r.actual.toLocaleString()}</td>
                    <td>{r.utilization}%</td>
                    <td>+{r.variance.toLocaleString()}</td>
                    <td>
                      <span className={`cc-badge ${r.status === 'On Track' ? 'green' : 'amber'}`}>{r.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="cc-card">
          <div className="cc-card-head">
            <div>
              <div className="cc-card-title">Top Cost Codes by Actual Cost</div>
              <div className="cc-card-sub">Highest-cost charge codes (proxy until CBS sync)</div>
            </div>
            <Link className="cc-btn" href={`/projects-engineering/projects/${project.id}/cost-control/cbs`}>
              View All
            </Link>
          </div>
          <div className="cc-card-body">
            <table className="cc-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Description</th>
                  <th>Actual Cost</th>
                  <th>% of Total</th>
                </tr>
              </thead>
              <tbody>
                {costCodes.map((r) => (
                  <tr key={r.code}>
                    <td>
                      <strong>{r.code}</strong>
                    </td>
                    <td>{r.description}</td>
                    <td>{r.actual}</td>
                    <td>{r.pct}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="cc-card">
          <div className="cc-card-head">
            <div>
              <div className="cc-card-title">
                Key Alerts & Actions <span className="cc-badge red">{alerts.length}</span>
              </div>
              <div className="cc-card-sub">Exceptions requiring cost controller action</div>
            </div>
            <Link className="cc-btn" href={`/projects-engineering/projects/${project.id}/cost-control/labour-timesheets`}>
              View All
            </Link>
          </div>
          <div className="cc-card-body">
            {alerts.map((a, i) => {
              const tone = a.kind === 'critical' ? '#df3d3d' : a.kind === 'warning' ? '#f2a51d' : '#3e8fe8';
              return (
                <div className="cc-alert-row" key={`${a.title}-${i}`}>
                  <div className="cc-alert-icon" style={{ background: tone }}>
                    !
                  </div>
                  <div>
                    <div className="cc-alert-title">{a.title}</div>
                    <div className="cc-alert-meta">{a.meta}</div>
                  </div>
                  <span className={`cc-badge ${a.kind === 'critical' ? 'red' : a.kind === 'warning' ? 'amber' : 'green'}`}>{a.status}</span>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <div className="cc-ai-bar">
        <Sparkles size={18} />
        <strong>AI Insight</strong>
        <span>
          Labour utilization is {Math.round(mhUtil)}% on {project.code}
          {plannedHrs ? ` against a ${plannedHrs.toLocaleString()}h man-hour budget` : ''}. CPI is {snap.cpi.toFixed(2)} and EAC is{' '}
          {money(snap.eac, project.currency)}
          {queueCount ? `. ${queueCount} timesheet line(s) await cost validation.` : '.'} Verify coding before period close.
        </span>
        <Link className="cc-btn" style={{ marginLeft: 'auto' }} href={`/projects-engineering/projects/${project.id}/ai`}>
          View AI Analysis
        </Link>
      </div>
    </div>
  );
}
