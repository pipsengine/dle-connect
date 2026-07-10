import fs from 'node:fs';
import path from 'node:path';

for (const file of ['apps/dashboard/.env.local', 'apps/dashboard/.env', '.env']) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
}

import { readPayrollEmployees } from '../apps/dashboard/lib/payroll-employee-source';
import { readAllEssRequests, resolveLineManagerForEmployee, employeeRequestMatches } from '../apps/dashboard/lib/leave-workflow-service';
import { employeeEmailAddress, resolveMailProvider } from '../apps/dashboard/lib/mail-service';
import { readUsers } from '../apps/dashboard/lib/auth/auth-store';
import { explicitDepartmentSupervisorCode } from '../apps/dashboard/lib/department-reporting-manager-sync';

const run = async () => {
  const { employees } = await readPayrollEmployees();
  const users = await readUsers();
  const nysc = employees.find((e) => employeeRequestMatches(e, 'NYSC0032'));
  const p0146 = employees.find((e) => employeeRequestMatches(e, 'P0146'));
  const authP0146 = users.find((u) => u.employeeCode === 'P0146' || u.username === 'P0146');
  const manager = nysc ? resolveLineManagerForEmployee(nysc, employees) : null;
  const deptFallback = nysc ? explicitDepartmentSupervisorCode(nysc.department || '') : null;
  const pending = (await readAllEssRequests()).filter((r) => r.employeeId === 'NYSC0032' && r.status === 'Line Manager Review');

  console.log(JSON.stringify({
    mailProvider: resolveMailProvider() || 'NOT CONFIGURED',
    nysc: nysc ? { id: nysc.employeeId, code: nysc.employeeCode, department: nysc.department, managerName: nysc.managerName } : null,
    resolvedManager: manager ? { code: manager.employee.employeeCode, name: manager.label, email: employeeEmailAddress(manager.employee) } : null,
    deptFallback,
    p0146PayrollEmail: p0146 ? employeeEmailAddress(p0146) : null,
    p0146AuthEmail: authP0146?.email || null,
    pendingNyscRequests: pending.map((r) => ({ id: r.id, status: r.status, lineManagerEmployeeId: r.lineManagerEmployeeId, submittedAt: r.submittedAt })),
  }, null, 2));
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
