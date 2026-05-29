'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageTemplate } from '@/components/layout/page-template';
import {
  AlertTriangle,
  Download,
  GitBranch,
  Network,
  RefreshCcw,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { HealthStatus, NodeKind, OrganogramNodeRecord, StructureInsight } from '@/lib/organization-data';

type Payload = {
  generatedAt: string;
  permissions: {
    canEdit: boolean;
    canExport: boolean;
    canViewCosts: boolean;
  };
  summary: {
    totalNodes: number;
    totalHeadcount: number;
    totalOpenRoles: number;
    avgSpanOfControl: number;
    maxDepth: number;
    rootLeaders: number;
    branchesAtRisk: number;
  };
  filterOptions: {
    kinds: NodeKind[];
    locations: string[];
    depths: number[];
    healthStatuses: HealthStatus[];
  };
  nodes: OrganogramNodeRecord[];
  insights: StructureInsight[];
};

const formatNumber = (value: number) => new Intl.NumberFormat('en-US').format(value);
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

export default function OrganogramClient() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<'All' | NodeKind>('All');
  const [locationFilter, setLocationFilter] = useState<'All' | string>('All');
  const [depthFilter, setDepthFilter] = useState<'All' | string>('All');
  const [healthFilter, setHealthFilter] = useState<'All' | HealthStatus>('All');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/hris/organization/organogram', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json?.status !== 'success') throw new Error(json?.error || 'Unable to load organogram');
      const data = json.data as Payload;
      setPayload(data);
      const root = data.nodes.find((node) => node.parentName === null) || null;
      setSelectedId((prev) => prev || root?.id || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load organogram');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const nodes = payload?.nodes || [];

  const nodeMap = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, OrganogramNodeRecord[]>();
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
      if (depthFilter !== 'All' && node.depth !== Number(depthFilter)) return false;
      if (healthFilter !== 'All' && node.healthStatus !== healthFilter) return false;
      if (!q) return true;
      return [
        node.name,
        node.code,
        node.leader,
        node.location,
        node.description,
        node.parentChain.join(' '),
        node.directChildNames.join(' '),
      ]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });

    const visible = new Set<string>();
    directMatches.forEach((node) => {
      let current: OrganogramNodeRecord | undefined = node;
      while (current) {
        visible.add(current.id);
        current = current.parentId ? nodeMap.get(current.parentId) : undefined;
      }
    });
    return visible;
  }, [nodes, query, kindFilter, locationFilter, depthFilter, healthFilter, nodeMap]);

  const visibleNodes = useMemo(() => {
    if (!query.trim() && kindFilter === 'All' && locationFilter === 'All' && depthFilter === 'All' && healthFilter === 'All') return nodes;
    return nodes.filter((node) => filteredIds.has(node.id));
  }, [nodes, filteredIds, query, kindFilter, locationFilter, depthFilter, healthFilter]);

  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);

  const selectedNode = useMemo(() => {
    if (!selectedId) return rootNode;
    return nodeMap.get(selectedId) || rootNode;
  }, [selectedId, nodeMap, rootNode]);

  const chartRoots = useMemo(() => {
    const roots = visibleNodes.filter((node) => !node.parentId || !visibleNodeIds.has(node.parentId));
    return roots.sort((a, b) => {
      const kindCompare = kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind);
      return kindCompare !== 0 ? kindCompare : a.name.localeCompare(b.name);
    });
  }, [visibleNodes, visibleNodeIds]);

  const exportCsv = () => {
    if (!payload?.permissions.canExport) return;
    const rows = [
      ['Name', 'Code', 'Kind', 'Leader', 'Leader Title', 'Location', 'Depth', 'Headcount', 'Branch Headcount', 'Open Roles', 'Branch Open Roles', 'Child Count', 'Descendant Count', 'Health'],
      ...visibleNodes.map((node) => [
        node.name,
        node.code,
        node.kind,
        node.leader,
        node.leaderTitle,
        node.location,
        String(node.depth),
        String(node.headcount),
        String(node.branchHeadcount),
        String(node.openRoles),
        String(node.branchOpenRoles),
        String(node.childCount),
        String(node.descendantCount),
        node.healthStatus,
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'organogram.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <PageTemplate
      title="Organogram"
      description="Review the organization chart by hierarchy layer, leader ownership, branch size, and reporting depth."
      breadcrumbs={[
        { label: 'HRIS', href: '/hris' },
        { label: 'Organization', href: '/hris/organization' },
        { label: 'Organogram' },
      ]}
      primaryAction={{ label: 'Refresh', onClick: () => void load(), icon: RefreshCcw }}
      secondaryAction={{ label: 'Export CSV', onClick: exportCsv, icon: Download }}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
        <MetricCard icon={Network} label="Nodes" value={payload ? formatNumber(payload.summary.totalNodes) : '—'} detail="Chart nodes in hierarchy" />
        <MetricCard icon={Users} label="Headcount" value={payload ? formatNumber(payload.summary.totalHeadcount) : '—'} detail="Direct node population" />
        <MetricCard icon={GitBranch} label="Open Roles" value={payload ? formatNumber(payload.summary.totalOpenRoles) : '—'} detail="Open roles across nodes" />
        <MetricCard icon={ShieldCheck} label="Avg Span" value={payload ? `${payload.summary.avgSpanOfControl}` : '—'} detail="Average managerial span" />
        <MetricCard icon={Network} label="Max Depth" value={payload ? `${payload.summary.maxDepth}` : '—'} detail="Deepest chart layer" />
        <MetricCard icon={AlertTriangle} label="At Risk" value={payload ? formatNumber(payload.summary.branchesAtRisk) : '—'} detail="Branches needing attention" />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
        <label className="relative xl:col-span-2">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search unit, leader, branch, or chain..."
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-dle-blue/20"
          />
        </label>
        <Select value={kindFilter} onChange={(value) => setKindFilter(value as 'All' | NodeKind)} options={['All', ...(payload?.filterOptions.kinds || [])]} labels={{ All: 'All Kinds' }} />
        <Select value={locationFilter} onChange={(value) => setLocationFilter(value as 'All' | string)} options={['All', ...(payload?.filterOptions.locations || [])]} labels={{ All: 'All Locations' }} />
        <Select value={depthFilter} onChange={(value) => setDepthFilter(value as 'All' | string)} options={['All', ...((payload?.filterOptions.depths || []).map(String))]} labels={{ All: 'All Depths' }} />
        <Select value={healthFilter} onChange={(value) => setHealthFilter(value as 'All' | HealthStatus)} options={['All', ...(payload?.filterOptions.healthStatuses || [])]} labels={{ All: 'All Health States' }} />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex flex-col xl:flex-row gap-3 xl:items-center xl:justify-between">
        <div className="text-xs text-slate-500">The organogram now renders as a connected org-chart canvas, where each parent node branches into its visible child units with direct reporting lines.</div>
        <button
          type="button"
          onClick={() => {
            setQuery('');
            setKindFilter('All');
            setLocationFilter('All');
            setDepthFilter('All');
            setHealthFilter('All');
          }}
          className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Reset Filters
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.05fr_0.95fr] gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <div className="text-sm font-bold text-slate-900">Connected Organogram Canvas</div>
            <div className="text-xs text-slate-500 mt-1">Parent-to-child reporting links connect every visible card, so the organization reads like a proper org chart instead of a lane-only flow.</div>
          </div>
          <div className="p-4 min-h-[520px] overflow-auto">
            {loading ? (
              <div className="text-sm text-slate-600 font-medium">Loading organogram...</div>
            ) : error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 font-medium">{error}</div>
            ) : chartRoots.length ? (
              <div className="min-w-max rounded-2xl border border-slate-200 bg-slate-50 p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-slate-900">Reporting Flow</div>
                    <div className="text-xs text-slate-500 mt-1">Visible nodes stay connected to their reporting origin, with ancestor paths preserved by filtering.</div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-white border border-slate-200 text-[11px] font-semibold text-slate-700">
                    Roots: {formatNumber(chartRoots.length)}
                  </span>
                </div>
                <div className="flex gap-10 items-start justify-start">
                  {chartRoots.map((node) => (
                    <OrgChartNode
                      key={node.id}
                      node={node}
                      selectedId={selectedNode?.id || null}
                      onSelect={setSelectedId}
                      childrenByParent={childrenByParent}
                      visibleNodeIds={visibleNodeIds}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-600 font-medium">No organogram nodes available.</div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="text-sm font-bold text-slate-900">Node Detail</div>
              <div className="text-xs text-slate-500 mt-1">Inspect the selected branch’s leader, structure, and aggregated chart footprint.</div>
            </div>
            <div className="p-5">
              {selectedNode ? (
                <div className="space-y-5">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold">{selectedNode.kind}</span>
                      <span className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold ${healthTone(selectedNode.healthStatus)}`}>{selectedNode.healthStatus}</span>
                      <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold">{selectedNode.managerialScope}</span>
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 mt-3">{selectedNode.name}</h3>
                    <p className="text-sm text-slate-500 mt-1">{selectedNode.description}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <DetailStat label="Leader" value={selectedNode.leader} />
                    <DetailStat label="Leader Title" value={selectedNode.leaderTitle} />
                    <DetailStat label="Code" value={selectedNode.code} />
                    <DetailStat label="Location" value={selectedNode.location} />
                    <DetailStat label="Parent" value={selectedNode.parentName || 'Top Of Chart'} />
                    <DetailStat label="Depth" value={`${selectedNode.depth}`} />
                    <DetailStat label="Headcount" value={formatNumber(selectedNode.headcount)} />
                    <DetailStat label="Branch Headcount" value={formatNumber(selectedNode.branchHeadcount)} />
                    <DetailStat label="Open Roles" value={formatNumber(selectedNode.openRoles)} />
                    <DetailStat label="Branch Open Roles" value={formatNumber(selectedNode.branchOpenRoles)} />
                    <DetailStat label="Direct Children" value={formatNumber(selectedNode.childCount)} />
                    <DetailStat label="Descendants" value={formatNumber(selectedNode.descendantCount)} />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <ProgressCard label="Succession Coverage" value={selectedNode.successionCoveragePct} tone="emerald" />
                    <ProgressCard label="Attrition Risk" value={selectedNode.attritionRiskPct} tone="amber" />
                    <ProgressCard label="Span Of Control" value={Math.min(selectedNode.spanOfControl * 10, 100)} display={`${selectedNode.spanOfControl}`} tone="blue" />
                    <ProgressCard label="Branch Critical Units" value={Math.min(selectedNode.branchCriticalUnits * 20, 100)} display={`${selectedNode.branchCriticalUnits}`} tone="red" />
                  </div>

                  <InfoListCard title="Reporting Chain" items={selectedNode.parentChain.length ? selectedNode.parentChain : ['Top of hierarchy']} />
                  <InfoListCard title="Direct Child Units" items={selectedNode.directChildNames.length ? selectedNode.directChildNames : ['No direct child units']} />
                </div>
              ) : (
                <div className="text-sm text-slate-600">Select a node to inspect its branch detail.</div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="text-sm font-bold text-slate-900">Organogram Insights</div>
              <div className="text-xs text-slate-500 mt-1">Priority observations for hierarchy depth, branch concentration, and continuity exposure.</div>
            </div>
            <div className="p-4 space-y-3">
              {(payload?.insights || []).map((insight) => (
                <div key={insight.id} className={`rounded-2xl border p-4 ${severityTone(insight.severity)}`}>
                  <div className="text-sm font-semibold text-slate-900">{insight.title}</div>
                  <div className="text-xs text-slate-600 mt-1">{insight.recommendation}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <div className="text-sm font-bold text-slate-900">Organogram Registry</div>
          <div className="text-xs text-slate-500 mt-1">Searchable table of chart nodes, layers, leaders, and branch totals.</div>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50">
              <tr>
                {['Name', 'Kind', 'Leader', 'Depth', 'Headcount', 'Branch Headcount', 'Children', 'Health'].map((header) => (
                  <th key={header} className="px-4 py-3 text-[11px] font-semibold text-slate-600 uppercase tracking-wide whitespace-nowrap">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleNodes.map((node) => (
                <tr key={node.id} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setSelectedId(node.id)}>
                  <td className="px-4 py-3">
                    <div className="text-sm font-semibold text-slate-900">{node.name}</div>
                    <div className="text-xs text-slate-500">{node.code}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">{node.kind}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{node.leader}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{node.depth}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{formatNumber(node.headcount)}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{formatNumber(node.branchHeadcount)}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{formatNumber(node.childCount)}</td>
                  <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold ${healthTone(node.healthStatus)}`}>{node.healthStatus}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PageTemplate>
  );
}

function MetricCard({ icon: Icon, label, value, detail }: { icon: any; label: string; value: string; detail: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold">{label}</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{value}</div>
          <div className="text-xs text-slate-500 mt-2">{detail}</div>
        </div>
        <span className="w-10 h-10 rounded-2xl bg-dle-blue/10 text-dle-blue flex items-center justify-center">
          <Icon className="w-5 h-5" />
        </span>
      </div>
    </div>
  );
}

function OrgChartNode({
  node,
  selectedId,
  onSelect,
  childrenByParent,
  visibleNodeIds,
}: {
  node: OrganogramNodeRecord;
  selectedId: string | null;
  onSelect: (id: string) => void;
  childrenByParent: Map<string | null, OrganogramNodeRecord[]>;
  visibleNodeIds: Set<string>;
}) {
  const children = (childrenByParent.get(node.id) || []).filter((child) => visibleNodeIds.has(child.id));
  const isSelected = selectedId === node.id;

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={() => onSelect(node.id)}
        className={`w-[260px] text-left rounded-2xl border p-4 shadow-sm transition-colors ${isSelected ? 'border-dle-blue/30 bg-dle-blue/5' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold">{node.kind}</span>
          <span className="text-[11px] font-semibold text-slate-500">L{node.depth}</span>
        </div>
        <div className="mt-3">
          <div className="text-sm font-semibold text-slate-900">{node.name}</div>
          <div className="text-xs text-slate-500 mt-1">{node.leader}</div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-600">
          <span>HC: {formatNumber(node.headcount)}</span>
          <span>Units: {formatNumber(children.length)}</span>
          <span className={`px-2 py-1 rounded-full border text-[11px] font-semibold ${healthTone(node.healthStatus)}`}>{node.healthStatus}</span>
        </div>
      </button>

      {children.length ? (
        <div className="pt-4 flex flex-col items-center">
          <div className="h-6 w-px bg-slate-300" />
          <div className="relative pt-6">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 h-6 w-px bg-slate-300" />
            {children.length > 1 ? <div className="absolute top-0 left-[130px] right-[130px] h-px bg-slate-300" /> : null}
            <div className="flex items-start justify-center gap-6">
              {children.map((child) => (
                <div key={child.id} className="relative pt-6">
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 h-6 w-px bg-slate-300" />
                  <OrgChartNode
                    node={child}
                    selectedId={selectedId}
                    onSelect={onSelect}
                    childrenByParent={childrenByParent}
                    visibleNodeIds={visibleNodeIds}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">{label}</div>
      <div className="text-sm font-semibold text-slate-900 mt-1">{value}</div>
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
  tone: 'emerald' | 'amber' | 'blue' | 'red';
  display?: string;
}) {
  const styles = tone === 'emerald' ? 'bg-emerald-500' : tone === 'amber' ? 'bg-amber-500' : tone === 'red' ? 'bg-red-500' : 'bg-blue-500';
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

function InfoListCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((item) => (
          <span key={item} className="px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-medium text-slate-700">{item}</span>
        ))}
      </div>
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
  labels,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  labels?: Record<string, string>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full py-2.5 px-3 rounded-xl border border-slate-200 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-dle-blue/20"
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {labels?.[option] || option}
        </option>
      ))}
    </select>
  );
}
