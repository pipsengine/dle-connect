'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Bot,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  Filter,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  Upload,
  Users,
} from 'lucide-react';
import { Cell, Pie, PieChart } from 'recharts';
import type { PerformanceCycleRecord, PerformanceCyclesPageData, PerformancePayload } from '@/lib/performance-management-types';
import { performanceRouteHref } from '@/lib/performance-management-menu-config';
import { fmtDate, PmBadge, PmButton, PmCard, PmSectionTitle } from './performance-management-ui';

type PerformanceCyclesViewProps = {
  payload: PerformancePayload;
  onRefresh: () => void;
  loading: boolean;
};

const statusTone = (status: PerformanceCycleRecord['status']) => {
  const map = {
    Active: 'emerald' as const,
    Completed: 'blue' as const,
    Upcoming: 'amber' as const,
    Draft: 'slate' as const,
    Closed: 'red' as const,
  };
  return map[status];
};

const progressColor = (value: number) => {
  if (value >= 90) return 'bg-emerald-500';
  if (value >= 60) return 'bg-blue-500';
  if (value >= 30) return 'bg-amber-500';
  return 'bg-red-500';
};

function CycleKpiCard({
  label,
  value,
  sublabel,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  sublabel: string;
  icon: typeof CalendarClock;
  tone: 'blue' | 'emerald' | 'amber' | 'purple' | 'cyan' | 'red';
}) {
  const tones = {
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    purple: 'bg-violet-50 text-violet-600',
    cyan: 'bg-cyan-50 text-cyan-600',
    red: 'bg-red-50 text-red-600',
  };
  return (
    <PmCard className="p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(15,23,42,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#64748B]">{label}</p>
          <p className="mt-2 text-[34px] font-black leading-none text-[#0F172A]">{value}</p>
          <p className="mt-2 text-xs font-medium text-[#64748B]">{sublabel}</p>
        </div>
        <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </PmCard>
  );
}

export default function PerformanceCyclesView({ payload, onRefresh, loading }: PerformanceCyclesViewProps) {
  const data = payload.cyclesPage as PerformanceCyclesPageData;
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [typeFilter, setTypeFilter] = useState('All Types');
  const [yearFilter, setYearFilter] = useState('All Years');
  const [deptFilter, setDeptFilter] = useState('All Departments');
  const [chip, setChip] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const filtered = useMemo(() => {
    return data.cycles.filter((cycle) => {
      const q = search.trim().toLowerCase();
      if (q && !`${cycle.name} ${cycle.type} ${cycle.period}`.toLowerCase().includes(q)) return false;
      if (statusFilter !== 'All Status' && cycle.status !== statusFilter) return false;
      if (typeFilter !== 'All Types' && cycle.type !== typeFilter) return false;
      if (yearFilter !== 'All Years' && !cycle.period.includes(yearFilter.replace('All ', ''))) return false;
      if (chip && cycle.status !== chip) return false;
      return true;
    });
  }, [data.cycles, search, statusFilter, typeFilter, yearFilter, chip]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const donut = [
    { name: 'Active', value: data.overview.active, color: '#16A34A' },
    { name: 'Upcoming', value: data.overview.upcoming, color: '#F59E0B' },
    { name: 'Completed', value: data.overview.completed, color: '#2563EB' },
    { name: 'Closed', value: data.overview.closed, color: '#94A3B8' },
  ].filter((item) => item.value > 0);

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex flex-wrap items-center gap-1.5 text-sm text-[#64748B]" aria-label="Breadcrumb">
        <Link href="/hris" className="hover:text-[#2563EB]">HRIS</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link href={performanceRouteHref('dashboard')} className="hover:text-[#2563EB]">Performance Management</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span>Planning</span>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-semibold text-[#2563EB]">Performance Cycles</span>
      </nav>

      {/* Page header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#2563EB] text-white shadow-[0_8px_24px_rgba(37,99,235,0.25)]">
            <CalendarClock className="h-7 w-7" />
          </span>
          <div>
            <h1 className="text-[36px] font-bold leading-tight text-[#0F172A]">Performance Cycles</h1>
            <p className="mt-2 max-w-2xl text-sm text-[#64748B]">
              Configure, schedule and monitor enterprise-wide appraisal periods, review workflows and employee performance cycles.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PmButton variant="secondary" onClick={onRefresh} disabled={loading}>
            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </PmButton>
          <PmButton variant="secondary">
            <Upload className="h-4 w-4" /> Import Cycles
          </PmButton>
          <PmButton variant="primary">
            <Plus className="h-4 w-4" /> Create New Cycle <ChevronDown className="h-4 w-4" />
          </PmButton>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <CycleKpiCard label="Total Cycles" value={data.summary.totalCycles} sublabel={`+${data.summary.totalCyclesTrend}% vs last year`} icon={CalendarClock} tone="blue" />
        <CycleKpiCard label="Active Cycles" value={data.summary.activeCycles} sublabel="In progress" icon={CheckCircle2} tone="emerald" />
        <CycleKpiCard label="Upcoming Cycles" value={data.summary.upcomingCycles} sublabel="Not started" icon={CalendarClock} tone="amber" />
        <CycleKpiCard label="Completed Cycles" value={data.summary.completedCycles} sublabel="This year" icon={CheckCircle2} tone="purple" />
        <CycleKpiCard label="Employees Covered" value={data.summary.employeesCovered.toLocaleString()} sublabel="Across all cycles" icon={Users} tone="cyan" />
        <CycleKpiCard label="Completion Rate" value={`${data.summary.completionRate}%`} sublabel="Average" icon={Bot} tone="red" />
      </div>

      {/* Main layout: table + right panel */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {/* Filters */}
          <PmCard className="p-4">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
              <div className="relative lg:col-span-4">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                <input
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  placeholder="Search cycles…"
                  className="h-11 w-full rounded-xl border border-[#E5E7EB] bg-white pl-10 pr-3 text-sm outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#E8F1FF]"
                />
              </div>
              {[
                { value: statusFilter, onChange: setStatusFilter, options: ['All Status', 'Active', 'Upcoming', 'Completed', 'Draft', 'Closed'] },
                { value: typeFilter, onChange: setTypeFilter, options: ['All Types', 'Half Yearly', 'Annual', 'Quarterly', 'Probation'] },
                { value: yearFilter, onChange: setYearFilter, options: ['All Years', '2026', '2025', '2024'] },
                { value: deptFilter, onChange: setDeptFilter, options: data.departments },
              ].map((field) => (
                <select
                  key={field.options[0]}
                  value={field.value}
                  onChange={(e) => { field.onChange(e.target.value); setPage(1); }}
                  className="h-11 rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm font-medium text-[#475569] outline-none focus:border-[#2563EB] lg:col-span-2"
                >
                  {field.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              ))}
              <div className="flex gap-2 lg:col-span-12 lg:justify-end">
                <PmButton variant="secondary"><Filter className="h-4 w-4" /> Filter</PmButton>
                <PmButton variant="secondary"><Download className="h-4 w-4" /> Export</PmButton>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {['Active', 'Upcoming', 'Completed', 'Draft', 'Closed'].map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => { setChip(chip === item ? null : item); setPage(1); }}
                  className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                    chip === item ? 'bg-[#2563EB] text-white' : 'bg-[#F1F5F9] text-[#475569] hover:bg-[#E8F1FF]'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </PmCard>

          {/* Table */}
          <PmCard className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="border-b border-[#EEF2F7] bg-[#F8FAFC]">
                  <tr className="text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">
                    <th className="px-4 py-3">Cycle Name</th>
                    <th className="px-4 py-3">Cycle Type</th>
                    <th className="px-4 py-3">Year / Period</th>
                    <th className="px-4 py-3">Duration</th>
                    <th className="px-4 py-3">Employees</th>
                    <th className="px-4 py-3">Progress</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((cycle) => (
                    <tr key={cycle.id} className="border-b border-[#F8FAFC] transition-colors hover:bg-[#F8FBFF]">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[#0F172A]">{cycle.name}</span>
                          {cycle.status === 'Active' ? <PmBadge tone="emerald">Active</PmBadge> : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[#475569]">{cycle.type}</td>
                      <td className="px-4 py-3 text-[#475569]">{cycle.period}</td>
                      <td className="px-4 py-3 text-[#475569]">
                        <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />{fmtDate(cycle.startDate)} – {fmtDate(cycle.endDate)}</span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-[#0F172A]">{cycle.employees.toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <div className="flex min-w-[120px] items-center gap-2">
                          <div className="h-2 flex-1 rounded-full bg-[#EEF2F7]">
                            <div className={`h-2 rounded-full ${progressColor(cycle.progress)}`} style={{ width: `${cycle.progress}%` }} />
                          </div>
                          <span className="text-xs font-bold text-[#475569]">{cycle.progress}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3"><PmBadge tone={statusTone(cycle.status)}>{cycle.status}</PmBadge></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button type="button" className="rounded-lg p-2 text-[#64748B] hover:bg-[#F1F5F9]" aria-label="View"><Eye className="h-4 w-4" /></button>
                          <button type="button" className="rounded-lg p-2 text-[#64748B] hover:bg-[#F1F5F9]" aria-label="Edit"><Pencil className="h-4 w-4" /></button>
                          <button type="button" className="rounded-lg p-2 text-[#64748B] hover:bg-[#F1F5F9]" aria-label="More"><MoreHorizontal className="h-4 w-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-3 border-t border-[#EEF2F7] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-[#64748B]">Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of {filtered.length} cycles</p>
              <div className="flex items-center gap-1">
                <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-[#E5E7EB] px-3 py-1.5 text-xs font-semibold disabled:opacity-40">Previous</button>
                {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPage(n)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${page === n ? 'bg-[#2563EB] text-white' : 'border border-[#E5E7EB] text-[#475569] hover:bg-[#F8FAFC]'}`}
                  >
                    {n}
                  </button>
                ))}
                <button type="button" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-[#E5E7EB] px-3 py-1.5 text-xs font-semibold disabled:opacity-40">Next</button>
              </div>
            </div>
          </PmCard>
        </div>

        {/* Right analytics panel */}
        <div className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <PmCard className="p-4">
            <PmSectionTitle title="Cycle Overview" />
            <div className="relative mx-auto h-40 w-40">
              <PieChart width={160} height={160}>
                <Pie data={donut} dataKey="value" cx={72} cy={72} innerRadius={48} outerRadius={64} paddingAngle={2} isAnimationActive={false}>
                  {donut.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                </Pie>
              </PieChart>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-2xl font-black text-[#0F172A]">{data.overview.total}</p>
                <p className="text-[10px] font-semibold text-[#64748B]">Total</p>
              </div>
            </div>
            <div className="mt-3 space-y-1.5 text-xs">
              {donut.map((item) => (
                <div key={item.name} className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-[#64748B]"><span className="h-2 w-2 rounded-full" style={{ background: item.color }} />{item.name}</span>
                  <span className="font-bold text-[#0F172A]">{item.value}</span>
                </div>
              ))}
            </div>
          </PmCard>

          <PmCard className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#0F172A]">H1 2026</h3>
              <PmBadge tone="emerald">Active</PmBadge>
            </div>
            <p className="text-sm font-semibold text-[#2563EB]">{data.activeCycle.name}</p>
            <p className="mt-1 text-xs text-[#64748B]">{data.activeCycle.period}</p>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-[#F8FAFC] p-2"><span className="text-[#64748B]">Employees</span><p className="font-bold text-[#0F172A]">{data.activeCycle.employees.toLocaleString()}</p></div>
              <div className="rounded-lg bg-[#F8FAFC] p-2"><span className="text-[#64748B]">Departments</span><p className="font-bold text-[#0F172A]">{data.activeCycle.departments}</p></div>
              <div className="rounded-lg bg-[#F8FAFC] p-2"><span className="text-[#64748B]">Reviewers</span><p className="font-bold text-[#0F172A]">{data.activeCycle.reviewers}</p></div>
              <div className="rounded-lg bg-[#F8FAFC] p-2"><span className="text-[#64748B]">Completion</span><p className="font-bold text-[#0F172A]">{data.activeCycle.progress}%</p></div>
            </div>
            <div className="mt-3 h-2 rounded-full bg-[#EEF2F7]">
              <div className="h-2 rounded-full bg-[#2563EB]" style={{ width: `${data.activeCycle.progress}%` }} />
            </div>
          </PmCard>

          <PmCard className="border-violet-100 bg-gradient-to-br from-violet-50 to-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <Bot className="h-5 w-5 text-violet-600" />
              <h3 className="text-sm font-bold text-[#0F172A]">AI Insight</h3>
            </div>
            <p className="text-sm leading-relaxed text-[#475569]">
              AI predicts <span className="font-bold text-violet-700">{data.aiInsight.onTrackPct}%</span> of employees are on track to exceed targets.
            </p>
            <ul className="mt-3 space-y-2">
              {data.aiInsight.highlights.map((item) => (
                <li key={item} className="text-xs leading-relaxed text-[#64748B]">• {item}</li>
              ))}
            </ul>
            <p className="mt-3 rounded-lg bg-white/80 p-2 text-xs text-[#475569]">
              <span className="font-semibold">Recommendation:</span> {data.aiInsight.recommendation}
            </p>
            <Link href={performanceRouteHref('ai-intelligence/ai-insights')} className="mt-3 inline-flex text-sm font-semibold text-violet-700 hover:underline">
              Open AI Insights →
            </Link>
          </PmCard>

          <PmCard className="p-4">
            <PmSectionTitle title="Workflow Health" />
            <div className="space-y-3">
              {data.workflowHealth.map((item) => (
                <div key={item.label}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-[#64748B]">{item.label}</span>
                    <span className="font-bold text-[#0F172A]">{item.percent}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-[#EEF2F7]">
                    <div className={`h-2 rounded-full ${progressColor(item.percent)}`} style={{ width: `${item.percent}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </PmCard>
        </div>
      </div>
    </div>
  );
}
