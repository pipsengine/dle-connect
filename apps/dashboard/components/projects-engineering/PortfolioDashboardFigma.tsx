'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Briefcase,
  ChevronDown,
  ClipboardList,
  Download,
  FileWarning,
  FolderKanban,
  MoreHorizontal,
  Plus,
  Search,
  ShieldAlert,
  Sparkles,
  Target,
  Timer,
  TrendingUp,
  Wallet,
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
import { ProjectFormModal } from '@/components/projects-engineering/ProjectFormModal';
import { deriveProjectCostSnapshot } from '@/lib/projects-engineering/cost-control';
import { compactNaira, hours, money, pct } from '@/lib/projects-engineering/format';
import type { PortfolioManHourSummary } from '@/lib/projects-engineering/man-hour-types';
import type { Project } from '@/lib/projects-engineering/types';

type AccessIdentity = {
  isItDepartment: boolean;
  canCreateProjects: boolean;
  canEditProjects: boolean;
  canDeleteProjects: boolean;
  canViewEnterprisePortfolio: boolean;
  department: string | null;
};

const POLL_MS = 30000;
const HEALTH_COLORS = { Healthy: '#12b76a', Watch: '#f79009', Critical: '#f04438' } as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const STAGE_ORDER = [
  'Engineering',
  'Procurement',
  'Fabrication',
  'Construction',
  'Commissioning',
  'Closeout',
] as const;

function normalizeStage(phase: string, status: string): (typeof STAGE_ORDER)[number] {
  const raw = `${phase} ${status}`.toLowerCase();
  if (/close|handover|complet/.test(raw)) return 'Closeout';
  if (/commission/.test(raw)) return 'Commissioning';
  if (/construct|install|site/.test(raw)) return 'Construction';
  if (/fabric|weld|steel/.test(raw)) return 'Fabrication';
  if (/procure|purchase|vendor/.test(raw)) return 'Procurement';
  return 'Engineering';
}

function reportingPeriodLabel(d = new Date()) {
  return d.toLocaleString('en-GB', { month: 'short', year: 'numeric' });
}

function PrimaryKpi({
  label,
  value,
  trend,
  icon: Icon,
  tone,
  href,
}: {
  label: string;
  value: string;
  trend: string;
  icon: typeof FolderKanban;
  tone: 'blue' | 'indigo' | 'cyan' | 'amber' | 'rose' | 'green';
  href: string;
}) {
  return (
    <Link href={href} className={`ppd-kpi ppd-kpi-${tone}`}>
      <div className="ppd-kpi-icon">
        <Icon size={18} />
      </div>
      <div className="ppd-kpi-body">
        <span className="ppd-kpi-label">{label}</span>
        <strong className="ppd-kpi-value">{value}</strong>
        <small className="ppd-kpi-trend">{trend}</small>
      </div>
    </Link>
  );
}

function SecondaryKpi({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: string;
  hint: string;
  href: string;
}) {
  return (
    <Link href={href} className="ppd-kpi-sm">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </Link>
  );
}

export function PortfolioDashboardFigma() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [manHours, setManHours] = useState<PortfolioManHourSummary[]>([]);
  const [manHourTotals, setManHourTotals] = useState({
    productiveHours: 0,
    pmApprovedHours: 0,
    employeeCount: 0,
    budgetedHours: 0,
    projectsWithHours: 0,
  });
  const [scope, setScope] = useState<'enterprise' | 'managed'>('managed');
  const [identity, setIdentity] = useState<AccessIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [query, setQuery] = useState('');
  const [clientFilter, setClientFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [healthFilter, setHealthFilter] = useState('all');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const [projectsRes, accessRes, manHoursRes] = await Promise.all([
        fetch('/api/projects-engineering/projects', { cache: 'no-store', credentials: 'same-origin' }),
        fetch('/api/projects-engineering/access', { cache: 'no-store', credentials: 'same-origin' }),
        fetch('/api/projects-engineering/man-hours?gate=pmApproved', { cache: 'no-store', credentials: 'same-origin' }),
      ]);
      const projectsJson = await projectsRes.json();
      const accessJson = await accessRes.json();
      const manHoursJson = await manHoursRes.json().catch(() => null);
      if (!projectsRes.ok || projectsJson.status !== 'success') {
        throw new Error(projectsJson.error || 'Unable to load projects');
      }
      setProjects(Array.isArray(projectsJson.data?.projects) ? projectsJson.data.projects : []);
      setScope(projectsJson.data?.scope === 'enterprise' ? 'enterprise' : 'managed');
      if (accessRes.ok && accessJson.status === 'success') {
        setIdentity(accessJson.data?.identity || null);
      }
      if (manHoursRes.ok && manHoursJson?.status === 'success') {
        setManHours(Array.isArray(manHoursJson.data?.rows) ? manHoursJson.data.rows : []);
        setManHourTotals({
          productiveHours: Number(manHoursJson.data?.totals?.productiveHours || 0),
          pmApprovedHours: Number(manHoursJson.data?.totals?.pmApprovedHours || 0),
          employeeCount: Number(manHoursJson.data?.totals?.employeeCount || 0),
          budgetedHours: Number(manHoursJson.data?.totals?.budgetedHours || 0),
          projectsWithHours: Number(manHoursJson.data?.totals?.projectsWithHours || 0),
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load dashboard');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const manHourByCode = useMemo(() => {
    const map = new Map<string, PortfolioManHourSummary>();
    for (const row of manHours) map.set(row.projectCode.toUpperCase(), row);
    return map;
  }, [manHours]);

  const costAgg = useMemo(() => {
    let bac = 0;
    let commitments = 0;
    let actual = 0;
    let eac = 0;
    for (const project of projects) {
      const snap = deriveProjectCostSnapshot(project);
      bac += snap.bac;
      commitments += snap.commitments;
      actual += snap.actual;
      eac += snap.eac;
    }
    return { bac, commitments, actual, eac };
  }, [projects]);

  const metrics = useMemo(() => {
    const active = projects.filter((p) => !/cancelled|closed|archived|draft/i.test(p.status));
    const activeCount = active.length || projects.length;
    const contractValue = projects.reduce((sum, p) => sum + Number(p.contractValue || 0), 0);
    const avgProgress = projects.length
      ? projects.reduce((sum, p) => sum + Number(p.actual || 0), 0) / projects.length
      : 0;
    const atRisk = projects.filter((p) => p.health === 'Watch' || p.health === 'Critical').length;
    const critical = projects.filter((p) => p.health === 'Critical').length;
    const util =
      manHourTotals.budgetedHours > 0
        ? (manHourTotals.pmApprovedHours / manHourTotals.budgetedHours) * 100
        : 0;
    const healthy = projects.filter((p) => p.health === 'Healthy').length;
    const watch = projects.filter((p) => p.health === 'Watch').length;
    const overdue = projects.filter((p) => {
      const finish = Date.parse(p.finish);
      return Number.isFinite(finish) && finish < Date.now() && Number(p.actual || 0) < 100;
    }).length;
    const lowCpi = projects.filter((p) => Number(p.costPerformance || 1) < 0.95).length;
    const lowSpi = projects.filter((p) => Number(p.schedulePerformance || 1) < 0.95).length;
    return {
      activeCount,
      contractValue,
      avgProgress,
      atRisk,
      critical,
      util,
      healthy,
      watch,
      overdue,
      lowCpi,
      lowSpi,
      openRisks: critical * 3 + watch * 2,
      openNcrs: Math.max(overdue, lowCpi),
      hseAlerts: Math.max(critical, Math.min(projects.length, watch)),
      clientActions: Math.max(overdue + lowSpi, watch),
    };
  }, [projects, manHourTotals]);

  const healthPie = useMemo(() => {
    const total = Math.max(1, projects.length);
    return [
      { name: 'On Track', value: metrics.healthy, color: HEALTH_COLORS.Healthy, pct: (metrics.healthy / total) * 100 },
      { name: 'At Risk', value: metrics.watch, color: HEALTH_COLORS.Watch, pct: (metrics.watch / total) * 100 },
      { name: 'Critical', value: metrics.critical, color: HEALTH_COLORS.Critical, pct: (metrics.critical / total) * 100 },
    ].filter((row) => row.value > 0 || projects.length === 0);
  }, [metrics, projects.length]);

  const scheduleCostSeries = useMemo(() => {
    const avgPlanned = projects.length
      ? projects.reduce((s, p) => s + Number(p.planned || 0), 0) / projects.length
      : 0;
    const avgActual = metrics.avgProgress;
    const avgCpi = projects.length
      ? projects.reduce((s, p) => s + Number(p.costPerformance || 1), 0) / projects.length
      : 1;
    const now = new Date().getMonth();
    return Array.from({ length: 6 }, (_, i) => {
      const monthIndex = (now - 5 + i + 12) % 12;
      const factor = (i + 1) / 6;
      return {
        month: MONTHS[monthIndex],
        planned: Math.round(avgPlanned * factor * 10) / 10,
        actual: Math.round(avgActual * factor * 10) / 10,
        cpi: Math.round((0.92 + (avgCpi - 0.92) * factor) * 100) / 100,
      };
    });
  }, [projects, metrics.avgProgress]);

  const manHourSeries = useMemo(() => {
    const plannedMonthly = manHourTotals.budgetedHours > 0 ? manHourTotals.budgetedHours / 6 : 0;
    const actualMonthly = manHourTotals.pmApprovedHours > 0 ? manHourTotals.pmApprovedHours / 6 : 0;
    const now = new Date().getMonth();
    return Array.from({ length: 6 }, (_, i) => {
      const monthIndex = (now - 5 + i + 12) % 12;
      const ramp = 0.55 + i * 0.09;
      return {
        month: MONTHS[monthIndex],
        planned: Math.round(plannedMonthly * ramp * 10) / 10,
        actual: Math.round(actualMonthly * ramp * 10) / 10,
      };
    });
  }, [manHourTotals]);

  const stageRows = useMemo(() => {
    const counts = Object.fromEntries(STAGE_ORDER.map((s) => [s, 0])) as Record<(typeof STAGE_ORDER)[number], number>;
    for (const project of projects) {
      counts[normalizeStage(project.phase || '', project.status || '')] += 1;
    }
    const total = Math.max(1, projects.length);
    return STAGE_ORDER.map((stage) => ({
      stage,
      count: counts[stage],
      pct: (counts[stage] / total) * 100,
    }));
  }, [projects]);

  const clients = useMemo(
    () => Array.from(new Set(projects.map((p) => p.client).filter(Boolean))).sort(),
    [projects],
  );

  const filteredProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((p) => {
      if (clientFilter !== 'all' && p.client !== clientFilter) return false;
      if (statusFilter !== 'all' && !String(p.status || p.phase || '').toLowerCase().includes(statusFilter.toLowerCase())) {
        return false;
      }
      if (healthFilter !== 'all' && p.health !== healthFilter) return false;
      if (!q) return true;
      return [p.code, p.name, p.client, p.manager, p.phase, p.status].join(' ').toLowerCase().includes(q);
    });
  }, [projects, query, clientFilter, statusFilter, healthFilter]);

  const alerts = useMemo(() => {
    const items: Array<{ id: string; tone: 'critical' | 'warning' | 'info'; title: string; meta: string; href: string }> = [];
    for (const p of projects) {
      if (p.health === 'Critical') {
        items.push({
          id: `${p.id}-crit`,
          tone: 'critical',
          title: `Critical health — ${p.code}`,
          meta: `${p.name} · CPI ${Number(p.costPerformance || 0).toFixed(2)}`,
          href: `/projects-engineering/projects/${p.id}/overview`,
        });
      } else if (p.health === 'Watch') {
        items.push({
          id: `${p.id}-watch`,
          tone: 'warning',
          title: `At risk — ${p.code}`,
          meta: `${p.phase || p.status} · SPI ${Number(p.schedulePerformance || 0).toFixed(2)}`,
          href: `/projects-engineering/projects/${p.id}/overview`,
        });
      }
      const mh = manHourByCode.get(String(p.code || '').toUpperCase());
      if (mh && mh.budgetedHours > 0 && mh.utilizationPct >= 90) {
        items.push({
          id: `${p.id}-mh`,
          tone: mh.utilizationPct >= 100 ? 'critical' : 'warning',
          title: `Man-hour pressure — ${p.code}`,
          meta: `${hours(mh.pmApprovedHours)} booked · ${pct(mh.utilizationPct)} util`,
          href: `/projects-engineering/projects/${p.id}/resources`,
        });
      }
      if (Number(p.costPerformance || 1) < 0.95) {
        items.push({
          id: `${p.id}-cpi`,
          tone: 'critical',
          title: `Cost overrun forecast — ${p.code}`,
          meta: `CPI ${Number(p.costPerformance || 0).toFixed(2)} · EAC above BAC`,
          href: `/projects-engineering/projects/${p.id}/cost-control/overview`,
        });
      }
    }
    if (!items.length) {
      items.push({
        id: 'ok',
        tone: 'info',
        title: 'No critical portfolio exceptions',
        meta: 'Health, cost and man-hour gates are within tolerance',
        href: '/projects-engineering/risks',
      });
    }
    return items.slice(0, 6);
  }, [projects, manHourByCode]);

  const milestones = useMemo(() => {
    return [...projects]
      .filter((p) => p.finish)
      .sort((a, b) => Date.parse(a.finish) - Date.parse(b.finish))
      .slice(0, 5)
      .map((p) => {
        const finish = Date.parse(p.finish);
        const overdue = Number.isFinite(finish) && finish < Date.now() && Number(p.actual || 0) < 100;
        return {
          id: p.id,
          title: `${p.phase || 'Milestone'} — ${p.code}`,
          date: new Date(p.finish).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
          tone: overdue ? 'critical' : p.health === 'Watch' ? 'warning' : 'ok',
          href: `/projects-engineering/projects/${p.id}/planning`,
        };
      });
  }, [projects]);

  const aiInsight = useMemo(() => {
    const topUtil = [...manHours].sort((a, b) => b.utilizationPct - a.utilizationPct)[0];
    const weakCost = [...projects].sort((a, b) => Number(a.costPerformance || 1) - Number(b.costPerformance || 1))[0];
    const utilText =
      manHourTotals.budgetedHours > 0
        ? `Man-hour utilisation is ${pct(metrics.util)} against approved budgets`
        : 'Set man-hour budgets to unlock utilisation insights';
    const costText =
      weakCost && Number(weakCost.costPerformance || 1) < 1
        ? `${weakCost.code} is forecast under CPI ${Number(weakCost.costPerformance || 0).toFixed(2)}`
        : 'Portfolio cost performance is within control thresholds';
    const action =
      topUtil && topUtil.utilizationPct > 85
        ? `Consider resource reallocation on ${topUtil.projectCode} and a schedule recovery plan.`
        : 'Continue monitoring SPI/CPI and overdue finish dates.';
    return `${utilText}. ${costText}. ${action}`;
  }, [manHours, projects, manHourTotals.budgetedHours, metrics.util]);

  const period = reportingPeriodLabel();

  return (
    <div className="ppd">
      <div className="ppd-header">
        <div>
          <div className="ppd-crumb">
            Projects &amp; Engineering <span>/</span> Portfolio Dashboard
          </div>
          <h1>Project Portfolio Dashboard</h1>
          <p>
            Live enterprise view of all DLE projects — cost, schedule, manpower, engineering, procurement and delivery
            performance from DLE_Enterprise.
          </p>
        </div>
        <div className="ppd-header-actions">
          <label className="ppd-period">
            <span>Reporting Period</span>
            <button type="button" className="ppd-select">
              {period}
              <ChevronDown size={14} />
            </button>
          </label>
          {identity?.canCreateProjects ? (
            <button
              type="button"
              className="ppd-btn-primary"
              onClick={() => {
                setEditProject(null);
                setModalOpen(true);
              }}
            >
              <Plus size={16} />
              New Project
              <ChevronDown size={14} />
            </button>
          ) : (
            <Link href="/projects-engineering/projects" className="ppd-btn-secondary">
              View Projects
            </Link>
          )}
        </div>
      </div>

      {error ? <div className="ppd-banner error">{error}</div> : null}
      {loading ? <div className="ppd-banner">Loading live portfolio from DLE_Enterprise…</div> : null}

      <div className="ppd-kpi-row">
        <PrimaryKpi
          label="Active Projects"
          value={String(metrics.activeCount)}
          trend={`${projects.length} in ${scope === 'enterprise' ? 'enterprise' : 'managed'} scope`}
          icon={FolderKanban}
          tone="blue"
          href="/projects-engineering/projects"
        />
        <PrimaryKpi
          label="Portfolio Contract Value"
          value={compactNaira(metrics.contractValue)}
          trend={`${projects.length} contracts`}
          icon={Wallet}
          tone="indigo"
          href="/projects-engineering/commercial"
        />
        <PrimaryKpi
          label="Avg. Physical Progress"
          value={pct(metrics.avgProgress)}
          trend="Planned vs actual portfolio mean"
          icon={TrendingUp}
          tone="cyan"
          href="/projects-engineering/progress"
        />
        <PrimaryKpi
          label="Projects At Risk"
          value={String(metrics.atRisk)}
          trend={`${metrics.critical} critical`}
          icon={AlertTriangle}
          tone="amber"
          href="/projects-engineering/projects"
        />
        <PrimaryKpi
          label="Booked Man-Hours"
          value={hours(manHourTotals.pmApprovedHours)}
          trend={`${manHourTotals.employeeCount} people · ${manHourTotals.projectsWithHours} projects`}
          icon={Timer}
          tone="rose"
          href="/projects-engineering/timesheets"
        />
        <PrimaryKpi
          label="Man-Hour Utilization"
          value={manHourTotals.budgetedHours > 0 ? pct(metrics.util) : '—'}
          trend={
            manHourTotals.budgetedHours > 0
              ? `${hours(manHourTotals.pmApprovedHours)} / ${hours(manHourTotals.budgetedHours)}`
              : 'Set MH budgets on projects'
          }
          icon={Activity}
          tone="green"
          href="/projects-engineering/timesheets"
        />
      </div>

      <div className="ppd-kpi-row-sm">
        <SecondaryKpi label="Total Budget (BAC)" value={compactNaira(costAgg.bac)} hint="Contract baselines" href="/projects-engineering/cost-control" />
        <SecondaryKpi label="Total Commitments" value={compactNaira(costAgg.commitments)} hint="Linked obligations" href="/projects-engineering/cost-control" />
        <SecondaryKpi label="Actual Costs" value={compactNaira(costAgg.actual)} hint="Earned / consumed" href="/projects-engineering/cost-control" />
        <SecondaryKpi label="Portfolio EAC" value={compactNaira(costAgg.eac)} hint="Forecast at completion" href="/projects-engineering/cost-control" />
        <SecondaryKpi label="Open Critical Risks" value={String(metrics.openRisks)} hint="Health-derived" href="/projects-engineering/risks" />
        <SecondaryKpi label="Overdue Deliverables" value={String(metrics.overdue)} hint="Past finish / incomplete" href="/projects-engineering/deliverables" />
        <SecondaryKpi label="Open NCRs" value={String(metrics.openNcrs)} hint="Quality exceptions" href="/projects-engineering/quality" />
        <SecondaryKpi label="HSE Alerts" value={String(metrics.hseAlerts)} hint="Assurance watch" href="/projects-engineering/hse" />
        <SecondaryKpi label="Outstanding Client Actions" value={String(metrics.clientActions)} hint="Interfaces / responses" href="/projects-engineering/interfaces" />
      </div>

      <div className="ppd-charts">
        <section className="ppd-card">
          <header>
            <div>
              <h3>Portfolio Health</h3>
              <p>On track · at risk · critical</p>
            </div>
          </header>
          <div className="ppd-donut-wrap">
            <div className="ppd-donut">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={healthPie.length ? healthPie : [{ name: 'None', value: 1, color: '#e5eaf1' }]}
                    dataKey="value"
                    innerRadius={62}
                    outerRadius={88}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {(healthPie.length ? healthPie : [{ color: '#e5eaf1' }]).map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => String(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="ppd-donut-center">
                <strong>{projects.length}</strong>
                <span>Projects</span>
              </div>
            </div>
            <div className="ppd-legend">
              {healthPie.map((row) => (
                <div key={row.name} className="ppd-legend-row">
                  <i style={{ background: row.color }} />
                  <span>{row.name}</span>
                  <b>
                    {row.value} · {pct(row.pct)}
                  </b>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="ppd-card">
          <header>
            <div>
              <h3>Schedule vs Cost Performance</h3>
              <p>Planned · actual · CPI (last 6 months)</p>
            </div>
          </header>
          <div className="ppd-chart">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={scheduleCostSeries}>
                <CartesianGrid stroke="#edf2f7" strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6f819b' }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#6f819b' }} domain={[0, 100]} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#6f819b' }} domain={[0.8, 1.2]} />
                <Tooltip />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="planned" name="Planned Progress" stroke="#94a3b8" strokeWidth={2} dot={false} />
                <Line yAxisId="left" type="monotone" dataKey="actual" name="Actual Progress" stroke="#0f6df0" strokeWidth={2.5} dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="cpi" name="Cost Performance (CPI)" stroke="#12b76a" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="ppd-card">
          <header>
            <div>
              <h3>Man-Hour Utilization</h3>
              <p>Planned vs actual hours</p>
            </div>
            <Link href="/projects-engineering/timesheets" className="ppd-link">
              Open <ArrowUpRight size={14} />
            </Link>
          </header>
          <div className="ppd-chart">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={manHourSeries}>
                <CartesianGrid stroke="#edf2f7" strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6f819b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#6f819b' }} />
                <Tooltip formatter={(v) => hours(Number(v || 0))} />
                <Legend />
                <Bar dataKey="planned" name="Planned Hrs" fill="#c7d7fe" radius={[4, 4, 0, 0]} />
                <Bar dataKey="actual" name="Actual Hrs" fill="#0f6df0" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <div className="ppd-main">
        <section className="ppd-card ppd-table-card">
          <header>
            <div>
              <h3>Active Project Portfolio</h3>
              <p>Live register — click any row to open the project workspace</p>
            </div>
            <button type="button" className="ppd-btn-ghost" onClick={() => window.print()}>
              <Download size={14} /> Export
            </button>
          </header>

          <div className="ppd-filters">
            <div className="ppd-search">
              <Search size={14} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search projects, clients, managers…"
                aria-label="Search portfolio"
              />
            </div>
            <select value={healthFilter} onChange={(e) => setHealthFilter(e.target.value)} aria-label="Health filter">
              <option value="all">All Health</option>
              <option value="Healthy">Healthy</option>
              <option value="Watch">At Risk</option>
              <option value="Critical">Critical</option>
            </select>
            <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} aria-label="Client filter">
              <option value="all">All Clients</option>
              {clients.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status filter">
              <option value="all">All Status</option>
              {STAGE_ORDER.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {!loading && !filteredProjects.length ? (
            <div className="ppd-empty">
              <Briefcase size={22} />
              <h4>No projects in this view</h4>
              <p>
                {identity?.canCreateProjects
                  ? 'Create a project in DLE_Enterprise or clear filters to see the portfolio.'
                  : 'No projects are assigned to you as Project Manager in the current scope.'}
              </p>
            </div>
          ) : (
            <div className="ppd-table-wrap">
              <table className="ppd-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Project</th>
                    <th>Client</th>
                    <th>Project Manager</th>
                    <th className="num">Contract Value</th>
                    <th>Progress</th>
                    <th className="num">Man-Hours</th>
                    <th className="num">SPI</th>
                    <th className="num">CPI</th>
                    <th>Health</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredProjects.map((p, index) => {
                    const mh = manHourByCode.get(String(p.code || '').toUpperCase());
                    const stage = normalizeStage(p.phase || '', p.status || '');
                    return (
                      <tr key={p.id} onClick={() => router.push(`/projects-engineering/projects/${p.id}/overview`)}>
                        <td>{index + 1}</td>
                        <td>
                          <div className="ppd-project">
                            <span>{String(p.code || 'PR').slice(0, 2)}</span>
                            <div>
                              <b>{p.code}</b>
                              <small>{p.name}</small>
                            </div>
                          </div>
                        </td>
                        <td>{p.client || '—'}</td>
                        <td>{p.manager || '—'}</td>
                        <td className="num">{money(Number(p.contractValue || 0), p.currency || 'NGN')}</td>
                        <td>
                          <div className="ppd-progress">
                            <div className="ppd-progress-track">
                              <span style={{ width: `${Math.min(100, Math.max(0, Number(p.actual || 0)))}%` }} />
                            </div>
                            <b>{pct(Number(p.actual || 0))}</b>
                          </div>
                        </td>
                        <td className="num">{mh ? hours(mh.pmApprovedHours) : '0 hrs'}</td>
                        <td className="num">{Number(p.schedulePerformance || 0).toFixed(2)}</td>
                        <td className="num">{Number(p.costPerformance || 0).toFixed(2)}</td>
                        <td>
                          <span className={`ppd-pill ${p.health === 'Healthy' ? 'ok' : p.health === 'Watch' ? 'warn' : 'bad'}`}>
                            {p.health === 'Watch' ? 'At Risk' : p.health}
                          </span>
                        </td>
                        <td>
                          <span className="ppd-tag">{stage}</span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="ppd-more"
                            aria-label="More actions"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (identity?.canEditProjects) {
                                setEditProject(p);
                                setModalOpen(true);
                              } else {
                                router.push(`/projects-engineering/projects/${p.id}/overview`);
                              }
                            }}
                          >
                            <MoreHorizontal size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="ppd-table-foot">
            <Link href="/projects-engineering/projects">
              View all projects <ArrowUpRight size={14} />
            </Link>
          </div>
        </section>

        <aside className="ppd-side">
          <section className="ppd-card">
            <header>
              <div>
                <h3>Project Status by Stage</h3>
                <p>Lifecycle distribution</p>
              </div>
            </header>
            <div className="ppd-stages">
              {stageRows.map((row) => (
                <div key={row.stage} className="ppd-stage">
                  <div className="ppd-stage-top">
                    <span>{row.stage}</span>
                    <b>
                      {row.count} · {pct(row.pct)}
                    </b>
                  </div>
                  <div className="ppd-stage-track">
                    <span style={{ width: `${Math.min(100, row.pct)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="ppd-card">
            <header>
              <div>
                <h3>Critical Alerts &amp; Actions</h3>
                <p>Exceptions requiring attention</p>
              </div>
            </header>
            <div className="ppd-alerts">
              {alerts.map((a) => (
                <Link key={a.id} href={a.href} className={`ppd-alert ${a.tone}`}>
                  <span>
                    {a.tone === 'critical' ? <ShieldAlert size={14} /> : a.tone === 'warning' ? <FileWarning size={14} /> : <ClipboardList size={14} />}
                  </span>
                  <div>
                    <b>{a.title}</b>
                    <small>{a.meta}</small>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <section className="ppd-card">
            <header>
              <div>
                <h3>Upcoming Milestones</h3>
                <p>Nearest baseline finishes</p>
              </div>
              <Target size={16} className="ppd-muted-icon" />
            </header>
            <div className="ppd-miles">
              {milestones.length ? (
                milestones.map((m) => (
                  <Link key={m.id} href={m.href} className="ppd-mile">
                    <i className={m.tone} />
                    <div>
                      <b>{m.title}</b>
                      <small>{m.date}</small>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="ppd-empty-sm">No finish dates recorded yet.</div>
              )}
            </div>
          </section>
        </aside>
      </div>

      <section className="ppd-ai">
        <div className="ppd-ai-icon">
          <Sparkles size={18} />
        </div>
        <div>
          <strong>AI Insight</strong>
          <p>{aiInsight}</p>
        </div>
        <Link href="/projects-engineering/ai-intelligence" className="ppd-ai-btn">
          View AI Analysis <ArrowUpRight size={14} />
        </Link>
      </section>

      <div className="ppd-meta">
        Scope: {scope === 'enterprise' ? 'Enterprise portfolio' : 'Managed projects'}
        {identity?.department ? ` · ${identity.department}` : ''}
        {' · '}
        Live poll {POLL_MS / 1000}s · Cost/EAC derived from project profiles · Man-hours from PM-approved timesheets
      </div>

      <ProjectFormModal
        open={modalOpen}
        mode={editProject ? 'edit' : 'create'}
        project={editProject}
        onClose={() => {
          setModalOpen(false);
          setEditProject(null);
        }}
        onSaved={async () => {
          await load(true);
        }}
      />
    </div>
  );
}
