/**
 * DLE USD section classifiers — Permanent / Contract (MD) / Expatriate (Nayak).
 * Run: npx tsx lib/payroll-bank-schedule-packs.dle-usd.test.ts
 */
import assert from 'node:assert/strict';
import {
  groupDleUsdRecords,
  isDleUsdExpatriateEmployee,
  isDleUsdMdEmployee,
  isDleUsdPayrollEmployee,
  isDleUsdPayrollGroupFilter,
  resolveDleUsdSection,
} from './payroll-bank-schedule-packs.ts';

assert.equal(isDleUsdPayrollGroupFilter('DLE_USD'), true);
assert.equal(isDleUsdPayrollGroupFilter('DLE USD'), true);
assert.equal(isDleUsdPayrollGroupFilter('Permanent'), false);

assert.equal(isDleUsdMdEmployee({ fullName: 'CHRIS IJELI', jobTitle: 'MANAGING DIRECTOR', employeeCode: '00MD01' }), true);
assert.equal(isDleUsdMdEmployee({ fullName: 'Mr CHRIS IJELI', employeeCode: 'P0413' }), true);
assert.equal(isDleUsdExpatriateEmployee({ fullName: 'Nayak Sushil', jobTitle: 'Expatriate' }), true);
assert.equal(isDleUsdExpatriateEmployee({ fullName: 'SUSHILKUMAR NAYAK', employeeCode: 'PEX001' }), true);
assert.equal(isDleUsdMdEmployee({ fullName: 'TEMITOPE ODULATE', jobTitle: 'GENERAL MANAGER, OPERATIONS' }), false);
assert.equal(isDleUsdMdEmployee({ fullName: 'ROSEMARY BENSON', jobTitle: 'PA. TO MD/CEO', employeeCode: 'P0060' }), false);
assert.equal(isDleUsdMdEmployee({ fullName: 'OLUFUNKE ABE', jobTitle: 'EA. TO MD / CEO', employeeCode: 'P0465' }), false);

assert.equal(resolveDleUsdSection({
  fullName: 'TEMITOPE ODULATE',
  jobTitle: 'GENERAL MANAGER, OPERATIONS',
  payrollGroup: 'DLE_USD',
  payCurrency: 'USD',
}), 'permanent');
assert.equal(resolveDleUsdSection({
  fullName: 'CHRIS IJELI',
  jobTitle: 'MANAGING DIRECTOR',
  payrollGroup: 'DLE',
  payCurrency: 'USD',
}), 'contract-md');
assert.equal(resolveDleUsdSection({
  fullName: 'Nayak Sushil',
  payrollGroup: 'DLPC',
  payCurrency: 'USD',
}), 'expatriate');

const grouped = groupDleUsdRecords([
  { fullName: 'TEMITOPE ODULATE', payrollGroup: 'DLE_USD', payCurrency: 'USD', jobTitle: 'GM OPS' },
  { fullName: 'CHRIS IJELI', payrollGroup: 'DLE', payCurrency: 'USD', jobTitle: 'MANAGING DIRECTOR' },
  { fullName: 'Nayak Sushil', payrollGroup: 'DLPC', payCurrency: 'USD' },
  { fullName: 'NGN STAFF', payrollGroup: 'DLE', payCurrency: 'NGN' },
]);
assert.equal(grouped.length, 3);
assert.equal(grouped[0].id, 'permanent');
assert.equal(grouped[0].rows.length, 1);
assert.equal(grouped[1].id, 'contract-md');
assert.equal(grouped[2].id, 'expatriate');
assert.equal(isDleUsdPayrollEmployee({ payrollGroup: 'DLE', payCurrency: 'NGN' }), false);

console.log('payroll-bank-schedule-packs.dle-usd.test.ts: ok');
