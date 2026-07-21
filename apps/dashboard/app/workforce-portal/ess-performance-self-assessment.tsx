'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Save, Send } from 'lucide-react';
import { displayScore, sectionScore } from '@/lib/performance-calculation';
import type {
  EssAssessmentDetail,
  EssAssessmentItemDto,
  EssPerformanceWorkspace,
} from '@/lib/ess-performance-workspace';
import { EssCard, EssEmptyState } from './ess-portal-ui';
import { EssAssessmentHistoryPanel, useEssUnsavedGuard } from './ess-performance-controls';
import { EssPerformanceRatingScale, clampPerformanceRating } from './ess-performance-rating-scale';

type AssessmentType = 'Self' | 'Mid-Year';

type EssSelfAssessmentEditorProps = {
  workspace: EssPerformanceWorkspace;
  assessmentType: AssessmentType;
  saving?: boolean;
  onAction: (action: string, payload?: Record<string, unknown>) => Promise<void>;
};

type DraftItem = EssAssessmentItemDto;

const selfScorePreview = (items: DraftItem[]) => {
  const rated = items.filter((item) => item.selfRating != null);
  if (!rated.length) return null;
  return displayScore(sectionScore(rated.map((item) => ({
    weight: item.weight,
    achievement: Number(item.selfRating || 0) * 20,
  }))));
};

export function EssSelfAssessmentEditor({
  workspace,
  assessmentType,
  saving,
  onAction,
}: EssSelfAssessmentEditorProps) {
  const detail = useMemo(
    () => workspace.self.assessmentDetails.find((row) => row.type === assessmentType) || null,
    [workspace.self.assessmentDetails, assessmentType],
  );
  const review = workspace.self.reviews.find((row) => row.type === assessmentType) || null;

  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [overallComments, setOverallComments] = useState('');
  const [strengths, setStrengths] = useState('');
  const [improvements, setImprovements] = useState('');
  const [clientError, setClientError] = useState('');
  const [baseline, setBaseline] = useState('');

  const locked = Boolean(detail && /submitted|completed|approved/i.test(detail.status));
  const preview = selfScorePreview(items);
  const draftFingerprint = JSON.stringify({ items, overallComments, strengths, improvements, assessmentId });
  const dirty = Boolean(items.length && !locked && baseline && draftFingerprint !== baseline);
  useEssUnsavedGuard(dirty);

  useEffect(() => {
    if (!detail) {
      setAssessmentId(null);
      setItems([]);
      setOverallComments('');
      setStrengths('');
      setImprovements('');
      setBaseline('');
      return;
    }
    const nextItems = detail.items.map((item) => ({ ...item }));
    setAssessmentId(detail.id);
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
  }, [detail]);

  const updateItem = (itemId: string, patch: Partial<DraftItem>) => {
    setItems((current) => current.map((item) => (item.itemId === itemId ? { ...item, ...patch } : item)));
  };

  const validateDraft = () => {
    for (const item of items) {
      const rating = clampPerformanceRating(item.selfRating);
      if (rating == null) return `Rate every item before submitting ("${item.title}").`;
      if (!String(item.selfNarrative || '').trim()) return `Add a narrative for "${item.title}".`;
    }
    if (!overallComments.trim()) return 'Overall comments are required before submitting.';
    return null;
  };

  const startDraft = async () => {
    setClientError('');
    await onAction('assessment.save', {
      cycleId: workspace.activeCycle?.id,
      type: assessmentType,
      status: 'Draft',
    });
  };

  const saveDraft = async () => {
    setClientError('');
    if (!items.length && !assessmentId) {
      await startDraft();
      return;
    }
    await onAction('assessment.save', {
      id: assessmentId || undefined,
      cycleId: workspace.activeCycle?.id,
      type: assessmentType,
      status: detail?.status === 'Returned' ? 'Draft' : 'Draft',
      items: items.map((item) => ({
        itemId: item.itemId,
        itemType: item.itemType,
        title: item.title,
        weight: item.weight,
        selfRating: item.selfRating,
        selfNarrative: item.selfNarrative,
        managerRating: item.managerRating,
        managerNarrative: item.managerNarrative,
        achievement: item.selfRating != null ? Number(item.selfRating) * 20 : item.achievement,
        varianceJustification: item.varianceJustification,
        evidence: item.evidence,
      })),
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

  const submitAssessment = async () => {
    const error = validateDraft();
    if (error) {
      setClientError(error);
      return;
    }
    if (!window.confirm(`Submit this ${assessmentType === 'Mid-Year' ? 'mid-year' : 'self'} assessment? Your manager will be able to review it.`)) {
      return;
    }
    await saveDraft();
    await onAction('assessment.submit', {
      id: assessmentId || undefined,
      type: assessmentType,
    });
  };

  const reopenAssessment = async () => {
    if (!detail?.id || detail.status !== 'Returned') return;
    if (!window.confirm('Reopen this returned assessment for editing?')) return;
    await onAction('assessment.reopen', { id: detail.id, reason: 'Employee reopened after return' });
  };

  const title = assessmentType === 'Mid-Year' ? 'Mid-year self-review' : 'Self-appraisal workspace';
  const okrItems = items.filter((item) => item.itemType === 'okr');
  const behaviourItems = items.filter((item) => item.itemType === 'behaviour');

  if (!workspace.activeCycle) {
    return <EssEmptyState title="No active cycle" description="Self-assessments open when HR publishes a performance cycle." />;
  }

  if (!detail && !review) {
    return (
      <EssCard className="p-5">
        <h3 className="text-sm font-bold text-[#0F172A]">{title}</h3>
        <p className="mt-1 text-xs text-[#64748B]">
          Rate each objective and behavioural item, add evidence, then submit to your line manager.
        </p>
        <button
          type="button"
          disabled={saving}
          onClick={() => void startDraft()}
          className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-[#2563EB] px-4 text-sm font-bold text-white disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Start {assessmentType === 'Mid-Year' ? 'mid-year review' : 'self-appraisal'}
        </button>
      </EssCard>
    );
  }

  return (
    <div className="space-y-4">
      <EssCard className="p-5">
        <div className="flex flex-col gap-2 border-b border-[#E2E8F0] pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#2563EB]">{assessmentType} assessment</p>
            <h3 className="mt-1 text-lg font-black text-[#0F172A]">{title}</h3>
            <p className="text-xs text-[#64748B]">
              {detail?.status || review?.status || 'Draft'}
              {detail?.version != null ? ` · v${detail.version}` : ''}
              {detail?.returnedReason ? ` · returned: ${detail.returnedReason}` : ''}
            </p>
          </div>
          <div className="rounded-xl border border-[#DBEAFE] bg-[#EFF6FF] px-4 py-2 text-right">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#1D4ED8]">Self score preview</p>
            <p className="text-xl font-black text-[#0F172A]">{preview != null ? preview : '—'}</p>
          </div>
        </div>

        {!items.length ? (
          <div className="py-8">
            <EssEmptyState
              title="No assessment items yet"
              description="Save a draft to load goals and behavioural indicators into your form."
            />
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveDraft()}
              className="mx-auto mt-4 flex min-h-11 items-center rounded-lg bg-[#2563EB] px-4 text-sm font-bold text-white disabled:opacity-60"
            >
              Load assessment items
            </button>
          </div>
        ) : (
          <div className="mt-5 space-y-6">
            {okrItems.length ? (
              <section className="space-y-4">
                <h4 className="text-sm font-bold text-[#0F172A]">Objectives & KPIs</h4>
                {okrItems.map((item) => (
                  <SelfItemEditor
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
                <h4 className="text-sm font-bold text-[#0F172A]">Behavioural / competency self-rating</h4>
                {behaviourItems.map((item) => (
                  <SelfItemEditor
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

            <section className="grid gap-3">
              <div>
                <label htmlFor={`ess-self-overall-${assessmentType}`} className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Overall comments</label>
                <textarea
                  id={`ess-self-overall-${assessmentType}`}
                  value={overallComments}
                  disabled={locked || saving}
                  onChange={(e) => setOverallComments(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm disabled:bg-[#F8FAFC]"
                  placeholder="Summarise achievements, challenges, and support needed"
                />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label htmlFor={`ess-self-strengths-${assessmentType}`} className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Key strengths</label>
                  <textarea
                    id={`ess-self-strengths-${assessmentType}`}
                    value={strengths}
                    disabled={locked || saving}
                    onChange={(e) => setStrengths(e.target.value)}
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm disabled:bg-[#F8FAFC]"
                  />
                </div>
                <div>
                  <label htmlFor={`ess-self-improve-${assessmentType}`} className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Development needs / challenges</label>
                  <textarea
                    id={`ess-self-improve-${assessmentType}`}
                    value={improvements}
                    disabled={locked || saving}
                    onChange={(e) => setImprovements(e.target.value)}
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm disabled:bg-[#F8FAFC]"
                  />
                </div>
              </div>
            </section>

            {clientError ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700" role="alert">{clientError}</div> : null}

            {!locked ? (
              <div className="flex flex-wrap gap-2">
                {detail?.status === 'Returned' ? (
                  <button type="button" disabled={saving} onClick={() => void reopenAssessment()} className="inline-flex min-h-11 items-center rounded-xl border border-amber-200 bg-amber-50 px-4 text-sm font-bold text-amber-900 disabled:opacity-60">
                    Reopen returned assessment
                  </button>
                ) : null}
                <button type="button" disabled={saving} onClick={() => void saveDraft()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 text-sm font-bold text-[#0F172A] disabled:opacity-60">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save draft
                </button>
                <button type="button" disabled={saving} onClick={() => void submitAssessment()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#2563EB] px-4 text-sm font-bold text-white disabled:opacity-60">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Submit {assessmentType === 'Mid-Year' ? 'mid-year review' : 'self-appraisal'}
                </button>
              </div>
            ) : (
              <p className="text-sm font-semibold text-emerald-700" role="status">Submitted and locked for manager review.</p>
            )}
          </div>
        )}
      </EssCard>
      <EssAssessmentHistoryPanel detail={detail as EssAssessmentDetail | null} />
    </div>
  );
}

function SelfItemEditor({
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
        {item.selfRating != null ? (
          <span className="rounded-full border border-[#DBEAFE] bg-[#EFF6FF] px-2.5 py-0.5 text-[11px] font-bold text-[#1D4ED8]">
            Self {item.selfRating} · {item.selfRating * 20}%
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

      <div className="mt-4">
        <EssPerformanceRatingScale
          name={`self-rating-${item.itemId}`}
          value={item.selfRating}
          options={scale}
          disabled={locked || disabled}
          required
          legend="Your self-rating"
          onChange={(value) => onChange({ selfRating: value })}
        />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Your narrative / achievements</label>
          <textarea
            value={item.selfNarrative || ''}
            disabled={locked || disabled}
            onChange={(e) => onChange({ selfNarrative: e.target.value })}
            rows={3}
            className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm disabled:bg-[#F8FAFC]"
            placeholder="What did you achieve against this objective?"
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
            placeholder="Deliverables, dates, links, or supporting notes"
          />
        </div>
      </div>
    </article>
  );
}
