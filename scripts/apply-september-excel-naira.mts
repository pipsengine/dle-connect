/**
 * Write the September 2026 Excel naira packages onto the local payroll leg.
 * Run: npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/apply-september-excel-naira.mts
 */
import fs from 'node:fs';
import path from 'node:path';
import { upsertEmployeePayrollPackageFromScheduleInDb } from '../apps/dashboard/lib/dle-enterprise-db';
import { readPayrollEmployees, invalidatePayrollEmployeeCache } from '../apps/dashboard/lib/payroll-employee-source';
import { SEPTEMBER_EXCEL_NAIRA_PACKAGES } from '../apps/dashboard/lib/september-excel-naira-package';
import { salaryScheduleEmployeeKeys } from '../apps/dashboard/lib/salary-schedule-xlsx';

const loadWorkspaceEnv = () => {
  for (const file of [path.resolve('.env'), path.resolve('apps/dashboard/.env')]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (!process.env[match[1]]) process.env[match[1]] = value;
    }
  }
};

const main = async () => {
  loadWorkspaceEnv();
  if (!process.env.DLE_ENTERPRISE_DB_HOST || !process.env.DLE_ENTERPRISE_DB_PASSWORD) {
    console.log('database-skipped');
    return;
  }
  invalidatePayrollEmployeeCache();
  const source = await readPayrollEmployees();
  const byKey = new Map<string, (typeof source.employees)[number]>();
  for (const employee of source.employees) {
    for (const key of salaryScheduleEmployeeKeys(String(employee.employeeCode || employee.employeeId || ''))) {
      if (!byKey.has(key)) byKey.set(key, employee);
    }
  }
  for (const pack of SEPTEMBER_EXCEL_NAIRA_PACKAGES) {
    const employee = salaryScheduleEmployeeKeys(pack.employeeCode).map((key) => byKey.get(key)).find(Boolean);
    if (!employee?.employeeDbId) {
      console.log(`${pack.employeeCode} not-found`);
      continue;
    }
    const earnings = pack.lines.map((item) => ({
      code: item.code,
      name: item.name,
      amount: item.amount,
      sourceAmount: item.amount,
      taxableAmount: item.amount,
      runFrequency: 'monthly' as const,
      includeInMonthlyPayroll: true,
      ytdTotal: 0,
    }));
    const saved = await upsertEmployeePayrollPackageFromScheduleInDb({
      employeeDbId: employee.employeeDbId,
      writeLocalNgnPackage: true,
      localPayrollGroup: 'DLE',
      localPayCurrency: 'NGN',
      localPeriodSalary: pack.grossNgn,
      sageLocalEarningLinesJson: JSON.stringify(earnings),
    });
    console.log(`${pack.employeeCode} ${saved ? 'saved' : 'not-saved'} gross ${pack.grossNgn}`);
  }
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
