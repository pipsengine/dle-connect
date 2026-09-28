import fs from 'node:fs';
import path from 'node:path';
import sql from 'mssql';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const load = (file) => {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[k] === undefined) process.env[k] = v;
  }
};
for (const file of ['F:\\Dorman-Long\\dle-connect\\.env', path.resolve('.env'), path.resolve('..', '.env')]) load(file);
if (!process.env.DLE_ENTERPRISE_DB_HOST) {
  console.error('no db host');
  process.exit(1);
}

const pool = await sql.connect({
  server: process.env.DLE_ENTERPRISE_DB_HOST,
  database: process.env.DLE_ENTERPRISE_DB_NAME || 'DLE_Enterprise',
  user: process.env.DLE_ENTERPRISE_DB_USER,
  password: process.env.DLE_ENTERPRISE_DB_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true },
});
const result = await pool.request().query(`
  SELECT e.employee_code, payroll.sage_earning_lines_json
  FROM hris.Employees e
  JOIN hris.EmployeePayrollSetup payroll ON payroll.employee_id = e.employee_id
  WHERE e.employee_code IN ('P0027','P0272','P0309')
`);
for (const row of result.recordset) {
  const lines = JSON.parse(row.sage_earning_lines_json || '[]');
  console.log('\nPKG', row.employee_code);
  for (const line of lines) console.log(' ', line.code, line.name, line.amount, line.payrollPeriod || '');
}
await pool.close();

const wb = XLSX.readFile('G:\\Files Implementations\\DLE_SEPTEMBER 2026 SALARY SCHEDULE.xlsx', { cellFormula: true });
const ws = wb.Sheets['PERM STAFF'];
const range = XLSX.utils.decode_range(ws['!ref']);
for (let r = 1; r <= range.e.r; r++) {
  const code = String(ws[XLSX.utils.encode_cell({ r, c: 0 })]?.v ?? '').replace(/\s/g, '');
  if (!['0027', '0272', '0309'].includes(code)) continue;
  const gross = ws[XLSX.utils.encode_cell({ r, c: 55 })]?.v;
  const paye = ws[XLSX.utils.encode_cell({ r, c: 39 })]?.v;
  const pension = ws[XLSX.utils.encode_cell({ r, c: 41 })]?.v;
  const nhf = ws[XLSX.utils.encode_cell({ r, c: 38 })]?.v;
  const union = ws[XLSX.utils.encode_cell({ r, c: 43 })]?.v;
  const ded = ws[XLSX.utils.encode_cell({ r, c: 44 })]?.v;
  const net = ws[XLSX.utils.encode_cell({ r, c: 56 })]?.v;
  console.log('SHEET', code, { gross, paye, pension, nhf, union, ded, net });
}
process.exit(0);
