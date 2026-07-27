'use client';

import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ClipboardList,
  Plus,
  RefreshCcw,
  Save,
  Send,
} from 'lucide-react';
import type { PerformanceWorkspacePayload } from '@/lib/performance-domain-types';
import { displayScore } from '@/lib/performance-calculation';
import PerformanceCyclesView from './PerformanceCyclesView';
import CompanyObjectivesView from './CompanyObjectivesView';
import GoalCascadingView from './GoalCascadingView';
import OkrKpiManagementView from './OkrKpiManagementView';
import MidYearReviewsView from './MidYearReviewsView';
import SelfAppraisalView from './SelfAppraisalView';
import ManagerAssessmentsView from './ManagerAssessmentsView';

type Props = {
  route: string;
  payload: PerformanceWorkspacePayload;
  onAction: (action: string, data?: Record<string, unknown>) => Promise<void>;
  busy?: boolean;
};

const card = 'rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-sm';
const btn = 'inline-flex h-10 items-center gap-2 rounded-lg bg-[#0052CC] px-3 text-sm font-bold text-white hover:bg-[#0747A6] disabled:opacity-50';
const btnGhost = 'inline-flex h-10 items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm font-bold text-[#0F172A] hover:bg-[#F8FAFC] disabled:opacity-50';
const input = 'h-10 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm font-semibold outline-none focus:border-[#0052CC]';
const label = 'mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#64748B]';

function SectionShell({ title, detail, children, actions }: { title: string; detail?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#0052CC]">Performance Management</p>
          <h2 className="mt-1 text-2xl font-black text-[#0F172A]">{title}</h2>
          {detail ? <p className="mt-1 max-w-3xl text-sm font-semibold text-[#64748B]">{detail}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed border-[#E2E8F0] bg-[#F8FAFC] px-4 py-8 text-center text-sm font-semibold text-[#94A3B8]">{text}</p>;
}

export default function PerformanceDomainWorkspace({ route, payload, onAction, busy }: Props) {
  const domain = payload.domain;
  const [form, setForm] = useState<Record<string, string>>({});
  const activeCycleId = domain.activeCycleId || domain.cycles[0]?.id || '';

  const setField = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const isHrScope = payload.actor.scope === 'global';
  const isTeamScope = payload.actor.scope === 'team';
  const openTeamTasks = domain.tasks.filter((task) => !['Completed', 'Cancelled'].includes(task.status));

  const teamQueueBanner = isTeamScope && openTeamTasks.length ? (
    <div className={`${card} border-[#DBEAFE] bg-[#EFF6FF]`}>
      <h3 className="font-black text-[#0F172A]">Manager action queue</h3>
      <p className="mt-1 text-sm font-semibold text-[#64748B]">{openTeamTasks.length} open task(s) for your team.</p>
      <ul className="mt-3 space-y-2">
        {openTeamTasks.slice(0, 5).map((task) => (
          <li key={task.id} className="text-sm font-semibold text-[#334155]">{task.title} · due {task.dueDate}</li>
        ))}
      </ul>
    </div>
  ) : null;

  const cyclesView = (
    <PerformanceCyclesView payload={payload} onAction={onAction} busy={busy} />
  );

  const companyObjectivesView = (
    <CompanyObjectivesView payload={payload} onAction={onAction} busy={busy} />
  );

  const goalsView = (
    <OkrKpiManagementView payload={payload} onAction={onAction} busy={busy} />
  );

  const checkInsView = (
    <SectionShell title="Continuous Check-ins" detail="Record progress, shared notes, private manager notes, and commitments.">
      <div className={`${card} grid gap-3 md:grid-cols-2`}>
        <div><label className={label}>Employee</label><input className={input} value={form.ciEmployee || ''} onChange={(e) => setField('ciEmployee', e.target.value)} /></div>
        <div><label className={label}>Progress %</label><input className={input} value={form.ciProgress || '50'} onChange={(e) => setField('ciProgress', e.target.value)} /></div>
        <div className="md:col-span-2"><label className={label}>Shared notes</label><input className={input} value={form.ciNotes || ''} onChange={(e) => setField('ciNotes', e.target.value)} /></div>
        <button
          type="button"
          className={btn}
          disabled={busy}
          onClick={() => onAction('checkin.create', {
            cycleId: activeCycleId,
            employeeName: form.ciEmployee || payload.actor.fullName,
            employeeId: payload.actor.employeeId,
            progressPercent: Number(form.ciProgress || 0),
            sharedNotes: form.ciNotes || '',
            status: 'On Track',
            commitments: [{ text: form.ciCommit || 'Follow up on agreed actions', owner: payload.actor.fullName, dueDate: new Date().toISOString().slice(0, 10) }],
          })}
        >
          <Save className="h-4 w-4" /> Save check-in
        </button>
      </div>
      <div className="space-y-3">
        {domain.checkIns.slice(0, 30).map((item) => (
          <article key={item.id} className={card}>
            <h3 className="font-black text-[#0F172A]">{item.employeeName} · {item.date}</h3>
            <p className="text-sm font-semibold text-[#64748B]">{item.status} · {item.progressPercent}% · {item.sharedNotes || 'No shared notes'}</p>
          </article>
        ))}
        {!domain.checkIns.length ? <Empty text="No check-ins recorded yet." /> : null}
      </div>
    </SectionShell>
  );

  const assessmentView = (type: 'Self' | 'Manager' | 'Mid-Year' | 'Behavioural') => (
    <SectionShell title={`${type} Assessment`} detail="Draft, submit, and track assessment items with evidence and variance controls.">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={btn}
          disabled={busy}
          onClick={() => onAction('assessment.save', {
            cycleId: activeCycleId,
            type,
            employeeId: form.asEmployeeId || payload.actor.employeeId,
            employeeName: form.asEmployeeName || payload.actor.fullName,
            status: 'Draft',
            items: domain.goals.filter((goal) => goal.employeeId === (form.asEmployeeId || payload.actor.employeeId)).slice(0, 4).map((goal) => ({
              itemId: goal.id,
              itemType: 'okr',
              title: goal.title,
              weight: goal.weight,
              selfRating: type === 'Self' ? Number(form.asRating || 3) : undefined,
              managerRating: type === 'Manager' ? Number(form.asRating || 3) : undefined,
              achievement: Number(form.asRating || 3) * 20,
            })),
          })}
        >
          <Save className="h-4 w-4" /> Create draft
        </button>
      </div>
      <div className="space-y-3">
        {domain.assessments.filter((item) => item.type === type || (type === 'Behavioural' && item.type === 'Behavioural')).slice(0, 30).map((item) => (
          <article key={item.id} className={card}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-black text-[#0F172A]">{item.employeeName}</h3>
                <p className="text-sm font-semibold text-[#64748B]">{item.type} · {item.status} · {item.items.length} items</p>
              </div>
              {['Draft', 'Returned'].includes(item.status) ? (
                <button type="button" className={btn} disabled={busy} onClick={() => onAction('assessment.submit', { id: item.id })}><Send className="h-4 w-4" /> Submit</button>
              ) : null}
            </div>
          </article>
        ))}
        {!domain.assessments.filter((item) => item.type === type).length ? <Empty text={`No ${type.toLowerCase()} assessments yet.`} /> : null}
      </div>
    </SectionShell>
  );

  const threeSixtyView = (
    <SectionShell title="360-Degree Appraisals" detail="Nominate raters, invite responses, and protect anonymity until the threshold is met.">
      <button
        type="button"
        className={btn}
        disabled={busy}
        onClick={() => onAction('rater.nominate', {
          cycleId: activeCycleId,
          employeeId: form.rEmployeeId || payload.actor.employeeId,
          employeeName: form.rEmployeeName || payload.actor.fullName,
          raterId: form.rRaterId || 'rater-1',
          raterName: form.rRaterName || 'Peer Reviewer',
          relationship: form.rRel || 'Peer',
          anonymous: true,
        })}
      >
        <Plus className="h-4 w-4" /> Nominate rater
      </button>
      <div className="space-y-3">
        {domain.raters.map((row) => (
          <article key={row.id} className={card}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-black text-[#0F172A]">{row.employeeName}</h3>
                <p className="text-sm font-semibold text-[#64748B]">{row.raterName} · {row.relationship} · {row.status}{row.anonymous ? ' · Anonymous' : ''}</p>
              </div>
              <div className="flex gap-2">
                {row.status === 'Nominated' ? <button type="button" className={btnGhost} disabled={busy} onClick={() => onAction('rater.invite', { id: row.id })}>Invite</button> : null}
                {['Invited', 'In Progress'].includes(row.status) ? <button type="button" className={btn} disabled={busy} onClick={() => onAction('rater.submit', { id: row.id, scores: domain.config.behaviourIndicators.map((ind) => ({ indicatorId: ind.id, rating: 3 })) })}>Submit response</button> : null}
              </div>
            </div>
          </article>
        ))}
        {!domain.raters.length ? <Empty text="No 360 nominations yet." /> : null}
      </div>
      <p className="text-xs font-semibold text-[#64748B]">Anonymity threshold: {domain.config.anonymityThreshold} responses</p>
    </SectionShell>
  );

  const calibrationView = (
    <SectionShell title="Calibration & Moderation" detail="Preserve original, proposed, and approved scores with mandatory justification.">
      <button
        type="button"
        className={btn}
        disabled={busy}
        onClick={() => onAction('calibration.propose', {
          cycleId: activeCycleId,
          employeeId: form.calEmployeeId || 'emp-1',
          employeeName: form.calEmployeeName || 'Employee',
          department: form.calDept || 'Operations',
          originalScore: Number(form.calOriginal || 78),
          proposedScore: Number(form.calProposed || 82),
          justification: form.calReason || 'Comparable peer evidence supports uplift.',
        })}
      >
        Propose adjustment
      </button>
      <div className="space-y-3">
        {domain.calibration.map((row) => (
          <article key={row.id} className={card}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-black text-[#0F172A]">{row.employeeName}</h3>
                <p className="text-sm font-semibold text-[#64748B]">Original {displayScore(row.originalScore)} ({row.originalBand}) → Proposed {row.proposedScore != null ? displayScore(row.proposedScore) : '—'} ({row.proposedBand || '—'})</p>
                <p className="mt-1 text-xs font-semibold text-[#64748B]">{row.justification}</p>
                <p className="mt-1 text-xs font-bold text-[#0052CC]">{row.status}</p>
              </div>
              {row.status === 'Proposed' ? (
                <div className="flex gap-2">
                  <button type="button" className={btn} disabled={busy} onClick={() => onAction('calibration.decide', { id: row.id, decision: 'Approved' })}>Approve</button>
                  <button type="button" className={btnGhost} disabled={busy} onClick={() => onAction('calibration.decide', { id: row.id, decision: 'Rejected', reason: 'Insufficient evidence' })}>Reject</button>
                </div>
              ) : null}
            </div>
          </article>
        ))}
        {!domain.calibration.length ? <Empty text="No calibration cases yet." /> : null}
      </div>
    </SectionShell>
  );

  const resultsView = (
    <SectionShell title="Performance Results" detail="Compute, approve, publish, and acknowledge final outcomes. History is versioned.">
      <div className={`${card} grid gap-3 md:grid-cols-3`}>
        <div><label className={label}>Employee ID</label><input className={input} value={form.resEmployeeId || ''} onChange={(e) => setField('resEmployeeId', e.target.value)} /></div>
        <div><label className={label}>Employee name</label><input className={input} value={form.resEmployeeName || ''} onChange={(e) => setField('resEmployeeName', e.target.value)} /></div>
        <div className="flex items-end"><button type="button" className={btn} disabled={busy} onClick={() => onAction('result.compute', { cycleId: activeCycleId, employeeId: form.resEmployeeId || payload.actor.employeeId, employeeName: form.resEmployeeName || payload.actor.fullName })}>Compute result</button></div>
      </div>
      <div className="space-y-3">
        {domain.results.map((row) => (
          <article key={row.id} className={card}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-black text-[#0F172A]">{row.employeeName}</h3>
                <p className="text-sm font-semibold text-[#64748B]">Final {displayScore(row.finalScore)} · {row.ratingBand} · v{row.version}</p>
                <p className="text-xs font-bold text-[#0052CC]">{row.status}{row.publishedAt ? ` · Published ${row.publishedAt.slice(0, 10)}` : ''}{row.acknowledgedAt ? ` · Ack ${row.acknowledgedAt.slice(0, 10)}` : ''}</p>
              </div>
              <div className="flex gap-2">
                {row.status === 'Approved' ? <button type="button" className={btn} disabled={busy} onClick={() => onAction('result.publish', { id: row.id })}>Publish</button> : null}
                {row.status === 'Published' ? <button type="button" className={btnGhost} disabled={busy} onClick={() => onAction('result.acknowledge', { id: row.id })}>Acknowledge</button> : null}
                {row.status === 'Published' ? <button type="button" className={btnGhost} disabled={busy} onClick={() => onAction('appeal.submit', { resultId: row.id, reason: 'Disputed rating fairness', requestedOutcome: 'Reassessment', disputedItems: ['Final score'] })}>Appeal</button> : null}
              </div>
            </div>
          </article>
        ))}
        {!domain.results.length ? <Empty text="No computed results yet." /> : null}
      </div>
    </SectionShell>
  );

  const appealsView = (
    <SectionShell title="Appeals & Grievances" detail="Time-bound dispute workflow with panel decision and versioned recalculation.">
      <div className="space-y-3">
        {domain.appeals.map((row) => (
          <article key={row.id} className={card}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-black text-[#0F172A]">{row.employeeName}</h3>
                <p className="text-sm font-semibold text-[#64748B]">{row.reason}</p>
                <p className="text-xs font-bold text-[#0052CC]">{row.status}</p>
              </div>
              {['Submitted', 'HR Review', 'Panel', 'Manager Responded'].includes(row.status) ? (
                <div className="flex gap-2">
                  <button type="button" className={btn} disabled={busy} onClick={() => onAction('appeal.decide', { id: row.id, decision: 'Amended', newScore: 80, panelDecision: 'Score amended after evidence review' })}>Amend</button>
                  <button type="button" className={btnGhost} disabled={busy} onClick={() => onAction('appeal.decide', { id: row.id, decision: 'Rejected', panelDecision: 'Original rating upheld' })}>Reject</button>
                </div>
              ) : null}
            </div>
          </article>
        ))}
        {!domain.appeals.length ? <Empty text="No appeals submitted." /> : null}
      </div>
    </SectionShell>
  );

  const pipView = (
    <SectionShell title="Performance Improvement Plans" detail="Structured improvement with HR validation before activation.">
      <button
        type="button"
        className={btn}
        disabled={busy}
        onClick={() => onAction('pip.upsert', {
          employeeId: form.pipEmployeeId || payload.actor.employeeId,
          employeeName: form.pipEmployeeName || 'Employee',
          reason: form.pipReason || 'Sustained underperformance against agreed OKRs',
          gaps: form.pipGaps || 'Delivery quality and timeliness',
          support: 'Weekly coaching and targeted training',
          objectives: [{ id: 'o1', title: 'Meet delivery SLA', target: '95%', weight: 100, dueDate: new Date().toISOString().slice(0, 10) }],
          startDate: new Date().toISOString().slice(0, 10),
          endDate: new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10),
        })}
      >
        <Plus className="h-4 w-4" /> Create PIP
      </button>
      <div className="space-y-3">
        {domain.pips.map((row) => (
          <article key={row.id} className={card}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-black text-[#0F172A]">{row.employeeName}</h3>
                <p className="text-sm font-semibold text-[#64748B]">{row.reason}</p>
                <p className="text-xs font-bold text-[#0052CC]">{row.status}</p>
              </div>
              {row.status === 'Pending HR' ? <button type="button" className={btn} disabled={busy} onClick={() => onAction('pip.activate', { id: row.id })}>Activate</button> : null}
            </div>
          </article>
        ))}
        {!domain.pips.length ? <Empty text="No PIP cases." /> : null}
      </div>
    </SectionShell>
  );

  const developmentView = (
    <SectionShell title="Development Plans" detail="Convert gaps and aspirations into tracked development actions.">
      <button
        type="button"
        className={btn}
        disabled={busy}
        onClick={() => onAction('development.upsert', {
          employeeId: payload.actor.employeeId,
          employeeName: payload.actor.fullName,
          need: form.devNeed || 'Leadership capability',
          actions: [{ id: 'a1', action: 'Complete leadership workshop', owner: payload.actor.fullName, dueDate: new Date().toISOString().slice(0, 10), status: 'Planned' }],
        })}
      >
        Add development plan
      </button>
      <div className="space-y-3">
        {domain.developmentPlans.map((row) => (
          <article key={row.id} className={card}>
            <h3 className="font-black text-[#0F172A]">{row.employeeName}</h3>
            <p className="text-sm font-semibold text-[#64748B]">{row.need} · {row.actions.length} actions · {row.status}</p>
          </article>
        ))}
        {!domain.developmentPlans.length ? <Empty text="No development plans." /> : null}
      </div>
    </SectionShell>
  );

  const recognitionView = (
    <SectionShell title="Recognition & Reward Recommendations" detail="Recommendations only — no automatic payroll changes.">
      <button
        type="button"
        className={btn}
        disabled={busy}
        onClick={() => onAction('recognition.upsert', {
          employeeId: form.recEmployeeId || payload.actor.employeeId,
          employeeName: form.recEmployeeName || payload.actor.fullName,
          type: form.recType || 'Recognition',
          justification: form.recWhy || 'Outstanding delivery this cycle',
        })}
      >
        Recommend
      </button>
      <div className="space-y-3">
        {domain.recognitions.map((row) => (
          <article key={row.id} className={card}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-black text-[#0F172A]">{row.employeeName}</h3>
                <p className="text-sm font-semibold text-[#64748B]">{row.type} · {row.justification}</p>
                <p className="text-xs font-bold text-[#0052CC]">{row.status}{row.downstreamRef ? ` · ${row.downstreamRef}` : ''}</p>
              </div>
              {/pending/i.test(row.status) ? <button type="button" className={btn} disabled={busy} onClick={() => onAction('recognition.advance', { id: row.id, status: 'Approved' })}>Approve</button> : null}
            </div>
          </article>
        ))}
        {!domain.recognitions.length ? <Empty text="No recommendations." /> : null}
      </div>
    </SectionShell>
  );

  const probationView = (
    <SectionShell title="Probation & Confirmation" detail="Monitor probation OKRs and decide Confirm / Extend / Do Not Confirm with human approval.">
      <div className="space-y-3">
        {domain.probation.map((row) => (
          <article key={row.id} className={card}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-black text-[#0F172A]">{row.employeeName}</h3>
                <p className="text-sm font-semibold text-[#64748B]">{row.department} · {row.startDate} → {row.endDate}</p>
                <p className="text-xs font-bold text-[#0052CC]">{row.status}{row.recommendation ? ` · Rec: ${row.recommendation}` : ''}{row.decision ? ` · Decision: ${row.decision}` : ''}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={btnGhost} disabled={busy} onClick={() => onAction('probation.recommend', { id: row.id, recommendation: 'Confirm' })}>Recommend Confirm</button>
                <button type="button" className={btnGhost} disabled={busy} onClick={() => onAction('probation.recommend', { id: row.id, recommendation: 'Extend' })}>Recommend Extend</button>
                <button type="button" className={btn} disabled={busy} onClick={() => onAction('probation.decide', { id: row.id, decision: row.recommendation || 'Confirm', reason: 'Policy review completed' })}>Final decision</button>
              </div>
            </div>
          </article>
        ))}
        {!domain.probation.length ? <Empty text="No probation records." /> : null}
      </div>
    </SectionShell>
  );

  const reportsView = (
    <SectionShell title="Reports & Analytics" detail="Live KPIs, calibration analytics, and scheduled delivery to authorized recipients.">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {[
          ['Goals agreed', String(domain.goals.filter((goal) => goal.status === 'Agreed').length)],
          ['Assessments submitted', String(domain.assessments.filter((item) => item.status === 'Submitted').length)],
          ['Results published', String(domain.results.filter((item) => item.status === 'Published').length)],
          ['Open appeals', String(domain.appeals.filter((item) => !['Closed', 'Rejected', 'Upheld', 'Amended'].includes(item.status)).length)],
          ['Active PIPs', String(domain.pips.filter((item) => /active|track|risk/i.test(item.status)).length)],
          ['Probation in progress', String(domain.probation.filter((item) => !['Confirmed', 'Closed', 'Not Confirmed'].includes(item.status)).length)],
          ['Pre-calibration avg', String(domain.analytics?.preCalibrationAvg ?? '—')],
          ['Post-calibration avg', String(domain.analytics?.postCalibrationAvg ?? '—')],
          ['Severity / leniency', `${domain.analytics?.severityIndex ?? 0} / ${domain.analytics?.leniencyIndex ?? 0}`],
        ].map(([labelText, value]) => (
          <div key={labelText} className={card}>
            <p className="text-xs font-bold uppercase text-[#64748B]">{labelText}</p>
            <p className="mt-2 text-3xl font-black text-[#0F172A]">{value}</p>
          </div>
        ))}
      </div>
      <div className={`${card} mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto]`}>
        <div>
          <label className={label}>Report name</label>
          <input className={input} value={form.rptName || ''} onChange={(e) => setField('rptName', e.target.value)} placeholder="Weekly completion digest" />
        </div>
        <div>
          <label className={label}>Type</label>
          <select className={input} value={form.rptType || 'completion'} onChange={(e) => setField('rptType', e.target.value)}>
            <option value="completion">Completion</option>
            <option value="okr-progress">OKR progress</option>
            <option value="rating-distribution">Rating distribution</option>
            <option value="calibration-delta">Calibration delta</option>
            <option value="pip-tracker">PIP tracker</option>
            <option value="probation-outcomes">Probation outcomes</option>
          </select>
        </div>
        <div className="flex items-end gap-2">
          <button type="button" className={btn} disabled={busy} onClick={() => onAction('report.schedule', { name: form.rptName, reportType: form.rptType || 'completion', cadence: 'Weekly', recipients: [payload.actor.employeeCode || payload.actor.fullName] })}>Schedule</button>
          <button type="button" className={btnGhost} disabled={busy} onClick={() => onAction('analytics.refresh', {})}>Refresh analytics</button>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {(domain.scheduledReports || []).map((row) => (
          <article key={row.id} className={`${card} flex flex-wrap items-center justify-between gap-3`}>
            <div>
              <h3 className="font-black text-[#0F172A]">{row.name}</h3>
              <p className="text-sm font-semibold text-[#64748B]">{row.reportType} · {row.cadence} · next {row.nextRunAt.slice(0, 10)}</p>
            </div>
            <button type="button" className={btnGhost} disabled={busy} onClick={() => onAction('report.run', { id: row.id })}>Run now</button>
          </article>
        ))}
      </div>
    </SectionShell>
  );

  const auditView = (
    <SectionShell title="Audit & Administration" detail="Append-only history of material performance events.">
      <div className="space-y-2">
        {domain.audit.slice(0, 50).map((event) => (
          <div key={event.id} className={`${card} grid gap-2 md:grid-cols-[160px_1fr]`}>
            <p className="text-xs font-bold text-[#64748B]">{event.at.replace('T', ' ').slice(0, 19)}</p>
            <div>
              <p className="text-sm font-black text-[#0F172A]">{event.action}</p>
              <p className="text-xs font-semibold text-[#64748B]">{event.actor} · {event.entityType} · {event.entityId}</p>
            </div>
          </div>
        ))}
        {!domain.audit.length ? <Empty text="No audit events." /> : null}
      </div>
    </SectionShell>
  );

  const configView = (
    <SectionShell title="Templates & Configuration" detail="Effective-dated section weights, rating bands, and anonymity controls.">
      <div className={`${card} grid gap-3 md:grid-cols-4`}>
        <div><label className={label}>Company %</label><input className={input} value={form.cfgCo || String(domain.config.sectionWeights.companyObjectives)} onChange={(e) => setField('cfgCo', e.target.value)} /></div>
        <div><label className={label}>OKR %</label><input className={input} value={form.cfgOkr || String(domain.config.sectionWeights.individualOkrs)} onChange={(e) => setField('cfgOkr', e.target.value)} /></div>
        <div><label className={label}>Behaviour %</label><input className={input} value={form.cfgBeh || String(domain.config.sectionWeights.behavioural)} onChange={(e) => setField('cfgBeh', e.target.value)} /></div>
        <div className="flex items-end">
          <button
            type="button"
            className={btn}
            disabled={busy}
            onClick={() => onAction('config.update', {
              sectionWeights: {
                companyObjectives: Number(form.cfgCo || domain.config.sectionWeights.companyObjectives),
                individualOkrs: Number(form.cfgOkr || domain.config.sectionWeights.individualOkrs),
                behavioural: Number(form.cfgBeh || domain.config.sectionWeights.behavioural),
              },
            })}
          >
            Save weights
          </button>
        </div>
      </div>
      <div className={card}>
        <h3 className="font-black text-[#0F172A]">Rating bands</h3>
        <ul className="mt-2 space-y-1 text-sm font-semibold text-[#64748B]">
          {domain.config.ratingBands.map((band) => (
            <li key={band.label}>{band.min}–{band.max}: {band.label}</li>
          ))}
        </ul>
      </div>
    </SectionShell>
  );

  const tasksView = (
    <SectionShell title="Workflow Task Centre" detail="Assigned performance actions with due dates and escalation states.">
      <div className="space-y-2">
        {domain.tasks.slice(0, 40).map((task) => (
          <article key={task.id} className={card}>
            <div className="flex items-start gap-3">
              <ClipboardList className="mt-0.5 h-4 w-4 text-[#0052CC]" />
              <div>
                <h3 className="font-black text-[#0F172A]">{task.title}</h3>
                <p className="text-sm font-semibold text-[#64748B]">{task.assigneeName} · due {task.dueDate} · {task.status}</p>
              </div>
            </div>
          </article>
        ))}
        {!domain.tasks.length ? <Empty text="No workflow tasks." /> : null}
      </div>
    </SectionShell>
  );

  const goalCascadingView = (
    <GoalCascadingView payload={payload} onAction={onAction} busy={busy} />
  );

  const midYearReviewsView = (
    <MidYearReviewsView payload={payload} onAction={onAction} busy={busy} />
  );

  const selfAppraisalView = (
    <SelfAppraisalView payload={payload} onAction={onAction} busy={busy} />
  );

  const managerAssessmentsView = (
    <ManagerAssessmentsView payload={payload} onAction={onAction} busy={busy} />
  );

  const content = useMemo(() => {
    if (route.includes('performance-cycles') || route === 'planning') return cyclesView;
    if (route.includes('corporate-goals') || route.includes('company-objectives')) return companyObjectivesView;
    if (route.includes('department-goals')) return goalCascadingView;
    if (route.includes('employee-goals') || route.includes('goal-library') || route.includes('kpi-setup')) return goalsView;
    if (route.includes('monthly-check-ins') || route.includes('continuous-feedback') || route.includes('coaching') || route.includes('development-conversations')) return checkInsView;
    if (route.includes('self-appraisal')) return selfAppraisalView;
    if (route.includes('supervisor-review')) return managerAssessmentsView;
    if (route.includes('mid-year')) return midYearReviewsView;
    if (route.includes('behaviour') || route.includes('competency')) return assessmentView('Behavioural');
    if (route.includes('360') || route.includes('project-manager-review') || route.includes('matrix')) return threeSixtyView;
    if (route.includes('calibration') || route.includes('talent-review')) return calibrationView;
    if (route.includes('final-evaluation') || route.includes('results') || route.includes('scorecard')) return resultsView;
    if (route.includes('appeal')) return appealsView;
    if (route.includes('pip')) return pipView;
    if (route.includes('development-plans') || route.includes('training-recommendations') || route.includes('career-development')) return developmentView;
    if (route.includes('recognition') || route.includes('rewards') || route.includes('awards') || route.includes('promotion-recommendations')) return recognitionView;
    if (route.includes('probation') || route.includes('confirmation')) return probationView;
    if (route.includes('reports') || route.includes('analytics') || route.includes('export') || route.includes('ai-')) return reportsView;
    if (route.includes('audit')) return auditView;
    if (route.includes('settings') || route.includes('rating-configuration') || route.includes('templates') || route.includes('notification-rules') || route.includes('approval-workflow') || route.includes('role-permissions')) return configView;
    if (route.includes('task')) return tasksView;
    return (
      <SectionShell title="Performance Workspace" detail="Select a capability from the Performance Management sidebar. Live domain data is connected for cycles, goals, reviews, governance, outcomes, and probation.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            ['Cycles', domain.cycles.length],
            ['Goals', domain.goals.length],
            ['Assessments', domain.assessments.length],
            ['Results', domain.results.length],
            ['Appeals', domain.appeals.length],
            ['PIPs', domain.pips.length],
            ['Probation', domain.probation.length],
            ['Open tasks', domain.tasks.filter((task) => !['Completed', 'Cancelled'].includes(task.status)).length],
          ].map(([labelText, value]) => (
            <div key={String(labelText)} className={card}>
              <p className="text-xs font-bold uppercase text-[#64748B]">{labelText}</p>
              <p className="mt-2 text-3xl font-black text-[#0F172A]">{value}</p>
            </div>
          ))}
        </div>
      </SectionShell>
    );
  }, [route, domain, form, busy, payload.actor]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wide text-[#64748B]">
          Active cycle: {domain.cycles.find((cycle) => cycle.id === activeCycleId)?.name || 'None'} · Actor: {payload.actor.fullName}
        </p>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#64748B]">
          <RefreshCcw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
          {busy ? 'Saving…' : 'Ready'}
        </span>
      </div>
      {content}
    </div>
  );
}
