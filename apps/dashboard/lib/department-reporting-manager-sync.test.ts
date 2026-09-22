import assert from 'node:assert/strict';
import { explicitDepartmentSupervisorCode } from './department-reporting-manager-sync.ts';

assert.equal(explicitDepartmentSupervisorCode('CORPORATE OFFICE'), 'P0060');
assert.equal(explicitDepartmentSupervisorCode("MD's Office"), 'P0060');
assert.equal(explicitDepartmentSupervisorCode('HEALTH AND SAFETY'), 'P0392');
assert.equal(explicitDepartmentSupervisorCode('HSE'), 'P0392');
assert.equal(explicitDepartmentSupervisorCode('PROJECT'), 'P0442');
assert.equal(explicitDepartmentSupervisorCode('OPERATIONS'), 'P0442');
assert.equal(explicitDepartmentSupervisorCode('QUALITY ASSURANCE CONTROL'), 'L2792');
assert.equal(explicitDepartmentSupervisorCode('QUALITY CONTROL/ASSURANCE'), 'L2792');
assert.equal(explicitDepartmentSupervisorCode('ADMINSTRATION'), 'P0467');
assert.equal(explicitDepartmentSupervisorCode('ADMINISTRATION'), 'P0467');
assert.equal(explicitDepartmentSupervisorCode('INFORMATION TECHNOLOGY'), 'P0146');
assert.equal(explicitDepartmentSupervisorCode('SECURITY'), 'P0272');
assert.equal(explicitDepartmentSupervisorCode('PROCUREMENT'), null);

console.log('department-reporting-manager-sync.test.ts: ok');
