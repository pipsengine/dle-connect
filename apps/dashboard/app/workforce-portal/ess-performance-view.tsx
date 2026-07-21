'use client';

import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ClipboardList,
  Loader2,
  Send,
  Target,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react';
import type { EssPerformanceWorkspace } from '@/lib/ess-performance-workspace';
import { EssCard, EssEmptyState, EssKpiCard } from './ess-portal-ui';

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
  const [checkInNotes, setCheckInNotes] = useState('');
  const [checkInProgress, setCheckInProgress] = useState('50');
  const [managerRating, setManagerRating] = useState('3');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [goalTitle, setGoalTitle] = useState('');
  const [probationComment, setProbationComment] = useState('');

  const isManager = Boolean(workspace?.team.isManager && workspace.team.directReports.length);
  const hasSelfAppraisal = Boolean(workspace?.self.reviews.some((review) => review.type === 'Self'));
  const canStartSelfAppraisal = Boolean(workspace?.activeCycle && !hasSelfAppraisal);
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <EssKpiCard label="My goals" value={String(workspace.metrics.goalsTotal)} subtitle={`${workspace.metrics.goalsAwaitingAck} awaiting acknowledgement`} icon={Target} accent="#2563EB" iconBg="#DBEAFE" />
        <EssKpiCard label="Self-appraisal" value={String(workspace.metrics.pendingSelfAppraisal)} subtitle="Pending your input" icon={ClipboardList} accent="#D97706" iconBg="#FFFBEB" />
        {isManager ? (
          <EssKpiCard label="Team reviews" value={String(pendingTeam)} subtitle={`${workspace.metrics.teamSize} direct reports`} icon={Users} accent="#7C3AED" iconBg="#F5F3FF" />
        ) : (
          <EssKpiCard label="Open tasks" value={String(workspace.metrics.openTasks)} subtitle="Performance actions" icon={CheckCircle2} accent="#7C3AED" iconBg="#F5F3FF" />
        )}
        <EssKpiCard label="Development" value={String(workspace.self.developmentPlans.length)} subtitle="Active plans" icon={TrendingUp} accent="#047857" iconBg="#ECFDF5" />
      </div>

      <div className="flex flex-wrap gap-2 border-b border-[#E2E8F0] pb-1">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
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
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <EssCard className="p-5">
            <h3 className="text-sm font-bold text-[#0F172A]">My action queue</h3>
            <div className="mt-4 space-y-2">
              {workspace.self.tasks.length ? workspace.self.tasks.slice(0, 6).map((task) => (
                <div key={task.id} className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2">
                  <p className="text-sm font-semibold text-[#0F172A]">{task.title}</p>
                  <p className="text-xs text-[#64748B]">{task.type} · due {task.dueDate} · {task.status}</p>
                </div>
              )) : (
                <EssEmptyState title="No open tasks" description="You are up to date on performance actions." />
              )}
            </div>
          </EssCard>

          <EssCard className="p-5">
            <h3 className="text-sm font-bold text-[#0F172A]">Continuous check-in</h3>
            <p className="mt-1 text-xs text-[#64748B]">Record progress and notes for your manager.</p>
            <div className="mt-4 grid gap-3">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Progress %</label>
                <input value={checkInProgress} onChange={(e) => setCheckInProgress(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm font-semibold" />
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Shared notes</label>
                <textarea value={checkInNotes} onChange={(e) => setCheckInNotes(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm" placeholder="Progress update for your line manager" />
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => void onAction('checkin.create', {
                  cycleId: workspace.activeCycle?.id,
                  progressPercent: Number(checkInProgress || 0),
                  sharedNotes: checkInNotes,
                  status: 'On Track',
                })}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-4 text-sm font-bold text-white hover:bg-[#1D4ED8] disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Save check-in
              </button>
            </div>
          </EssCard>
        </div>
      ) : null}

      {tab === 'my-goals' ? (
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
      ) : null}

      {tab === 'my-reviews' ? (
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
                    <p className="mt-1 text-xs text-[#64748B]">{review.cycleName} · {review.status}{review.score != null ? ` · score ${review.score}` : ''}</p>
                  </div>
                  {review.type === 'Result' && review.status === 'Published' ? (
                    <button type="button" disabled={saving} onClick={() => void onAction('result.acknowledge', { id: review.id })} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
                      Acknowledge result
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

          <EssCard className="p-5">
            <h3 className="text-sm font-bold text-[#0F172A]">Development plans</h3>
            <div className="mt-4 space-y-2">
              {workspace.self.developmentPlans.length ? workspace.self.developmentPlans.map((plan) => (
                <div key={plan.id} className="rounded-xl border border-[#E2E8F0] px-3 py-2">
                  <p className="text-sm font-semibold text-[#0F172A]">{plan.title}</p>
                  <p className="text-xs text-[#64748B]">{plan.owner} · {plan.status}</p>
                </div>
              )) : (
                <EssEmptyState title="No development plans" description="Plans assigned by your manager will appear here." />
              )}
            </div>
          </EssCard>
        </div>
      ) : null}

      {tab === 'team' && isManager ? (
        <div className="space-y-4">
          <EssCard className="p-5">
            <h3 className="text-sm font-bold text-[#0F172A]">Manager assessments</h3>
            <p className="mt-1 text-xs text-[#64748B]">Complete line-manager reviews for your direct reports.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <div className="md:col-span-2">
                <label className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Employee</label>
                <select value={selectedEmployeeId} onChange={(e) => setSelectedEmployeeId(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm font-semibold">
                  <option value="">Select direct report</option>
                  {workspace.team.directReports.map((row) => (
                    <option key={row.employeeId} value={row.employeeId}>{row.fullName} · {row.employeeCode}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Rating (1–5)</label>
                <input value={managerRating} onChange={(e) => setManagerRating(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm font-semibold" />
              </div>
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  disabled={saving || !selectedEmployeeId}
                  onClick={() => {
                    const employee = workspace.team.directReports.find((row) => row.employeeId === selectedEmployeeId);
                    if (!employee) return;
                    void onAction('assessment.save', {
                      cycleId: workspace.activeCycle?.id,
                      type: 'Manager',
                      employeeId: employee.employeeId,
                      employeeName: employee.fullName,
                      status: 'Draft',
                      managerRating: Number(managerRating || 3),
                    });
                  }}
                  className="h-10 flex-1 rounded-lg border border-[#E2E8F0] bg-white text-xs font-bold text-[#0F172A] hover:bg-[#F8FAFC] disabled:opacity-60"
                >
                  Save draft
                </button>
                <button
                  type="button"
                  disabled={saving || !selectedEmployeeId}
                  onClick={async () => {
                    const employee = workspace.team.directReports.find((row) => row.employeeId === selectedEmployeeId);
                    if (!employee) return;
                    await onAction('assessment.save', {
                      cycleId: workspace.activeCycle?.id,
                      type: 'Manager',
                      employeeId: employee.employeeId,
                      employeeName: employee.fullName,
                      status: 'Draft',
                      managerRating: Number(managerRating || 3),
                    });
                    await onAction('assessment.submit', { type: 'Manager', employeeId: employee.employeeId });
                  }}
                  className="h-10 flex-1 rounded-lg bg-[#2563EB] text-xs font-bold text-white hover:bg-[#1D4ED8] disabled:opacity-60"
                >
                  Submit review
                </button>
              </div>
            </div>

            <div className="mt-5 space-y-2">
              {workspace.team.assessments.length ? workspace.team.assessments.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2">
                  <div>
                    <p className="text-sm font-semibold text-[#0F172A]">{item.employeeName}</p>
                    <p className="text-xs text-[#64748B]">{item.cycleName} · {item.status}</p>
                  </div>
                  <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${statusTone(item.status)}`}>{item.status}</span>
                </div>
              )) : (
                <EssEmptyState icon={UserCheck} title="No team assessments yet" description="Create a manager assessment for a direct report above." />
              )}
            </div>
          </EssCard>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <EssCard className="p-5">
              <h3 className="text-sm font-bold text-[#0F172A]">Assign team goal</h3>
              <div className="mt-3 grid gap-3">
                <select value={selectedEmployeeId} onChange={(e) => setSelectedEmployeeId(e.target.value)} className="h-10 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm font-semibold">
                  <option value="">Select direct report</option>
                  {workspace.team.directReports.map((row) => (
                    <option key={row.employeeId} value={row.employeeId}>{row.fullName}</option>
                  ))}
                </select>
                <input value={goalTitle} onChange={(e) => setGoalTitle(e.target.value)} placeholder="Goal title" className="h-10 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm font-semibold" />
                <button
                  type="button"
                  disabled={saving || !selectedEmployeeId || !goalTitle.trim()}
                  onClick={() => {
                    const employee = workspace.team.directReports.find((row) => row.employeeId === selectedEmployeeId);
                    if (!employee) return;
                    void onAction('goal.upsert', {
                      cycleId: workspace.activeCycle?.id,
                      employeeId: employee.employeeId,
                      employeeCode: employee.employeeCode,
                      employeeName: employee.fullName,
                      department: employee.department,
                      title: goalTitle.trim(),
                      weight: 100,
                    });
                  }}
                  className="h-10 rounded-lg bg-[#2563EB] text-sm font-bold text-white hover:bg-[#1D4ED8] disabled:opacity-60"
                >
                  Assign goal
                </button>
              </div>
              <div className="mt-4 space-y-2">
                {workspace.team.goals.slice(0, 8).map((goal) => (
                  <div key={goal.id} className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-xs">
                    <p className="font-semibold text-[#0F172A]">{goal.employeeName} · {goal.title}</p>
                    <p className="text-[#64748B]">{goal.status} · {goal.progress}%</p>
                  </div>
                ))}
              </div>
            </EssCard>

            <EssCard className="p-5">
              <h3 className="text-sm font-bold text-[#0F172A]">Probation & improvement</h3>
              <div className="mt-3 space-y-2">
                {workspace.team.probation.map((row) => (
                  <div key={row.id} className="rounded-xl border border-[#E2E8F0] px-3 py-2">
                    <p className="text-sm font-semibold text-[#0F172A]">{row.employeeName}</p>
                    <p className="text-xs text-[#64748B]">{row.status} · ends {row.endDate}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" disabled={saving} onClick={() => void onAction('probation.recommend', { id: row.id, recommendation: 'Confirm' })} className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white">Recommend confirm</button>
                      <button type="button" disabled={saving} onClick={() => void onAction('probation.recommend', { id: row.id, recommendation: 'Extend', reason: probationComment || 'Extension required' })} className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-bold text-amber-900">Recommend extend</button>
                    </div>
                  </div>
                ))}
                {workspace.team.pips.map((row) => (
                  <div key={row.id} className="rounded-xl border border-red-100 bg-red-50/40 px-3 py-2">
                    <p className="text-sm font-semibold text-[#0F172A]">PIP · {row.employeeName}</p>
                    <p className="text-xs text-[#64748B]">{row.status} · {row.reason}</p>
                  </div>
                ))}
                {!workspace.team.probation.length && !workspace.team.pips.length ? (
                  <EssEmptyState title="No probation or PIP cases" description="Team probation and improvement cases will appear here." />
                ) : null}
              </div>
              <textarea value={probationComment} onChange={(e) => setProbationComment(e.target.value)} rows={2} placeholder="Optional recommendation notes" className="mt-3 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-xs" />
            </EssCard>
          </div>
        </div>
      ) : null}
    </div>
  );
}
