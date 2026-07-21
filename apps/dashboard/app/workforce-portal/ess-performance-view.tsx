'use client';

import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ClipboardList,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { EssPerformanceWorkspace } from '@/lib/ess-performance-workspace';
import { EssCard, EssEmptyState, EssKpiCard } from './ess-portal-ui';
import { EssPerformanceCheckInsPanel } from './ess-performance-checkins';
import { EssPerformanceCycleTracker } from './ess-performance-cycle-tracker';
import { EssPerformanceMidYearPanel } from './ess-performance-midyear';
import { EssCalibrationVisibility, EssDevelopmentWorkspace } from './ess-performance-talent';
import { EssPerformanceTeamView } from './ess-performance-team-view';
import { EssPerformanceActivityFeed } from './ess-performance-controls';

type EssPerformanceViewProps = {
  workspace: EssPerformanceWorkspace | null;
  saving?: boolean;
  onRefresh?: () => void;
  onAction: (action: string, payload?: Record<string, unknown>) => Promise<void>;
};

type PerfTab = 'overview' | 'my-goals' | 'my-reviews' | 'team';

const statusTone = (status: string) => {
  const value = status.toLowerCase();
  if (/complete|agreed|active|approved|acknowledged|submitted|confirmed/i.test(value)) return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  if (/draft|pending|assigned|discussion|returned/i.test(value)) return 'bg-amber-50 text-amber-900 border-amber-200';
  if (/reject|not confirm|risk/i.test(value)) return 'bg-red-50 text-red-800 border-red-200';
  return 'bg-slate-50 text-slate-700 border-slate-200';
};

export function EssPerformanceView({ workspace, saving, onRefresh, onAction }: EssPerformanceViewProps) {
  const [tab, setTab] = useState<PerfTab>('overview');

  const isManager = Boolean(workspace?.team.isManager && workspace.team.directReports.length);
  const hasSelfAppraisal = Boolean(workspace?.self.reviews.some((review) => review.type === 'Self'));
  const canStartSelfAppraisal = Boolean(workspace?.activeCycle && !hasSelfAppraisal);
  const cycleNote = workspace?.activeCycle?.status === 'Goal Setting' && (workspace?.metrics.pendingSelfAppraisal || 0) > 0
    ? 'Cycle is in Goal Setting · a self-appraisal draft is already open for you.'
    : null;
  const tabs = useMemo(() => {
    const items: Array<{ id: PerfTab; label: string }> = [
      { id: 'overview', label: 'Overview' },
      { id: 'my-goals', label: 'My Goals' },
      { id: 'my-reviews', label: 'My Reviews' },
    ];
    if (isManager) items.push({ id: 'team', label: 'My Team' });
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

  const pendingTeam = workspace.metrics.pendingManagerReviews;
  const teamSubtitle = isManager
    ? `${workspace.metrics.completedManagerReviews} of ${workspace.metrics.teamSize} completed · ${pendingTeam} outstanding`
    : 'Performance actions';
  const openQueueItem = (task: (typeof workspace.self.tasks)[number]) => {
    if (task.tab) setTab(task.tab);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#2563EB]">Employee Self-Service</p>
          <h2 className="mt-1 text-2xl font-black text-[#0F172A]">Performance Management</h2>
          <p className="mt-2 max-w-3xl text-sm text-[#64748B]">
            Manage your goals, appraisals, and development in one place.
            {isManager ? ' Line managers can complete team assessments and probation recommendations here.' : ''}
          </p>
          {workspace.activeCycle ? (
            <p className="mt-2 inline-flex rounded-full border border-[#DBEAFE] bg-[#EFF6FF] px-3 py-1 text-xs font-semibold text-[#1D4ED8]">
              Active cycle: {workspace.activeCycle.name} · {workspace.activeCycle.status}
            </p>
          ) : null}
          {cycleNote ? (
            <p className="mt-2 text-xs font-medium text-[#64748B]">{cycleNote}</p>
          ) : null}
        </div>
        {onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            disabled={saving}
            className="inline-flex h-10 items-center rounded-xl border border-[#E2E8F0] bg-white px-4 text-sm font-semibold text-[#475569] hover:bg-[#F8FAFC] disabled:opacity-60"
          >
            Refresh
          </button>
        ) : null}
      </div>

      {workspace.cycleStages?.length ? (
        <EssPerformanceCycleTracker
          cycleName={workspace.activeCycle?.name}
          cycleStatus={workspace.activeCycle?.status}
          stages={workspace.cycleStages}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <EssKpiCard label="My goals" value={String(workspace.metrics.goalsTotal)} subtitle={`${workspace.metrics.goalsAwaitingAck} awaiting acknowledgement`} icon={Target} accent="#2563EB" iconBg="#DBEAFE" />
        <EssKpiCard label="Self-appraisal" value={String(workspace.metrics.pendingSelfAppraisal)} subtitle="Pending your input" icon={ClipboardList} accent="#D97706" iconBg="#FFFBEB" />
        {isManager ? (
          <EssKpiCard label="Team reviews" value={`${workspace.metrics.completedManagerReviews}/${workspace.metrics.teamSize}`} subtitle={teamSubtitle} icon={Users} accent="#7C3AED" iconBg="#F5F3FF" />
        ) : (
          <EssKpiCard label="Open tasks" value={String(workspace.metrics.openTasks)} subtitle="Performance actions" icon={CheckCircle2} accent="#7C3AED" iconBg="#F5F3FF" />
        )}
        <EssKpiCard label="Development" value={String(workspace.self.developmentPlans.length)} subtitle="Active plans" icon={TrendingUp} accent="#047857" iconBg="#ECFDF5" />
      </div>

      <div className="flex flex-wrap gap-2 border-b border-[#E2E8F0] pb-1" role="tablist" aria-label="Performance sections">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`ess-perf-tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={`ess-perf-panel-${item.id}`}
            tabIndex={tab === item.id ? 0 : -1}
            onClick={() => setTab(item.id)}
            className={`rounded-t-lg px-4 py-2 text-sm font-semibold transition-colors ${
              tab === item.id ? 'border-b-2 border-[#2563EB] text-[#2563EB]' : 'text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            {item.label}
          </button>
        ))}
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
                      {task.tab ? ' · Open' : ''}
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
                      {review.type === 'Self' && review.status === 'Returned' ? (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void onAction('assessment.reopen', { id: review.id, reason: 'Employee reopened after manager return' })}
                          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 disabled:opacity-60"
                        >
                          Reopen & edit
                        </button>
                      ) : null}
                      {review.type === 'Self' && ['Draft', 'Returned', 'Not Started'].includes(review.status) ? (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void onAction('assessment.submit', { id: review.id })}
                          className="rounded-lg bg-[#2563EB] px-3 py-2 text-xs font-bold text-white hover:bg-[#1D4ED8] disabled:opacity-60"
                        >
                          Submit self-appraisal
                        </button>
                      ) : null}
                    </div>
                  </div>
                )) : (
                  <div className="p-6 space-y-4">
                    {canStartSelfAppraisal ? (
                      <div className="rounded-xl border border-[#DBEAFE] bg-[#EFF6FF] p-4">
                        <p className="text-sm font-semibold text-[#0F172A]">Self-appraisal is open for {workspace.activeCycle?.name}</p>
                        <p className="mt-1 text-xs text-[#64748B]">Start your draft appraisal to reflect on objectives and submit to your line manager.</p>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void onAction('assessment.save', {
                            cycleId: workspace.activeCycle?.id,
                            type: 'Self',
                            status: 'Draft',
                          })}
                          className="mt-3 inline-flex h-10 items-center rounded-lg bg-[#2563EB] px-4 text-xs font-bold text-white hover:bg-[#1D4ED8] disabled:opacity-60"
                        >
                          Start self-appraisal
                        </button>
                      </div>
                    ) : null}
                    <EssEmptyState icon={ClipboardList} title="No appraisals yet" description="Self-appraisals and published results will appear during the active cycle." />
                  </div>
                )}
              </div>
            </EssCard>
            <EssCalibrationVisibility title="My calibration status" rows={workspace.self.calibration} />
          </div>
          <EssDevelopmentWorkspace workspace={workspace} mode="self" saving={saving} onAction={onAction} />
        </div>
      ) : null}

      {tab === 'team' && isManager ? (
        <div role="tabpanel" id="ess-perf-panel-team" aria-labelledby="ess-perf-tab-team">
          <EssPerformanceTeamView workspace={workspace} saving={saving} onAction={onAction} />
        </div>
      ) : null}
    </div>
  );
}
