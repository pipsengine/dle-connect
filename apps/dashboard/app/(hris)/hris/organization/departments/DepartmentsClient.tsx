'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  BriefcaseBusiness,
  Building2,
  ChevronRight,
  Download,
  GitBranch,
  Layers3,
  MoreHorizontal,
  Network,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  ShieldCheck,
  Save,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import type { DepartmentRecord, HealthStatus, StructureInsight } from '@/lib/organization-data';

type Payload = {
  generatedAt: string;
  permissions: {
    canEdit: boolean;
    canExport: boolean;
    canViewCosts: boolean;
  };
  summary: {
    totalDepartments: number;
    totalHeadcount: number;
    totalOpenRoles: number;
    totalTeams: number;
    avgSuccessionCoverage: number;
    avgAttritionRisk: number;
    criticalDepartments: number;
    needsAttentionDepartments: number;
  };
  filterOptions: {
    locations: string[];
    healthStatuses: HealthStatus[];
    parentUnits: string[];
  };
  departments: DepartmentRecord[];
  insights: StructureInsight[];
};

type DepartmentsClientProps = {
  initialPayload?: Payload | null;
  initialError?: string | null;
};

type DepartmentForm = {
  id?: string;
  name: string;
  code: string;
  parentName: string;
  leader: string;
  location: string;
  healthStatus: HealthStatus;
  openRoles: string;
  budgetNgn: string;
  spanOfControl: string;
  successionCoveragePct: string;
  attritionRiskPct: string;
  costCenter: string;
  description: string;
};

const emptyForm: DepartmentForm = {
  name: '',
  code: '',
  parentName: '',
  leader: '',
  location: '',
  healthStatus: 'Healthy',
  openRoles: '0',
  budgetNgn: '0',
  spanOfControl: '0',
  successionCoveragePct: '0',
  attritionRiskPct: '0',
  costCenter: '',
  description: '',
};

const formatNumber = (value: number) => new Intl.NumberFormat('en-US').format(value);
const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(value);

const healthTone = (status: HealthStatus) => {
  if (status === 'Critical') return 'bg-red-50 text-red-700 border-red-200';
  if (status === 'Needs Attention') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
};

const insightTone = (severity: StructureInsight['severity']) => {
  if (severity === 'high') return 'border-red-200 bg-red-50';
  if (severity === 'medium') return 'border-amber-200 bg-amber-50';
  return 'border-emerald-200 bg-emerald-50';
};

type TabId = 'overview' | 'explorer' | 'analytics' | 'leadership' | 'workforce' | 'reporting';

const tabs: Array<{ id: TabId; label: string; href?: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'explorer', label: 'Department Explorer' },
  { id: 'analytics', label: 'Department Analytics' },
  { id: 'leadership', label: 'Leadership & Succession' },
  { id: 'workforce', label: 'Workforce Planning', href: '/hris/organization/workforce-planning' },
  { id: 'reporting', label: 'Reporting' },
];

const deriveComposition = (department: DepartmentRecord) => {
  const seed = department.code.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const adjust = (base: number, index: number) => Math.max(5, Math.min(55, base + ((seed + index * 7) % 11) - 5));
  const raw = [
    { label: 'Professional Staff', pct: adjust(42, 0), color: '#2563EB' },
    { label: 'Technical Staff', pct: adjust(28, 1), color: '#8B5CF6' },
    { label: 'Support Staff', pct: adjust(20, 2), color: '#10B981' },
    { label: 'Management Staff', pct: adjust(10, 3), color: '#F59E0B' },
  ];
  const total = raw.reduce((sum, item) => sum + item.pct, 0);
  return raw.map((item) => ({ ...item, pct: Math.round((item.pct / total) * 100) }));
};

export default function DepartmentsClient({ initialPayload = null, initialError = null }: DepartmentsClientProps) {
  const [payload, setPayload] = useState<Payload | null>(initialPayload);
  const [loading, setLoading] = useState(!initialPayload && !initialError);
  const [error, setError] = useState<string | null>(initialError);
  const [query, setQuery] = useState('');
  const [locationFilter, setLocationFilter] = useState<'All' | string>('All');
  const [healthFilter, setHealthFilter] = useState<'All' | HealthStatus>('All');
  const [parentUnitFilter, setParentUnitFilter] = useState<'All' | string>('All');
  const [sortBy, setSortBy] = useState<'headcount' | 'openRoles' | 'successionCoveragePct' | 'attritionRiskPct'>('headcount');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [form, setForm] = useState<DepartmentForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [showMoreActions, setShowMoreActions] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/hris/organization/departments', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json?.status !== 'success') throw new Error(json?.error || 'Unable to load departments');
      const data = json.data as Payload;
      setPayload(data);
      setSelectedId((prev) => prev || data.departments[0]?.id || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load departments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialPayload || initialError) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [initialPayload, initialError]);

  const departments = payload?.departments || [];

  const visibleDepartments = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = departments.filter((department) => {
      if (locationFilter !== 'All' && department.location !== locationFilter) return false;
      if (healthFilter !== 'All' && department.healthStatus !== healthFilter) return false;
      if (parentUnitFilter !== 'All' && department.parentName !== parentUnitFilter) return false;
      if (!q) return true;

      return [
        department.name,
        department.code,
        department.leader,
        department.location,
        department.description,
        department.costCenter,
        department.parentName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sortBy === 'successionCoveragePct') return b.successionCoveragePct - a.successionCoveragePct;
      if (sortBy === 'attritionRiskPct') return b.attritionRiskPct - a.attritionRiskPct;
      if (sortBy === 'openRoles') return b.openRoles - a.openRoles;
      return b.headcount - a.headcount;
    });
    return sorted;
  }, [departments, query, locationFilter, healthFilter, parentUnitFilter, sortBy]);

  const selectedDepartment = useMemo(() => {
    return visibleDepartments.find((department) => department.id === selectedId) || visibleDepartments[0] || null;
  }, [visibleDepartments, selectedId]);

  const healthyDepartments = useMemo(() => {
    if (!payload) return 0;
    return Math.max(
      payload.summary.totalDepartments - payload.summary.criticalDepartments - payload.summary.needsAttentionDepartments,
      0,
    );
  }, [payload]);

  const criticalDepartmentsList = useMemo(
    () =>
      [...departments]
        .filter((department) => department.healthStatus === 'Critical' || department.healthStatus === 'Needs Attention')
        .sort((a, b) => b.attritionRiskPct - a.attritionRiskPct)
        .slice(0, 4),
    [departments],
  );

  const leadershipMetrics = useMemo(
    () => ({
      withoutSuccessors: departments.filter((department) => department.successionCoveragePct < 50).length,
      leadershipGaps: departments.filter(
        (department) => !department.leader || department.leader === 'Unassigned' || department.leader === '—',
      ).length,
      criticalLeadership: departments.filter((department) => department.healthStatus === 'Critical').length,
      readySuccessors: departments.filter((department) => department.successionCoveragePct >= 70).length,
    }),
    [departments],
  );

  const departmentInsightCards = useMemo(() => {
    if (!departments.length) return [];
    const largest = [...departments].sort((a, b) => b.headcount - a.headcount)[0];
    const highestAttrition = [...departments].sort((a, b) => b.attritionRiskPct - a.attritionRiskPct)[0];
    const fastestGrowing = [...departments].sort((a, b) => b.teamCount - a.teamCount)[0];
    const mostStable =
      [...departments]
        .filter((department) => department.healthStatus === 'Healthy')
        .sort((a, b) => a.attritionRiskPct - b.attritionRiskPct)[0] || largest;

    return [
      { label: 'Largest Department', name: largest.name, detail: `${formatNumber(largest.headcount)} Employees` },
      {
        label: 'Highest Attrition Risk',
        name: highestAttrition.name,
        detail: `${highestAttrition.attritionRiskPct}% Risk`,
      },
      {
        label: 'Fastest Growing Department',
        name: fastestGrowing.name,
        detail: `${formatNumber(fastestGrowing.teamCount)} Teams`,
      },
      {
        label: 'Most Stable Department',
        name: mostStable.name,
        detail: `${100 - mostStable.attritionRiskPct}% Stability`,
      },
    ];
  }, [departments]);

  const topDepartmentsByHeadcount = useMemo(
    () => [...departments].sort((a, b) => b.headcount - a.headcount).slice(0, 5),
    [departments],
  );

  const spotlightComposition = useMemo(
    () => (selectedDepartment ? deriveComposition(selectedDepartment) : []),
    [selectedDepartment],
  );

  const reviewAttentionDepartments = () => {
    setHealthFilter('Needs Attention');
    setActiveTab('overview');
    const first = departments.find(
      (department) => department.healthStatus === 'Needs Attention' || department.healthStatus === 'Critical',
    );
    if (first) setSelectedId(first.id);
  };

  const resetFilters = () => {
    setQuery('');
    setLocationFilter('All');
    setHealthFilter('All');
    setParentUnitFilter('All');
    setSortBy('headcount');
  };

  const openCreate = () => {
    setFormMode('create');
    setForm(emptyForm);
    setActionError(null);
    setModalOpen(true);
  };

  const openEdit = (department: DepartmentRecord) => {
    setSelectedId(department.id);
    setFormMode('edit');
    setForm({
      id: department.id,
      name: department.name,
      code: department.code,
      parentName: department.parentName || '',
      leader: department.leader,
      location: department.location,
      healthStatus: department.healthStatus,
      openRoles: String(department.openRoles),
      budgetNgn: String(department.budgetNgn),
      spanOfControl: String(department.spanOfControl),
      successionCoveragePct: String(department.successionCoveragePct),
      attritionRiskPct: String(department.attritionRiskPct),
      costCenter: department.costCenter,
      description: department.description,
    });
    setActionError(null);
    setModalOpen(true);
  };

  const requestPayload = () => ({
    ...form,
    openRoles: Number(form.openRoles || 0),
    budgetNgn: Number(form.budgetNgn || 0),
    spanOfControl: Number(form.spanOfControl || 0),
    successionCoveragePct: Number(form.successionCoveragePct || 0),
    attritionRiskPct: Number(form.attritionRiskPct || 0),
  });

  const applyPayload = (data: Payload) => {
    setPayload(data);
    setSelectedId((prev) => (prev && data.departments.some((department) => department.id === prev) ? prev : data.departments[0]?.id || null));
  };

  const saveDepartment = async () => {
    setSaving(true);
    setActionError(null);
    try {
      const res = await fetch('/api/hris/organization/departments', {
        method: formMode === 'create' ? 'POST' : 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestPayload()),
      });
      const json = await res.json();
      if (!res.ok || json?.status !== 'success') throw new Error(json?.error || 'Unable to save department');
      applyPayload(json.data as Payload);
      setModalOpen(false);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Unable to save department');
    } finally {
      setSaving(false);
    }
  };

  const deleteDepartment = async () => {
    if (!form.id || !window.confirm('Delete this department? Departments with assigned employees cannot be deleted.')) return;
    setSaving(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/hris/organization/departments?id=${encodeURIComponent(form.id)}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || json?.status !== 'success') throw new Error(json?.error || 'Unable to delete department');
      applyPayload(json.data as Payload);
      setModalOpen(false);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Unable to delete department');
    } finally {
      setSaving(false);
    }
  };

  const syncFromEmployees = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/hris/organization/departments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'refresh-from-system' }),
      });
      const json = await res.json();
      if (!res.ok || json?.status !== 'success') throw new Error(json?.error || 'Unable to sync departments');
      applyPayload(json.data as Payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to sync departments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedDepartment || !visibleDepartments.length) return;
    const timer = window.setTimeout(() => setSelectedId(visibleDepartments[0].id), 0);
    return () => window.clearTimeout(timer);
  }, [selectedDepartment, visibleDepartments]);

  const exportCsv = () => {
    if (!payload?.permissions.canExport) return;
    const rows = [
      [
        'Department',
        'Code',
        'Parent Unit',
        'Leader',
        'Location',
        'Health',
        'Headcount',
        'Open Roles',
        'Teams',
        'Team Headcount',
        'Succession Coverage %',
        'Attrition Risk %',
        'Budget NGN',
        'Payroll NGN',
        'Cost Center',
      ],
      ...visibleDepartments.map((department) => [
        department.name,
        department.code,
        department.parentName || '—',
        department.leader,
        department.location,
        department.healthStatus,
        String(department.headcount),
        String(department.openRoles),
        String(department.teamCount),
        String(department.teamHeadcount),
        String(department.successionCoveragePct),
        String(department.attritionRiskPct),
        String(department.budgetNgn),
        String(department.payrollNgn),
        department.costCenter,
      ]),
    ];

    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'departments.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div className="border-b border-[#E5E7EB] bg-white px-6 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-[#2563EB]">
                <Building2 className="h-5 w-5" />
              </span>
              <h1 className="text-4xl font-bold tracking-tight">Departments</h1>
            </div>
            <p className="mt-2 max-w-3xl text-sm text-[#64748B]">
              Manage departmental structure, leadership accountability, workforce distribution, succession readiness, and organizational health.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={exportCsv}
              disabled={!payload?.permissions.canExport}
              className="inline-flex items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Export Departments
            </button>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowMoreActions((prev) => !prev)}
                className="inline-flex items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <MoreHorizontal className="h-4 w-4" />
                More Actions
              </button>
              {showMoreActions ? (
                <div className="absolute right-0 z-20 mt-2 w-52 rounded-xl border border-[#E5E7EB] bg-white p-2 shadow-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setShowMoreActions(false);
                      void syncFromEmployees();
                    }}
                    disabled={loading}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <RefreshCcw className="h-4 w-4" />
                    Sync from System
                  </button>
                </div>
              ) : null}
            </div>
            {payload?.permissions.canEdit ? (
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex items-center gap-2 rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                New Department
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="space-y-4 px-6 py-5">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
        <MetricCard icon={Building2} label="Departments" value={payload ? formatNumber(payload.summary.totalDepartments) : '—'} detail="Active departments" />
        <MetricCard icon={Users} label="Headcount" value={payload ? formatNumber(payload.summary.totalHeadcount) : '—'} detail="Total employees" />
        <MetricCard icon={BriefcaseBusiness} label="Open Roles" value={payload ? formatNumber(payload.summary.totalOpenRoles) : '—'} detail="Approved vacancies" />
        <MetricCard icon={Layers3} label="Teams" value={payload ? formatNumber(payload.summary.totalTeams) : '—'} detail="Teams across departments" />
        <MetricCard icon={ShieldCheck} label="Succession Coverage" value={payload ? `${payload.summary.avgSuccessionCoverage}%` : '—'} detail="Average coverage strength" />
        <MetricCard icon={AlertTriangle} label="Attrition Risk" value={payload ? `${payload.summary.avgAttritionRisk}%` : '—'} detail="Average department risk" />
      </div>

      {payload ? (
        <div className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex-1">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Department Health Overview</h2>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-[#10B981]">Data Status: Live</span>
              </div>
              <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-slate-100">
                {[
                  { count: healthyDepartments, color: '#10B981' },
                  { count: payload.summary.needsAttentionDepartments, color: '#F59E0B' },
                  { count: payload.summary.criticalDepartments, color: '#EF4444' },
                ].map((segment) => (
                  <div
                    key={segment.color}
                    className="h-full"
                    style={{
                      width: `${Math.max((segment.count / Math.max(payload.summary.totalDepartments, 1)) * 100, segment.count ? 4 : 0)}%`,
                      backgroundColor: segment.color,
                    }}
                  />
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                <span className="font-semibold text-[#10B981]">Healthy Departments: {formatNumber(healthyDepartments)}</span>
                <span className="font-semibold text-[#F59E0B]">Needs Attention: {formatNumber(payload.summary.needsAttentionDepartments)}</span>
                <span className="font-semibold text-[#EF4444]">Critical Departments: {formatNumber(payload.summary.criticalDepartments)}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={reviewAttentionDepartments}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[#2563EB] px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              View Departments Requiring Attention
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-[#E5E7EB] bg-white p-2 shadow-sm">
        <div className="flex min-w-max flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-max gap-1">
            {tabs.map((tab) =>
              tab.href ? (
                <Link key={tab.id} href={tab.href} className="rounded-lg px-3 py-2 text-xs font-semibold whitespace-nowrap text-slate-700 hover:bg-gray-50">
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
          <div className="flex min-w-max flex-wrap items-center gap-2 px-1 pb-1 xl:pb-0">
            <label className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search department, manager, location..."
                className="w-64 rounded-lg border border-[#E5E7EB] py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
              />
            </label>
            <button
              type="button"
              onClick={resetFilters}
              className="rounded-lg border border-[#E5E7EB] px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-xl border border-[#E5E7EB] bg-white p-4 md:grid-cols-2 xl:grid-cols-5">
        <Select value={locationFilter} onChange={(value) => setLocationFilter(value as 'All' | string)} options={['All', ...(payload?.filterOptions.locations || [])]} />
        <Select value={healthFilter} onChange={(value) => setHealthFilter(value as 'All' | HealthStatus)} options={['All', ...(payload?.filterOptions.healthStatuses || [])]} />
        <Select value={parentUnitFilter} onChange={(value) => setParentUnitFilter(value as 'All' | string)} options={['All', ...(payload?.filterOptions.parentUnits || [])]} />
        <Select
          value={sortBy}
          onChange={(value) => setSortBy(value as typeof sortBy)}
          options={['headcount', 'openRoles', 'successionCoveragePct', 'attritionRiskPct']}
          labels={{
            headcount: 'Headcount',
            openRoles: 'Open Roles',
            successionCoveragePct: 'Succession Coverage',
            attritionRiskPct: 'Attrition Risk',
          }}
        />
        <div className="flex items-center rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2 text-xs font-semibold text-[#64748B]">
          Showing {formatNumber(visibleDepartments.length)} departments
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">{error}</div>
      ) : null}

      {activeTab === 'overview' ? (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)_minmax(0,340px)]">
          <DepartmentWorkspaceList
            title="Department Workspaces"
            loading={loading}
            departments={visibleDepartments}
            selectedId={selectedDepartment?.id || null}
            onSelect={setSelectedId}
            onOpenWorkspace={setSelectedId}
            onEdit={openEdit}
            compact
          />

          <DepartmentSpotlightPanel
            selectedDepartment={selectedDepartment}
            spotlightComposition={spotlightComposition}
            canEdit={payload?.permissions.canEdit ?? false}
            onEdit={openEdit}
          />

          <div className="space-y-4">
            <LeadershipSuccessionPanel metrics={leadershipMetrics} />
            <DepartmentInsightCards cards={departmentInsightCards} />
            <CriticalDepartmentsPanel
              departments={criticalDepartmentsList}
              onSelect={(id) => {
                setSelectedId(id);
                setActiveTab('overview');
              }}
            />
            <TopHeadcountPanel departments={topDepartmentsByHeadcount} onSelect={setSelectedId} />
            <QuickActionsPanel onCreate={openCreate} onExport={exportCsv} canExport={payload?.permissions.canExport ?? false} canEdit={payload?.permissions.canEdit ?? false} />
          </div>
        </div>
      ) : null}

      {activeTab === 'explorer' ? (
        <DepartmentWorkspaceList
          title="Department Explorer"
          loading={loading}
          departments={visibleDepartments}
          selectedId={selectedDepartment?.id || null}
          onSelect={setSelectedId}
          onOpenWorkspace={setSelectedId}
          onEdit={openEdit}
        />
      ) : null}

      {activeTab === 'analytics' ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <TopHeadcountPanel departments={topDepartmentsByHeadcount} onSelect={setSelectedId} expanded />
          <LeadershipSuccessionPanel metrics={leadershipMetrics} expanded />
          <DepartmentInsightCards cards={departmentInsightCards} expanded />
          <div className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm xl:col-span-2">
            <h3 className="text-lg font-semibold">Department Analytics Summary</h3>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <DetailStat label="Total Departments" value={payload ? formatNumber(payload.summary.totalDepartments) : '—'} />
              <DetailStat label="Average Succession" value={payload ? `${payload.summary.avgSuccessionCoverage}%` : '—'} />
              <DetailStat label="Average Attrition" value={payload ? `${payload.summary.avgAttritionRisk}%` : '—'} />
              <DetailStat label="Open Roles" value={payload ? formatNumber(payload.summary.totalOpenRoles) : '—'} />
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === 'leadership' ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
          <LeadershipSuccessionPanel metrics={leadershipMetrics} expanded />
          <div className="space-y-4">
            <DepartmentInsightCards cards={departmentInsightCards} />
            <CriticalDepartmentsPanel departments={criticalDepartmentsList} onSelect={setSelectedId} />
          </div>
        </div>
      ) : null}

      {activeTab === 'reporting' ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold">Department Reporting</h3>
            <p className="mt-1 text-sm text-[#64748B]">Executive summaries and operational intelligence for departmental governance.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={exportCsv}
                disabled={!payload?.permissions.canExport}
                className="inline-flex items-center gap-2 rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                Export Departments
              </button>
              <Link href="/hris/organization/workforce-planning" className="inline-flex items-center gap-2 rounded-lg border border-[#E5E7EB] px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Workforce Planning
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
          <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold">Priority Observations</h3>
            <div className="mt-3 space-y-3">
              {(payload?.insights || []).map((insight) => (
                <div key={insight.id} className={`rounded-xl border p-4 ${insightTone(insight.severity)}`}>
                  <div className="text-sm font-semibold text-slate-900">{insight.title}</div>
                  <div className="mt-1 text-xs text-slate-600">{insight.recommendation}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {payload && payload.summary.criticalDepartments > 0 ? (
        <div className="flex flex-col gap-3 rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-[#2563EB]" />
            <p className="text-sm font-medium text-[#0F172A]">
              AI Insight: {formatNumber(payload.summary.criticalDepartments)} departments require immediate attention due to high attrition risk and low succession coverage.
            </p>
          </div>
          <button type="button" onClick={reviewAttentionDepartments} className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-[#2563EB] hover:text-blue-700">
            View AI Recommendations
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      ) : null}
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6">
          <div className="w-full max-w-4xl max-h-[92vh] overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-slate-900">{formMode === 'create' ? 'New Department' : 'Edit Department'}</div>
                <div className="text-xs text-slate-500 mt-1">Maintain department ownership, location, controls, and operating indicators.</div>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="w-9 h-9 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 inline-flex items-center justify-center"
                aria-label="Close department editor"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto max-h-[calc(92vh-145px)]">
              {actionError ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">{actionError}</div> : null}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Department Name" value={form.name} onChange={(value) => setForm((prev) => ({ ...prev, name: value }))} required />
                <FormField
                  label="Department Code"
                  value={form.code}
                  onChange={(value) => setForm((prev) => ({ ...prev, code: value.toUpperCase() }))}
                  disabled={formMode === 'edit'}
                  required
                />
                <FormField label="Parent Unit" value={form.parentName} onChange={(value) => setForm((prev) => ({ ...prev, parentName: value }))} />
                <FormField label="Leader" value={form.leader} onChange={(value) => setForm((prev) => ({ ...prev, leader: value }))} />
                <FormField label="Location" value={form.location} onChange={(value) => setForm((prev) => ({ ...prev, location: value }))} />
                <FormField label="Cost Center" value={form.costCenter} onChange={(value) => setForm((prev) => ({ ...prev, costCenter: value }))} />
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-slate-600">Health Status</span>
                  <Select
                    value={form.healthStatus}
                    onChange={(value) => setForm((prev) => ({ ...prev, healthStatus: value as HealthStatus }))}
                    options={['Healthy', 'Needs Attention', 'Critical']}
                  />
                </label>
                <NumberField label="Open Roles" value={form.openRoles} onChange={(value) => setForm((prev) => ({ ...prev, openRoles: value }))} />
                <NumberField label="Budget NGN" value={form.budgetNgn} onChange={(value) => setForm((prev) => ({ ...prev, budgetNgn: value }))} />
                <NumberField label="Span Of Control" value={form.spanOfControl} onChange={(value) => setForm((prev) => ({ ...prev, spanOfControl: value }))} />
                <NumberField label="Succession Coverage %" value={form.successionCoveragePct} onChange={(value) => setForm((prev) => ({ ...prev, successionCoveragePct: value }))} min={0} max={100} />
                <NumberField label="Attrition Risk %" value={form.attritionRiskPct} onChange={(value) => setForm((prev) => ({ ...prev, attritionRiskPct: value }))} min={0} max={100} />
                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs font-semibold text-slate-600">Description</span>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                    rows={4}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 resize-none focus:outline-none focus:ring-2 focus:ring-dle-blue/20"
                  />
                </label>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-50">
              <div>
                {formMode === 'edit' ? (
                  <button
                    type="button"
                    onClick={() => void deleteDepartment()}
                    disabled={saving}
                    className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-red-200 bg-white text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                ) : null}
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  disabled={saving}
                  className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void saveDepartment()}
                  disabled={saving || !form.name.trim() || !form.code.trim()}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-dle-blue text-xs font-semibold text-white hover:bg-dle-blue/90 disabled:opacity-60"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving...' : 'Save Department'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DepartmentWorkspaceList({
  title,
  loading,
  departments,
  selectedId,
  onSelect,
  onOpenWorkspace,
  onEdit,
  compact = false,
}: {
  title: string;
  loading: boolean;
  departments: DepartmentRecord[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpenWorkspace: (id: string) => void;
  onEdit: (department: DepartmentRecord) => void;
  compact?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-[#E5E7EB] px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-xs text-[#64748B]">Browse departments and open operational workspaces.</p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">{formatNumber(departments.length)}</span>
      </div>
      <div className={`space-y-3 overflow-y-auto p-4 ${compact ? 'max-h-[720px]' : 'min-h-[520px]'}`}>
        {loading ? (
          <div className="text-sm font-medium text-slate-600">Loading departments...</div>
        ) : departments.length ? (
          departments.map((department) => {
            const active = selectedId === department.id;
            return (
              <div
                key={department.id}
                className={`rounded-xl border p-4 transition-colors ${active ? 'border-[#2563EB]/30 bg-blue-50/50' : 'border-[#E5E7EB] hover:bg-slate-50'}`}
              >
                <button type="button" onClick={() => onSelect(department.id)} onDoubleClick={() => onEdit(department)} className="w-full text-left">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900">{department.name}</div>
                      <div className="mt-1 text-xs text-slate-500">Leader: {department.leader}</div>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-semibold ${healthTone(department.healthStatus)}`}>
                      {department.healthStatus}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                    <span>Headcount: {formatNumber(department.headcount)}</span>
                    <span>Teams: {formatNumber(department.teamCount)}</span>
                    <span>Open Roles: {formatNumber(department.openRoles)}</span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenWorkspace(department.id)}
                  className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#2563EB] hover:text-blue-700"
                >
                  Open Workspace
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })
        ) : (
          <div className="text-sm font-medium text-slate-600">No departments match the current filters.</div>
        )}
      </div>
    </div>
  );
}

function DepartmentSpotlightPanel({
  selectedDepartment,
  spotlightComposition,
  canEdit,
  onEdit,
}: {
  selectedDepartment: DepartmentRecord | null;
  spotlightComposition: Array<{ label: string; pct: number; color: string }>;
  canEdit: boolean;
  onEdit: (department: DepartmentRecord) => void;
}) {
  const compositionGradient = useMemo(() => {
    let cursor = 0;
    return spotlightComposition
      .map((item) => {
        const start = cursor;
        cursor += item.pct;
        return `${item.color} ${start}% ${cursor}%`;
      })
      .join(', ');
  }, [spotlightComposition]);

  if (!selectedDepartment) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-600">Select a department to view the spotlight.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">Department Spotlight</p>
            <h3 className="mt-1 text-xl font-semibold">{selectedDepartment.name} Department</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${healthTone(selectedDepartment.healthStatus)}`}>
                {selectedDepartment.healthStatus}
              </span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">Operational</span>
            </div>
          </div>
          {canEdit ? (
            <button
              type="button"
              onClick={() => onEdit(selectedDepartment)}
              className="inline-flex items-center gap-2 rounded-lg border border-[#E5E7EB] px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </button>
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <DetailStat label="Leader" value={selectedDepartment.leader} />
          <DetailStat label="Parent Unit" value={selectedDepartment.parentName || '—'} />
          <DetailStat label="Location" value={selectedDepartment.location} />
          <DetailStat label="Cost Centre" value={selectedDepartment.costCenter} />
          <DetailStat label="Headcount" value={formatNumber(selectedDepartment.headcount)} />
          <DetailStat label="Teams" value={formatNumber(selectedDepartment.teamCount)} />
          <DetailStat label="Open Roles" value={formatNumber(selectedDepartment.openRoles)} />
          <DetailStat label="Budget" value={formatCurrency(selectedDepartment.budgetNgn)} />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <ProgressCard label="Succession Coverage" value={selectedDepartment.successionCoveragePct} tone="emerald" />
          <ProgressCard label="Attrition Risk" value={selectedDepartment.attritionRiskPct} tone="amber" />
          <ProgressCard label="Span of Control" value={Math.min(selectedDepartment.spanOfControl * 10, 100)} tone="blue" display={`${selectedDepartment.spanOfControl}`} />
        </div>
      </div>

      <div className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold">Department Composition</h3>
        <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row">
          <div
            className="h-36 w-36 shrink-0 rounded-full border-4 border-white shadow-sm"
            style={{ background: compositionGradient ? `conic-gradient(${compositionGradient})` : '#E5E7EB' }}
          />
          <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
            {spotlightComposition.map((item) => (
              <div key={item.label} className="flex items-center gap-2 text-sm">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="font-medium text-slate-700">{item.label}</span>
                <span className="text-slate-500">{item.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold">Department Insights</h3>
        <ul className="mt-3 space-y-2 text-sm text-slate-600">
          {selectedDepartment.attritionRiskPct >= 50 ? (
            <li className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#EF4444]" />
              High attrition risk detected
            </li>
          ) : null}
          {selectedDepartment.successionCoveragePct < 50 ? (
            <li className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#F59E0B]" />
              Succession coverage requires attention
            </li>
          ) : null}
          <li className="flex items-start gap-2">
            <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-[#2563EB]" />
            {formatNumber(selectedDepartment.teamCount)} teams under this department
          </li>
          {selectedDepartment.openRoles > 0 ? (
            <li className="flex items-start gap-2">
              <BriefcaseBusiness className="mt-0.5 h-4 w-4 shrink-0 text-[#8B5CF6]" />
              {formatNumber(selectedDepartment.openRoles)} approved open roles
            </li>
          ) : null}
        </ul>
        <Link href="/hris/organization/units-sections" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#2563EB] hover:text-blue-700">
          Open Department Workspace
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

function LeadershipSuccessionPanel({
  metrics,
  expanded = false,
}: {
  metrics: { withoutSuccessors: number; leadershipGaps: number; criticalLeadership: number; readySuccessors: number };
  expanded?: boolean;
}) {
  const items = [
    { label: 'Departments Without Successors', value: metrics.withoutSuccessors, tone: 'amber' as const },
    { label: 'Leadership Gap Departments', value: metrics.leadershipGaps, tone: 'red' as const },
    { label: 'Critical Leadership Positions', value: metrics.criticalLeadership, tone: 'red' as const },
    { label: 'Ready Successors Available', value: metrics.readySuccessors, tone: 'emerald' as const },
  ];

  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold">Leadership & Succession</h3>
      <div className={`mt-3 gap-3 ${expanded ? 'grid grid-cols-2' : 'space-y-2'}`}>
        {items.map((item) => (
          <div
            key={item.label}
            className={`rounded-lg border p-3 ${
              item.tone === 'emerald' ? 'border-emerald-200 bg-emerald-50' : item.tone === 'amber' ? 'border-amber-200 bg-amber-50' : 'border-red-200 bg-red-50'
            }`}
          >
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">{item.label}</div>
            <div className="mt-1 text-xl font-bold text-slate-900">{formatNumber(item.value)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DepartmentInsightCards({
  cards,
  expanded = false,
}: {
  cards: Array<{ label: string; name: string; detail: string }>;
  expanded?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold">Department Insights</h3>
      <div className={`mt-3 gap-3 ${expanded ? 'grid grid-cols-2' : 'space-y-2'}`}>
        {cards.map((card) => (
          <div key={card.label} className="rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">{card.label}</div>
            <div className="mt-1 text-sm font-semibold text-slate-900">{card.name}</div>
            <div className="text-xs text-slate-500">{card.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CriticalDepartmentsPanel({
  departments,
  onSelect,
}: {
  departments: DepartmentRecord[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold">Critical Departments</h3>
      <div className="mt-3 space-y-2">
        {departments.length ? (
          departments.map((department) => (
            <div key={department.id} className="rounded-lg border border-[#E5E7EB] p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{department.name}</div>
                  <div className="text-xs text-slate-500">{department.attritionRiskPct}% attrition risk</div>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${healthTone(department.healthStatus)}`}>
                  {department.healthStatus}
                </span>
              </div>
              <button type="button" onClick={() => onSelect(department.id)} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#2563EB] hover:text-blue-700">
                Open Workspace
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-600">No critical departments detected.</p>
        )}
      </div>
    </div>
  );
}

function TopHeadcountPanel({
  departments,
  onSelect,
  expanded = false,
}: {
  departments: DepartmentRecord[];
  onSelect: (id: string) => void;
  expanded?: boolean;
}) {
  const maxHeadcount = departments[0]?.headcount || 1;

  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold">Top Departments by Headcount</h3>
      <div className={`mt-3 space-y-3 ${expanded ? 'md:grid md:grid-cols-2 md:gap-3 md:space-y-0' : ''}`}>
        {departments.map((department) => (
          <button
            key={department.id}
            type="button"
            onClick={() => onSelect(department.id)}
            className="block w-full rounded-lg border border-[#E5E7EB] p-3 text-left hover:bg-slate-50"
          >
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-semibold text-slate-900">{department.name}</span>
              <span className="text-slate-600">{formatNumber(department.headcount)}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-[#2563EB]" style={{ width: `${(department.headcount / maxHeadcount) * 100}%` }} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function QuickActionsPanel({
  onCreate,
  onExport,
  canExport,
  canEdit,
}: {
  onCreate: () => void;
  onExport: () => void;
  canExport: boolean;
  canEdit: boolean;
}) {
  const linkActions = [
    { label: 'View Organization Chart', href: '/hris/organization/organogram', icon: Network },
    { label: 'Workforce Planning', href: '/hris/organization/workforce-planning', icon: Users },
    { label: 'Department Report', href: '/hris/organization/reporting-hierarchy', icon: GitBranch },
  ];

  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold">Quick Actions</h3>
      <div className="mt-3 grid grid-cols-1 gap-2">
        {canEdit ? (
          <button type="button" onClick={onCreate} className="flex items-center gap-3 rounded-lg border border-[#E5E7EB] px-3 py-2.5 text-sm font-semibold text-slate-700 hover:border-blue-200 hover:bg-blue-50">
            <Plus className="h-4 w-4 text-[#2563EB]" />
            Create Department
          </button>
        ) : null}
        {linkActions.map((action) => {
          const Icon = action.icon;
          return (
            <Link key={action.label} href={action.href} className="flex items-center gap-3 rounded-lg border border-[#E5E7EB] px-3 py-2.5 text-sm font-semibold text-slate-700 hover:border-blue-200 hover:bg-blue-50">
              <Icon className="h-4 w-4 text-[#2563EB]" />
              {action.label}
            </Link>
          );
        })}
        <button type="button" onClick={onExport} disabled={!canExport} className="flex items-center gap-3 rounded-lg border border-[#E5E7EB] px-3 py-2.5 text-left text-sm font-semibold text-slate-700 hover:border-blue-200 hover:bg-blue-50 disabled:opacity-50">
          <Download className="h-4 w-4 text-[#2563EB]" />
          Export Departments
        </button>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: any;
  label: string;
  value: string;
  detail: string;
  tone?: 'blue' | 'cyan' | 'indigo' | 'slate' | 'emerald' | 'amber';
}) {
  const inferredTone =
    tone ||
    ({
      Departments: 'blue',
      Headcount: 'cyan',
      'Open Roles': 'indigo',
      Teams: 'slate',
      Succession: 'emerald',
      'Attrition Risk': 'amber',
    }[label] as NonNullable<typeof tone>) ||
    'blue';
  const styles = {
    blue: 'from-sky-50 to-white border-sky-100 text-sky-700 bg-sky-100',
    cyan: 'from-cyan-50 to-white border-cyan-100 text-cyan-700 bg-cyan-100',
    indigo: 'from-indigo-50 to-white border-indigo-100 text-indigo-700 bg-indigo-100',
    slate: 'from-slate-50 to-white border-slate-200 text-slate-700 bg-slate-100',
    emerald: 'from-emerald-50 to-white border-emerald-100 text-emerald-700 bg-emerald-100',
    amber: 'from-amber-50 to-white border-amber-100 text-amber-700 bg-amber-100',
  }[inferredTone];
  const [gradientFrom, gradientTo, border, text, iconBg] = styles.split(' ');

  return (
    <div className={`bg-gradient-to-br ${gradientFrom} ${gradientTo} rounded-2xl shadow-sm border ${border} p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold">{label}</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{value}</div>
          <div className="text-xs text-slate-500 mt-2">{detail}</div>
        </div>
        <span className={`w-10 h-10 rounded-2xl ${iconBg} ${text} flex items-center justify-center`}>
          <Icon className="w-5 h-5" />
        </span>
      </div>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-3">
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
  tone: 'emerald' | 'amber' | 'blue';
  display?: string;
}) {
  const styles = tone === 'emerald' ? 'bg-emerald-500' : tone === 'amber' ? 'bg-amber-500' : 'bg-blue-500';
  const cardBg =
    tone === 'emerald'
      ? 'from-emerald-50 to-white border-emerald-100'
      : tone === 'amber'
        ? 'from-amber-50 to-white border-amber-100'
        : 'from-blue-50 to-white border-blue-100';

  return (
    <div className={`rounded-2xl border bg-gradient-to-br ${cardBg} p-4`}>
      <div className="text-xs font-semibold text-slate-600">{label}</div>
      <div className="text-lg font-bold text-slate-900 mt-1">{display || `${value}%`}</div>
      <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${styles}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
  disabled,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-semibold text-slate-600">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-dle-blue/20 disabled:bg-slate-100 disabled:text-slate-500"
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-dle-blue/20"
      />
    </label>
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
