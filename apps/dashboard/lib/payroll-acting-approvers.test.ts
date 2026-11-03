/**
 * Run: npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/lib/payroll-acting-approvers.test.ts
 */
import assert from 'node:assert/strict';
import { findNamedHrManager, isNamedHrManagerIdentity } from './payroll-acting-approvers.ts';

assert.equal(isNamedHrManagerIdentity({ employeeCode: 'P0468', fullName: 'Mr. BANKOLE OMOLOLU' }), true);
assert.equal(isNamedHrManagerIdentity({ employeeCode: '0468' }), true);
assert.equal(isNamedHrManagerIdentity({ fullName: 'Mr BANKOLE OMOLOLU' }), true);
assert.equal(isNamedHrManagerIdentity({ employeeCode: 'P0467', fullName: 'Mr. ADESHINA ADESEGUN FAWAZ' }), false);

const chosen = findNamedHrManager([
  { employeeCode: 'P0467', fullName: 'Mr. ADESHINA ADESEGUN FAWAZ', status: 'Active' },
  { employeeCode: 'P0432', fullName: 'Ms. BADETAN VICTORIA OLAMIDE', status: 'Active', jobTitle: 'HR MANAGER' },
  { employeeCode: 'P0468', fullName: 'Mr. BANKOLE OMOLOLU', status: 'Active' },
]);
assert.equal(chosen?.employeeCode, 'P0468');

console.log('payroll-acting-approvers.test.ts passed');
