/**
 * Deactivate listed HRIS employees who left (not on July payroll).
 * Sets employment_status = Inactive so they drop from payroll-active runs.
 *
 * Codes (user-confirmed): L1369, L2210, L2254, L2260, L2266, L2325, P0415, P0420, P0446
 * Left active: PEX001, P0413
 */
import { getDleEnterpriseDbPool, loadWorkspaceEnv } from '../lib/dle-enterprise-db.ts';

loadWorkspaceEnv();

const CODES = [
  'L1369',
  'L2210',
  'L2254',
  'L2260',
  'L2266',
  'L2325',
  'P0415',
  'P0420',
  'P0446',
] as const;

const pool = await getDleEnterpriseDbPool();
const selectReq = pool.request();
CODES.forEach((code, i) => selectReq.input(`c${i}`, code));
const existing = await selectReq.query(`
  SELECT employee_id, employee_code, full_name, employment_status, employment_type
  FROM hris.Employees
  WHERE UPPER(LTRIM(RTRIM(employee_code))) IN (${CODES.map((_, i) => `@c${i}`).join(', ')})
  ORDER BY employee_code
`);

console.log('BEFORE');
for (const row of existing.recordset) {
  console.log(`${row.employee_code}\t${row.full_name}\t${row.employment_status}`);
}

const found = new Set(existing.recordset.map((r: { employee_code: string }) => String(r.employee_code).toUpperCase()));
const missing = CODES.filter((c) => !found.has(c));
if (missing.length) console.error('NOT FOUND', missing);

const upd = pool.request();
CODES.forEach((code, i) => upd.input(`c${i}`, code));
const result = await upd.query(`
  UPDATE hris.Employees
  SET employment_status = N'Inactive',
      modified_at = SYSUTCDATETIME(),
      modified_by = SUSER_SNAME()
  WHERE UPPER(LTRIM(RTRIM(employee_code))) IN (${CODES.map((_, i) => `@c${i}`).join(', ')});

  SELECT @@ROWCOUNT AS updated_rows;

  SELECT employee_code, full_name, employment_status, employment_type
  FROM hris.Employees
  WHERE UPPER(LTRIM(RTRIM(employee_code))) IN (${CODES.map((_, i) => `@c${i}`).join(', ')})
  ORDER BY employee_code;
`);

const sets = result.recordsets as Array<Array<Record<string, unknown>>>;
console.log('UPDATED_ROWS', sets[0]?.[0]?.updated_rows);
console.log('AFTER');
for (const row of sets[1] || []) {
  console.log(`${row.employee_code}\t${row.full_name}\t${row.employment_status}`);
}
process.exit(0);
