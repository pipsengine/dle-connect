/**
 * Read-only audit: lists active employees whose HRIS reporting manager does not
 * resolve to an active colleague. Approval routing (payment requests and leave)
 * refuses to guess an approver, so every employee listed here is blocked from
 * submitting until HR corrects the reporting manager.
 *
 * Usage:
 *   npm run audit:missing-reporting-managers
 *   npm run audit:missing-reporting-managers -- --department "INFORMATION TECHNOLOGY"
 *   npm run audit:missing-reporting-managers -- --csv reporting-manager-gaps.csv
 */
import fs from 'node:fs';
import path from 'node:path';

import type { DleEmployeeDirectoryRow } from '../apps/dashboard/lib/dle-enterprise-db';
import { employeeRequestMatches, resolveLineManagerForEmployee } from '../apps/dashboard/lib/leave-workflow-service';
import { readPayrollEmployees } from '../apps/dashboard/lib/payroll-employee-source';

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

const clean = (value: unknown) => String(value ?? '').trim();
const INACTIVE = /inactive|terminated|resigned|retired|deceased|suspend/i;
const isInactive = (employee: DleEmployeeDirectoryRow) => INACTIVE.test(clean(employee.status));

const argValue = (flag: string) => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? clean(process.argv[index + 1]) : '';
};

const codeOf = (employee: DleEmployeeDirectoryRow) => clean(employee.employeeCode) || clean(employee.employeeId);

const codeFromReference = (reference: string) => {
  const value = clean(reference);
  const prefixed = value.match(/^([A-Z]{0,5}0*\d+)\s*-/i);
  if (prefixed?.[1]) return prefixed[1].toUpperCase();
  return value.match(/\b(P\d+|L\d+|NYSC\d+|C\d+|IT\d+)\b/i)?.[1]?.toUpperCase() || '';
};

const namesOverlap = (left: string, right: string) => {
  const a = clean(left).toLowerCase();
  const b = clean(right).toLowerCase();
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
};

/** Loose match used only to explain *why* routing failed, never to route. */
const looselyMatches = (employee: DleEmployeeDirectoryRow, reference: string) => {
  if (employeeRequestMatches(employee, reference)) return true;
  const code = codeFromReference(reference);
  if (code && employeeRequestMatches(employee, code)) return true;
  const name = reference.includes(' - ') ? clean(reference.split(' - ').slice(1).join(' - ')) : reference;
  return namesOverlap(employee.fullName, name);
};

type Gap = {
  employeeCode: string;
  fullName: string;
  department: string;
  jobTitle: string;
  employmentType: string;
  recordedManager: string;
  reason: string;
};

const classify = (employee: DleEmployeeDirectoryRow, employees: DleEmployeeDirectoryRow[]): string => {
  const reference = clean(employee.managerName);
  if (!reference) return 'No reporting manager recorded';

  const candidates = employees.filter((item) => looselyMatches(item, reference));
  if (!candidates.length) return 'Reporting manager does not match any employee record';

  const isSelf = (candidate: DleEmployeeDirectoryRow) =>
    employeeRequestMatches(candidate, employee.employeeId)
    || (employee.employeeCode ? employeeRequestMatches(candidate, employee.employeeCode) : false);

  if (candidates.every(isSelf)) return 'Reporting manager points at the employee themselves';
  if (candidates.every(isInactive)) {
    const who = candidates.map((item) => `${codeOf(item)} ${clean(item.fullName)}`.trim()).join(', ');
    return `Reporting manager is inactive/terminated (${who})`;
  }
  return 'Reporting manager could not be matched to an active employee';
};

const main = async () => {
  const departmentFilter = argValue('--department').toLowerCase();
  const csvPath = argValue('--csv');

  const source = await readPayrollEmployees();
  const employees = source.employees || [];
  if (!employees.length) {
    console.error('No employees loaded. Check the DLE_Enterprise connection settings in .env.');
    process.exitCode = 1;
    return;
  }

  const active = employees.filter((employee) => !isInactive(employee));
  const inScope = departmentFilter
    ? active.filter((employee) => clean(employee.department).toLowerCase().includes(departmentFilter))
    : active;

  const gaps: Gap[] = [];
  for (const employee of inScope) {
    if (resolveLineManagerForEmployee(employee, employees)) continue;
    gaps.push({
      employeeCode: codeOf(employee),
      fullName: clean(employee.fullName),
      department: clean(employee.department) || 'Unassigned Department',
      jobTitle: clean(employee.jobTitle) || clean(employee.designation),
      employmentType: clean(employee.employmentType),
      recordedManager: clean(employee.managerName),
      reason: classify(employee, employees),
    });
  }

  gaps.sort((a, b) =>
    a.department.localeCompare(b.department)
    || a.employeeCode.localeCompare(b.employeeCode));

  console.log('');
  console.log('Reporting manager routing audit');
  console.log('-------------------------------');
  console.log(`Source              : ${source.source}`);
  console.log(`Employees loaded    : ${employees.length}`);
  console.log(`Active in scope     : ${inScope.length}${departmentFilter ? ` (department filter: "${argValue('--department')}")` : ''}`);
  console.log(`Blocked from routing: ${gaps.length}`);
  console.log('');

  if (!gaps.length) {
    console.log('Every active employee in scope has a reporting manager that resolves. No action needed.');
    return;
  }

  const byReason = new Map<string, number>();
  const byDepartment = new Map<string, number>();
  for (const gap of gaps) {
    const reasonKey = gap.reason.replace(/\s*\(.*\)$/, '');
    byReason.set(reasonKey, (byReason.get(reasonKey) || 0) + 1);
    byDepartment.set(gap.department, (byDepartment.get(gap.department) || 0) + 1);
  }

  console.log('By reason:');
  for (const [reason, count] of [...byReason.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(4)}  ${reason}`);
  }
  console.log('');

  console.log('By department:');
  for (const [department, count] of [...byDepartment.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    console.log(`  ${String(count).padStart(4)}  ${department}`);
  }
  console.log('');

  console.log('Affected employees:');
  for (const gap of gaps) {
    console.log(`  ${gap.employeeCode.padEnd(10)} ${gap.fullName}`);
    console.log(`             ${gap.department}${gap.jobTitle ? ` · ${gap.jobTitle}` : ''}${gap.employmentType ? ` · ${gap.employmentType}` : ''}`);
    console.log(`             Recorded manager: ${gap.recordedManager || '(blank)'}`);
    console.log(`             Reason: ${gap.reason}`);
  }
  console.log('');

  if (csvPath) {
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const rows = [
      ['Employee Code', 'Full Name', 'Department', 'Job Title', 'Employment Type', 'Recorded Reporting Manager', 'Reason'],
      ...gaps.map((gap) => [
        gap.employeeCode,
        gap.fullName,
        gap.department,
        gap.jobTitle,
        gap.employmentType,
        gap.recordedManager,
        gap.reason,
      ]),
    ];
    const target = path.resolve(csvPath);
    fs.writeFileSync(target, rows.map((row) => row.map(escape).join(',')).join('\r\n'), 'utf8');
    console.log(`CSV written to ${target}`);
    console.log('');
  }

  console.log('These employees cannot submit payment requests or leave until HR sets a valid');
  console.log('reporting manager in HRIS job information. This audit made no changes.');
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  // The DLE_Enterprise pool keeps the event loop alive, so exit once reporting is done.
  .finally(() => process.exit(process.exitCode ?? 0));
