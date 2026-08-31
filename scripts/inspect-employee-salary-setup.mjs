/*
  Read-only dump of an employee's salary setup, including the USD primary package and
  the NGN "local" mirror used for dual-currency staff, plus any PAYE override held in
  payroll-employee-options.json.

  Usage: node scripts/inspect-employee-salary-setup.mjs P0458 P0364
*/

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sql from 'mssql';

for (const file of [resolve('.env'), resolve('apps/dashboard/.env'), resolve('apps/dashboard/.env.local')]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}

const codes = process.argv.slice(2);
if (!codes.length) throw new Error('Pass at least one employee code.');

const pool = await sql.connect({
  server: process.env.DLE_ENTERPRISE_DB_HOST,
  port: Number(process.env.DLE_ENTERPRISE_DB_PORT || 1433),
  database: process.env.DLE_ENTERPRISE_DB_NAME || 'DLE_Enterprise',
  user: process.env.DLE_ENTERPRISE_DB_USER,
  password: process.env.DLE_ENTERPRISE_DB_PASSWORD,
  options: {
    encrypt: String(process.env.DLE_ENTERPRISE_DB_ENCRYPT || 'true') === 'true',
    trustServerCertificate: String(process.env.DLE_ENTERPRISE_DB_TRUST_SERVER_CERTIFICATE || 'true') === 'true',
  },
});

const money = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

const lines = (json) => {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const printLines = (label, json) => {
  const rows = lines(json);
  const total = rows.reduce((s, l) => s + Number(l.amount || 0), 0);
  console.log(`    ${label} (${rows.length} lines, total ${money(total)})`);
  for (const l of rows) {
    const taxable = l.taxableAmount !== undefined ? `  taxable=${money(l.taxableAmount)}` : '';
    console.log(`      ${String(l.code || '').padEnd(20)} ${String(l.name || '').padEnd(34)} ${money(l.amount).padStart(14)}${taxable}`);
  }
};

const optionsPath = resolve('apps/dashboard/data/hris/payroll-employee-options.json');
const options = existsSync(optionsPath) ? JSON.parse(readFileSync(optionsPath, 'utf8')) : [];

for (const code of codes) {
  const rs = await pool.request().input('code', sql.NVarChar(50), code).query(`
    SELECT e.employee_id, e.employee_code, e.full_name, e.employment_status, e.employment_type,
      ji.department, ji.job_title, ji.job_grade, ji.business_unit,
      p.payroll_group, p.pay_currency, p.salary_grade, p.benefit_group, p.payment_type, p.payment_run,
      p.basic_salary, p.period_salary, p.annual_salary, p.pay_frequency,
      p.latest_allowances, p.latest_deductions, p.setup_assigned_to_payroll,
      p.rate_per_day, p.rate_per_hour, p.hours_per_day,
      p.sage_payslip_period, p.sage_payslip_synced_at,
      CAST(p.sage_earning_lines_json AS NVARCHAR(MAX)) AS earn_json,
      CAST(p.sage_deduction_lines_json AS NVARCHAR(MAX)) AS ded_json,
      CAST(p.sage_contribution_lines_json AS NVARCHAR(MAX)) AS cont_json,
      p.sage_local_payroll_group, p.sage_local_pay_currency, p.sage_local_period_salary, p.sage_local_latest_deductions,
      CAST(p.sage_local_earning_lines_json AS NVARCHAR(MAX)) AS local_earn_json,
      CAST(p.sage_local_deduction_lines_json AS NVARCHAR(MAX)) AS local_ded_json,
      CAST(p.sage_local_contribution_lines_json AS NVARCHAR(MAX)) AS local_cont_json
    FROM hris.Employees e
    LEFT JOIN hris.EmployeePayrollSetup p ON p.employee_id = e.employee_id
    LEFT JOIN hris.EmployeeJobInfo ji ON ji.employee_id = e.employee_id
    WHERE e.employee_code = @code OR e.employee_code = @code + '-USD'
    ORDER BY e.employee_code
  `);

  if (!rs.recordset.length) {
    console.log(`\n================ ${code}: NOT FOUND`);
    continue;
  }

  for (const r of rs.recordset) {
    console.log(`\n================ ${r.employee_code}  ${r.full_name}`);
    console.log(`  ${r.employment_status} / ${r.employment_type} | ${r.department || '—'} | ${r.job_title || '—'} | grade ${r.job_grade || '—'} | BU ${r.business_unit || '—'}`);
    if (!r.payroll_group && !r.pay_currency) {
      console.log('  no EmployeePayrollSetup row');
      continue;
    }
    console.log(`\n  PRIMARY package`);
    console.log(`    payroll_group=${r.payroll_group}  pay_currency=${r.pay_currency}  salary_grade=${r.salary_grade}`);
    console.log(`    basic=${money(r.basic_salary)}  period=${money(r.period_salary)}  annual=${money(r.annual_salary)}  frequency=${r.pay_frequency || '—'}`);
    console.log(`    benefit_group=${r.benefit_group || '—'}  payment_type=${r.payment_type || '—'}  payment_run=${r.payment_run || '—'}  assigned=${r.setup_assigned_to_payroll}`);
    console.log(`    latest_allowances=${money(r.latest_allowances)}  latest_deductions=${money(r.latest_deductions)}`);
    console.log(`    sage_payslip_period=${r.sage_payslip_period || '—'}  synced_at=${r.sage_payslip_synced_at || '—'}`);
    printLines('earnings', r.earn_json);
    printLines('deductions', r.ded_json);
    printLines('contributions', r.cont_json);

    console.log(`\n  LOCAL (mirror) package`);
    console.log(`    sage_local_payroll_group=${r.sage_local_payroll_group || '—'}  sage_local_pay_currency=${r.sage_local_pay_currency || '—'}`);
    console.log(`    sage_local_period_salary=${money(r.sage_local_period_salary)}  sage_local_latest_deductions=${money(r.sage_local_latest_deductions)}`);
    printLines('local earnings', r.local_earn_json);
    printLines('local deductions', r.local_ded_json);
    printLines('local contributions', r.local_cont_json);

    const opt = options.find((o) => String(o.employeeCode || '').toUpperCase() === String(r.employee_code).toUpperCase());
    console.log(`\n  payroll-employee-options.json: ${opt ? JSON.stringify(opt, null, 2).split('\n').join('\n    ') : 'no entry'}`);
  }
}

if (process.argv.includes('--periods')) {
  const periods = await pool.request().query(`
    SELECT TOP 6 period_code, period_label, period_status, payment_date, closed_at
    FROM hris.PayrollPeriods
    ORDER BY period_code DESC
  `);
  console.log('\n================ payroll periods');
  for (const p of periods.recordset) {
    console.log(`  ${p.period_code}  ${String(p.period_status).padEnd(12)} ${p.period_label}  payment=${p.payment_date ? String(p.payment_date).slice(0, 10) : '—'}  closed=${p.closed_at || '—'}`);
  }
}

await pool.close();
process.exit(0);
