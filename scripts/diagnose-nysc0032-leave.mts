import fs from 'node:fs';
import path from 'node:path';

import { explicitDepartmentSupervisorCode } from '../apps/dashboard/lib/department-reporting-manager-sync';
import { getDleEnterpriseDbPool } from '../apps/dashboard/lib/dle-enterprise-db';
import {
  employeeRequestMatches,
  readAllEssRequests,
  resolveLineManagerForEmployee,
  validateEssLeaveApplication,
} from '../apps/dashboard/lib/leave-workflow-service';
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

const main = async () => {
  const { employees } = await readPayrollEmployees();
  const nysc = employees.find((employee) => employeeRequestMatches(employee, 'NYSC0032'));
  if (!nysc) {
    console.log('NYSC0032 not found in payroll employees');
    return;
  }

  const manager = resolveLineManagerForEmployee(nysc, employees);
  const deptSupervisor = explicitDepartmentSupervisorCode(nysc.department || '');
  const relievers = employees.filter((employee) =>
    String(employee.department || '').toLowerCase() === String(nysc.department || '').toLowerCase()
    && !employeeRequestMatches(employee, nysc.employeeId)
    && !employeeRequestMatches(employee, nysc.employeeCode || ''),
  );

  const validationStarted = Date.now();
  const validation = await validateEssLeaveApplication({
    employee: nysc,
    leaveType: 'Annual Leave',
    startDate: '2026-08-10',
    endDate: '2026-08-14',
    days: 5,
    relieverEmployeeId: relievers[0]?.employeeId || 'NYSC0033',
  });
  const validationMs = Date.now() - validationStarted;

  const essRequests = (await readAllEssRequests()).filter((item) =>
    employeeRequestMatches(nysc, item.employeeId) && /leave/i.test(item.category),
  );

  const pool = await getDleEnterpriseDbPool();
  let balances: unknown[] = [];
  if (pool) {
    const keys = [nysc.employeeId, nysc.employeeCode, 'NYSC0032', 'PNYSC0032'].filter(Boolean);
    const request = pool.request();
    keys.forEach((key, index) => request.input(`key${index}`, key));
    const result = await request.query(`
SELECT [EmployeeId],[LeaveType],[CurrentBalance],[PendingBalance],[UsedBalance],[AccruedBalance]
FROM [hris].[LeaveBalances]
WHERE [EmployeeId] IN (${keys.map((_, index) => `@key${index}`).join(', ')});`);
    balances = result.recordset || [];
  }

  console.log(JSON.stringify({
    employee: {
      employeeId: nysc.employeeId,
      employeeCode: nysc.employeeCode,
      fullName: nysc.fullName,
      department: nysc.department,
      reportingManager: (nysc as Record<string, unknown>).reportingManager || (nysc as Record<string, unknown>).managerName,
    },
    manager: manager ? { id: manager.employee.employeeId, code: manager.employee.employeeCode, label: manager.label, source: manager.source } : null,
    deptSupervisor,
    relieverSample: relievers.slice(0, 5).map((item) => ({ id: item.employeeId, code: item.employeeCode, name: item.fullName })),
    validation,
    validationMs,
    essLeaveRequests: essRequests.map((item) => ({ id: item.id, status: item.status, days: item.days, start: item.startDate, end: item.endDate })),
    dbBalances: balances,
  }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
