/**
 * Run: npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/lib/finance-intelligence/approval-gm-once.test.ts
 */
import assert from 'node:assert/strict';
import { applyGmStageLayout, isGmEmployee } from './approval-matrix-service';
import { employeeMatchKeys, matchesEmployeeKeys, isCountableLeaveAllowanceEvent } from '../leave-allowance-policy';

const projectChain = ['Reporting Manager', 'Project Manager', 'Cost Controller', 'Finance Manager', 'GM', 'CFO'];

assert.deepEqual(
  applyGmStageLayout(projectChain, true),
  ['Project Manager', 'Cost Controller', 'Finance Manager', 'GM', 'CFO'],
  'GM line manager must approve once, last before CFO',
);

assert.deepEqual(
  applyGmStageLayout(projectChain, false),
  projectChain,
  'when GM is not the line manager the full chain stays',
);

assert.deepEqual(
  applyGmStageLayout(['Reporting Manager', 'Project Manager', 'Cost Controller', 'Finance Manager'], true),
  ['Reporting Manager', 'Project Manager', 'Cost Controller', 'Finance Manager'],
  'low band without a GM stage keeps the single Reporting Manager approval',
);

assert.equal(isGmEmployee({ jobTitle: 'General Manager' }), true);
assert.equal(isGmEmployee({ jobTitle: 'GM' }), true);
assert.equal(isGmEmployee({ jobTitle: 'PA to GM' }), false);
assert.equal(isGmEmployee({ jobTitle: 'Project Manager' }), false);

assert.ok(employeeMatchKeys('P0272', 'P0272').includes('272'));
assert.equal(matchesEmployeeKeys('P0272 - Mr AUSTIN EROMETSE EREMOGAMHE', employeeMatchKeys('P0272')), true);

assert.equal(
  isCountableLeaveAllowanceEvent({
    code: 'LEAVEALLOW',
    amount: 100,
    status: 'Paid',
    audit: [{ action: 'Reversed ineligible leave allowance', note: 'Only 0 approved annual leave day(s)' }],
  }),
  false,
);

console.log('approval-gm-once.test.ts passed');
