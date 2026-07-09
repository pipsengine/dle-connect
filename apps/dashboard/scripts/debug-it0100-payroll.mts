import { loadWorkspaceEnv } from '../lib/dle-enterprise-db.ts';

loadWorkspaceEnv();

const code = String(process.argv[2] || 'IT0100').toUpperCase();
const period = String(process.argv[3] || '2026-06');
const applyFix = process.argv.includes('--fix');

const { readEmployeeDirectoryFromDb, repairStipendPayrollSetupInDb } = await import('../lib/dle-enterprise-db.ts');
const { invalidatePayrollEmployeeCache, readPayrollEmployees } = await import('../lib/payroll-employee-source.ts');
const { calculatePayrollForPeriod } = await import('../lib/payroll-calculation-service.ts');
const { calculatePayrollEarnings, monthlyGrossFromEmployee, resolvePayrollEarningProfile } = await import('../lib/payroll-earnings-engine.ts');

const employees = await readEmployeeDirectoryFromDb();
const directoryRow = employees?.find((e) => String(e.employeeCode || e.employeeId).toUpperCase() === code);
if (!directoryRow?.employeeDbId) {
  console.error(`${code} not found in employee directory`);
  process.exit(1);
}

if (applyFix) {
  const repaired = await repairStipendPayrollSetupInDb({
    employeeDbId: directoryRow.employeeDbId,
  });
  invalidatePayrollEmployeeCache();
  console.log(`repairStipendPayrollSetupInDb(${code}):`, repaired ? 'ok' : 'failed');
}

const src = await readPayrollEmployees();
const emp = src.employees.find((e) => String(e.employeeCode || e.employeeId).toUpperCase() === code);
if (!emp) {
  console.error(`${code} not found among ${src.employees.length} payroll employees`);
  process.exit(1);
}

const earnings = calculatePayrollEarnings(emp, {
  period,
  includePeriodAdjustments: true,
  ignoreSagePayslipLines: true,
});

const calc = await calculatePayrollForPeriod(period);
const record = calc.records.find((r) => String(r.employeeCode || r.employeeId).toUpperCase() === code);

console.log(
  JSON.stringify(
    {
      source: src.source,
      employee: {
        employeeCode: emp.employeeCode,
        fullName: emp.fullName,
        grade: emp.jobGrade || emp.salaryGrade,
        employmentType: emp.employmentType,
        payrollGroup: emp.payrollGroup,
        periodSalary: emp.periodSalary,
        basicSalary: emp.basicSalary,
        annualSalary: emp.annualSalary,
        setupAssignedToPayroll: emp.setupAssignedToPayroll,
        payCurrency: emp.payCurrency,
        status: emp.status,
        sageEarningsCount: emp.sagePayrollEarnings?.length || 0,
      },
      profileId: resolvePayrollEarningProfile(emp),
      monthlyGross: monthlyGrossFromEmployee(emp),
      earningsGross: earnings.grossPay,
      record: record
        ? {
            grossPay: record.grossPay,
            exceptions: record.exceptions,
            deferredWarnings: record.deferredWarnings,
            payrollStatus: record.payrollStatus,
            readinessStatus: record.readinessStatus,
          }
        : null,
    },
    null,
    2,
  ),
);
