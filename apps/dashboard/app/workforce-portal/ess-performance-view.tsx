'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Briefcase,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Home,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { EssPerformanceWorkspace } from '@/lib/ess-performance-workspace';
import { EssCard, EssEmptyState } from './ess-portal-ui';
import { EssPerformanceCheckInsPanel } from './ess-performance-checkins';
import { EssPerformanceMidYearPanel } from './ess-performance-midyear';
import { EssCalibrationVisibility, EssDevelopmentWorkspace } from './ess-performance-talent';
import { EssPerformanceTeamView } from './ess-performance-team-view';
import { EssPerformanceActivityFeed } from './ess-performance-controls';
import { EssSelfAssessmentEditor } from './ess-performance-self-assessment';
import { EssPerformanceAppealPanel } from './ess-performance-appeal';
import {
  EssPerformanceTeamDashboard,
  type TeamWorkspaceSection,
} from './ess-performance-team-dashboard';

type EssPerformanceViewProps = {
  workspace: EssPerformanceWorkspace | null;
  saving?: boolean;
  onRefresh?: () => void;
  onAction: (action: string, payload?: Record<string, unknown>) => Promise<void>;
};

type PerfTab = 'overview' | 'my-goals' | 'my-reviews' | 'my-development' | 'team';

type TeamDetailState = {
  employeeId?: string;
  section: TeamWorkspaceSection;
} | null;

const statusTone = (status: string) => {
  const value = status.toLowerCase();
  if (/complete|agreed|active|approved|acknowledged|submitted|confirmed/i.test(value)) return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  if (/draft|pending|assigned|discussion|returned/i.test(value)) return 'bg-amber-50 text-amber-900 border-amber-200';
  if (/reject|not confirm|risk/i.test(value)) return 'bg-red-50 text-red-800 border-red-200';
  return 'bg-slate-50 text-slate-700 border-slate-200';
};

const formatCycleRange = (workspace: EssPerformanceWorkspace) => {
  const end = workspace.activeCycle?.endDate;
  if (!end) return workspace.activeCycle?.status || 'Active Performance';
  const value = new Date(`${end.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(value.getTime())) return end;
  return `Ends ${value.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
};

export function EssPerformanceView({ workspace, saving, onRefresh, onAction }: EssPerformanceViewProps) {
  const [tab, setTab] = useState<PerfTab>('overview');
  const [teamDetail, setTeamDetail] = useState<TeamDetailState>(null);
  const [managerDefaultApplied, setManagerDefaultApplied] = useState(false);

  const isManager = Boolean(workspace?.team.isManager && workspace.team.directReports.length);

  useEffect(() => {
    if (isManager && !managerDefaultApplied) {
      setTab('team');
      setManagerDefaultApplied(true);
    }
  }, [isManager, managerDefaultApplied]);

  const tabs = useMemo(() => {
    const items: Array<{ id: PerfTab; label: string; icon: typeof Home }> = [
      { id: 'overview', label: 'Overview', icon: Home },
      { id: 'my-goals', label: 'My Goals', icon: Target },
      { id: 'my-reviews', label: 'My Appraisals & Results', icon: Briefcase },
      { id: 'my-development', label: 'My Development', icon: BookOpen },
    ];
    if (isManager) items.push({ id: 'team', label: 'Team Performance', icon: Users });
    return items;
  }, [isManager]);

  if (!workspace) {
    return (
      <EssEmptyState
        icon={Target}
        title="Loading performance workspace"
        description="Your goals, reviews, and manager actions will appear here."
      />
    );
  }

  const openQueueItem = (task: (typeof workspace.self.tasks)[number]) => {
    if (task.tab === 'team') setTab('team');
    else if (task.tab === 'my-goals') setTab('my-goals');
    else if (task.tab === 'my-reviews') setTab('my-reviews');
    else setTab('overview');
  };

  const openTeamWorkspace = (section: TeamWorkspaceSection, employeeId?: string) => {
    setTeamDetail({ section, employeeId });
    setTab('team');
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="mr-auto min-w-0">
          <h1 className="m-0 text-[26px] font-bold tracking-[-0.6px] text-[#0A1F44]">Performance Management</h1>
          <p className="mt-1.5 text-xs text-[#66738A]">
            Manage your goals, appraisals, development, and team performance
          </p>
        </div>
        <div className="inline-flex min-h-[52px] items-center gap-2.5 rounded-lg border border-[#DFE5EE] bg-white px-3.5 py-2 text-[11px] text-[#0F172A]">
          <CalendarDays className="h-4 w-4 text-[#475569]" />
          <span className="font-semibold">{workspace.activeCycle?.name || 'No active cycle'}</span>
          <ChevronDown className="ml-2 h-3.5 w-3.5 text-[#94A3B8]" />
        </div>
        {workspace.activeCycle ? (
          <div className="inline-flex min-h-[52px] flex-col justify-center rounded-lg border border-[#DFE5EE] bg-white px-4 py-2 text-[11px]">
            <span className="font-bold text-[#008A69]">● &nbsp; {workspace.activeCycle.status || 'Active Performance'}</span>
            <small className="text-[#66738A]">{formatCycleRange(workspace)}</small>
          </div>
        ) : null}
        {onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            disabled={saving}
            className="inline-flex h-10 items-center rounded-lg border border-[#E2E8F0] bg-white px-4 text-sm font-semibold text-[#475569] hover:bg-[#F8FAFC] disabled:opacity-60"
          >
            Refresh
          </button>
        ) : null}
      </div>

      <div
        className="grid overflow-hidden rounded-lg border border-[#DFE5EE] bg-white shadow-[0_2px_6px_rgba(24,44,79,0.04)]"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
        role="tablist"
        aria-label="Performance sections"
      >
        {tabs.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`ess-perf-tab-${item.id}`}
              aria-selected={active}
              aria-controls={`ess-perf-panel-${item.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => {
                if (item.id !== 'team') setTeamDetail(null);
                setTab(item.id);
              }}
              className={`relative flex h-[46px] items-center justify-center gap-2 border-0 bg-white px-2 text-[11px] ${
                active ? 'font-bold text-[#075FE4]' : 'font-medium text-[#14213B]'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
              {active ? <span className="absolute inset-x-0 bottom-0 h-1 bg-[#1474F5]" /> : null}
            </button>
          );
        })}
      </div>

      {tab === 'overview' ? (
        <div className="space-y-4" role="tabpanel" id="ess-perf-panel-overview" aria-labelledby="ess-perf-tab-overview">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <EssCard className="p-5">
              <h3 className="text-sm font-bold text-[#0F172A]">My action queue</h3>
              <div className="mt-4 space-y-2">
                {workspace.self.tasks.length ? workspace.self.tasks.slice(0, 8).map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => openQueueItem(task)}
                    className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-left transition hover:border-[#BFDBFE] hover:bg-[#EFF6FF]"
                  >
                    <p className="text-sm font-semibold text-[#0F172A]">{task.title}</p>
                    <p className="text-xs text-[#64748B]">
                      {task.type}
                      {task.dueDate ? ` · due ${task.dueDate}` : ''}
                      {' · '}
                      {task.status}
                    </p>
                  </button>
                )) : (
                  <EssEmptyState title="No open tasks" description="You are up to date on performance actions." />
                )}
              </div>
            </EssCard>
            <EssPerformanceMidYearPanel workspace={workspace} saving={saving} onAction={onAction} />
          </div>
          <EssPerformanceCheckInsPanel workspace={workspace} saving={saving} onAction={onAction} />
          <EssPerformanceActivityFeed rows={workspace.activity || []} />
        </div>
      ) : null}

      {tab === 'my-goals' ? (
        <div role="tabpanel" id="ess-perf-panel-my-goals" aria-labelledby="ess-perf-tab-my-goals">
          <EssCard className="overflow-hidden">
            <div className="border-b border-[#E2E8F0] bg-[#F8FAFC] px-5 py-3">
              <h3 className="text-sm font-bold text-[#0F172A]">My goals & OKRs</h3>
            </div>
            <div className="divide-y divide-[#F1F5F9]">
              {workspace.self.goals.length ? workspace.self.goals.map((goal) => (
                <div key={goal.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                  <div>
                    <p className="font-semibold text-[#0F172A]">{goal.title}</p>
                    <p className="mt-1 text-xs text-[#64748B]">Due {goal.dueDate} · {goal.progress}% · weight {goal.weight}%</p>
                    <span className={`mt-2 inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${statusTone(goal.status)}`}>{goal.status}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {goal.acknowledgementRequired ? (
                      <button type="button" disabled={saving} onClick={() => void onAction('goal.acknowledge', { id: goal.id })} className="rounded-lg bg-[#2563EB] px-3 py-2 text-xs font-bold text-white hover:bg-[#1D4ED8] disabled:opacity-60">
                        Acknowledge
                      </button>
                    ) : null}
                    <button type="button" disabled={saving} onClick={() => void onAction('goal.request-discussion', { id: goal.id, comment: 'Please discuss this goal with me.' })} className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs font-bold text-[#475569] hover:bg-[#F8FAFC] disabled:opacity-60">
                      Request discussion
                    </button>
                  </div>
                </div>
              )) : (
                <div className="p-6"><EssEmptyState icon={Target} title="No goals assigned" description="Goals will appear here when HR publishes the active performance cycle." /></div>
              )}
            </div>
          </EssCard>
        </div>
      ) : null}

      {tab === 'my-reviews' ? (
        <div className="space-y-4" role="tabpanel" id="ess-perf-panel-my-reviews" aria-labelledby="ess-perf-tab-my-reviews">
          <EssSelfAssessmentEditor workspace={workspace} assessmentType="Self" saving={saving} onAction={onAction} />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <EssCard className="overflow-hidden">
              <div className="border-b border-[#E2E8F0] bg-[#F8FAFC] px-5 py-3">
                <h3 className="text-sm font-bold text-[#0F172A]">Appraisals & results</h3>
              </div>
              <div className="divide-y divide-[#F1F5F9]">
                {workspace.self.reviews.length ? workspace.self.reviews.map((review) => (
                  <div key={review.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                    <div>
                      <p className="font-semibold text-[#0F172A]">{review.form}</p>
                      <p className="mt-1 text-xs text-[#64748B]">
                        {review.cycleName} · {review.status}
                        {review.score != null ? ` · score ${review.score}` : ''}
                        {review.version != null ? ` · v${review.version}` : ''}
                      </p>
                      {review.returnedReason ? (
                        <p className="mt-2 text-xs font-semibold text-amber-800" role="status">Returned for revision: {review.returnedReason}</p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {review.type === 'Result' && review.status === 'Published' ? (
                        <button type="button" disabled={saving} onClick={() => void onAction('result.acknowledge', { id: review.id })} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
                          Acknowledge result
                        </button>
                      ) : null}
                    </div>
                  </div>
                )) : (
                  <div className="p-6">
                    <EssEmptyState icon={ClipboardList} title="No appraisals yet" description="Self-appraisals and published results will appear during the active cycle." />
                  </div>
                )}
              </div>
            </EssCard>
            <EssCalibrationVisibility title="My calibration status" rows={workspace.self.calibration} />
          </div>
          <EssPerformanceAppealPanel workspace={workspace} saving={saving} onAction={onAction} />
        </div>
      ) : null}

      {tab === 'my-development' ? (
        <div role="tabpanel" id="ess-perf-panel-my-development" aria-labelledby="ess-perf-tab-my-development">
          <EssDevelopmentWorkspace workspace={workspace} mode="self" saving={saving} onAction={onAction} />
        </div>
      ) : null}

      {tab === 'team' && isManager ? (
        <div role="tabpanel" id="ess-perf-panel-team" aria-labelledby="ess-perf-tab-team" className="space-y-3">
          {teamDetail ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#DFE5EE] bg-white px-3 py-2">
                <p className="text-xs font-semibold text-[#475569]">
                  Full team workspace
                  {teamDetail.employeeId ? ' · employee review open' : ` · ${teamDetail.section}`}
                </p>
                <button
                  type="button"
                  onClick={() => setTeamDetail(null)}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0061E5]"
                >
                  <TrendingUp className="h-3.5 w-3.5" /> Back to Team Performance dashboard
                </button>
              </div>
              <EssPerformanceTeamView
                workspace={workspace}
                saving={saving}
                onAction={onAction}
                initialEmployeeId={teamDetail.employeeId}
                focusSection={teamDetail.section}
              />
            </>
          ) : (
            <EssPerformanceTeamDashboard
              workspace={workspace}
              onOpenEmployee={(employeeId) => openTeamWorkspace('reviews', employeeId)}
              onOpenWorkspace={(section) => openTeamWorkspace(section)}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}
