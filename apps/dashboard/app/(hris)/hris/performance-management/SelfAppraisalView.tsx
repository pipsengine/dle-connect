'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Eye,
  FileSpreadsheet,
  FileText,
  Link2,
  LockKeyhole,
  Paperclip,
  Save,
  Send,
  Star,
  Target,
  Trophy,
  Upload,
} from 'lucide-react';
import type { AssessmentItem, EmployeeGoal, PerformanceWorkspacePayload } from '@/lib/performance-domain-types';
import { fmtDate, fmtDateTime } from './performance-management-ui';

type Props = {
  payload: PerformanceWorkspacePayload;
  onAction: (action: string, data?: Record<string, unknown>) => Promise<void>;
  busy?: boolean;
};

const TABS = [
  'Overview',
  'Goals & KPIs',
  'Competencies',
  'Contributions',
  'Evidence',
  'Overall Reflection',
  'Review & Submit',
  'History',
] as const;

type TabId = (typeof TABS)[number];
type ItemDraft = { rating: string; narrative: string; evidence: string };

const WORKFLOW = [
  'Draft',
  'Ready to Submit',
  'Submitted',
  'Manager Review',
  'Calibration',
  'Approved',
  'Published',
  'Acknowledged',
] as const;

const safeFmtDate = (value?: string | null) => {
  if (!value) return '—';
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return value;
  return fmtDate(day);
};

const daysRemaining = (value?: string | null) => {
  if (!value) return null;
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return Math.ceil((new Date(`${day}T00:00:00`).getTime() - Date.now()) / 86_400_000);
};

const StatusPill = ({ label }: { label: string }) => {
  const key = label.toLowerCase();
  const style =
    key.includes('completed') || key.includes('on track') || key.includes('valid') || key.includes('autosaved')
      ? 'bg-[#ecfdf3] text-[#027a48] border-[#abefc6]'
      : key.includes('progress') || key.includes('current') || key.includes('remaining')
        ? 'bg-[#eff8ff] text-[#175cd3] border-[#b2ddff]'
        : key.includes('blocker') || key.includes('attention') || key.includes('incomplete')
          ? 'bg-[#fef3f2] text-[#b42318] border-[#fecdca]'
          : key.includes('locked') || key.includes('pending')
            ? 'bg-[#f8fafc] text-[#667085] border-[#e4e7ec]'
            : 'bg-[#fffaeb] text-[#b54708] border-[#fedf89]';
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${style}`}>{label}</span>;
};

const Ring = ({ value, size = 56, color = '#1570ef' }: { value: number; size?: number; color?: string }) => (
  <div
    className="relative grid place-items-center rounded-full"
    style={{
      width: size,
      height: size,
      background: `conic-gradient(${color} ${Math.max(0, Math.min(100, value)) * 3.6}deg, #e4e7ec 0)`,
    }}
  >
    <span className="absolute inset-[7px] grid place-items-center rounded-full bg-white text-[11px] font-bold text-[#101828]">
      {value}%
    </span>
  </div>
);

const Stars = ({ value }: { value: number }) => (
  <div className="flex items-center gap-0.5">
    {Array.from({ length: 5 }, (_, index) => (
      <Star
        key={index}
        className={`h-4 w-4 ${index < Math.round(value) ? 'fill-[#fdb022] text-[#fdb022]' : 'text-[#d0d5dd]'}`}
      />
    ))}
  </div>
);

function workflowIndex(status?: string) {
  const value = String(status || 'Draft').toLowerCase();
  if (value.includes('draft') || value.includes('not started') || value.includes('returned')) return 0;
  if (value.includes('submit') && !value.includes('submitted')) return 1;
  if (value.includes('submitted') || value.includes('pending manager')) return 2;
  if (value.includes('manager') || value.includes('pending hr')) return 3;
  if (value.includes('calibrat')) return 4;
  if (value.includes('approved')) return 5;
  if (value.includes('published')) return 6;
  if (value.includes('closed') || value.includes('acknowledged')) return 7;
  return 0;
}

function bandLabel(score: number) {
  if (score >= 4.5) return 'Outstanding';
  if (score >= 3.5) return 'Exceeds Expectations';
  if (score >= 2.5) return 'Meets Expectations';
  if (score >= 1.5) return 'Needs Improvement';
  return 'Unsatisfactory';
}

export default function SelfAppraisalView({ payload, onAction, busy }: Props) {
  const domain = payload.domain;
  const actor = payload.actor;
  const cycles = domain.cycles || [];
  const [cycleId, setCycleId] = useState(domain.activeCycleId || cycles[0]?.id || '');
  const [activeTab, setActiveTab] = useState<TabId>('Overview');
  const [selectedGoalId, setSelectedGoalId] = useState<string>('');
  const [draftComments, setDraftComments] = useState('');
  const [draftStrengths, setDraftStrengths] = useState('');
  const [draftImprovements, setDraftImprovements] = useState('');
  const [itemDrafts, setItemDrafts] = useState<Record<string, ItemDraft>>({});

  const patchItemDraft = (itemId: string, patch: Partial<ItemDraft>, fallback?: Partial<ItemDraft>) => {
    setItemDrafts((current) => ({
      ...current,
      [itemId]: {
        rating: current[itemId]?.rating ?? fallback?.rating ?? '',
        narrative: current[itemId]?.narrative ?? fallback?.narrative ?? '',
        evidence: current[itemId]?.evidence ?? fallback?.evidence ?? '',
        ...patch,
      },
    }));
  };

  const draftFor = (item: AssessmentItem): ItemDraft => ({
    rating: itemDrafts[item.itemId]?.rating ?? (item.selfRating != null ? String(item.selfRating) : ''),
    narrative: itemDrafts[item.itemId]?.narrative ?? item.selfNarrative ?? '',
    evidence: itemDrafts[item.itemId]?.evidence ?? item.evidence ?? '',
  });

  const activeCycle = cycles.find((cycle) => cycle.id === cycleId) || cycles.find((cycle) => cycle.id === domain.activeCycleId) || cycles[0];
  const myGoals = useMemo(
    () => (domain.goals || []).filter((goal) =>
      (!cycleId || goal.cycleId === cycleId)
      && (goal.employeeId === actor.employeeId || goal.employeeCode === actor.employeeCode || goal.employeeName === actor.fullName),
    ),
    [domain.goals, cycleId, actor.employeeId, actor.employeeCode, actor.fullName],
  );
  const myAssessment = useMemo(
    () => (domain.assessments || []).find((item) =>
      item.type === 'Self'
      && (!cycleId || item.cycleId === cycleId)
      && (item.employeeId === actor.employeeId || item.employeeName === actor.fullName),
    ) || null,
    [domain.assessments, cycleId, actor.employeeId, actor.fullName],
  );
  const objectives = useMemo(
    () => (domain.companyObjectives || []).filter((item) => !cycleId || item.cycleId === cycleId),
    [domain.companyObjectives, cycleId],
  );
  const behaviours = domain.config?.behaviourIndicators || [];

  const assessmentItems = myAssessment?.items || [];
  const okrItems = assessmentItems.filter((item) => item.itemType === 'okr');
  const behaviourItems = assessmentItems.filter((item) => item.itemType === 'behaviour');

  const goalRows = useMemo(() => {
    if (okrItems.length) {
      return okrItems.map((item) => {
        const goal = myGoals.find((row) => row.id === item.itemId);
        return { item, goal };
      });
    }
    return myGoals.map((goal) => ({
      item: {
        itemId: goal.id,
        itemType: 'okr' as const,
        title: goal.title,
        weight: goal.weight,
        selfRating: undefined,
        selfNarrative: undefined,
        achievement: goal.progressPercent,
        evidence: undefined,
      } satisfies AssessmentItem,
      goal,
    }));
  }, [okrItems, myGoals]);

  const competencyRows = useMemo(() => {
    if (behaviourItems.length) return behaviourItems;
    return behaviours.map((ind) => ({
      itemId: ind.id,
      itemType: 'behaviour' as const,
      title: ind.name,
      weight: ind.weight,
      selfRating: undefined,
      selfNarrative: ind.description,
      evidence: undefined,
    } satisfies AssessmentItem));
  }, [behaviourItems, behaviours]);

  const evidenceRows = useMemo(() => {
    const fromGoals = goalRows.map(({ item, goal }) => ({
      item,
      source: 'Goal' as const,
      subtitle: goal
        ? `${goal.progressPercent}% progress · Weight ${goal.weight}%`
        : `Weight ${item.weight}%`,
    }));
    const fromCompetencies = competencyRows.map((item) => ({
      item,
      source: 'Competency' as const,
      subtitle: `Weight ${item.weight}%`,
    }));
    return [...fromGoals, ...fromCompetencies];
  }, [goalRows, competencyRows]);

  const selected = useMemo(() => {
    const id = selectedGoalId || goalRows[0]?.item.itemId || '';
    return goalRows.find((row) => row.item.itemId === id) || goalRows[0] || null;
  }, [goalRows, selectedGoalId]);

  const ratedGoals = goalRows.filter((row) => Number(draftFor(row.item).rating || 0) > 0).length;
  const ratedBehaviours = competencyRows.filter((item) => Number(draftFor(item).rating || 0) > 0).length;
  const contributionCount = goalRows.filter((row) => Boolean(draftFor(row.item).narrative.trim())).length;
  const reflectionDone = Boolean(myAssessment?.overallComments || draftComments.trim());
  const evidenceCount = evidenceRows.filter((row) => Boolean(draftFor(row.item).evidence.trim())).length;
  const totalItems = Math.max(goalRows.length + competencyRows.length + 1, 1);
  const completedItems = ratedGoals + ratedBehaviours + (reflectionDone ? 1 : 0);
  const completionPct = Math.round((completedItems / totalItems) * 100);
  const blockers = [
    ratedGoals < goalRows.length ? 'Goal ratings incomplete' : null,
    ratedBehaviours < competencyRows.length ? 'Competency ratings incomplete' : null,
    !reflectionDone ? 'Overall reflection missing' : null,
    evidenceCount < Math.max(1, Math.ceil(Math.max(goalRows.length, 1) / 2)) ? 'Evidence coverage incomplete' : null,
  ].filter(Boolean) as string[];
  const deadline = activeCycle?.yearEndEnd || activeCycle?.endDate || activeCycle?.goalSettingEnd || '';
  const remaining = daysRemaining(deadline);
  const step = workflowIndex(myAssessment?.status);
  const canEdit = !myAssessment || ['Draft', 'Returned', 'Not Started'].includes(myAssessment.status);

  const weightedScore = useMemo(() => {
    const rated = goalRows
      .map((row) => {
        const draft = draftFor(row.item);
        const rating = Number(draft.rating || 0);
        return { rating, weight: Number(row.item.weight || row.goal?.weight || 0) };
      })
      .filter((row) => row.rating > 0);
    if (!rated.length) return 0;
    const weightSum = rated.reduce((sum, row) => sum + row.weight, 0) || rated.length;
    return Math.round((rated.reduce((sum, row) => sum + row.rating * row.weight, 0) / weightSum) * 100) / 100;
  }, [goalRows, itemDrafts]);

  const managerName = myGoals[0]?.managerName || 'Line manager';
  const parentObjective = (goal: EmployeeGoal | undefined) => {
    if (!goal?.parentObjectiveId) return 'Unassigned company objective';
    const objective = objectives.find((item) => item.id === goal.parentObjectiveId);
    return objective ? `${objective.code} · ${objective.title}` : 'Company objective';
  };

  const buildItemsForSave = (): AssessmentItem[] => {
    const goalItems = goalRows.map(({ item, goal }) => {
      const draft = draftFor(item);
      const rating = Number(draft.rating || 0) || undefined;
      return {
        itemId: item.itemId,
        itemType: 'okr' as const,
        title: item.title || goal?.title || 'Goal',
        weight: item.weight || goal?.weight || 0,
        selfRating: rating,
        selfNarrative: draft.narrative,
        achievement: item.achievement ?? goal?.progressPercent,
        evidence: draft.evidence,
      };
    });
    const competencyItems = competencyRows.map((item) => {
      const draft = draftFor(item);
      return {
        ...item,
        itemType: 'behaviour' as const,
        selfRating: Number(draft.rating || 0) || undefined,
        selfNarrative: draft.narrative || item.selfNarrative,
        evidence: draft.evidence,
      };
    });
    return [...goalItems, ...competencyItems];
  };

  const saveDraft = async () => {
    await onAction('assessment.save', {
      id: myAssessment?.id,
      cycleId: cycleId || activeCycle?.id,
      type: 'Self',
      employeeId: actor.employeeId,
      employeeName: actor.fullName,
      status: 'Draft',
      items: buildItemsForSave(),
      overallComments: draftComments || myAssessment?.overallComments || '',
      strengths: draftStrengths || myAssessment?.strengths || '',
      improvements: draftImprovements || myAssessment?.improvements || '',
    });
  };

  const submitAssessment = async () => {
    await onAction('assessment.save', {
      id: myAssessment?.id,
      cycleId: cycleId || activeCycle?.id,
      type: 'Self',
      employeeId: actor.employeeId,
      employeeName: actor.fullName,
      status: 'Draft',
      items: buildItemsForSave(),
      overallComments: draftComments || myAssessment?.overallComments || '',
      strengths: draftStrengths || myAssessment?.strengths || '',
      improvements: draftImprovements || myAssessment?.improvements || '',
    });
    if (myAssessment?.id) {
      await onAction('assessment.submit', { id: myAssessment.id });
    }
  };

  const sectionCards = [
    {
      id: 'Goals & KPIs' as TabId,
      title: 'Goals & KPIs',
      done: ratedGoals,
      total: Math.max(goalRows.length, 1),
      detail: `${Math.max(goalRows.length - ratedGoals, 0)} items remaining`,
    },
    {
      id: 'Competencies' as TabId,
      title: 'Competencies',
      done: ratedBehaviours,
      total: Math.max(competencyRows.length, 1),
      detail: ratedBehaviours >= competencyRows.length && competencyRows.length > 0 ? 'All competencies rated' : 'Complete competency ratings',
    },
    {
      id: 'Contributions' as TabId,
      title: 'Contributions',
      done: contributionCount,
      total: Math.max(goalRows.length, 1),
      detail: contributionCount ? `${contributionCount} of ${Math.max(goalRows.length, 1)} narratives captured` : 'Document contributions against goals',
    },
    {
      id: 'Overall Reflection' as TabId,
      title: 'Overall Reflection',
      done: reflectionDone ? 1 : 0,
      total: 1,
      detail: reflectionDone ? 'Reflection captured' : 'Write overall reflection',
    },
  ];

  const selectedGoal = selected?.goal;
  const selectedItem = selected?.item;
  const selectedDraft = selectedItem ? draftFor(selectedItem) : undefined;
  const selectedRating = Number(selectedDraft?.rating || 0);
  const selectedActual = selectedGoal
    ? Math.round((selectedGoal.progressPercent / 100) * Number(selectedGoal.keyResults[0]?.target || 100))
    : Number(selectedItem?.achievement || 0);
  const selectedTarget = Number(selectedGoal?.keyResults[0]?.target || 100);
  const selectedAchieved = selectedTarget > 0 ? Math.round((selectedActual / selectedTarget) * 1000) / 10 : 0;

  return (
    <div className="space-y-4 text-[#101828]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-xl font-bold">Self Appraisal</h1>
          <p className="mt-1 text-[11px] font-medium text-[#667085]">
            Complete your evidence-based assessment for {activeCycle?.name || 'the active cycle'}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={cycleId} onChange={(e) => setCycleId(e.target.value)} className="h-9 rounded-lg border border-[#d0d5dd] bg-white px-3 text-[11px] font-semibold text-[#344054]">
            {cycles.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.name}</option>)}
          </select>
          <button type="button" disabled={busy || !canEdit} onClick={() => void saveDraft()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#d0d5dd] bg-white px-3 text-[11px] font-semibold text-[#344054] disabled:opacity-50">
            <Save className="h-3.5 w-3.5" /> Save draft
          </button>
          <button type="button" onClick={() => setActiveTab('Review & Submit')} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#d0d5dd] bg-white px-3 text-[11px] font-semibold text-[#344054]">
            <Eye className="h-3.5 w-3.5" /> Preview
          </button>
          <button type="button" disabled={busy || blockers.length > 0 || !canEdit} onClick={() => void submitAssessment()} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#1570ef] px-3 text-[11px] font-semibold text-white disabled:opacity-50">
            <Send className="h-3.5 w-3.5" /> Review & submit
          </button>
        </div>
      </div>

      <section className="rounded-xl border border-[#d0d5dd] bg-[#f8fafc] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <CalendarDays className="h-4 w-4 text-[#1570ef]" />
              <h2 className="text-sm font-bold">{activeCycle?.name || 'Performance cycle'}</h2>
              <StatusPill label={myAssessment?.status || 'Draft'} />
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[11px] font-semibold text-[#475467]">
              <span>Employee: {actor.fullName} ({actor.employeeCode || actor.employeeId})</span>
              <span>Line Manager: {managerName}</span>
              <span>Appraisal Deadline: {safeFmtDate(deadline)}</span>
              <span className="inline-flex items-center gap-1 text-[#027a48]">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {myAssessment?.updatedAt ? `Autosaved ${fmtDateTime(myAssessment.updatedAt)}` : 'Not saved yet'}
              </span>
            </div>
          </div>
          {remaining != null ? (
            <span className={`inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-[11px] font-bold ${
              remaining < 0 ? 'bg-[#fef3f2] text-[#b42318]' : remaining <= 14 ? 'bg-[#fffaeb] text-[#b54708]' : 'bg-[#eff8ff] text-[#175cd3]'
            }`}>
              <Clock3 className="h-3.5 w-3.5" />
              {remaining < 0 ? `${Math.abs(remaining)} days overdue` : `${remaining} days remaining`}
            </span>
          ) : null}
        </div>
      </section>

      <div className="flex gap-1 overflow-x-auto border-b border-[#eaecf0]">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold transition ${
              activeTab === tab ? 'border-b-2 border-[#1570ef] text-[#1570ef]' : 'text-[#475467] hover:text-[#1570ef]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
        <div className="flex items-start overflow-x-auto pb-1">
          <div className="flex min-w-[760px] flex-1">
            {WORKFLOW.map((name, index) => {
              const state = index < step ? 'done' : index === step ? 'current' : 'locked';
              return (
                <div key={name} className="relative flex-1 text-center">
                  {index < WORKFLOW.length - 1 ? (
                    <i className={`absolute left-1/2 top-4 z-0 h-0.5 w-full ${state === 'done' ? 'bg-[#12b76a]' : 'bg-[#d0d5dd]'}`} />
                  ) : null}
                  <div className={`relative z-[1] mx-auto grid h-8 w-8 place-items-center rounded-full border ${
                    state === 'done' ? 'border-[#12b76a] bg-white text-[#12b76a]'
                      : state === 'current' ? 'border-[#1570ef] bg-[#1570ef] text-white shadow-[0_0_0_4px_#d1e9ff]'
                        : 'border-[#d0d5dd] bg-white text-[#98a2b3]'
                  }`}>
                    {state === 'done' ? <Check className="h-3.5 w-3.5" /> : state === 'current' ? <Target className="h-3.5 w-3.5" /> : <LockKeyhole className="h-3.5 w-3.5" />}
                  </div>
                  <b className={`mt-2 block text-[9px] ${state === 'current' ? 'text-[#1570ef]' : 'text-[#344054]'}`}>{name}</b>
                  <small className="mt-1 block text-[8px] font-semibold text-[#667085]">{state === 'current' ? 'Current' : state === 'done' ? 'Complete' : 'Locked'}</small>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {(activeTab === 'Overview' || activeTab === 'Goals & KPIs') ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              { label: 'Overall Completion', value: `${completionPct}%`, sub: 'Appraisal progress', icon: null, ring: completionPct, tone: 'blue' as const },
              { label: 'Assessment Items', value: `${completedItems} of ${totalItems}`, sub: 'Completed', icon: ClipboardList, tone: 'blue' as const },
              { label: 'Evidence Attached', value: String(Math.max(evidenceCount, 0)), sub: 'Uploaded / linked', icon: Paperclip, tone: 'green' as const },
              { label: 'Validation Blockers', value: String(blockers.length), sub: blockers.length ? 'Require attention' : 'Clear', icon: AlertTriangle, tone: 'red' as const },
              { label: 'Days Remaining', value: remaining == null ? '—' : String(Math.max(remaining, 0)), sub: 'Until deadline', icon: CalendarDays, tone: 'orange' as const },
            ].map((kpi) => (
              <article key={kpi.label} className="rounded-xl border border-[#eaecf0] bg-white p-3.5 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[10px] font-semibold text-[#667085]">{kpi.label}</p>
                  {kpi.ring != null ? <Ring value={kpi.ring} /> : (
                    <span className={`grid h-8 w-8 place-items-center rounded-lg ${
                      kpi.tone === 'green' ? 'bg-[#ecfdf3] text-[#039855]'
                        : kpi.tone === 'red' ? 'bg-[#fef3f2] text-[#d92d20]'
                          : kpi.tone === 'orange' ? 'bg-[#fffaeb] text-[#dc6803]'
                            : 'bg-[#eff8ff] text-[#1570ef]'
                    }`}>
                      {kpi.icon ? <kpi.icon className="h-4 w-4" /> : null}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-2xl font-bold">{kpi.value}</p>
                <p className="mt-1 text-[10px] font-semibold text-[#667085]">{kpi.sub}</p>
              </article>
            ))}
          </div>

          <div className="grid gap-4 wide:grid-cols-[minmax(0,1fr)_300px]">
            <div className="space-y-4">
              <section className="overflow-hidden rounded-xl border border-[#eaecf0] bg-white shadow-sm">
                <div className="border-b border-[#eaecf0] px-4 py-3">
                  <h3 className="text-sm font-bold">Assessment sections</h3>
                </div>
                <div className="divide-y divide-[#eaecf0]">
                  {sectionCards.map((section) => {
                    const pct = Math.round((section.done / section.total) * 100);
                    const complete = section.done >= section.total;
                    return (
                      <div key={section.title} className="flex flex-wrap items-center gap-3 px-4 py-3">
                        <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#eff8ff] text-[#1570ef]">
                          <ClipboardList className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-[12px] font-bold">{section.title}</p>
                            <StatusPill label={complete ? 'Completed' : 'In progress'} />
                          </div>
                          <div className="mt-2 flex items-center gap-3">
                            <div className="h-1.5 max-w-[180px] flex-1 overflow-hidden rounded-full bg-[#f2f4f7]">
                              <div className={`h-full rounded-full ${complete ? 'bg-[#12b76a]' : 'bg-[#1570ef]'}`} style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-[10px] font-semibold text-[#667085]">{section.done} of {section.total}</span>
                          </div>
                          <p className="mt-1 text-[10px] font-semibold text-[#667085]">{section.detail}</p>
                        </div>
                        <button type="button" onClick={() => setActiveTab(section.id)} className="h-8 rounded-lg border border-[#d0d5dd] px-3 text-[10px] font-semibold text-[#344054]">
                          {complete ? 'Review' : 'Continue'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>

              {selected ? (
                <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold">Goal assessment preview</h3>
                        <StatusPill label={(selectedGoal?.progressPercent || 0) >= 70 ? 'On track' : 'At risk'} />
                      </div>
                      <p className="mt-2 text-[13px] font-bold text-[#101828]">{selectedItem?.title}</p>
                      <p className="mt-1 text-[10px] font-semibold text-[#667085]">Alignment: {parentObjective(selectedGoal)} → {selectedGoal?.department || 'Team'}</p>
                    </div>
                    <div className="flex gap-2">
                      <select
                        value={selectedItem?.itemId || ''}
                        onChange={(e) => setSelectedGoalId(e.target.value)}
                        className="h-8 rounded-lg border border-[#d0d5dd] bg-white px-2 text-[10px]"
                      >
                        {goalRows.map((row) => <option key={row.item.itemId} value={row.item.itemId}>{row.item.title}</option>)}
                      </select>
                      <button type="button" onClick={() => setActiveTab('Goals & KPIs')} className="h-8 rounded-lg border border-[#d0d5dd] px-3 text-[10px] font-semibold">Edit assessment</button>
                    </div>
                  </div>

                  <div className="mt-4 rounded-lg bg-[#f9fafb] p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-[#667085]">Narrative preview</p>
                    <p className="mt-1 text-[12px] font-medium text-[#344054]">
                      {selectedDraft?.narrative || selectedGoal?.description || 'No contribution narrative captured yet. Add achievements on the Contributions tab.'}
                    </p>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                    {[
                      ['Weight', `${selectedItem?.weight || selectedGoal?.weight || 0}%`],
                      ['Target', `${selectedTarget}${selectedGoal?.keyResults[0]?.unit || '%'}`],
                      ['Actual', `${selectedActual}${selectedGoal?.keyResults[0]?.unit || '%'}`],
                      ['Achieved', `${selectedAchieved}%`],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-lg border border-[#eaecf0] p-3">
                        <p className="text-[10px] font-semibold text-[#667085]">{label}</p>
                        <p className="mt-1 text-lg font-bold">{value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4">
                    <div className="mb-1 flex justify-between text-[10px] font-semibold text-[#667085]">
                      <span>Actual vs Target</span>
                      <span>{selectedAchieved}%</span>
                    </div>
                    <div className="flex h-3 overflow-hidden rounded-md bg-[#f2f4f7]">
                      <div className="h-full bg-[#1570ef]" style={{ width: `${Math.min(100, selectedAchieved)}%` }} />
                      <div className="h-full bg-[#d0d5dd]" style={{ width: `${Math.max(0, 100 - selectedAchieved)}%` }} />
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#eaecf0] p-3">
                    <div>
                      <p className="text-[10px] font-semibold text-[#667085]">Employee rating</p>
                      <div className="mt-1 flex items-center gap-2">
                        <p className="text-lg font-bold">{selectedRating ? selectedRating.toFixed(1) : '—'} / 5</p>
                        <Stars value={selectedRating} />
                      </div>
                    </div>
                    {canEdit ? (
                      <select
                        className="h-9 rounded-lg border border-[#d0d5dd] bg-white px-2 text-[11px]"
                        value={selectedDraft?.rating || ''}
                        onChange={(e) => patchItemDraft(selectedItem!.itemId, { rating: e.target.value }, {
                          narrative: selectedItem?.selfNarrative || '',
                          evidence: selectedItem?.evidence || '',
                        })}
                      >
                        <option value="">Select rating</option>
                        {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    ) : null}
                  </div>

                  <div className="mt-4">
                    <p className="text-[11px] font-bold">Evidence</p>
                    <div className="mt-2 space-y-2">
                      {(selectedDraft?.evidence || selectedItem?.evidence
                        ? [selectedDraft?.evidence || selectedItem?.evidence || '']
                        : ['No evidence linked yet — add notes or links on the Evidence tab']
                      ).map((file) => (
                        <div key={file} className="flex items-center gap-2 rounded-lg border border-[#eaecf0] px-3 py-2 text-[11px]">
                          {/\.xlsx|excel/i.test(file) ? <FileSpreadsheet className="h-4 w-4 text-[#039855]" />
                            : /^https?:\/\//i.test(file) ? <Link2 className="h-4 w-4 text-[#1570ef]" />
                              : <FileText className="h-4 w-4 text-[#d92d20]" />}
                          <span className="flex-1 truncate font-semibold text-[#344054]">{file}</span>
                        </div>
                      ))}
                    </div>
                    <button type="button" onClick={() => setActiveTab('Evidence')} className="mt-3 text-[10px] font-bold text-[#1570ef]">View all evidence</button>
                  </div>
                </section>
              ) : (
                <section className="rounded-xl border border-dashed border-[#d0d5dd] bg-white px-4 py-10 text-center text-sm font-semibold text-[#667085]">
                  No goals assigned for this cycle yet. Save a draft to scaffold your assessment items.
                </section>
              )}

              <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-bold">Recent evidence & activity</h3>
                <ul className="space-y-2">
                  {(myAssessment?.history || []).slice(0, 5).map((event) => (
                    <li key={`${event.at}-${event.change}`} className="flex items-start gap-2 border-t border-[#eaecf0] py-2.5 text-[11px]">
                      <Upload className="mt-0.5 h-3.5 w-3.5 text-[#1570ef]" />
                      <div>
                        <p className="font-semibold text-[#344054]">{event.change}</p>
                        <p className="text-[10px] font-semibold text-[#667085]">{event.actor} · {fmtDateTime(event.at)}</p>
                      </div>
                    </li>
                  ))}
                  {!myAssessment?.history?.length ? (
                    <li className="text-[11px] font-semibold text-[#98a2b3]">No appraisal activity yet. Save a draft to begin.</li>
                  ) : null}
                </ul>
              </section>
            </div>

            <aside className="space-y-4">
              <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-bold">Submission readiness</h3>
                <div className="flex items-center gap-3">
                  <Ring value={completionPct} size={72} />
                  <div>
                    <p className="text-2xl font-bold">{completionPct}%</p>
                    <p className="text-[10px] font-semibold text-[#667085]">Ready to submit</p>
                  </div>
                </div>
                <ul className="mt-4 space-y-2 text-[11px]">
                  {[
                    ['Goal ratings complete', ratedGoals >= goalRows.length && goalRows.length > 0],
                    ['Competency ratings complete', ratedBehaviours >= competencyRows.length && competencyRows.length > 0],
                    ['Overall reflection captured', reflectionDone],
                    ['Evidence linked', evidenceCount > 0],
                  ].map(([label, ok]) => (
                    <li key={String(label)} className="flex items-center justify-between gap-2 border-t border-[#eaecf0] py-2">
                      <span className="font-semibold text-[#475467]">{label}</span>
                      {ok ? <CheckCircle2 className="h-4 w-4 text-[#12b76a]" /> : <AlertTriangle className="h-4 w-4 text-[#f79009]" />}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  disabled={!blockers.length}
                  onClick={() => setActiveTab(blockers[0]?.includes('Goal') ? 'Goals & KPIs' : blockers[0]?.includes('Competency') ? 'Competencies' : blockers[0]?.includes('reflection') ? 'Overall Reflection' : 'Evidence')}
                  className="mt-4 flex h-10 w-full items-center justify-center rounded-lg border border-[#d0d5dd] text-[11px] font-semibold disabled:opacity-50"
                >
                  {blockers.length ? `Resolve ${blockers.length} blockers` : 'No blockers'}
                </button>
              </section>

              <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-bold">Review context</h3>
                <dl className="space-y-2 text-[11px]">
                  {[
                    ['Line Manager', managerName],
                    ['Additional Reviewer', domain.raters.find((row) => row.employeeId === actor.employeeId)?.raterName || 'Not assigned'],
                    ['Manager Review Deadline', safeFmtDate(activeCycle?.yearEndEnd || activeCycle?.endDate)],
                    ['Submission Destination', 'Manager appraisal queue'],
                  ].map(([dt, dd]) => (
                    <div key={dt} className="flex items-start justify-between gap-2 border-t border-[#eaecf0] py-2">
                      <dt className="font-semibold text-[#667085]">{dt}</dt>
                      <dd className="text-right font-bold text-[#101828]">{dd}</dd>
                    </div>
                  ))}
                </dl>
                <button type="button" className="mt-3 text-[10px] font-bold text-[#1570ef]">Request correction</button>
              </section>

              <section className="rounded-xl border border-[#abefc6] bg-[#ecfdf3] p-4">
                <div className="flex items-center gap-2 text-[#027a48]">
                  <Trophy className="h-5 w-5" />
                  <h3 className="text-sm font-bold">Overall score preview</h3>
                </div>
                <p className="mt-3 text-[11px] font-semibold text-[#027a48]">Weighted score</p>
                <p className="mt-1 text-3xl font-bold text-[#027a48]">{weightedScore ? weightedScore.toFixed(2) : '—'} / 5.00</p>
                <p className="mt-2 text-lg font-bold text-[#027a48]">{weightedScore ? bandLabel(weightedScore) : 'Pending ratings'}</p>
                <p className="mt-2 text-[10px] font-semibold text-[#027a48]">Provisional until manager review and calibration.</p>
              </section>
            </aside>
          </div>
        </>
      ) : activeTab === 'Overall Reflection' || activeTab === 'Review & Submit' ? (
        <section className="rounded-xl border border-[#eaecf0] bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">{activeTab}</h2>
          <p className="mt-1 text-sm text-[#667085]">Capture strengths, improvements, and overall comments before submission.</p>
          <div className="mt-4 grid gap-3">
            <label className="text-[11px] font-semibold text-[#344054]">Overall comments
              <textarea className="mt-1 min-h-[90px] w-full rounded-lg border border-[#d0d5dd] px-3 py-2 text-sm" value={draftComments || myAssessment?.overallComments || ''} onChange={(e) => setDraftComments(e.target.value)} disabled={!canEdit} />
            </label>
            <label className="text-[11px] font-semibold text-[#344054]">Strengths
              <textarea className="mt-1 min-h-[70px] w-full rounded-lg border border-[#d0d5dd] px-3 py-2 text-sm" value={draftStrengths || myAssessment?.strengths || ''} onChange={(e) => setDraftStrengths(e.target.value)} disabled={!canEdit} />
            </label>
            <label className="text-[11px] font-semibold text-[#344054]">Improvements
              <textarea className="mt-1 min-h-[70px] w-full rounded-lg border border-[#d0d5dd] px-3 py-2 text-sm" value={draftImprovements || myAssessment?.improvements || ''} onChange={(e) => setDraftImprovements(e.target.value)} disabled={!canEdit} />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={busy || !canEdit} onClick={() => void saveDraft()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#d0d5dd] px-3 text-[11px] font-semibold disabled:opacity-50">
              <Save className="h-3.5 w-3.5" /> Save draft
            </button>
            {activeTab === 'Review & Submit' ? (
              <button type="button" disabled={busy || blockers.length > 0 || !canEdit} onClick={() => void submitAssessment()} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#1570ef] px-3 text-[11px] font-semibold text-white disabled:opacity-50">
                <Send className="h-3.5 w-3.5" /> Submit appraisal
              </button>
            ) : null}
          </div>
          {activeTab === 'Review & Submit' && blockers.length ? (
            <ul className="mt-4 space-y-1 text-[11px] font-semibold text-[#b42318]">
              {blockers.map((item) => <li key={item}>• {item}</li>)}
            </ul>
          ) : null}
        </section>
      ) : activeTab === 'Competencies' ? (
        <section className="rounded-xl border border-[#eaecf0] bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-bold">Competencies</h2>
          <div className="space-y-3">
            {competencyRows.map((item) => {
              const draft = draftFor(item);
              return (
                <div key={item.itemId} className="rounded-lg border border-[#eaecf0] p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-[12px] font-bold">{item.title}</p>
                      <p className="mt-1 text-[10px] font-semibold text-[#667085]">Weight {item.weight}% · {item.selfNarrative || 'Competency indicator'}</p>
                    </div>
                    <select
                      disabled={!canEdit}
                      className="h-9 rounded-lg border border-[#d0d5dd] bg-white px-2 text-[11px] disabled:opacity-50"
                      value={draft.rating}
                      onChange={(e) => patchItemDraft(item.itemId, { rating: e.target.value }, {
                        narrative: item.selfNarrative || '',
                        evidence: item.evidence || '',
                      })}
                    >
                      <option value="">Rate 1–5</option>
                      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                </div>
              );
            })}
            {!competencyRows.length ? (
              <p className="text-sm font-semibold text-[#667085]">No competency indicators configured.</p>
            ) : null}
          </div>
          <button type="button" disabled={busy || !canEdit} onClick={() => void saveDraft()} className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#1570ef] px-3 text-[11px] font-semibold text-white disabled:opacity-50">
            <Save className="h-3.5 w-3.5" /> Save competency ratings
          </button>
        </section>
      ) : activeTab === 'Contributions' ? (
        <section className="rounded-xl border border-[#eaecf0] bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Contributions</h2>
              <p className="mt-1 text-[11px] font-medium text-[#667085]">
                Document achievements against your live goals for {activeCycle?.name || 'this cycle'}. Narratives save with your self appraisal draft.
              </p>
            </div>
            <StatusPill label={`${contributionCount} of ${Math.max(goalRows.length, 0)} complete`} />
          </div>

          <div className="mt-4 space-y-3">
            {goalRows.map(({ item, goal }) => {
              const draft = draftFor(item);
              const progress = goal?.progressPercent ?? Number(item.achievement || 0);
              const primaryKr = goal?.keyResults?.[0];
              return (
                <article key={item.itemId} className="rounded-xl border border-[#eaecf0] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Target className="h-4 w-4 text-[#1570ef]" />
                        <p className="text-[13px] font-bold">{item.title || goal?.title}</p>
                        <StatusPill label={progress >= 70 ? 'On track' : progress > 0 ? 'In progress' : 'Not started'} />
                      </div>
                      <p className="mt-1 text-[10px] font-semibold text-[#667085]">
                        {parentObjective(goal)} · Weight {item.weight || goal?.weight || 0}%
                        {goal?.dueDate ? ` · Due ${safeFmtDate(goal.dueDate)}` : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-semibold text-[#667085]">Live progress</p>
                      <p className="text-lg font-bold text-[#101828]">{progress}%</p>
                    </div>
                  </div>

                  {primaryKr ? (
                    <div className="mt-3 rounded-lg bg-[#f9fafb] px-3 py-2 text-[11px]">
                      <p className="font-bold text-[#344054]">Primary KR: {primaryKr.title}</p>
                      <p className="mt-0.5 font-semibold text-[#667085]">
                        {primaryKr.actual != null ? primaryKr.actual : Math.round((progress / 100) * Number(primaryKr.target || 100))}
                        {' / '}
                        {primaryKr.target}{primaryKr.unit || ''}
                      </p>
                    </div>
                  ) : null}

                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-[10px] font-semibold text-[#667085]">
                      <span>Goal progress</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[#f2f4f7]">
                      <div className="h-full rounded-full bg-[#1570ef]" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
                    </div>
                  </div>

                  <label className="mt-3 block text-[11px] font-semibold text-[#344054]">
                    Contribution / achievements
                    <textarea
                      className="mt-1 min-h-[88px] w-full rounded-lg border border-[#d0d5dd] px-3 py-2 text-sm disabled:bg-[#f9fafb]"
                      disabled={!canEdit}
                      value={draft.narrative}
                      placeholder="What did you deliver against this goal? Include outcomes, dates, and measurable impact."
                      onChange={(e) => patchItemDraft(item.itemId, { narrative: e.target.value }, {
                        rating: item.selfRating != null ? String(item.selfRating) : '',
                        evidence: item.evidence || '',
                      })}
                    />
                  </label>
                </article>
              );
            })}
            {!goalRows.length ? (
              <div className="rounded-xl border border-dashed border-[#d0d5dd] px-4 py-10 text-center text-sm font-semibold text-[#667085]">
                No employee goals in this cycle yet. Assign goals in OKR &amp; KPI Management, then return here to document contributions.
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={busy || !canEdit || !goalRows.length} onClick={() => void saveDraft()} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#1570ef] px-3 text-[11px] font-semibold text-white disabled:opacity-50">
              <Save className="h-3.5 w-3.5" /> Save contributions
            </button>
            <button type="button" onClick={() => setActiveTab('Evidence')} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#d0d5dd] px-3 text-[11px] font-semibold">
              <Paperclip className="h-3.5 w-3.5" /> Continue to Evidence
            </button>
          </div>
        </section>
      ) : activeTab === 'Evidence' ? (
        <section className="rounded-xl border border-[#eaecf0] bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Evidence</h2>
              <p className="mt-1 text-[11px] font-medium text-[#667085]">
                Link supporting notes, deliverables, and URLs for each appraisal item. Stored on your self assessment in HRIS.
              </p>
            </div>
            <StatusPill label={`${evidenceCount} item${evidenceCount === 1 ? '' : 's'} with evidence`} />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              ['Items with evidence', String(evidenceCount)],
              ['Goals covered', String(goalRows.filter((row) => Boolean(draftFor(row.item).evidence.trim())).length)],
              ['Competencies covered', String(competencyRows.filter((item) => Boolean(draftFor(item).evidence.trim())).length)],
            ].map(([label, value]) => (
              <article key={label} className="rounded-xl border border-[#eaecf0] bg-[#f9fafb] p-3">
                <p className="text-[10px] font-semibold text-[#667085]">{label}</p>
                <p className="mt-1 text-xl font-bold">{value}</p>
              </article>
            ))}
          </div>

          <div className="mt-4 space-y-3">
            {evidenceRows.map(({ item, source, subtitle }) => {
              const draft = draftFor(item);
              const hasEvidence = Boolean(draft.evidence.trim());
              return (
                <article key={`${source}-${item.itemId}`} className="rounded-xl border border-[#eaecf0] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Paperclip className="h-4 w-4 text-[#1570ef]" />
                        <p className="text-[12px] font-bold">{item.title}</p>
                        <StatusPill label={source} />
                        <StatusPill label={hasEvidence ? 'Linked' : 'Missing'} />
                      </div>
                      <p className="mt-1 text-[10px] font-semibold text-[#667085]">{subtitle}</p>
                    </div>
                  </div>
                  <label className="mt-3 block text-[11px] font-semibold text-[#344054]">
                    Evidence notes / links
                    <textarea
                      className="mt-1 min-h-[80px] w-full rounded-lg border border-[#d0d5dd] px-3 py-2 text-sm disabled:bg-[#f9fafb]"
                      disabled={!canEdit}
                      value={draft.evidence}
                      placeholder="Deliverables, dates, document names, or https:// links"
                      onChange={(e) => patchItemDraft(item.itemId, { evidence: e.target.value }, {
                        rating: item.selfRating != null ? String(item.selfRating) : '',
                        narrative: item.selfNarrative || '',
                      })}
                    />
                  </label>
                  {hasEvidence ? (
                    <div className="mt-2 flex items-center gap-2 rounded-lg border border-[#eaecf0] bg-[#f9fafb] px-3 py-2 text-[11px]">
                      {/^https?:\/\//i.test(draft.evidence) ? <Link2 className="h-4 w-4 text-[#1570ef]" />
                        : /\.xlsx|excel/i.test(draft.evidence) ? <FileSpreadsheet className="h-4 w-4 text-[#039855]" />
                          : <FileText className="h-4 w-4 text-[#667085]" />}
                      <span className="truncate font-semibold text-[#344054]">{draft.evidence.split('\n')[0]}</span>
                    </div>
                  ) : null}
                </article>
              );
            })}
            {!evidenceRows.length ? (
              <div className="rounded-xl border border-dashed border-[#d0d5dd] px-4 py-10 text-center text-sm font-semibold text-[#667085]">
                No appraisal items yet. Assign goals or save a draft to scaffold competency indicators, then attach evidence.
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={busy || !canEdit || !evidenceRows.length} onClick={() => void saveDraft()} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#1570ef] px-3 text-[11px] font-semibold text-white disabled:opacity-50">
              <Save className="h-3.5 w-3.5" /> Save evidence
            </button>
            <button type="button" onClick={() => setActiveTab('Overall Reflection')} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#d0d5dd] px-3 text-[11px] font-semibold">
              Continue to reflection
            </button>
          </div>
        </section>
      ) : activeTab === 'History' ? (
        <section className="rounded-xl border border-[#eaecf0] bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-bold">History</h2>
          <ul className="space-y-2">
            {(myAssessment?.history || []).map((event) => (
              <li key={`${event.version}-${event.at}`} className="rounded-lg border border-[#eaecf0] px-3 py-2.5 text-[11px]">
                <p className="font-bold text-[#101828]">v{event.version} · {event.change}</p>
                <p className="mt-1 font-semibold text-[#667085]">{event.actor} · {fmtDateTime(event.at)}{event.reason ? ` · ${event.reason}` : ''}</p>
              </li>
            ))}
            {!myAssessment?.history?.length ? <p className="text-sm font-semibold text-[#667085]">No history yet.</p> : null}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
