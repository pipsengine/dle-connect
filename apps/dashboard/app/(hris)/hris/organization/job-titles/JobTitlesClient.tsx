'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageTemplate } from '@/components/layout/page-template';
import {
  AlertTriangle,
  ArrowUpRight,
  BriefcaseBusiness,
  Building2,
  Download,
  RefreshCcw,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { HealthStatus, JobTitleRecord, StructureInsight } from '@/lib/organization-data';

type Payload = {
  generatedAt: string;
  permissions: {
    canEdit: boolean;
    canExport: boolean;
    canViewCosts: boolean;
  };
  summary: {
    totalTitles: number;
    totalEmployees: number;
    totalOpenPositions: number;
    avgSuccessionCoverage: number;
    avgAttritionRisk: number;
    avgInternalMobility: number;
    titlesNeedingReview: number;
    titleVariants: number;
  };
  filterOptions: {
    families: string[];
    levels: string[];
    grades: string[];
    reportingLevels: string[];
    standardizationStatuses: string[];
    healthStatuses: HealthStatus[];
  };
  titles: JobTitleRecord[];
  insights: StructureInsight[];
};

const formatNumber = (value: number) => new Intl.NumberFormat('en-US').format(value);
const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

const healthTone = (status: HealthStatus) => {
  if (status === 'Critical') return 'bg-red-50 text-red-700 border-red-200';
  if (status === 'Needs Attention') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
};

const standardizationTone = (status: string) => {
  if (status === 'Needs Review') return 'bg-red-50 text-red-700 border-red-200';
  if (status === 'Variant') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
};

const insightTone = (severity: StructureInsight['severity']) => {
  if (severity === 'high') return 'border-red-200 bg-red-50';
  if (severity === 'medium') return 'border-amber-200 bg-amber-50';
  return 'border-emerald-200 bg-emerald-50';
};

export default function JobTitlesClient() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [familyFilter, setFamilyFilter] = useState<'All' | string>('All');
  const [levelFilter, setLevelFilter] = useState<'All' | string>('All');
  const [gradeFilter, setGradeFilter] = useState<'All' | string>('All');
  const [reportingLevelFilter, setReportingLevelFilter] = useState<'All' | string>('All');
  const [standardizationFilter, setStandardizationFilter] = useState<'All' | string>('All');
  const [healthFilter, setHealthFilter] = useState<'All' | HealthStatus>('All');
  const [sortBy, setSortBy] = useState<'employeeCount' | 'openPositions' | 'successionCoveragePct' | 'attritionRiskPct'>('employeeCount');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/hris/organization/job-titles', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json?.status !== 'success') throw new Error(json?.error || 'Unable to load job titles');
      const data = json.data as Payload;
      setPayload(data);
      setSelectedId((prev) => prev || data.titles[0]?.id || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load job titles');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const titles = payload?.titles || [];

  const visibleTitles = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = titles.filter((title) => {
      if (familyFilter !== 'All' && title.family !== familyFilter) return false;
      if (levelFilter !== 'All' && title.level !== levelFilter) return false;
      if (gradeFilter !== 'All' && title.gradeCode !== gradeFilter) return false;
      if (reportingLevelFilter !== 'All' && title.reportingLevel !== reportingLevelFilter) return false;
      if (standardizationFilter !== 'All' && title.standardizationStatus !== standardizationFilter) return false;
      if (healthFilter !== 'All' && title.healthStatus !== healthFilter) return false;
      if (!q) return true;

      return [
        title.code,
        title.title,
        title.family,
        title.level,
        title.gradeCode,
        title.gradeName,
        title.benchmarkPosition,
        title.jobPurpose,
        title.departments.join(' '),
        title.commonLocations.join(' '),
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
  }, [titles, query, familyFilter, levelFilter, gradeFilter, reportingLevelFilter, standardizationFilter, healthFilter, sortBy]);

  const selectedTitle = useMemo(() => {
    return visibleTitles.find((title) => title.id === selectedId) || visibleTitles[0] || null;
  }, [visibleTitles, selectedId]);

  useEffect(() => {
    if (!selectedTitle && visibleTitles.length) setSelectedId(visibleTitles[0].id);
  }, [selectedTitle, visibleTitles]);

  const exportCsv = () => {
    if (!payload?.permissions.canExport) return;
    const rows = [
      [
        'Code',
        'Title',
        'Family',
        'Level',
        'Grade',
        'Reporting Level',
        'Standardization',
        'Employees',
        'Open Positions',
        'Succession Coverage %',
        'Attrition Risk %',
        'Internal Mobility %',
        'Benchmark Salary USD',
      ],
      ...visibleTitles.map((title) => [
        title.code,
        title.title,
        title.family,
        title.level,
        title.gradeCode,
        title.reportingLevel,
        title.standardizationStatus,
        String(title.employeeCount),
        String(title.openPositions),
        String(title.successionCoveragePct),
        String(title.attritionRiskPct),
        String(title.internalMobilityPct),
        String(title.benchmarkSalaryUsd),
      ]),
    ];

    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'job-titles.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <PageTemplate
      title="Job Titles"
      description="Review the organization’s title architecture, grade alignment, workforce concentration, hiring demand, and title standardization posture."
      breadcrumbs={[
        { label: 'HRIS', href: '/hris' },
        { label: 'Organization', href: '/hris/organization' },
        { label: 'Job Titles' },
      ]}
      primaryAction={{ label: 'Refresh', onClick: () => void load(), icon: RefreshCcw }}
      secondaryAction={{ label: 'Export CSV', onClick: exportCsv, icon: Download }}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
        <MetricCard icon={BriefcaseBusiness} label="Titles" value={payload ? formatNumber(payload.summary.totalTitles) : '—'} detail="Tracked standardized titles" />
        <MetricCard icon={Users} label="Employees" value={payload ? formatNumber(payload.summary.totalEmployees) : '—'} detail="Title-mapped workforce" />
        <MetricCard icon={ArrowUpRight} label="Open Roles" value={payload ? formatNumber(payload.summary.totalOpenPositions) : '—'} detail="Approved title vacancies" />
        <MetricCard icon={ShieldCheck} label="Succession" value={payload ? `${payload.summary.avgSuccessionCoverage}%` : '—'} detail="Average title readiness" />
        <MetricCard icon={AlertTriangle} label="Needs Review" value={payload ? formatNumber(payload.summary.titlesNeedingReview) : '—'} detail="Titles needing architecture review" />
        <MetricCard icon={Building2} label="Variants" value={payload ? formatNumber(payload.summary.titleVariants) : '—'} detail="Naming or scope variants" />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
        <label className="relative xl:col-span-2">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, grade, family, benchmark..."
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-dle-blue/20"
          />
        </label>
        <Select value={familyFilter} onChange={(value) => setFamilyFilter(value as 'All' | string)} options={['All', ...(payload?.filterOptions.families || [])]} labels={{ All: 'All Families' }} />
        <Select value={levelFilter} onChange={(value) => setLevelFilter(value as 'All' | string)} options={['All', ...(payload?.filterOptions.levels || [])]} labels={{ All: 'All Levels' }} />
        <Select value={gradeFilter} onChange={(value) => setGradeFilter(value as 'All' | string)} options={['All', ...(payload?.filterOptions.grades || [])]} labels={{ All: 'All Grades' }} />
        <Select value={healthFilter} onChange={(value) => setHealthFilter(value as 'All' | HealthStatus)} options={['All', ...(payload?.filterOptions.healthStatuses || [])]} labels={{ All: 'All Health States' }} />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex flex-col xl:flex-row gap-3 xl:items-center xl:justify-between">
        <div className="grid grid-cols-1 md:grid-cols-[220px_220px_220px] gap-3">
          <Select value={reportingLevelFilter} onChange={(value) => setReportingLevelFilter(value as 'All' | string)} options={['All', ...(payload?.filterOptions.reportingLevels || [])]} labels={{ All: 'All Reporting Levels' }} />
          <Select value={standardizationFilter} onChange={(value) => setStandardizationFilter(value as 'All' | string)} options={['All', ...(payload?.filterOptions.standardizationStatuses || [])]} labels={{ All: 'All Standardization' }} />
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
            setGradeFilter('All');
            setReportingLevelFilter('All');
            setStandardizationFilter('All');
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
              <div className="text-sm font-bold text-slate-900">Title Explorer</div>
              <div className="text-xs text-slate-500 mt-1">Browse titles by family, level, grade mapping, headcount, and standardization posture.</div>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold">
              Showing: {formatNumber(visibleTitles.length)}
            </span>
          </div>
          <div className="p-4 space-y-3 min-h-[520px]">
            {loading ? (
              <div className="text-sm text-slate-600 font-medium">Loading job titles...</div>
            ) : error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 font-medium">{error}</div>
            ) : visibleTitles.length ? (
              visibleTitles.map((title) => {
                const active = selectedTitle?.id === title.id;
                return (
                  <button
                    key={title.id}
                    type="button"
                    onClick={() => setSelectedId(title.id)}
                    className={`w-full text-left rounded-2xl border p-4 transition-colors ${active ? 'border-dle-blue/30 bg-dle-blue/5' : 'border-slate-200 hover:bg-slate-50'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900">{title.title}</div>
                        <div className="text-xs text-slate-500 mt-1">
                          {title.gradeCode} <span className="mx-2">•</span> {title.family} <span className="mx-2">•</span> {title.reportingLevel}
                        </div>
                      </div>
                      <span className={`px-2 py-1 rounded-full border text-[11px] font-semibold ${standardizationTone(title.standardizationStatus)}`}>
                        {title.standardizationStatus}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-slate-600">
                      <span>Employees: {formatNumber(title.employeeCount)}</span>
                      <span>Open Roles: {formatNumber(title.openPositions)}</span>
                      <span>Succession: {title.successionCoveragePct}%</span>
                      <span>Attrition: {title.attritionRiskPct}%</span>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="text-sm text-slate-600 font-medium">No job titles match the current filters.</div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="text-sm font-bold text-slate-900">Title Detail</div>
              <div className="text-xs text-slate-500 mt-1">Inspect architecture, grade mapping, scope, and operating metrics for the selected title.</div>
            </div>
            <div className="p-5">
              {selectedTitle ? (
                <div className="space-y-5">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold">{selectedTitle.code}</span>
                      <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold">{selectedTitle.gradeCode}</span>
                      <span className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold ${standardizationTone(selectedTitle.standardizationStatus)}`}>
                        {selectedTitle.standardizationStatus}
                      </span>
                      <span className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold ${healthTone(selectedTitle.healthStatus)}`}>
                        {selectedTitle.healthStatus}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 mt-3">{selectedTitle.title}</h3>
                    <p className="text-sm text-slate-500 mt-1">{selectedTitle.jobPurpose}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <DetailStat label="Grade" value={`${selectedTitle.gradeCode} • ${selectedTitle.gradeName}`} />
                    <DetailStat label="Benchmark" value={selectedTitle.benchmarkPosition} />
                    <DetailStat label="Family" value={selectedTitle.family} />
                    <DetailStat label="Reporting Level" value={selectedTitle.reportingLevel} />
                    <DetailStat label="Employees" value={formatNumber(selectedTitle.employeeCount)} />
                    <DetailStat label="Open Roles" value={formatNumber(selectedTitle.openPositions)} />
                    <DetailStat label="Departments" value={formatNumber(selectedTitle.departmentCount)} />
                    <DetailStat label="Locations" value={formatNumber(selectedTitle.locationCount)} />
                    <DetailStat label="Benchmark Salary" value={formatCurrency(selectedTitle.benchmarkSalaryUsd)} />
                    <DetailStat label="Internal Mobility" value={`${selectedTitle.internalMobilityPct}%`} />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <ProgressCard label="Succession Coverage" value={selectedTitle.successionCoveragePct} tone="emerald" />
                    <ProgressCard label="Attrition Risk" value={selectedTitle.attritionRiskPct} tone="amber" />
                    <ProgressCard label="Internal Mobility" value={selectedTitle.internalMobilityPct} tone="blue" />
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-sm font-semibold text-slate-900">Departments</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedTitle.departments.map((department) => (
                        <span key={department} className="px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-medium text-slate-700">
                          {department}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <InfoListCard title="Common Locations" items={selectedTitle.commonLocations} />
                    <InfoListCard title="Key Responsibilities" items={selectedTitle.keyResponsibilities} />
                  </div>
                </div>
              ) : (
                <div className="text-sm text-slate-600">Select a title to inspect its architecture and workforce detail.</div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <div>
                <div className="text-sm font-bold text-slate-900">Title Insights</div>
                <div className="text-xs text-slate-500 mt-1">Priority observations for title design, hiring demand, and standardization risk.</div>
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
          <div className="text-sm font-bold text-slate-900">Job Title Registry</div>
          <div className="text-xs text-slate-500 mt-1">Searchable audit table of all visible job titles and their architecture mapping.</div>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50">
              <tr>
                {['Code', 'Title', 'Grade', 'Family', 'Level', 'Employees', 'Open Roles', 'Standardization', 'Health'].map((header) => (
                  <th key={header} className="px-4 py-3 text-[11px] font-semibold text-slate-600 uppercase tracking-wide whitespace-nowrap">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleTitles.map((title) => (
                <tr key={title.id} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setSelectedId(title.id)}>
                  <td className="px-4 py-3 text-sm font-semibold text-slate-900">{title.code}</td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-semibold text-slate-900">{title.title}</div>
                    <div className="text-xs text-slate-500">{title.benchmarkPosition}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">{title.gradeCode}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{title.family}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{title.level}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{formatNumber(title.employeeCount)}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{formatNumber(title.openPositions)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold ${standardizationTone(title.standardizationStatus)}`}>{title.standardizationStatus}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold ${healthTone(title.healthStatus)}`}>{title.healthStatus}</span>
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
  tone: 'emerald' | 'amber' | 'blue';
}) {
  const styles = tone === 'emerald' ? 'bg-emerald-500' : tone === 'amber' ? 'bg-amber-500' : 'bg-blue-500';

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

function InfoListCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((item) => (
          <span key={item} className="px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-medium text-slate-700">
            {item}
          </span>
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
