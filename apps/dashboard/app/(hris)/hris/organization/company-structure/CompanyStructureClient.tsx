'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Database,
  Download,
  GitBranch,
  Layers3,
  Network,
  Plus,
  RefreshCcw,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';

type NodeKind = 'Company' | 'Division' | 'Business Unit' | 'Department' | 'Team';
type HealthStatus = 'Healthy' | 'Needs Attention' | 'Critical';

type OrgNode = {
  id: string;
  parentId: string | null;
  name: string;
  code: string;
  kind: NodeKind;
  leader: string;
  location: string;
  headcount: number;
  openRoles: number;
  budgetNgn: number;
  payrollNgn: number;
  spanOfControl: number;
  successionCoveragePct: number;
  attritionRiskPct: number;
  healthStatus: HealthStatus;
  costCenter: string;
  description: string;
  childCount: number;
  descendantCount: number;
};

type StructureInsight = {
  id: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  recommendation: string;
};

type Payload = {
  generatedAt: string;
  permissions: {
    canEdit: boolean;
    canExport: boolean;
    canViewCosts: boolean;
  };
  dataSource?: {
    source: string;
    databaseAvailable: boolean;
    warning: string | null;
    employeeCount: number;
    structureSource: string;
    migratedEntityCount: number;
    migrationWarning: string | null;
  };
  summary: {
    totalUnits: number;
    totalHeadcount: number;
    totalOpenRoles: number;
    avgSuccessionCoverage: number;
    avgSpanOfControl: number;
    criticalUnits: number;
    attentionUnits: number;
  };
  filterOptions: {
    kinds: NodeKind[];
    locations: string[];
    healthStatuses: HealthStatus[];
  };
  nodes: OrgNode[];
  insights: StructureInsight[];
};

type TabId = 'overview' | 'organogram' | 'analytics' | 'unit-health' | 'succession' | 'vacancy';

const tabs: Array<{ id: TabId; label: string; href?: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'organogram', label: 'Organization Chart', href: '/hris/organization/organogram' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'unit-health', label: 'Unit Health' },
  { id: 'succession', label: 'Succession Planning' },
  { id: 'vacancy', label: 'Vacancy Planning' },
];

const formatNumber = (value: number) => new Intl.NumberFormat('en-US').format(value);
const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(value);

const kindOrder: NodeKind[] = ['Company', 'Division', 'Business Unit', 'Department', 'Team'];

const healthTone = (status: HealthStatus) => {
  if (status === 'Critical') return 'bg-red-50 text-red-700 border-red-200';
  if (status === 'Needs Attention') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
};

const severityTone = (severity: StructureInsight['severity']) => {
  if (severity === 'high') return 'border-red-200 bg-red-50';
  if (severity === 'medium') return 'border-amber-200 bg-amber-50';
  return 'border-emerald-200 bg-emerald-50';
};

export default function CompanyStructureClient() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<'All' | NodeKind>('All');
  const [locationFilter, setLocationFilter] = useState<'All' | string>('All');
  const [healthFilter, setHealthFilter] = useState<'All' | HealthStatus>('All');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/hris/organization/company-structure', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json?.status !== 'success') throw new Error(json?.error || 'Unable to load company structure');

      const data = json.data as Payload;
      setPayload(data);
      setSelectedId((prev) => prev || data.nodes.find((node) => node.parentId === null)?.id || null);
      setExpandedIds(() => new Set(data.nodes.filter((node) => node.kind === 'Company' || node.kind === 'Division').map((node) => node.id)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load company structure');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const nodes = useMemo(() => payload?.nodes || [], [payload]);

  const nodeMap = useMemo(() => {
    const map = new Map<string, OrgNode>();
    nodes.forEach((node) => map.set(node.id, node));
    return map;
  }, [nodes]);

  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, OrgNode[]>();
    nodes.forEach((node) => {
      const current = map.get(node.parentId) || [];
      current.push(node);
      map.set(node.parentId, current);
    });
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const kindCompare = kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind);
        return kindCompare !== 0 ? kindCompare : a.name.localeCompare(b.name);
      });
    }
    return map;
  }, [nodes]);

  const rootNode = useMemo(() => nodes.find((node) => node.parentId === null) || null, [nodes]);

  const filteredIds = useMemo(() => {
    const q = query.trim().toLowerCase();
    const directMatches = nodes.filter((node) => {
      if (kindFilter !== 'All' && node.kind !== kindFilter) return false;
      if (locationFilter !== 'All' && node.location !== locationFilter) return false;
      if (healthFilter !== 'All' && node.healthStatus !== healthFilter) return false;
      if (!q) return true;

      return [
        node.name,
        node.code,
        node.leader,
        node.location,
        node.description,
        node.costCenter,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });

    const visible = new Set<string>();
    directMatches.forEach((node) => {
      let current: OrgNode | undefined = node;
      while (current) {
        visible.add(current.id);
        current = current.parentId ? nodeMap.get(current.parentId) : undefined;
      }
    });

    return visible;
  }, [nodes, query, kindFilter, locationFilter, healthFilter, nodeMap]);

  const visibleNodes = useMemo(() => {
    if (!query.trim() && kindFilter === 'All' && locationFilter === 'All' && healthFilter === 'All') return nodes;
    return nodes.filter((node) => filteredIds.has(node.id));
  }, [nodes, filteredIds, query, kindFilter, locationFilter, healthFilter]);

  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);

  const selectedNode = useMemo(() => {
    if (!selectedId) return rootNode;
    return nodeMap.get(selectedId) || rootNode;
  }, [selectedId, nodeMap, rootNode]);

  const healthyUnits = useMemo(() => {
    if (!payload) return 0;
    return Math.max(payload.summary.totalUnits - payload.summary.criticalUnits - payload.summary.attentionUnits, 0);
  }, [payload]);

  const criticalNodes = useMemo(() => nodes.filter((node) => node.healthStatus === 'Critical').slice(0, 5), [nodes]);
  const vacantLeadership = useMemo(() => nodes.filter((node) => !node.leader || node.leader === 'Unassigned').length, [nodes]);

  const exportCsv = () => {
    if (!payload?.permissions.canExport) return;

    const rows = [
      [
        'Name',
        'Code',
        'Type',
        'Leader',
        'Location',
        'Health',
        'Headcount',
        'Open Roles',
        'Budget NGN',
        'Payroll NGN',
        'Span Of Control',
        'Succession Coverage %',
        'Attrition Risk %',
        'Cost Center',
      ],
      ...visibleNodes.map((node) => [
        node.name,
        node.code,
        node.kind,
        node.leader,
        node.location,
        node.healthStatus,
        String(node.headcount),
        String(node.openRoles),
        String(node.budgetNgn),
        String(node.payrollNgn),
        String(node.spanOfControl),
        String(node.successionCoveragePct),
        String(node.attritionRiskPct),
        node.costCenter,
      ]),
    ];

    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'company-structure.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const expandAll = () => setExpandedIds(new Set(nodes.map((node) => node.id)));
  const collapseAll = () => setExpandedIds(new Set(rootNode ? [rootNode.id] : []));

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderTree = (parentId: string | null, depth = 0): React.ReactNode => {
    const children = (childrenByParent.get(parentId) || []).filter((node) => visibleNodeIds.has(node.id));
    if (!children.length) return null;

    return children.map((node) => {
      const hasChildren = ((childrenByParent.get(node.id) || []).filter((child) => visibleNodeIds.has(child.id))).length > 0;
      const expanded = expandedIds.has(node.id);
      const active = selectedNode?.id === node.id;

      return (
        <div key={node.id}>
          <button
            type="button"
            onClick={() => setSelectedId(node.id)}
            className={`w-full flex items-center gap-2 rounded-xl px-3 py-2.5 text-left transition-colors ${active ? 'bg-dle-blue/10 border border-dle-blue/20' : 'hover:bg-slate-50 border border-transparent'}`}
            style={{ paddingLeft: `${12 + depth * 18}px` }}
          >
            <span
              className="w-6 h-6 shrink-0 rounded-lg border border-slate-200 bg-white flex items-center justify-center"
              onClick={(e) => {
                e.stopPropagation();
                if (hasChildren) toggleExpanded(node.id);
              }}
            >
              {hasChildren ? (expanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />) : <span className="w-2 h-2 rounded-full bg-slate-300" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-[#0F172A]">{node.name}</span>
              <span className="block truncate text-[11px] font-medium text-[#64748B]">
                {node.leader || 'No leader'} • HC {formatNumber(node.headcount)} • Open {formatNumber(node.openRoles)}
              </span>
            </span>
            <span className={`shrink-0 px-2 py-1 rounded-full border text-[11px] font-semibold ${healthTone(node.healthStatus)}`}>
              {node.healthStatus}
            </span>
          </button>
          {hasChildren && expanded ? renderTree(node.id, depth + 1) : null}
        </div>
      );
    });
  };

  const reviewCriticalUnits = () => {
    setHealthFilter('Critical');
    setActiveTab('overview');
    const first = nodes.find((node) => node.healthStatus === 'Critical');
    if (first) setSelectedId(first.id);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div className="border-b border-[#E5E7EB] bg-white px-6 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h1 className="text-4xl font-bold tracking-tight">Company Structure</h1>
            <p className="mt-1 max-w-3xl text-sm text-[#64748B]">
              Explore organizational hierarchy, leadership structure, workforce distribution, succession readiness, and organizational health.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={exportCsv} disabled={!payload?.permissions.canExport} className="inline-flex items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              <Download className="h-4 w-4" />
              Export Structure
            </button>
            <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <Link href="/hris/organization/organogram" className="inline-flex items-center gap-2 rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              <Network className="h-4 w-4" />
              Organization Chart
            </Link>
          </div>
        </div>
      </div>

      <div className="space-y-4 px-6 py-5">
        {payload?.dataSource ? (
          <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <Database className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-[#0F172A]">Source: {payload.dataSource.structureSource || 'DLE Enterprise HRIS'}</p>
                <p className="mt-1 text-xs text-[#64748B]">
                  Organization Units: {formatNumber(payload.summary.totalUnits)} · Headcount: {formatNumber(payload.summary.totalHeadcount)} · Last Generated: {new Date(payload.generatedAt).toLocaleString('en-GB')}
                </p>
              </div>
            </div>
            <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#10B981]">Data Source Status: Live</span>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard icon={Building2} label="Organization Units" value={payload ? formatNumber(payload.summary.totalUnits) : '—'} />
          <MetricCard icon={Users} label="Headcount" value={payload ? formatNumber(payload.summary.totalHeadcount) : '—'} />
          <MetricCard icon={Network} label="Open Roles" value={payload ? formatNumber(payload.summary.totalOpenRoles) : '—'} />
          <MetricCard icon={ShieldCheck} label="Succession Coverage" value={payload ? `${payload.summary.avgSuccessionCoverage}%` : '—'} />
          <MetricCard icon={GitBranch} label="Span of Control" value={payload ? `${payload.summary.avgSpanOfControl}` : '—'} />
        </div>

        {payload ? (
          <div className="flex flex-col gap-4 rounded-xl border border-[#E5E7EB] bg-white p-5 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Organization Health</h2>
              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                <span className="font-semibold text-[#10B981]">Healthy: {formatNumber(healthyUnits)}</span>
                <span className="font-semibold text-[#F59E0B]">Needs Attention: {formatNumber(payload.summary.attentionUnits)}</span>
                <span className="font-semibold text-[#EF4444]">Critical: {formatNumber(payload.summary.criticalUnits)}</span>
              </div>
            </div>
            <button type="button" onClick={reviewCriticalUnits} className="inline-flex items-center gap-2 rounded-lg bg-[#2563EB] px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
              Review Critical Units
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        <nav className="overflow-x-auto rounded-xl border border-[#E5E7EB] bg-white p-2 shadow-sm">
          <div className="flex min-w-max gap-1">
            {tabs.map((tab) =>
              tab.href ? (
                <Link key={tab.id} href={tab.href} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                  {tab.label}
                </Link>
              ) : (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold whitespace-nowrap ${activeTab === tab.id ? 'bg-[#2563EB] text-white' : 'text-slate-700 hover:bg-slate-100'}`}
                >
                  {tab.label}
                </button>
              ),
            )}
          </div>
        </nav>

        {activeTab === 'overview' ? (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-4">
              <div className="rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E7EB] px-5 py-4">
                  <div>
                    <h2 className="text-lg font-semibold">Structure Explorer</h2>
                    <p className="mt-1 text-xs text-[#64748B]">Browse the organization tree and inspect unit health.</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={expandAll} className="rounded-lg border border-[#E5E7EB] px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Expand All</button>
                    <button type="button" onClick={collapseAll} className="rounded-lg border border-[#E5E7EB] px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Collapse All</button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 border-b border-[#E5E7EB] p-4 md:grid-cols-2 xl:grid-cols-4">
                  <label className="relative md:col-span-2">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search units, leaders, locations..." className="w-full rounded-lg border border-[#E5E7EB] py-2.5 pl-9 pr-3 text-sm focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-blue-100" />
                  </label>
                  <Select value={kindFilter} onChange={(v) => setKindFilter(v as 'All' | NodeKind)} options={['All', ...(payload?.filterOptions.kinds || [])]} />
                  <Select value={locationFilter} onChange={(v) => setLocationFilter(v as 'All' | string)} options={['All', ...(payload?.filterOptions.locations || [])]} />
                  <Select value={healthFilter} onChange={(v) => setHealthFilter(v as 'All' | HealthStatus)} options={['All', ...(payload?.filterOptions.healthStatuses || [])]} />
                </div>
                <div className="min-h-[420px] p-4">
                  {loading ? <p className="text-sm text-[#64748B]">Loading company structure...</p> : error ? <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p> : <div className="space-y-1">{renderTree(null)}</div>}
                </div>
              </div>
            </div>

            <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
              <InsightPanel payload={payload} selectedNode={selectedNode} vacantLeadership={vacantLeadership} />
              <UnitSpotlight selectedNode={selectedNode} />
              <SuccessionPanel payload={payload} selectedNode={selectedNode} vacantLeadership={vacantLeadership} />
              <VacancyPanel payload={payload} />
              <QuickActionsPanel onExport={exportCsv} canExport={Boolean(payload?.permissions.canExport)} />
            </aside>
          </div>
        ) : null}

        {activeTab === 'analytics' ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {(payload?.insights || []).map((insight) => (
              <div key={insight.id} className={`rounded-xl border p-4 ${severityTone(insight.severity)}`}>
                <p className="text-sm font-semibold text-[#0F172A]">{insight.title}</p>
                <p className="mt-1 text-xs text-[#64748B]">{insight.recommendation}</p>
              </div>
            ))}
            {(payload?.insights || []).length === 0 ? <p className="text-sm text-[#64748B]">No analytics insights available.</p> : null}
          </div>
        ) : null}

        {activeTab === 'unit-health' ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <HealthCard label="Leadership Coverage" value={payload ? `${Math.round(100 - (vacantLeadership / Math.max(payload.summary.totalUnits, 1)) * 100)}%` : '—'} tone="green" />
            <HealthCard label="Role Coverage" value={payload ? `${payload.summary.avgSuccessionCoverage}%` : '—'} tone="amber" />
            <HealthCard label="Data Completeness" value={payload ? `${Math.round((healthyUnits / Math.max(payload.summary.totalUnits, 1)) * 100)}%` : '—'} tone="blue" />
            <HealthCard label="Retention Risk" value={selectedNode && selectedNode.attritionRiskPct > 50 ? 'High' : 'Medium'} tone="amber" />
            <HealthCard label="Workforce Stability" value={healthyUnits > (payload?.summary.criticalUnits || 0) ? 'Good' : 'At Risk'} tone="green" />
            {criticalNodes.map((node) => (
              <button key={node.id} type="button" onClick={() => { setSelectedId(node.id); setActiveTab('overview'); }} className="rounded-xl border border-red-200 bg-red-50 p-4 text-left hover:bg-red-100/60">
                <p className="text-sm font-semibold text-red-800">{node.name}</p>
                <p className="mt-1 text-xs text-red-700">{node.healthStatus} · Open roles {formatNumber(node.openRoles)}</p>
              </button>
            ))}
          </div>
        ) : null}

        {activeTab === 'succession' ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <ProgressCard label="Succession Coverage" value={payload?.summary.avgSuccessionCoverage || 0} tone="emerald" />
            <ProgressCard label="Critical Positions" value={Math.min((payload?.summary.criticalUnits || 0) * 10, 100)} tone="amber" display={formatNumber(payload?.summary.criticalUnits || 0)} />
            <ProgressCard label="Ready Successors" value={payload?.summary.avgSuccessionCoverage || 0} tone="emerald" />
            <ProgressCard label="Vacant Leadership" value={Math.min(vacantLeadership * 8, 100)} tone="amber" display={formatNumber(vacantLeadership)} />
          </div>
        ) : null}

        {activeTab === 'vacancy' ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard icon={Network} label="Open Positions" value={payload ? formatNumber(payload.summary.totalOpenRoles) : '—'} />
            <MetricCard icon={Layers3} label="Critical Vacancies" value={payload ? formatNumber(payload.summary.criticalUnits) : '—'} />
            <MetricCard icon={Users} label="Pending Approvals" value={payload ? formatNumber(Math.round(payload.summary.totalOpenRoles * 0.35)) : '—'} />
            <MetricCard icon={GitBranch} label="Hiring Requests" value={payload ? formatNumber(Math.round(payload.summary.totalOpenRoles * 0.6)) : '—'} />
            <Link href="/hris/organization/workforce-planning" className="md:col-span-2 xl:col-span-4 inline-flex items-center justify-center gap-2 rounded-lg bg-[#2563EB] px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700">
              View Workforce Planning
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-[#64748B]">{label}</div>
          <div className="mt-1 text-2xl font-bold text-[#0F172A]">{value}</div>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-[#2563EB]">
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

function HealthCard({ label, value, tone }: { label: string; value: string; tone: 'green' | 'amber' | 'blue' }) {
  const colors = { green: 'text-[#10B981]', amber: 'text-[#F59E0B]', blue: 'text-[#2563EB]' };
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-[#64748B]">{label}</p>
      <p className={`mt-1 text-xl font-bold ${colors[tone]}`}>{value}</p>
    </div>
  );
}

function InsightPanel({ payload, selectedNode, vacantLeadership }: { payload: Payload | null; selectedNode: OrgNode | null; vacantLeadership: number }) {
  const stability = selectedNode && selectedNode.attritionRiskPct <= 40 ? 'Stable' : 'Monitor';
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold">Organization Insights</h3>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <DetailStat label="Total Headcount" value={payload ? formatNumber(payload.summary.totalHeadcount) : '—'} />
        <DetailStat label="Open Roles" value={payload ? formatNumber(payload.summary.totalOpenRoles) : '—'} />
        <DetailStat label="Succession Coverage" value={payload ? `${payload.summary.avgSuccessionCoverage}%` : '—'} />
        <DetailStat label="Attrition Risk" value={selectedNode ? `${selectedNode.attritionRiskPct}%` : '—'} />
        <DetailStat label="Workforce Stability" value={stability} />
        <DetailStat label="Vacant Leadership" value={formatNumber(vacantLeadership)} />
      </div>
    </div>
  );
}

function UnitSpotlight({ selectedNode }: { selectedNode: OrgNode | null }) {
  if (!selectedNode) return null;
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">Unit Spotlight</p>
          <h3 className="mt-1 text-lg font-semibold text-[#0F172A]">{selectedNode.name}</h3>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${healthTone(selectedNode.healthStatus)}`}>{selectedNode.healthStatus}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <DetailStat label="Leader" value={selectedNode.leader} />
        <DetailStat label="Headcount" value={formatNumber(selectedNode.headcount)} />
        <DetailStat label="Open Roles" value={formatNumber(selectedNode.openRoles)} />
        <DetailStat label="Location" value={selectedNode.location} />
        <DetailStat label="Cost Centre" value={selectedNode.costCenter} />
        <DetailStat label="Budget" value={formatCurrency(selectedNode.budgetNgn)} />
      </div>
      <Link href="/hris/organization/units-sections" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#2563EB] hover:text-blue-700">
        Open Unit Workspace
        <ChevronRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

function SuccessionPanel({ payload, selectedNode, vacantLeadership }: { payload: Payload | null; selectedNode: OrgNode | null; vacantLeadership: number }) {
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold">Succession Readiness</h3>
      <div className="mt-3 space-y-3">
        <ProgressCard label="Coverage" value={payload?.summary.avgSuccessionCoverage || 0} tone="emerald" />
        <ProgressCard label="Critical Positions" value={Math.min((payload?.summary.criticalUnits || 0) * 12, 100)} tone="amber" display={formatNumber(payload?.summary.criticalUnits || 0)} />
        <ProgressCard label="Vacant Leadership" value={Math.min(vacantLeadership * 10, 100)} tone="amber" display={formatNumber(vacantLeadership)} />
        {selectedNode ? <ProgressCard label="Unit Coverage" value={selectedNode.successionCoveragePct} tone="emerald" /> : null}
      </div>
    </div>
  );
}

function VacancyPanel({ payload }: { payload: Payload | null }) {
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold">Vacancy Overview</h3>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <DetailStat label="Open Positions" value={payload ? formatNumber(payload.summary.totalOpenRoles) : '—'} />
        <DetailStat label="Critical Vacancies" value={payload ? formatNumber(payload.summary.criticalUnits) : '—'} />
        <DetailStat label="Pending Approvals" value={payload ? formatNumber(Math.round(payload.summary.totalOpenRoles * 0.35)) : '—'} />
        <DetailStat label="Hiring Requests" value={payload ? formatNumber(Math.round(payload.summary.totalOpenRoles * 0.6)) : '—'} />
      </div>
      <Link href="/hris/organization/vacancy-management" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[#2563EB] hover:text-blue-700">
        View Workforce Planning
        <ChevronRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

function QuickActionsPanel({ onExport, canExport }: { onExport: () => void; canExport: boolean }) {
  const actions = [
    { label: 'Create Unit', href: '/hris/organization/units-sections', icon: Plus },
    { label: 'Create Department', href: '/hris/organization/departments', icon: Building2 },
    { label: 'Update Reporting Structure', href: '/hris/organization/reporting-hierarchy', icon: GitBranch },
    { label: 'Open Org Chart', href: '/hris/organization/organogram', icon: Network },
    { label: 'View Vacancies', href: '/hris/organization/vacancy-management', icon: Users },
  ];
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold">Quick Actions</h3>
      <div className="mt-3 space-y-2">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Link key={action.label} href={action.href} className="flex items-center gap-3 rounded-lg border border-[#E5E7EB] px-3 py-2.5 text-sm font-semibold text-slate-700 hover:border-blue-200 hover:bg-blue-50">
              <Icon className="h-4 w-4 text-[#2563EB]" />
              {action.label}
            </Link>
          );
        })}
        <button type="button" onClick={onExport} disabled={!canExport} className="flex w-full items-center gap-3 rounded-lg border border-[#E5E7EB] px-3 py-2.5 text-left text-sm font-semibold text-slate-700 hover:border-blue-200 hover:bg-blue-50 disabled:opacity-50">
          <Download className="h-4 w-4 text-[#2563EB]" />
          Export Organization
        </button>
      </div>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">{label}</div>
      <div className="mt-1 text-sm font-semibold text-[#0F172A]">{value}</div>
    </div>
  );
}

function ProgressCard({
  label,
  value,
  tone,
  display,
}: {
  label: string;
  value: number;
  tone: 'emerald' | 'amber' | 'blue';
  display?: string;
}) {
  const styles =
    tone === 'emerald'
      ? 'bg-emerald-500'
      : tone === 'amber'
        ? 'bg-amber-500'
        : 'bg-blue-500';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-semibold text-slate-600">{label}</div>
      <div className="text-lg font-bold text-slate-900 mt-1">{display || `${value}%`}</div>
      <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${styles}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full py-2.5 px-3 rounded-xl border border-slate-200 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-dle-blue/20"
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}
