import assert from 'node:assert/strict';
import { displayStatus, frontDeskDeadlineAlert, isOverdue, nextOfficeReference, nextReferenceNo, percentChange, unfinishedDepartmentRoutes } from './front-desk-format.ts';
import type { Correspondence } from './front-desk-types.ts';

const item = (overrides: Partial<Correspondence>): Correspondence => ({
  id: 'cor-1',
  referenceNo: 'COR-2026-0001',
  dateReceived: '2026-10-01',
  description: 'Demand letter',
  senderCompany: 'Court',
  direction: 'Incoming',
  subject: 'Demand letter',
  senderCategory: 'Government / Regulators',
  addressedTo: 'The Managing Director',
  department: "MD's Office",
  type: 'Letter',
  copies: 1,
  priority: 'Medium',
  attachments: [],
  recipients: [],
  history: [],
  status: 'Open',
  workflowStatus: 'New',
  createdAt: '2026-10-01T00:00:00.000Z',
  ...overrides,
});

assert.equal(nextReferenceNo([], '2026-10-16'), 'COR-2026-0001');
assert.equal(nextReferenceNo(['COR-2026-0007', 'COR-2025-0099'], '2026-10-16'), 'COR-2026-0008');
assert.equal(isOverdue(item({ dueDate: '2026-10-15' }), '2026-10-16'), true);
assert.equal(isOverdue(item({ dueDate: '2026-10-20' }), '2026-10-16'), false);
assert.equal(isOverdue(item({ dateReceived: '2026-10-01' }), '2026-10-16'), true);
assert.equal(isOverdue(item({ status: 'Closed', workflowStatus: 'Closed', dateClosed: '2026-10-02', dueDate: '2026-10-01' }), '2026-10-16'), false);
assert.equal(displayStatus(item({ dueDate: '2026-10-01' }), '2026-10-16'), 'Overdue');
assert.equal(displayStatus(item({ workflowStatus: 'Assigned', assignedEmployeeCode: 'P0001' }), '2026-10-16'), 'Assigned');
assert.equal(displayStatus(item({ status: 'Closed', workflowStatus: 'Closed' }), '2026-10-16'), 'Closed');
assert.equal(nextOfficeReference([], 'Incoming', '2026-10-16'), 'DLE/IN/2026/000001');
assert.equal(nextOfficeReference(['DLE/OUT/2026/000004'], 'Outgoing', '2026-10-16'), 'DLE/OUT/2026/000005');
assert.deepEqual(
  unfinishedDepartmentRoutes([
    { department: 'LEGAL', status: 'Completed' },
    { department: 'FINANCE AND ACCOUNT', status: 'Pending' },
    { department: 'HUMAN RESOURCES', status: 'Waived' },
  ]).map((route) => route.department),
  ['FINANCE AND ACCOUNT'],
);
assert.equal(unfinishedDepartmentRoutes([]).length, 0);
assert.equal(percentChange(12, 10), 20);
assert.equal(percentChange(0, 0), 0);
const at = (hour: number) => new Date(2026, 9, 20, hour, 15, 0);
assert.equal(frontDeskDeadlineAlert('2026-10-30', at(9))?.key, 'd10');
assert.equal(frontDeskDeadlineAlert('2026-10-25', at(9))?.key, 'd5');
assert.equal(frontDeskDeadlineAlert('2026-10-20', at(7))?.key, undefined);
assert.equal(frontDeskDeadlineAlert('2026-10-20', at(8))?.key, 'due-1');
assert.equal(frontDeskDeadlineAlert('2026-10-20', at(12))?.key, 'due-2');
assert.equal(frontDeskDeadlineAlert('2026-10-20', at(16))?.key, 'due-3');
assert.equal(frontDeskDeadlineAlert('2026-10-20', at(20)), null);
assert.equal(frontDeskDeadlineAlert('2026-10-19', at(10)), null);

console.log('front desk format checks passed');
