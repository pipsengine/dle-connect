import assert from 'node:assert/strict';
import { resolveEmployeeProfileAccess } from './employee-profile-access.ts';

const fawaz = resolveEmployeeProfileAccess({
  roles: [
    'Payroll Officer',
    'Employee',
    'Payroll Administrator',
    'HR Officer',
    'Payroll Supervisor',
    'HR Administrator',
    'Payroll Approver',
  ],
  permissions: ['hris.*', 'employees.*', 'payroll.*'],
  subjectEmployeeId: 'L2771',
  viewerEmployeeId: 'P0467',
});

assert.equal(fawaz.role, 'HR Director');
assert.equal(fawaz.displayRole, 'Payroll Administrator');
assert.equal(fawaz.perms.canViewProfile, true);
assert.equal(fawaz.perms.canEdit, true);
assert.equal(fawaz.perms.canViewPayroll, true);
assert.equal(fawaz.perms.canEditPayroll, true);
assert.equal(fawaz.perms.canChangeStatus, true);
assert.equal(fawaz.perms.canViewMedical, true);
assert.equal(fawaz.perms.canViewDisciplinary, true);
assert.equal(fawaz.perms.canManagePayrollClassification, true);

const payrollOnly = resolveEmployeeProfileAccess({
  roles: ['Payroll Officer', 'Employee'],
  subjectEmployeeId: 'L2771',
  viewerEmployeeId: 'P0999',
});
assert.equal(payrollOnly.role, 'Payroll Officer');
assert.equal(payrollOnly.perms.canEditPayroll, true);
assert.equal(payrollOnly.perms.canEdit, false);
assert.equal(payrollOnly.perms.canViewPayroll, true);

const hrOfficer = resolveEmployeeProfileAccess({
  roles: ['HR Officer', 'Employee'],
  subjectEmployeeId: 'L2771',
  viewerEmployeeId: 'P0432',
});
assert.equal(hrOfficer.role, 'HR Officer');
assert.equal(hrOfficer.perms.canEdit, true);
assert.equal(hrOfficer.perms.canEditPayroll, false);

const employeeOther = resolveEmployeeProfileAccess({
  roles: ['Employee'],
  subjectEmployeeId: 'L2771',
  viewerEmployeeId: 'P0100',
});
assert.equal(employeeOther.perms.canViewProfile, false);

const employeeSelf = resolveEmployeeProfileAccess({
  roles: ['Employee'],
  subjectEmployeeId: 'P0100',
  viewerEmployeeId: 'P0100',
});
assert.equal(employeeSelf.perms.canViewProfile, true);
assert.equal(employeeSelf.perms.canEditPayroll, false);

console.log('employee-profile-access tests passed');
