import { getDleEnterpriseDbPool } from '../lib/dle-enterprise-db.ts';

const pool = await getDleEnterpriseDbPool();
if (!pool) {
  console.error('Unable to connect to DLE_Enterprise');
  process.exit(1);
}

const periods = await pool.request().query(`
  SELECT period_code, period_status, opened_at, closed_at, opened_by, closed_by
  FROM [hris].[PayrollPeriods]
  ORDER BY period_code DESC
`);
const settings = await pool.request().query(`
  SELECT setting_key, setting_value, updated_at
  FROM [hris].[PayrollSettings]
  WHERE setting_key = 'active_payroll_period'
`);
const tsPeriods = await pool.request().query(`
  SELECT TOP 8 Id, Name, Status, StartDate, EndDate, OpenedAt, ClosedAt
  FROM [hris].[TimesheetPeriods]
  ORDER BY StartDate DESC
`);
const runs = await pool.request().query(`
  SELECT TOP 8 period_code, run_status, modified_at
  FROM [hris].[PayrollRuns]
  ORDER BY period_code DESC
`);

console.log(JSON.stringify({
  database: process.env.DLE_ENTERPRISE_DB_NAME || 'DLE_Enterprise',
  host: process.env.DLE_ENTERPRISE_DB_HOST || '(default)',
  activePayrollSetting: settings.recordset,
  payrollPeriods: periods.recordset,
  timesheetPeriods: tsPeriods.recordset,
  payrollRuns: runs.recordset,
}, null, 2));

await pool.close();
