'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Save, Send, UserCheck } from 'lucide-react';
import { displayScore, sectionScore } from '@/lib/performance-calculation';
import type {
  EssAssessmentDetail,
  EssAssessmentItemDto,
  EssPerformanceWorkspace,
  EssTeamReviewQueueRow,
} from '@/lib/ess-performance-workspace';
import { EssCard, EssEmptyState } from './ess-portal-ui';
import { EssManagerCoachingPanel } from './ess-performance-checkins';
import { EssPerformanceGoalForm } from './ess-performance-goal-form';
import { EssPerformanceRatingScale, clampPerformanceRating } from './ess-performance-rating-scale';
import {
  EssCalibrationVisibility,
  EssDevelopmentWorkspace,
  EssPipWorkspace,
  EssProbationWorkspace,
} from './ess-performance-talent';
import {
  EssAssessmentHistoryPanel,
  EssDelegationWorkspace,
  useEssUnsavedGuard,
} from './ess-performance-controls';

type EssPerformanceTeamViewProps = {
  workspace: EssPerformanceWorkspace;
  saving?: boolean;
  onAction: (action: string, payload?: Record<string, unknown>) => Promise<void>;
};

type DraftItem = EssAssessmentItemDto;

const statusTone = (status: string) => {
  const value = status.toLowerCase();
  if (/complete|agreed|active|approved|acknowledged|submitted|confirmed/i.test(value)) return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  if (/draft|pending|assigned|discussion|returned|progress|ready|await/i.test(value)) return 'bg-amber-50 text-amber-900 border-amber-200';
  if (/reject|not confirm|risk|not started/i.test(value)) return 'bg-slate-50 text-slate-700 border-slate-200';
  return 'bg-slate-50 text-slate-700 border-slate-200';
};

const scorePreview = (items: DraftItem[]) => {
  const rated = items.filter((item) => item.managerRating != null);
  if (!rated.length) return null;
  return displayScore(sectionScore(rated.map((item) => ({
    weight: item.weight,
    achievement: item.achievement != null ? item.achievement : Number(item.managerRating || 0) * 20,
  }))));
};

export function EssPerformanceTeamView({ workspace, saving, onAction }: EssPerformanceTeamViewProps) {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [overallComments, setOverallComments] = useState('');
  const [strengths, setStrengths] = useState('');
  const [improvements, setImprovements] = useState('');
  const [clientError, setClientError] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [baseline, setBaseline] = useState('');

  const queue = workspace.team.reviewQueue;
  const selectedRow = queue.find((row) => row.employeeId === selectedEmployeeId) || null;
  const managerDetail = useMemo(
    () => workspace.team.assessmentDetails.find((row) => row.id === assessmentId && row.type === 'Manager')
      || workspace.team.assessmentDetails.find((row) => row.employeeId === selectedEmployeeId && row.type === 'Manager')
      || null,
    [workspace.team.assessmentDetails, assessmentId, selectedEmployeeId],
  );
  const selfDetail = useMemo(
    () => workspace.team.assessmentDetails.find((row) =>
      row.employeeId === selectedEmployeeId && row.type === 'Self',
    ) || null,
    [workspace.team.assessmentDetails, selectedEmployeeId],
  );
  const locked = Boolean(managerDetail && /submitted|completed|approved/i.test(managerDetail.status));
  const checkIns = workspace.team.checkIns.filter((item) => item.employeeId === selectedEmployeeId).slice(0, 5);
  const preview = scorePreview(items);
  const draftFingerprint = JSON.stringify({ items, overallComments, strengths, improvements, assessmentId });
  const dirty = Boolean(selectedEmployeeId && items.length && !locked && baseline && draftFingerprint !== baseline);
  const { confirmDiscard } = useEssUnsavedGuard(dirty);

  useEffect(() => {
    if (!selectedEmployeeId) {
      setAssessmentId(null);
      setItems([]);
      setOverallComments('');
      setStrengths('');
      setImprovements('');
      setBaseline('');
      return;
    }
    const detail = workspace.team.assessmentDetails.find((row) =>
      row.employeeId === selectedEmployeeId && row.type === 'Manager',
    );
    if (detail) {
      setAssessmentId(detail.id);
      const nextItems = detail.items.map((item) => ({ ...item }));
      setItems(nextItems);
      setOverallComments(detail.overallComments || '');
      setStrengths(detail.strengths || '');
      setImprovements(detail.improvements || '');
      setBaseline(JSON.stringify({
        items: nextItems,
        overallComments: detail.overallComments || '',
        strengths: detail.strengths || '',
        improvements: detail.improvements || '',
        assessmentId: detail.id,
      }));
    } else {
      setAssessmentId(null);
      setItems([]);
      setOverallComments('');
      setStrengths('');
      setImprovements('');
      setBaseline('');
    }
  }, [selectedEmployeeId, workspace.team.assessmentDetails]);

  const updateItem = (itemId: string, patch: Partial<DraftItem>) => {
    setItems((current) => current.map((item) => {
      if (item.itemId !== itemId) return item;
      const next = { ...item, ...patch };
      if (patch.managerRating != null) {
        next.achievement = Number(patch.managerRating) * 20;
      }
      return next;
    }));
  };

  const validateDraft = () => {
    for (const item of items) {
      const rating = clampPerformanceRating(item.managerRating);
      if (rating == null) return `Rate every item before submitting ("${item.title}").`;
      if (item.selfRating != null && Math.abs(item.selfRating - rating) >= 2 && !String(item.varianceJustification || '').trim()) {
        return `Add variance justification for "${item.title}" (self ${item.selfRating} vs manager ${rating}).`;
      }
    }
    const extreme = items.some((item) => item.managerRating === 1 || item.managerRating === 5);
    if (extreme && !overallComments.trim()) return 'Overall comments are required when any rating is 1 or 5.';
    return null;
  };

  const startOrOpen = async (row: EssTeamReviewQueueRow) => {
    if (row.employeeId !== selectedEmployeeId && !confirmDiscard()) return;
    setClientError('');
    setSelectedEmployeeId(row.employeeId);
    if (row.managerAssessmentId) {
      setAssessmentId(row.managerAssessmentId);
      return;
    }
    const report = workspace.team.directReports.find((item) => item.employeeId === row.employeeId);
    if (!report) return;
    await onAction('assessment.save', {
      cycleId: workspace.activeCycle?.id,
      type: 'Manager',
      employeeId: report.employeeId,
      employeeName: report.fullName,
      status: 'Draft',
    });
  };

  const saveDraft = async () => {
    if (!selectedRow) return;
    setClientError('');
    const report = workspace.team.directReports.find((item) => item.employeeId === selectedEmployeeId);
    if (!report) return;
    const payloadItems = items.map((item) => ({
      itemId: item.itemId,
      itemType: item.itemType,
      title: item.title,
      weight: item.weight,
      selfRating: item.selfRating,
      selfNarrative: item.selfNarrative,
      managerRating: item.managerRating,
      managerNarrative: item.managerNarrative,
      achievement: item.achievement,
      varianceJustification: item.varianceJustification,
      evidence: item.evidence,
    }));
    await onAction('assessment.save', {
      id: assessmentId || undefined,
      cycleId: workspace.activeCycle?.id,
      type: 'Manager',
      employeeId: report.employeeId,
      employeeName: report.fullName,
      status: managerDetail?.status === 'Returned' ? 'Draft' : 'Draft',
      items: payloadItems,
      overallComments,
      strengths,
      improvements,
    });
    setBaseline(JSON.stringify({
      items,
      overallComments,
      strengths,
      improvements,
      assessmentId,
    }));
  };

  const submitReview = async () => {
    const error = validateDraft();
    if (error) {
      setClientError(error);
      return;
    }
    if (!window.confirm('Submit this manager assessment? It will lock for calibration and cannot be edited without HR return.')) {
      return;
    }
    await saveDraft();
    await onAction('assessment.submit', {
      id: assessmentId || undefined,
      type: 'Manager',
      employeeId: selectedEmployeeId,
    });
  };

  const returnSelfAppraisal = async () => {
    if (!selfDetail?.id) return;
    if (!returnReason.trim()) {
      setClientError('Enter a return reason before sending the self-appraisal back.');
      return;
    }
    if (!window.confirm('Return this self-appraisal to the employee for revision?')) return;
    setClientError('');
    await onAction('assessment.return', { id: selfDetail.id, reason: returnReason.trim() });
    setReturnReason('');
  };

  const reopenManagerAssessment = async () => {
    if (!managerDetail?.id || managerDetail.status !== 'Returned') return;
    if (!window.confirm('Reopen this returned manager assessment for editing?')) return;
    await onAction('assessment.reopen', { id: managerDetail.id, reason: 'Manager reopened after return' });
  };

  const okrItems = items.filter((item) => item.itemType === 'okr');
  const behaviourItems = items.filter((item) => item.itemType === 'behaviour');
  const reportMeta = workspace.team.directReports.find((row) => row.employeeId === selectedEmployeeId);

  return (
    <div className="space-y-4">
      {workspace.team.actingAsDelegate ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900" role="status">
          Acting as delegated manager — reviews include colleagues covered by an active delegation.
        </p>
      ) : null}

      <EssCard className="overflow-hidden">
        <div className="border-b border-[#E2E8F0] bg-[#F8FAFC] px-5 py-3">
          <h3 className="text-sm font-bold text-[#0F172A]">Team review queue</h3>
          <p className="mt-1 text-xs text-[#64748B]">
            {workspace.metrics.completedManagerReviews} of {workspace.metrics.teamSize} completed
            {' · '}
            {workspace.metrics.readyForManagerReview} outstanding
            {workspace.activeCycle?.endDate ? ` · due ${workspace.activeCycle.endDate}` : ''}
            {dirty ? ' · unsaved changes in open review' : ''}
          </p>
        </div>
        {queue.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm" aria-label="Team performance review queue">
              <caption className="sr-only">Direct reports and delegated coverage awaiting manager review</caption>
              <thead className="bg-white text-[11px] font-bold uppercase tracking-wide text-[#64748B]">
                <tr>
                  <th scope="col" className="px-4 py-3">Employee</th>
                  <th scope="col" className="px-4 py-3">Dept / position</th>
                  <th scope="col" className="px-4 py-3">Self-appraisal</th>
                  <th scope="col" className="px-4 py-3">Manager review</th>
                  <th scope="col" className="px-4 py-3">Due</th>
                  <th scope="col" className="px-4 py-3">Score</th>
                  <th scope="col" className="px-4 py-3">Outstanding</th>
                  <th scope="col" className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {queue.map((row) => {
                  const meta = workspace.team.directReports.find((item) => item.employeeId === row.employeeId);
                  return (
                  <tr key={row.employeeId} className={selectedEmployeeId === row.employeeId ? 'bg-[#EFF6FF]/40' : 'bg-white'}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-[#0F172A]">{row.fullName}</p>
                      <p className="text-xs text-[#64748B]">{row.employeeCode} · {row.goalCount} goals</p>
                      {meta?.viaDelegation ? (
                        <p className="mt-1 text-[11px] font-semibold text-amber-800">Delegated from {meta.delegatedFrom}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#475569]">
                      <p>{row.department}</p>
                      <p>{row.jobTitle}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${statusTone(row.selfStatus)}`}>{row.selfStatus}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${statusTone(row.managerStatus)}`}>{row.managerStatus}</span>
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-[#475569]">{row.dueDate || '—'}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-[#475569]">{row.score != null ? row.score : '—'}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-[#475569]">{row.outstanding}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void startOrOpen(row)}
                        aria-label={`${row.managerAssessmentId ? 'Open review' : 'Start assessment'} for ${row.fullName}`}
                        className="inline-flex min-h-11 items-center rounded-lg bg-[#2563EB] px-3 text-xs font-bold text-white hover:bg-[#1D4ED8] disabled:opacity-60"
                      >
                        {row.managerAssessmentId ? 'Open review' : 'Start assessment'}
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6">
            <EssEmptyState icon={UserCheck} title="No direct reports" description="Team reviews appear when employees report to you in the directory." />
          </div>
        )}
      </EssCard>

      {selectedRow ? (
        <EssCard className="p-5">
          <div className="flex flex-col gap-2 border-b border-[#E2E8F0] pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#2563EB]">Selected employee review</p>
              <h3 className="mt-1 text-lg font-black text-[#0F172A]">{selectedRow.fullName}</h3>
              <p className="text-xs text-[#64748B]">
                {selectedRow.department} · {selectedRow.jobTitle} · {selectedRow.reviewStage}
                {managerDetail ? ` · ${managerDetail.status} · v${managerDetail.version}` : ' · No manager draft yet'}
                {reportMeta?.viaDelegation ? ` · delegated from ${reportMeta.delegatedFrom}` : ''}
              </p>
              {managerDetail?.returnedReason ? (
                <p className="mt-2 text-xs font-semibold text-amber-800" role="status">
                  Returned by {managerDetail.returnedBy || 'HR'}: {managerDetail.returnedReason}
                </p>
              ) : null}
            </div>
            <div className="rounded-xl border border-[#DBEAFE] bg-[#EFF6FF] px-4 py-2 text-right">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#1D4ED8]">Weighted preview</p>
              <p className="text-xl font-black text-[#0F172A]">{preview != null ? preview : '—'}</p>
            </div>
          </div>

          {!items.length ? (
            <div className="py-8">
              <EssEmptyState
                icon={UserCheck}
                title="No assessment items loaded"
                description="Click Start assessment on the queue row to create a draft from goals and behavioural indicators."
              />
              <button
                type="button"
                disabled={saving}
                onClick={() => void startOrOpen(selectedRow)}
                className="mx-auto mt-4 flex min-h-11 items-center rounded-lg bg-[#2563EB] px-4 text-sm font-bold text-white hover:bg-[#1D4ED8] disabled:opacity-60"
              >
                Start assessment
              </button>
            </div>
          ) : (
            <div className="mt-5 space-y-6">
              {okrItems.length ? (
                <section className="space-y-4">
                  <h4 className="text-sm font-bold text-[#0F172A]">Objectives & KPIs</h4>
                  {okrItems.map((item) => (
                    <AssessmentItemEditor
                      key={item.itemId}
                      item={item}
                      scale={workspace.ratingScale}
                      locked={locked}
                      disabled={saving}
                      onChange={(patch) => updateItem(item.itemId, patch)}
                    />
                  ))}
                </section>
              ) : null}

              {behaviourItems.length ? (
                <section className="space-y-4">
                  <h4 className="text-sm font-bold text-[#0F172A]">Behavioural / competency assessment</h4>
                  {behaviourItems.map((item) => (
                    <AssessmentItemEditor
                      key={item.itemId}
                      item={item}
                      scale={workspace.ratingScale}
                      locked={locked}
                      disabled={saving}
                      onChange={(patch) => updateItem(item.itemId, patch)}
                    />
                  ))}
                </section>
              ) : null}

              {checkIns.length || selectedRow ? (
                <section>
                  <h4 className="text-sm font-bold text-[#0F172A]">Check-ins & coaching</h4>
                  <div className="mt-2">
                    <EssManagerCoachingPanel checkIns={checkIns} saving={saving} onAction={onAction} />
                  </div>
                </section>
              ) : null}

              {selfDetail ? (
                <section className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                  <p className="text-xs font-medium text-[#64748B]">
                    Self-appraisal status: {selfDetail.status}
                    {selfDetail.previewScore != null ? ` · self score preview ${selfDetail.previewScore}` : ''}
                    {selfDetail.version ? ` · v${selfDetail.version}` : ''}
                  </p>
                  {selfDetail.returnedReason ? (
                    <p className="mt-1 text-xs font-semibold text-amber-800">Previously returned: {selfDetail.returnedReason}</p>
                  ) : null}
                  {selfDetail.status === 'Submitted' ? (
                    <div className="mt-3 space-y-2">
                      <label htmlFor="ess-return-reason" className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Return reason</label>
                      <textarea
                        id="ess-return-reason"
                        value={returnReason}
                        onChange={(e) => setReturnReason(e.target.value)}
                        rows={2}
                        className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
                        placeholder="What should the employee revise?"
                      />
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void returnSelfAppraisal()}
                        className="inline-flex min-h-11 items-center rounded-lg border border-amber-200 bg-amber-50 px-3 text-xs font-bold text-amber-900 disabled:opacity-60"
                      >
                        Return self-appraisal
                      </button>
                    </div>
                  ) : null}
                </section>
              ) : null}

              <section className="grid gap-3 md:grid-cols-1">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Overall comments / rating justification</label>
                  <textarea
                    value={overallComments}
                    disabled={locked || saving}
                    onChange={(e) => setOverallComments(e.target.value)}
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm disabled:bg-[#F8FAFC]"
                    placeholder="Summarise overall performance and justify the rating"
                  />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Strengths</label>
                    <textarea
                      value={strengths}
                      disabled={locked || saving}
                      onChange={(e) => setStrengths(e.target.value)}
                      rows={3}
                      className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm disabled:bg-[#F8FAFC]"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Performance gaps / improvements</label>
                    <textarea
                      value={improvements}
                      disabled={locked || saving}
                      onChange={(e) => setImprovements(e.target.value)}
                      rows={3}
                      className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm disabled:bg-[#F8FAFC]"
                    />
                  </div>
                </div>
              </section>

              {clientError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700" role="alert">{clientError}</div>
              ) : null}

              {!locked ? (
                <div className="flex flex-wrap gap-2">
                  {managerDetail?.status === 'Returned' ? (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void reopenManagerAssessment()}
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 text-sm font-bold text-amber-900 disabled:opacity-60"
                    >
                      Reopen returned assessment
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void saveDraft()}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 text-sm font-bold text-[#0F172A] hover:bg-[#F8FAFC] disabled:opacity-60"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save draft
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void submitReview()}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#2563EB] px-4 text-sm font-bold text-white hover:bg-[#1D4ED8] disabled:opacity-60"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Submit review
                  </button>
                </div>
              ) : (
                <p className="text-sm font-semibold text-emerald-700">Assessment submitted and locked for calibration.</p>
              )}
            </div>
          )}
        </EssCard>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <EssAssessmentHistoryPanel detail={managerDetail} />
        <EssDelegationWorkspace workspace={workspace} saving={saving} onAction={onAction} />
      </div>

      <div className="space-y-4">
        <EssPerformanceGoalForm
          workspace={workspace}
          selectedEmployeeId={selectedEmployeeId}
          onSelectEmployee={(employeeId) => {
            if (employeeId === selectedEmployeeId) return;
            if (!confirmDiscard()) return;
            setSelectedEmployeeId(employeeId);
          }}
          saving={saving}
          onAction={onAction}
        />
        <EssCalibrationVisibility title="Team calibration status" rows={workspace.team.calibration} />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <EssProbationWorkspace rows={workspace.team.probation} saving={saving} onAction={onAction} />
          <EssPipWorkspace workspace={workspace} saving={saving} onAction={onAction} />
        </div>
        <EssDevelopmentWorkspace workspace={workspace} mode="team" saving={saving} onAction={onAction} />
      </div>
    </div>
  );
}

function AssessmentItemEditor({
  item,
  scale,
  locked,
  disabled,
  onChange,
}: {
  item: DraftItem;
  scale: EssPerformanceWorkspace['ratingScale'];
  locked: boolean;
  disabled?: boolean;
  onChange: (patch: Partial<DraftItem>) => void;
}) {
  const needsVariance = item.selfRating != null
    && item.managerRating != null
    && Math.abs(item.selfRating - item.managerRating) >= 2;

  return (
    <article className="rounded-2xl border border-[#E2E8F0] bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-[#0F172A]">{item.title}</p>
          <p className="mt-1 text-xs text-[#64748B]">
            {item.itemType.toUpperCase()} · weight {item.weight}%
            {item.goalProgress != null ? ` · progress ${item.goalProgress}%` : ''}
            {item.goalDueDate ? ` · due ${item.goalDueDate}` : ''}
          </p>
        </div>
        {item.managerRating != null ? (
          <span className="rounded-full border border-[#DBEAFE] bg-[#EFF6FF] px-2.5 py-0.5 text-[11px] font-bold text-[#1D4ED8]">
            Achievement {item.achievement ?? item.managerRating * 20}%
          </span>
        ) : null}
      </div>

      {item.keyResults?.length ? (
        <ul className="mt-3 space-y-1 text-xs text-[#64748B]">
          {item.keyResults.map((kr) => (
            <li key={`${item.itemId}-${kr.title}`}>
              KR: {kr.title} · baseline {kr.baseline} → target {kr.target}{kr.actual != null ? ` · actual ${kr.actual}` : ''} {kr.unit}
            </li>
          ))}
        </ul>
      ) : null}

      {(item.selfRating != null || item.selfNarrative) ? (
        <div className="mt-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-xs">
          <p className="font-bold text-[#475569]">Employee self-assessment</p>
          <p className="mt-1 text-[#0F172A]">Rating: {item.selfRating ?? '—'}{item.selfNarrative ? ` · ${item.selfNarrative}` : ''}</p>
        </div>
      ) : null}

      <div className="mt-4">
        <EssPerformanceRatingScale
          name={`rating-${item.itemId}`}
          value={item.managerRating}
          options={scale}
          disabled={locked || disabled}
          required
          legend="Manager rating"
          onChange={(value) => onChange({ managerRating: value, achievement: value * 20 })}
        />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Manager comments</label>
          <textarea
            value={item.managerNarrative || ''}
            disabled={locked || disabled}
            onChange={(e) => onChange({ managerNarrative: e.target.value })}
            rows={3}
            className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm disabled:bg-[#F8FAFC]"
          />
        </div>
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Evidence</label>
          <textarea
            value={item.evidence || ''}
            disabled={locked || disabled}
            onChange={(e) => onChange({ evidence: e.target.value })}
            rows={3}
            className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm disabled:bg-[#F8FAFC]"
            placeholder="Reference deliverables, dates, or attachments"
          />
        </div>
      </div>

      {needsVariance ? (
        <div className="mt-3">
          <label className="text-[11px] font-bold uppercase tracking-wide text-amber-800">Variance justification (required)</label>
          <textarea
            value={item.varianceJustification || ''}
            disabled={locked || disabled}
            onChange={(e) => onChange({ varianceJustification: e.target.value })}
            rows={2}
            className="mt-1 w-full rounded-lg border border-amber-200 bg-amber-50/40 px-3 py-2 text-sm disabled:bg-[#F8FAFC]"
          />
        </div>
      ) : null}
    </article>
  );
}
