import assert from 'node:assert/strict';
import {
  HRIS_EMPLOYEE_ID_PLACEHOLDER,
  hrisEmployeeProfileHref,
  hrisEmployeeResourceUrl,
  joinEmployeeIdParam,
  resolveHrisEmployeeRoute,
} from './hris-employee-route.ts';

assert.equal(
  hrisEmployeeProfileHref('L2/1', { tab: 'payroll' }),
  '/hris/employees/employee-profile/L2/1?tab=payroll',
);

assert.equal(
  hrisEmployeeResourceUrl('L2/1', 'payroll'),
  `/api/hris/employees/${HRIS_EMPLOYEE_ID_PLACEHOLDER}/payroll?employeeId=L2%2F1`,
);

const fromQuery = resolveHrisEmployeeRoute(
  { url: 'https://example.test/api/hris/employees/_eid/payroll?employeeId=L2%2F1' },
  '_eid',
  ['payroll'],
);
assert.equal(fromQuery.employeeId, 'L2/1');
assert.deepEqual(fromQuery.resource, ['payroll']);

const fromIisSplit = resolveHrisEmployeeRoute(
  { url: 'https://example.test/api/hris/employees/L2/1/payroll' },
  'L2',
  ['1', 'payroll'],
);
assert.equal(fromIisSplit.employeeId, 'L2/1');
assert.deepEqual(fromIisSplit.resource, ['payroll']);

assert.equal(joinEmployeeIdParam(['L2', '1']), 'L2/1');
assert.equal(joinEmployeeIdParam('L2%2F1'), 'L2/1');

console.log('hris-employee-route tests passed');
