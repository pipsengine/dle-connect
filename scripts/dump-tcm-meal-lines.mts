import { loadWorkspaceEnv } from '../apps/dashboard/lib/dle-enterprise-db.ts';
import { invalidatePayrollEmployeeCache, readPayrollEmployees } from '../apps/dashboard/lib/payroll-employee-source.ts';
import { calculatePayrollEarnings } from '../apps/dashboard/lib/payroll-earnings-engine.ts';

loadWorkspaceEnv();

const codes = new Set(['L1939', 'L2763', 'L1940', 'L2772', 'L2611']);

const main = async () => {
  invalidatePayrollEmployeeCache();
  const src = await readPayrollEmployees();
  for (const employee of src.employees) {
    const code = String(employee.employeeCode || '');
    if (!codes.has(code)) continue;
    const stored = (employee.sagePayrollEarnings || []).map((line) => ({
      code: line.code,
      name: line.name,
      amount: line.amount,
      sourceAmount: line.sourceAmount,
      runFrequency: line.runFrequency,
    }));
    const pay = calculatePayrollEarnings(employee, {
      useHrisPackageLines: true,
      includePeriodAdjustments: true,
      period: '2026-09',
    });
    console.log(JSON.stringify({
      code,
      name: employee.fullName,
      profile: pay.profileId,
      gross: pay.grossPay,
      stored,
      paid: pay.paidEarningLines.map((line) => ({
        code: line.code,
        name: line.name,
        amount: line.amount,
        calculation: line.calculation,
      })),
    }, null, 2));
  }
  process.exit(0);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
