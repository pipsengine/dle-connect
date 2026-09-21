import assert from 'node:assert/strict';
import { employeeCodeFromReference, employeeReportsToManager } from './reporting-manager-match.ts';
import { supervisorCodesMatch } from './timesheet-agege-blasting.ts';

assert.equal(employeeCodeFromReference('C1882 - MOHAMMED'), 'C1882');
assert.equal(employeeCodeFromReference('C2445'), 'C2445');
assert.equal(supervisorCodesMatch('C1882', 'C1882 - MOHAMMED'), true);
assert.equal(
  employeeReportsToManager(
    { managerName: 'C1882 - MOHAMMED', functionalManager: '', departmentHead: '' },
    { fullName: 'MOMOH MOHAMMED', employeeCode: 'C1882', employeeId: 'C1882' },
  ),
  true,
);

console.log('leave manager identity tests passed');
