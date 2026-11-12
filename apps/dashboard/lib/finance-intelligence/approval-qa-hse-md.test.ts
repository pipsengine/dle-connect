/**
 * Run: npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/lib/finance-intelligence/approval-qa-hse-md.test.ts
 */
import assert from 'node:assert/strict';
import {
  departmentRequiresMdCeoLast,
  isQaOrHsePaymentDepartment,
  placeDepartmentMdCeoLast,
} from './approval-matrix-service';

const lowChain = ['Reporting Manager', 'Finance Manager'];
const midChain = ['Reporting Manager', 'Finance Manager', 'CFO'];
const projectChain = ['Reporting Manager', 'Project Manager', 'Cost Controller', 'Finance Manager', 'GM', 'CFO'];

for (const department of [
  'HEALTH AND SAFETY',
  'Health & Safety',
  'HSE',
  'QUALITY ASSURANCE CONTROL',
  'QUALITY CONTROL/ASSURANCE',
  'Quality Control / Assurance',
  'Quality Assurance',
  'Quality Control',
  'QA/QC',
]) {
  assert.equal(isQaOrHsePaymentDepartment(department), true, department);
  assert.equal(departmentRequiresMdCeoLast(department, 100000), false, `${department} at 100000`);
  assert.equal(departmentRequiresMdCeoLast(department, 100000.01), true, `${department} above 100000`);
}

for (const department of ['PROCUREMENT', 'HUMAN RESOURCES', 'ENGINEERING', 'QUALITY', 'SAFETY', '']) {
  assert.equal(isQaOrHsePaymentDepartment(department), false, department || '(blank)');
  assert.equal(departmentRequiresMdCeoLast(department, 250000), false, department || '(blank)');
}

assert.deepEqual(
  placeDepartmentMdCeoLast(lowChain, 'HEALTH AND SAFETY', 100000),
  lowChain,
  'HSE at exactly ₦100,000 keeps the normal chain',
);

assert.deepEqual(
  placeDepartmentMdCeoLast(lowChain, 'HEALTH AND SAFETY', 100000.01),
  ['Reporting Manager', 'Finance Manager', 'MD/CEO'],
  'HSE above ₦100,000 ends with MD/CEO',
);

assert.deepEqual(
  placeDepartmentMdCeoLast(midChain, 'QUALITY CONTROL/ASSURANCE', 450000),
  ['Reporting Manager', 'Finance Manager', 'CFO', 'MD/CEO'],
  'Quality Control/Assurance puts MD/CEO after CFO',
);

assert.deepEqual(
  placeDepartmentMdCeoLast(projectChain, 'QUALITY ASSURANCE CONTROL', 2000000),
  [...projectChain, 'MD/CEO'],
  'project QA payment below the ₦5m band still ends with MD/CEO',
);

assert.deepEqual(
  placeDepartmentMdCeoLast(
    ['Reporting Manager', 'MD/CEO', 'Finance Manager', 'CFO'],
    'HSE',
    150000,
  ),
  ['Reporting Manager', 'Finance Manager', 'CFO', 'MD/CEO'],
  'an earlier MD/CEO seat is moved to the end',
);

assert.deepEqual(
  placeDepartmentMdCeoLast(midChain, 'PROCUREMENT', 450000),
  midChain,
  'other departments are unchanged',
);

assert.deepEqual(
  placeDepartmentMdCeoLast(['Reporting Manager', 'Finance Manager', 'CFO', 'MD/CEO'], 'PROCUREMENT', 2000000),
  ['Reporting Manager', 'Finance Manager', 'CFO', 'MD/CEO'],
  'a high-band MD/CEO already on another department stays where it is',
);

console.log('approval-qa-hse-md.test.ts ok');
