'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { Cell, Pie, PieChart, Tooltip } from 'recharts';
import type { PerformancePayload } from '@/lib/performance-management-types';
import type { PerformanceWorkspacePayload } from '@/lib/performance-domain-types';
import { performanceRouteHref } from '@/lib/performance-management-menu-config';
import {
  fmtDate,
  PmBadge,
  PmButton,
  PmCard,
  PmDataRow,
  PmIconBadge,
  PmKpiCard,
  PmSectionTitle,
} from './performance-management-ui';

type PerformanceCommandCenterProps = {
  payload: PerformancePayload | PerformanceWorkspacePayload;
};

const stageToneClass = {
  blue: 'border-blue-500 bg-blue-600 text-white',
  orange: 'border-amber-500 bg-amber-500 text-white',
  purple: 'border-violet-500 bg-violet-600 text-white',
  cyan: 'border-cyan-500 bg-cyan-600 text-white',
  slate: 'border-slate-300 bg-slate-200 text-slate-600',
};

const insightTone = {
  blue: 'bg-blue-50 text-blue-800',
  emerald: 'bg-emerald-50 text-emerald-800',
  amber: 'bg-amber-50 text-amber-800',
  violet: 'bg-violet-50 text-violet-800',
  red: 'bg-red-50 text-red-800',
};

type KpiDetailKey = 'employees' | 'reviewsCompleted' | 'pendingReviews' | 'goalCompletion' | 'highPerformers' | 'pipEmployees';

export default function PerformanceCommandCenter({ payload }: PerformanceCommandCenterProps) {
  const [selectedKpi, setSelectedKpi] = useState<KpiDetailKey | null>(null);
  const d = payload.dashboard;
  const domain = 'domain' in payload ? payload.domain : null;
  const goalDonut = [
    { name: 'Completed', value: d.goalProgress.completed, color: '#10B981' },
    { name: 'In Progress', value: d.goalProgress.inProgress, color: '#2563EB' },
    { name: 'Not Started', value: d.goalProgress.notStarted, color: '#CBD5E1' },
  ];
  const healthDonut = [
    { name: 'Excellent', value: d.performanceHealth.score, color: '#10B981' },
    { name: 'Remaining', value: 100 - d.performanceHealth.score, color: '#E2E8F0' },
  ];
  const maxRating = Math.max(...d.ratingDistribution.map((item) => item.count), 1);

  const calendarDays = Array.from({ length: 31 }, (_, index) => index + 1);
  const eventDays = new Map(d.calendarEvents.map((event) => [new Date(`${event.date}T00:00:00`).getDate(), event]));
  const kpiDetails: Record<KpiDetailKey, {
    title: string;
    value: string | number;
    description: string;
    route: string;
    routeLabel: string;
    facts: Array<{ label: string; value: string | number }>;
    records: Array<{ primary: string; secondary: string; value: string | number }>;
  }> = {
    employees: {
      title: 'Employees in Performance Cycle',
      value: d.employees,
      description: `Employees currently covered by ${d.cycle.name}.`,
      route: 'planning/performance-cycles',
      routeLabel: 'Open cycle details',
      facts: [
        { label: 'Cycle', value: d.cycle.name },
        { label: 'Cycle type', value: d.cycle.type },
        { label: 'Completed reviews', value: d.cycle.completedReviews },
        { label: 'Pending reviews', value: d.cycle.pendingReviews },
      ],
      records: d.departmentPerformance.map((row) => ({
        primary: row.department,
        secondary: `${row.completionPct}% review completion`,
        value: `${row.pending} pending`,
      })),
    },
    reviewsCompleted: {
      title: 'Completed Reviews',
      value: d.reviewsCompleted,
      description: 'Manager reviews submitted, approved, or published for the active cycle.',
      route: 'performance-reviews/supervisor-review',
      routeLabel: 'Open manager assessments',
      facts: [
        { label: 'Completion rate', value: `${d.reviewsCompletedPct}%` },
        { label: 'Employees in cycle', value: d.cycle.employeesInCycle },
        { label: 'Pending reviews', value: d.pendingReviews },
      ],
      records: (domain?.assessments || [])
        .filter((row) => row.type === 'Manager' && ['Submitted', 'Approved', 'Published'].includes(row.status))
        .map((row) => ({
          primary: row.employeeName,
          secondary: `${row.type} assessment`,
          value: row.status,
        })),
    },
    pendingReviews: {
      title: 'Pending Reviews',
      value: d.pendingReviews,
      description: 'Employees in the active cycle whose manager review is not yet complete.',
      route: 'performance-reviews/supervisor-review',
      routeLabel: 'Review pending assessments',
      facts: [
        { label: 'Remaining', value: `${d.pendingReviewsPct}%` },
        { label: 'Completed', value: d.reviewsCompleted },
        { label: 'Employees in cycle', value: d.cycle.employeesInCycle },
        { label: 'Review deadline', value: fmtDate(d.cycle.deadline) },
      ],
      records: (domain?.assessments || [])
        .filter((row) => row.type === 'Manager' && !['Submitted', 'Approved', 'Published'].includes(row.status))
        .map((row) => ({
          primary: row.employeeName,
          secondary: `${row.type} assessment`,
          value: row.status,
        })),
    },
    goalCompletion: {
      title: 'Goal Completion',
      value: `${d.goalCompletionPct}%`,
      description: 'Organisation goal progress for the active performance cycle.',
      route: 'planning/employee-goals',
      routeLabel: 'Open OKR & KPI management',
      facts: [
        { label: 'Completed', value: d.goalProgress.completed },
        { label: 'In progress', value: d.goalProgress.inProgress },
        { label: 'Not started', value: d.goalProgress.notStarted },
        { label: 'Average completion', value: `${d.goalProgress.avgCompletion}%` },
      ],
      records: (domain?.goals || []).map((row) => ({
        primary: row.title,
        secondary: `${row.employeeName} · ${row.status}`,
        value: `${row.progressPercent}%`,
      })),
    },
    highPerformers: {
      title: 'High Performers',
      value: d.highPerformers,
      description: 'Employees whose published or calculated active-cycle result meets the high-performer threshold.',
      route: 'performance-reviews/performance-scorecard',
      routeLabel: 'Open published results',
      facts: [
        { label: 'Share of employees', value: `${d.highPerformersPct}%` },
        { label: 'Employees in cycle', value: d.cycle.employeesInCycle },
        { label: 'Published results', value: domain?.results.filter((row) => row.status === 'Published').length || 0 },
      ],
      records: (domain?.results || [])
        .filter((row) => row.finalScore >= 90)
        .map((row) => ({
          primary: row.employeeName,
          secondary: row.ratingBand,
          value: `${row.finalScore}%`,
        })),
    },
    pipEmployees: {
      title: 'PIP Employees',
      value: d.pipEmployees,
      description: 'Employees with an active, at-risk, or on-track performance improvement plan.',
      route: 'improvement/pip',
      routeLabel: 'Open PIP workspace',
      facts: [
        { label: 'Share of employees', value: `${d.pipEmployeesPct}%` },
        { label: 'Active cycle', value: d.cycle.name },
        { label: 'Employees in cycle', value: d.cycle.employeesInCycle },
      ],
      records: (domain?.pips || [])
        .filter((row) => /active|track|risk/i.test(row.status))
        .map((row) => ({
          primary: row.employeeName,
          secondary: row.reason,
          value: row.status,
        })),
    },
  };
  const selectedDetail = selectedKpi ? kpiDetails[selectedKpi] : null;

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <PmKpiCard label="Employees" value={d.employees} sublabel="Active in performance cycle" trend={d.employeesTrend} sparkline={d.sparklines.employees} tone="blue" onClick={() => setSelectedKpi('employees')} />
        <PmKpiCard label="Reviews Completed" value={d.reviewsCompleted} sublabel={`${d.reviewsCompletedPct}% Completion`} trend={d.reviewsCompletedTrend} sparkline={d.sparklines.reviewsCompleted} tone="emerald" onClick={() => setSelectedKpi('reviewsCompleted')} />
        <PmKpiCard label="Pending Reviews" value={d.pendingReviews} sublabel={`${d.pendingReviewsPct}% Remaining`} trend={d.pendingReviewsTrend} sparkline={d.sparklines.pendingReviews} tone="amber" onClick={() => setSelectedKpi('pendingReviews')} />
        <PmKpiCard label="Goal Completion" value={`${d.goalCompletionPct}%`} sublabel="Organisation average" trend={d.goalCompletionTrend} sparkline={d.sparklines.goalCompletion} tone="purple" onClick={() => setSelectedKpi('goalCompletion')} />
        <PmKpiCard label="High Performers" value={d.highPerformers} sublabel={`${d.highPerformersPct}% of Employees`} trend={d.highPerformersTrend} sparkline={d.sparklines.highPerformers} tone="cyan" onClick={() => setSelectedKpi('highPerformers')} />
        <PmKpiCard label="PIP Employees" value={d.pipEmployees} sublabel={`${d.pipEmployeesPct}% of Employees`} trend={d.pipEmployeesTrend} sparkline={d.sparklines.pipEmployees} tone="red" onClick={() => setSelectedKpi('pipEmployees')} />
      </div>

      {selectedDetail ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[2px]"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedKpi(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="kpi-detail-title"
            className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-[#E1E4E8] bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-[#E1E4E8] px-6 py-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#0052CC]">Performance KPI details</p>
                <h2 id="kpi-detail-title" className="mt-1 text-xl font-black text-[#0F172A]">{selectedDetail.title}</h2>
                <p className="mt-1 text-sm text-[#64748B]">{selectedDetail.description}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedKpi(null)}
                aria-label="Close details"
                className="rounded-lg p-2 text-[#64748B] hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0052CC]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[calc(85vh-150px)] overflow-y-auto px-6 py-5">
              <div className="mb-5 flex items-end justify-between rounded-xl bg-[#F8FAFC] p-4">
                <div>
                  <p className="text-xs font-semibold text-[#64748B]">Current value</p>
                  <p className="text-4xl font-black text-[#0F172A]">{selectedDetail.value}</p>
                </div>
                <p className="text-xs font-semibold text-[#64748B]">As of {fmtDate(payload.generatedAt)}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {selectedDetail.facts.map((fact) => (
                  <div key={fact.label} className="rounded-lg border border-[#E1E4E8] p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-[#64748B]">{fact.label}</p>
                    <p className="mt-1 text-sm font-black text-[#0F172A]">{fact.value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-[#64748B]">Supporting records</h3>
                {selectedDetail.records.length ? (
                  <div className="divide-y divide-[#E1E4E8] rounded-xl border border-[#E1E4E8]">
                    {selectedDetail.records.slice(0, 20).map((record, index) => (
                      <div key={`${record.primary}-${index}`} className="flex items-center justify-between gap-4 px-4 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-[#0F172A]">{record.primary}</p>
                          <p className="truncate text-xs text-[#64748B]">{record.secondary}</p>
                        </div>
                        <span className="shrink-0 text-sm font-bold text-[#0052CC]">{record.value}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-4 py-8 text-center text-sm text-[#64748B]">
                    No supporting records are available for this KPI yet.
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-[#E1E4E8] bg-[#F8FAFC] px-6 py-4">
              <PmButton variant="secondary" onClick={() => setSelectedKpi(null)}>Close</PmButton>
              <Link href={performanceRouteHref(selectedDetail.route)}>
                <PmButton variant="primary">{selectedDetail.routeLabel}</PmButton>
              </Link>
            </div>
          </section>
        </div>
      ) : null}

      {'dataSource' in payload && payload.dataSource ? (
        <PmCard className="p-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-semibold text-[#475569]">
            <span>Data source: {payload.dataSource.source}</span>
            <span>Directory: {payload.dataSource.employeeDirectorySource || '—'}</span>
            <span>Updated: {payload.dataSource.updatedAt ? fmtDate(payload.dataSource.updatedAt) : '—'}</span>
            <span>
              Counts: {payload.dataSource.recordCounts?.cycles || 0} cycles / {payload.dataSource.recordCounts?.goals || 0} goals / {payload.dataSource.recordCounts?.results || 0} results
            </span>
            {payload.dataSource.warning ? <span className="text-amber-700">{payload.dataSource.warning}</span> : null}
          </div>
        </PmCard>
      ) : null}

      {/* Middle row */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <PmCard className="p-5 xl:col-span-3">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-[#0F172A]">Current Performance Cycle</h3>
            <PmBadge tone="emerald">Active</PmBadge>
          </div>
          <p className="text-2xl font-black text-[#0052CC]">{d.cycle.name}</p>
          <div className="mt-4 space-y-0">
            <PmDataRow label="Cycle Type" value={d.cycle.type} />
            <PmDataRow label="Start Date" value={fmtDate(d.cycle.startDate)} />
            <PmDataRow label="End Date" value={fmtDate(d.cycle.endDate)} />
            <PmDataRow label="Deadline" value={fmtDate(d.cycle.deadline)} />
            <PmDataRow label="Days Remaining" value={`${d.cycle.daysRemaining} Days`} valueClass="text-amber-600" />
            <PmDataRow label="Employees in Cycle" value={d.cycle.employeesInCycle} />
            <PmDataRow label="Completed Reviews" value={d.cycle.completedReviews} />
            <PmDataRow label="Pending Reviews" value={d.cycle.pendingReviews} />
            <PmDataRow label="Locked" value={d.cycle.locked ? 'Yes' : 'No'} />
          </div>
          <div className="mt-4 flex gap-2">
            <PmButton variant="secondary" className="flex-1">View History</PmButton>
            <Link href={performanceRouteHref('planning/performance-cycles')} className="flex-1">
              <PmButton variant="primary" className="w-full">Cycle Settings</PmButton>
            </Link>
          </div>
        </PmCard>

        <PmCard className="p-5 xl:col-span-6">
          <PmSectionTitle
            title="Performance Workflow"
            action={
              <Link href={performanceRouteHref('performance-reviews/supervisor-review')} className="text-xs font-semibold text-[#0052CC] hover:underline">
                View Pipeline
              </Link>
            }
          />
          <div className="overflow-x-auto pb-2">
            <div className="flex min-w-[720px] items-start justify-between gap-2">
              {d.workflow.stages.map((stage, index) => (
                <div key={stage.id} className="flex flex-1 flex-col items-center">
                  <div className="relative flex w-full items-center">
                    {index > 0 ? <div className="absolute right-1/2 top-4 h-0.5 w-full -translate-y-1/2 bg-slate-200" /> : null}
                    <div
                      className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 text-[10px] font-bold ${
                        stageToneClass[stage.tone]
                      } ${stage.status === 'pending' ? 'opacity-60' : ''}`}
                    >
                      {stage.status === 'completed' ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                    </div>
                  </div>
                  <p className="mt-2 text-center text-[10px] font-bold uppercase tracking-wide text-[#64748B]">{stage.label}</p>
                  <p className="mt-1 text-center text-xs font-bold text-[#0F172A]">{stage.completed}/{stage.total}</p>
                  <p className="text-center text-[10px] font-semibold text-[#64748B]">{stage.percent}%</p>
                  <p className="text-center text-[10px] text-[#94A3B8]">{fmtDate(stage.dueDate)}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-[#F8FAFC] p-3 text-xs md:grid-cols-4">
            <div><span className="text-[#64748B]">Current Stage</span><p className="font-bold text-[#0F172A]">{d.workflow.currentStage}</p></div>
            <div><span className="text-[#64748B]">Stage Owner</span><p className="font-bold text-[#0F172A]">{d.workflow.stageOwner}</p></div>
            <div><span className="text-[#64748B]">Auto Refresh</span><p className="font-bold text-[#0F172A]">{d.workflow.autoRefreshSeconds}s</p></div>
            <div><span className="text-[#64748B]">Last Updated</span><p className="font-bold text-[#0F172A]">{new Date(payload.generatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</p></div>
          </div>
        </PmCard>

        <PmCard className="p-5 xl:col-span-3">
          <div className="mb-4 flex items-center justify-between gap-2">
            <PmSectionTitle title="AI Performance Insights" />
            <PmBadge tone="blue">BETA</PmBadge>
          </div>
          <div className="space-y-2">
            {d.aiInsights.map((insight) => (
              <div key={insight.id} className={`rounded-lg px-3 py-2.5 text-xs font-medium leading-relaxed ${insightTone[insight.tone]}`}>
                {insight.text}
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-lg border border-[#E8F1FF] bg-[#F8FBFF] p-3 text-xs text-[#475569]">
            Recommendation: Prioritise supervisor reviews in Engineering and Projects before the 10 June cut-off.
          </div>
          <Link href={performanceRouteHref('ai-intelligence/ai-insights')} className="mt-4 block">
            <PmButton variant="primary" className="w-full">
              View Full Analysis <ArrowRight className="h-4 w-4" />
            </PmButton>
          </Link>
        </PmCard>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <PmCard className="p-4 xl:col-span-1">
          <PmSectionTitle title="Goal Progress Overview" />
          <div className="relative mx-auto h-36 w-36">
            <PieChart width={144} height={144}>
              <Pie data={goalDonut} dataKey="value" cx={68} cy={68} innerRadius={42} outerRadius={58} paddingAngle={2} isAnimationActive={false}>
                {goalDonut.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
              </Pie>
              <Tooltip />
            </PieChart>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-xl font-black text-[#0F172A]">{d.goalProgress.avgCompletion}%</p>
              <p className="text-[10px] font-semibold text-[#64748B]">Avg Completion</p>
            </div>
          </div>
          <div className="mt-3 space-y-1 text-xs">
            {goalDonut.map((item) => (
              <div key={item.name} className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-[#64748B]"><span className="h-2 w-2 rounded-full" style={{ background: item.color }} />{item.name}</span>
                <span className="font-bold text-[#0F172A]">{item.value}%</span>
              </div>
            ))}
          </div>
        </PmCard>

        <PmCard className="p-4 xl:col-span-1">
          <PmSectionTitle title="Performance Rating Distribution" />
          <div className="space-y-3">
            {d.ratingDistribution.map((item) => (
              <div key={item.label}>
                <div className="mb-1 flex items-center justify-between text-[10px] font-semibold text-[#64748B]">
                  <span>{item.label}</span>
                  <span>{item.count}</span>
                </div>
                <div className="h-2 rounded-full bg-[#F1F5F9]">
                  <div className="h-2 rounded-full" style={{ width: `${(item.count / maxRating) * 100}%`, background: item.tone }} />
                </div>
              </div>
            ))}
          </div>
        </PmCard>

        <PmCard className="p-4 xl:col-span-1">
          <PmSectionTitle title="Department Performance" />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[220px] text-left text-xs">
              <thead>
                <tr className="border-b border-[#E1E4E8] text-[10px] uppercase tracking-wide text-[#94A3B8]">
                  <th className="py-2 pr-2">Dept</th>
                  <th className="py-2 pr-2">Done</th>
                  <th className="py-2 pr-2">Rating</th>
                  <th className="py-2">Pending</th>
                </tr>
              </thead>
              <tbody>
                {d.departmentPerformance.map((row) => (
                  <tr key={row.department} className="border-b border-[#F8FAFC]">
                    <td className="py-2 pr-2 font-semibold text-[#0F172A]">{row.department}</td>
                    <td className="py-2 pr-2 text-[#0052CC]">{row.completionPct}%</td>
                    <td className="py-2 pr-2">{row.avgRating}</td>
                    <td className="py-2 font-semibold text-amber-600">{row.pending}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PmCard>

        <PmCard className="p-4 xl:col-span-1">
          <PmSectionTitle title="Performance Health" />
          <div className="relative mx-auto h-36 w-36">
            <PieChart width={144} height={144}>
              <Pie data={healthDonut} dataKey="value" cx={68} cy={68} innerRadius={42} outerRadius={58} startAngle={90} endAngle={-270} isAnimationActive={false}>
                {healthDonut.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
              </Pie>
            </PieChart>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-xl font-black text-emerald-600">{d.performanceHealth.score}%</p>
              <p className="text-[10px] font-semibold text-[#64748B]">Excellent</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-1 text-[10px]">
            {[
              ['Goals', d.performanceHealth.goals],
              ['Reviews', d.performanceHealth.reviews],
              ['Calibration', d.performanceHealth.calibration],
              ['Competencies', d.performanceHealth.competencies],
              ['Feedback', d.performanceHealth.feedback],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded bg-[#F8FAFC] px-2 py-1">
                <span className="text-[#64748B]">{label}</span>
                <p className="font-bold text-[#0F172A]">{value}%</p>
              </div>
            ))}
          </div>
        </PmCard>

        <PmCard className="p-4 xl:col-span-1">
          <PmSectionTitle title="Upcoming Deadlines" />
          <div className="space-y-3">
            {d.upcomingDeadlines.map((item) => (
              <div key={item.id} className="rounded-lg border border-[#F1F5F9] px-3 py-2">
                <p className="text-xs font-bold text-[#0F172A]">{item.title}</p>
                <div className="mt-1 flex items-center justify-between text-[10px]">
                  <span className="text-[#64748B]">{fmtDate(item.date)}</span>
                  <span className={`font-bold ${item.tone === 'red' ? 'text-red-600' : item.tone === 'amber' ? 'text-amber-600' : 'text-slate-600'}`}>
                    {item.daysRemaining} days
                  </span>
                </div>
              </div>
            ))}
          </div>
        </PmCard>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <PmCard className="p-4">
          <PmSectionTitle title="Recent Activity" />
          <div className="space-y-3">
            {d.recentActivity.map((item) => (
              <div key={item.id} className="flex items-start gap-3">
                <PmIconBadge icon={Users} tone={item.tone as 'blue'} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#0F172A]"><span className="text-[#0052CC]">{item.actor}</span> {item.action}</p>
                  <p className="text-xs text-[#64748B]">{item.detail}</p>
                  <p className="text-[10px] text-[#94A3B8]">{item.at}</p>
                </div>
              </div>
            ))}
          </div>
        </PmCard>

        <PmCard className="p-4">
          <PmSectionTitle title="Talent Overview" />
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Promotion Ready', value: d.talentOverview.promotionReady, icon: TrendingUp, tone: 'emerald' as const },
              { label: 'High Potential', value: d.talentOverview.highPotential, icon: Sparkles, tone: 'violet' as const },
              { label: 'Succession Ready', value: d.talentOverview.successionReady, icon: Target, tone: 'blue' as const },
              { label: 'Critical Talent', value: d.talentOverview.criticalTalent, icon: AlertTriangle, tone: 'amber' as const },
              { label: 'Retirement Risk', value: d.talentOverview.retirementRisk, icon: Clock3, tone: 'cyan' as const },
              { label: 'Attrition Risk', value: d.talentOverview.attritionRisk, icon: AlertTriangle, tone: 'red' as const },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-[#F1F5F9] p-3">
                <PmIconBadge icon={item.icon} tone={item.tone} />
                <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-[#64748B]">{item.label}</p>
                <p className="text-xl font-black text-[#0F172A]">{item.value}</p>
              </div>
            ))}
          </div>
        </PmCard>

        <PmCard className="p-4">
          <PmSectionTitle title="Manager Summary (My Team)" />
          <div className="space-y-2">
            {[
              { label: 'Team Members', value: d.managerSummary.teamMembers, icon: Users },
              { label: 'Pending Reviews', value: d.managerSummary.pendingReviews, icon: Clock3 },
              { label: 'Completed Reviews', value: d.managerSummary.completedReviews, icon: CheckCircle2 },
              { label: 'Goal Completion', value: `${d.managerSummary.goalCompletionPct}%`, icon: Target },
              { label: 'Check-ins Due', value: d.managerSummary.checkInsDue, icon: CalendarDays },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between rounded-lg bg-[#F8FAFC] px-3 py-2.5">
                <div className="flex items-center gap-2 text-sm text-[#475569]">
                  <item.icon className="h-4 w-4 text-[#0052CC]" />
                  {item.label}
                </div>
                <span className="text-sm font-bold text-[#0F172A]">{item.value}</span>
              </div>
            ))}
          </div>
        </PmCard>

        <PmCard className="p-4">
          <PmSectionTitle title="Calendar" />
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-bold text-[#0F172A]">July 2026</p>
            <div className="flex gap-2 text-[10px] text-[#64748B]">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" />Review</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-violet-500" />Calibration</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" />Deadline</span>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-[#94A3B8]">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <div key={day}>{day[0]}</div>)}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {calendarDays.map((day) => {
              const event = eventDays.get(day);
              const dotColor = event?.type === 'deadline' ? 'bg-red-500' : event?.type === 'calibration' ? 'bg-violet-500' : event ? 'bg-amber-500' : '';
              return (
                <div key={day} className={`relative flex h-8 items-center justify-center rounded-md text-xs ${day === 3 ? 'bg-[#0052CC] font-bold text-white' : 'text-[#475569] hover:bg-[#F8FAFC]'}`}>
                  {day}
                  {dotColor ? <span className={`absolute bottom-0.5 h-1.5 w-1.5 rounded-full ${dotColor}`} /> : null}
                </div>
              );
            })}
          </div>
        </PmCard>
      </div>
    </div>
  );
}
