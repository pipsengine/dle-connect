/**
 * Put C2410 Ayodele Afeniforo on P0044 Ogudu's timesheet crew.
 * He already reports to Ogudu in HR, but the rollers/machinist assignment
 * list hid every other direct report.
 *
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/assign-c2410-to-ogudu.mts --apply
 */
import fs from 'node:fs';
import path from 'node:path';

import { getDleEnterpriseDbPool, loadWorkspaceEnv, readEmployeeDirectoryFromDb } from '../apps/dashboard/lib/dle-enterprise-db';
import { assignEmployeesToSupervisor, readSupervisorAssignments } from '../apps/dashboard/lib/supervisor-assignment-store';

const SUPERVISOR_CODE = 'P0044';
const EMPLOYEE_CODE = 'C2410';
const BATCH = '2026-09-21-ogudu-ayodele-afeniforo';

const loadEnvFiles = () => {
  for (const file of [path.resolve('.env'), path.resolve('apps/dashboard/.env'), path.resolve('apps/dashboard/.env.local')]) {
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

const main = async () => {
  loadEnvFiles();
  const apply = process.argv.includes('--apply');
  const directory = await readEmployeeDirectoryFromDb();
  if (!directory?.length) throw new Error('Employee directory is empty.');
  const employee = directory.find((row) => String(row.employeeCode || row.employeeId || '').trim().toUpperCase() === EMPLOYEE_CODE);
  const supervisor = directory.find((row) => String(row.employeeCode || row.employeeId || '').trim().toUpperCase() === SUPERVISOR_CODE);
  if (!employee) throw new Error(`${EMPLOYEE_CODE} not found.`);
  if (!supervisor) throw new Error(`${SUPERVISOR_CODE} not found.`);

  const before = {
    employee: `${EMPLOYEE_CODE} ${employee.fullName}`,
    status: employee.status,
    manager: employee.managerName,
    location: employee.officeLocation || employee.location,
    jobTitle: employee.jobTitle,
    supervisor: `${SUPERVISOR_CODE} ${supervisor.fullName}`,
  };
  console.log(apply ? 'APPLY' : 'DRY RUN');
  console.log(JSON.stringify(before, null, 2));
  if (!apply) {
    console.log('\nRe-run with --apply to add C2410 to P0044 Timesheet Entry crew.');
    return;
  }

  const assigned = await assignEmployeesToSupervisor({
    supervisorEmployeeCode: SUPERVISOR_CODE,
    employeeCodes: [EMPLOYEE_CODE],
    assignmentBatch: BATCH,
    assignmentGroup: 'ROLLERS AND MACHINIST',
    reason: 'Ayodele Afeniforo (C2410) reports to Ogudu P0044 and must appear on Timesheet Entry.',
    performedBy: 'scripts/assign-c2410-to-ogudu.mts',
    sourceRows: [{
      employeeCode: EMPLOYEE_CODE,
      sourceLabel: 'AYODELE AFENIFORO',
      tradeRole: employee.jobTitle || 'BANDSAW',
      matchConfidence: 'DirectEmployeeCode',
      matchNote: 'HR reporting line P0044 was hidden by the partial rollers/machinist assignment roster.',
    }],
  });

  const assignments = await readSupervisorAssignments({ supervisorEmployeeCode: SUPERVISOR_CODE });
  console.log(JSON.stringify({
    assignmentBatch: assigned.assignmentBatch,
    oguduAssignmentHasC2410: assignments.some((row) => String(row.employeeCode || '').toUpperCase() === EMPLOYEE_CODE),
    crew: assignments
      .filter((row) => row.employeeCode && row.matchedStatus !== 'Unresolved')
      .map((row) => `${row.employeeCode} ${row.employeeName}`),
  }, null, 2));

  const pool = await getDleEnterpriseDbPool();
  if (pool) await pool.close();
  process.exit(0);
};

main().catch(async (error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  try {
    const pool = await getDleEnterpriseDbPool();
    if (pool) await pool.close();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
