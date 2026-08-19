/**
 * P0457 Austen-Peters: HR confirmed USD package is $1,000 gross and $1,000 net.
 * Sage PAYE_EXP is 0; Connect had been showing $1,220 basic and 21.2% PAYE.
 *
 * Usage:
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/fix-p0457-usd-package.mts
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/fix-p0457-usd-package.mts --apply
 */
import sql from 'mssql';
import { getDleEnterpriseDbPool, loadWorkspaceEnv } from '../lib/dle-enterprise-db.ts';
import { invalidatePayrollEmployeeCache } from '../lib/payroll-employee-source.ts';
import { invalidatePayrollCalculationCache } from '../lib/payroll-calculation-service.ts';

loadWorkspaceEnv();

const APPLY = process.argv.includes('--apply');
const USD_GROSS = 1000;
const EARNING_LINES = [{ code: 'BASIC', name: 'BASIC SALARY', amount: USD_GROSS, taxableAmount: USD_GROSS }];
const DEDUCTION_LINES: Array<{ code: string; name: string; amount: number }> = [];
const CONTRIBUTION_LINES = [
  { code: 'PENSION_ER', name: 'PENSION_ER', amount: 0 },
  { code: 'NSITF', name: 'NSITF', amount: 10 },
  { code: 'ITF_LEVY', name: 'ITF_LEVY', amount: 10 },
];

const main = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('No DLE enterprise DB pool');

  const rs = await pool.request().query(`
SELECT TOP (1)
  e.employee_id,
  e.employee_code,
  e.full_name,
  p.period_salary,
  p.basic_salary,
  p.latest_deductions,
  p.sage_earning_lines_json
FROM hris.Employees e
LEFT JOIN hris.EmployeePayrollSetup p ON p.employee_id = e.employee_id
WHERE REPLACE(UPPER(LTRIM(RTRIM(e.employee_code))), '_', '') IN (N'P0457', N'0457')
ORDER BY e.employee_id
`);
  const row = rs.recordset[0];
  if (!row) throw new Error('P0457 not found in HRIS');

  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`Found ${row.employee_code} ${row.full_name}`);
  console.log(`Current period/basic/deductions: ${row.period_salary} / ${row.basic_salary} / ${row.latest_deductions}`);
  console.log(`Target: USD gross ${USD_GROSS}, PAYE 0, net ${USD_GROSS}`);

  if (APPLY) {
    await pool.request()
      .input('employee_id', sql.BigInt, row.employee_id)
      .input('period_salary', sql.Decimal(19, 4), USD_GROSS)
      .input('basic_salary', sql.Decimal(19, 4), USD_GROSS)
      .input('annual_salary', sql.Decimal(19, 4), USD_GROSS * 12)
      .input('latest_deductions', sql.Decimal(19, 4), 0)
      .input('sage_earning_lines_json', sql.NVarChar(sql.MAX), JSON.stringify(EARNING_LINES))
      .input('sage_deduction_lines_json', sql.NVarChar(sql.MAX), JSON.stringify(DEDUCTION_LINES))
      .input('sage_contribution_lines_json', sql.NVarChar(sql.MAX), JSON.stringify(CONTRIBUTION_LINES))
      .query(`
UPDATE hris.EmployeePayrollSetup
SET period_salary = @period_salary,
    basic_salary = @basic_salary,
    annual_salary = @annual_salary,
    latest_deductions = @latest_deductions,
    sage_earning_lines_json = @sage_earning_lines_json,
    sage_deduction_lines_json = @sage_deduction_lines_json,
    sage_contribution_lines_json = @sage_contribution_lines_json,
    sage_payslip_synced_at = SYSUTCDATETIME(),
    setup_assigned_to_payroll = 1,
    modified_at = SYSUTCDATETIME()
WHERE employee_id = @employee_id
`);
    invalidatePayrollEmployeeCache();
    invalidatePayrollCalculationCache();
    console.log('Applied P0457 USD package $1,000 gross / $0 PAYE / $1,000 net.');
  } else {
    console.log('Dry-run only. Re-run with --apply to write.');
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).then(() => process.exit(0));
