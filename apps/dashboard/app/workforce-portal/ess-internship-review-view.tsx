'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  CornerDownLeft,
  FileText,
  Info,
  Save,
  Send,
  Star,
  Users,
  X,
} from 'lucide-react';
import {
  INTERNSHIP_RATING_LABELS,
  INTERNSHIP_REVIEW_CRITERIA,
} from '@/lib/internship-performance-review-constants';
import type {
  InternshipRating,
  InternshipRecommendation,
  InternshipReview,
} from '@/lib/internship-performance-review-types';
import { internshipCanApprove, internshipCanEvaluate, formatInternshipOverallScore, internshipScoreOutOf100 } from '@/lib/internship-performance-review-workflow';
import { EssCard, EssEmptyState } from './ess-portal-ui';

type EssInternshipWorkspace = {
  tasks: InternshipReview[];
  reviews: InternshipReview[];
};

type EssInternshipReviewViewProps = {
  workspace: EssInternshipWorkspace | null;
  actor: { fullName?: string; employeeCode?: string; employeeId?: string; roles?: string[] };
  saving?: boolean;
  error?: string;
  initialReviewId?: string | null;
  initialAction?: string | null;
  onRefresh?: () => void;
  onAction: (action: string, payload?: Record<string, unknown>, id?: string) => Promise<void>;
};

type ModalKind = 'evaluate' | 'approve' | 'detail' | null;

const formatDay = (value?: string) => {
  if (!value) return '—';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const statusTone = (status: string) => {
  const value = status.toLowerCase();
  if (/approved|closed|hr action/i.test(value)) return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  if (/returned/i.test(value)) return 'bg-red-50 text-red-800 border-red-200';
  if (/pending|evaluation|assigned/i.test(value)) return 'bg-amber-50 text-amber-900 border-amber-200';
  return 'bg-slate-50 text-slate-700 border-slate-200';
};

function EssModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-auto bg-[#07172C]/50 p-4" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="my-6 w-full max-w-4xl rounded-[20px] bg-[#F5F7FB] shadow-[0_24px_80px_rgba(15,23,42,0.28)]" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-[#E2E8F0] bg-white px-5 py-4 rounded-t-[20px]">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#2563EB]">Internship Performance Review</p>
            <h2 className="m-0 mt-1 text-[20px] font-bold text-[#0A1F44]">{title}</h2>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-[14px] border border-[#E5E7EB] bg-white text-[#475569]" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[calc(100vh-140px)] overflow-auto p-5">{children}</div>
      </div>
    </div>
  );
}

export function EssInternshipReviewView({
  workspace,
  actor,
  saving,
  error,
  initialReviewId,
  initialAction,
  onRefresh,
  onAction,
}: EssInternshipReviewViewProps) {
  const [modal, setModal] = useState<ModalKind>(null);
  const [activeId, setActiveId] = useState('');
  const [cardFilter, setCardFilter] = useState<'tasks' | 'due' | 'visible'>('tasks');

  const tasks = workspace?.tasks || [];
  const reviews = workspace?.reviews || [];
  const dueSoon = useMemo(
    () => tasks.filter((item) => item.dueDate && item.dueDate <= new Date().toISOString().slice(0, 10)),
    [tasks],
  );
  const lists = { tasks, due: dueSoon, visible: reviews };
  const shown = lists[cardFilter];
  const active = reviews.find((item) => item.id === activeId) || tasks.find((item) => item.id === activeId) || shown.find((item) => item.id === activeId) || null;

  useEffect(() => {
    if (!initialReviewId) return;
    const match = [...tasks, ...reviews].find((item) => item.id === initialReviewId);
    if (!match) return;
    setActiveId(match.id);
    if (initialAction === 'evaluate' && internshipCanEvaluate(match, actor)) setModal('evaluate');
    else if (initialAction === 'approve' && internshipCanApprove(match, actor)) setModal('approve');
    else setModal('detail');
  }, [actor, initialAction, initialReviewId, reviews, tasks]);

  const openTask = (review: InternshipReview) => {
    setActiveId(review.id);
    if (internshipCanEvaluate(review, actor)) setModal('evaluate');
    else if (internshipCanApprove(review, actor)) setModal('approve');
    else setModal('detail');
  };

  const openCard = (key: 'tasks' | 'due' | 'visible') => {
    setCardFilter(key);
    const list = lists[key];
    if (list.length === 1) openTask(list[0]);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="mr-auto min-w-0">
          <h1 className="m-0 text-[26px] font-bold tracking-[-0.6px] text-[#0A1F44]">Internship Performance Review</h1>
          <p className="mt-1.5 text-xs text-[#66738A]">
            Line managers evaluate assigned interns here. HOD, HR Manager and MD approvals also complete in this workspace.
          </p>
        </div>
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

      {error ? (
        <div className="flex items-start gap-3 rounded-[14px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {([
          { key: 'tasks' as const, label: 'My open tasks', value: tasks.length, icon: ClipboardCheck, tone: 'text-[#2563EB] bg-[#EFF6FF]' },
          { key: 'due' as const, label: 'Due soon', value: dueSoon.length, icon: Clock3, tone: 'text-[#C2410C] bg-[#FFF7ED]' },
          { key: 'visible' as const, label: 'Reviews visible to me', value: reviews.length, icon: Users, tone: 'text-[#047857] bg-[#ECFDF5]' },
        ]).map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => openCard(item.key)}
            className={`rounded-[20px] border bg-white p-4 text-left shadow-[0_6px_18px_rgba(15,23,42,0.05)] transition hover:-translate-y-px hover:shadow-[0_8px_24px_rgba(37,99,235,0.12)] ${
              cardFilter === item.key ? 'border-[#2563EB] ring-2 ring-[#BFDBFE]' : 'border-[#E2E8F0]'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className={`inline-flex h-10 w-10 items-center justify-center rounded-[12px] ${item.tone}`}>
                <item.icon className="h-5 w-5" />
              </span>
              <div>
                <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">{item.label}</p>
                <p className="m-0 text-[22px] font-bold text-[#0F172A]">{item.value}</p>
                <p className="m-0 mt-0.5 text-[11px] font-semibold text-[#2563EB]">View details</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      <EssCard>
        <div className="border-b border-[#E2E8F0] px-5 py-4">
          <h2 className="m-0 text-sm font-bold text-[#0F172A]">
            {cardFilter === 'due' ? 'Due soon' : cardFilter === 'visible' ? 'Reviews visible to you' : 'Team action centre'}
          </h2>
          <p className="m-0 mt-1 text-[12px] text-[#64748B]">
            {cardFilter === 'due'
              ? 'Tasks at or past the due date.'
              : cardFilter === 'visible'
                ? 'Internship reviews you can open, including evaluations and approvals.'
                : 'Internship evaluations and approvals assigned to you.'}
          </p>
        </div>
        {!workspace ? (
          <EssEmptyState icon={Star} title="Loading internship tasks" description="Assigned evaluations and approvals will appear here." />
        ) : !shown.length ? (
          <div className="p-4">
            <EssEmptyState
              icon={ClipboardCheck}
              title={cardFilter === 'due' ? 'Nothing due soon' : cardFilter === 'visible' ? 'No reviews visible yet' : 'No internship review tasks'}
              description={cardFilter === 'due'
                ? 'Open tasks with an approaching due date will appear here.'
                : cardFilter === 'visible'
                  ? 'Reviews appear here when you are the line manager or an assigned approver.'
                  : 'When HR initiates a review and assigns you as line manager or approver, the task appears here.'}
            />
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full border-collapse text-left text-[13px]">
              <thead>
                <tr className="bg-[#F8FAFC] text-[11px] uppercase tracking-wide text-[#64748B]">
                  <th className="px-5 py-3 font-semibold">Intern</th>
                  <th className="px-5 py-3 font-semibold">Department</th>
                  <th className="px-5 py-3 font-semibold">Stage</th>
                  <th className="px-5 py-3 font-semibold">Due</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((task) => {
                  const actionLabel = internshipCanEvaluate(task, actor) ? 'Evaluate' : internshipCanApprove(task, actor) ? 'Approve' : 'View';
                  return (
                    <tr
                      key={task.id}
                      className="cursor-pointer border-t border-[#EDF1F5] hover:bg-[#F8FAFC]"
                      onClick={() => openTask(task)}
                    >
                      <td className="px-5 py-4">
                        <p className="m-0 font-bold text-[#0F172A]">{task.employee.name}</p>
                        <p className="m-0 text-[12px] text-[#94A3B8]">{task.employee.code} · {task.id}</p>
                      </td>
                      <td className="px-5 py-4 text-[#475569]">{task.employee.department}</td>
                      <td className="px-5 py-4 text-[#475569]">{task.status}</td>
                      <td className="px-5 py-4 font-semibold">{formatDay(task.dueDate)}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusTone(task.status)}`}>{task.status}</span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openTask(task);
                          }}
                          className="inline-flex h-9 items-center rounded-[12px] bg-[#2563EB] px-4 text-[12px] font-semibold text-white"
                        >
                          {actionLabel}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </EssCard>

      {modal && active ? (
        <EssModal
          title={modal === 'evaluate' ? `Evaluate ${active.employee.name}` : modal === 'approve' ? `Approve ${active.employee.name}` : active.employee.name}
          onClose={() => { setModal(null); setActiveId(''); }}
        >
          {modal === 'evaluate' ? (
            <EvaluateForm review={active} saving={Boolean(saving)} onAction={onAction} onDone={() => { setModal(null); setActiveId(''); }} />
          ) : modal === 'approve' ? (
            <ApproveForm review={active} saving={Boolean(saving)} onAction={onAction} onDone={() => { setModal(null); setActiveId(''); }} />
          ) : (
            <DetailReadOnly review={active} />
          )}
        </EssModal>
      ) : null}
    </div>
  );
}

function EvaluateForm({
  review,
  saving,
  onAction,
  onDone,
}: {
  review: InternshipReview;
  saving: boolean;
  onAction: (action: string, payload?: Record<string, unknown>, id?: string) => Promise<void>;
  onDone: () => void;
}) {
  const [scores, setScores] = useState<Record<number, number>>(() => {
    const next: Record<number, number> = {};
    review.scores.forEach((score) => {
      const criterionIndex = INTERNSHIP_REVIEW_CRITERIA.findIndex((item) => item === score.criterion);
      if (criterionIndex >= 0) next[criterionIndex] = score.rating;
    });
    return next;
  });
  const [strength, setStrength] = useState(review.strength);
  const [improvement, setImprovement] = useState(review.improvement);
  const [impression, setImpression] = useState(review.impression);
  const [recommendation, setRecommendation] = useState(review.recommendation);
  const avg = useMemo(() => {
    const values = Object.values(scores);
    return values.length ? (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1) : '0.0';
  }, [scores]);
  const complete = Object.keys(scores).length === INTERNSHIP_REVIEW_CRITERIA.length && strength && improvement && impression && recommendation;
  const payload = () => ({
    scores: INTERNSHIP_REVIEW_CRITERIA.map((criterion, index) => ({ criterion, rating: scores[index] as InternshipRating })),
    strength,
    improvement,
    impression,
    recommendation: recommendation as InternshipRecommendation,
  });
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 rounded-[16px] border border-[#DBEAFE] bg-[#EFF6FF] p-4 text-[13px] text-[#1E40AF]">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p className="m-0">Complete every criterion before submission. Approvers cannot edit these ratings.</p>
        <span className="rounded-full bg-white px-3 py-1 text-[12px] font-bold">{internshipScoreOutOf100(Number(avg))}% / 100</span>
      </div>
      {review.instructions ? (
        <div className="rounded-[16px] border border-[#E2E8F0] bg-white p-4 text-[13px] text-[#475569]">
          <p className="m-0 text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">HR instructions</p>
          <p className="m-0 mt-1">{review.instructions}</p>
        </div>
      ) : null}
      <EssCard className="overflow-hidden">
        <div className="border-b border-[#E2E8F0] px-4 py-3">
          <h3 className="m-0 text-sm font-bold">Performance assessment</h3>
          <p className="m-0 text-[12px] text-[#64748B]">{Object.keys(scores).length}/{INTERNSHIP_REVIEW_CRITERIA.length} rated</p>
        </div>
        <div className="space-y-2 p-4">
          {INTERNSHIP_REVIEW_CRITERIA.map((criterion, index) => (
            <div key={criterion} className="rounded-[14px] border border-[#E2E8F0] bg-white p-3">
              <p className="m-0 text-[13px] font-semibold text-[#0F172A]"><span className="mr-2 text-[#94A3B8]">{String(index + 1).padStart(2, '0')}</span>{criterion}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {[5, 4, 3, 2, 1].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setScores({ ...scores, [index]: value })}
                    className={`rounded-full border px-3 py-1.5 text-[11px] font-bold ${scores[index] === value ? 'border-[#2563EB] bg-[#2563EB] text-white' : 'border-[#E2E8F0] bg-white text-[#475569]'}`}
                  >
                    {INTERNSHIP_RATING_LABELS[value]} ({value})
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </EssCard>
      <EssCard className="space-y-3 p-4">
        <label className="block text-[12px] font-bold text-[#334155]">Key strengths *
          <textarea className="mt-1 w-full rounded-[12px] border border-[#E2E8F0] p-3 text-[13px]" value={strength} onChange={(event) => setStrength(event.target.value)} />
        </label>
        <label className="block text-[12px] font-bold text-[#334155]">Areas for improvement *
          <textarea className="mt-1 w-full rounded-[12px] border border-[#E2E8F0] p-3 text-[13px]" value={improvement} onChange={(event) => setImprovement(event.target.value)} />
        </label>
        <label className="block text-[12px] font-bold text-[#334155]">Overall impression *
          <textarea className="mt-1 w-full rounded-[12px] border border-[#E2E8F0] p-3 text-[13px]" value={impression} onChange={(event) => setImpression(event.target.value)} />
        </label>
        <label className="block text-[12px] font-bold text-[#334155]">Recommend for trainee placement? *
          <select className="mt-1 h-11 w-full rounded-[12px] border border-[#E2E8F0] px-3 text-[13px]" value={recommendation} onChange={(event) => setRecommendation(event.target.value as InternshipRecommendation)}>
            <option value="">Select recommendation</option>
            <option>Yes</option>
            <option>No</option>
            <option>Extend internship</option>
          </select>
        </label>
      </EssCard>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" disabled={saving} onClick={() => void onAction('save-evaluation', payload(), review.id)} className="inline-flex h-11 items-center gap-2 rounded-[14px] border border-[#E2E8F0] bg-white px-4 text-[13px] font-semibold text-[#475569]">
          <Save className="h-4 w-4" />Save draft
        </button>
        <button
          type="button"
          disabled={!complete || saving}
          onClick={() => void onAction('submit-evaluation', payload(), review.id).then(() => onDone())}
          className="inline-flex h-11 items-center gap-2 rounded-[14px] bg-[#2563EB] px-5 text-[13px] font-semibold text-white disabled:opacity-40"
        >
          <Send className="h-4 w-4" />Submit evaluation
        </button>
      </div>
    </div>
  );
}

function ApproveForm({
  review,
  saving,
  onAction,
  onDone,
}: {
  review: InternshipReview;
  saving: boolean;
  onAction: (action: string, payload?: Record<string, unknown>, id?: string) => Promise<void>;
  onDone: () => void;
}) {
  const [comment, setComment] = useState('');
  return (
    <div className="space-y-4">
      <DetailReadOnly review={review} />
      <EssCard className="p-4">
        <h3 className="m-0 text-sm font-bold text-[#0F172A]">Your decision</h3>
        <p className="mt-1 text-[12px] text-[#64748B]">Comments are retained in the audit trail. Returning unlocks the line manager evaluation in ESS.</p>
        <textarea className="mt-3 w-full rounded-[12px] border border-[#E2E8F0] p-3 text-[13px]" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add decision comments or return instructions..." />
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={!comment || saving} onClick={() => void onAction('return', { comment }, review.id).then(() => onDone())} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-[14px] border border-red-200 bg-red-50 px-4 text-[13px] font-semibold text-red-700 disabled:opacity-40">
            <CornerDownLeft className="h-4 w-4" />Return for correction
          </button>
          <button type="button" disabled={saving} onClick={() => void onAction('approve', { comment }, review.id).then(() => onDone())} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-[14px] bg-[#059669] px-4 text-[13px] font-semibold text-white">
            <CheckCircle2 className="h-4 w-4" />Approve &amp; route onward
          </button>
        </div>
      </EssCard>
    </div>
  );
}

function DetailReadOnly({ review }: { review: InternshipReview }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Intern', `${review.employee.name} (${review.employee.code})`],
          ['Department', review.employee.department],
          ['Due', formatDay(review.dueDate)],
          ['Score', review.overall ? formatInternshipOverallScore(review.overall) : 'Pending'],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[14px] border border-[#E2E8F0] bg-white p-3">
            <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-[#94A3B8]">{label}</p>
            <p className="m-0 mt-1 text-[13px] font-bold text-[#0F172A]">{value}</p>
          </div>
        ))}
      </div>
      <EssCard className="p-4">
        <h3 className="m-0 text-sm font-bold">Recommendation</h3>
        <div className="mt-3 grid gap-3 text-[13px] text-[#475569]">
          <p className="m-0"><b>Strength:</b> {review.strength || 'Awaiting evaluation.'}</p>
          <p className="m-0"><b>Improvement:</b> {review.improvement || 'Awaiting evaluation.'}</p>
          <p className="m-0"><b>Impression:</b> {review.impression || 'Awaiting evaluation.'}</p>
          <p className="m-0"><b>Placement:</b> {review.recommendation || 'Pending'}</p>
        </div>
      </EssCard>
      {review.scores.length ? (
        <EssCard className="p-4">
          <h3 className="m-0 mb-3 text-sm font-bold">Submitted ratings</h3>
          <div className="grid gap-2">
            {review.scores.map((score) => (
              <div key={score.criterion} className="flex justify-between gap-3 text-[13px]">
                <span className="text-[#475569]">{score.criterion}</span>
                <b>{score.rating}/5</b>
              </div>
            ))}
          </div>
        </EssCard>
      ) : (
        <EssEmptyState icon={FileText} title="Evaluation not submitted yet" description="The line manager still needs to complete the assigned assessment." />
      )}
    </div>
  );
}
