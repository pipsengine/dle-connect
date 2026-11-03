/**
 * A selected schedule must not save against another company's loaded run.
 * Run: npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/lib/payroll-run-scope-guard.test.ts
 */
import assert from 'node:assert/strict';
import { payrollRunScopeMismatchMessage } from './payroll-run-scope-guard';

const dleSalaries = {
  id: 'payroll-2026-10-salaried-DLE',
  pack: 'salaried' as const,
  company: 'DLE' as const,
};
const dlpcSalaries = {
  id: 'payroll-2026-10-salaried-DLPC',
  pack: 'salaried' as const,
  company: 'DLPC' as const,
};

const staleDlpcOnDleCard = payrollRunScopeMismatchMessage(dlpcSalaries, {
  runId: dlpcSalaries.id,
  scheduleId: 'dle-salaries',
  pack: 'salaried',
  company: 'DLE',
});
assert.match(staleDlpcOnDleCard || '', /DLE Salaries/);
assert.match(staleDlpcOnDleCard || '', /DLPC Salaries/);

const matchingDle = payrollRunScopeMismatchMessage(dleSalaries, {
  runId: dleSalaries.id,
  scheduleId: 'dle-salaries',
  pack: 'salaried',
  company: 'DLE',
});
assert.equal(matchingDle, null);

const usdSharesDleRun = payrollRunScopeMismatchMessage(dleSalaries, {
  runId: dleSalaries.id,
  scheduleId: 'dle-usd',
  pack: 'salaried',
  company: 'DLE',
});
assert.equal(usdSharesDleRun, null);

const companyOnly = payrollRunScopeMismatchMessage(dlpcSalaries, {
  runId: dlpcSalaries.id,
  pack: 'salaried',
  company: 'DLE',
});
assert.match(companyOnly || '', /DLPC Salaries/);

const noRunId = payrollRunScopeMismatchMessage(dlpcSalaries, {
  scheduleId: 'dle-salaries',
  pack: 'salaried',
  company: 'DLE',
});
assert.equal(noRunId, null);

console.log('payroll-run-scope-guard tests passed');
