/**
 * Correct PIT / PNYSC stipend employees created or matched with a stray P prefix:
 * - rename code to IT0106 / NYSC0018 (etc.)
 * - employment_type Industrial Trainee / NYSC
 * - taxableAmount = 0 on stipend lines
 */
import sql from 'mssql';
import { getDleEnterpriseDbPool, loadWorkspaceEnv } from '../lib/dle-enterprise-db.ts';
import { invalidatePayrollEmployeeCache } from '../lib/payroll-employee-source.ts';
import { invalidatePayrollCalculationCache } from '../lib/payroll-calculation-service.ts';

loadWorkspaceEnv();
const APPLY = process.argv.includes('--apply');

const pool = await getDleEnterpriseDbPool();
if (!pool) throw new Error('no pool');

const rs = await pool.request().query(`
SELECT e.employee_id, e.employee_code, e.employment_type, p.sage_earning_lines_json
FROM hris.Employees e
JOIN hris.EmployeePayrollSetup p ON p.employee_id = e.employee_id
WHERE e.employee_code LIKE N'PIT%'
   OR e.employee_code LIKE N'PNYSC%'
   OR e.employee_code LIKE N'IT%'
   OR e.employee_code LIKE N'NYSC%'
`);

console.log(APPLY ? 'APPLY' : 'DRY-RUN', 'candidates', rs.recordset.length);

for (const row of rs.recordset) {
  const current = String(row.employee_code || '').toUpperCase();
  let target = current;
  let employmentType = row.employment_type as string;
  if (current.startsWith('PIT')) {
    target = current.slice(1);
    employmentType = 'Industrial Trainee';
  } else if (current.startsWith('PNYSC')) {
    target = current.slice(1);
    employmentType = 'NYSC';
  } else if (current.startsWith('IT')) {
    employmentType = 'Industrial Trainee';
  } else if (current.startsWith('NYSC')) {
    employmentType = 'NYSC';
  }

  let lines: Array<Record<string, unknown>> = [];
  try {
    lines = JSON.parse(row.sage_earning_lines_json || '[]');
  } catch {
    lines = [];
  }
  const nextLines = lines.map((line) => ({ ...line, taxableAmount: 0 }));
  const codeChange = target !== current;
  const typeChange = employmentType !== row.employment_type;
  const taxChange = JSON.stringify(lines) !== JSON.stringify(nextLines);
  if (!codeChange && !typeChange && !taxChange) continue;
  console.log(`${current} → ${target} | type ${row.employment_type} → ${employmentType} | nontaxable=${taxChange}`);

  if (!APPLY) continue;

  // Avoid unique collisions if target already exists
  if (codeChange) {
    const clash = await pool.request()
      .input('code', sql.NVarChar(50), target)
      .input('id', sql.BigInt, row.employee_id)
      .query(`
SELECT TOP 1 employee_id FROM hris.Employees
WHERE UPPER(LTRIM(RTRIM(employee_code))) = @code AND employee_id <> @id
`);
    if (clash.recordset[0]) {
      console.log('  skip rename — target exists', target);
    } else {
      await pool.request()
        .input('id', sql.BigInt, row.employee_id)
        .input('code', sql.NVarChar(50), target)
        .input('type', sql.NVarChar(40), employmentType)
        .query(`
UPDATE hris.Employees
SET employee_code = @code, employment_type = @type, modified_at = SYSUTCDATETIME()
WHERE employee_id = @id
`);
    }
  } else if (typeChange) {
    await pool.request()
      .input('id', sql.BigInt, row.employee_id)
      .input('type', sql.NVarChar(40), employmentType)
      .query(`
UPDATE hris.Employees
SET employment_type = @type, modified_at = SYSUTCDATETIME()
WHERE employee_id = @id
`);
  }

  if (taxChange || typeChange) {
    await pool.request()
      .input('id', sql.BigInt, row.employee_id)
      .input('json', sql.NVarChar(sql.MAX), JSON.stringify(nextLines))
      .query(`
UPDATE hris.EmployeePayrollSetup
SET sage_earning_lines_json = @json,
    pay_currency = N'NGN',
    payroll_group = COALESCE(NULLIF(payroll_group, N''), N'DLE'),
    modified_at = SYSUTCDATETIME()
WHERE employee_id = @id
`);
  }
}

if (APPLY) {
  invalidatePayrollEmployeeCache();
  invalidatePayrollCalculationCache('2026-07');
}
process.exit(0);
