/*
  Replicate one employee's salary setup onto another, covering the USD primary package,
  the NGN local mirror, and the PAYE/NHF options entry.

  Dry run (default, no writes):
    node scripts/replicate-employee-salary-setup.mjs --from P0458 --to P0364

  Apply:
    node scripts/replicate-employee-salary-setup.mjs --from P0458 --to P0364 --apply

  Options:
    --keep-nhf        leave the target's nhfApplicable flag as it is
    --earnings-only   copy earning lines only, leave deduction/contribution lines alone
    --no-options      do not touch payroll-employee-options.json
*/

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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

const flag = (name) => process.argv.includes(name);
const arg = (name, fallback = '') => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || '') : fallback;
};

const sourceCode = arg('--from');
const targetCode = arg('--to');
if (!sourceCode || !targetCode) throw new Error('Pass --from <code> and --to <code>.');

const apply = flag('--apply');
const keepNhf = flag('--keep-nhf');
const earningsOnly = flag('--earnings-only');
const touchOptions = !flag('--no-options');

const money = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

const SETUP_COLUMNS = [
  'basic_salary',
  'period_salary',
  'annual_salary',
  'latest_allowances',
  'latest_deductions',
  'sage_local_period_salary',
  'sage_local_latest_deductions',
];

const EARNING_JSON_COLUMNS = ['sage_earning_lines_json', 'sage_local_earning_lines_json'];
const OTHER_JSON_COLUMNS = [
  'sage_deduction_lines_json',
  'sage_contribution_lines_json',
  'sage_local_deduction_lines_json',
  'sage_local_contribution_lines_json',
];

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

const jsonColumns = earningsOnly ? EARNING_JSON_COLUMNS : [...EARNING_JSON_COLUMNS, ...OTHER_JSON_COLUMNS];

const readSetup = async (code) => {
  const result = await pool.request().input('code', sql.NVarChar(50), code).query(`
    SELECT e.employee_id, e.employee_code, e.full_name,
      p.payroll_group, p.pay_currency, p.salary_grade,
      ${SETUP_COLUMNS.join(', ')},
      ${[...EARNING_JSON_COLUMNS, ...OTHER_JSON_COLUMNS].map((column) => `CAST(p.${column} AS NVARCHAR(MAX)) AS ${column}`).join(', ')}
    FROM hris.Employees e
    INNER JOIN hris.EmployeePayrollSetup p ON p.employee_id = e.employee_id
    WHERE e.employee_code = @code
  `);
  if (!result.recordset.length) throw new Error(`No payroll setup found for ${code}.`);
  return result.recordset[0];
};

const source = await readSetup(sourceCode);
const target = await readSetup(targetCode);

const lineTotal = (json) => {
  try {
    const parsed = JSON.parse(json || '[]');
    return Array.isArray(parsed) ? parsed.reduce((sum, line) => sum + Number(line.amount || 0), 0) : 0;
  } catch {
    return 0;
  }
};

console.log(`Replicating ${source.employee_code} (${source.full_name}) onto ${target.employee_code} (${target.full_name})`);
console.log(`Mode: ${apply ? 'APPLY — writing to DLE_Enterprise' : 'DRY RUN — no writes'}`);
console.log('');
console.log('Numeric columns');
for (const column of SETUP_COLUMNS) {
  const before = target[column];
  const after = source[column];
  const changed = Number(before ?? 0) !== Number(after ?? 0);
  console.log(`  ${column.padEnd(30)} ${money(before).padStart(18)} -> ${money(after).padStart(18)}${changed ? '  CHANGED' : ''}`);
}
console.log('');
console.log('Line sets');
for (const column of [...EARNING_JSON_COLUMNS, ...OTHER_JSON_COLUMNS]) {
  const copied = jsonColumns.includes(column);
  console.log(`  ${column.padEnd(34)} ${money(lineTotal(target[column])).padStart(18)} -> ${copied ? money(lineTotal(source[column])).padStart(18) : 'unchanged'.padStart(18)}`);
}

if (apply) {
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const request = new sql.Request(transaction);
    request.input('employeeId', sql.NVarChar(50), target.employee_id);
    const assignments = [];
    for (const column of SETUP_COLUMNS) {
      request.input(column, sql.Decimal(18, 2), source[column] === null || source[column] === undefined ? null : Number(source[column]));
      assignments.push(`${column} = @${column}`);
    }
    for (const column of jsonColumns) {
      request.input(column, sql.NVarChar(sql.MAX), source[column] ?? null);
      assignments.push(`${column} = @${column}`);
    }
    await request.query(`
      UPDATE hris.EmployeePayrollSetup
      SET ${assignments.join(', ')}, modified_at = SYSUTCDATETIME()
      WHERE employee_id = @employeeId
    `);
    await transaction.commit();
    console.log('');
    console.log('Payroll setup updated.');
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

if (touchOptions) {
  const optionsPath = resolve('apps/dashboard/data/hris/payroll-employee-options.json');
  const options = existsSync(optionsPath) ? JSON.parse(readFileSync(optionsPath, 'utf8')) : [];
  const sourceOption = options.find((row) => String(row.employeeCode || '').toUpperCase() === sourceCode.toUpperCase());
  const targetIndex = options.findIndex((row) => String(row.employeeCode || '').toUpperCase() === targetCode.toUpperCase());
  const targetOption = targetIndex >= 0 ? options[targetIndex] : null;

  const next = {
    ...(targetOption || {}),
    employeeId: targetOption?.employeeId || target.employee_id,
    employeeCode: target.employee_code,
    nhfApplicable: keepNhf ? Boolean(targetOption?.nhfApplicable) : Boolean(sourceOption?.nhfApplicable),
    updatedAt: new Date().toISOString(),
    updatedBy: `${target.employee_code} salary replicated from ${source.employee_code}`,
    payeCalculation: {
      ...(sourceOption?.payeCalculation || {}),
    },
  };
  // The target's stale NGN override was computed against the old package and would
  // freeze PAYE at the wrong figure, so it only survives if the source carries one.
  if (!sourceOption?.payeCalculation?.ngnMonthlyPayeOverride) delete next.payeCalculation.ngnMonthlyPayeOverride;

  console.log('');
  console.log('payroll-employee-options.json');
  console.log(`  before: ${JSON.stringify(targetOption)}`);
  console.log(`  after : ${JSON.stringify(next)}`);

  if (apply) {
    if (targetIndex >= 0) options[targetIndex] = next;
    else options.push(next);
    writeFileSync(optionsPath, `${JSON.stringify(options, null, 2)}\n`, 'utf8');
    console.log('  written.');
  }
}

console.log('');
console.log(apply
  ? 'Done. Re-run the August salaried payroll so the new package feeds the run.'
  : 'Dry run only. Re-run with --apply to write these changes.');

await pool.close();
process.exit(0);
