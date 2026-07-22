import sql from 'mssql';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';
import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import {
  ensureEmployeeLeaveFromHris,
  readEmployeeLeaveFromHris,
  type EmployeeLeaveSummary,
  type LeaveBalanceDetail,
  normalizeLeaveTypeName,
} from '@/lib/hris-leave-read';

export type { EmployeeLeaveSummary, LeaveBalanceDetail };
export { normalizeLeaveTypeName };

/** @deprecated Sage runtime reads removed — use readEmployeeLeaveFromHris from @/lib/hris-leave-read */
export async function readEmployeeLeaveSummary(employee: string | DleEmployeeDirectoryRow): Promise<EmployeeLeaveSummary> {
  return readEmployeeLeaveFromHris(employee);
}

/** @deprecated Sage runtime sync removed — use ensureEmployeeLeaveFromHris from @/lib/hris-leave-read */
export async function ensureEmployeeLeaveFromSage(employee: DleEmployeeDirectoryRow) {
  return ensureEmployeeLeaveFromHris(employee);
}

type DleEmployeeLink = {
  employeeCode: string;
  employeeDbId: number;
  fullName: string;
  department: string;
  sageEmployeeId: number;
};

type SageBalanceRow = {
  sageEmployeeId: number;
  leaveTypeName: string;
  currentBalance: number;
  accruedBalance: number;
  usedBalance: number;
  pendingBalance: number;
  carryForwardBalance: number;
};

type SageTransactionRow = {
  sageTransactionId: number;
  sageEmployeeId: number;
  leaveTypeName: string;
  startDate: Date;
  endDate: Date;
  days: number;
  transactionStatus: number | null;
  cancelled: unknown;
};

const SOURCE_SYSTEM = 'Sage 300 People Payroll';
const round2 = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const clean = (value: unknown) => String(value ?? '').trim();

const requireDbPool = async (pool?: sql.ConnectionPool | null) => {
  const resolved = pool || await getDleEnterpriseDbPool();
  if (!resolved) throw new Error('DLE Enterprise database is not configured. Sage leave sync requires HRIS database persistence.');
  return resolved;
};
const dateOnly = (value: Date | string | null | undefined) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
};

const sageConfig = () => ({
  server: process.env.SAGE_PAYROLL_DB_HOST || '192.168.5.8',
  port: Number(process.env.SAGE_PAYROLL_DB_PORT || 1433),
  database: process.env.SAGE_PAYROLL_DB_NAME || 'DLE_JUNE',
  user: process.env.SAGE_PAYROLL_DB_USER || 'sa',
  password: process.env.SAGE_PAYROLL_DB_PASSWORD || '',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    ...(process.env.SAGE_PAYROLL_DB_INSTANCE ? { instanceName: process.env.SAGE_PAYROLL_DB_INSTANCE } : {}),
  },
  connectionTimeout: Number(process.env.SAGE_PAYROLL_DB_CONNECT_TIMEOUT || 15000),
  requestTimeout: Number(process.env.SAGE_PAYROLL_DB_REQUEST_TIMEOUT || 600000),
});

export async function remapLegacyLeaveEmployeeIds(pool?: sql.ConnectionPool) {
  const target = await requireDbPool(pool);
  await ensureLeaveTables(target);
  await target.request().query(`
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
WHEN MATCHED AND source.isSage = 1 THEN UPDATE SET
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
  AND la.[EmployeeId] <> e.[employee_code]
  AND NOT EXISTS (
    SELECT 1
    FROM [hris].[LeaveApplications] existing
    WHERE existing.[EmployeeId] = e.[employee_code]
      AND existing.[Id] = la.[Id]
  );`);
}

const mapSageTransactionStatus = (transactionStatus: number | null, cancelled: unknown) => {
  if (cancelled) return 'Cancelled';
  if (transactionStatus === 1) return 'Approved';
  if (transactionStatus === 0) return 'Submitted';
  return 'Approved';
};

const workflowStageForStatus = (status: string) => {
  if (status === 'Approved' || status === 'Completed') return 'Closed';
  if (status === 'Rejected' || status === 'Cancelled' || status === 'Terminated') return 'Closed';
  if (status === 'Under Review') return 'HR';
  if (status === 'Submitted') return 'Supervisor';
  return 'Employee';
};

const approvalStatusFor = (status: string) => {
  if (status === 'Approved' || status === 'Completed') return 'Approved';
  if (status === 'Rejected') return 'Rejected';
  if (status === 'Cancelled' || status === 'Terminated' || status === 'Withdrawn') return status;
  return 'Pending';
};

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

let leaveTablesReady = false;

const ensureLeaveTables = async (pool: sql.ConnectionPool) => {
  if (leaveTablesReady) return;
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
  leaveTablesReady = true;
};

const readDleEmployeeLinks = async (pool: sql.ConnectionPool, employeeCodes?: string[]) => {
  const request = pool.request();
  let filter = '';
  if (employeeCodes?.length) {
    employeeCodes.forEach((code, index) => request.input(`code${index}`, sql.NVarChar, code));
    filter = `AND e.employee_code IN (${employeeCodes.map((_, index) => `@code${index}`).join(', ')})`;
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
  return result.recordset as DleEmployeeLink[];
};

const upsertBalance = async (
  pool: sql.ConnectionPool,
  employee: DleEmployeeLink,
  row: SageBalanceRow,
) => {
  const leaveType = normalizeLeaveTypeName(row.leaveTypeName);
  if (!leaveType) return;
  const currentBalanceRaw = round2(Number(row.currentBalance || 0));
  const accruedBalance = round2(Number(row.accruedBalance || 0));
  const usedBalance = round2(Number(row.usedBalance || 0));
  const pendingBalance = round2(Number(row.pendingBalance || 0));
  const carryForwardRaw = round2(Number(row.carryForwardBalance || 0));
  // Sage sometimes leaves UnitsAvailable at 0 while BalanceBroughtForward holds remaining days.
  // Do not park available leave under Carry Forward — CF is capped at policy max only.
  const carryForwardBalance = Math.min(7, Math.max(0, carryForwardRaw));
  const inferredAvailable = Math.max(0, accruedBalance - usedBalance - pendingBalance);
  const currentBalance = currentBalanceRaw > 0
    ? currentBalanceRaw
    : Math.max(inferredAvailable, carryForwardRaw > 7 ? carryForwardRaw : 0);
  if (currentBalance <= 0 && accruedBalance <= 0 && usedBalance <= 0 && pendingBalance <= 0 && carryForwardBalance <= 0) return;

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
WHEN MATCHED THEN UPDATE SET
  [FullName]=@FullName,[Department]=@Department,[CurrentBalance]=@CurrentBalance,[AccruedBalance]=@AccruedBalance,
  [UsedBalance]=@UsedBalance,[PendingBalance]=@PendingBalance,[ForfeitedBalance]=@ForfeitedBalance,[CarryForwardBalance]=@CarryForwardBalance,
  [LiabilityValue]=@LiabilityValue,[StatusName]=@StatusName,[ExceptionsJson]=@ExceptionsJson,[SourceSystem]=@SourceSystem,[UpdatedAt]=SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT
  ([EmployeeId],[LeaveType],[FullName],[Department],[CurrentBalance],[AccruedBalance],[UsedBalance],[PendingBalance],[ForfeitedBalance],[CarryForwardBalance],[LiabilityValue],[StatusName],[ExceptionsJson],[SourceSystem])
VALUES
  (@EmployeeId,@LeaveType,@FullName,@Department,@CurrentBalance,@AccruedBalance,@UsedBalance,@PendingBalance,@ForfeitedBalance,@CarryForwardBalance,@LiabilityValue,@StatusName,@ExceptionsJson,@SourceSystem);`);
};

const upsertTransaction = async (
  pool: sql.ConnectionPool,
  employee: DleEmployeeLink,
  row: SageTransactionRow,
) => {
  const leaveType = normalizeLeaveTypeName(row.leaveTypeName);
  const startDate = dateOnly(row.startDate);
  const endDate = dateOnly(row.endDate);
  const days = round2(Number(row.days || 0));
  if (!leaveType || !startDate || !endDate || days <= 0) return;

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
WHEN MATCHED THEN UPDATE SET
  [SourceSystem]=@SourceSystem,[EmployeeId]=@EmployeeId,[FullName]=@FullName,[Department]=@Department,[ManagerName]=@ManagerName,
  [Location]=@Location,[EmployeeCategory]=@EmployeeCategory,[LeaveType]=@LeaveType,[StartDate]=@StartDate,[EndDate]=@EndDate,
  [Days]=@Days,[StatusName]=@StatusName,[WorkflowStage]=@WorkflowStage,[ApprovalStatus]=@ApprovalStatus,
  [PolicyComplianceStatus]=@PolicyComplianceStatus,[BalanceImpact]=@BalanceImpact,[ActingOfficer]=@ActingOfficer,
  [SupportingDocuments]=@SupportingDocuments,[ExceptionsJson]=@ExceptionsJson,[UpdatedAt]=SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT
  ([Id],[SourceSystem],[EmployeeId],[FullName],[Department],[ManagerName],[Location],[EmployeeCategory],[LeaveType],[StartDate],[EndDate],
   [Days],[StatusName],[WorkflowStage],[ApprovalStatus],[PolicyComplianceStatus],[BalanceImpact],[AvailableBalance],[ActingOfficer],[SupportingDocuments],[ExceptionsJson])
VALUES
  (@Id,@SourceSystem,@EmployeeId,@FullName,@Department,@ManagerName,@Location,@EmployeeCategory,@LeaveType,@StartDate,@EndDate,
   @Days,@StatusName,@WorkflowStage,@ApprovalStatus,@PolicyComplianceStatus,@BalanceImpact,@AvailableBalance,@ActingOfficer,@SupportingDocuments,@ExceptionsJson);`);
};

export async function syncSageLeaveToHris(options: { employeeCodes?: string[]; limit?: number } = {}) {
  const dlePool = await requireDbPool();
  await ensureLeaveTables(dlePool);
  await remapLegacyLeaveEmployeeIds(dlePool);
  const links = await readDleEmployeeLinks(dlePool, options.employeeCodes);
  const limitedLinks = options.limit && options.limit > 0 ? links.slice(0, options.limit) : links;
  if (!limitedLinks.length) {
    return { employees: 0, balances: 0, transactions: 0, skipped: true };
  }

  const sageIds = [...new Set(limitedLinks.map((item) => item.sageEmployeeId))];
  const linkBySageId = new Map(limitedLinks.map((item) => [item.sageEmployeeId, item]));

  const sagePool = await new sql.ConnectionPool(sageConfig()).connect();
  try {
    const balanceRequest = sagePool.request();
    sageIds.forEach((id, index) => balanceRequest.input(`sageId${index}`, sql.Int, id));
    const balanceFilter = `AND e.EmployeeID IN (${sageIds.map((_, index) => `@sageId${index}`).join(', ')})`;
    const balanceRows = (await balanceRequest.query(`${SAGE_BALANCES_QUERY} ${balanceFilter}`)).recordset as SageBalanceRow[];

    const txRequest = sagePool.request();
    sageIds.forEach((id, index) => txRequest.input(`sageId${index}`, sql.Int, id));
    const txFilter = `AND er.EmployeeID IN (${sageIds.map((_, index) => `@sageId${index}`).join(', ')})`;
    const transactionRows = (await txRequest.query(`${SAGE_TRANSACTIONS_QUERY} ${txFilter} ORDER BY lt.FromDate DESC`)).recordset as SageTransactionRow[];

    let balances = 0;
    let transactions = 0;

    for (const row of balanceRows) {
      const employee = linkBySageId.get(Number(row.sageEmployeeId));
      if (!employee) continue;
      await upsertBalance(dlePool, employee, row);
      balances += 1;
    }

    for (const row of transactionRows) {
      const employee = linkBySageId.get(Number(row.sageEmployeeId));
      if (!employee) continue;
      await upsertTransaction(dlePool, employee, row);
      transactions += 1;
    }

    return { employees: limitedLinks.length, balances, transactions, skipped: false };
  } finally {
    await sagePool.close();
  }
}
