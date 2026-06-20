'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageTemplate } from '@/components/layout/page-template';
import {
  AlertTriangle,
  ArrowUpRight,
  BriefcaseBusiness,
  Database,
  Download,
  Plus,
  RefreshCcw,
  Search,
  ShieldCheck,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { HealthStatus, JobGradeRecord, StructureInsight } from '@/lib/organization-data';

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
    migratedGradeCount: number;
    migrationWarning: string | null;
    independence: string;
  };
  summary: {
    totalGrades: number;
    totalEmployees: number;
    totalOpenPositions: number;
    avgSuccessionCoverage: number;
    avgAttritionRisk: number;
    avgInternalMobility: number;
    criticalGrades: number;
    needsAttentionGrades: number;
  };
  filterOptions: {
    families: string[];
    levels: string[];
    healthStatuses: HealthStatus[];
  };
  grades: JobGradeRecord[];
  insights: StructureInsight[];
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

export default function JobGradesClient() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [query, setQuery] = useState('');
  const [familyFilter, setFamilyFilter] = useState<'All' | string>('All');
  const [levelFilter, setLevelFilter] = useState<'All' | string>('All');
  const [healthFilter, setHealthFilter] = useState<'All' | HealthStatus>('All');
  const [sortBy, setSortBy] = useState<'employeeCount' | 'openPositions' | 'successionCoveragePct' | 'attritionRiskPct'>('employeeCount');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: '',
    name: '',
    family: 'Professional',
    level: 'Mid',
    minSalaryNgn: '0',
    midpointSalaryNgn: '0',
    maxSalaryNgn: '0',
    employeeCount: '0',
    openPositions: '0',
    successionCoveragePct: '70',
    attritionRiskPct: '8',
    internalMobilityPct: '20',
    averageTenureYears: '4',
    femaleRepresentationPct: '30',
    healthStatus: 'Healthy',
    benchmarkPosition: '',
    nextGradeCode: '',
    keyRoles: '',
    gradeMix: '',
    description: '',
  });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/hris/organization/job-grades', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json?.status !== 'success') throw new Error(json?.error || 'Unable to load job grades');
      const data = json.data as Payload;
      setPayload(data);
      setSelectedId((prev) => prev || data.grades[0]?.id || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load job grades');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const grades = useMemo(() => payload?.grades || [], [payload]);

  const visibleGrades = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = grades.filter((grade) => {
      if (familyFilter !== 'All' && grade.family !== familyFilter) return false;
      if (levelFilter !== 'All' && grade.level !== levelFilter) return false;
      if (healthFilter !== 'All' && grade.healthStatus !== healthFilter) return false;
      if (!q) return true;

      return [
        grade.code,
        grade.name,
        grade.family,
        grade.level,
        grade.benchmarkPosition,
        grade.keyRoles.join(' '),
        grade.description,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sortBy === 'successionCoveragePct') return b.successionCoveragePct - a.successionCoveragePct;
      if (sortBy === 'attritionRiskPct') return b.attritionRiskPct - a.attritionRiskPct;
      if (sortBy === 'openPositions') return b.openPositions - a.openPositions;
      return b.employeeCount - a.employeeCount;
    });
    return sorted;
  }, [grades, query, familyFilter, levelFilter, healthFilter, sortBy]);

  const selectedGrade = useMemo(() => {
    return visibleGrades.find((grade) => grade.id === selectedId) || visibleGrades[0] || null;
  }, [visibleGrades, selectedId]);

  useEffect(() => {
    if (!selectedGrade && visibleGrades.length) setSelectedId(visibleGrades[0].id);
  }, [selectedGrade, visibleGrades]);

  const exportCsv = () => {
    if (!payload?.permissions.canExport) return;
    const rows = [
      [
        'Code',
        'Name',
        'Family',
        'Level',
        'Benchmark Position',
        'Employee Count',
        'Open Positions',
        'Succession Coverage %',
        'Attrition Risk %',
        'Internal Mobility %',
        'Average Tenure Years',
        'Female Representation %',
        'Min Salary NGN',
        'Midpoint Salary NGN',
        'Max Salary NGN',
      ],
      ...visibleGrades.map((grade) => [
        grade.code,
        grade.name,
        grade.family,
        grade.level,
        grade.benchmarkPosition,
        String(grade.employeeCount),
        String(grade.openPositions),
        String(grade.successionCoveragePct),
        String(grade.attritionRiskPct),
        String(grade.internalMobilityPct),
        String(grade.averageTenureYears),
        String(grade.femaleRepresentationPct),
        String(grade.minSalaryNgn),
        String(grade.midpointSalaryNgn),
        String(grade.maxSalaryNgn),
      ]),
    ];

    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'job-grades.csv';
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
      name: form.name,
      family: form.family as JobGradeRecord['family'],
      level: form.level as JobGradeRecord['level'],
      minSalaryNgn: Number(form.minSalaryNgn),
      midpointSalaryNgn: Number(form.midpointSalaryNgn),
      maxSalaryNgn: Number(form.maxSalaryNgn),
      employeeCount: Number(form.employeeCount),
      openPositions: Number(form.openPositions),
      successionCoveragePct: Number(form.successionCoveragePct),
      attritionRiskPct: Number(form.attritionRiskPct),
      internalMobilityPct: Number(form.internalMobilityPct),
      averageTenureYears: Number(form.averageTenureYears),
      femaleRepresentationPct: Number(form.femaleRepresentationPct),
      healthStatus: form.healthStatus as HealthStatus,
      benchmarkPosition: form.benchmarkPosition,
      nextGradeCode: form.nextGradeCode || null,
      keyRoles: form.keyRoles.split(',').map((v) => v.trim()).filter(Boolean),
      gradeMix: form.gradeMix
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [unit, count] = line.split(':');
          return { unit: unit?.trim() || '', headcount: Number((count || '').trim()) };
        }),
      description: form.description,
    };

    try {
      const res = await fetch('/api/hris/organization/job-grades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || json?.status !== 'success') throw new Error(json?.error || 'Unable to create job grade');

      setShowCreateForm(false);
      setForm({
        code: '',
        name: '',
        family: 'Professional',
        level: 'Mid',
        minSalaryNgn: '0',
        midpointSalaryNgn: '0',
        maxSalaryNgn: '0',
        employeeCount: '0',
        openPositions: '0',
        successionCoveragePct: '70',
        attritionRiskPct: '8',
        internalMobilityPct: '20',
        averageTenureYears: '4',
        femaleRepresentationPct: '30',
        healthStatus: 'Healthy',
        benchmarkPosition: '',
        nextGradeCode: '',
        keyRoles: '',
        gradeMix: '',
        description: '',
      });
      await load();
      setSelectedId(json.data.id);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unable to create job grade');
    } finally {
      setSubmitting(false);
    }
  };

  const salarySpreadPct = selectedGrade
    ? Math.round((((selectedGrade.maxSalaryNgn - selectedGrade.minSalaryNgn) / selectedGrade.midpointSalaryNgn) * 100) * 10) / 10
    : 0;

  return (
    <PageTemplate
      title="Job Grades"
      description="Review grade bands, workforce concentration, internal mobility, succession readiness, and salary band governance across the organization."
      breadcrumbs={[
        { label: 'HRIS', href: '/hris' },
        { label: 'Organization', href: '/hris/organization' },
        { label: 'Job Grades' },
      ]}
      primaryAction={{ label: 'Add Job Grade', onClick: () => setShowCreateForm((v) => !v), icon: Plus }}
      secondaryAction={{ label: 'Export CSV', onClick: exportCsv, icon: Download }}
    >
      {payload?.dataSource ? (
        <div className={`rounded-2xl border p-4 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 ${payload.dataSource.warning || payload.dataSource.migrationWarning ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
          <div className="flex items-start gap-3">
            <span className={`w-10 h-10 rounded-2xl flex items-center justify-center ${payload.dataSource.warning || payload.dataSource.migrationWarning ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
              <Database className="w-5 h-5" />
            </span>
            <div>
              <div className="text-sm font-bold text-slate-900">Live job grade migration source</div>
              <div className="text-xs text-slate-600 mt-1">
                {payload.dataSource.structureSource} from {payload.dataSource.source}; {formatNumber(payload.dataSource.employeeCount)} employee records produced {formatNumber(payload.dataSource.migratedGradeCount)} HRIS job grade records.
              </div>
              {payload.dataSource.warning || payload.dataSource.migrationWarning ? (
                <div className="text-xs font-semibold text-amber-800 mt-2">{payload.dataSource.warning || payload.dataSource.migrationWarning}</div>
              ) : (
                <div className="text-xs font-semibold text-emerald-800 mt-2">{payload.dataSource.independence}</div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-1 rounded-full bg-white/80 border border-slate-200 text-[11px] font-semibold text-slate-700">
              HRIS DB: {payload.dataSource.databaseAvailable ? 'Available' : 'Unavailable'}
            </span>
            <span className="px-2.5 py-1 rounded-full bg-white/80 border border-slate-200 text-[11px] font-semibold text-slate-700">
              Generated: {new Date(payload.generatedAt).toLocaleString()}
            </span>
          </div>
        </div>
      ) : null}

      {showCreateForm ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-slate-900">Add Job Grade</div>
              <div className="text-xs text-slate-500 mt-1">Create a grade band with compensation range, workforce metrics, role coverage, and unit distribution.</div>
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
              <Field label="Grade Code" value={form.code} onChange={(value) => setForm((prev) => ({ ...prev, code: value.toUpperCase() }))} placeholder="G07" />
              <Field label="Grade Name" value={form.name} onChange={(value) => setForm((prev) => ({ ...prev, name: value }))} placeholder="Senior Technical Lead" />
              <SelectField label="Family" value={form.family} onChange={(value) => setForm((prev) => ({ ...prev, family: value }))} options={['Executive', 'Management', 'Professional', 'Technical', 'Operations Support']} />
              <SelectField label="Level" value={form.level} onChange={(value) => setForm((prev) => ({ ...prev, level: value }))} options={['Strategic', 'Senior', 'Mid', 'Entry']} />
              <Field label="Min Salary NGN" type="number" value={form.minSalaryNgn} onChange={(value) => setForm((prev) => ({ ...prev, minSalaryNgn: value }))} />
              <Field label="Midpoint Salary NGN" type="number" value={form.midpointSalaryNgn} onChange={(value) => setForm((prev) => ({ ...prev, midpointSalaryNgn: value }))} />
              <Field label="Max Salary NGN" type="number" value={form.maxSalaryNgn} onChange={(value) => setForm((prev) => ({ ...prev, maxSalaryNgn: value }))} />
              <Field label="Benchmark Position" value={form.benchmarkPosition} onChange={(value) => setForm((prev) => ({ ...prev, benchmarkPosition: value }))} placeholder="Senior Technical Lead" />
              <Field label="Employee Count" type="number" value={form.employeeCount} onChange={(value) => setForm((prev) => ({ ...prev, employeeCount: value }))} />
              <Field label="Open Positions" type="number" value={form.openPositions} onChange={(value) => setForm((prev) => ({ ...prev, openPositions: value }))} />
              <Field label="Succession Coverage %" type="number" value={form.successionCoveragePct} onChange={(value) => setForm((prev) => ({ ...prev, successionCoveragePct: value }))} />
              <Field label="Attrition Risk %" type="number" value={form.attritionRiskPct} onChange={(value) => setForm((prev) => ({ ...prev, attritionRiskPct: value }))} />
              <Field label="Internal Mobility %" type="number" value={form.internalMobilityPct} onChange={(value) => setForm((prev) => ({ ...prev, internalMobilityPct: value }))} />
              <Field label="Average Tenure Years" type="number" value={form.averageTenureYears} onChange={(value) => setForm((prev) => ({ ...prev, averageTenureYears: value }))} />
              <Field label="Female Representation %" type="number" value={form.femaleRepresentationPct} onChange={(value) => setForm((prev) => ({ ...prev, femaleRepresentationPct: value }))} />
              <SelectField label="Health Status" value={form.healthStatus} onChange={(value) => setForm((prev) => ({ ...prev, healthStatus: value }))} options={['Healthy', 'Needs Attention', 'Critical']} />
              <Field label="Next Grade Code" value={form.nextGradeCode} onChange={(value) => setForm((prev) => ({ ...prev, nextGradeCode: value.toUpperCase() }))} placeholder="G08" />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
              <TextAreaField
                label="Key Roles"
                value={form.keyRoles}
                onChange={(value) => setForm((prev) => ({ ...prev, keyRoles: value }))}
                placeholder="Lead Project Engineer, Senior Planner, Technical Lead"
                helper="Comma-separated list of roles in this grade."
              />
              <TextAreaField
                label="Grade Mix By Unit"
                value={form.gradeMix}
                onChange={(value) => setForm((prev) => ({ ...prev, gradeMix: value }))}
                placeholder={`Operations Division: 12\nProjects Division: 8\nCorporate Services: 4`}
                helper="One line per unit in `Unit: count` format. Total must equal employee count."
              />
              <TextAreaField
                label="Description"
                value={form.description}
                onChange={(value) => setForm((prev) => ({ ...prev, description: value }))}
                placeholder="Describe the scope, expectations, and governance role of this grade."
                helper="Used in the grade detail panel and registry."
              />
            </div>

            {submitError ? <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">{submitError}</div> : null}

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-dle-blue text-white rounded-lg text-sm font-medium hover:bg-dle-blue-deep transition-colors shadow-sm disabled:opacity-60"
              >
                {submitting ? 'Creating...' : 'Create Job Grade'}
              </button>
              <span className="text-xs text-slate-500">Validation enforces unique code, valid salary band order, and grade-mix total alignment.</span>
            </div>
          </form>
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
        <MetricCard icon={BriefcaseBusiness} label="Grades" value={payload ? formatNumber(payload.summary.totalGrades) : '—'} detail="Configured grade bands" />
        <MetricCard icon={Users} label="Employees" value={payload ? formatNumber(payload.summary.totalEmployees) : '—'} detail="Mapped workforce population" />
        <MetricCard icon={ArrowUpRight} label="Open Roles" value={payload ? formatNumber(payload.summary.totalOpenPositions) : '—'} detail="Approved vacancies by grade" />
        <MetricCard icon={ShieldCheck} label="Succession" value={payload ? `${payload.summary.avgSuccessionCoverage}%` : '—'} detail="Average coverage strength" />
        <MetricCard icon={AlertTriangle} label="Attrition Risk" value={payload ? `${payload.summary.avgAttritionRisk}%` : '—'} detail="Average grade pressure" />
        <MetricCard icon={TrendingUp} label="Mobility" value={payload ? `${payload.summary.avgInternalMobility}%` : '—'} detail="Average internal movement" />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
        <label className="relative xl:col-span-2">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search grade, family, benchmark, or key role..."
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-dle-blue/20"
          />
        </label>
        <Select value={familyFilter} onChange={(value) => setFamilyFilter(value as 'All' | string)} options={['All', ...(payload?.filterOptions.families || [])]} labels={{ All: 'All Families' }} />
        <Select value={levelFilter} onChange={(value) => setLevelFilter(value as 'All' | string)} options={['All', ...(payload?.filterOptions.levels || [])]} labels={{ All: 'All Levels' }} />
        <Select value={healthFilter} onChange={(value) => setHealthFilter(value as 'All' | HealthStatus)} options={['All', ...(payload?.filterOptions.healthStatuses || [])]} labels={{ All: 'All Health States' }} />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex flex-col xl:flex-row gap-3 xl:items-center xl:justify-between">
        <div className="grid grid-cols-1 md:grid-cols-[240px] gap-3">
          <Select
            value={sortBy}
            onChange={(value) => setSortBy(value as typeof sortBy)}
            options={['employeeCount', 'openPositions', 'successionCoveragePct', 'attritionRiskPct']}
            labels={{
              employeeCount: 'Sort: Employee Count',
              openPositions: 'Sort: Open Positions',
              successionCoveragePct: 'Sort: Succession',
              attritionRiskPct: 'Sort: Attrition',
            }}
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setQuery('');
            setFamilyFilter('All');
            setLevelFilter('All');
            setHealthFilter('All');
            setSortBy('employeeCount');
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
              <div className="text-sm font-bold text-slate-900">Grade Explorer</div>
              <div className="text-xs text-slate-500 mt-1">Browse grade bands by population, risk, and progression readiness.</div>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold">
              Showing: {formatNumber(visibleGrades.length)}
            </span>
          </div>
          <div className="p-4 space-y-3 min-h-[520px]">
            {loading ? (
              <div className="text-sm text-slate-600 font-medium">Loading job grades...</div>
            ) : error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 font-medium">{error}</div>
            ) : visibleGrades.length ? (
              visibleGrades.map((grade) => {
                const active = selectedGrade?.id === grade.id;
                return (
                  <button
                    key={grade.id}
                    type="button"
                    onClick={() => setSelectedId(grade.id)}
                    className={`w-full text-left rounded-2xl border p-4 transition-colors ${active ? 'border-dle-blue/30 bg-dle-blue/5' : 'border-slate-200 hover:bg-slate-50'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900">{grade.code} • {grade.name}</div>
                        <div className="text-xs text-slate-500 mt-1">
                          {grade.family} <span className="mx-2">•</span> {grade.level} <span className="mx-2">•</span> {grade.benchmarkPosition}
                        </div>
                      </div>
                      <span className={`px-2 py-1 rounded-full border text-[11px] font-semibold ${healthTone(grade.healthStatus)}`}>
                        {grade.healthStatus}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-slate-600">
                      <span>Employees: {formatNumber(grade.employeeCount)}</span>
                      <span>Open Roles: {formatNumber(grade.openPositions)}</span>
                      <span>Succession: {grade.successionCoveragePct}%</span>
                      <span>Attrition: {grade.attritionRiskPct}%</span>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="text-sm text-slate-600 font-medium">No grades match the current filters.</div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="text-sm font-bold text-slate-900">Grade Detail</div>
              <div className="text-xs text-slate-500 mt-1">Compensation band, workforce mix, and governance indicators for the selected grade.</div>
            </div>
            <div className="p-5">
              {selectedGrade ? (
                <div className="space-y-5">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold">{selectedGrade.code}</span>
                      <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold">{selectedGrade.family}</span>
                      <span className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold ${healthTone(selectedGrade.healthStatus)}`}>
                        {selectedGrade.healthStatus}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 mt-3">{selectedGrade.name}</h3>
                    <p className="text-sm text-slate-500 mt-1">{selectedGrade.description}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <DetailStat label="Benchmark" value={selectedGrade.benchmarkPosition} />
                    <DetailStat label="Next Grade" value={selectedGrade.nextGradeCode || 'Top Grade'} />
                    <DetailStat label="Employees" value={formatNumber(selectedGrade.employeeCount)} />
                    <DetailStat label="Open Roles" value={formatNumber(selectedGrade.openPositions)} />
                    <DetailStat label="Min Salary" value={formatCurrency(selectedGrade.minSalaryNgn)} />
                    <DetailStat label="Midpoint" value={formatCurrency(selectedGrade.midpointSalaryNgn)} />
                    <DetailStat label="Max Salary" value={formatCurrency(selectedGrade.maxSalaryNgn)} />
                    <DetailStat label="Salary Spread" value={`${salarySpreadPct}%`} />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <ProgressCard label="Succession Coverage" value={selectedGrade.successionCoveragePct} tone="emerald" />
                    <ProgressCard label="Attrition Risk" value={selectedGrade.attritionRiskPct} tone="amber" />
                    <ProgressCard label="Internal Mobility" value={selectedGrade.internalMobilityPct} tone="blue" />
                    <ProgressCard label="Female Representation" value={selectedGrade.femaleRepresentationPct} tone="purple" />
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-sm font-semibold text-slate-900">Role Coverage</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedGrade.keyRoles.map((role) => (
                        <span key={role} className="px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-medium text-slate-700">
                          {role}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-slate-900">Grade Mix By Unit</div>
                      <span className="text-xs text-slate-500">Average tenure: {selectedGrade.averageTenureYears} years</span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {selectedGrade.gradeMix.map((mix) => (
                        <div key={mix.unit} className="rounded-2xl border border-slate-200 bg-white p-3 flex items-center justify-between gap-3">
                          <span className="text-sm font-medium text-slate-900">{mix.unit}</span>
                          <span className="text-xs font-semibold text-slate-600">{formatNumber(mix.headcount)} employees</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-slate-600">Select a grade to inspect its compensation and workforce detail.</div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <div>
                <div className="text-sm font-bold text-slate-900">Grade Insights</div>
                <div className="text-xs text-slate-500 mt-1">Priority observations for grade governance, succession, and workforce concentration.</div>
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
          <div className="text-sm font-bold text-slate-900">Grade Registry</div>
          <div className="text-xs text-slate-500 mt-1">Searchable audit table of all visible job grade bands.</div>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50">
              <tr>
                {['Code', 'Name', 'Family', 'Level', 'Employees', 'Open Roles', 'Succession', 'Attrition', 'Mobility', 'Health'].map((header) => (
                  <th key={header} className="px-4 py-3 text-[11px] font-semibold text-slate-600 uppercase tracking-wide whitespace-nowrap">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleGrades.map((grade) => (
                <tr key={grade.id} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setSelectedId(grade.id)}>
                  <td className="px-4 py-3 text-sm font-semibold text-slate-900">{grade.code}</td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-semibold text-slate-900">{grade.name}</div>
                    <div className="text-xs text-slate-500">{grade.benchmarkPosition}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">{grade.family}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{grade.level}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{formatNumber(grade.employeeCount)}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{formatNumber(grade.openPositions)}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{grade.successionCoveragePct}%</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{grade.attritionRiskPct}%</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{grade.internalMobilityPct}%</td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold ${healthTone(grade.healthStatus)}`}>{grade.healthStatus}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PageTemplate>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: any;
  label: string;
  value: string;
  detail: string;
}) {
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
}: {
  label: string;
  value: number;
  tone: 'emerald' | 'amber' | 'blue' | 'purple';
}) {
  const styles =
    tone === 'emerald'
      ? 'bg-emerald-500'
      : tone === 'amber'
        ? 'bg-amber-500'
        : tone === 'purple'
          ? 'bg-violet-500'
          : 'bg-blue-500';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-semibold text-slate-600">{label}</div>
      <div className="text-lg font-bold text-slate-900 mt-1">{value}%</div>
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
