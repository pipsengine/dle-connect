'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageTemplate } from '@/components/layout/page-template';
import {
  AlertTriangle,
  ArrowUpRight,
  BriefcaseBusiness,
  Download,
  Plus,
  RefreshCcw,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { HealthStatus, PositionRecord, StructureInsight } from '@/lib/organization-data';

type Payload = {
  generatedAt: string;
  permissions: {
    canEdit: boolean;
    canExport: boolean;
    canViewCosts: boolean;
  };
  summary: {
    totalPositions: number;
    totalIncumbents: number;
    totalVacant: number;
    avgSuccessionCoverage: number;
    avgApprovalCoverage: number;
    criticalPositions: number;
    nonStandardPositions: number;
  };
  filterOptions: {
    businessUnits: string[];
    grades: string[];
    positionTypes: string[];
    positionStatuses: string[];
    criticalities: string[];
    healthStatuses: HealthStatus[];
  };
  positions: PositionRecord[];
  insights: StructureInsight[];
};

type PositionsClientProps = {
  pageTitle?: string;
  pageDescription?: string;
  breadcrumbLabel?: string;
};

const formatNumber = (value: number) => new Intl.NumberFormat('en-US').format(value);
const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

const healthTone = (status: HealthStatus) => {
  if (status === 'Critical') return 'bg-red-50 text-red-700 border-red-200';
  if (status === 'Needs Attention') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
};

const statusTone = (status: string) => {
  if (status === 'Vacant') return 'bg-red-50 text-red-700 border-red-200';
  if (status === 'Under Review') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (status === 'Frozen') return 'bg-slate-100 text-slate-700 border-slate-200';
  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
};

const insightTone = (severity: StructureInsight['severity']) => {
  if (severity === 'high') return 'border-red-200 bg-red-50';
  if (severity === 'medium') return 'border-amber-200 bg-amber-50';
  return 'border-emerald-200 bg-emerald-50';
};

export default function PositionsClient({
  pageTitle = 'Positions',
  pageDescription = 'Review position control, vacancy status, incumbency, title and grade alignment, and critical replacement exposure across the organization.',
  breadcrumbLabel = 'Positions',
}: PositionsClientProps) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [query, setQuery] = useState('');
  const [businessUnitFilter, setBusinessUnitFilter] = useState<'All' | string>('All');
  const [gradeFilter, setGradeFilter] = useState<'All' | string>('All');
  const [typeFilter, setTypeFilter] = useState<'All' | string>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | string>('All');
  const [criticalityFilter, setCriticalityFilter] = useState<'All' | string>('All');
  const [healthFilter, setHealthFilter] = useState<'All' | HealthStatus>('All');
  const [sortBy, setSortBy] = useState<'openDays' | 'benchmarkSalaryUsd' | 'successionCoveragePct' | 'attritionRiskPct'>('openDays');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: '',
    title: '',
    department: '',
    businessUnit: 'Operations',
    location: '',
    gradeCode: 'G04',
    family: 'Professional',
    level: 'Mid',
    reportingTo: '',
    positionType: 'Permanent',
    positionStatus: 'Vacant',
    incumbentName: '',
    incumbentEmployeeId: '',
    benchmarkSalaryUsd: '0',
    fte: '1',
    criticality: 'Core',
    successionCoveragePct: '70',
    attritionRiskPct: '8',
    approvalCoveragePct: '90',
    healthStatus: 'Healthy',
    replacementPriority: 'Planned',
    standardPosition: true,
    openDays: '0',
    jobTitleCode: '',
    responsibilityScope: '',
    requiredCapabilities: '',
  });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/hris/organization/positions', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json?.status !== 'success') throw new Error(json?.error || 'Unable to load positions');
      const data = json.data as Payload;
      setPayload(data);
      setSelectedId((prev) => prev || data.positions[0]?.id || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load positions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const positions = payload?.positions || [];

  const visiblePositions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = positions.filter((position) => {
      if (businessUnitFilter !== 'All' && position.businessUnit !== businessUnitFilter) return false;
      if (gradeFilter !== 'All' && position.gradeCode !== gradeFilter) return false;
      if (typeFilter !== 'All' && position.positionType !== typeFilter) return false;
      if (statusFilter !== 'All' && position.positionStatus !== statusFilter) return false;
      if (criticalityFilter !== 'All' && position.criticality !== criticalityFilter) return false;
      if (healthFilter !== 'All' && position.healthStatus !== healthFilter) return false;
      if (!q) return true;

      return [
        position.code,
        position.title,
        position.department,
        position.businessUnit,
        position.location,
        position.reportingTo,
        position.incumbentName,
        position.responsibilityScope,
        position.requiredCapabilities.join(' '),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sortBy === 'benchmarkSalaryUsd') return b.benchmarkSalaryUsd - a.benchmarkSalaryUsd;
      if (sortBy === 'successionCoveragePct') return b.successionCoveragePct - a.successionCoveragePct;
      if (sortBy === 'attritionRiskPct') return b.attritionRiskPct - a.attritionRiskPct;
      return b.openDays - a.openDays;
    });
    return sorted;
  }, [positions, query, businessUnitFilter, gradeFilter, typeFilter, statusFilter, criticalityFilter, healthFilter, sortBy]);

  const selectedPosition = useMemo(() => visiblePositions.find((position) => position.id === selectedId) || visiblePositions[0] || null, [visiblePositions, selectedId]);

  useEffect(() => {
    if (!selectedPosition && visiblePositions.length) setSelectedId(visiblePositions[0].id);
  }, [selectedPosition, visiblePositions]);

  const exportCsv = () => {
    if (!payload?.permissions.canExport) return;
    const rows = [
      ['Code', 'Title', 'Department', 'Business Unit', 'Location', 'Grade', 'Type', 'Status', 'Criticality', 'Incumbent', 'Reporting To', 'Open Days', 'Succession Coverage %', 'Attrition Risk %', 'Approval Coverage %', 'Benchmark Salary USD'],
      ...visiblePositions.map((position) => [
        position.code,
        position.title,
        position.department,
        position.businessUnit,
        position.location,
        position.gradeCode,
        position.positionType,
        position.positionStatus,
        position.criticality,
        position.incumbentName || '—',
        position.reportingTo,
        String(position.openDays),
        String(position.successionCoveragePct),
        String(position.attritionRiskPct),
        String(position.approvalCoveragePct),
        String(position.benchmarkSalaryUsd),
      ]),
    ];

    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'positions.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const submitCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    const payload = {
      code: form.code,
      title: form.title,
      department: form.department,
      businessUnit: form.businessUnit,
      location: form.location,
      gradeCode: form.gradeCode,
      family: form.family as PositionRecord['family'],
      level: form.level as PositionRecord['level'],
      reportingTo: form.reportingTo,
      positionType: form.positionType as PositionRecord['positionType'],
      positionStatus: form.positionStatus as PositionRecord['positionStatus'],
      incumbentName: form.incumbentName || null,
      incumbentEmployeeId: form.incumbentEmployeeId || null,
      benchmarkSalaryUsd: Number(form.benchmarkSalaryUsd),
      fte: Number(form.fte),
      criticality: form.criticality as PositionRecord['criticality'],
      successionCoveragePct: Number(form.successionCoveragePct),
      attritionRiskPct: Number(form.attritionRiskPct),
      approvalCoveragePct: Number(form.approvalCoveragePct),
      healthStatus: form.healthStatus as HealthStatus,
      replacementPriority: form.replacementPriority as PositionRecord['replacementPriority'],
      standardPosition: form.standardPosition,
      openDays: Number(form.openDays),
      jobTitleCode: form.jobTitleCode,
      responsibilityScope: form.responsibilityScope,
      requiredCapabilities: form.requiredCapabilities.split(',').map((value) => value.trim()).filter(Boolean),
    };

    try {
      const res = await fetch('/api/hris/organization/positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || json?.status !== 'success') throw new Error(json?.error || 'Unable to create position');

      setShowCreateForm(false);
      setForm({
        code: '',
        title: '',
        department: '',
        businessUnit: 'Operations',
        location: '',
        gradeCode: 'G04',
        family: 'Professional',
        level: 'Mid',
        reportingTo: '',
        positionType: 'Permanent',
        positionStatus: 'Vacant',
        incumbentName: '',
        incumbentEmployeeId: '',
        benchmarkSalaryUsd: '0',
        fte: '1',
        criticality: 'Core',
        successionCoveragePct: '70',
        attritionRiskPct: '8',
        approvalCoveragePct: '90',
        healthStatus: 'Healthy',
        replacementPriority: 'Planned',
        standardPosition: true,
        openDays: '0',
        jobTitleCode: '',
        responsibilityScope: '',
        requiredCapabilities: '',
      });
      await load();
      setSelectedId(json.data.id);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unable to create position');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageTemplate
      title={pageTitle}
      description={pageDescription}
      breadcrumbs={[
        { label: 'HRIS', href: '/hris' },
        { label: 'Organization', href: '/hris/organization' },
        { label: breadcrumbLabel },
      ]}
      primaryAction={{ label: 'Add Position', onClick: () => setShowCreateForm((value) => !value), icon: Plus }}
      secondaryAction={{ label: 'Export CSV', onClick: exportCsv, icon: Download }}
    >
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">Persistence Mode</div>
          <div className="text-xs text-slate-500 mt-1">New positions are saved through the API into a local JSON store and remain available after page reload.</div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
        >
          <RefreshCcw className="w-4 h-4" />
          Reload Data
        </button>
      </div>

      {showCreateForm ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-slate-900">Add Position</div>
              <div className="text-xs text-slate-500 mt-1">Create a controlled position with title alignment, replacement posture, and required capability metadata.</div>
            </div>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
          </div>

          <form onSubmit={submitCreate} className="mt-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              <Field label="Position Code" value={form.code} onChange={(value) => setForm((prev) => ({ ...prev, code: value.toUpperCase() }))} placeholder="POS-OPS-101" />
              <Field label="Position Title" value={form.title} onChange={(value) => setForm((prev) => ({ ...prev, title: value }))} placeholder="Project Engineer" />
              <Field label="Department" value={form.department} onChange={(value) => setForm((prev) => ({ ...prev, department: value }))} placeholder="Engineering" />
              <Field label="Location" value={form.location} onChange={(value) => setForm((prev) => ({ ...prev, location: value }))} placeholder="Lagos HQ" />
              <SelectField label="Business Unit" value={form.businessUnit} onChange={(value) => setForm((prev) => ({ ...prev, businessUnit: value }))} options={['Operations', 'Projects', 'Corporate Services']} />
              <Field label="Grade Code" value={form.gradeCode} onChange={(value) => setForm((prev) => ({ ...prev, gradeCode: value.toUpperCase() }))} placeholder="G04" />
              <SelectField label="Family" value={form.family} onChange={(value) => setForm((prev) => ({ ...prev, family: value }))} options={['Executive', 'Management', 'Professional', 'Technical', 'Operations Support']} />
              <SelectField label="Level" value={form.level} onChange={(value) => setForm((prev) => ({ ...prev, level: value }))} options={['Strategic', 'Senior', 'Mid', 'Entry']} />
              <Field label="Reporting To" value={form.reportingTo} onChange={(value) => setForm((prev) => ({ ...prev, reportingTo: value }))} placeholder="Head, Engineering" />
              <SelectField label="Position Type" value={form.positionType} onChange={(value) => setForm((prev) => ({ ...prev, positionType: value }))} options={['Permanent', 'Contract', 'Project', 'Temporary']} />
              <SelectField label="Position Status" value={form.positionStatus} onChange={(value) => setForm((prev) => ({ ...prev, positionStatus: value }))} options={['Filled', 'Vacant', 'Frozen', 'Under Review']} />
              <SelectField label="Criticality" value={form.criticality} onChange={(value) => setForm((prev) => ({ ...prev, criticality: value }))} options={['Critical', 'Core', 'Support']} />
              <Field label="Benchmark Salary USD" type="number" value={form.benchmarkSalaryUsd} onChange={(value) => setForm((prev) => ({ ...prev, benchmarkSalaryUsd: value }))} />
              <Field label="FTE" type="number" value={form.fte} onChange={(value) => setForm((prev) => ({ ...prev, fte: value }))} />
              <Field label="Succession Coverage %" type="number" value={form.successionCoveragePct} onChange={(value) => setForm((prev) => ({ ...prev, successionCoveragePct: value }))} />
              <Field label="Attrition Risk %" type="number" value={form.attritionRiskPct} onChange={(value) => setForm((prev) => ({ ...prev, attritionRiskPct: value }))} />
              <Field label="Approval Coverage %" type="number" value={form.approvalCoveragePct} onChange={(value) => setForm((prev) => ({ ...prev, approvalCoveragePct: value }))} />
              <SelectField label="Health Status" value={form.healthStatus} onChange={(value) => setForm((prev) => ({ ...prev, healthStatus: value }))} options={['Healthy', 'Needs Attention', 'Critical']} />
              <SelectField label="Replacement Priority" value={form.replacementPriority} onChange={(value) => setForm((prev) => ({ ...prev, replacementPriority: value }))} options={['Immediate', 'Planned', 'Monitor']} />
              <Field label="Open Days" type="number" value={form.openDays} onChange={(value) => setForm((prev) => ({ ...prev, openDays: value }))} />
              <Field label="Job Title Code" value={form.jobTitleCode} onChange={(value) => setForm((prev) => ({ ...prev, jobTitleCode: value.toUpperCase() }))} placeholder="JT-006" />
              <Field label="Incumbent Name" value={form.incumbentName} onChange={(value) => setForm((prev) => ({ ...prev, incumbentName: value }))} placeholder="Required for filled positions" />
              <Field label="Incumbent Employee ID" value={form.incumbentEmployeeId} onChange={(value) => setForm((prev) => ({ ...prev, incumbentEmployeeId: value.toUpperCase() }))} placeholder="DLE-EMP-12345" />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[220px_1fr_1fr] gap-3 items-start">
              <label className="block">
                <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1.5">Standard Position</div>
                <select
                  value={form.standardPosition ? 'Yes' : 'No'}
                  onChange={(e) => setForm((prev) => ({ ...prev, standardPosition: e.target.value === 'Yes' }))}
                  className="w-full py-2.5 px-3 rounded-xl border border-slate-200 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-dle-blue/20"
                >
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </label>
              <TextAreaField
                label="Required Capabilities"
                value={form.requiredCapabilities}
                onChange={(value) => setForm((prev) => ({ ...prev, requiredCapabilities: value }))}
                placeholder="Engineering execution, Site coordination, Technical documentation"
                helper="Comma-separated capability list."
              />
              <TextAreaField
                label="Responsibility Scope"
                value={form.responsibilityScope}
                onChange={(value) => setForm((prev) => ({ ...prev, responsibilityScope: value }))}
                placeholder="Describe the accountability, operating scope, and purpose of this position."
              />
            </div>

            {submitError ? <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">{submitError}</div> : null}

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-dle-blue text-white rounded-lg text-sm font-medium hover:bg-dle-blue-deep transition-colors shadow-sm disabled:opacity-60"
              >
                {submitting ? 'Creating...' : 'Create Position'}
              </button>
              <span className="text-xs text-slate-500">Validation enforces unique codes, valid enums, filled-position incumbent rules, and non-empty capabilities.</span>
            </div>
          </form>
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
        <MetricCard icon={BriefcaseBusiness} label="Positions" value={payload ? formatNumber(payload.summary.totalPositions) : '—'} detail="Tracked approved positions" />
        <MetricCard icon={Users} label="Incumbents" value={payload ? formatNumber(payload.summary.totalIncumbents) : '—'} detail="Filled positions with owners" />
        <MetricCard icon={ArrowUpRight} label="Vacant" value={payload ? formatNumber(payload.summary.totalVacant) : '—'} detail="Open or unfilled seats" />
        <MetricCard icon={ShieldCheck} label="Succession" value={payload ? `${payload.summary.avgSuccessionCoverage}%` : '—'} detail="Average replacement readiness" />
        <MetricCard icon={AlertTriangle} label="Critical Roles" value={payload ? formatNumber(payload.summary.criticalPositions) : '—'} detail="Critical business positions" />
        <MetricCard icon={BriefcaseBusiness} label="Non-Standard" value={payload ? formatNumber(payload.summary.nonStandardPositions) : '—'} detail="Positions outside standard design" />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
        <label className="relative xl:col-span-2">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search position, code, incumbent, or scope..."
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-dle-blue/20"
          />
        </label>
        <Select value={businessUnitFilter} onChange={(value) => setBusinessUnitFilter(value as 'All' | string)} options={['All', ...(payload?.filterOptions.businessUnits || [])]} labels={{ All: 'All Business Units' }} />
        <Select value={gradeFilter} onChange={(value) => setGradeFilter(value as 'All' | string)} options={['All', ...(payload?.filterOptions.grades || [])]} labels={{ All: 'All Grades' }} />
        <Select value={typeFilter} onChange={(value) => setTypeFilter(value as 'All' | string)} options={['All', ...(payload?.filterOptions.positionTypes || [])]} labels={{ All: 'All Position Types' }} />
        <Select value={healthFilter} onChange={(value) => setHealthFilter(value as 'All' | HealthStatus)} options={['All', ...(payload?.filterOptions.healthStatuses || [])]} labels={{ All: 'All Health States' }} />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex flex-col xl:flex-row gap-3 xl:items-center xl:justify-between">
        <div className="grid grid-cols-1 md:grid-cols-[220px_220px_220px] gap-3">
          <Select value={statusFilter} onChange={(value) => setStatusFilter(value as 'All' | string)} options={['All', ...(payload?.filterOptions.positionStatuses || [])]} labels={{ All: 'All Statuses' }} />
          <Select value={criticalityFilter} onChange={(value) => setCriticalityFilter(value as 'All' | string)} options={['All', ...(payload?.filterOptions.criticalities || [])]} labels={{ All: 'All Criticalities' }} />
          <Select
            value={sortBy}
            onChange={(value) => setSortBy(value as typeof sortBy)}
            options={['openDays', 'benchmarkSalaryUsd', 'successionCoveragePct', 'attritionRiskPct']}
            labels={{
              openDays: 'Sort: Open Days',
              benchmarkSalaryUsd: 'Sort: Salary',
              successionCoveragePct: 'Sort: Succession',
              attritionRiskPct: 'Sort: Attrition',
            }}
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setQuery('');
            setBusinessUnitFilter('All');
            setGradeFilter('All');
            setTypeFilter('All');
            setStatusFilter('All');
            setCriticalityFilter('All');
            setHealthFilter('All');
            setSortBy('openDays');
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
              <div className="text-sm font-bold text-slate-900">Position Explorer</div>
              <div className="text-xs text-slate-500 mt-1">Browse positions by vacancy, criticality, grade alignment, and replacement exposure.</div>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold">Showing: {formatNumber(visiblePositions.length)}</span>
          </div>
          <div className="p-4 space-y-3 min-h-[520px]">
            {loading ? (
              <div className="text-sm text-slate-600 font-medium">Loading positions...</div>
            ) : error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 font-medium">{error}</div>
            ) : visiblePositions.length ? (
              visiblePositions.map((position) => {
                const active = selectedPosition?.id === position.id;
                return (
                  <button
                    key={position.id}
                    type="button"
                    onClick={() => setSelectedId(position.id)}
                    className={`w-full text-left rounded-2xl border p-4 transition-colors ${active ? 'border-dle-blue/30 bg-dle-blue/5' : 'border-slate-200 hover:bg-slate-50'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900">{position.title}</div>
                        <div className="text-xs text-slate-500 mt-1">
                          {position.code} <span className="mx-2">•</span> {position.gradeCode} <span className="mx-2">•</span> {position.positionType}
                        </div>
                      </div>
                      <span className={`px-2 py-1 rounded-full border text-[11px] font-semibold ${statusTone(position.positionStatus)}`}>{position.positionStatus}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-slate-600">
                      <span>Incumbent: {position.incumbentName || 'Unassigned'}</span>
                      <span>Open Days: {formatNumber(position.openDays)}</span>
                      <span>Criticality: {position.criticality}</span>
                      <span>Approval: {position.approvalCoveragePct}%</span>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="text-sm text-slate-600 font-medium">No positions match the current filters.</div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="text-sm font-bold text-slate-900">Position Detail</div>
              <div className="text-xs text-slate-500 mt-1">Inspect incumbency, title alignment, approval readiness, and replacement posture for the selected position.</div>
            </div>
            <div className="p-5">
              {selectedPosition ? (
                <div className="space-y-5">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold">{selectedPosition.code}</span>
                      <span className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold ${statusTone(selectedPosition.positionStatus)}`}>{selectedPosition.positionStatus}</span>
                      <span className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold ${healthTone(selectedPosition.healthStatus)}`}>{selectedPosition.healthStatus}</span>
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 mt-3">{selectedPosition.title}</h3>
                    <p className="text-sm text-slate-500 mt-1">{selectedPosition.responsibilityScope}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <DetailStat label="Department" value={selectedPosition.department} />
                    <DetailStat label="Business Unit" value={selectedPosition.businessUnit} />
                    <DetailStat label="Location" value={selectedPosition.location} />
                    <DetailStat label="Reporting To" value={selectedPosition.reportingTo} />
                    <DetailStat label="Grade" value={selectedPosition.gradeCode} />
                    <DetailStat label="Family / Level" value={`${selectedPosition.family} • ${selectedPosition.level}`} />
                    <DetailStat label="Type" value={selectedPosition.positionType} />
                    <DetailStat label="Criticality" value={selectedPosition.criticality} />
                    <DetailStat label="Incumbent" value={selectedPosition.incumbentName || 'Unassigned'} />
                    <DetailStat label="Employee ID" value={selectedPosition.incumbentEmployeeId || '—'} />
                    <DetailStat label="Benchmark Salary" value={formatCurrency(selectedPosition.benchmarkSalaryUsd)} />
                    <DetailStat label="Replacement Priority" value={selectedPosition.replacementPriority} />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <ProgressCard label="Succession Coverage" value={selectedPosition.successionCoveragePct} tone="emerald" />
                    <ProgressCard label="Attrition Risk" value={selectedPosition.attritionRiskPct} tone="amber" />
                    <ProgressCard label="Approval Coverage" value={selectedPosition.approvalCoveragePct} tone="blue" />
                    <ProgressCard label="Open Days" value={Math.min(selectedPosition.openDays, 100)} display={`${selectedPosition.openDays}`} tone="slate" />
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-sm font-semibold text-slate-900">Position Architecture</div>
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <DetailStat label="Job Title Code" value={selectedPosition.jobTitleCode} />
                      <DetailStat label="Standard Position" value={selectedPosition.standardPosition ? 'Yes' : 'No'} />
                      <DetailStat label="FTE" value={`${selectedPosition.fte}`} />
                      <DetailStat label="Status" value={selectedPosition.positionStatus} />
                    </div>
                  </div>

                  <InfoListCard title="Required Capabilities" items={selectedPosition.requiredCapabilities} />
                </div>
              ) : (
                <div className="text-sm text-slate-600">Select a position to inspect its control and replacement details.</div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <div>
                <div className="text-sm font-bold text-slate-900">Position Insights</div>
                <div className="text-xs text-slate-500 mt-1">Priority observations for vacancy exposure, position drift, and replacement planning.</div>
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
          <div className="text-sm font-bold text-slate-900">Position Registry</div>
          <div className="text-xs text-slate-500 mt-1">Searchable audit table of positions, incumbents, vacancy status, and alignment controls.</div>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50">
              <tr>
                {['Code', 'Title', 'Grade', 'Business Unit', 'Status', 'Criticality', 'Incumbent', 'Open Days', 'Health'].map((header) => (
                  <th key={header} className="px-4 py-3 text-[11px] font-semibold text-slate-600 uppercase tracking-wide whitespace-nowrap">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visiblePositions.map((position) => (
                <tr key={position.id} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setSelectedId(position.id)}>
                  <td className="px-4 py-3 text-sm font-semibold text-slate-900">{position.code}</td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-semibold text-slate-900">{position.title}</div>
                    <div className="text-xs text-slate-500">{position.department}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">{position.gradeCode}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{position.businessUnit}</td>
                  <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold ${statusTone(position.positionStatus)}`}>{position.positionStatus}</span></td>
                  <td className="px-4 py-3 text-sm text-slate-700">{position.criticality}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{position.incumbentName || 'Unassigned'}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{formatNumber(position.openDays)}</td>
                  <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold ${healthTone(position.healthStatus)}`}>{position.healthStatus}</span></td>
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
  tone: 'emerald' | 'amber' | 'blue' | 'slate';
  display?: string;
}) {
  const styles = tone === 'emerald' ? 'bg-emerald-500' : tone === 'amber' ? 'bg-amber-500' : tone === 'slate' ? 'bg-slate-500' : 'bg-blue-500';
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

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1.5">{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full py-2.5 px-3 rounded-xl border border-slate-200 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-dle-blue/20"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="block">
      <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1.5">{label}</div>
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
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  helper,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  helper?: string;
}) {
  return (
    <label className="block">
      <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1.5">{label}</div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={5}
        className="w-full py-2.5 px-3 rounded-xl border border-slate-200 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-dle-blue/20 resize-y"
      />
      {helper ? <div className="text-[11px] text-slate-500 mt-1.5">{helper}</div> : null}
    </label>
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
