import assert from 'node:assert/strict';
import type { DleEmployeeDirectoryRow } from '../apps/dashboard/lib/dle-enterprise-db';
import {
  employeeRequestMatches,
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

console.log('Leave approver routing checks passed.');
