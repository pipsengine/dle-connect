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

const oneOff = (code, name, amount) => ({
  code,
  name,
  amount,
  sourceAmount: amount,
  taxableAmount: amount,
  runFrequency: 'one-off',
  includeInMonthlyPayroll: false,
  payrollPeriod: '2026-09',
  ytdTotal: 0,
});

const pool = await sql.connect({
  server: process.env.DLE_ENTERPRISE_DB_HOST,
  port: Number(process.env.DLE_ENTERPRISE_DB_PORT || 1433),
  database: process.env.DLE_ENTERPRISE_DB_NAME || 'DLE_Enterprise',
  user: process.env.DLE_ENTERPRISE_DB_USER,
  password: process.env.DLE_ENTERPRISE_DB_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true },
});

const codes = ['L1986', 'L2125', 'L2191', 'L2289', 'L2331', 'L2580', 'L2635', 'L2729'];
const result = await pool.request().query(`
  SELECT e.employee_code, e.employee_id, payroll.sage_earning_lines_json
  FROM hris.Employees e
  JOIN hris.EmployeePayrollSetup payroll ON payroll.employee_id = e.employee_id
  WHERE e.employee_code IN (${codes.map((c) => `'${c}'`).join(',')})
`);

const tx = new sql.Transaction(pool);
await tx.begin();
try {
  for (const row of result.recordset) {
    const lines = JSON.parse(row.sage_earning_lines_json || '[]');
    const code = row.employee_code;
    let next = lines.map((line) => ({ ...line }));
    const setAmount = (matchCode, amount) => {
      next = next.map((line) => {
        if (String(line.code).toUpperCase() !== matchCode) return line;
        return { ...line, amount, sourceAmount: amount, taxableAmount: amount };
      });
    };
    if (code === 'L1986') setAmount('NIGHTALLW', 1500);
    if (code === 'L2125') setAmount('OVERTIME', 10000);
    if (code === 'L2331') setAmount('OVERTIME', 10000);
    if (code === 'L2191') next = next.filter((line) => String(line.code).toUpperCase() !== 'OVERTIME');
    if (code === 'L2635' || code === 'L2729') next = next.filter((line) => String(line.code).toUpperCase() !== 'TRANSPORT_WK');
    if (code === 'L2289' && !next.some((line) => String(line.code).toUpperCase() === 'OVERTIME' && line.payrollPeriod === '2026-09')) {
      next.push(oneOff('OVERTIME', 'OVERTIME', 9000));
    }
    if (code === 'L2580' && !next.some((line) => String(line.code).toUpperCase() === 'OVERTIME' && line.payrollPeriod === '2026-09')) {
      next.push(oneOff('OVERTIME', 'OVERTIME', 26500));
    }
    await new sql.Request(tx)
      .input('employee_id', sql.BigInt, row.employee_id)
      .input('lines', sql.NVarChar(sql.MAX), JSON.stringify(next))
      .query(`UPDATE hris.EmployeePayrollSetup SET sage_earning_lines_json = @lines, modified_at = SYSUTCDATETIME() WHERE employee_id = @employee_id`);
    console.log(code, next.map((line) => `${line.code}:${line.amount}${line.payrollPeriod ? '@' + line.payrollPeriod : ''}`).join(', '));
  }
  await tx.commit();
} catch (error) {
  await tx.rollback();
  throw error;
}
await pool.close();
process.exit(0);
