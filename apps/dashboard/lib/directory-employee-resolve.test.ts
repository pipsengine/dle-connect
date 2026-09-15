import assert from 'node:assert/strict';
import {
  resolveDirectoryEmployeeForSession,
  successorCodesFromIdentities,
} from './directory-employee-resolve.ts';

const lumpsum = {
  employeeId: 'L2770',
  employeeCode: 'L2770',
  sourceEmployeeId: '',
  fullName: 'Mr FAWAZ ADESEGUN ADESHINA',
  status: 'Inactive',
  officialEmail: '',
  email: '',
  personalEmail: '',
  dateJoined: '2025-07-01',
  salaryGrade: 'LUMPSUMREMTAX - LUMPSUM REMUNERATION TAX',
};

const permanent = {
  employeeId: 'P0467',
  employeeCode: 'P0467',
  sourceEmployeeId: '',
  fullName: 'Mr FAWAZ ADESEGUN ADESHINA',
  status: 'Active',
  officialEmail: 'fawazadeshina@dormanlongeng.com',
  email: 'fawazadeshina@dormanlongeng.com',
  personalEmail: '',
  dateJoined: '2025-07-01',
  salaryGrade: 'SS4',
};

const other = {
  employeeId: 'P0146',
  employeeCode: 'P0146',
  sourceEmployeeId: '',
  fullName: 'Mr CHRISTIAN ONUWABHAGBE OGBAISI',
  status: 'Active',
  officialEmail: 'christian@dormanlongeng.com',
  email: '',
  personalEmail: '',
  dateJoined: '2018-01-01',
  salaryGrade: 'MGT',
};

const directory = [other, lumpsum, permanent];

const converted = resolveDirectoryEmployeeForSession(directory, {
  employeeCode: 'P0467',
  employeeId: 'P0467',
  username: 'L2770',
});
assert.equal(converted?.employeeCode, 'P0467', 'login L2770 with live code P0467 must bind the active permanent record');
assert.equal(converted?.status, 'Active');
assert.equal(converted?.salaryGrade, 'SS4');

const stale = resolveDirectoryEmployeeForSession(directory, {
  employeeCode: 'L2770',
  employeeId: 'L2770',
  username: 'L2770',
});
assert.equal(stale?.employeeCode, 'P0467', 'stale L2770 session must follow the same-person permanent conversion');

const successor = successorCodesFromIdentities([
  { employeeId: 'L2770', employeeCode: 'L2770', sourceEmployeeCode: 'L2770' },
  { employeeId: 'P0467', employeeCode: 'P0467', sourceEmployeeCode: 'L2770' },
]);
const viaPayslip = resolveDirectoryEmployeeForSession(directory, {
  username: 'L2770',
}, { successorCodes: successor });
assert.equal(viaPayslip?.employeeCode, 'P0467', 'payslip source code L2770 must resolve to P0467');

const untouched = resolveDirectoryEmployeeForSession(directory, {
  employeeCode: 'P0146',
  username: 'P0146',
});
assert.equal(untouched?.employeeCode, 'P0146');

const missing = resolveDirectoryEmployeeForSession(directory, { username: 'NOPE' });
assert.equal(missing, null);

console.log('directory-employee-resolve.test.ts: ok');
