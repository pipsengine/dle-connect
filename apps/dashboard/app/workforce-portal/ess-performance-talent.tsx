'use client';

import { useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import type { EssCalibrationRow, EssDevelopmentPlanRow, EssPerformanceWorkspace, EssPipRow, EssProbationRow } from '@/lib/ess-performance-workspace';
import { EssCard, EssEmptyState } from './ess-portal-ui';

const statusTone = (status: string) => {
  if (/approved|completed|confirmed|active|on track/i.test(status)) return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  if (/pending|draft|proposed|open|review/i.test(status)) return 'bg-amber-50 text-amber-900 border-amber-200';
  if (/reject|unsuccessful|not confirm|at risk/i.test(status)) return 'bg-red-50 text-red-800 border-red-200';
  return 'bg-slate-50 text-slate-700 border-slate-200';
};

export function EssCalibrationVisibility({
  title,
  rows,
}: {
  title: string;
  rows: EssCalibrationRow[];
}) {
  return (
    <EssCard className="p-5">
      <h3 className="text-sm font-bold text-[#0F172A]">{title}</h3>
      <p className="mt-1 text-xs text-[#64748B]">
        Submitted ratings do not publish directly. Calibration status, original score, and final approved score appear here after HR/committee review.
      </p>
      <div className="mt-4 space-y-2">
        {rows.length ? rows.map((row) => (
          <article key={row.id} className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-[#0F172A]">{row.employeeName}</p>
                <p className="text-xs text-[#64748B]">
                  Original {row.originalScore} ({row.originalBand})
                  {row.proposedScore != null ? ` · Proposed ${row.proposedScore}${row.proposedBand ? ` (${row.proposedBand})` : ''}` : ''}
                  {row.approvedScore != null ? ` · Final ${row.approvedScore}${row.approvedBand ? ` (${row.approvedBand})` : ''}` : ''}
                </p>
                {row.justification ? <p className="mt-1 text-xs text-[#475569]">Adjustment: {row.justification}</p> : null}
                {row.decidedBy ? <p className="mt-1 text-xs text-[#64748B]">Decision by {row.decidedBy}{row.decidedAt ? ` · ${row.decidedAt.slice(0, 10)}` : ''}</p> : null}
              </div>
              <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${statusTone(row.status)}`}>{row.status}</span>
            </div>
          </article>
        )) : (
          <EssEmptyState title="No calibration cases" description="When reviews enter calibration, original and moderated scores will show here." />
        )}
      </div>
    </EssCard>
  );
}

export function EssProbationWorkspace({
  rows,
  saving,
  onAction,
}: {
  rows: EssProbationRow[];
  saving?: boolean;
  onAction: (action: string, payload?: Record<string, unknown>) => Promise<void>;
}) {
  const [notes, setNotes] = useState('');
  return (
    <EssCard className="p-5">
      <h3 className="text-sm font-bold text-[#0F172A]">Probation & confirmation</h3>
      <p className="mt-1 text-xs text-[#64748B]">Separate from PIP. Recommend confirm, extend, or do not confirm for HR decision.</p>
      <div className="mt-4 space-y-3">
        {rows.length ? rows.map((row) => (
          <article key={row.id} className="rounded-xl border border-[#E2E8F0] px-3 py-2">
            <p className="text-sm font-semibold text-[#0F172A]">{row.employeeName}</p>
            <p className="text-xs text-[#64748B]">{row.department} · {row.status} · {row.startDate} → {row.endDate}</p>
            {row.recommendation ? <p className="mt-1 text-xs font-semibold text-[#1D4ED8]">Recommendation: {row.recommendation}</p> : null}
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" disabled={saving} onClick={() => void onAction('probation.recommend', { id: row.id, recommendation: 'Confirm', reason: notes || 'Recommend confirmation' })} className="min-h-11 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white disabled:opacity-60">Confirm</button>
              <button type="button" disabled={saving} onClick={() => void onAction('probation.recommend', { id: row.id, recommendation: 'Extend', reason: notes || 'Extension required' })} className="min-h-11 rounded-lg border border-amber-200 bg-amber-50 px-3 text-xs font-bold text-amber-900 disabled:opacity-60">Extend</button>
              <button type="button" disabled={saving} onClick={() => void onAction('probation.recommend', { id: row.id, recommendation: 'Do Not Confirm', reason: notes || 'Do not confirm' })} className="min-h-11 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-bold text-red-800 disabled:opacity-60">Do not confirm</button>
            </div>
          </article>
        )) : (
          <EssEmptyState title="No probation cases" description="Team probation cases assigned to you will appear here." />
        )}
      </div>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Recommendation notes (optional)" className="mt-3 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-xs" />
    </EssCard>
  );
}

export function EssPipWorkspace({
  workspace,
  saving,
  onAction,
}: {
  workspace: EssPerformanceWorkspace;
  saving?: boolean;
  onAction: (action: string, payload?: Record<string, unknown>) => Promise<void>;
}) {
  const [employeeId, setEmployeeId] = useState('');
  const [reason, setReason] = useState('');
  const [gaps, setGaps] = useState('');
  const [support, setSupport] = useState('');
  const [objective, setObjective] = useState('');
  const [target, setTarget] = useState('');
  const [weight, setWeight] = useState('100');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState('');
  const [milestone, setMilestone] = useState('');
  const [error, setError] = useState('');

  const rows = workspace.team.pips;

  const submit = async () => {
    const employee = workspace.team.directReports.find((row) => row.employeeId === employeeId);
    if (!employee) {
      setError('Select an employee.');
      return;
    }
    if (!reason.trim() || !gaps.trim() || !objective.trim() || !target.trim()) {
      setError('Reason, gaps, improvement objective, and success criteria are required.');
      return;
    }
    setError('');
    await onAction('pip.upsert', {
      cycleId: workspace.activeCycle?.id,
      employeeId: employee.employeeId,
      employeeName: employee.fullName,
      reason: reason.trim(),
      gaps: gaps.trim(),
      support: support.trim(),
      startDate,
      endDate: endDate || startDate,
      status: 'Pending HR',
      objectives: [{
        title: objective.trim(),
        target: target.trim(),
        weight: Number(weight || 100),
        dueDate: endDate || startDate,
      }],
      milestones: milestone.trim()
        ? [{ date: endDate || startDate, notes: milestone.trim(), outcome: 'Pending' }]
        : [],
    });
    setReason('');
    setGaps('');
    setSupport('');
    setObjective('');
    setTarget('');
    setMilestone('');
  };

  return (
    <EssCard className="p-5">
      <h3 className="text-sm font-bold text-[#0F172A]">Performance Improvement Plans (PIP)</h3>
      <p className="mt-1 text-xs text-[#64748B]">Separate confidential process from probation. Drafts route to HR for review before activation.</p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Employee</label>
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm font-semibold">
            <option value="">Select direct report</option>
            {workspace.team.directReports.map((row) => (
              <option key={row.employeeId} value={row.employeeId}>{row.fullName}</option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Identified performance gap</label>
          <textarea value={gaps} onChange={(e) => setGaps(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm" />
        </div>
        <div className="md:col-span-2">
          <label className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Reason / trigger</label>
          <input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm font-semibold" />
        </div>
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Improvement objective</label>
          <input value={objective} onChange={(e) => setObjective(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm font-semibold" />
        </div>
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Success criteria</label>
          <input value={target} onChange={(e) => setTarget(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm font-semibold" />
        </div>
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Weight %</label>
          <input value={weight} onChange={(e) => setWeight(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm font-semibold" />
        </div>
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Support / training</label>
          <input value={support} onChange={(e) => setSupport(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm font-semibold" placeholder="Coaching, training, tools" />
        </div>
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Start date</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm font-semibold" />
        </div>
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">End date</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm font-semibold" />
        </div>
        <div className="md:col-span-2">
          <label className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Review milestone</label>
          <input value={milestone} onChange={(e) => setMilestone(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm font-semibold" placeholder="e.g. 30-day progress review" />
        </div>
      </div>
      {error ? <p className="mt-2 text-xs font-semibold text-red-700">{error}</p> : null}
      <button type="button" disabled={saving} onClick={() => void submit()} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#2563EB] px-4 text-sm font-bold text-white disabled:opacity-60">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Submit PIP draft to HR
      </button>

      <div className="mt-5 space-y-2 border-t border-[#E2E8F0] pt-4">
        <p className="text-xs font-bold uppercase tracking-wide text-[#64748B]">Team PIP cases</p>
        {rows.length ? rows.map((row) => (
          <PipCaseCard key={row.id} row={row} />
        )) : (
          <EssEmptyState title="No PIP cases" description="Active and draft PIPs for your team will list here." />
        )}
      </div>
    </EssCard>
  );
}

function PipCaseCard({ row }: { row: EssPipRow }) {
  return (
    <article className="rounded-xl border border-red-100 bg-red-50/30 px-3 py-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-[#0F172A]">{row.employeeName}</p>
          <p className="text-xs text-[#64748B]">{row.startDate} → {row.endDate} · {row.reason}</p>
          <p className="mt-1 text-xs text-[#475569]">Gaps: {row.gaps}</p>
          {row.objectives[0] ? <p className="mt-1 text-xs text-[#475569]">Objective: {row.objectives[0].title} · {row.objectives[0].target}</p> : null}
          {row.support ? <p className="mt-1 text-xs text-[#64748B]">Support: {row.support}</p> : null}
        </div>
        <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${statusTone(row.status)}`}>{row.status}</span>
      </div>
    </article>
  );
}

export function EssDevelopmentWorkspace({
  workspace,
  mode,
  saving,
  onAction,
}: {
  workspace: EssPerformanceWorkspace;
  mode: 'self' | 'team';
  saving?: boolean;
  onAction: (action: string, payload?: Record<string, unknown>) => Promise<void>;
}) {
  const plans = mode === 'self' ? workspace.self.developmentPlans : workspace.team.developmentPlans;
  const [employeeId, setEmployeeId] = useState('');
  const [need, setNeed] = useState('');
  const [actionText, setActionText] = useState('');
  const [dueDate, setDueDate] = useState(workspace.activeCycle?.endDate || '');
  const [priority, setPriority] = useState('Normal');
  const [error, setError] = useState('');

  const createPlan = async () => {
    const employee = workspace.team.directReports.find((row) => row.employeeId === employeeId);
    if (!employee || !need.trim() || !actionText.trim()) {
      setError('Employee, competency need, and at least one action are required.');
      return;
    }
    setError('');
    await onAction('development.upsert', {
      cycleId: workspace.activeCycle?.id,
      employeeId: employee.employeeId,
      employeeName: employee.fullName,
      need: need.trim(),
      priority,
      status: 'Active',
      actions: [{
        action: actionText.trim(),
        owner: 'Manager',
        dueDate: dueDate || new Date().toISOString().slice(0, 10),
        status: 'Planned',
      }],
    });
    setNeed('');
    setActionText('');
  };

  return (
    <EssCard className="p-5">
      <h3 className="text-sm font-bold text-[#0F172A]">{mode === 'self' ? 'My development plans' : 'Team development plans'}</h3>
      <p className="mt-1 text-xs text-[#64748B]">
        {mode === 'self'
          ? 'Plans assigned by your manager for competency growth and training.'
          : 'Create development plans linked to performance outcomes for direct reports.'}
      </p>

      {mode === 'team' ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Employee</label>
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm font-semibold">
              <option value="">Select direct report</option>
              {workspace.team.directReports.map((row) => (
                <option key={row.employeeId} value={row.employeeId}>{row.fullName}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Competency gap / need</label>
            <input value={need} onChange={(e) => setNeed(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm font-semibold" />
          </div>
          <div className="md:col-span-2">
            <label className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Development action (training / coaching / mentoring)</label>
            <input value={actionText} onChange={(e) => setActionText(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm font-semibold" />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Priority</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm font-semibold">
              {['High', 'Normal', 'Low'].map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Due date</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm font-semibold" />
          </div>
          {error ? <p className="md:col-span-2 text-xs font-semibold text-red-700">{error}</p> : null}
          <button type="button" disabled={saving} onClick={() => void createPlan()} className="md:col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-4 text-sm font-bold text-white disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Create development plan
          </button>
        </div>
      ) : null}

      <div className="mt-4 space-y-2">
        {plans.length ? plans.map((plan) => (
          <DevelopmentPlanCard key={plan.id} plan={plan} />
        )) : (
          <EssEmptyState title="No development plans" description={mode === 'self' ? 'Plans assigned to you will appear here.' : 'Create a plan above for a direct report.'} />
        )}
      </div>
    </EssCard>
  );
}

function DevelopmentPlanCard({ plan }: { plan: EssDevelopmentPlanRow }) {
  return (
    <article className="rounded-xl border border-[#E2E8F0] px-3 py-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-[#0F172A]">{plan.employeeName ? `${plan.employeeName} · ` : ''}{plan.need}</p>
          <p className="text-xs text-[#64748B]">Owner {plan.owner} · priority {plan.priority}</p>
          {plan.actions.map((action) => (
            <p key={action.id} className="mt-1 text-xs text-[#475569]">• {action.action} · due {action.dueDate} · {action.status}</p>
          ))}
        </div>
        <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${statusTone(plan.status)}`}>{plan.status}</span>
      </div>
    </article>
  );
}
