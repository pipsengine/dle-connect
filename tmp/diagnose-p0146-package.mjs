import fs from 'node:fs';
import path from 'node:path';
import sql from 'mssql';

const loadEnv = () => {
  for (const file of [path.join(process.cwd(), 'apps', 'dashboard', '.env')]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match || process.env[match[1]]) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      process.env[match[1]] = value;
    }
  }
};
loadEnv();
const round = (v) => Math.round((Number(v) || 0) * 100) / 100;

const pool = await new sql.ConnectionPool({
  server: process.env.DLE_ENTERPRISE_DB_HOST,
  database: process.env.DLE_ENTERPRISE_DB_NAME,
  user: process.env.DLE_ENTERPRISE_DB_USER,
  password: process.env.DLE_ENTERPRISE_DB_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true },
}).connect();

const codes = ['P0146', 'P0033', 'P0467'];
for (const code of codes) {
  const row = await pool.request().input('code', sql.NVarChar, code).query(`
    SELECT e.employee_code, e.full_name, pay.period_salary, pay.sage_payslip_period, pay.sage_earning_lines_json
    FROM [hris].[Employees] e
    INNER JOIN [hris].[EmployeePayrollSetup] pay ON pay.employee_id = e.employee_id
    WHERE e.employee_code = @code
  `);
  const rec = row.recordset[0];
  const lines = JSON.parse(String(rec.sage_earning_lines_json || '[]'));
  const packageGross = round(lines.reduce((s, l) => s + Number(l.amount || 0), 0));
  console.log(JSON.stringify({
    code: rec.employee_code,
    name: rec.full_name,
    sagePeriod: rec.sage_payslip_period,
    periodSalary: rec.period_salary,
    packageGross,
    lines: lines.map((l) => ({ code: l.code, amount: l.amount, freq: l.runFrequency || 'monthly' })),
  }, null, 2));
}
await pool.close();
