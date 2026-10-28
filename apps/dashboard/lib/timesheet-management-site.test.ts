/**
 * Run: npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/lib/timesheet-management-site.test.ts
 */
import assert from 'node:assert/strict';
import { timesheetCompanySite } from './timesheet-management-store.ts';

assert.equal(timesheetCompanySite({ businessUnit: 'DLPC', payrollGroup: 'DLE', location: 'AGEGE' }), 'DLPC');
assert.equal(timesheetCompanySite({ businessUnit: 'DLPCG', payrollGroup: 'DLE' }), 'DLPC');
assert.equal(timesheetCompanySite({ businessUnit: 'DLE', payrollGroup: 'DLE', location: 'IDI - IDI_ORO' }), 'DLE');
assert.equal(timesheetCompanySite({ businessUnit: 'Unassigned Business Unit', payrollGroup: 'DLPC' }), 'DLPC');
assert.equal(timesheetCompanySite({ businessUnit: '', payrollGroup: '' }), 'DLE');

console.log('timesheet-management-site.test.ts: ok');
