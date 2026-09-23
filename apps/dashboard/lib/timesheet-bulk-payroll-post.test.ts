/**
 * Run: npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/lib/timesheet-bulk-payroll-post.test.ts
 */
import assert from 'node:assert/strict';
import { planBulkPayrollPostEvents } from './timesheet-bulk-payroll-post.ts';

const submitted = planBulkPayrollPostEvents({
  id: 'h1',
  status: 'Submitted',
  hasHours: true,
  projectCodes: ['C1001', 'C1001'],
}, 'Payroll');

assert.ok(submitted);
assert.deepEqual(submitted.map((event) => `${event.stage}:${event.decision}`), [
  'Supervisor:Approved',
  'Project Manager:Approved',
  'Cost Control:Approved',
  'GM Operations:Submitted',
  'GM Operations:Approved',
  'HR:Acknowledged',
  'HR:Approved',
]);
assert.equal(submitted.filter((event) => event.stage === 'Project Manager').length, 1);
assert.match(submitted.find((event) => event.stage === 'Project Manager')!.comment, /\[PROJECT:C1001\]/);

const payrollReady = planBulkPayrollPostEvents({
  id: 'h2',
  status: 'HR_Acknowledged',
  hasHours: true,
  projectCodes: ['C1001'],
}, 'Payroll');
assert.ok(payrollReady);
assert.deepEqual(payrollReady.map((event) => `${event.stage}:${event.decision}`), ['HR:Approved']);

const emptyDraft = planBulkPayrollPostEvents({
  id: 'h3',
  status: 'Draft',
  hasHours: false,
  projectCodes: [],
}, 'Payroll');
assert.equal(emptyDraft, null);

const bookedDraft = planBulkPayrollPostEvents({
  id: 'h4',
  status: 'Draft',
  hasHours: true,
  projectCodes: [],
}, 'Payroll');
assert.ok(bookedDraft);
assert.equal(bookedDraft[0]?.decision, 'Submitted');
assert.equal(bookedDraft.at(-1)?.comment, 'Payroll posted and timesheet locked.');

const locked = planBulkPayrollPostEvents({
  id: 'h5',
  status: 'Locked',
  hasHours: true,
  projectCodes: ['C1001'],
}, 'Payroll');
assert.equal(locked, null);

console.log('timesheet-bulk-payroll-post.test.ts passed');
