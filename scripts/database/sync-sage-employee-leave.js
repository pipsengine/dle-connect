/**
 * Sync Sage Payroll leave balances and transaction history into DLE_Enterprise HRIS leave tables.
 *
 * Usage:
 *   node scripts/database/sync-sage-employee-leave.js --audit-only
 *   node scripts/database/sync-sage-employee-leave.js --apply
 *   node scripts/database/sync-sage-employee-leave.js --apply --code=P0146
 *   node scripts/database/sync-sage-employee-leave.js --apply --limit=50
 */
const fs = require('node:fs');
const path = require('node:path');
const sql = require('mssql');

const loadEnv = () => {
  for (const file of [path.join(process.cwd(), '.env'), path.join(process.cwd(), 'apps', 'dashboard', '.env')]) {
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

const clean = (value) => String(value ?? '').trim();
const round2 = (value) => Math.round((Number.isFinite(Number(value)) ? Number(value) : 0) * 100) / 100;
const dateOnly = (value) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
};

const SOURCE_SYSTEM = 'Sage 300 People Payroll';

const sageConfig = () => ({
  server: process.env.SAGE_PAYROLL_DB_HOST || '192.168.5.8',
  port: Number(process.env.SAGE_PAYROLL_DB_PORT || 1433),
  database: process.env.SAGE_PAYROLL_DB_NAME || 'DLE_JUNE',
  user: process.env.SAGE_PAYROLL_DB_USER || 'sa',
  password: process.env.SAGE_PAYROLL_DB_PASSWORD || '',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    instanceName: process.env.SAGE_PAYROLL_DB_INSTANCE || 'MSSQLSERVERPEOPL',
  },
  connectionTimeout: 15000,
  requestTimeout: 600000,
});

const dleConfig = () => ({
  server: process.env.DLE_ENTERPRISE_DB_HOST || '192.168.5.5',
  port: Number(process.env.DLE_ENTERPRISE_DB_PORT || 1433),
  database: process.env.DLE_ENTERPRISE_DB_NAME || 'DLE_Enterprise',
  user: process.env.DLE_ENTERPRISE_DB_USER || 'sa',
  password: process.env.DLE_ENTERPRISE_DB_PASSWORD || '',
  options: {
    encrypt: String(process.env.DLE_ENTERPRISE_DB_ENCRYPT || 'true').toLowerCase() === 'true',
    trustServerCertificate: String(process.env.DLE_ENTERPRISE_DB_TRUST_SERVER_CERTIFICATE || 'true').toLowerCase() === 'true',
  },
  connectionTimeout: 15000,
  requestTimeout: 600000,
});

const SAGE_BALANCES_QUERY = `
WITH latestPeriod AS (
  SELECT er.EmployeeID, MAX(epp.EmployeePayPeriodID) AS EmployeePayPeriodID
  FROM Employee.EmployeePayPeriod epp
  JOIN Employee.EmployeeRule er ON er.EmployeeRuleID = epp.EmployeeRuleID
  GROUP BY er.EmployeeID
)
SELECT
  e.EmployeeID AS sageEmployeeId,
  LTRIM(RTRIM(lt.ShortDescription)) AS leaveTypeName,
  CAST(ISNULL(el.UnitsAvailable, 0) AS decimal(9,2)) AS currentBalance,
  CAST(ISNULL(el.Entitlement, 0) AS decimal(9,2)) AS accruedBalance,
  CAST(ISNULL(el.UnitsTakenInCycle, 0) AS decimal(9,2)) AS usedBalance,
  CAST(ISNULL(el.PlannedLeave, 0) AS decimal(9,2)) AS pendingBalance,
  CAST(ISNULL(el.BalanceBroughtForward, 0) AS decimal(9,2)) AS carryForwardBalance
FROM latestPeriod lp
JOIN Employee.Employee e ON e.EmployeeID = lp.EmployeeID
JOIN Employee.EmployeePayPeriod epp ON epp.EmployeePayPeriodID = lp.EmployeePayPeriodID
JOIN Leave.EmployeeLeave el ON el.EmployeePayPeriodID = epp.EmployeePayPeriodID
JOIN Leave.LeaveDef ld ON ld.LeaveDefID = el.LeaveDefID
JOIN Leave.LeaveType lt ON lt.LeaveTypeID = ld.LeaveTypeID
WHERE e.TerminationDate IS NULL
  AND lt.Status = 'A'
`;

const SAGE_TRANSACTIONS_QUERY = `
SELECT
  lt.LeaveTransactionID AS sageTransactionId,
  er.EmployeeID AS sageEmployeeId,
  LTRIM(RTRIM(ltype.ShortDescription)) AS leaveTypeName,
  lt.FromDate AS startDate,
  lt.ToDate AS endDate,
  CAST(ISNULL(lt.UnitsTaken, 0) AS decimal(9,2)) AS days,
  lt.TransactionStatus AS transactionStatus,
  lt.Cancelled AS cancelled
FROM Leave.LeaveTransaction lt
JOIN Employee.EmployeeRule er ON er.EmployeeRuleID = lt.EmployeeRuleID
JOIN Employee.Employee e ON e.EmployeeID = er.EmployeeID
JOIN Leave.LeaveType ltype ON ltype.LeaveTypeID = lt.LeaveTypeID
WHERE lt.Cancelled IS NULL
  AND ltype.Status = 'A'
`;

const ensureLeaveTables = async (pool) => {
  await pool.request().query(`
IF OBJECT_ID(N'[hris].[LeaveApplications]', N'U') IS NULL
CREATE TABLE [hris].[LeaveApplications] (
  [Id] NVARCHAR(120) NOT NULL CONSTRAINT [PK_LeaveApplications] PRIMARY KEY,
  [SourceSystem] NVARCHAR(80) NOT NULL,
  [EmployeeId] NVARCHAR(80) NOT NULL,
  [FullName] NVARCHAR(220) NOT NULL,
  [Department] NVARCHAR(180) NOT NULL,
  [ManagerName] NVARCHAR(180) NOT NULL,
  [Location] NVARCHAR(180) NOT NULL,
  [EmployeeCategory] NVARCHAR(120) NOT NULL,
  [LeaveType] NVARCHAR(120) NOT NULL,
  [StartDate] DATE NOT NULL,
  [EndDate] DATE NOT NULL,
  [Days] DECIMAL(9,2) NOT NULL,
  [StatusName] NVARCHAR(40) NOT NULL,
  [WorkflowStage] NVARCHAR(40) NOT NULL,
  [ApprovalStatus] NVARCHAR(60) NOT NULL,
  [PolicyComplianceStatus] NVARCHAR(40) NOT NULL,
  [BalanceImpact] DECIMAL(9,2) NOT NULL,
  [AvailableBalance] DECIMAL(9,2) NOT NULL,
  [ActingOfficer] NVARCHAR(180) NOT NULL,
  [SupportingDocuments] INT NOT NULL,
  [ExceptionsJson] NVARCHAR(MAX) NOT NULL,
  [CreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_LeaveApplications_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_LeaveApplications_UpdatedAt] DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID(N'[hris].[LeaveBalances]', N'U') IS NULL
CREATE TABLE [hris].[LeaveBalances] (
  [EmployeeId] NVARCHAR(80) NOT NULL,
  [LeaveType] NVARCHAR(120) NOT NULL,
  [FullName] NVARCHAR(220) NOT NULL,
  [Department] NVARCHAR(180) NOT NULL,
  [CurrentBalance] DECIMAL(9,2) NOT NULL,
  [AccruedBalance] DECIMAL(9,2) NOT NULL,
  [UsedBalance] DECIMAL(9,2) NOT NULL,
  [PendingBalance] DECIMAL(9,2) NOT NULL,
  [ForfeitedBalance] DECIMAL(9,2) NOT NULL,
  [CarryForwardBalance] DECIMAL(9,2) NOT NULL,
  [LiabilityValue] DECIMAL(19,2) NOT NULL,
  [StatusName] NVARCHAR(40) NOT NULL,
  [ExceptionsJson] NVARCHAR(MAX) NOT NULL,
  [SourceSystem] NVARCHAR(80) NOT NULL,
  [UpdatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_LeaveBalances_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  CONSTRAINT [PK_LeaveBalances] PRIMARY KEY ([EmployeeId], [LeaveType])
);`);
};

const remapLegacyLeaveEmployeeIds = async (pool) => {
  await pool.request().query(`
WITH legacy AS (
  SELECT
    lb.[EmployeeId] AS legacyEmployeeId,
    e.[employee_code] AS employeeCode,
    lb.[LeaveType],
    lb.[FullName],
    lb.[Department],
    lb.[CurrentBalance],
    lb.[AccruedBalance],
    lb.[UsedBalance],
    lb.[PendingBalance],
    lb.[ForfeitedBalance],
    lb.[CarryForwardBalance],
    lb.[LiabilityValue],
    lb.[StatusName],
    lb.[ExceptionsJson],
    lb.[SourceSystem],
    lb.[UpdatedAt],
    CASE WHEN lb.[SourceSystem] = N'Sage 300 People Payroll' THEN 1 ELSE 0 END AS isSage
  FROM [hris].[LeaveBalances] lb
  JOIN [hris].[Employees] e ON TRY_CONVERT(bigint, lb.[EmployeeId]) = e.[employee_id]
  WHERE TRY_CONVERT(bigint, lb.[EmployeeId]) IS NOT NULL
    AND e.[employee_code] IS NOT NULL
    AND lb.[EmployeeId] <> e.[employee_code]
)
MERGE [hris].[LeaveBalances] AS target
USING legacy AS source
ON target.[EmployeeId] = source.employeeCode AND target.[LeaveType] = source.[LeaveType]
WHEN MATCHED AND source.isSage = 1
  AND (
    NULLIF(LTRIM(RTRIM(ISNULL(target.[SourceSystem], N''))), N'') IS NULL
    OR target.[SourceSystem] = N'Sage 300 People Payroll'
  ) THEN UPDATE SET
  [FullName]=source.[FullName],[Department]=source.[Department],[CurrentBalance]=source.[CurrentBalance],
  [AccruedBalance]=source.[AccruedBalance],[UsedBalance]=source.[UsedBalance],[PendingBalance]=source.[PendingBalance],
  [ForfeitedBalance]=source.[ForfeitedBalance],[CarryForwardBalance]=source.[CarryForwardBalance],
  [LiabilityValue]=source.[LiabilityValue],[StatusName]=source.[StatusName],[ExceptionsJson]=source.[ExceptionsJson],
  [SourceSystem]=source.[SourceSystem],[UpdatedAt]=source.[UpdatedAt]
WHEN NOT MATCHED BY TARGET THEN INSERT
  ([EmployeeId],[LeaveType],[FullName],[Department],[CurrentBalance],[AccruedBalance],[UsedBalance],[PendingBalance],[ForfeitedBalance],[CarryForwardBalance],[LiabilityValue],[StatusName],[ExceptionsJson],[SourceSystem],[UpdatedAt])
VALUES
  (source.employeeCode,source.[LeaveType],source.[FullName],source.[Department],source.[CurrentBalance],source.[AccruedBalance],source.[UsedBalance],source.[PendingBalance],source.[ForfeitedBalance],source.[CarryForwardBalance],source.[LiabilityValue],source.[StatusName],source.[ExceptionsJson],source.[SourceSystem],source.[UpdatedAt]);

DELETE lb
FROM [hris].[LeaveBalances] lb
JOIN [hris].[Employees] e ON TRY_CONVERT(bigint, lb.[EmployeeId]) = e.[employee_id]
WHERE TRY_CONVERT(bigint, lb.[EmployeeId]) IS NOT NULL
  AND e.[employee_code] IS NOT NULL
  AND lb.[EmployeeId] <> e.[employee_code];

UPDATE la
SET la.[EmployeeId] = e.[employee_code]
FROM [hris].[LeaveApplications] la
JOIN [hris].[Employees] e ON TRY_CONVERT(bigint, la.[EmployeeId]) = e.[employee_id]
WHERE TRY_CONVERT(bigint, la.[EmployeeId]) IS NOT NULL
  AND e.[employee_code] IS NOT NULL
  AND la.[EmployeeId] <> e.[employee_code];`);
};

const readDleEmployeeLinks = async (pool, employeeCode) => {
  const request = pool.request();
  let filter = '';
  if (employeeCode) {
    request.input('code', sql.NVarChar, employeeCode);
    filter = 'AND e.employee_code = @code';
  }
  const result = await request.query(`
WITH ranked AS (
  SELECT
    e.employee_id,
    e.employee_code,
    e.full_name,
    ISNULL(j.department, N'Unassigned') AS department,
    TRY_CONVERT(int, src.source_employee_id) AS sage_employee_id,
    ROW_NUMBER() OVER (
      PARTITION BY e.employee_id
      ORDER BY TRY_CONVERT(int, src.source_employee_id), src.source_employee_id
    ) AS rn
  FROM [hris].[Employees] e
  LEFT JOIN [hris].[EmployeeJobInfo] j ON j.employee_id = e.employee_id
  JOIN [hris].[EmployeeSourceRecords] src
    ON src.employee_id = e.employee_id
   AND src.source_system = N'Sage 300 People Payroll'
  WHERE TRY_CONVERT(int, src.source_employee_id) IS NOT NULL
    ${filter}
)
SELECT employee_code AS employeeCode, employee_id AS employeeDbId, full_name AS fullName, department, sage_employee_id AS sageEmployeeId
FROM ranked
WHERE rn = 1
ORDER BY employee_code;`);
  return result.recordset;
};

const mapSageTransactionStatus = (transactionStatus, cancelled) => {
  if (cancelled) return 'Cancelled';
  if (transactionStatus === 1) return 'Approved';
  if (transactionStatus === 0) return 'Submitted';
  return 'Approved';
};

const workflowStageForStatus = (status) => {
  if (['Approved', 'Completed', 'Rejected', 'Cancelled', 'Terminated'].includes(status)) return 'Closed';
  if (status === 'Under Review') return 'HR';
  if (status === 'Submitted') return 'Supervisor';
  return 'Employee';
};

const approvalStatusFor = (status) => {
  if (status === 'Approved' || status === 'Completed') return 'Approved';
  if (status === 'Rejected') return 'Rejected';
  if (['Cancelled', 'Terminated', 'Withdrawn'].includes(status)) return status;
  return 'Pending';
};

const upsertBalance = async (pool, employee, row) => {
  const leaveType = clean(row.leaveTypeName);
  if (!leaveType) return false;
  const currentBalance = round2(row.currentBalance);
  const accruedBalance = round2(row.accruedBalance);
  const usedBalance = round2(row.usedBalance);
  const pendingBalance = round2(row.pendingBalance);
  const carryForwardBalance = round2(row.carryForwardBalance);
  if (currentBalance <= 0 && accruedBalance <= 0 && usedBalance <= 0 && pendingBalance <= 0 && carryForwardBalance <= 0) return false;

  await pool.request()
    .input('EmployeeId', sql.NVarChar(80), employee.employeeCode)
    .input('LeaveType', sql.NVarChar(120), leaveType)
    .input('FullName', sql.NVarChar(220), employee.fullName)
    .input('Department', sql.NVarChar(180), employee.department || 'Unassigned')
    .input('CurrentBalance', sql.Decimal(9, 2), currentBalance)
    .input('AccruedBalance', sql.Decimal(9, 2), accruedBalance)
    .input('UsedBalance', sql.Decimal(9, 2), usedBalance)
    .input('PendingBalance', sql.Decimal(9, 2), pendingBalance)
    .input('ForfeitedBalance', sql.Decimal(9, 2), 0)
    .input('CarryForwardBalance', sql.Decimal(9, 2), carryForwardBalance)
    .input('LiabilityValue', sql.Decimal(19, 2), 0)
    .input('StatusName', sql.NVarChar(40), currentBalance > 0 ? 'Healthy' : 'Review')
    .input('ExceptionsJson', sql.NVarChar(sql.MAX), '[]')
    .input('SourceSystem', sql.NVarChar(80), SOURCE_SYSTEM)
    .query(`
MERGE [hris].[LeaveBalances] AS target
USING (SELECT @EmployeeId AS [EmployeeId], @LeaveType AS [LeaveType]) AS source
ON target.[EmployeeId] = source.[EmployeeId] AND target.[LeaveType] = source.[LeaveType]
WHEN MATCHED AND (
  NULLIF(LTRIM(RTRIM(ISNULL(target.[SourceSystem], N''))), N'') IS NULL
  OR target.[SourceSystem] = N'Sage 300 People Payroll'
) THEN UPDATE SET
  [FullName]=@FullName,[Department]=@Department,[CurrentBalance]=@CurrentBalance,[AccruedBalance]=@AccruedBalance,
  [UsedBalance]=@UsedBalance,[PendingBalance]=@PendingBalance,[ForfeitedBalance]=@ForfeitedBalance,[CarryForwardBalance]=@CarryForwardBalance,
  [LiabilityValue]=@LiabilityValue,[StatusName]=@StatusName,[ExceptionsJson]=@ExceptionsJson,[SourceSystem]=@SourceSystem,[UpdatedAt]=SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT
  ([EmployeeId],[LeaveType],[FullName],[Department],[CurrentBalance],[AccruedBalance],[UsedBalance],[PendingBalance],[ForfeitedBalance],[CarryForwardBalance],[LiabilityValue],[StatusName],[ExceptionsJson],[SourceSystem])
VALUES
  (@EmployeeId,@LeaveType,@FullName,@Department,@CurrentBalance,@AccruedBalance,@UsedBalance,@PendingBalance,@ForfeitedBalance,@CarryForwardBalance,@LiabilityValue,@StatusName,@ExceptionsJson,@SourceSystem);`);
  return true;
};

const upsertTransaction = async (pool, employee, row) => {
  const leaveType = clean(row.leaveTypeName);
  const startDate = dateOnly(row.startDate);
  const endDate = dateOnly(row.endDate);
  const days = round2(row.days);
  if (!leaveType || !startDate || !endDate || days <= 0) return false;

  const statusName = mapSageTransactionStatus(row.transactionStatus, row.cancelled);
  await pool.request()
    .input('Id', sql.NVarChar(120), `sage-leave-tx-${row.sageTransactionId}`)
    .input('SourceSystem', sql.NVarChar(80), SOURCE_SYSTEM)
    .input('EmployeeId', sql.NVarChar(80), employee.employeeCode)
    .input('FullName', sql.NVarChar(220), employee.fullName)
    .input('Department', sql.NVarChar(180), employee.department || 'Unassigned')
    .input('ManagerName', sql.NVarChar(180), 'Unassigned')
    .input('Location', sql.NVarChar(180), 'Unassigned')
    .input('EmployeeCategory', sql.NVarChar(120), 'Unassigned')
    .input('LeaveType', sql.NVarChar(120), leaveType)
    .input('StartDate', sql.Date, startDate)
    .input('EndDate', sql.Date, endDate)
    .input('Days', sql.Decimal(9, 2), days)
    .input('StatusName', sql.NVarChar(40), statusName)
    .input('WorkflowStage', sql.NVarChar(40), workflowStageForStatus(statusName))
    .input('ApprovalStatus', sql.NVarChar(60), approvalStatusFor(statusName))
    .input('PolicyComplianceStatus', sql.NVarChar(40), 'Compliant')
    .input('BalanceImpact', sql.Decimal(9, 2), days)
    .input('AvailableBalance', sql.Decimal(9, 2), 0)
    .input('ActingOfficer', sql.NVarChar(180), 'Not configured')
    .input('SupportingDocuments', sql.Int, 0)
    .input('ExceptionsJson', sql.NVarChar(sql.MAX), '[]')
    .query(`
MERGE [hris].[LeaveApplications] AS target
USING (SELECT @Id AS [Id]) AS source
ON target.[Id] = source.[Id]
WHEN MATCHED AND target.[Id] LIKE N'sage-leave-tx-%'
  AND (
    NULLIF(LTRIM(RTRIM(ISNULL(target.[SourceSystem], N''))), N'') IS NULL
    OR target.[SourceSystem] = N'Sage 300 People Payroll'
  ) THEN UPDATE SET
  [SourceSystem]=@SourceSystem,[EmployeeId]=@EmployeeId,[FullName]=@FullName,[Department]=@Department,[ManagerName]=@ManagerName,
  [Location]=@Location,[EmployeeCategory]=@EmployeeCategory,[LeaveType]=@LeaveType,[StartDate]=@StartDate,[EndDate]=@EndDate,
  [Days]=@Days,[StatusName]=@StatusName,[WorkflowStage]=@WorkflowStage,[ApprovalStatus]=@ApprovalStatus,
  [PolicyComplianceStatus]=@PolicyComplianceStatus,[BalanceImpact]=@BalanceImpact,[ActingOfficer]=@ActingOfficer,
  [SupportingDocuments]=@SupportingDocuments,[ExceptionsJson]=@ExceptionsJson,[UpdatedAt]=SYSUTCDATETIME()
WHEN NOT MATCHED AND @Id LIKE N'sage-leave-tx-%' THEN INSERT
  ([Id],[SourceSystem],[EmployeeId],[FullName],[Department],[ManagerName],[Location],[EmployeeCategory],[LeaveType],[StartDate],[EndDate],
   [Days],[StatusName],[WorkflowStage],[ApprovalStatus],[PolicyComplianceStatus],[BalanceImpact],[AvailableBalance],[ActingOfficer],[SupportingDocuments],[ExceptionsJson])
VALUES
  (@Id,@SourceSystem,@EmployeeId,@FullName,@Department,@ManagerName,@Location,@EmployeeCategory,@LeaveType,@StartDate,@EndDate,
   @Days,@StatusName,@WorkflowStage,@ApprovalStatus,@PolicyComplianceStatus,@BalanceImpact,@AvailableBalance,@ActingOfficer,@SupportingDocuments,@ExceptionsJson);`);
  return true;
};

const run = async () => {
  loadEnv();
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const auditOnly = args.includes('--audit-only') || !apply;
  const codeArg = args.find((arg) => arg.startsWith('--code='));
  const limitArg = args.find((arg) => arg.startsWith('--limit='));
  const employeeCode = codeArg ? codeArg.split('=')[1] : null;
  const limit = limitArg ? Number(limitArg.split('=')[1]) : 0;

  const dlePool = await new sql.ConnectionPool(dleConfig()).connect();
  await ensureLeaveTables(dlePool);
  await remapLegacyLeaveEmployeeIds(dlePool);
  let links = await readDleEmployeeLinks(dlePool, employeeCode);
  if (limit > 0) links = links.slice(0, limit);

  if (!links.length) {
    console.log(JSON.stringify({ message: 'No linked Sage employees found.', employees: 0 }, null, 2));
    await dlePool.close();
    return;
  }

  const sageIds = [...new Set(links.map((item) => item.sageEmployeeId))];
  const linkBySageId = new Map(links.map((item) => [item.sageEmployeeId, item]));
  const sagePool = await new sql.ConnectionPool(sageConfig()).connect();

  const balanceRequest = sagePool.request();
  sageIds.forEach((id, index) => balanceRequest.input(`sageId${index}`, sql.Int, id));
  const balanceFilter = `AND e.EmployeeID IN (${sageIds.map((_, index) => `@sageId${index}`).join(', ')})`;
  const balanceRows = (await balanceRequest.query(`${SAGE_BALANCES_QUERY} ${balanceFilter}`)).recordset;

  const txRequest = sagePool.request();
  sageIds.forEach((id, index) => txRequest.input(`sageId${index}`, sql.Int, id));
  const txFilter = `AND er.EmployeeID IN (${sageIds.map((_, index) => `@sageId${index}`).join(', ')})`;
  const transactionRows = (await txRequest.query(`${SAGE_TRANSACTIONS_QUERY} ${txFilter}`)).recordset;

  const preview = {
    employees: links.length,
    sageEmployeeIds: sageIds.length,
    balanceRows: balanceRows.length,
    transactionRows: transactionRows.length,
    sampleBalances: balanceRows.slice(0, 5),
    sampleTransactions: transactionRows.slice(0, 5),
  };

  if (auditOnly) {
    console.log(JSON.stringify({ mode: 'audit-only', ...preview }, null, 2));
    await sagePool.close();
    await dlePool.close();
    return;
  }

  let balances = 0;
  let transactions = 0;
  for (const row of balanceRows) {
    const employee = linkBySageId.get(Number(row.sageEmployeeId));
    if (!employee) continue;
    if (await upsertBalance(dlePool, employee, row)) balances += 1;
  }
  for (const row of transactionRows) {
    const employee = linkBySageId.get(Number(row.sageEmployeeId));
    if (!employee) continue;
    if (await upsertTransaction(dlePool, employee, row)) transactions += 1;
  }

  console.log(JSON.stringify({ mode: 'apply', employees: links.length, balances, transactions }, null, 2));
  await sagePool.close();
  await dlePool.close();
};

run().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
