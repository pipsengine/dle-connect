import assert from 'node:assert/strict';
import { assertIdCardExport, isActiveDirectoryEmployee, nextIssueStatus, toIdCardEmployee } from './id-card-directory';

const active = toIdCardEmployee({
  employeeCode: 'p0146',
  firstName: 'Ada',
  lastName: 'Okeke',
  department: 'Human Resources',
  jobTitle: 'HR Officer',
  status: 'Active',
  hasPhoto: true,
}, { issueCount: 2, lastIssuedAt: '2026-11-01T00:00:00.000Z' });

assert.equal(active?.id, 'P0146');
assert.equal(active?.photoUrl, '/api/hris/employees/P0146/photo');
assert.equal(active?.issueCount, 2);
assert.equal(active?.department, 'Human Resources');

const fromFullName = toIdCardEmployee({
  employeeId: 'NYSC0032',
  fullName: 'Chidi Nwagbara',
  designation: 'Intern',
  status: '',
  hasPhoto: false,
});
assert.equal(fromFullName?.firstName, 'Chidi');
assert.equal(fromFullName?.lastName, 'Nwagbara');
assert.equal(fromFullName?.jobTitle, 'Intern');
assert.equal(fromFullName?.photoUrl, undefined);

assert.equal(isActiveDirectoryEmployee({ employeeCode: 'P0001', status: 'Resigned' }), false);
assert.equal(isActiveDirectoryEmployee({ employeeCode: 'P0001', status: 'Suspended' }), false);
assert.equal(isActiveDirectoryEmployee({ employeeCode: '', status: 'Active' }), false);
assert.equal(toIdCardEmployee({ employeeCode: 'P0002', status: 'Terminated', firstName: 'A', lastName: 'B' }), null);

assert.equal(nextIssueStatus(0), 'Issued');
assert.equal(nextIssueStatus(1), 'Reprinted');

assert.throws(() => assertIdCardExport('other', 'png'), /template/);
assert.throws(() => assertIdCardExport('dorman-long', 'gif'), /format/);
assert.doesNotThrow(() => assertIdCardExport('dorman-long', 'pdf'));

console.log('id-card-directory tests passed');
