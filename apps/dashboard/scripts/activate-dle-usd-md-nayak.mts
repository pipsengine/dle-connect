/**
 * Activate MD (P0413) + Nayak (PEX001) for DLE USD payroll display.
 * - Ensure Active employment status
 * - Clear payroll-run exclusions
 * - Put Nayak on DLE_USD / USD ($3,000 package from August Expatriate sheet)
 *
 * Usage:
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/activate-dle-usd-md-nayak.mts
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/activate-dle-usd-md-nayak.mts --apply
 */
import sql from 'mssql';
import { getDleEnterpriseDbPool, loadWorkspaceEnv } from '../lib/dle-enterprise-db.ts';
import { invalidateDirectoryEmployeeCache, invalidatePayrollEmployeeCache } from '../lib/payroll-employee-source.ts';
import { invalidatePayrollCalculationCache } from '../lib/payroll-calculation-service.ts';
import { invalidatePayrollEmployeeOptionsCache, writePayrollEmployeeOption } from '../lib/payroll-employee-options-store.ts';

loadWorkspaceEnv();

const APPLY = process.argv.includes('--apply');
const NAYAK_USD_GROSS = 3000;
const NAYAK_USD_PAYE = 616.91;
const NAYAK_LINES = [
  { code: 'EXP_BASIC', name: 'BASIC SALARY', amount: NAYAK_USD_GROSS, taxableAmount: NAYAK_USD_GROSS },
];

const pool = await getDleEnterpriseDbPool();
if (!pool) throw new Error('No DLE enterprise DB pool');

const before = await pool.request().query(`
SELECT e.employee_id, e.employee_code, e.full_name, e.employment_status, e.employment_type,
  p.payroll_group, p.pay_currency, p.period_salary, p.setup_assigned_to_payroll, p.salary_grade
FROM hris.Employees e
LEFT JOIN hris.EmployeePayrollSetup p ON p.employee_id = e.employee_id
WHERE e.employee_code IN (N'P0413', N'PEX001')
ORDER BY e.employee_code
`);
console.log('BEFORE');
console.log(JSON.stringify(before.recordset, null, 2));

if (!APPLY) {
  console.log('\nDry-run only. Re-run with --apply to write DB + options.');
  process.exit(0);
}

for (const code of ['P0413', 'PEX001'] as const) {
  await pool.request()
    .input('code', sql.NVarChar(40), code)
    .query(`
UPDATE hris.Employees
SET employment_status = N'Active',
    modified_at = SYSUTCDATETIME(),
    modified_by = SUSER_SNAME()
WHERE employee_code = @code
`);
}

const nayak = before.recordset.find((row: { employee_code: string }) => row.employee_code === 'PEX001');
if (!nayak) throw new Error('PEX001 not found');

await pool.request()
  .input('employee_id', sql.BigInt, nayak.employee_id)
  .input('payroll_group', sql.NVarChar(80), 'DLE_USD')
  .input('pay_currency', sql.NVarChar(10), 'USD')
  .input('salary_grade', sql.NVarChar(120), 'EXPAT_USD - EXPATRIATE USD')
  .input('period_salary', sql.Decimal(19, 4), NAYAK_USD_GROSS)
  .input('basic_salary', sql.Decimal(19, 4), NAYAK_USD_GROSS)
  .input('annual_salary', sql.Decimal(19, 4), NAYAK_USD_GROSS * 12)
  .input('latest_deductions', sql.Decimal(19, 4), NAYAK_USD_PAYE)
  .input('earn_json', sql.NVarChar(sql.MAX), JSON.stringify(NAYAK_LINES))
  .input('ded_json', sql.NVarChar(sql.MAX), JSON.stringify([{ code: 'PAYE_EXP', name: 'PAYE', amount: NAYAK_USD_PAYE }]))
  .input('cont_json', sql.NVarChar(sql.MAX), JSON.stringify([
    { code: 'ITF_LEVY', name: 'ITF Levy', amount: 30 },
    { code: 'NSITF', name: 'NSITF', amount: 30 },
  ]))
  .input('local_group', sql.NVarChar(80), 'DLE')
  .input('local_currency', sql.NVarChar(10), 'NGN')
  .input('local_period', sql.Decimal(19, 4), 269552.63)
  .query(`
UPDATE hris.EmployeePayrollSetup
SET payroll_group = @payroll_group,
    pay_currency = @pay_currency,
    salary_grade = @salary_grade,
    period_salary = @period_salary,
    basic_salary = @basic_salary,
    annual_salary = @annual_salary,
    latest_deductions = @latest_deductions,
    sage_earning_lines_json = @earn_json,
    sage_deduction_lines_json = @ded_json,
    sage_contribution_lines_json = @cont_json,
    sage_local_payroll_group = COALESCE(sage_local_payroll_group, @local_group),
    sage_local_pay_currency = COALESCE(sage_local_pay_currency, @local_currency),
    sage_local_period_salary = COALESCE(sage_local_period_salary, @local_period),
    setup_assigned_to_payroll = 1,
    sage_payslip_synced_at = SYSUTCDATETIME(),
    modified_at = SYSUTCDATETIME()
WHERE employee_id = @employee_id
`);

await writePayrollEmployeeOption({
  employeeId: '0413',
  employeeCode: 'P0413',
  excludedFromPayrollRun: false,
  setupAssignedToPayroll: true,
  payrollGroup: 'DLE_USD',
  nhfApplicable: false,
  updatedBy: 'Activate DLE USD MD/Nayak',
});
await writePayrollEmployeeOption({
  employeeId: 'EX001',
  employeeCode: 'PEX001',
  excludedFromPayrollRun: false,
  setupAssignedToPayroll: true,
  payrollGroup: 'DLE_USD',
  nhfApplicable: false,
  payeCalculation: {
    monthlyPayeOverride: NAYAK_USD_PAYE,
  },
  updatedBy: 'Activate DLE USD MD/Nayak',
});

invalidatePayrollEmployeeOptionsCache();
invalidatePayrollEmployeeCache();
invalidateDirectoryEmployeeCache();
invalidatePayrollCalculationCache();

const after = await pool.request().query(`
SELECT e.employee_code, e.full_name, e.employment_status,
  p.payroll_group, p.pay_currency, p.period_salary, p.setup_assigned_to_payroll, p.salary_grade
FROM hris.Employees e
LEFT JOIN hris.EmployeePayrollSetup p ON p.employee_id = e.employee_id
WHERE e.employee_code IN (N'P0413', N'PEX001')
ORDER BY e.employee_code
`);
console.log('\nAFTER');
console.log(JSON.stringify(after.recordset, null, 2));
console.log('Applied MD/Nayak DLE USD activation.');
process.exit(0);
