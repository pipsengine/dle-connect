/**
 * Put C2193 David Emeh on P0277 Akinsanya's timesheet crew.
 * Dry-run: npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/assign-c2193-to-p0277.mts
 * Apply:   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/assign-c2193-to-p0277.mts --apply
 */
import { loadWorkspaceEnv } from '../apps/dashboard/lib/dle-enterprise-db';
import { assignEmployeesToSupervisor, readSupervisorAssignments } from '../apps/dashboard/lib/supervisor-assignment-store';

loadWorkspaceEnv();

const APPLY = process.argv.includes('--apply');

const main = async () => {
  const before = await readSupervisorAssignments({ supervisorEmployeeCode: 'P0277' });
  console.log({
    apply: APPLY,
    p0277Before: before.filter((row) => row.matchedStatus !== 'Unresolved').map((row) => `${row.employeeCode} ${row.employeeName} [${row.assignmentGroup}]`),
    alreadyAssigned: before.some((row) => String(row.employeeCode || '').toUpperCase() === 'C2193'),
  });
  if (!APPLY) {
    console.log('Would assign C2193 to P0277 without locking the galvanizing list.');
    process.exit(0);
  }
  const result = await assignEmployeesToSupervisor({
    supervisorEmployeeCode: 'P0277',
    employeeCodes: ['C2193'],
    assignmentGroup: 'Reporting Line',
    assignmentBatch: `2026-09-23-p0277-add-c2193-david-emeh`,
    reason: 'Restore C2193 David Emeh on Akinsanya timesheet crew. Shop lists are not exclusive.',
    performedBy: 'timesheet-crew-unlock',
    exclusive: false,
    sourceRows: [{
      employeeCode: 'C2193',
      sourceLabel: 'DAVID NWACHUKWU EMEH',
      tradeRole: 'Scaffolder',
      matchConfidence: 'DirectEmployeeCode',
    }],
  });
  console.log({
    assigned: result.assignments.filter((row) => String(row.employeeCode || '').toUpperCase() === 'C2193'),
    extrasRemoved: result.extrasRemoved,
    p0277Crew: (await readSupervisorAssignments({ supervisorEmployeeCode: 'P0277' }))
      .filter((row) => row.matchedStatus !== 'Unresolved')
      .map((row) => `${row.employeeCode} ${row.employeeName} [${row.assignmentGroup}]`),
  });
  process.exit(0);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
