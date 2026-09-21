import assert from 'node:assert/strict';
import {
  actorCanActOnOvertimeAuthorization,
  actorCanSeeOvertimeAuthorization,
  actorIsCurrentOvertimeApprover,
  actorIsOvertimeBookingSupervisor,
  actorSeesAllOvertimeAuthorizations,
  scopeOvertimeAuthorizationRequests,
} from './overtime-authorization-scope.ts';

const karonwi = {
  employeeCode: 'P0013',
  fullName: 'Mr SAMUEL KARONWI',
  roles: ['Supervisor'],
};

const namedPm = {
  employeeCode: 'P0200',
  fullName: 'Jane Project',
  email: 'jane.pm@example.com',
  roles: ['Project Manager'],
};

const otherSupervisor = {
  employeeCode: 'C1882',
  fullName: 'MOMOH MOHAMMED',
  roles: ['Supervisor'],
};

const hrManager = {
  employeeCode: 'P0100',
  fullName: 'HR Manager User',
  roles: ['HR Manager'],
};

const request = {
  status: 'Submitted',
  supervisorCode: 'P0013',
  supervisorName: 'P0013 - Mr SAMUEL KARONWI',
  createdBy: 'Mr SAMUEL KARONWI',
  currentOwnerRole: 'Project Manager',
  currentOwnerName: 'Jane Project',
  projectManagerName: 'Jane Project',
  projectManagerEmail: 'jane.pm@example.com',
  gmOperationsName: 'GM Operations',
  gmOperationsEmail: null,
  hrApproverName: 'HR Manager',
  hrApproverEmail: null,
};

assert.equal(actorSeesAllOvertimeAuthorizations(karonwi), false);
assert.equal(actorSeesAllOvertimeAuthorizations(hrManager), true);
assert.equal(actorIsOvertimeBookingSupervisor(request, karonwi), true);
assert.equal(actorIsOvertimeBookingSupervisor(request, otherSupervisor), false);
assert.equal(actorIsCurrentOvertimeApprover(request, karonwi), false);
assert.equal(actorIsCurrentOvertimeApprover(request, namedPm), true);
assert.equal(actorCanSeeOvertimeAuthorization(request, karonwi), true);
assert.equal(actorCanActOnOvertimeAuthorization(request, karonwi), false);
assert.equal(actorCanSeeOvertimeAuthorization(request, otherSupervisor), false);
assert.equal(actorCanActOnOvertimeAuthorization(request, namedPm), true);
assert.equal(actorCanSeeOvertimeAuthorization(request, hrManager), true);
assert.equal(actorCanActOnOvertimeAuthorization(request, hrManager), false);

const scoped = scopeOvertimeAuthorizationRequests([request, { ...request, supervisorCode: 'C1882', supervisorName: 'C1882 - MOMOH MOHAMMED', createdBy: 'MOMOH MOHAMMED' }], karonwi);
assert.equal(scoped.length, 1);
assert.equal(scoped[0].canAct, false);
assert.equal(scoped[0].supervisorCode, 'P0013');

const pmScoped = scopeOvertimeAuthorizationRequests([request], namedPm);
assert.equal(pmScoped.length, 1);
assert.equal(pmScoped[0].canAct, true);

const hrStage = { ...request, status: 'GM Operations Approved', currentOwnerRole: 'HR Manager', currentOwnerName: 'HR Manager' };
assert.equal(actorIsCurrentOvertimeApprover(hrStage, hrManager), true);
assert.equal(actorCanActOnOvertimeAuthorization(hrStage, karonwi), false);

console.log('overtime-authorization-scope tests: ok');
