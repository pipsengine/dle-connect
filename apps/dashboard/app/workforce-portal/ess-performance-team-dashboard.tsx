'use client';

import { useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Download,
  FileText,
  IdCard,
  LockKeyhole,
  MessageSquare,
  Target,
  Users,
  X,
} from 'lucide-react';
import type {
  EssCycleStage,
  EssPerformanceWorkspace,
  EssTeamReviewQueueRow,
} from '@/lib/ess-performance-workspace';

type EssPerformanceTeamDashboardProps = {
  workspace: EssPerformanceWorkspace;
  onOpenEmployee: (employeeId: string) => void;
  onOpenWorkspace: (section: TeamWorkspaceSection) => void;
};

export type TeamWorkspaceSection = 'goals' | 'checkins' | 'development' | 'probation' | 'pip' | 'reviews';

type ActionFilter = 'All' | 'Awaiting' | 'Check-in' | 'Mid-year' | 'Ready' | 'Probation';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || '?';

const daysUntil = (date: string) => {
  if (!date) return null;
  const target = new Date(`${date.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
};

const formatDisplayDate = (date?: string) => {
  if (!date) return '—';
  const value = new Date(`${date.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(value.getTime())) return date;
  return value.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const badgeTone = (status: string) => {
  const value = status.toLowerCase();
  if (/overdue|risk|reject/i.test(value)) return 'bg-[#FFE9E9] text-[#DC2228]';
  if (/await|acknowledg|pending|discussion|draft/i.test(value)) return 'bg-[#FFF6DD] text-[#B45309]';
  if (/probation|confirm/i.test(value)) return 'bg-[#F2EAFF] text-[#6D28D9]';
  if (/ready|mid-year|review|active/i.test(value)) return 'bg-[#E9F2FF] text-[#1D4ED8]';
  if (/submitted|complete|acknowledged|approved/i.test(value)) return 'bg-[#E3F6F0] text-[#047857]';
  return 'bg-[#F1F5F9] text-[#475569]';
};

const stageIconState = (state: EssCycleStage['state']) => {
  if (state === 'completed') return 'done';
  if (state === 'active' || state === 'overdue') return 'current';
  if (state === 'upcoming') return 'upcoming';
  return 'locked';
};

function LifecycleBar({ stages }: { stages: EssCycleStage[] }) {
  if (!stages.length) return null;
  return (
    <section className="overflow-x-auto rounded-lg border border-[#DFE5EE] bg-white px-3 py-3 shadow-[0_2px_6px_rgba(24,44,79,0.04)]">
      <div className="flex min-w-[720px] items-start justify-between gap-1">
        {stages.map((stage, index) => {
          const kind = stageIconState(stage.state);
          return (
            <div key={stage.id} className="relative flex min-w-0 flex-1 flex-col items-center px-1 text-center">
              <div
                className={`relative z-[1] grid h-8 w-8 place-items-center rounded-full border bg-white ${
                  kind === 'done'
                    ? 'border-[#00A878] text-[#00A878]'
                    : kind === 'current'
                      ? 'border-2 border-[#0868EC] text-[#0868EC] shadow-[0_0_0_5px_#DCEAFF]'
                      : kind === 'upcoming'
                        ? 'border border-dashed border-[#0868EC] text-[#0868EC]'
                        : 'border-[#CBD3DF] text-[#94A3B8]'
                }`}
              >
                {kind === 'done' ? <Check className="h-4 w-4" /> : kind === 'current' ? <Activity className="h-4 w-4" /> : kind === 'upcoming' ? <Clock3 className="h-4 w-4" /> : <LockKeyhole className="h-3.5 w-3.5" />}
              </div>
              {index < stages.length - 1 ? (
                <span className="absolute left-[62%] right-[-38%] top-[15px] z-0 h-px bg-[#D7DDE7]" aria-hidden />
              ) : null}
              <p className={`mt-1.5 truncate text-[10px] font-bold ${kind === 'current' ? 'text-[#075FE4]' : 'text-[#0F172A]'}`}>
                {stage.label}
              </p>
              <p className={`truncate text-[10px] ${kind === 'current' ? 'text-[#075FE4]' : 'text-[#49566C]'}`}>
                {kind === 'done' ? 'Completed' : kind === 'current' ? 'Current' : kind === 'upcoming' ? 'Upcoming' : 'Locked'}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function deriveTeamRows(workspace: EssPerformanceWorkspace) {
  return workspace.team.reviewQueue.map((row) => {
    const goals = workspace.team.goals.filter(
      (goal) => goal.employeeId === row.employeeId || goal.employeeName === row.fullName,
    );
    const progress = goals.length
      ? Math.round(goals.reduce((sum, goal) => sum + Number(goal.progress || 0), 0) / goals.length)
      : 0;
    const overdueCheckIn = workspace.team.checkIns.some(
      (item) => item.employeeId === row.employeeId && /overdue/i.test(item.status),
    );
    const probation = workspace.team.probation.find((item) => item.employeeId === row.employeeId);
    const days = daysUntil(row.dueDate);
    let status = row.outstanding;
    if (probation && !/confirmed|completed|closed/i.test(probation.status)) status = 'Probation review due';
    else if (overdueCheckIn) status = 'Check-in overdue';
    else if (/awaiting self/i.test(row.outstanding)) status = 'Awaiting acknowledgement';
    else if (/ready for manager|complete manager/i.test(row.outstanding)) status = 'Ready for manager review';

    const currentStage = workspace.activeCycle?.status || row.reviewStage || 'Active Performance';
    return {
      ...row,
      progress,
      status,
      currentStage,
      deadlineLabel: formatDisplayDate(row.dueDate),
      daysLabel: days == null ? '—' : days < 0 ? 'Overdue' : `${days} day${days === 1 ? '' : 's'} left`,
      overdue: days != null && days < 0,
      avatar: initials(row.fullName),
    };
  });
}

export function EssPerformanceTeamDashboard({
  workspace,
  onOpenEmployee,
  onOpenWorkspace,
}: EssPerformanceTeamDashboardProps) {
  const [filter, setFilter] = useState<ActionFilter>('All');
  const [drawer, setDrawer] = useState<EssTeamReviewQueueRow | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = 5;

  const rows = useMemo(() => deriveTeamRows(workspace), [workspace]);

  const teamGoalsAwaitingAck = workspace.team.goals.filter((goal) =>
    /assigned|resubmitted|discussion|await|acknowledg/i.test(goal.status),
  ).length;
  const checkInsOverdue = workspace.team.checkIns.filter((item) => /overdue/i.test(item.status)).length;
  const probationDue = workspace.team.probation.filter((item) => !/confirmed|completed|closed/i.test(item.status)).length;
  const reviewsReady = workspace.metrics.readyForManagerReview || workspace.metrics.pendingManagerReviews;

  const stats = [
    { key: 'All' as ActionFilter, icon: Users, tone: 'green', label: 'Direct Reports', value: workspace.metrics.teamSize },
    { key: 'Awaiting' as ActionFilter, icon: FileText, tone: 'amber', label: 'Goals Awaiting Acknowledgement', value: teamGoalsAwaitingAck },
    { key: 'Check-in' as ActionFilter, icon: Clock3, tone: 'red', label: 'Check-ins Overdue', value: checkInsOverdue },
    { key: 'Ready' as ActionFilter, icon: ClipboardCheck, tone: 'blue', label: 'Reviews Ready', value: reviewsReady },
    { key: 'Probation' as ActionFilter, icon: IdCard, tone: 'violet', label: 'Probation Due Soon', value: probationDue },
  ];

  const filtered = useMemo(() => {
    if (filter === 'All') return rows;
    const needle = filter.toLowerCase();
    return rows.filter((row) => row.status.toLowerCase().includes(needle.split(' ')[0]) || (needle === 'awaiting' && /acknowledg|await/i.test(row.status)));
  }, [filter, rows]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice(page * pageSize, page * pageSize + pageSize);

  const cycle = workspace.activeCycle;
  const completedStages = workspace.cycleStages.filter((stage) => stage.state === 'completed').length;
  const cyclePct = workspace.cycleStages.length
    ? Math.round((completedStages / workspace.cycleStages.length) * 100)
    : 0;
  const remainingPct = Math.max(0, 100 - cyclePct);

  const ratingBuckets = useMemo(() => {
    const bands = [
      { label: '1 - Needs Improvement', count: 0 },
      { label: '2 - Meets Expectations', count: 0 },
      { label: '3 - Exceeds Expectations', count: 0 },
      { label: '4 - Outstanding', count: 0 },
      { label: 'Not Rated', count: 0 },
    ];
    for (const row of rows) {
      if (row.score == null) {
        bands[4].count += 1;
        continue;
      }
      if (row.score < 2) bands[0].count += 1;
      else if (row.score < 3) bands[1].count += 1;
      else if (row.score < 4) bands[2].count += 1;
      else bands[3].count += 1;
    }
    return bands;
  }, [rows]);

  const deadlines = workspace.cycleStages
    .filter((stage) => stage.deadline)
    .slice(0, 4)
    .map((stage) => ({ date: formatDisplayDate(stage.deadline), label: `${stage.label} due` }));

  const workspaces = [
    { id: 'goals' as const, icon: Target, title: 'Team Goals', count: workspace.team.goals.length, description: 'View and manage team goals and alignment', tone: 'text-[#009E76]' },
    { id: 'checkins' as const, icon: MessageSquare, title: 'Check-ins', count: workspace.team.checkIns.length, description: 'Run and track ongoing performance check-ins', tone: 'text-[#E98A00]' },
    { id: 'development' as const, icon: BookOpen, title: 'Development Plans', count: workspace.team.developmentPlans.length, description: 'Support growth with development actions', tone: 'text-[#1268EB]' },
    { id: 'probation' as const, icon: Users, title: 'Probation & Confirmation', count: workspace.team.probation.length, description: 'Track probation and confirmation milestones', tone: 'text-[#8247E8]' },
  ];

  const toneIcon: Record<string, string> = {
    green: 'bg-[#E3F6F0] text-[#009E76]',
    amber: 'bg-[#FFF4DC] text-[#E98A00]',
    red: 'bg-[#FFE8E8] text-[#E02A2F]',
    blue: 'bg-[#E8F1FF] text-[#1268EB]',
    violet: 'bg-[#F1EAFF] text-[#8247E8]',
  };

  return (
    <div className="space-y-3">
      <LifecycleBar stages={workspace.cycleStages} />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {stats.map((stat) => (
          <article key={stat.label} className="flex min-h-[92px] gap-3 rounded-lg border border-[#DFE5EE] bg-white p-3 shadow-[0_2px_6px_rgba(24,44,79,0.04)]">
            <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${toneIcon[stat.tone]}`}>
              <stat.icon className="h-5 w-5" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-[11px] leading-tight text-[#475569]">{stat.label}</span>
              <strong className="text-xl font-bold text-[#0F172A]">{stat.value}</strong>
              <button
                type="button"
                onClick={() => {
                  setFilter(stat.key);
                  setPage(0);
                }}
                className="mt-auto inline-flex items-center gap-1 pt-1 text-[10px] font-semibold text-[#0061E5]"
              >
                View queue <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          </article>
        ))}
      </section>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,2.15fr)_minmax(290px,1fr)]">
        <div className="space-y-3">
          <section className="overflow-hidden rounded-lg border border-[#DFE5EE] bg-white shadow-[0_2px_6px_rgba(24,44,79,0.04)]">
            <div className="flex min-h-10 flex-wrap items-center justify-between gap-2 border-b border-[#DFE5EE] px-3">
              <h2 className="text-xs font-bold text-[#0F172A]">Team Action Centre</h2>
              <div className="flex items-center gap-3">
                <select
                  value={filter}
                  onChange={(event) => {
                    setFilter(event.target.value as ActionFilter);
                    setPage(0);
                  }}
                  className="border-0 bg-transparent text-[10px] text-[#506078] outline-none"
                  aria-label="Filter team action queue"
                >
                  {(['All', 'Awaiting', 'Check-in', 'Mid-year', 'Ready', 'Probation'] as ActionFilter[]).map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
                <button type="button" onClick={() => onOpenWorkspace('reviews')} className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#0061E5]">
                  View all team <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-[10px]">
                <thead>
                  <tr className="bg-[#FAFBFC] text-left font-medium text-[#475569]">
                    <th className="h-8 px-2.5">Employee</th>
                    <th className="h-8 px-2.5">Role</th>
                    <th className="h-8 px-2.5">Current Stage</th>
                    <th className="h-8 px-2.5">Goal Progress</th>
                    <th className="h-8 px-2.5">Next Deadline</th>
                    <th className="h-8 px-2.5">Status</th>
                    <th className="h-8 px-2.5">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.length ? pageRows.map((row, index) => (
                    <tr key={row.employeeId} className="border-t border-[#DFE5EE]">
                      <td className="h-[47px] px-2.5">
                        <div className="flex items-center gap-2">
                          <div className={`grid h-7 w-7 place-items-center rounded-full text-[9px] font-extrabold text-[#13365F] ${index % 2 ? 'bg-[#E8F1FF]' : 'bg-[#D6E4F7]'}`}>
                            {row.avatar}
                          </div>
                          <span className="flex flex-col">
                            <b className="text-[10px] text-[#0963DD]">{row.fullName}</b>
                            <small className="text-[9px] text-[#64748B]">{row.jobTitle || row.department || '—'}</small>
                          </span>
                        </div>
                      </td>
                      <td className="px-2.5"><CheckCircle2 className="h-[19px] w-[19px] text-[#00A878]" /></td>
                      <td className="px-2.5 text-[#0F172A]">{row.currentStage}</td>
                      <td className="px-2.5">
                        <div className="flex items-center gap-2">
                          <i className="block h-1.5 w-[86px] overflow-hidden rounded-full bg-[#E3E8EF]">
                            <em className="block h-full rounded-full bg-[#08A77D]" style={{ width: `${Math.min(100, Math.max(0, row.progress))}%` }} />
                          </i>
                          <span>{row.progress}%</span>
                        </div>
                      </td>
                      <td className="px-2.5">
                        <span className={`flex flex-col ${row.overdue || row.daysLabel === 'Overdue' ? 'text-[#DC2228]' : 'text-[#0F172A]'}`}>
                          {row.deadlineLabel}
                          <small className="text-[9px]">{row.daysLabel}</small>
                        </span>
                      </td>
                      <td className="px-2.5">
                        <span className={`inline-block max-w-[120px] rounded px-2 py-1 text-[9px] font-semibold ${badgeTone(row.status)}`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="px-2.5">
                        <button
                          type="button"
                          onClick={() => setDrawer(row)}
                          className="inline-flex h-7 items-center gap-1 rounded border border-[#90BAFF] bg-white px-2.5 text-[10px] font-semibold text-[#0061E5]"
                        >
                          {/ready|review/i.test(row.status) ? 'Review' : 'View'} <ChevronDown className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-[11px] text-[#64748B]">
                        No team members match this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex h-9 items-center justify-between border-t border-[#DFE5EE] px-3.5">
              <button type="button" className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#075FE4]">
                <Download className="h-3.5 w-3.5" /> Export
              </button>
              <div className="flex items-center gap-2 text-[10px]">
                <button type="button" disabled={page <= 0} onClick={() => setPage((current) => Math.max(0, current - 1))} className="disabled:opacity-40" aria-label="Previous page">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <b className="rounded bg-[#0769E9] px-1.5 py-0.5 text-white">{page + 1}</b>
                <span className="text-[#64748B]">{pageCount}</span>
                <button type="button" disabled={page >= pageCount - 1} onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))} className="disabled:opacity-40" aria-label="Next page">
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-[#DFE5EE] bg-white p-3 shadow-[0_2px_6px_rgba(24,44,79,0.04)]">
            <h2 className="mb-2 text-xs font-bold text-[#0F172A]">Team Performance Workspaces</h2>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
              {workspaces.map((item) => (
                <article key={item.id} className="grid min-h-[135px] grid-cols-[32px_1fr] gap-2 rounded-md border border-[#DFE5EE] p-2.5">
                  <item.icon className={`h-7 w-7 rounded-full bg-[#EFF4FB] p-1.5 ${item.tone}`} />
                  <span className="flex min-w-0 flex-col">
                    <b className="text-[10px] text-[#0F172A]">{item.title}</b>
                    <strong className="text-lg text-[#0F172A]">{item.count}</strong>
                    <small className="text-[9px] leading-snug text-[#64748B]">{item.description}</small>
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenWorkspace(item.id)}
                    className="col-span-2 mt-auto inline-flex h-7 w-max items-center gap-1 self-end rounded border border-[#90BAFF] bg-white px-2.5 text-[10px] font-semibold text-[#0061E5]"
                  >
                    Open <ArrowRight className="h-3 w-3" />
                  </button>
                </article>
              ))}
            </div>
          </section>
        </div>

        <aside className="flex flex-col gap-2.5">
          <section className="rounded-lg border border-[#DFE5EE] bg-white shadow-[0_2px_6px_rgba(24,44,79,0.04)]">
            <div className="flex min-h-10 items-center justify-between border-b border-[#DFE5EE] px-3">
              <h2 className="text-xs font-bold text-[#0F172A]">Cycle Progress</h2>
            </div>
            <div className="flex items-center gap-4 px-4 py-3">
              <div
                className="relative grid h-[92px] w-[92px] shrink-0 place-items-center rounded-full"
                style={{ background: `conic-gradient(#059F88 ${cyclePct}%, #E7EAF0 0)` }}
              >
                <span className="absolute inset-[9px] rounded-full bg-white" />
                <span className="relative z-[1] text-center">
                  <b className="block text-[21px] leading-none text-[#0F172A]">{cyclePct}%</b>
                  <small className="text-[9px] text-[#64748B]">Complete</small>
                </span>
              </div>
              <div>
                <h3 className="text-xs font-bold text-[#0F172A]">{cycle?.status || 'Active Performance'}</h3>
                <p className="text-[10px] text-[#64748B]">
                  {cycle?.name || 'Performance cycle'}
                  {cycle?.endDate ? ` · ends ${formatDisplayDate(cycle.endDate)}` : ''}
                </p>
                <div className="mt-2 flex gap-6 text-[9px] text-[#64748B]">
                  <span className="flex flex-col gap-1">Elapsed <b className="text-[#0F172A]">{cyclePct}%</b></span>
                  <span className="flex flex-col gap-1 border-l border-[#CCD4E0] pl-6">Remaining <b className="text-[#0F172A]">{remainingPct}%</b></span>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-[#DFE5EE] bg-white shadow-[0_2px_6px_rgba(24,44,79,0.04)]">
            <div className="flex min-h-10 items-center justify-between border-b border-[#DFE5EE] px-3">
              <h2 className="text-xs font-bold text-[#0F172A]">Key Deadlines</h2>
            </div>
            <div className="py-1">
              {(deadlines.length ? deadlines : [{ date: '—', label: 'No published stage deadlines yet' }]).map((item) => (
                <div key={`${item.date}-${item.label}`} className="grid grid-cols-[15px_76px_1fr] items-center gap-2 px-3 py-1 text-[9px]">
                  <CalendarDays className="h-3.5 w-3.5 text-[#475569]" />
                  <b className="text-[#0F172A]">{item.date}</b>
                  <span className="text-[#64748B]">{item.label}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-[#DFE5EE] bg-white pb-1.5 shadow-[0_2px_6px_rgba(24,44,79,0.04)]">
            <div className="flex min-h-10 items-center justify-between border-b border-[#DFE5EE] px-3">
              <h2 className="text-xs font-bold text-[#0F172A]">
                Team Rating Distribution <small className="font-medium text-[#64748B]">(Preliminary)</small>
              </h2>
            </div>
            <div className="flex h-[88px] items-end border-b border-[#DFE5EE] px-4 pt-2.5">
              {ratingBuckets.map((bucket, index) => (
                <div key={bucket.label} className="flex flex-1 flex-col items-center text-center">
                  <b className="text-[10px] text-[#0F172A]">{bucket.count}</b>
                  <i
                    className={`mt-1 block w-8 rounded-t-[3px] ${index === 4 ? 'bg-[#9CA7B9]' : 'bg-[#0865E8]'}`}
                    style={{ height: `${bucket.count * 13 + 5}px` }}
                  />
                  <small className="mt-1 min-h-[22px] max-w-[65px] text-[7px] leading-tight text-[#64748B]">{bucket.label}</small>
                </div>
              ))}
            </div>
            <p className="mx-3 my-1 text-[8px] text-[#64748B]">Total: {workspace.metrics.teamSize} employees</p>
          </section>

          <section className="rounded-lg border border-[#DFE5EE] bg-white pb-2.5 shadow-[0_2px_6px_rgba(24,44,79,0.04)]">
            <div className="flex min-h-10 items-center justify-between border-b border-[#DFE5EE] px-3">
              <h2 className="flex items-center gap-2 text-xs font-bold text-[#0F172A]">
                <LockKeyhole className="h-3.5 w-3.5" /> Performance Improvement Plans
              </h2>
              <span className="rounded border border-[#9DC1FF] bg-[#EDF5FF] px-2 py-0.5 text-[9px] font-semibold text-[#075FE4]">Confidential</span>
            </div>
            <p className="mx-7 my-2.5 text-[9px] leading-relaxed text-[#64748B]">
              Manage formal improvement plans in a restricted and confidential workspace.
              {workspace.team.pips.length ? ` ${workspace.team.pips.length} open plan(s).` : ''}
            </p>
            <button
              type="button"
              onClick={() => onOpenWorkspace('pip')}
              className="ml-7 inline-flex h-7 items-center gap-1 rounded border border-[#90BAFF] bg-white px-2.5 text-[10px] font-semibold text-[#0061E5]"
            >
              Open <LockKeyhole className="h-3 w-3" />
            </button>
          </section>
        </aside>
      </div>

      <section className="rounded-lg border border-[#DFE5EE] bg-white pb-2 shadow-[0_2px_6px_rgba(24,44,79,0.04)]">
        <div className="flex min-h-10 items-center justify-between border-b border-[#DFE5EE] px-3">
          <h2 className="text-xs font-bold text-[#0F172A]">Recent Activity</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 px-3 py-2 md:grid-cols-2 xl:grid-cols-5">
          {workspace.activity.slice(0, 5).map((event, index) => (
            <div key={event.id} className="relative flex gap-2">
              {index < Math.min(4, workspace.activity.length - 1) ? (
                <span className="absolute right-[-12px] top-2 hidden w-5 border-t border-[#BDC7D7] xl:block" aria-hidden />
              ) : null}
              <span className="text-[#0870E8]">
                {/check-in|overdue/i.test(event.action) ? <MessageSquare className="h-[18px] w-[18px]" /> : /probation/i.test(event.action) ? <Users className="h-[18px] w-[18px]" /> : <CheckCircle2 className="h-[18px] w-[18px]" />}
              </span>
              <p className="m-0 text-[8px] leading-snug text-[#0F172A]">
                <b className="text-[#075FE4]">{event.actor}</b> {event.action}
                <small className="mt-1 block text-[#66738A]">{event.at.slice(0, 16).replace('T', ' · ')}</small>
              </p>
            </div>
          ))}
          {!workspace.activity.length ? (
            <p className="col-span-full py-4 text-center text-[11px] text-[#64748B]">No recent team performance activity.</p>
          ) : null}
        </div>
      </section>

      {drawer ? (
        <>
          <button type="button" className="fixed inset-0 z-40 bg-[#07172C]/40" aria-label="Close employee drawer" onClick={() => setDrawer(null)} />
          <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[470px] flex-col bg-white shadow-[-20px_0_50px_rgba(0,21,44,0.2)]" role="dialog" aria-modal="true" aria-labelledby="ess-team-drawer-title">
            <div className="flex items-start justify-between border-b border-[#DFE5EE] p-6">
              <div>
                <small className="text-[11px] font-bold text-[#0964DE]">EMPLOYEE REVIEW</small>
                <h2 id="ess-team-drawer-title" className="mt-1.5 text-lg font-bold text-[#0F172A]">{drawer.fullName}</h2>
                <p className="m-0 text-xs text-[#66738A]">
                  {drawer.jobTitle || drawer.department} · {workspace.activeCycle?.name || 'Performance cycle'}
                </p>
              </div>
              <button type="button" onClick={() => setDrawer(null)} aria-label="Close">
                <X className="h-5 w-5 text-[#475569]" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-2 gap-2.5">
                <span className="flex flex-col gap-1.5 rounded-md border border-[#DFE5EE] p-3 text-[11px]">
                  Goal progress
                  <strong className="text-[15px]">{deriveTeamRows(workspace).find((row) => row.employeeId === drawer.employeeId)?.progress ?? 0}%</strong>
                </span>
                <span className="flex flex-col gap-1.5 rounded-md border border-[#DFE5EE] p-3 text-[11px]">
                  Current stage
                  <strong className="text-[15px]">{drawer.reviewStage}</strong>
                </span>
              </div>
              <h3 className="mt-6 text-sm font-bold text-[#0F172A]">Review readiness</h3>
              {[
                { label: 'Performance goals configured', ok: drawer.goalCount > 0 },
                { label: 'Employee acknowledgement / self input', ok: /submitted|completed|approved/i.test(drawer.selfStatus) },
                { label: 'Check-in history available', ok: workspace.team.checkIns.some((item) => item.employeeId === drawer.employeeId) },
                { label: 'Manager assessment in progress', ok: Boolean(drawer.managerAssessmentId) },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2.5 border-b border-[#DFE5EE] py-3 text-xs">
                  {item.ok ? <CheckCircle2 className="h-[18px] w-[18px] text-[#0AA179]" /> : <Clock3 className="h-[18px] w-[18px] text-[#E98A00]" />}
                  <span>{item.label}</span>
                  <b className="ml-auto text-[10px]">{item.ok ? 'Complete' : 'Pending'}</b>
                </div>
              ))}
              <div className="mt-5 flex gap-2.5 rounded-md border border-[#F6D793] bg-[#FFF7E5] p-3 text-[11px]">
                <AlertCircle className="h-[18px] w-[18px] shrink-0 text-[#D88700]" />
                <p className="m-0">Open the full review workspace to continue manager assessment, check-ins, and probation actions.</p>
              </div>
            </div>
            <div className="mt-auto flex justify-end gap-2.5 border-t border-[#DFE5EE] px-6 py-4">
              <button type="button" onClick={() => setDrawer(null)} className="inline-flex h-9 items-center rounded border border-[#90BAFF] bg-white px-3 text-xs font-semibold text-[#0061E5]">
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  onOpenEmployee(drawer.employeeId);
                  setDrawer(null);
                }}
                className="inline-flex h-9 items-center gap-2 rounded bg-[#0768E8] px-3.5 text-xs font-semibold text-white"
              >
                Open full review <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}
