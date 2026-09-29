import assert from 'node:assert/strict';
import {
  accountMatchesTelephoneIdentity,
  accountMatchesTelephoneRoles,
} from './telephone-allowance-recipients.ts';

const preparer = {
  employeeCode: 'P0146',
  username: 'P0146',
  fullName: 'Mr. CHRISTIAN ONUWABHAGBE OGBAISI',
  roles: ['Super Administrator'],
  permissions: ['*'],
  isGlobalAdmin: true,
  status: 'Active',
};

const olamide = {
  employeeCode: 'P0432',
  fullName: 'Ms. BADETAN VICTORIA OLAMIDE',
  roles: ['HR Manager'],
  permissions: ['telephone-allowance.hr-approve', 'telephone-allowance.hr-review'],
  status: 'Active',
};

const md = {
  employeeCode: 'P0413',
  fullName: 'Mr CHRIS IJELI',
  roles: ['Employee', 'Executive Director', 'Executive User', 'Manager'],
  permissions: ['telephone-allowance.md-approve'],
  status: 'Active',
};

const cfo = {
  employeeCode: 'CFO1',
  fullName: 'CFO User',
  roles: ['CFO'],
  permissions: ['telephone-allowance.cfo-authorize'],
  status: 'Active',
};

const finance = {
  employeeCode: 'FIN1',
  fullName: 'Finance Manager',
  roles: ['Finance Manager'],
  permissions: ['finance.view'],
  status: 'Active',
};

assert.equal(accountMatchesTelephoneRoles(preparer, ['IT', 'IT Admin', 'IT Support']), false);
assert.equal(accountMatchesTelephoneRoles(preparer, ['Super Administrator']), true);
assert.equal(accountMatchesTelephoneRoles(preparer, ['MD', 'CEO', 'Executive']), false);
assert.equal(accountMatchesTelephoneRoles(preparer, ['CFO']), false);
assert.equal(accountMatchesTelephoneRoles(olamide, ['HR Manager', 'HR Approver']), true);
assert.equal(accountMatchesTelephoneRoles(md, ['MD', 'CEO', 'Executive']), true);
assert.equal(accountMatchesTelephoneRoles(cfo, ['CFO']), true);
assert.equal(accountMatchesTelephoneRoles(finance, ['Treasury', 'Treasury Officer', 'Finance']), true);
assert.equal(accountMatchesTelephoneIdentity(preparer, 'P0146'), true);
assert.equal(accountMatchesTelephoneIdentity(preparer, 'Mr CHRISTIAN ONUWABHAGBE OGBAISI'), true);
assert.equal(accountMatchesTelephoneIdentity(olamide, 'P0146'), false);
