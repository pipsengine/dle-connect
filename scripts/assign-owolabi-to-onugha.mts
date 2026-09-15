/**
 * Put C2762 Sunday Owolabi back on P0289 Onugha's timesheet crew.
 * He already reports to her in HR, but Inactive + missing assignment hid him.
 *
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/assign-owolabi-to-onugha.mts --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import sql from 'mssql';

import {
  getDleEnterpriseDbPool,
  loadWorkspaceEnv,
  readEmployeeDirectoryFromDb,
  updateEmployeeContractPayrollClassificationInDb,
} from '../apps/dashboard/lib/dle-enterprise-db';
import { assignEmployeesToSupervisor, readSupervisorAssignments } from '../apps/dashboard/lib/supervisor-assignment-store';

const SUPERVISOR_CODE = 'P0289';
const EMPLOYEE_CODE = 'C2762';
const BATCH = '2026-09-15-onugha-sunday-owolabi';
const PAINTER_DAY_RATE = 12750;

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

const main = async () => {
  loadEnvFiles();
  const apply = process.argv.includes('--apply');
  const directory = await readEmployeeDirectoryFromDb();
  if (!directory?.length) throw new Error('Employee directory is empty.');
  const employee = directory.find((row) => String(row.employeeCode || row.employeeId || '').trim().toUpperCase() === EMPLOYEE_CODE);
  const supervisor = directory.find((row) => String(row.employeeCode || row.employeeId || '').trim().toUpperCase() === SUPERVISOR_CODE);
  if (!employee) throw new Error(`${EMPLOYEE_CODE} not found.`);
  if (!supervisor) throw new Error(`${SUPERVISOR_CODE} not found.`);
  const dbId = Number(employee.employeeDbId);
  if (!Number.isFinite(dbId) || dbId <= 0) throw new Error(`${EMPLOYEE_CODE} has no database id.`);

  const before = {
    employee: `${EMPLOYEE_CODE} ${employee.fullName}`,
    status: employee.status,
    employmentType: employee.employmentType,
    manager: employee.managerName,
    location: employee.officeLocation || employee.location,
    workCenter: employee.workCenter,
    ratePerDay: employee.ratePerDay,
    supervisor: `${SUPERVISOR_CODE} ${supervisor.fullName}`,
  };
  console.log(apply ? 'APPLY' : 'DRY RUN');
  console.log(JSON.stringify(before, null, 2));
  if (!apply) {
    console.log('\nRe-run with --apply to reactivate C2762 and assign him to P0289.');
    return;
  }

  await updateEmployeeContractPayrollClassificationInDb({
    employeeDbId: dbId,
    action: 'activate-daily-rate',
    reason: 'Sunday Owolabi (C2762) is on Mrs Onugha P0289 painter crew and must appear on Timesheet Entry.',
    payrollGroup: 'DLE',
    ratePerDay: PAINTER_DAY_RATE,
  });

  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('No DB');
  await pool.request()
    .input('employee_id', sql.BigInt, dbId)
    .input('work_center', sql.NVarChar(180), 'Blasting')
    .input('office_location', sql.NVarChar(180), 'IDI_ORO')
    .query(`
MERGE [hris].[EmployeeJobInfo] AS target
USING (SELECT @employee_id AS employee_id) AS source
ON target.employee_id = source.employee_id
WHEN MATCHED THEN UPDATE SET
  work_center = @work_center,
  office_location = COALESCE(NULLIF(LTRIM(RTRIM(ISNULL(target.office_location, N''))), N''), @office_location),
  modified_at = SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT (employee_id, office_location, work_center, is_people_manager, is_budget_owner)
VALUES (@employee_id, @office_location, @work_center, 0, 0);
`);

  const assigned = await assignEmployeesToSupervisor({
    supervisorEmployeeCode: SUPERVISOR_CODE,
    employeeCodes: [EMPLOYEE_CODE],
    assignmentBatch: BATCH,
    assignmentGroup: 'PAINTERS',
    reason: 'Sunday Owolabi belongs on Mrs Ebele Victoria Onugha (P0289) painter crew.',
    performedBy: 'scripts/assign-owolabi-to-onugha.mts',
    sourceRows: [{
      employeeCode: EMPLOYEE_CODE,
      sourceLabel: 'Sunday Owolabi',
      tradeRole: employee.jobTitle || 'BLASTER/PAINTER',
      matchConfidence: 'NamedOnughaPainter',
      matchNote: 'Reactivated daily-rate painter for P0289 Timesheet Entry crew.',
    }],
  });

  const afterDirectory = await readEmployeeDirectoryFromDb();
  const after = afterDirectory?.find((row) => String(row.employeeCode || row.employeeId || '').trim().toUpperCase() === EMPLOYEE_CODE);
  const assignments = await readSupervisorAssignments({ supervisorEmployeeCode: SUPERVISOR_CODE });
  console.log(JSON.stringify({
    assigned,
    after: after && {
      status: after.status,
      employmentType: after.employmentType,
      manager: after.managerName,
      location: after.officeLocation || after.location,
      workCenter: after.workCenter,
      ratePerDay: after.ratePerDay,
    },
    onughaAssignmentHasOwolabi: assignments.some((row) => String(row.employeeCode || '').toUpperCase() === EMPLOYEE_CODE),
  }, null, 2));

  await pool.close();
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
