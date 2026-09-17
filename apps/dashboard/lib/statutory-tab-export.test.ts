/**
 * Statutory Deductions header export must follow the open tab, not the salary register.
 * Run: npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/lib/statutory-tab-export.test.ts
 */
import assert from 'node:assert/strict';
import { buildStatutoryHubExportTable, statutoryTabExportTarget } from './statutory-tab-export.ts';

assert.equal(statutoryTabExportTarget('pension').kind, 'api');
assert.equal(statutoryTabExportTarget('paye').kind, 'api');
const nhfTarget = statutoryTabExportTarget('nhf');
assert.equal(nhfTarget.kind, 'api');
if (nhfTarget.kind === 'api') assert.deepEqual(nhfTarget.query, { fund: 'nhf' });
const overviewTarget = statutoryTabExportTarget('overview');
assert.equal(overviewTarget.kind, 'report');
if (overviewTarget.kind === 'report') assert.equal(overviewTarget.report, 'statutory-overview');
const exceptionsTarget = statutoryTabExportTarget('exceptions');
assert.equal(exceptionsTarget.kind, 'report');
if (exceptionsTarget.kind === 'report') assert.equal(exceptionsTarget.report, 'statutory-exceptions');

const table = buildStatutoryHubExportTable({
  report: 'statutory-exceptions',
  periodLabel: 'September 2026',
  employeesInScope: 10,
  runStatus: 'Draft',
  schedulesGenerated: false,
  exceptions: [
    { id: '1', employeeId: 'P100', employeeName: 'Ada', issue: 'Missing RSA PIN / pension number', severity: 'High', owner: 'Payroll' },
    { id: '2', employeeId: 'P200', employeeName: 'Ben', issue: 'Salary grade missing', severity: 'Medium', owner: 'HR' },
  ],
});
assert.equal(table.columns.includes('Issue'), true);
assert.equal(table.rows.length, 1);
assert.equal(table.rows[0][0], 'P100');
assert.equal(table.fileName.includes('statutory-exceptions'), true);

const overview = buildStatutoryHubExportTable({
  report: 'statutory-overview',
  periodLabel: 'September 2026',
  employeesInScope: 10,
  runStatus: 'Draft',
  schedulesGenerated: false,
  exceptions: [],
});
assert.deepEqual(overview.columns, ['Category', 'Status', 'Issues']);
assert.ok(overview.rows.some((row) => row[0] === 'PENSION'));

console.log('statutory-tab-export.test.ts ok');
