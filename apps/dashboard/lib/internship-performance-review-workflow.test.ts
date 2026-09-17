/**
 * Internship review workflow: HOD skip, return, and MD final approval.
 * Run: npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/lib/internship-performance-review-workflow.test.ts
 */
import assert from 'node:assert/strict';
import { internshipAverage, internshipCanApprove, internshipCanEvaluate, internshipEvaluationLocked, internshipNextStatus, internshipScoreOutOf100, internshipTasksForSession, formatInternshipOverallScore } from './internship-performance-review-workflow.ts';
import type { InternshipReview } from './internship-performance-review-types.ts';
import { INTERNSHIP_REVIEW_CRITERIA, compareEmployeeCodesSerial } from './internship-performance-review-constants.ts';

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
assert.equal(internshipScoreOutOf100(4.7), 94);
assert.equal(formatInternshipOverallScore(4.7), '94% / 100');
assert.equal(formatInternshipOverallScore(0), 'Pending');

assert.ok(compareEmployeeCodesSerial('IT1', 'IT10') < 0);
assert.ok(compareEmployeeCodesSerial('NYSC0002', 'NYSC0010') < 0);
assert.deepEqual(['IT10', 'IT2', 'IT1'].sort(compareEmployeeCodesSerial), ['IT1', 'IT2', 'IT10']);

const liveReview = {
  ...review,
  employee: { code: 'IT0001', name: 'Intern One', department: 'IT', jobTitle: 'Intern', email: '', internshipStart: '2025-01-01', lineManager: 'Chris Ogbaisi', lineManagerCode: 'P100' },
  supervisor: 'Chris Ogbaisi',
  supervisorCode: 'P100',
} as InternshipReview;

assert.equal(internshipCanEvaluate(liveReview, { fullName: 'Chris Ogbaisi', employeeCode: 'P100' }), true);
assert.equal(internshipCanEvaluate(liveReview, { fullName: 'Someone Else', employeeCode: 'P999' }), false);
assert.equal(internshipTasksForSession([liveReview], { fullName: 'Chris Ogbaisi', employeeCode: 'P100' }).length, 1);

const hodReview = {
  ...liveReview,
  status: 'Pending HOD',
  approvals: [
    { step: 'Line Manager Evaluation', approver: 'Chris', approverCode: 'P100', role: 'LINE_MANAGER', status: 'Approved' },
    { step: 'HOD / Functional Manager', approver: 'Head IT', approverCode: 'P200', role: 'HOD', status: 'Pending' },
    { step: 'HR Manager Review', approver: 'HR Manager', role: 'HR_MANAGER', status: 'Pending' },
    { step: 'MD Final Approval', approver: 'Managing Director', role: 'MD', status: 'Pending' },
  ],
} as InternshipReview;
assert.equal(internshipCanApprove(hodReview, { fullName: 'Head IT', employeeCode: 'P200' }), true);
assert.equal(internshipCanApprove(hodReview, { fullName: 'Chris Ogbaisi', employeeCode: 'P100' }), false);
assert.equal(internshipCanApprove({ ...hodReview, status: 'Pending HR Manager' }, { roles: ['HR Manager'] }), true);
assert.equal(internshipCanApprove({ ...hodReview, status: 'Pending MD' }, { roles: ['Managing Director'] }), true);
assert.equal(internshipCanApprove({ ...hodReview, status: 'Pending MD' }, { employeeCode: 'P0413', fullName: 'Mr CHRIS IJELI' }), true);
assert.equal(internshipCanApprove({ ...hodReview, status: 'Pending MD' }, { employeeCode: 'L2374', fullName: 'SAMUEL GBEMISOLA AJAYI', roles: ['Employee'] }), false);

console.log('internship-performance-review-workflow.test.ts ok');
