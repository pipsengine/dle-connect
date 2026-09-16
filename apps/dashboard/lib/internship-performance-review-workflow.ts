import type { InternshipReview, InternshipReviewStatus } from '@/lib/internship-performance-review-types';

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
