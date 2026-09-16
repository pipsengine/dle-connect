/**
 * Internship review workflow: HOD skip, return, and MD final approval.
 * Run: npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/lib/internship-performance-review-workflow.test.ts
 */
import assert from 'node:assert/strict';
import { internshipAverage, internshipEvaluationLocked, internshipNextStatus } from './internship-performance-review-workflow.ts';
import type { InternshipReview } from './internship-performance-review-types.ts';
import { INTERNSHIP_REVIEW_CRITERIA } from './internship-performance-review-constants.ts';

const review = {
  status: 'In Evaluation',
  approvals: [
    { step: 'Line Manager Evaluation', approver: 'Chris', role: 'LINE_MANAGER', status: 'Pending' },
    { step: 'HOD / Functional Manager', approver: '', role: 'HOD', status: 'Skipped', comment: 'No HOD configured' },
    { step: 'HR Manager Review', approver: 'HR Manager', role: 'HR_MANAGER', status: 'Pending' },
    { step: 'MD Final Approval', approver: 'Managing Director', role: 'MD', status: 'Pending' },
  ],
} as InternshipReview;

assert.equal(internshipNextStatus(review, 'LINE_MANAGER', 'approve'), 'Pending HR Manager');
assert.equal(internshipNextStatus(review, 'LINE_MANAGER', 'return'), 'Returned');
assert.equal(internshipNextStatus(review, 'HR_MANAGER', 'approve'), 'Pending MD');
assert.equal(internshipNextStatus(review, 'MD', 'approve'), 'Approved');
assert.equal(internshipEvaluationLocked('Pending MD'), true);
assert.equal(internshipEvaluationLocked('Returned'), false);
assert.equal(INTERNSHIP_REVIEW_CRITERIA.length, 11);
assert.equal(internshipAverage([5, 4, 4]), 4.3);

console.log('internship-performance-review-workflow.test.ts ok');
