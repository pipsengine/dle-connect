/**
 * Idi-oro Production reporting line:
 *   Production supervisors → C1882 Momoh Mohammed
 *   Momoh Mohammed → P0442 GM Operations (Odulate)
 *
 * Dry run:
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/apply-idioro-production-reporting-lines.mts
 *
 * Apply: add --apply
 */
import fs from 'node:fs';
import path from 'node:path';

import { loadWorkspaceEnv, readEmployeeDirectoryFromDb, type DleEmployeeDirectoryRow } from '../apps/dashboard/lib/dle-enterprise-db';
import { assignEmployeesToSupervisor } from '../apps/dashboard/lib/supervisor-assignment-store';

const MOMOH_CODE = 'C1882';
const GM_OPERATIONS_CODE = 'P0442';
const BATCH_SUPERVISORS = '2026-09-03-idioro-production-supervisors-momoh';
const BATCH_MOMOH = '2026-09-03-idioro-momoh-gm-operations';

const loadEnvFiles = () => {
  for (const file of [path.resolve('.env'), path.resolve('apps/dashboard/.env')]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[match[1]]) process.env[match[1]] = value;
    }
  }
  loadWorkspaceEnv();
};

const clean = (value: unknown) => String(value ?? '').trim();
const isInactive = (status: string) => /inactive|terminated|resigned|retired|deceased|suspend/i.test(clean(status));
const locationBlob = (employee: DleEmployeeDirectoryRow) =>
  `${employee.location || ''} ${employee.officeLocation || ''} ${employee.workLocation || ''} ${employee.projectSite || ''}`.toUpperCase();
const isIdiOro = (employee: DleEmployeeDirectoryRow) => {
  const loc = locationBlob(employee);
  return loc.includes('IDI') && loc.includes('ORO');
};
const isProduction = (employee: DleEmployeeDirectoryRow) => /production/i.test(clean(employee.department));
const isSupervisorTitle = (employee: DleEmployeeDirectoryRow) =>
  /supervisor/i.test(clean(employee.jobTitle)) && !/superintend/i.test(clean(employee.jobTitle));
const codeOf = (employee: DleEmployeeDirectoryRow) => clean(employee.employeeCode || employee.employeeId).toUpperCase();

const main = async () => {
  loadEnvFiles();
  const apply = process.argv.includes('--apply');
  const directory = await readEmployeeDirectoryFromDb();
  if (!directory?.length) throw new Error('Employee directory is empty or the database is not configured.');

  const momoh = directory.find((employee) => codeOf(employee) === MOMOH_CODE);
  const gmOps = directory.find((employee) => codeOf(employee) === GM_OPERATIONS_CODE);
  if (!momoh || isInactive(momoh.status)) throw new Error(`Momoh ${MOMOH_CODE} was not found as an active employee.`);
  if (!gmOps || isInactive(gmOps.status)) throw new Error(`GM Operations ${GM_OPERATIONS_CODE} was not found as an active employee.`);

  const supervisors = directory
    .filter((employee) => !isInactive(employee.status))
    .filter(isIdiOro)
    .filter(isProduction)
    .filter(isSupervisorTitle)
    .filter((employee) => codeOf(employee) !== MOMOH_CODE)
    .sort((a, b) => codeOf(a).localeCompare(codeOf(b)));

  const preview = {
    momoh: {
      employeeCode: codeOf(momoh),
      name: momoh.fullName,
      title: momoh.jobTitle,
      location: momoh.location,
      currentManager: momoh.managerName || null,
      nextManager: `${GM_OPERATIONS_CODE} - ${gmOps.fullName}`,
    },
    gmOperations: {
      employeeCode: codeOf(gmOps),
      name: gmOps.fullName,
      title: gmOps.jobTitle,
    },
    supervisors: supervisors.map((employee) => ({
      employeeCode: codeOf(employee),
      name: employee.fullName,
      title: employee.jobTitle,
      location: employee.location,
      currentManager: employee.managerName || null,
      nextManager: `${MOMOH_CODE} - ${momoh.fullName}`,
    })),
  };

  console.log(apply ? 'APPLY' : 'DRY RUN');
  console.log(JSON.stringify(preview, null, 2));

  if (!supervisors.length) throw new Error('No Idi-oro Production supervisors were found to assign to Momoh.');
  if (!apply) {
    console.log('\nRe-run with --apply to write reporting managers in HRIS.');
    process.exit(0);
  }

  const supervisorResult = await assignEmployeesToSupervisor({
    supervisorEmployeeCode: MOMOH_CODE,
    employeeCodes: supervisors.map(codeOf),
    assignmentBatch: BATCH_SUPERVISORS,
    assignmentGroup: 'IDI-ORO PRODUCTION SUPERVISORS',
    reason: 'All Idi-oro Production supervisors report to Momoh Mohammed (C1882).',
    performedBy: 'scripts/apply-idioro-production-reporting-lines.mts',
    sourceRows: supervisors.map((employee) => ({
      employeeCode: codeOf(employee),
      sourceLabel: employee.fullName,
      tradeRole: employee.jobTitle,
      matchConfidence: 'IdioroProductionSupervisor',
      matchNote: `${employee.location} · ${employee.department}`,
    })),
  });

  const momohResult = await assignEmployeesToSupervisor({
    supervisorEmployeeCode: GM_OPERATIONS_CODE,
    employeeCodes: [MOMOH_CODE],
    assignmentBatch: BATCH_MOMOH,
    assignmentGroup: 'IDI-ORO MOMOH TO GM OPERATIONS',
    reason: 'Momoh Mohammed (C1882) reports to GM Operations (P0442 Odulate).',
    performedBy: 'scripts/apply-idioro-production-reporting-lines.mts',
    sourceRows: [{
      employeeCode: MOMOH_CODE,
      sourceLabel: momoh.fullName,
      tradeRole: momoh.jobTitle,
      matchConfidence: 'IdioroMomohToGmOperations',
      matchNote: `${momoh.location} · ${momoh.department}`,
    }],
  });

  console.log(JSON.stringify({
    supervisorsAssigned: {
      batch: supervisorResult.assignmentBatch,
      supervisor: supervisorResult.supervisor.reportingManagerLabel,
      matched: supervisorResult.assignments.filter((row) => row.matchedStatus === 'Matched').length,
      unresolved: supervisorResult.assignments.filter((row) => row.matchedStatus !== 'Matched').map((row) => row.employeeCode),
    },
    momohAssigned: {
      batch: momohResult.assignmentBatch,
      supervisor: momohResult.supervisor.reportingManagerLabel,
      matched: momohResult.assignments.filter((row) => row.matchedStatus === 'Matched').length,
      unresolved: momohResult.assignments.filter((row) => row.matchedStatus !== 'Matched').map((row) => row.employeeCode),
    },
  }, null, 2));
  process.exit(0);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
