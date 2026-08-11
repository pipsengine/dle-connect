/**
 * Mark IT / NYSC July stipend earning lines as non-taxable (taxableAmount = 0).
 * Only the 34 codes present on JULY PAYROLL Cont. Staff as Intern / NYSC.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import sql from 'mssql';
import { getDleEnterpriseDbPool, loadWorkspaceEnv } from '../lib/dle-enterprise-db.ts';
import { invalidatePayrollEmployeeCache } from '../lib/payroll-employee-source.ts';
import { invalidatePayrollCalculationCache } from '../lib/payroll-calculation-service.ts';

loadWorkspaceEnv();

const APPLY = process.argv.includes('--apply');
const XLSX = path.join(process.cwd(), 'backups', 'Dayrate Payment Schedule', 'JULY PAYROLL.xlsx');

const stipendCodesFromJuly = (): string[] => {
  const escaped = XLSX.replace(/\\/g, '\\\\');
  const py = `
from openpyxl import load_workbook
import json
path = r'''${escaped}'''
wb = load_workbook(path, data_only=True, read_only=True)
ws = wb['Cont. Staff']
rows = list(ws.iter_rows(values_only=True))
headers = [str(c or '').strip() for c in rows[0]]
idx = {h:i for i,h in enumerate(headers)}
out = []
for row in rows[1:]:
  code = str(row[idx.get('Employee Code', 0)] or '').strip().upper()
  cont = str(row[idx.get('Cont Type', 1)] or '').strip().upper()
  surname = str(row[idx.get('EmployeeSurname', 2)] or '').strip()
  first = str(row[idx.get('EmployeeFirstName', 3)] or '').strip()
  if not code or (not surname and not first): continue
  if 'NYSC' in cont or code.startswith('N') or 'INTERN' in cont or code.startswith('IT') or code.startswith('I'):
    if 'LUMP' in cont: continue
    out.append(code)
print(json.dumps(out))
`;
  const result = spawnSync('python', ['-c', py], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'excel read failed');
  return JSON.parse(result.stdout) as string[];
};

const pool = await getDleEnterpriseDbPool();
if (!pool) throw new Error('no pool');
const codes = stipendCodesFromJuly();
console.log(`July stipend codes: ${codes.length}`, codes.join(', '));
console.log(APPLY ? 'APPLY' : 'DRY-RUN');

let updated = 0;
for (const code of codes) {
  const rs = await pool.request()
    .input('code', sql.NVarChar(50), code)
    .query(`
SELECT e.employee_id, e.employee_code, p.sage_earning_lines_json
FROM hris.Employees e
JOIN hris.EmployeePayrollSetup p ON p.employee_id = e.employee_id
WHERE UPPER(LTRIM(RTRIM(e.employee_code))) = @code
`);
  const row = rs.recordset[0];
  if (!row) {
    console.log('missing', code);
    continue;
  }
  let lines: Array<Record<string, unknown>> = [];
  try {
    lines = JSON.parse(row.sage_earning_lines_json || '[]');
  } catch {
    continue;
  }
  if (!Array.isArray(lines) || !lines.length) continue;
  const next = lines.map((line) => ({ ...line, taxableAmount: 0 }));
  if (JSON.stringify(lines) === JSON.stringify(next)) continue;
  console.log('would fix', row.employee_code, 'lines', next.length);
  if (!APPLY) continue;
  await pool.request()
    .input('id', sql.BigInt, row.employee_id)
    .input('json', sql.NVarChar(sql.MAX), JSON.stringify(next))
    .query(`
UPDATE hris.EmployeePayrollSetup
SET sage_earning_lines_json = @json, modified_at = SYSUTCDATETIME()
WHERE employee_id = @id
`);
  updated += 1;
}

if (APPLY) {
  invalidatePayrollEmployeeCache();
  invalidatePayrollCalculationCache('2026-07');
}
console.log('updated', updated);
process.exit(0);
