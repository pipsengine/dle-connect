import type { InternshipApproval, InternshipReview, InternshipReviewStatus } from '@/lib/internship-performance-review-types';

type InternshipActor = {
  fullName?: string;
  username?: string;
  employeeCode?: string;
  employeeId?: string;
  roles?: string[];
  isGlobalAdmin?: boolean;
};

const compact = (value: unknown) => String(value || '').trim();
const normalizeKey = (value: unknown) => compact(value).toUpperCase();

export function internshipNextStatus(
  review: InternshipReview,
  step: string,
  decision: 'approve' | 'return',
): InternshipReviewStatus {
  if (decision === 'return') return 'Returned';
  if (step === 'LINE_MANAGER') {
    const hod = review.approvals.find((item) => item.role === 'HOD');
    return hod && hod.status !== 'Skipped' ? 'Pending HOD' : 'Pending HR Manager';
  }
  if (step === 'HOD') return 'Pending HR Manager';
  if (step === 'HR_MANAGER') return 'Pending MD';
  if (step === 'MD') return 'Approved';
  return review.status;
}

export function internshipAverage(values: number[]) {
  return values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : 0;
}

/** Convert a 5-point overall rating to a 0–100 score. */
export function internshipScoreOutOf100(overall?: number | null) {
  const value = Number(overall || 0);
  if (!(value > 0)) return 0;
  return Math.round((value / 5) * 100);
}

export function formatInternshipOverallScore(overall?: number | null, empty = 'Pending') {
  const pct = internshipScoreOutOf100(overall);
  return pct > 0 ? `${pct}% / 100` : empty;
}

export function internshipEvaluationLocked(status: InternshipReviewStatus) {
  return !['Draft', 'Assigned', 'In Evaluation', 'Returned'].includes(status);
}

export function internshipCurrentApprovalStep(review: InternshipReview) {
  if (review.status === 'In Evaluation' || review.status === 'Assigned' || review.status === 'Returned' || review.status === 'Draft') {
    return review.approvals.find((item) => item.role === 'LINE_MANAGER') || null;
  }
  if (review.status === 'Pending HOD') return review.approvals.find((item) => item.role === 'HOD') || null;
  if (review.status === 'Pending HR Manager') return review.approvals.find((item) => item.role === 'HR_MANAGER') || null;
  if (review.status === 'Pending MD') return review.approvals.find((item) => item.role === 'MD') || null;
  return null;
}

export const internshipActorKeys = (actor: InternshipActor) =>
  new Set(
    [actor.employeeCode, actor.employeeId, actor.username, actor.fullName]
      .map(normalizeKey)
      .filter(Boolean),
  );

export const internshipIsHrManagerActor = (actor: InternshipActor) => {
  const roles = (actor.roles || []).join(' ');
  return /HR Manager|HR Director|Head of HR|Head of Human Resource/i.test(roles);
};

export const internshipIsMdActor = (actor: InternshipActor) => {
  const code = normalizeKey(actor.employeeCode || actor.employeeId || actor.username);
  if (code === 'P0413' || code === '0413' || code.replace(/^P/, '') === '0413') return true;
  if (/\bIJELI\b/i.test(compact(actor.fullName))) return true;
  const roles = (actor.roles || []).join(' ');
  return /Managing Director|Chief Executive|MD\s*[\/-]\s*CEO/i.test(roles);
};

const namesOverlap = (left: string, right: string) => {
  const a = compact(left).toLowerCase();
  const b = compact(right).toLowerCase();
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
};

export const internshipApprovalMatchesActor = (approval: InternshipApproval | null | undefined, actor: InternshipActor) => {
  if (!approval) return false;
  const keys = internshipActorKeys(actor);
  if (approval.approverCode && keys.has(normalizeKey(approval.approverCode))) return true;
  if (approval.approver && (keys.has(normalizeKey(approval.approver)) || namesOverlap(approval.approver, actor.fullName || ''))) return true;
  if (approval.role === 'HR_MANAGER' && internshipIsHrManagerActor(actor)) return true;
  if (approval.role === 'MD' && internshipIsMdActor(actor)) return true;
  return false;
};

export const internshipTasksForSession = (reviews: InternshipReview[], actor: InternshipActor) => {
  const keys = internshipActorKeys(actor);
  return reviews.filter((review) => {
    if (['Approved', 'HR Action', 'Closed'].includes(review.status)) return false;
    const step = internshipCurrentApprovalStep(review);
    if (!step || step.role === 'HR') return false;
    if (internshipApprovalMatchesActor(step, actor)) return true;
    if (['In Evaluation', 'Returned', 'Assigned'].includes(review.status)) {
      if (review.supervisorCode && keys.has(normalizeKey(review.supervisorCode))) return true;
      if (review.employee.lineManagerCode && keys.has(normalizeKey(review.employee.lineManagerCode))) return true;
      if (namesOverlap(review.supervisor, actor.fullName || '')) return true;
    }
    return false;
  });
};

export const internshipActorInvolved = (review: InternshipReview, actor: InternshipActor) => {
  const keys = internshipActorKeys(actor);
  if (review.supervisorCode && keys.has(normalizeKey(review.supervisorCode))) return true;
  if (review.employee.lineManagerCode && keys.has(normalizeKey(review.employee.lineManagerCode))) return true;
  if (review.employee.hodCode && keys.has(normalizeKey(review.employee.hodCode))) return true;
  if (namesOverlap(review.supervisor, actor.fullName || '')) return true;
  return review.approvals.some((item) => internshipApprovalMatchesActor(item, actor));
};

export const internshipCanEvaluate = (review: InternshipReview, actor: InternshipActor) => {
  if (internshipEvaluationLocked(review.status)) return false;
  const step = internshipCurrentApprovalStep(review);
  if (!step || step.role !== 'LINE_MANAGER') return false;
  return internshipApprovalMatchesActor(step, actor)
    || Boolean(review.supervisorCode && internshipActorKeys(actor).has(normalizeKey(review.supervisorCode)))
    || namesOverlap(review.supervisor, actor.fullName || '');
};

export const internshipCanApprove = (review: InternshipReview, actor: InternshipActor) => {
  const step = internshipCurrentApprovalStep(review);
  if (!step || step.role === 'LINE_MANAGER' || step.role === 'HR') return false;
  return internshipApprovalMatchesActor(step, actor);
};
