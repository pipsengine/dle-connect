import fs from 'node:fs';
import path from 'node:path';

import { auditDepartmentReportingManagers, syncDepartmentReportingManagers } from '../apps/dashboard/lib/department-reporting-manager-sync';

const loadWorkspaceEnv = () => {
  for (const file of [path.resolve('.env'), path.join(process.cwd(), 'apps', 'dashboard', '.env')]) {
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
};

loadWorkspaceEnv();

const dryRun = process.argv.includes('--dry-run');
const auditOnly = process.argv.includes('--audit');
const summaryOnly = process.argv.includes('--summary');
const departmentArg = process.argv.find((arg) => arg.startsWith('--department='));
const departments = departmentArg
  ? departmentArg.split('=').slice(1).join('=').split(',').map((value) => value.trim()).filter(Boolean)
  : undefined;

const printSummary = (result: Awaited<ReturnType<typeof auditDepartmentReportingManagers>>) => {
  console.log(`\nDepartment reporting manager review (${result.generatedAt})`);
  console.log(`Departments reviewed: ${result.departmentsReviewed}`);
  console.log(`Employees reviewed: ${result.employeesReviewed}`);
  console.log(`Assignments needed: ${result.employeesNeedingAssignment}`);
  console.log(`Skipped out of scope: ${result.skippedOutOfScope}`);
  if (result.departmentsWithoutSupervisor.length) {
    console.log(`Departments without supervisor: ${result.departmentsWithoutSupervisor.join(', ')}`);
  }
  console.log('\nDepartment supervisors:');
  for (const row of result.departmentSummaries) {
    const supervisor = row.supervisorCode ? `${row.supervisorCode} (${row.supervisorName})` : 'UNRESOLVED';
    console.log(
      `- ${row.department}: ${row.employeeCount} employees, ${row.missingManagerCount} missing manager → ${supervisor} [${row.resolution}]`,
    );
  }
  if (result.planned.length) {
    console.log('\nPlanned assignments:');
    for (const row of result.planned) {
      console.log(
        `  ${row.employeeCode} (${row.department}) → ${row.supervisorCode} | ${row.reason}${row.previousReportingManager ? ` | was: ${row.previousReportingManager}` : ''}`,
      );
    }
  }
};

const main = async () => {
  if (auditOnly || dryRun || summaryOnly) {
    const audit = await auditDepartmentReportingManagers();
    const scoped = departments?.length
      ? {
          ...audit,
          planned: audit.planned.filter((row) => departments.some((dept) => row.department.toLowerCase() === dept.toLowerCase())),
          departmentSummaries: audit.departmentSummaries.filter((row) => departments.some((dept) => row.department.toLowerCase() === dept.toLowerCase())),
        }
      : audit;
    printSummary(scoped);
    if (summaryOnly || auditOnly || dryRun) {
      if (!summaryOnly) console.log('\nFull payload:\n', JSON.stringify(scoped, null, 2));
      if (auditOnly || dryRun || summaryOnly) return;
    }
  }

  const result = await syncDepartmentReportingManagers({
    dryRun: false,
    performedBy: 'scripts/sync-department-reporting-managers.ts',
    departments,
  });
  printSummary(result);
  console.log(`\nUpdated ${result.employeesUpdated} employee reporting manager record(s). Batch: ${result.assignmentBatch || 'n/a'}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
