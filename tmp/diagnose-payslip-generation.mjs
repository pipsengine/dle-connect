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

const round = (value) => Math.round((Number(value) || 0) * 100) / 100;
const compact = (value) => String(value || '').trim();

const pool = await new sql.ConnectionPool({
  server: process.env.DLE_ENTERPRISE_DB_HOST,
  database: process.env.DLE_ENTERPRISE_DB_NAME,
  user: process.env.DLE_ENTERPRISE_DB_USER,
  password: process.env.DLE_ENTERPRISE_DB_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true },
}).connect();

const setting = await pool.request().query(`
  SELECT TOP 20 setting_key, setting_value
  FROM [hris].[PayrollSettings]
  WHERE setting_key LIKE '%period%' OR setting_key LIKE '%payslip%'
  ORDER BY setting_key
`).catch(() => ({ recordset: [] }));

const schedules = await pool.request().query(`
  SELECT period_code, file_name, title, applied_at, applied_by, is_active,
         perm_count, cont_count, usd_count, ngn_gross, ngn_net, usd_gross, usd_net
  FROM [hris].[SalaryScheduleUploads]
  ORDER BY applied_at DESC
`).catch((error) => ({ recordset: [], error: error.message }));

const dayrates = await pool.request().query(`
  SELECT period_code, file_name, applied_at, applied_by, is_active
  FROM [hris].[DayrateScheduleUploads]
  ORDER BY applied_at DESC
`).catch(() => ({ recordset: [] }));

const runs = await pool.request().query(`
  SELECT run_id, period_code, run_status, employee_count, gross_pay, deductions, net_pay,
         JSON_VALUE(run_json, '$.payslipsGeneratedAt') AS payslipsGeneratedAt,
         JSON_VALUE(run_json, '$.pack') AS pack,
         JSON_VALUE(run_json, '$.company') AS company,
         JSON_VALUE(run_json, '$.status') AS jsonStatus,
         modified_at
  FROM [hris].[PayrollRuns]
  ORDER BY period_code DESC, modified_at DESC
`).catch((error) => ({ recordset: [], error: error.message }));

const snapshots = await pool.request().query(`
  SELECT r.period_code, r.run_id, r.run_status,
         DATALENGTH(s.snapshot_json) AS snapshotBytes,
         JSON_VALUE(s.snapshot_json, '$.action') AS snapshotAction,
         JSON_VALUE(s.snapshot_json, '$.capturedAt') AS capturedAt
  FROM [hris].[PayrollRuns] r
  LEFT JOIN [hris].[PayrollRunSnapshots] s ON s.run_id = r.run_id
  ORDER BY r.period_code DESC
`).catch(() => ({ recordset: [] }));

const periods = ['2026-08', '2026-09'];
const scheduleRows = {};
for (const period of periods) {
  const row = await pool.request().input('period', sql.Char(7), period).query(`
    SELECT TOP 1 payload_json
    FROM [hris].[SalaryScheduleUploads]
    WHERE period_code = @period AND is_active = 1
    ORDER BY applied_at DESC
  `).catch(() => ({ recordset: [] }));
  const payload = row.recordset[0]?.payload_json;
  if (!payload) {
    scheduleRows[period] = { count: 0 };
    continue;
  }
  const parsed = JSON.parse(String(payload));
  const rows = parsed.rows || [];
  scheduleRows[period] = {
    count: rows.length,
    perm: rows.filter((item) => item.kind === 'perm' || /PERM/i.test(item.sheet || '')).length,
    sample: rows.slice(0, 3).map((item) => ({
      code: item.employeeCode,
      name: item.employeeName,
      gross: item.grossPay,
      net: item.netPay,
      paye: item.paye,
      pension: item.pension,
      earningCodes: (item.earnings || []).map((line) => line.code),
    })),
  };
}

const packageSample = await pool.request().query(`
  SELECT TOP 12
    e.employee_code,
    e.full_name,
    e.employment_type,
    e.employment_status,
    pay.salary_grade,
    pay.period_salary,
    pay.basic_salary,
    pay.latest_allowances,
    pay.latest_deductions,
    pay.sage_payslip_period,
    pay.setup_assigned_to_payroll,
    LEN(pay.sage_earning_lines_json) AS earningJsonLen,
    LEFT(pay.sage_earning_lines_json, 400) AS earningHead
  FROM [hris].[Employees] e
  INNER JOIN [hris].[EmployeePayrollSetup] pay ON pay.employee_id = e.employee_id
  WHERE e.employment_status = 'Active'
    AND pay.setup_assigned_to_payroll = 1
    AND e.employee_code LIKE 'P%'
  ORDER BY e.employee_code
`);

const parseLines = (raw) => {
  try {
    const parsed = JSON.parse(String(raw || '[]'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const comparePeriod = '2026-08';
const excelRow = await pool.request().input('period', sql.Char(7), comparePeriod).query(`
  SELECT TOP 1 payload_json
  FROM [hris].[SalaryScheduleUploads]
  WHERE period_code = @period AND is_active = 1
  ORDER BY applied_at DESC
`);
const excel = excelRow.recordset[0]?.payload_json ? JSON.parse(String(excelRow.recordset[0].payload_json)) : null;
const excelByCode = new Map();
for (const row of excel?.rows || []) {
  const code = compact(row.employeeCode).toUpperCase();
  if (code) excelByCode.set(code, row);
}

const hris = await pool.request().query(`
  SELECT
    e.employee_code,
    e.full_name,
    e.employment_type,
    pay.period_salary,
    pay.sage_earning_lines_json,
    pay.sage_deduction_lines_json,
    pay.sage_payslip_period,
    pay.salary_grade
  FROM [hris].[Employees] e
  INNER JOIN [hris].[EmployeePayrollSetup] pay ON pay.employee_id = e.employee_id
  WHERE e.employment_status = 'Active'
    AND pay.setup_assigned_to_payroll = 1
`);

let matched = 0;
let missingExcel = 0;
let grossMismatch = 0;
let netWouldMismatch = 0;
let oneOffIncluded = 0;
const mismatches = [];
const oneOffCodes = /ARREARS|OVERTIME|WEEKDAYOVT|LEAVEALLOW|PENSION_REFUND|BONUS/i;

for (const row of hris.recordset) {
  const code = compact(row.employee_code).toUpperCase();
  const excelEmp = excelByCode.get(code);
  if (!excelEmp) {
    missingExcel += 1;
    continue;
  }
  matched += 1;
  const lines = parseLines(row.sage_earning_lines_json);
  const packageGross = round(lines.reduce((sum, line) => sum + Number(line.amount || 0), 0));
  const monthlyGross = round(lines
    .filter((line) => line.includeInMonthlyPayroll !== false && String(line.runFrequency || 'monthly') !== 'one-off')
    .reduce((sum, line) => sum + Number(line.amount || 0), 0));
  const oneOffGross = round(lines
    .filter((line) => line.includeInMonthlyPayroll === false || String(line.runFrequency || '') === 'one-off' || oneOffCodes.test(String(line.code || '')))
    .reduce((sum, line) => sum + Number(line.amount || 0), 0));
  const excelGross = round(excelEmp.grossPay);
  const excelNet = round(excelEmp.netPay);
  if (Math.abs(packageGross - excelGross) > 1) {
    grossMismatch += 1;
    if (mismatches.length < 8) {
      mismatches.push({
        code,
        name: row.full_name,
        excelGross,
        packageGross,
        monthlyGross,
        oneOffGross,
        periodSalary: round(row.period_salary),
        excelNet,
        sagePeriod: row.sage_payslip_period,
        lineCodes: lines.map((line) => `${line.code}:${line.amount}:${line.runFrequency || 'monthly'}`),
      });
    }
  }
  if (oneOffGross > 0) oneOffIncluded += 1;
  // Engine would recompute net from tax/pension, not Excel net — flag if we only have package gross.
  if (Math.abs(packageGross - excelGross) <= 1) netWouldMismatch += 1;
}

console.log(JSON.stringify({
  envActive: process.env.HRIS_ACTIVE_PAYROLL_PERIOD || null,
  settings: setting.recordset,
  schedules: schedules.recordset || schedules,
  dayrates: dayrates.recordset,
  runs: (runs.recordset || []).slice(0, 20),
  runError: runs.error,
  snapshots: snapshots.recordset,
  scheduleRows,
  packageSample: packageSample.recordset.map((row) => ({
    code: row.employee_code,
    name: row.full_name,
    type: row.employment_type,
    grade: row.salary_grade,
    periodSalary: row.period_salary,
    sagePeriod: row.sage_payslip_period,
    earningJsonLen: row.earningJsonLen,
    earningHead: row.earningHead,
  })),
  compare: {
    period: comparePeriod,
    excelRows: excelByCode.size,
    hrisAssigned: hris.recordset.length,
    matched,
    missingExcel,
    grossMismatch,
    matchedGrossSameAsExcel: netWouldMismatch,
    employeesWithOneOffLines: oneOffIncluded,
    mismatches,
  },
}, null, 2));

await pool.close();
