/**
 * Run: npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/lib/employee-change-audit.test.ts
 */
import assert from 'node:assert/strict';
import { diffEmployeeAuditSnapshots } from './dle-enterprise-db';
import { auditActorFromSession } from './auth/request-actor';

const reactivated = diffEmployeeAuditSnapshots(
  { employment_status: 'Inactive', department: 'QAC', period_salary: 740511.56 },
  { employment_status: 'Active', department: 'QAC', period_salary: 740511.56 },
);
assert.equal(reactivated.changed, true);
assert.equal(reactivated.statusChanged, true);
assert.deepEqual(reactivated.oldValue, { employment_status: 'Inactive' });
assert.deepEqual(reactivated.newValue, { employment_status: 'Active' });
assert.equal(reactivated.summary, 'Employment status: Inactive → Active');

const resaveOnly = diffEmployeeAuditSnapshots(
  { employment_status: 'Active', date_joined: new Date('2022-09-01T00:00:00Z'), job_title: ' Inspector ' },
  { employment_status: 'Active', date_joined: new Date('2022-09-01T00:00:00Z'), job_title: 'Inspector' },
);
assert.equal(resaveOnly.changed, false, 'a save that changes nothing writes no audit entry');

const blanked = diffEmployeeAuditSnapshots({ account_number: '0106954271' }, { account_number: '' });
assert.equal(blanked.summary, 'Account number: 0106954271 → (blank)');
assert.equal(blanked.statusChanged, false);

assert.equal(auditActorFromSession({ fullName: 'Mr FAWAZ ADESHINA', username: 'L2770', employeeCode: 'L2770' }), 'Mr FAWAZ ADESHINA (L2770)');
assert.equal(auditActorFromSession({ fullName: 'Global Super Administrator', username: 'admin' }), 'Global Super Administrator');
assert.equal(auditActorFromSession(null), null);

console.log('employee-change-audit.test.ts passed');
