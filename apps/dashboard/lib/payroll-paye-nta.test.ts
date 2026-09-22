/**
 * Nigeria Tax Act 2025 PAYE: ₦500,000 rent cap, pension relief for permanent staff,
 * lumpsum monthly adds annualized, overtime taxed once.
 * Run: npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/lib/payroll-paye-nta.test.ts
 */
import assert from 'node:assert/strict';
import type { DleEmployeeDirectoryRow } from './dle-enterprise-db';
import { isVariableEarningForPaye } from './payroll-earning-tax-classification';
import { hrisPayeFromEmployee, lumpsumAnnualRentRelief } from './payroll-sage-pay-rules';
import type { PayrollEarningLine, PayrollEarningsResult } from './payroll-earnings-engine';

const employee = (overrides: Partial<DleEmployeeDirectoryRow>): DleEmployeeDirectoryRow =>
  ({
    employeeId: 'X0001',
    employeeCode: 'X0001',
    fullName: 'Test',
    status: 'Active',
    employmentType: 'Permanent',
    payCurrency: 'NGN',
    ...overrides,
  }) as DleEmployeeDirectoryRow;

const earnings = (
  profileId: PayrollEarningsResult['profileId'],
  lines: PayrollEarningLine[],
): Pick<PayrollEarningsResult, 'paidEarningLines' | 'earningLines' | 'profileId'> => ({
  profileId,
  paidEarningLines: lines,
  earningLines: lines,
});

assert.equal(lumpsumAnnualRentRelief(149000), 500000, 'lumpsum rent relief must not exceed the ₦500,000 NTA cap');
assert.equal(lumpsumAnnualRentRelief(178800), 500000);
assert.equal(isVariableEarningForPaye({ code: 'TCMTRANS', name: 'TCM TRANSPORT' }, { category: 'lumpsum' }), false);
assert.equal(isVariableEarningForPaye({ code: 'OVERTIME', name: 'OVERTIME' }, { category: 'lumpsum' }), true);
assert.equal(isVariableEarningForPaye({ code: 'MEAL', name: 'MEAL ALLOWANCE' }, { category: 'lumpsum' }), false);

const reuben = hrisPayeFromEmployee({
  employee: employee({ employeeCode: 'L2216', employmentType: 'Lumpsum' }),
  earnings: earnings('contract-lumpsum', [
    { code: 'LUMPSUMTAX', name: 'LUMPSUM ALLOWANCE', amount: 149000, taxable: true },
    { code: 'MEAL', name: 'MEAL ALLOWANCE', amount: 11000, taxable: true },
    { code: 'OVERTIME', name: 'OVERTIME', amount: 10000, taxable: true },
  ]),
  nhfApplicable: false,
});
assert.equal(reuben.paye, 7875, 'Reuben-style lumpsum PAYE after rent cap, taxable meal, OT month-only');

const tcmLumpsum = hrisPayeFromEmployee({
  employee: employee({ employeeCode: 'L2237', employmentType: 'Lumpsum' }),
  earnings: earnings('contract-lumpsum', [
    { code: 'LUMPSUMTAX', name: 'LUMPSUM ALLOWANCE', amount: 250000, taxable: true },
    { code: 'MEAL', name: 'MEAL', amount: 33000, taxable: true },
    { code: 'TCMTRANS', name: 'TCM TRANSPORT', amount: 33000, taxable: true },
  ]),
  nhfApplicable: false,
});
assert.equal(tcmLumpsum.paye, 31880, 'TCM transport and meal are annualized with the lumpsum base');

const mgt7 = hrisPayeFromEmployee({
  employee: employee({
    employeeCode: 'P0425',
    employmentType: 'Permanent',
    salaryGrade: 'MGT7',
    payeCalculation: { disablePensionPayeRelief: true, annualRentRelief: 400000 },
  }),
  earnings: earnings('management-permanent', [
    { code: 'BASIC', name: 'BASIC SALARY', amount: 675547.67, taxable: true },
    { code: 'HOUSING', name: 'HOUSING', amount: 540438.13, taxable: true },
    { code: 'TRANSPORT', name: 'TRANSPORT ALLOWANCE', amount: 405328.6, taxable: true },
    { code: 'FURNITURE', name: 'FURNITURE', amount: 108087.63, taxable: true },
    { code: 'OTHERALL', name: 'OTHER ALLOWANCE', amount: 783635.29, taxable: true },
    { code: 'UTILITY', name: 'UTILITIES', amount: 104574.78, taxable: true },
  ]),
  nhfApplicable: false,
});
assert.ok(mgt7.paye < 505217.45, 'MGT7 NGN PAYE must include pension relief and ₦500,000 rent cap');
assert.equal(mgt7.paye, 473468.6);

const senior = hrisPayeFromEmployee({
  employee: employee({ employeeCode: 'P0059', employmentType: 'Permanent', salaryGrade: 'SS5' }),
  earnings: earnings('senior-permanent', [
    { code: 'BASIC', name: 'BASIC SALARY', amount: 260425.52, taxable: true },
    { code: 'HOUSING', name: 'HOUSING', amount: 70615.38, taxable: true },
    { code: 'MEAL', name: 'Meal Allowance', amount: 22000, taxable: true },
    { code: 'MEDICAL', name: 'MEDICAL', amount: 32114.97, taxable: true },
    { code: 'OTHERALL', name: 'OTHER ALLOWANCE', amount: 204709.49, taxable: true },
    { code: 'SNRUNION', name: 'SNR UNION', amount: 45000, taxable: true },
    { code: 'TRANSPORT', name: 'TRANSPORT ALLOWANCE', amount: 25729.54, taxable: true },
    { code: 'UTILITY', name: 'UTILITIES', amount: 12833.47, taxable: true },
  ]),
  nhfApplicable: false,
});
assert.equal(senior.paye, 91079.61, 'P0059 NTA PAYE includes taxable meal allowance');

console.log('payroll-paye-nta.test.ts passed');
