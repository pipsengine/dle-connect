/**
 * Run: npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/lib/payroll-earning-component.test.ts
 */
import assert from 'node:assert/strict';
import { earningComponentFamily } from './payroll-earning-component';
import { isScheduleEarningHeader } from './salary-schedule-xlsx';

assert.equal(earningComponentFamily('SNR_UTILITY', 'UTILITIES'), 'utilities');
assert.equal(earningComponentFamily('JNR_UTILITY', 'UTILITIES'), 'utilities');
assert.equal(earningComponentFamily('MGT1COLA_UTILIT', 'UTILITIES'), 'utilities');
assert.equal(earningComponentFamily('SNR_HOUSE', 'HOUSING'), 'housing');
assert.equal(earningComponentFamily('BASIC1_LUMPSUM', 'LUMPSUM AMOUNT'), 'lumpsum');
assert.equal(earningComponentFamily('JNR_MEDICAL', 'MEDICAL'), 'medical');

assert.equal(isScheduleEarningHeader('UTILITIES'), true);
assert.equal(isScheduleEarningHeader('Utilities (Earning)'), true);
assert.equal(isScheduleEarningHeader('SNR UTILITY'), true);
assert.equal(isScheduleEarningHeader('SNR_HOUSE'), true);
assert.equal(isScheduleEarningHeader('HOUSING'), true);
assert.equal(isScheduleEarningHeader('PAYE (Deduction)'), false);
assert.equal(isScheduleEarningHeader('Employee Code'), false);

console.log('payroll-earning-component.test.ts ok');
