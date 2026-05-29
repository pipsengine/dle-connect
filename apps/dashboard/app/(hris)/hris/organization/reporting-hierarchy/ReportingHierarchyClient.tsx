'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageTemplate } from '@/components/layout/page-template';
import {
  AlertTriangle,
  ArrowUpRight,
  Download,
  Network,
  RefreshCcw,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { HealthStatus, ReportingHierarchyRecord, StructureInsight } from '@/lib/organization-data';

type Payload = {
  generatedAt: string;
  permissions: {
    canEdit: boolean;
    canExport: boolean;
    canViewCosts: boolean;
  };
  summary: {
    totalManagers: number;
    totalEmployees: number;
    totalOpenCriticalRoles: number;
    avgSuccessionCoverage: number;
    avgSpanOfControl: number;
    executiveLayers: number;
    rolesAtRisk: number;
    uncoveredActingRoles: number;
  };
  filterOptions: {
    layers: string[];
    businessUnits: string[];
    locations: string[];
    actingCoverage: string[];
    healthStatuses: HealthStatus[];
  };
  hierarchy: ReportingHierarchyRecord[];
  insights: StructureInsight[];
};

const formatNumber = (value: number) => new Intl.NumberFormat('en-US').format(value);

const healthTone = (status: HealthStatus) => {
  if (status === 'Critical') return 'bg-red-50 text-red-700 border-red-200';
  if (status === 'Needs Attention') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
};

const actingTone = (status: string) => {
  if (status === 'Unassigned') return 'bg-red-50 text-red-700 border-red-200';
  if (status === 'At Risk') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
};

const insightTone = (severity: StructureInsight['severity']) => {
  if (severity === 'high') return 'border-red-200 bg-red-50';
  if (severity === 'medium') return 'border-amber-200 bg-amber-50';
  return 'border-emerald-200 bg-emerald-50';
};

export default function ReportingHierarchyClient() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [layerFilter, setLayerFilter] = useState<'All' | string>('All');
  const [businessUnitFilter, setBusinessUnitFilter] = useState<'All' | string>('All');
  const [locationFilter, setLocationFilter] = useState<'All' | string>('All');
  const [actingFilter, setActingFilter] = useState<'All' | string>('All');
  const [healthFilter, setHealthFilter] = useState<'All' | HealthStatus>('All');
  const [sortBy, setSortBy] = useState<'totalReports' | 'spanOfControl' | 'successionCoveragePct' | 'attritionRiskPct'>('totalReports');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/hris/organization/reporting-hierarchy', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json?.status !== 'success') throw new Error(json?.error || 'Unable to load reporting hierarchy');
      const data = json.data as Payload;
      setPayload(data);
      setSelectedId((prev) => prev || data.hierarchy[0]?.id || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load reporting hierarchy');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const hierarchy = payload?.hierarchy || [];

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = hierarchy.filter((row) => {
      if (layerFilter !== 'All' && row.layer !== layerFilter) return false;
      if (businessUnitFilter !== 'All' && row.businessUnit !== businessUnitFilter) return false;
      if (locationFilter !== 'All' && row.location !== locationFilter) return false;
      if (actingFilter !== 'All' && row.actingCoverage !== actingFilter) return false;
      if (healthFilter !== 'All' && row.healthStatus !== healthFilter) return false;
      if (!q) return true;

      return [
        row.employeeName,
        row.jobTitle,
        row.department,
        row.businessUnit,
        row.location,
        row.managerName,
        row.responsibilityScope,
        row.primaryTeams.join(' '),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sortBy === 'spanOfControl') return b.spanOfControl - a.spanOfControl;
      if (sortBy === 'successionCoveragePct') return b.successionCoveragePct - a.successionCoveragePct;
      if (sortBy === 'attritionRiskPct') return b.attritionRiskPct - a.attritionRiskPct;
      return b.totalReports - a.totalReports;
    });
    return sorted;
  }, [hierarchy, query, layerFilter, businessUnitFilter, locationFilter, actingFilter, healthFilter, sortBy]);

  const selectedRow = useMemo(() => visibleRows.find((row) => row.id === selectedId) || visibleRows[0] || null, [visibleRows, selectedId]);

  useEffect(() => {
    if (!selectedRow && visibleRows.length) setSelectedId(visibleRows[0].id);
  }, [selectedRow, visibleRows]);

  const exportCsv = () => {
    if (!payload?.permissions.canExport) return;
    const rows = [
      ['Employee Name', 'Employee ID', 'Job Title', 'Layer', 'Manager', 'Business Unit', 'Location', 'Direct Reports', 'Indirect Reports', 'Total Reports', 'Span Of Control', 'Succession Coverage %', 'Attrition Risk %', 'Open Critical Roles', 'Approval Coverage %', 'Acting Coverage', 'Health'],
      ...visibleRows.map((row) => [
        row.employeeName,
        row.employeeId,
        row.jobTitle,
        row.layer,
        row.managerName || '—',
        row.businessUnit,
        row.location,
        String(row.directReports),
        String(row.indirectReports),
        String(row.totalReports),
        String(row.spanOfControl),
        String(row.successionCoveragePct),
        String(row.attritionRiskPct),
        String(row.openCriticalRoles),
        String(row.approvalCoveragePct),
        row.actingCoverage,
        row.healthStatus,
      ]),
    ];

    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'reporting-hierarchy.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <PageTemplate
      title="Reporting Hierarchy"
      description="Review manager layers, spans of control, acting coverage, escalation paths, and reporting-line health across the organization."
      breadcrumbs={[
        { label: 'HRIS', href: '/hris' },
        { label: 'Organization', href: '/hris/organization' },
        { label: 'Reporting Hierarchy' },
      ]}
      primaryAction={{ label: 'Refresh', onClick: () => void load(), icon: RefreshCcw }}
      secondaryAction={{ label: 'Export CSV', onClick: exportCsv, icon: Download }}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
        <MetricCard icon={Network} label="Managers" value={payload ? formatNumber(payload.summary.totalManagers) : '—'} detail="Tracked reporting owners" />
        <MetricCard icon={Users} label="Employees" value={payload ? formatNumber(payload.summary.totalEmployees) : '—'} detail="Covered reporting footprint" />
        <MetricCard icon={ArrowUpRight} label="Open Critical Roles" value={payload ? formatNumber(payload.summary.totalOpenCriticalRoles) : '—'} detail="Critical leadership gaps" />
        <MetricCard icon={ShieldCheck} label="Succession" value={payload ? `${payload.summary.avgSuccessionCoverage}%` : '—'} detail="Average leadership readiness" />
        <MetricCard icon={AlertTriangle} label="At Risk" value={payload ? formatNumber(payload.summary.rolesAtRisk) : '—'} detail="Hierarchy roles under pressure" />
        <MetricCard icon={Network} label="Avg Span" value={payload ? `${payload.summary.avgSpanOfControl}` : '—'} detail="Average span of control" />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
        <label className="relative xl:col-span-2">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search manager, title, department, scope..."
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-dle-blue/20"
          />
        </label>
        <Select value={layerFilter} onChange={(value) => setLayerFilter(value as 'All' | string)} options={['All', ...(payload?.filterOptions.layers || [])]} labels={{ All: 'All Layers' }} />
        <Select value={businessUnitFilter} onChange={(value) => setBusinessUnitFilter(value as 'All' | string)} options={['All', ...(payload?.filterOptions.businessUnits || [])]} labels={{ All: 'All Business Units' }} />
        <Select value={locationFilter} onChange={(value) => setLocationFilter(value as 'All' | string)} options={['All', ...(payload?.filterOptions.locations || [])]} labels={{ All: 'All Locations' }} />
        <Select value={healthFilter} onChange={(value) => setHealthFilter(value as 'All' | HealthStatus)} options={['All', ...(payload?.filterOptions.healthStatuses || [])]} labels={{ All: 'All Health States' }} />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex flex-col xl:flex-row gap-3 xl:items-center xl:justify-between">
        <div className="grid grid-cols-1 md:grid-cols-[220px_220px] gap-3">
          <Select value={actingFilter} onChange={(value) => setActingFilter(value as 'All' | string)} options={['All', ...(payload?.filterOptions.actingCoverage || [])]} labels={{ All: 'All Acting Coverage' }} />
          <Select
            value={sortBy}
            onChange={(value) => setSortBy(value as typeof sortBy)}
            options={['totalReports', 'spanOfControl', 'successionCoveragePct', 'attritionRiskPct']}
            labels={{
              totalReports: 'Sort: Total Reports',
              spanOfControl: 'Sort: Span Of Control',
              successionCoveragePct: 'Sort: Succession',
              attritionRiskPct: 'Sort: Attrition',
            }}
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setQuery('');
            setLayerFilter('All');
            setBusinessUnitFilter('All');
            setLocationFilter('All');
            setActingFilter('All');
            setHealthFilter('All');
            setSortBy('totalReports');
          }}
          className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Reset Filters
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[0.95fr_1.05fr] gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-slate-900">Hierarchy Explorer</div>
              <div className="text-xs text-slate-500 mt-1">Browse reporting owners by layer, coverage strength, span of control, and escalation readiness.</div>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold">Showing: {formatNumber(visibleRows.length)}</span>
          </div>
          <div className="p-4 space-y-3 min-h-[520px]">
            {loading ? (
              <div className="text-sm text-slate-600 font-medium">Loading reporting hierarchy...</div>
            ) : error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 font-medium">{error}</div>
            ) : visibleRows.length ? (
              visibleRows.map((row) => {
                const active = selectedRow?.id === row.id;
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setSelectedId(row.id)}
                    className={`w-full text-left rounded-2xl border p-4 transition-colors ${active ? 'border-dle-blue/30 bg-dle-blue/5' : 'border-slate-200 hover:bg-slate-50'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900">{row.employeeName}</div>
                        <div className="text-xs text-slate-500 mt-1">
                          {row.jobTitle} <span className="mx-2">•</span> {row.layer} <span className="mx-2">•</span> {row.businessUnit}
                        </div>
                      </div>
                      <span className={`px-2 py-1 rounded-full border text-[11px] font-semibold ${actingTone(row.actingCoverage)}`}>{row.actingCoverage}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-slate-600">
                      <span>Total Reports: {formatNumber(row.totalReports)}</span>
                      <span>Span: {row.spanOfControl}</span>
                      <span>Succession: {row.successionCoveragePct}%</span>
                      <span>Critical Gaps: {row.openCriticalRoles}</span>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="text-sm text-slate-600 font-medium">No reporting rows match the current filters.</div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="text-sm font-bold text-slate-900">Reporting Detail</div>
              <div className="text-xs text-slate-500 mt-1">Inspect manager ownership, reporting footprint, coverage posture, and escalation path for the selected role.</div>
            </div>
            <div className="p-5">
              {selectedRow ? (
                <div className="space-y-5">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold">{selectedRow.layer}</span>
                      <span className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold ${actingTone(selectedRow.actingCoverage)}`}>{selectedRow.actingCoverage}</span>
                      <span className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold ${healthTone(selectedRow.healthStatus)}`}>{selectedRow.healthStatus}</span>
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 mt-3">{selectedRow.employeeName}</h3>
                    <p className="text-sm text-slate-500 mt-1">{selectedRow.responsibilityScope}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <DetailStat label="Employee ID" value={selectedRow.employeeId} />
                    <DetailStat label="Job Title" value={selectedRow.jobTitle} />
                    <DetailStat label="Department" value={selectedRow.department} />
                    <DetailStat label="Business Unit" value={selectedRow.businessUnit} />
                    <DetailStat label="Location" value={selectedRow.location} />
                    <DetailStat label="Manager" value={selectedRow.managerName || 'Top Of Hierarchy'} />
                    <DetailStat label="Direct Reports" value={formatNumber(selectedRow.directReports)} />
                    <DetailStat label="Indirect Reports" value={formatNumber(selectedRow.indirectReports)} />
                    <DetailStat label="Total Reports" value={formatNumber(selectedRow.totalReports)} />
                    <DetailStat label="Open Critical Roles" value={formatNumber(selectedRow.openCriticalRoles)} />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <ProgressCard label="Span Of Control" value={Math.min(selectedRow.spanOfControl * 10, 100)} display={`${selectedRow.spanOfControl}`} tone="blue" />
                    <ProgressCard label="Succession Coverage" value={selectedRow.successionCoveragePct} tone="emerald" />
                    <ProgressCard label="Attrition Risk" value={selectedRow.attritionRiskPct} tone="amber" />
                    <ProgressCard label="Approval Coverage" value={selectedRow.approvalCoveragePct} tone="indigo" />
                  </div>

                  <InfoListCard title="Primary Teams" items={selectedRow.primaryTeams} />
                  <InfoListCard title="Escalation Path" items={selectedRow.escalationPath} />
                </div>
              ) : (
                <div className="text-sm text-slate-600">Select a reporting owner to inspect hierarchy detail.</div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <div>
                <div className="text-sm font-bold text-slate-900">Hierarchy Insights</div>
                <div className="text-xs text-slate-500 mt-1">Priority observations for reporting load, succession, and acting-coverage resilience.</div>
              </div>
            </div>
            <div className="p-4 space-y-3">
              {(payload?.insights || []).map((insight) => (
                <div key={insight.id} className={`rounded-2xl border p-4 ${insightTone(insight.severity)}`}>
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
          <div className="text-sm font-bold text-slate-900">Reporting Registry</div>
          <div className="text-xs text-slate-500 mt-1">Searchable audit table of reporting owners, manager links, and control coverage.</div>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50">
              <tr>
                {['Employee', 'Layer', 'Manager', 'Business Unit', 'Location', 'Total Reports', 'Span', 'Acting Coverage', 'Health'].map((header) => (
                  <th key={header} className="px-4 py-3 text-[11px] font-semibold text-slate-600 uppercase tracking-wide whitespace-nowrap">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setSelectedId(row.id)}>
                  <td className="px-4 py-3">
                    <div className="text-sm font-semibold text-slate-900">{row.employeeName}</div>
                    <div className="text-xs text-slate-500">{row.jobTitle}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">{row.layer}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{row.managerName || '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{row.businessUnit}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{row.location}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{formatNumber(row.totalReports)}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{row.spanOfControl}</td>
                  <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold ${actingTone(row.actingCoverage)}`}>{row.actingCoverage}</span></td>
                  <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold ${healthTone(row.healthStatus)}`}>{row.healthStatus}</span></td>
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
  tone: 'emerald' | 'amber' | 'blue' | 'indigo';
  display?: string;
}) {
  const styles = tone === 'emerald' ? 'bg-emerald-500' : tone === 'amber' ? 'bg-amber-500' : tone === 'indigo' ? 'bg-indigo-500' : 'bg-blue-500';
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

function Select({ value, onChange, options, labels }: { value: string; onChange: (value: string) => void; options: string[]; labels?: Record<string, string> }) {
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
