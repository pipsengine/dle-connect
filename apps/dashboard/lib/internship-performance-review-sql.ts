import type { ConnectionPool } from 'mssql';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';

export const ENSURE_INTERNSHIP_REVIEW_SCHEMA_SQL = `
IF SCHEMA_ID(N'hris') IS NULL EXEC(N'CREATE SCHEMA [hris]');

IF OBJECT_ID(N'[hris].[InternshipReviews]', N'U') IS NULL
CREATE TABLE [hris].[InternshipReviews] (
  [ReviewId] NVARCHAR(80) NOT NULL CONSTRAINT [PK_InternshipReviews] PRIMARY KEY,
  [EmployeeCode] NVARCHAR(80) NOT NULL,
  [EmployeeName] NVARCHAR(220) NOT NULL,
  [Department] NVARCHAR(180) NULL,
  [Status] NVARCHAR(60) NOT NULL,
  [Supervisor] NVARCHAR(220) NULL,
  [SupervisorCode] NVARCHAR(80) NULL,
  [DueDate] DATE NULL,
  [Overall] DECIMAL(9, 4) NOT NULL CONSTRAINT [DF_InternshipReviews_Overall] DEFAULT (0),
  [CreatedBy] NVARCHAR(160) NOT NULL,
  [CreatedAt] DATETIME2(3) NOT NULL CONSTRAINT [DF_InternshipReviews_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(3) NOT NULL CONSTRAINT [DF_InternshipReviews_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [ReviewJson] NVARCHAR(MAX) NOT NULL
);

IF OBJECT_ID(N'[hris].[InternshipReviewSettings]', N'U') IS NULL
CREATE TABLE [hris].[InternshipReviewSettings] (
  [SettingsKey] NVARCHAR(80) NOT NULL CONSTRAINT [PK_InternshipReviewSettings] PRIMARY KEY,
  [EligibilityMonths] INT NOT NULL,
  [Workflow] NVARCHAR(200) NOT NULL,
  [ReminderSchedule] NVARCHAR(200) NOT NULL,
  [LockAfterSubmission] BIT NOT NULL CONSTRAINT [DF_InternshipReviewSettings_Lock] DEFAULT (1),
  [UpdatedAt] DATETIME2(3) NOT NULL CONSTRAINT [DF_InternshipReviewSettings_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedBy] NVARCHAR(160) NULL
);
`;

let schemaReady = false;

export const ensureInternshipReviewSqlSchema = async (pool: ConnectionPool) => {
  if (schemaReady) return;
  await pool.request().query(ENSURE_INTERNSHIP_REVIEW_SCHEMA_SQL);
  schemaReady = true;
};

export const getInternshipReviewSqlPool = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) {
    throw new Error('DLE Enterprise SQL is unavailable. Internship performance reviews require live database persistence.');
  }
  await ensureInternshipReviewSqlSchema(pool);
  return pool;
};

export const resetInternshipReviewSchemaReadyFlag = () => {
  schemaReady = false;
};
