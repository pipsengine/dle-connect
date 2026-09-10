import assert from 'node:assert/strict';
import type { DleEmployeeDirectoryRow } from '../apps/dashboard/lib/dle-enterprise-db';
import {
  employeeRequestMatches,
  isLeaveHrActor,
  pendingLeaveApprovalsForActor,
  resolveLineManagerForEmployee,
  type EssLeaveRequest,
} from '../apps/dashboard/lib/leave-workflow-service';

const p0146: DleEmployeeDirectoryRow = {
  employeeId: 'P0146',
  employeeCode: 'P0146',
  fullName: 'Mr CHRISTIAN ONUWABHAGBE OGBAISI',
  department: 'INFORMATION TECHNOLOGY',
  jobTitle: 'PJT04 - AG. IT MANAGER',
  status: 'Active',
  employmentType: 'Permanent',
};

const nysc0032: DleEmployeeDirectoryRow = {
  employeeId: 'NYSC0032 - Mr KAYODE OGBETAH',
  employeeCode: 'NYSC0032',
  fullName: 'Mr KAYODE OGBETAH',
  department: 'INFORMATION TECHNOLOGY',
  jobTitle: 'NYSC - NATIONAL YOUTH SERVICE CORPS',
  status: 'Active',
  employmentType: 'NYSC',
  managerName: 'P0146 - Mr CHRISTIAN ONUWABHAGBE OGBAISI',
};

const employees = [p0146, nysc0032];

const manager = resolveLineManagerForEmployee(nysc0032, employees);
assert.ok(manager, 'NYSC0032 should resolve a line manager');
assert.equal(manager?.employee.employeeCode, 'P0146', 'IT department NYSC staff should route to P0146');
assert.equal(manager?.source, 'reporting-manager', 'Reporting manager field should drive leave routing');

assert.equal(
  employeeRequestMatches(nysc0032, 'NYSC0032'),
  true,
  'Composite and short employee IDs should match NYSC0032',
);
assert.equal(
  employeeRequestMatches(nysc0032, 'NYSC0032 - Mr KAYODE OGBETAH'),
  true,
  'Full employee label should match NYSC0032',
);

const pendingRequest: EssLeaveRequest = {
  id: 'ess-nysc0032-test',
  employeeId: 'NYSC0032',
  category: 'Leave Application',
  title: 'Annual Leave',
  status: 'Line Manager Review',
  priority: 'Normal',
  submittedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  approvers: ['Mr CHRISTIAN ONUWABHAGBE OGBAISI', 'HR Manager / Head'],
  comments: [],
  leaveType: 'Annual Leave',
  startDate: '2026-08-01',
  endDate: '2026-08-05',
  days: 5,
  lineManagerEmployeeId: 'P0146',
  lineManagerName: p0146.fullName,
};

const approvals = pendingLeaveApprovalsForActor(
  p0146,
  [pendingRequest],
  employees,
  ['Super Administrator'],
  false,
);
assert.equal(approvals.length, 1, 'P0146 should see NYSC0032 pending leave in approval queue');
assert.equal(approvals[0]?.approverKind, 'line-manager');

const p0442: DleEmployeeDirectoryRow = {
  employeeId: 'P0442',
  employeeCode: 'P0442',
  fullName: 'Mrs TEMITOPE ABIODUN ODULATE',
  department: 'CORPORATE OFFICE',
  jobTitle: 'GMO - GENERAL MANAGER, OPERATIONS',
  status: 'Active',
  employmentType: 'Permanent',
};
const p0442Report: DleEmployeeDirectoryRow = {
  employeeId: 'C9999',
  employeeCode: 'C9999',
  fullName: 'Test Report',
  department: 'OPERATIONS',
  jobTitle: 'Supervisor',
  status: 'Active',
  employmentType: 'Contract',
  managerName: '0442 - Mrs TEMITOPE ABIODUN ODULATE',
};
const p0442Request: EssLeaveRequest = {
  ...pendingRequest,
  id: 'ess-p0442-report',
  employeeId: 'C9999',
  lineManagerEmployeeId: '0442',
  lineManagerName: '0442 - Mrs TEMITOPE ABIODUN ODULATE',
};
const p0442Queue = pendingLeaveApprovalsForActor(
  p0442,
  [p0442Request],
  [p0442, p0442Report],
  ['Manager'],
  false,
);
assert.equal(approvals.length, 1, 'P0146 queue still has one item');
assert.equal(p0442Queue.length, 1, 'P0442 should see leave when the request stores unpadded 0442');
assert.equal(p0442Queue[0]?.approverKind, 'line-manager');

const hrManager: DleEmployeeDirectoryRow = {
  employeeId: 'P0432',
  employeeCode: 'P0432',
  fullName: 'Ms OLAMIDE VICTORIA BADETAN',
  department: 'HUMAN RESOURCES',
  jobTitle: 'HR MANAGER',
  designation: 'HR MANAGER',
  status: 'Active',
  employmentType: 'Permanent',
};
const hrReviewRequest: EssLeaveRequest = {
  ...pendingRequest,
  id: 'ess-hr-review',
  status: 'HR Review',
};
assert.equal(isLeaveHrActor(['HR Administrator'], 'HR MANAGER'), true);
assert.equal(isLeaveHrActor(['Manager'], 'HR MANAGER'), true);
assert.equal(isLeaveHrActor(['Manager'], 'HRA - HR ASSISTANT'), false);
const hrQueueByRole = pendingLeaveApprovalsForActor(hrManager, [hrReviewRequest], employees, ['HR Administrator'], false);
const hrQueueByTitle = pendingLeaveApprovalsForActor(hrManager, [hrReviewRequest], employees, ['Manager'], false);
assert.equal(hrQueueByRole.length, 1, 'HR Administrator role should see HR Review queue');
assert.equal(hrQueueByTitle.length, 1, 'Job title HR MANAGER should see HR Review queue');
assert.equal(hrQueueByRole[0]?.approverKind, 'hr');

const missingRequesterRequest: EssLeaveRequest = {
  ...hrReviewRequest,
  id: 'ess-missing-requester',
  employeeId: 'UNKNOWN-EMP',
};
const hrQueueMissingRequester = pendingLeaveApprovalsForActor(hrManager, [missingRequesterRequest], employees, ['HR Administrator'], false);
assert.equal(hrQueueMissingRequester.length, 1, 'HR Review items must still appear when the requester is not in the directory');

console.log('Leave approver routing checks passed.');
