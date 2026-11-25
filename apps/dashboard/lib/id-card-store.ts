import sql from 'mssql';
import { dleEnterpriseLastPoolError, getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';
import { readDirectoryEmployees } from '@/lib/payroll-employee-source';
import {
  assertIdCardExport,
  employeeCodeOf,
  nextIssueStatus,
  toIdCardEmployee,
  type IdCardEmployee,
  type IdCardExportFormat,
  type IdCardIssueStatus,
} from '@/lib/id-card-directory';

export type { IdCardEmployee, IdCardExportFormat, IdCardIssueStatus };

export type IdCardIssueRecord = {
  id: string;
  batchId: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  jobTitle: string;
  templateId: string;
  exportFormat: IdCardExportFormat;
  photoPresent: boolean;
  status: IdCardIssueStatus;
  issuedAt: string;
  issuedBy: string;
};

export type IdCardWorkspace = {
  employees: IdCardEmployee[];
  issues: IdCardIssueRecord[];
};

const text = (value: unknown) => String(value ?? '').trim();
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const iso = (value: unknown) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  const raw = text(value);
  if (!raw) return '';
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString();
};

let ensured = false;

const pool = async () => {
  const connection = await getDleEnterpriseDbPool();
  if (!connection) {
    throw new Error(dleEnterpriseLastPoolError() || 'DLE Enterprise database is not configured.');
  }
  if (!ensured) {
    await connection.request().query(`
IF SCHEMA_ID(N'hris') IS NULL EXEC(N'CREATE SCHEMA [hris]');
IF OBJECT_ID(N'[hris].[IdCardBatches]', N'U') IS NULL
CREATE TABLE [hris].[IdCardBatches] (
  [Id] NVARCHAR(40) NOT NULL CONSTRAINT [PK_IdCardBatches] PRIMARY KEY,
  [TemplateId] NVARCHAR(40) NOT NULL,
  [ExportFormat] NVARCHAR(10) NOT NULL,
  [CardCount] INT NOT NULL,
  [IssuedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_IdCardBatches_IssuedAt] DEFAULT SYSUTCDATETIME(),
  [IssuedBy] NVARCHAR(120) NOT NULL
);
IF OBJECT_ID(N'[hris].[IdCardIssues]', N'U') IS NULL
CREATE TABLE [hris].[IdCardIssues] (
  [Id] NVARCHAR(40) NOT NULL CONSTRAINT [PK_IdCardIssues] PRIMARY KEY,
  [BatchId] NVARCHAR(40) NOT NULL,
  [EmployeeCode] NVARCHAR(80) NOT NULL,
  [EmployeeName] NVARCHAR(220) NOT NULL,
  [Department] NVARCHAR(180) NULL,
  [JobTitle] NVARCHAR(180) NULL,
  [TemplateId] NVARCHAR(40) NOT NULL,
  [ExportFormat] NVARCHAR(10) NOT NULL,
  [PhotoPresent] BIT NOT NULL,
  [Status] NVARCHAR(20) NOT NULL,
  [IssuedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_IdCardIssues_IssuedAt] DEFAULT SYSUTCDATETIME(),
  [IssuedBy] NVARCHAR(120) NOT NULL
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_IdCardIssues_EmployeeCode' AND object_id = OBJECT_ID(N'[hris].[IdCardIssues]'))
CREATE INDEX [IX_IdCardIssues_EmployeeCode] ON [hris].[IdCardIssues]([EmployeeCode], [IssuedAt] DESC);
`);
    ensured = true;
  }
  return connection;
};

const mapIssue = (row: Record<string, unknown>): IdCardIssueRecord => ({
  id: text(row.Id),
  batchId: text(row.BatchId),
  employeeCode: text(row.EmployeeCode).toUpperCase(),
  employeeName: text(row.EmployeeName),
  department: text(row.Department),
  jobTitle: text(row.JobTitle),
  templateId: text(row.TemplateId),
  exportFormat: text(row.ExportFormat) as IdCardExportFormat,
  photoPresent: Boolean(row.PhotoPresent),
  status: text(row.Status) === 'Reprinted' ? 'Reprinted' : 'Issued',
  issuedAt: iso(row.IssuedAt),
  issuedBy: text(row.IssuedBy),
});

const readIssueSummary = async (connection: sql.ConnectionPool) => {
  const result = await connection.request().query(`
    SELECT [EmployeeCode], MAX([IssuedAt]) AS [LastIssuedAt], COUNT(*) AS [IssueCount]
    FROM [hris].[IdCardIssues]
    GROUP BY [EmployeeCode]
  `);
  const summary = new Map<string, { lastIssuedAt: string; issueCount: number }>();
  for (const row of result.recordset || []) {
    const code = text(row.EmployeeCode).toUpperCase();
    if (!code) continue;
    summary.set(code, { lastIssuedAt: iso(row.LastIssuedAt), issueCount: Number(row.IssueCount || 0) });
  }
  return summary;
};

const readRecentIssues = async (connection: sql.ConnectionPool) => {
  const result = await connection.request().query(`
    SELECT TOP 80 *
    FROM [hris].[IdCardIssues]
    ORDER BY [IssuedAt] DESC, [Id] DESC
  `);
  return (result.recordset || []).map((row) => mapIssue(row as Record<string, unknown>));
};

const directoryEmployees = async (summary: Map<string, { lastIssuedAt: string; issueCount: number }>) => {
  const source = await readDirectoryEmployees();
  if (!source.databaseAvailable) {
    throw new Error(source.warning || 'Employee directory is not available from the HRIS database.');
  }
  return source.employees
    .map((row) => toIdCardEmployee(row, summary.get(employeeCodeOf(row))))
    .filter((row): row is IdCardEmployee => Boolean(row))
    .sort((a, b) => a.id.localeCompare(b.id));
};

export const readIdCardWorkspace = async (): Promise<IdCardWorkspace> => {
  const connection = await pool();
  const [summary, issues] = await Promise.all([readIssueSummary(connection), readRecentIssues(connection)]);
  return { employees: await directoryEmployees(summary), issues };
};

export const recordIdCardIssue = async (input: {
  employeeCodes: string[];
  templateId: string;
  format: string;
  actor: string;
}): Promise<IdCardWorkspace> => {
  assertIdCardExport(input.templateId, input.format);
  const requested = [...new Set(input.employeeCodes.map((code) => text(code).toUpperCase()).filter(Boolean))];
  if (!requested.length) throw new Error('Select at least one employee.');
  if (requested.length > 200) throw new Error('Generate at most 200 ID cards at a time.');

  const connection = await pool();
  const summary = await readIssueSummary(connection);
  const employees = await directoryEmployees(summary);
  const byCode = new Map(employees.map((employee) => [employee.id, employee]));
  const missing = requested.filter((code) => !byCode.has(code));
  if (missing.length) {
    throw new Error(`${missing.slice(0, 8).join(', ')} ${missing.length === 1 ? 'is' : 'are'} not an active employee in the Employee Directory.`);
  }
  const selected = requested.map((code) => byCode.get(code)!);
  const actor = text(input.actor).slice(0, 120) || 'HRIS User';
  const batchId = newId('idb');
  const format = input.format as IdCardExportFormat;

  const transaction = new sql.Transaction(connection);
  await transaction.begin();
  try {
    await new sql.Request(transaction)
      .input('Id', sql.NVarChar(40), batchId)
      .input('TemplateId', sql.NVarChar(40), input.templateId)
      .input('ExportFormat', sql.NVarChar(10), format)
      .input('CardCount', sql.Int, selected.length)
      .input('IssuedBy', sql.NVarChar(120), actor)
      .query(`
        INSERT INTO [hris].[IdCardBatches] ([Id], [TemplateId], [ExportFormat], [CardCount], [IssuedBy])
        VALUES (@Id, @TemplateId, @ExportFormat, @CardCount, @IssuedBy)
      `);

    for (const employee of selected) {
      const prior = summary.get(employee.id)?.issueCount || employee.issueCount || 0;
      const name = `${employee.firstName} ${employee.lastName}`.replace(/\s+/g, ' ').trim();
      await new sql.Request(transaction)
        .input('Id', sql.NVarChar(40), newId('idi'))
        .input('BatchId', sql.NVarChar(40), batchId)
        .input('EmployeeCode', sql.NVarChar(80), employee.id)
        .input('EmployeeName', sql.NVarChar(220), name || employee.id)
        .input('Department', sql.NVarChar(180), employee.department)
        .input('JobTitle', sql.NVarChar(180), employee.jobTitle)
        .input('TemplateId', sql.NVarChar(40), input.templateId)
        .input('ExportFormat', sql.NVarChar(10), format)
        .input('PhotoPresent', sql.Bit, employee.photoUrl ? 1 : 0)
        .input('Status', sql.NVarChar(20), nextIssueStatus(prior))
        .input('IssuedBy', sql.NVarChar(120), actor)
        .query(`
          INSERT INTO [hris].[IdCardIssues] (
            [Id], [BatchId], [EmployeeCode], [EmployeeName], [Department], [JobTitle],
            [TemplateId], [ExportFormat], [PhotoPresent], [Status], [IssuedBy]
          ) VALUES (
            @Id, @BatchId, @EmployeeCode, @EmployeeName, @Department, @JobTitle,
            @TemplateId, @ExportFormat, @PhotoPresent, @Status, @IssuedBy
          )
        `);
    }
    await transaction.commit();
  } catch (error) {
    await transaction.rollback().catch(() => undefined);
    throw error;
  }

  return readIdCardWorkspace();
};
