import assert from 'node:assert/strict';
import { leavePortalUrl } from '../apps/dashboard/lib/leave-email-action-token';
import { isConfirmedPermanent } from '../apps/dashboard/lib/leave-management-store';
import { resolvePublicAppOrigin, normalizePublicHref } from '../apps/dashboard/lib/public-app-url';
import {
  approvalStatusForEss,
  isLeaveEssRequest,
  isPendingLeaveStatus,
  workflowStageForEssStatus,
} from '../apps/dashboard/lib/leave-request-shared';

const leaveApplication = {
  category: 'Leave Application',
  startDate: '2026-07-10',
  endDate: '2026-07-15',
  status: 'Line Manager Review',
};

const legacyLeave = {
  category: 'Leave',
  startDate: '2026-07-10',
  endDate: '2026-07-15',
  status: 'HR Review',
};

assert.equal(isLeaveEssRequest(leaveApplication), true, 'Leave Application category should match');
assert.equal(isLeaveEssRequest(legacyLeave), true, 'Legacy Leave category should match');
assert.equal(isLeaveEssRequest({ category: 'Travel', startDate: '2026-07-10', endDate: '2026-07-15' }), false);
assert.equal(isLeaveEssRequest({ category: 'Leave Application', startDate: '', endDate: '2026-07-15' }), false);

assert.equal(isPendingLeaveStatus('Line Manager Review'), true);
assert.equal(isPendingLeaveStatus('Approved'), false);
assert.equal(isPendingLeaveStatus('Rejected'), false);

assert.equal(workflowStageForEssStatus('Line Manager Review', 'Under Review'), 'Supervisor');
assert.equal(workflowStageForEssStatus('HR Review', 'Under Review'), 'HR');
assert.equal(workflowStageForEssStatus('Approved', 'Approved'), 'Final Approval');

assert.equal(approvalStatusForEss('Under Review', 'Line Manager Review'), 'Awaiting Line Manager');
assert.equal(approvalStatusForEss('Under Review', 'HR Review'), 'Awaiting HR');
assert.equal(approvalStatusForEss('Approved', 'Approved'), 'Approved');

const pendingCount = [leaveApplication, legacyLeave, { ...leaveApplication, status: 'Approved' }]
  .filter((item) => isLeaveEssRequest(item) && isPendingLeaveStatus(item.status))
  .length;
assert.equal(pendingCount, 2, 'Pending leave count should include both active requests');

assert.equal(isConfirmedPermanent({
  status: 'Active',
  employmentType: 'Permanent',
  employeeCategory: 'Permanent',
  yearsOfService: 3,
  dateJoined: '2020-01-15',
}), true, 'Active permanent employee with service history should be confirmed');

assert.equal(isConfirmedPermanent({
  status: 'Probation',
  employmentType: 'Permanent',
  employeeCategory: 'Permanent',
  confirmationDueDate: '2026-12-01',
}), false, 'Probation employees awaiting confirmation should not be confirmed');

assert.equal(isConfirmedPermanent({
  status: 'Active',
  employmentType: 'Permanent',
  employeeCategory: 'Permanent',
  confirmationDueDate: '2024-06-01',
}), true, 'Active employee with past confirmation due date should be confirmed');

assert.equal(resolvePublicAppOrigin('http://0.0.0.0:3020'), 'http://localhost:3020', '0.0.0.0 should normalize to localhost');
assert.equal(
  leavePortalUrl('http://0.0.0.0:3020'),
  'http://localhost:3020/workforce-portal?tab=leave',
  'Leave portal links should not use 0.0.0.0',
);

assert.equal(
  normalizePublicHref('http://0.0.0.0:3020/workforce-portal?tab=leave'),
  'http://localhost:3020/workforce-portal?tab=leave',
  'Absolute hrefs should normalize 0.0.0.0 to localhost',
);

console.log('verify-leave-workflow: all checks passed');
