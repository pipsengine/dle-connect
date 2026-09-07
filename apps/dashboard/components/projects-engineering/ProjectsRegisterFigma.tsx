'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowUpDown,
  Bookmark,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Download,
  FolderKanban,
  LayoutGrid,
  List,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Search,
  SlidersHorizontal,
  TriangleAlert,
  Wallet,
} from 'lucide-react';
import { ProjectFormModal } from '@/components/projects-engineering/ProjectFormModal';
import { compactNaira, hours, money, pct } from '@/lib/projects-engineering/format';
import type { PortfolioManHourSummary } from '@/lib/projects-engineering/man-hour-types';
import type { Project } from '@/lib/projects-engineering/types';

type AccessIdentity = {
  canCreateProjects: boolean;
  canEditProjects: boolean;
  canDeleteProjects: boolean;
  canViewEnterprisePortfolio: boolean;
  department: string | null;
};

const POLL_MS = 30000;
const PAGE_SIZES = [10, 25, 50];

const STAGE_COLORS = ['s0', 's1', 's2', 's3', 's4'] as const;

function stageClass(stage: string) {
  const key = stage.toLowerCase();
  if (/construct/.test(key)) return 's0';
  if (/fabric/.test(key)) return 's1';
  if (/engineer/.test(key)) return 's2';
  if (/procure/.test(key)) return 's3';
  if (/commission|close|handover/.test(key)) return 's4';
  return STAGE_COLORS[Math.abs(stage.length) % STAGE_COLORS.length];
}

function normalizeStage(phase: string, status: string) {
  const raw = `${phase} ${status}`.trim();
  if (!raw) return 'Engineering';
  if (/close|handover|complet/i.test(raw)) return 'Closeout';
  if (/commission/i.test(raw)) return 'Commissioning';
  if (/construct|install|site/i.test(raw)) return 'Construction';
  if (/fabric|weld|steel/i.test(raw)) return 'Fabrication';
  if (/procure|purchase|vendor/i.test(raw)) return 'Procurement';
  if (/hold|suspend/i.test(raw)) return 'On Hold';
  if (/engineer|design/i.test(raw)) return 'Engineering';
  return phase || status || 'Engineering';
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '—';
}

function MetricBar({ value, blue = false }: { value: number; blue?: boolean }) {
  const v = Math.min(100, Math.max(0, Number(value) || 0));
  return (
    <div className="prr-metric">
      <b>{pct(v)}</b>
      <div>
        <i className={blue ? 'blue' : undefined} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

export default function ProjectsRegisterFigma() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [manHours, setManHours] = useState<PortfolioManHourSummary[]>([]);
  const [identity, setIdentity] = useState<AccessIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');
  const [managerFilter, setManagerFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [view, setView] = useState<'list' | 'card'>('list');
  const [sortKey, setSortKey] = useState<'code' | 'name' | 'value' | 'actual' | 'hours'>('code');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [selected, setSelected] = useState<Project | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const [projectsRes, accessRes, mhRes] = await Promise.all([
        fetch('/api/projects-engineering/projects', { cache: 'no-store', credentials: 'same-origin' }),
        fetch('/api/projects-engineering/access', { cache: 'no-store', credentials: 'same-origin' }),
        fetch('/api/projects-engineering/man-hours?gate=pmApproved', { cache: 'no-store', credentials: 'same-origin' }),
      ]);
      const projectsJson = await projectsRes.json();
      const accessJson = await accessRes.json();
      const mhJson = await mhRes.json().catch(() => null);
      if (!projectsRes.ok || projectsJson.status !== 'success') {
        throw new Error(projectsJson.error || 'Unable to load projects');
      }
      setProjects(Array.isArray(projectsJson.data?.projects) ? projectsJson.data.projects : []);
      if (accessRes.ok && accessJson.status === 'success') {
        setIdentity(accessJson.data?.identity || null);
      }
      if (mhRes.ok && mhJson?.status === 'success') {
        setManHours(Array.isArray(mhJson.data?.rows) ? mhJson.data.rows : []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load projects');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (searchParams.get('action') === 'create' && identity?.canCreateProjects) {
      setModalMode('create');
      setSelected(null);
      setModalOpen(true);
    }
  }, [searchParams, identity?.canCreateProjects]);

  const mhByCode = useMemo(() => {
    const map = new Map<string, PortfolioManHourSummary>();
    for (const row of manHours) map.set(row.projectCode.toUpperCase(), row);
    return map;
  }, [manHours]);

  const clients = useMemo(() => Array.from(new Set(projects.map((p) => p.client).filter(Boolean))).sort(), [projects]);
  const managers = useMemo(() => Array.from(new Set(projects.map((p) => p.manager).filter(Boolean))).sort(), [projects]);
  const types = useMemo(
    () => Array.from(new Set(projects.map((p) => p.projectType || p.phase).filter(Boolean))).sort() as string[],
    [projects],
  );
  const locations = useMemo(() => Array.from(new Set(projects.map((p) => p.location).filter(Boolean))).sort(), [projects]);

  const activeFilters =
    Number(statusFilter !== 'all')
    + Number(clientFilter !== 'all')
    + Number(managerFilter !== 'all')
    + Number(typeFilter !== 'all')
    + Number(locationFilter !== 'all')
    + Number(Boolean(query.trim()));

  const enriched = useMemo(() => {
    return projects.map((project) => {
      const mh = mhByCode.get(String(project.code || '').toUpperCase());
      const planned = Number(project.planned || 0);
      const actual = Number(project.actual || 0);
      const variance = actual - planned;
      const util = mh?.budgetedHours ? mh.utilizationPct : mh?.consumedPct || 0;
      return {
        project,
        stage: normalizeStage(project.phase || '', project.status || ''),
        planned,
        actual,
        variance,
        hours: mh?.pmApprovedHours || 0,
        util,
        spi: Number(project.schedulePerformance || 0),
        cpi: Number(project.costPerformance || 0),
      };
    });
  }, [projects, mhByCode]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = enriched.filter(({ project, stage }) => {
      if (statusFilter !== 'all') {
        const status = String(project.status || '').toLowerCase();
        const health = String(project.health || '').toLowerCase();
        if (statusFilter === 'at-risk') {
          if (!(health === 'watch' || health === 'critical')) return false;
        } else if (statusFilter === 'on-hold') {
          if (!/hold|suspend/i.test(status)) return false;
        } else if (statusFilter === 'completed') {
          if (!/complet|closed|closeout/i.test(status)) return false;
        } else if (statusFilter === 'active') {
          if (/hold|suspend|complet|closed|cancel|draft|archiv/i.test(status)) return false;
        } else if (!status.includes(statusFilter.toLowerCase()) && !stage.toLowerCase().includes(statusFilter.toLowerCase())) {
          return false;
        }
      }
      if (clientFilter !== 'all' && project.client !== clientFilter) return false;
      if (managerFilter !== 'all' && project.manager !== managerFilter) return false;
      if (typeFilter !== 'all' && (project.projectType || project.phase) !== typeFilter) return false;
      if (locationFilter !== 'all' && project.location !== locationFilter) return false;
      if (!q) return true;
      return [project.code, project.name, project.client, project.manager, project.location, stage]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });

    rows = [...rows].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'code') return a.project.code.localeCompare(b.project.code) * dir;
      if (sortKey === 'name') return a.project.name.localeCompare(b.project.name) * dir;
      if (sortKey === 'value') return (Number(a.project.contractValue || 0) - Number(b.project.contractValue || 0)) * dir;
      if (sortKey === 'actual') return (a.actual - b.actual) * dir;
      return (a.hours - b.hours) * dir;
    });
    return rows;
  }, [enriched, query, statusFilter, clientFilter, managerFilter, typeFilter, locationFilter, sortKey, sortDir]);

  useEffect(() => {
    setPage(1);
  }, [query, statusFilter, clientFilter, managerFilter, typeFilter, locationFilter, pageSize, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const from = filtered.length ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(filtered.length, page * pageSize);

  const kpis = useMemo(() => {
    const total = projects.length;
    const active = projects.filter((p) => !/hold|suspend|complet|closed|cancel|draft|archiv/i.test(p.status)).length;
    const onHold = projects.filter((p) => /hold|suspend/i.test(p.status)).length;
    const completed = projects.filter((p) => /complet|closed|closeout/i.test(p.status)).length;
    const atRisk = projects.filter((p) => p.health === 'Watch' || p.health === 'Critical').length;
    const value = projects.reduce((sum, p) => sum + Number(p.contractValue || 0), 0);
    const share = (n: number) => (total ? Math.round((n / total) * 100) : 0);
    return [
      { label: 'Total Projects', value: String(total), meta: `${filtered.length} in view`, icon: FolderKanban, tone: 'blue' as const, bar: null as number | null },
      { label: 'Active Projects', value: String(active), meta: `${share(active)}%`, icon: Play, tone: 'green' as const, bar: share(active) },
      { label: 'On Hold', value: String(onHold), meta: `${share(onHold)}%`, icon: Pause, tone: 'amber' as const, bar: share(onHold) },
      { label: 'Completed', value: String(completed), meta: `${share(completed)}%`, icon: CheckCircle2, tone: 'green' as const, bar: share(completed) },
      { label: 'At Risk', value: String(atRisk), meta: `${share(atRisk)}%`, icon: TriangleAlert, tone: 'red' as const, bar: share(atRisk) },
      { label: 'Total Contract Value', value: compactNaira(value), meta: `${total} contracts`, icon: Wallet, tone: 'blue' as const, bar: null as number | null },
    ];
  }, [projects, filtered.length]);

  const openCreate = () => {
    if (!identity?.canCreateProjects) return;
    setModalMode('create');
    setSelected(null);
    setModalOpen(true);
  };

  const openEdit = (project: Project) => {
    if (!identity?.canEditProjects) return;
    setModalMode('edit');
    setSelected(project);
    setModalOpen(true);
    setMenuId(null);
  };

  const onDelete = async (project: Project) => {
    if (!identity?.canDeleteProjects) return;
    const confirmed = window.confirm(
      `Delete (archive) project ${project.code} — ${project.name}?\n\nOnly Global Super Administrator can perform this action.`,
    );
    if (!confirmed) return;
    setDeletingId(project.id);
    setError('');
    setMenuId(null);
    try {
      const res = await fetch(`/api/projects-engineering/projects/${encodeURIComponent(project.id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Delete failed');
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete project');
    } finally {
      setDeletingId(null);
    }
  };

  const toggleAll = () => {
    if (pageRows.every((row) => selectedIds.has(row.project.id))) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const row of pageRows) next.delete(row.project.id);
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const row of pageRows) next.add(row.project.id);
        return next;
      });
    }
  };

  const exportCsv = () => {
    const header = [
      'Code',
      'Name',
      'Client',
      'Manager',
      'Stage',
      'ContractValue',
      'Planned%',
      'Actual%',
      'Variance%',
      'ManHours',
      'MHUtil%',
      'SPI',
      'CPI',
      'Health',
      'Status',
    ];
    const lines = filtered.map(({ project, stage, planned, actual, variance, hours: h, util, spi, cpi }) =>
      [
        project.code,
        project.name,
        project.client,
        project.manager,
        stage,
        project.contractValue,
        planned.toFixed(1),
        actual.toFixed(1),
        variance.toFixed(1),
        h.toFixed(1),
        util.toFixed(1),
        spi.toFixed(2),
        cpi.toFixed(2),
        project.health,
        project.status,
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(','),
    );
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dle-projects-register-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="prr">
      <div className="prr-crumb">
        <Link href="/projects-engineering">Projects &amp; Engineering</Link>
        <span>›</span>
        <strong>Projects</strong>
      </div>

      <div className="prr-title">
        <div>
          <h1>Projects</h1>
          <p>Enterprise project register from DLE_Enterprise. Create, view and manage all projects.</p>
        </div>
        <div className="prr-actions">
          <button type="button" onClick={exportCsv}>
            <Download size={15} /> Export
          </button>
          <button type="button" className="square" aria-label="More">
            <MoreHorizontal size={18} />
          </button>
          {identity?.canCreateProjects ? (
            <button type="button" className="primary" onClick={openCreate}>
              <Plus size={17} /> Create Project
            </button>
          ) : null}
        </div>
      </div>

      {error ? <div className="prr-banner error">{error}</div> : null}
      {loading ? <div className="prr-banner">Loading live projects from DLE_Enterprise…</div> : null}

      <div className="prr-kpis">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div className="prr-kpi" key={kpi.label}>
              <div className={`prr-kicon ${kpi.tone}`}>
                <Icon size={20} />
              </div>
              <div>
                <label>{kpi.label}</label>
                <div className="prr-kv">
                  {kpi.value}
                  {kpi.bar !== null ? <em>{kpi.meta}</em> : null}
                </div>
                {kpi.bar === null ? <small>{kpi.meta}</small> : null}
                {kpi.bar !== null ? (
                  <div className="prr-mini">
                    <i style={{ width: `${kpi.bar}%` }} />
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="prr-filters">
        <div className="prr-search">
          <Search size={16} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search project code, name, client, manager..."
            aria-label="Search projects"
          />
        </div>
        <label className="prr-select">
          <small>Status</small>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="on-hold">On Hold</option>
            <option value="completed">Completed</option>
            <option value="at-risk">At Risk</option>
          </select>
        </label>
        <label className="prr-select">
          <small>Client</small>
          <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
            <option value="all">All Clients</option>
            {clients.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="prr-select">
          <small>Project Manager</small>
          <select value={managerFilter} onChange={(e) => setManagerFilter(e.target.value)}>
            <option value="all">All Managers</option>
            {managers.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="prr-select">
          <small>Project Type</small>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="all">All Types</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="prr-select">
          <small>Location</small>
          <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)}>
            <option value="all">All Locations</option>
            {locations.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="prr-more"
          onClick={() => {
            setStatusFilter('all');
            setClientFilter('all');
            setManagerFilter('all');
            setTypeFilter('all');
            setLocationFilter('all');
            setQuery('');
          }}
        >
          <SlidersHorizontal size={15} />
          {activeFilters ? `Clear Filters` : 'More Filters'}
          {activeFilters ? <b>{activeFilters}</b> : null}
        </button>
      </div>

      <div className="prr-register">
        <div className="prr-tools">
          <div className="prr-views">
            <button type="button" className={`view ${view === 'list' ? 'active' : ''}`} onClick={() => setView('list')}>
              <List size={15} /> List View
            </button>
            <button type="button" className={`view ${view === 'card' ? 'active' : ''}`} onClick={() => setView('card')}>
              <LayoutGrid size={15} /> Card View
            </button>
          </div>
          <div className="prr-toolright">
            <button type="button">
              <Bookmark size={15} /> Saved Views
            </button>
            <button type="button">
              <Columns3 size={15} /> Columns
            </button>
            <button
              type="button"
              onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
            >
              <ArrowUpDown size={15} /> Sort by
            </button>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
              aria-label="Sort field"
            >
              <option value="code">Project Code (A-Z)</option>
              <option value="name">Project Name</option>
              <option value="value">Contract Value</option>
              <option value="actual">Actual %</option>
              <option value="hours">Man-Hours</option>
            </select>
            <span>
              Showing {from}–{to} of {filtered.length}
            </span>
            <button type="button" className="pg" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              <ChevronLeft size={15} />
            </button>
            <button
              type="button"
              className="pg"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>

        {!loading && !filtered.length ? (
          <div className="prr-empty">
            <h4>No projects match this view</h4>
            <p>
              {identity?.canCreateProjects
                ? 'Clear filters or create a project in DLE_Enterprise.'
                : 'Ask IT to create projects and assign you as Project Manager.'}
            </p>
          </div>
        ) : view === 'card' ? (
          <div className="prr-cards">
            {pageRows.map(({ project, stage, planned, actual, variance, hours: h, util, spi, cpi }) => (
              <article key={project.id} className="prr-card">
                <header>
                  <span className="prr-thumb">{project.code.slice(0, 2)}</span>
                  <div>
                    <b>{project.code}</b>
                    <small>{project.name}</small>
                  </div>
                </header>
                <div className="prr-card-grid">
                  <div>
                    <small>Client</small>
                    <strong>{project.client || '—'}</strong>
                  </div>
                  <div>
                    <small>Manager</small>
                    <strong>{project.manager || '—'}</strong>
                  </div>
                  <div>
                    <small>Value</small>
                    <strong>{compactNaira(Number(project.contractValue || 0))}</strong>
                  </div>
                  <div>
                    <small>Progress</small>
                    <strong>
                      {pct(actual)} <em>({pct(variance)} var)</em>
                    </strong>
                  </div>
                  <div>
                    <small>Man-Hours</small>
                    <strong>{hours(h)}</strong>
                  </div>
                  <div>
                    <small>SPI / CPI</small>
                    <strong>
                      {spi.toFixed(2)} / {cpi.toFixed(2)}
                    </strong>
                  </div>
                </div>
                <footer>
                  <span className={`prr-stage ${stageClass(stage)}`}>{stage}</span>
                  <span className={`prr-badge ${project.health === 'Healthy' ? 'healthy' : project.health === 'Watch' ? 'risk' : 'critical'}`}>
                    ● {project.health === 'Watch' ? 'At Risk' : project.health}
                  </span>
                  <Link href={`/projects-engineering/projects/${project.id}/overview`}>Open</Link>
                </footer>
              </article>
            ))}
          </div>
        ) : (
          <div className="prr-table-wrap">
            <table className="prr-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={pageRows.length > 0 && pageRows.every((row) => selectedIds.has(row.project.id))}
                      onChange={toggleAll}
                      aria-label="Select all on page"
                    />
                  </th>
                  <th>Project Code</th>
                  <th>Project Name</th>
                  <th>Client</th>
                  <th>Project Manager</th>
                  <th>Stage</th>
                  <th>Contract Value</th>
                  <th>Planned %</th>
                  <th>Actual %</th>
                  <th>Variance</th>
                  <th>Man-Hours</th>
                  <th>MH Util.</th>
                  <th>SPI</th>
                  <th>CPI</th>
                  <th>Health</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map(({ project, stage, planned, actual, variance, hours: h, util, spi, cpi }, index) => (
                  <tr key={project.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(project.id)}
                        onChange={() => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(project.id)) next.delete(project.id);
                            else next.add(project.id);
                            return next;
                          });
                        }}
                        aria-label={`Select ${project.code}`}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="prr-codecell"
                        onClick={() => router.push(`/projects-engineering/projects/${project.id}/overview`)}
                      >
                        <span className="prr-thumb">{index + 1 + (page - 1) * pageSize}</span>
                        <b>{project.code}</b>
                      </button>
                    </td>
                    <td>
                      <strong>{project.name}</strong>
                    </td>
                    <td>{project.client || '—'}</td>
                    <td>
                      <div className="prr-mgr">
                        <span>{initials(project.manager || '')}</span>
                        {project.manager || '—'}
                      </div>
                    </td>
                    <td>
                      <span className={`prr-stage ${stageClass(stage)}`}>{stage}</span>
                    </td>
                    <td>
                      <b>{money(Number(project.contractValue || 0), project.currency || 'NGN')}</b>
                    </td>
                    <td>
                      <MetricBar value={planned} blue />
                    </td>
                    <td>
                      <MetricBar value={actual} />
                    </td>
                    <td>
                      <b className={variance < 0 ? 'negative' : variance > 0 ? 'positive' : ''}>{pct(variance)}</b>
                    </td>
                    <td>{hours(h).replace(' hrs', '')}</td>
                    <td>
                      <span className={`prr-util ${util < 60 ? 'bad' : util < 70 ? 'warn' : 'good'}`}>{pct(util)}</span>
                    </td>
                    <td>{spi.toFixed(2)}</td>
                    <td>{cpi.toFixed(2)}</td>
                    <td>
                      <span className={`prr-badge ${project.health === 'Healthy' ? 'healthy' : project.health === 'Watch' ? 'risk' : 'critical'}`}>
                        ● {project.health === 'Watch' ? 'At Risk' : project.health}
                      </span>
                    </td>
                    <td>
                      <span className={`prr-badge ${/hold|suspend/i.test(project.status) ? 'hold' : 'healthy'}`}>
                        ● {project.status || '—'}
                      </span>
                    </td>
                    <td className="prr-actions-cell">
                      <button
                        type="button"
                        className="prr-more-btn"
                        aria-label="Row actions"
                        onClick={() => setMenuId((id) => (id === project.id ? null : project.id))}
                      >
                        <MoreHorizontal size={17} />
                      </button>
                      {menuId === project.id ? (
                        <div className="prr-menu">
                          <Link href={`/projects-engineering/projects/${project.id}/overview`} onClick={() => setMenuId(null)}>
                            Open workspace
                          </Link>
                          <Link href={`/projects-engineering/projects/${project.id}/resources`} onClick={() => setMenuId(null)}>
                            Man hours
                          </Link>
                          {identity?.canEditProjects ? (
                            <button type="button" onClick={() => openEdit(project)}>
                              Edit
                            </button>
                          ) : null}
                          {identity?.canDeleteProjects ? (
                            <button type="button" className="danger" onClick={() => void onDelete(project)} disabled={deletingId === project.id}>
                              {deletingId === project.id ? 'Deleting…' : 'Delete'}
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="prr-footer">
          <span>
            Showing {from}–{to} of {filtered.length} projects
          </span>
          <div className="prr-pager">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              ‹
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .slice(0, 5)
              .map((n) => (
                <button key={n} type="button" className={n === page ? 'on' : ''} onClick={() => setPage(n)}>
                  {n}
                </button>
              ))}
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              ›
            </button>
            <span>Rows per page</span>
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} aria-label="Rows per page">
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <ProjectFormModal
        open={modalOpen}
        mode={modalMode}
        project={selected}
        onClose={() => {
          setModalOpen(false);
          if (searchParams.get('action') === 'create') {
            router.replace('/projects-engineering/projects');
          }
        }}
        onSaved={async () => {
          await load(true);
        }}
      />
    </div>
  );
}
