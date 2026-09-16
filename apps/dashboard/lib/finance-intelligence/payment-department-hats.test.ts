import assert from 'node:assert/strict';
import {
  preferredPaymentDepartmentForHats,
  previewPaymentReportingManager,
  paymentUsesProcurementHat,
  resolvePaymentDepartmentHat,
} from './payment-department-hats.ts';
import { formatPaymentProjectLabel, CORPORATE_PROJECT_LABEL, isCorporateOrPlaceholderProjectCode, paymentProjectSelectOptions } from './payment-request-departments.ts';

assert.equal(formatPaymentProjectLabel(''), CORPORATE_PROJECT_LABEL);
assert.equal(formatPaymentProjectLabel(null), CORPORATE_PROJECT_LABEL);
assert.equal(formatPaymentProjectLabel('DL0001'), 'DL0001');
assert.equal(isCorporateOrPlaceholderProjectCode(''), false);
assert.equal(isCorporateOrPlaceholderProjectCode('[Corporate]'), true);
assert.equal(isCorporateOrPlaceholderProjectCode('CORPORATE'), true);
assert.equal(isCorporateOrPlaceholderProjectCode('DL0001'), false);
assert.equal(paymentProjectSelectOptions([{ code: 'DL0001', label: 'DL0001 – GENERAL' }])[0]?.label, CORPORATE_PROJECT_LABEL);
assert.equal(paymentProjectSelectOptions([{ code: 'DL0001', label: 'DL0001 – GENERAL' }])[0]?.value, '');

const femiHome = resolvePaymentDepartmentHat({ employeeCode: 'P0465', department: 'CORPORATE OFFICE' });
assert.equal(femiHome?.managerCode, 'P0060');
assert.equal(
  resolvePaymentDepartmentHat({ employeeCode: 'L2641', department: 'PROCUREMENT' })?.managerCode,
  'P0059',
);
assert.equal(
  resolvePaymentDepartmentHat({ employeeCode: 'P0465', department: "MD's Office" })?.managerCode,
  'P0060',
);

assert.equal(
  preferredPaymentDepartmentForHats({
    paymentType: 'Supplier Invoice Payment',
    employeeCode: 'P0465',
    homeDepartment: 'CORPORATE OFFICE',
  }),
  'PROCUREMENT',
);
assert.equal(
  preferredPaymentDepartmentForHats({
    paymentType: 'Cash Advance Payment',
    employeeCode: 'P0465',
    homeDepartment: 'INFORMATION TECHNOLOGY',
  }),
  'CORPORATE OFFICE',
);
assert.equal(
  preferredPaymentDepartmentForHats({
    paymentType: 'Supplier Invoice Payment',
    employeeCode: 'P0146',
    homeDepartment: 'INFORMATION TECHNOLOGY',
  }),
  'INFORMATION TECHNOLOGY',
);

assert.equal(
  previewPaymentReportingManager({ employeeCode: 'P0465', department: 'PROCUREMENT' }).includes('P0059'),
  true,
);
assert.equal(
  paymentUsesProcurementHat({
    employeeCode: 'P0465',
    department: 'CORPORATE OFFICE',
    paymentType: 'Supplier Invoice Payment',
  }),
  true,
);
assert.equal(
  paymentUsesProcurementHat({
    employeeCode: 'P0465',
    department: 'CORPORATE OFFICE',
    paymentType: 'Expense Payment',
  }),
  false,
);

console.log('payment-department-hats.test.ts: ok');
