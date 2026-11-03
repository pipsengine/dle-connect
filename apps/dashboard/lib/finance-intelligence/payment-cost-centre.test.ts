/**
 * Run: npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/lib/finance-intelligence/payment-cost-centre.test.ts
 */
import assert from 'node:assert/strict';
import { samePaymentPrincipal } from './payment-cost-centre';

assert.equal(
  samePaymentPrincipal(
    { code: 'P0464', employee: { employeeCode: 'P0464', fullName: 'Mr AYODEJI PHILLIPS' } },
    { code: '0464', employee: { employeeId: '0464', fullName: 'Mr. PHILLIPS AYODEJI' } },
  ),
  true,
  'P0464 and 0464 are the same cost-centre and line manager',
);

assert.equal(
  samePaymentPrincipal(
    { code: 'P0442 - Mr JOHN DOE', name: 'Mr JOHN DOE' },
    { code: 'P0442', employee: { employeeCode: 'P0442', fullName: 'Mr JOHN DOE' } },
  ),
  true,
  'a coded display name matches the directory staff code',
);

assert.equal(
  samePaymentPrincipal(
    { code: 'P0392', employee: { employeeCode: 'P0392', fullName: 'Mrs LINE MANAGER' } },
    { code: 'P0467', employee: { employeeCode: 'P0467', fullName: 'Mrs LINE MANAGER' } },
  ),
  false,
  'different staff codes stay two approvals even when the names look alike',
);

assert.equal(
  samePaymentPrincipal(
    { code: '', name: 'Reporting Manager' },
    { code: 'P0392', name: 'Mrs LINE MANAGER', employee: { fullName: 'Mrs LINE MANAGER' } },
  ),
  false,
  'an unresolved stage label is not the same person',
);

assert.equal(
  samePaymentPrincipal(
    { code: '', name: 'Mrs ROSEMARY NGOZICHUKWUKA BENSON', employee: { fullName: 'Mrs ROSEMARY NGOZICHUKWUKA BENSON' } },
    { code: '', name: 'ROSEMARY BENSON' },
  ),
  true,
  'the same manager with no staff code still matches by name',
);

console.log('payment-cost-centre.test.ts passed');
