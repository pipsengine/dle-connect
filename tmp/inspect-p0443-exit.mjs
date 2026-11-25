import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sql from 'mssql';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const loadEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim().replace(/^\uFEFF/, '');
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
};
[
  path.join(repo, 'apps/dashboard/.env.local'),
  path.join(repo, 'apps/dashboard/.env'),
  path.join(repo, '.env.local'),
  path.join(repo, '.env'),
  path.join(repo, 'deployment/iis/site/apps/dashboard/.env'),
].forEach(loadEnvFile);

const pool = await sql.connect({
  server: process.env.DLE_ENTERPRISE_DB_HOST || process.env.DLE_ENTERPRISE_DB_SERVER,
  port: Number(process.env.DLE_ENTERPRISE_DB_PORT || 1433),
  database: process.env.DLE_ENTERPRISE_DB_NAME,
  user: process.env.DLE_ENTERPRISE_DB_USER,
  password: process.env.DLE_ENTERPRISE_DB_PASSWORD,
  options: {
    encrypt: String(process.env.DLE_ENTERPRISE_DB_ENCRYPT || '').toLowerCase() === 'true',
    trustServerCertificate: true,
  },
});

const code = 'P0443';

const emp = await pool.request().input('Code', sql.NVarChar(40), code).query(`
SELECT e.employee_id, e.employee_code, e.full_name, e.employment_status, e.employment_type,
       ei.staff_category, ei.employee_category, ei.date_joined, ei.confirmation_due_date,
       ei.probation_end_date, ei.contract_end_date,
       j.job_title, j.designation, j.job_grade, j.department, j.business_unit, j.reporting_manager,
       c.official_email, p.gender
FROM [hris].[Employees] e
LEFT JOIN [hris].[EmployeeEmploymentInfo] ei ON ei.employee_id = e.employee_id
LEFT JOIN [hris].[EmployeeJobInfo] j ON j.employee_id = e.employee_id
LEFT JOIN [hris].[EmployeeContactInfo] c ON c.employee_id = e.employee_id
LEFT JOIN [hris].[EmployeePersonalInfo] p ON p.employee_id = e.employee_id
WHERE e.employee_code = @Code;
`);

const balances = await pool.request().input('Code', sql.NVarChar(40), code).query(`
SELECT EmployeeId, LeaveType, CurrentBalance, AccruedBalance, UsedBalance, PendingBalance,
       CarryForwardBalance, ForfeitedBalance, ManualAnnualEntitlement, ManualBalanceReason,
       StatusName, ExceptionsJson, UpdatedAt, SourceSystem
FROM [hris].[LeaveBalances]
WHERE EmployeeId = @Code
ORDER BY LeaveType;
`);

const apps = await pool.request().input('Code', sql.NVarChar(40), code).query(`
SELECT TOP 40 Id, LeaveType, StartDate, EndDate, Days, StatusName, WorkflowStage, ApprovalStatus,
       BalanceImpact, AvailableBalance, ActingOfficer, CreatedAt, UpdatedAt, SourceSystem, PolicyComplianceStatus
FROM [hris].[LeaveApplications]
WHERE EmployeeId = @Code
ORDER BY CreatedAt DESC;
`);

const tables = await pool.request().query(`
SELECT TABLE_SCHEMA, TABLE_NAME
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_NAME LIKE '%LeaveAllow%'
   OR TABLE_NAME LIKE '%FinalPayroll%'
   OR TABLE_NAME LIKE '%Resignation%'
   OR TABLE_NAME LIKE '%Exit%'
   OR TABLE_NAME LIKE '%Settlement%'
ORDER BY TABLE_SCHEMA, TABLE_NAME;
`);

let leaveAllow = { recordset: [], error: null };
try {
  leaveAllow = await pool.request().input('Code', sql.NVarChar(40), code).query(`
SELECT TOP 50 *
FROM [hris].[PayrollLeaveAllowanceEvents]
WHERE EmployeeId = @Code OR EmployeeCode = @Code
ORDER BY CreatedAt DESC;
`);
} catch (err) {
  leaveAllow = { recordset: [], error: String(err.message || err) };
  // try alternate names
  for (const name of ['LeaveAllowanceEvents', 'LeaveAllowancePayments', 'PayrollLeaveAllowances']) {
    try {
      leaveAllow = await pool.request().input('Code', sql.NVarChar(40), code).query(`
SELECT TOP 50 * FROM [hris].[${name}] WHERE EmployeeId = @Code OR EmployeeCode = @Code;
`);
      leaveAllow.table = name;
      break;
    } catch {
      /* continue */
    }
  }
}

let settlements = { recordset: [], error: null };
try {
  settlements = await pool.request().input('Code', sql.NVarChar(40), code).query(`
SELECT TOP 20 * FROM [hris].[FinalPayrollSettlements]
WHERE EmployeeCode = @Code OR EmployeeId = @Code
ORDER BY CreatedAt DESC;
`);
} catch (err) {
  settlements = { recordset: [], error: String(err.message || err) };
}

let payroll = { recordset: [], error: null };
try {
  payroll = await pool.request().input('Code', sql.NVarChar(40), code).query(`
SELECT TOP 5 *
FROM [hris].[EmployeePayrollSetup]
WHERE employee_id IN (SELECT employee_id FROM [hris].[Employees] WHERE employee_code = @Code);
`);
} catch (err) {
  payroll = { recordset: [], error: String(err.message || err) };
}

console.log(JSON.stringify({
  emp: emp.recordset,
  balances: balances.recordset,
  apps: apps.recordset,
  tables: tables.recordset,
  leaveAllow: leaveAllow.recordset,
  leaveAllowError: leaveAllow.error || null,
  leaveAllowTable: leaveAllow.table || null,
  settlements: settlements.recordset,
  settlementsError: settlements.error || null,
  payroll: payroll.recordset,
  payrollError: payroll.error || null,
}, null, 2));

await pool.close();
