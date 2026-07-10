import fs from 'node:fs';
import path from 'node:path';
import sql from 'mssql';

import { dormantLongPolicy } from '../apps/dashboard/lib/leave-management-store';
import {
  employeeRequestMatches,
  readAllEssRequests,
  writeAllEssRequests,
} from '../apps/dashboard/lib/leave-workflow-service';
import { getDleEnterpriseDbPool } from '../apps/dashboard/lib/dle-enterprise-db';
import { readPayrollEmployees } from '../apps/dashboard/lib/payroll-employee-source';
import { invalidateEssPortalCache } from '../apps/dashboard/lib/ess-portal-cache';

const TARGET_CODE = 'NYSC0032';
const ENTITLEMENT = dormantLongPolicy.annualContractDays;

const loadWorkspaceEnv = () => {
  for (const file of [path.resolve('.env'), path.join(process.cwd(), 'apps', 'dashboard', '.env')]) {
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

const isNysc0032 = (employeeId: string) => {
  const value = String(employeeId || '').trim().toUpperCase();
  return value === TARGET_CODE || value.startsWith(`${TARGET_CODE} `) || value.startsWith(`${TARGET_CODE}-`);
};

const main = async () => {
  const { employees } = await readPayrollEmployees();
  const employee = employees.find((item) => employeeRequestMatches(item, TARGET_CODE));
  if (!employee) throw new Error(`Employee ${TARGET_CODE} was not found in HRIS directory.`);

  const employeeKeys = [
    employee.employeeId,
    employee.employeeCode,
    TARGET_CODE,
  ].map((value) => String(value || '').trim()).filter(Boolean);

  const requests = await readAllEssRequests();
  const removed = requests.filter((item) => isNysc0032(item.employeeId) && /leave/i.test(item.category));
  const kept = requests.filter((item) => !(isNysc0032(item.employeeId) && /leave/i.test(item.category)));
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
SELECT [Id], [EmployeeId], [LeaveType], [StatusName], [Days]
FROM [hris].[LeaveApplications]
WHERE [EmployeeId] IN (${keySql});`);

  const applicationIds = (existingApps.recordset || []).map((row: { Id: string }) => String(row.Id));

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

    const deleteAppsResult = await pool.request();
    applicationIds.forEach((id, index) => deleteAppsResult.input(`appId${index}`, sql.NVarChar(120), id));
    const deleteApps = await deleteAppsResult.query(`
DELETE FROM [hris].[LeaveApplications]
WHERE [Id] IN (${appIdSql});`);
    deletedApps = deleteApps.rowsAffected?.[0] || 0;
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
  ([EmployeeId],[FullName],[Department],[LeaveType],[SourceSystem],[AccruedBalance],[UsedBalance],[PendingBalance],[CurrentBalance],[CarryForwardBalance],[ForfeitedBalance],[LiabilityValue],[StatusName])
VALUES
  (@EmployeeId,@FullName,@Department,N'Annual Leave',N'NYSC0032 Leave Reset',@Entitlement,0,0,@Entitlement,0,0,0,N'Healthy');`);

  console.log(JSON.stringify({
    employee: {
      code: employee.employeeCode,
      id: employee.employeeId,
      name: employee.fullName,
    },
    essRequestsRemoved: removed.map((item) => ({ id: item.id, status: item.status, days: item.days })),
    database: {
      leaveApplicationsDeleted: deletedApps,
      auditRowsDeleted: deletedAudit,
      deletedApplicationIds: applicationIds,
    },
    leaveBalanceReset: {
      leaveType: 'Annual Leave',
      currentBalance: ENTITLEMENT,
      usedBalance: 0,
      pendingBalance: 0,
    },
  }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
