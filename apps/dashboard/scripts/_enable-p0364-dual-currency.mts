/**
 * Enable P0364 (Nkeiru Mgbeoji) dual-currency:
 * - Primary = USD EXP_* package → payroll group DLE_USD
 * - Local = existing NGN SNM package → DLE / NGN
 *
 * Usage:
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/_enable-p0364-dual-currency.mts
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/_enable-p0364-dual-currency.mts --apply
 */
import sql from 'mssql';
import { getDleEnterpriseDbPool, loadWorkspaceEnv } from '../lib/dle-enterprise-db.ts';
import { invalidatePayrollEmployeeCache, invalidateDirectoryEmployeeCache } from '../lib/payroll-employee-source.ts';
import { invalidatePayrollCalculationCache } from '../lib/payroll-calculation-service.ts';
import { invalidatePayrollEmployeeOptionsCache } from '../lib/payroll-employee-options-store.ts';
import fs from 'node:fs';
import path from 'node:path';

loadWorkspaceEnv();

const APPLY = process.argv.includes('--apply');
const CODE = 'P0364';

const USD_GROSS = 22095.84;
const USD_LINES = [
  { code: 'EXP_BASIC_TAX', name: 'EXP_ SMGT BASIC', amount: 4419.17, taxableAmount: 4419.17 },
  { code: 'EXP_HOUSING_TAX', name: 'EXP_SMGT HOUSING', amount: 3314.38, taxableAmount: 3314.38 },
  { code: 'EXP_OTHALL', name: 'EXP_ SMGT OTHER ALLOWANCE', amount: 12152.71, taxableAmount: 12152.71 },
  { code: 'EXP_TRANSP', name: 'EXP_SNMG TRANSPORT', amount: 2209.58, taxableAmount: 2209.58 },
];
const USD_PAYE = 5101.79;
const USD_GRADE = 'EXP_USDSNMGT - USD SENIOR MANAGEMENT';

const pool = await getDleEnterpriseDbPool();
if (!pool) throw new Error('No DB pool');

const current = await pool.request().input('code', sql.NVarChar(40), CODE).query(`
SELECT e.employee_id, e.employee_code, e.full_name,
  p.payroll_group, p.pay_currency, p.salary_grade, p.period_salary, p.basic_salary, p.annual_salary,
  p.latest_deductions,
  CAST(p.sage_earning_lines_json AS NVARCHAR(MAX)) AS earn_json,
  CAST(p.sage_deduction_lines_json AS NVARCHAR(MAX)) AS ded_json,
  CAST(p.sage_contribution_lines_json AS NVARCHAR(MAX)) AS cont_json,
  p.sage_local_payroll_group, p.sage_local_pay_currency, p.sage_local_period_salary,
  CAST(p.sage_local_earning_lines_json AS NVARCHAR(MAX)) AS local_earn_json
FROM hris.Employees e
JOIN hris.EmployeePayrollSetup p ON p.employee_id = e.employee_id
WHERE e.employee_code = @code
`);

const row = current.recordset[0];
if (!row) throw new Error(`${CODE} not found`);

const ngnEarnings = row.earn_json ? JSON.parse(row.earn_json) : [];
const ngnDeductions = row.ded_json ? JSON.parse(row.ded_json) : [];
const ngnContributions = row.cont_json ? JSON.parse(row.cont_json) : [];
const ngnGross = Number(row.period_salary || 0) > 100000 ? Number(row.period_salary) : ngnEarnings.reduce((s: number, l: any) => s + Number(l.amount || 0), 0);
// Prefer full gross from earning lines if period_salary is package-only
const earnSum = ngnEarnings.reduce((s: number, l: any) => s + Number(l.amount || 0), 0);

const plan = {
  employeeId: String(row.employee_id),
  name: row.full_name,
  before: {
    group: row.payroll_group,
    currency: row.pay_currency,
    grade: row.salary_grade,
    periodSalary: row.period_salary,
    localGroup: row.sage_local_payroll_group,
    earnPreview: String(row.earn_json || '').slice(0, 180),
  },
  after: {
    primary: { group: 'DLE_USD', currency: 'USD', grade: USD_GRADE, periodSalary: USD_GROSS, lines: USD_LINES },
    local: {
      group: 'DLE',
      currency: 'NGN',
      periodSalary: earnSum || ngnGross,
      latestDeductions: Number(row.latest_deductions || 0),
      earningCount: ngnEarnings.length,
      earnSum,
    },
    usdPayeOverride: USD_PAYE,
  },
};

console.log(JSON.stringify(plan, null, 2));

if (!APPLY) {
  console.log('\nDry-run only. Re-run with --apply to write.');
  process.exit(0);
}

const employeeId = row.employee_id;
await pool
  .request()
  .input('employee_id', sql.BigInt, employeeId)
  .input('payroll_group', sql.NVarChar(80), 'DLE_USD')
  .input('pay_currency', sql.NVarChar(10), 'USD')
  .input('salary_grade', sql.NVarChar(120), USD_GRADE)
  .input('period_salary', sql.Decimal(19, 4), USD_GROSS)
  .input('basic_salary', sql.Decimal(19, 4), 4419.17)
  .input('annual_salary', sql.Decimal(19, 4), Math.round(USD_GROSS * 12 * 100) / 100)
  .input('earn_json', sql.NVarChar(sql.MAX), JSON.stringify(USD_LINES))
  .input('ded_json', sql.NVarChar(sql.MAX), JSON.stringify([]))
  .input('cont_json', sql.NVarChar(sql.MAX), JSON.stringify([]))
  .input('local_group', sql.NVarChar(80), 'DLE')
  .input('local_currency', sql.NVarChar(10), 'NGN')
  .input('local_period', sql.Decimal(19, 4), earnSum || ngnGross)
  .input('local_deductions', sql.Decimal(19, 4), Number(row.latest_deductions || 0))
  .input('local_earn_json', sql.NVarChar(sql.MAX), JSON.stringify(ngnEarnings))
  .input('local_ded_json', sql.NVarChar(sql.MAX), JSON.stringify(ngnDeductions))
  .input('local_cont_json', sql.NVarChar(sql.MAX), JSON.stringify(ngnContributions))
  .query(`
UPDATE hris.EmployeePayrollSetup
SET payroll_group = @payroll_group,
    pay_currency = @pay_currency,
    salary_grade = @salary_grade,
    period_salary = @period_salary,
    basic_salary = @basic_salary,
    annual_salary = @annual_salary,
    sage_earning_lines_json = @earn_json,
    sage_deduction_lines_json = @ded_json,
    sage_contribution_lines_json = @cont_json,
    sage_local_payroll_group = @local_group,
    sage_local_pay_currency = @local_currency,
    sage_local_period_salary = @local_period,
    sage_local_latest_deductions = @local_deductions,
    sage_local_earning_lines_json = @local_earn_json,
    sage_local_deduction_lines_json = @local_ded_json,
    sage_local_contribution_lines_json = @local_cont_json,
    modified_at = SYSUTCDATETIME()
WHERE employee_id = @employee_id
`);

// Employee options: USD PAYE override; keep NGN NHF + rent relief
const optionsPath = path.join(process.cwd(), 'apps/dashboard/data/hris/payroll-employee-options.json');
const options = JSON.parse(fs.readFileSync(optionsPath, 'utf8')) as any[];
const idx = options.findIndex((o) => String(o.employeeCode).toUpperCase() === CODE || String(o.employeeId) === '0364');
if (idx < 0) throw new Error('P0364 missing from payroll-employee-options.json');
options[idx] = {
  ...options[idx],
  nhfApplicable: true,
  updatedAt: new Date().toISOString(),
  updatedBy: 'P0364 dual-currency USD enablement',
  payeCalculation: {
    excludedEarningCodes: [],
    includeRefundInTaxable: false,
    disablePensionPayeRelief: false,
    annualRentRelief: 500000,
    usdFlatRate: 0.22,
    monthlyPayeOverride: USD_PAYE,
  },
};
fs.writeFileSync(optionsPath, `${JSON.stringify(options, null, 2)}\n`);

invalidatePayrollEmployeeOptionsCache();
invalidateDirectoryEmployeeCache();
invalidatePayrollEmployeeCache();
invalidatePayrollCalculationCache('2026-07');

console.log('\nApplied. Caches invalidated for 2026-07.');
process.exit(0);
