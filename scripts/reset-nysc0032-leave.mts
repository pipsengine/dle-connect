import fs from 'node:fs';
import path from 'node:path';
import sql from 'mssql';

import { buildEssEmployeeLookupKeys } from '../apps/dashboard/lib/ess-dashboard-store';
import { dormantLongPolicy } from '../apps/dashboard/lib/leave-management-store';
import {
  employeeRequestMatches,
  readAllEssRequests,
  writeAllEssRequests,
} from '../apps/dashboard/lib/leave-workflow-service';
import { getDleEnterpriseDbPool } from '../apps/dashboard/lib/dle-enterprise-db';
import { readPayrollEmployees } from '../apps/dashboard/lib/payroll-employee-source';
import { invalidateEssPortalCache } from '../apps/dashboard/lib/ess-portal-cache';
import { normalizePayrollMatchKey } from '../apps/dashboard/lib/sage-people-payroll-store';

const TARGET_CODE = 'NYSC0032';
const ENTITLEMENT = dormantLongPolicy.annualContractDays;

const loadWorkspaceEnv = () => {
  for (const file of [
    path.join(process.cwd(), 'apps', 'dashboard', '.env.local'),
    path.resolve('.env'),
    path.join(process.cwd(), 'apps', 'dashboard', '.env'),
  ]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[match[1]]) process.env[match[1]] = value;
    }
  }
};

loadWorkspaceEnv();

const uniqueKeys = (values: string[]) => {
  const seen = new Set<string>();
  return values
    .map((value) => String(value || '').trim())
    .filter((value) => {
      if (!value) return false;
      const key = value.toUpperCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const main = async () => {
  const { employees } = await readPayrollEmployees();
  const employee = employees.find((item) => employeeRequestMatches(item, TARGET_CODE));
  if (!employee) throw new Error(`Employee ${TARGET_CODE} was not found in HRIS directory.`);

  const employeeKeys = uniqueKeys([
    ...buildEssEmployeeLookupKeys(employee),
    TARGET_CODE,
    employee.employeeId,
    employee.employeeCode,
    employee.sourceEmployeeId || '',
    normalizePayrollMatchKey(employee.employeeId),
    normalizePayrollMatchKey(employee.employeeCode || ''),
  ]);

  const requests = await readAllEssRequests();
  const removed = requests.filter((item) => /leave/i.test(item.category) && employeeRequestMatches(employee, item.employeeId));
  const kept = requests.filter((item) => !( /leave/i.test(item.category) && employeeRequestMatches(employee, item.employeeId)));
  if (removed.length) {
    await writeAllEssRequests(kept);
    invalidateEssPortalCache();
  }

  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE_Enterprise database is not available.');

  const appRequest = pool.request();
  employeeKeys.forEach((key, index) => appRequest.input(`employeeKey${index}`, sql.NVarChar(120), key));
  const keySql = employeeKeys.map((_, index) => `@employeeKey${index}`).join(', ');

  const existingApps = await appRequest.query(`
SELECT [Id], [EmployeeId], [LeaveType], [StatusName], [Days], [StartDate], [EndDate]
FROM [hris].[LeaveApplications]
WHERE [EmployeeId] IN (${keySql})
   OR [EmployeeId] LIKE N'NYSC0032%'
   OR [EmployeeId] LIKE N'%NYSC0032%';`);

  const applicationIds = uniqueKeys((existingApps.recordset || []).map((row: { Id: string }) => String(row.Id)));

  let deletedAudit = 0;
  let deletedApps = 0;
  if (applicationIds.length) {
    const auditRequest = pool.request();
    applicationIds.forEach((id, index) => auditRequest.input(`appId${index}`, sql.NVarChar(120), id));
    const appIdSql = applicationIds.map((_, index) => `@appId${index}`).join(', ');
    const auditResult = await auditRequest.query(`
DELETE FROM [hris].[LeaveAuditTrail]
WHERE [RecordId] IN (${appIdSql});`);
    deletedAudit = auditResult.rowsAffected?.[0] || 0;

    const deleteAppsResult = pool.request();
    applicationIds.forEach((id, index) => deleteAppsResult.input(`appId${index}`, sql.NVarChar(120), id));
    const deleteApps = await deleteAppsResult.query(`
DELETE FROM [hris].[LeaveApplications]
WHERE [Id] IN (${appIdSql});`);
    deletedApps = deleteApps.rowsAffected?.[0] || 0;
  }

  for (const employeeKey of employeeKeys) {
    await pool.request()
      .input('EmployeeId', sql.NVarChar(80), employeeKey)
      .input('Entitlement', sql.Decimal(9, 2), ENTITLEMENT)
      .query(`
UPDATE [hris].[LeaveBalances]
SET [AccruedBalance] = @Entitlement,
    [UsedBalance] = 0,
    [PendingBalance] = 0,
    [CurrentBalance] = @Entitlement,
    [ForfeitedBalance] = 0,
    [StatusName] = N'Healthy',
    [UpdatedAt] = SYSUTCDATETIME()
WHERE [EmployeeId] = @EmployeeId AND [LeaveType] = N'Annual Leave';`);
  }

  await pool.request()
    .input('EmployeeId', sql.NVarChar(80), employee.employeeId)
    .input('FullName', sql.NVarChar(220), employee.fullName)
    .input('Department', sql.NVarChar(180), employee.department || 'Unassigned')
    .input('Entitlement', sql.Decimal(9, 2), ENTITLEMENT)
    .query(`
MERGE [hris].[LeaveBalances] AS target
USING (SELECT @EmployeeId AS EmployeeId, N'Annual Leave' AS LeaveType) AS source
ON target.[EmployeeId] = source.EmployeeId AND target.[LeaveType] = source.LeaveType
WHEN MATCHED THEN UPDATE SET
  [AccruedBalance] = @Entitlement,
  [UsedBalance] = 0,
  [PendingBalance] = 0,
  [CurrentBalance] = @Entitlement,
  [ForfeitedBalance] = 0,
  [StatusName] = N'Healthy',
  [UpdatedAt] = SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT
  ([EmployeeId],[FullName],[Department],[LeaveType],[SourceSystem],[AccruedBalance],[UsedBalance],[PendingBalance],[CurrentBalance],[CarryForwardBalance],[ForfeitedBalance],[LiabilityValue],[StatusName],[ExceptionsJson])
VALUES
  (@EmployeeId,@FullName,@Department,N'Annual Leave',N'NYSC0032 Leave Reset',@Entitlement,0,0,@Entitlement,0,0,0,N'Healthy',N'[]');`);

  const remainingRequest = pool.request();
  employeeKeys.forEach((key, index) => remainingRequest.input(`employeeKey${index}`, sql.NVarChar(120), key));
  const remainingApps = await remainingRequest.query(`
SELECT [Id], [EmployeeId], [LeaveType], [StatusName], [StartDate], [EndDate]
FROM [hris].[LeaveApplications]
WHERE [EmployeeId] IN (${keySql})
   OR [EmployeeId] LIKE N'NYSC0032%'
   OR [EmployeeId] LIKE N'%NYSC0032%';`);

  const remainingEss = (await readAllEssRequests()).filter((item) =>
    /leave/i.test(item.category) && employeeRequestMatches(employee, item.employeeId),
  );

  console.log(JSON.stringify({
    employee: {
      code: employee.employeeCode,
      id: employee.employeeId,
      name: employee.fullName,
      lookupKeys: employeeKeys,
    },
    essRequestsRemoved: removed.map((item) => ({
      id: item.id,
      status: item.status,
      days: item.days,
      startDate: item.startDate,
      endDate: item.endDate,
    })),
    database: {
      leaveApplicationsDeleted: deletedApps,
      auditRowsDeleted: deletedAudit,
      deletedApplicationIds: applicationIds,
      remainingApplications: remainingApps.recordset || [],
    },
    remainingEssLeaveRequests: remainingEss.map((item) => ({
      id: item.id,
      status: item.status,
      startDate: item.startDate,
      endDate: item.endDate,
    })),
    leaveBalanceReset: {
      leaveType: 'Annual Leave',
      currentBalance: ENTITLEMENT,
      usedBalance: 0,
      pendingBalance: 0,
    },
    essRequestsPath: path.join(process.cwd(), 'apps', 'dashboard', 'data', 'hris', 'ess-requests.json'),
  }, null, 2));

  if ((remainingApps.recordset || []).length || remainingEss.length) {
    process.exitCode = 1;
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
