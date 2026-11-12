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

const code = 'P0458';

const emp = await pool.request().input('Code', sql.NVarChar(40), code).query(`
SELECT e.employee_id, e.employee_code, e.full_name, e.employment_status, e.employment_type,
       ei.staff_category, ei.employee_category, ei.date_joined,
       ei.probation_start_date, ei.probation_end_date, ei.confirmation_due_date,
       j.job_title, j.designation, j.job_grade, j.department, j.reporting_manager,
       p.gender
FROM [hris].[Employees] e
LEFT JOIN [hris].[EmployeeEmploymentInfo] ei ON ei.employee_id = e.employee_id
LEFT JOIN [hris].[EmployeeJobInfo] j ON j.employee_id = e.employee_id
LEFT JOIN [hris].[EmployeePersonalInfo] p ON p.employee_id = e.employee_id
WHERE e.employee_code = @Code;
`);

const balances = await pool.request().input('Code', sql.NVarChar(40), code).query(`
SELECT EmployeeId, LeaveType, CurrentBalance, AccruedBalance, UsedBalance, PendingBalance,
       CarryForwardBalance, ForfeitedBalance, ManualAnnualEntitlement, ManualBalanceReason,
       StatusName, ExceptionsJson, UpdatedAt, SourceSystem
FROM [hris].[LeaveBalances]
WHERE EmployeeId = @Code OR EmployeeId IN (
  SELECT CAST(employee_id AS nvarchar(80)) FROM [hris].[Employees] WHERE employee_code = @Code
)
ORDER BY LeaveType;
`);

const apps = await pool.request().input('Code', sql.NVarChar(40), code).query(`
SELECT TOP 20 Id, LeaveType, StartDate, EndDate, Days, StatusName, WorkflowStage, ApprovalStatus,
       BalanceImpact, AvailableBalance, CreatedAt, UpdatedAt
FROM [hris].[LeaveApplications]
WHERE EmployeeId = @Code
ORDER BY CreatedAt DESC;
`);

let statusHistory = { recordset: [] };
try {
  statusHistory = await pool.request().input('Code', sql.NVarChar(40), code).query(`
SELECT TOP 20 *
FROM [hris].[EmployeeStatusHistory]
WHERE EmployeeCode = @Code OR EmployeeId IN (
  SELECT employee_id FROM [hris].[Employees] WHERE employee_code = @Code
)
ORDER BY CreatedAt DESC;
`);
} catch {
  try {
    statusHistory = await pool.request().input('Code', sql.NVarChar(40), code).query(`
SELECT TOP 20 RequestId, EmployeeCode, EmployeeName, CurrentStatus, RequestedStatus, ActionName,
       EffectiveDate, Reason, ApprovalStatus, CreatedAt, UpdatedAt
FROM [hris].[StatusChangeRequests]
WHERE EmployeeCode = @Code
ORDER BY CreatedAt DESC;
`);
  } catch (err) {
    statusHistory = { recordset: [], error: String(err.message || err) };
  }
}

console.log(JSON.stringify({
  employee: emp.recordset,
  leaveBalances: balances.recordset,
  leaveApplications: apps.recordset,
  statusHistory: statusHistory.recordset,
  statusHistoryError: statusHistory.error || null,
}, null, 2));

await pool.close();
