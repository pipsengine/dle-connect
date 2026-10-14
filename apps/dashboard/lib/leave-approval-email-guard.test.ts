import assert from 'node:assert/strict';
import {
  leaveRequestStillNeedsLineManagerEmail,
  lineManagerApprovalAlreadyRecorded,
} from './leave-request-shared.ts';

const lineManagerCurrent = [
  { stage: 'Line Manager / Lead / Supervisor', status: 'Current' },
  { stage: 'HR Manager / Head', status: 'Pending' },
];
const lineManagerDone = [
  { stage: 'Line Manager / Lead / Supervisor', status: 'Completed' },
  { stage: 'HR Manager / Head', status: 'Current' },
];

assert.equal(leaveRequestStillNeedsLineManagerEmail({
  category: 'Leave Application',
  status: 'Line Manager Review',
  workflow: lineManagerCurrent,
  comments: [{ comment: 'Leave Application submitted from workforce portal.' }],
}), true);

assert.equal(leaveRequestStillNeedsLineManagerEmail({
  category: 'Leave Application',
  status: 'HR Review',
  workflow: lineManagerDone,
  comments: [{ comment: 'Line manager / supervisor approval completed. Routed to HR Manager / Head.' }],
}), false);

assert.equal(lineManagerApprovalAlreadyRecorded({
  status: 'Under Review',
  workflow: lineManagerDone,
  comments: [{ comment: 'Line manager / supervisor approval completed. Routed to HR Manager / Head.' }],
}), true);

assert.equal(leaveRequestStillNeedsLineManagerEmail({
  category: 'Leave Application',
  status: 'Line Manager Review',
  workflow: lineManagerCurrent,
  comments: [{ comment: 'Line manager email delivered to Mrs. AINA AJOKE OLAJUMOKE (aina@example.com) via graph.' }],
}), false);

assert.equal(leaveRequestStillNeedsLineManagerEmail({
  category: 'Leave Application',
  status: 'Approved',
  workflow: lineManagerDone,
}), false);

assert.equal(leaveRequestStillNeedsLineManagerEmail({
  category: 'Loan Application',
  status: 'Line Manager Review',
  workflow: lineManagerCurrent,
}), false);

assert.equal(leaveRequestStillNeedsLineManagerEmail({
  category: 'Leave Application',
  status: 'Submitted',
  comments: [],
}), true);

console.log('leave approval email guard tests passed');
