import fs from 'node:fs';
import path from 'node:path';
import sql from 'mssql';

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
for (const file of [path.resolve('.env'), path.resolve('..', '.env'), path.resolve('..', '..', '.env')]) load(file);

const codes = ['L1940','L1986','L2125','L2144','L2191','L2214','L2289','L2331','L2336','L2347','L2580','L2635','L2729','L2771','P0272','P0436'];
const pool = await sql.connect({
  server: process.env.DLE_ENTERPRISE_DB_HOST,
  port: Number(process.env.DLE_ENTERPRISE_DB_PORT || 1433),
  database: process.env.DLE_ENTERPRISE_DB_NAME || 'DLE_Enterprise',
  user: process.env.DLE_ENTERPRISE_DB_USER,
  password: process.env.DLE_ENTERPRISE_DB_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true },
});
const list = codes.map((c) => `'${c}'`).join(',');
const result = await pool.request().query(`
  SELECT e.employee_code, payroll.sage_earning_lines_json
  FROM hris.Employees e
  LEFT JOIN hris.EmployeePayrollSetup payroll ON payroll.employee_id = e.employee_id
  WHERE e.employee_code IN (${list})
`);
for (const row of result.recordset) {
  const lines = JSON.parse(row.sage_earning_lines_json || '[]');
  const brief = lines.map((line) => `${line.code}:${line.amount}${line.payrollPeriod ? '@' + line.payrollPeriod : ''}`).join(', ');
  console.log(row.employee_code, brief || '(no lines)');
}
await pool.close();

const adjPath = [path.resolve('data', 'hris', 'payroll-period-earning-adjustments.json'), path.resolve('..', 'data', 'hris', 'payroll-period-earning-adjustments.json')].find((file) => fs.existsSync(file));
const adj = JSON.parse(fs.readFileSync(adjPath, 'utf8'));
const want = new Set(codes);
for (const row of adj) {
  const code = String(row.employeeCode || row.employeeId || '');
  if (row.period === '2026-09' && [...want].some((item) => code.toUpperCase().includes(item.replace(/^P/, '')) && /L|P|\d/.test(code))) {
    if (codes.some((item) => code.toUpperCase() === item || code.toUpperCase() === item.replace(/^P/, ''))) {
      console.log('ADJ', row.employeeCode, row.code, row.amount);
    }
  }
}
process.exit(0);
