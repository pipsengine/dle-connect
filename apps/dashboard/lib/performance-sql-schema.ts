import type { ConnectionPool } from 'mssql';

/** Idempotent DDL for Performance Management in DLE_Enterprise. */
export const ENSURE_PERFORMANCE_SCHEMA_SQL = `
IF SCHEMA_ID(N'hris') IS NULL EXEC(N'CREATE SCHEMA [hris]');

IF OBJECT_ID(N'[hris].[PerformanceMigrations]', N'U') IS NULL
CREATE TABLE [hris].[PerformanceMigrations] (
  [MigrationKey] NVARCHAR(80) NOT NULL CONSTRAINT [PK_PerformanceMigrations] PRIMARY KEY,
  [SourcePath] NVARCHAR(400) NULL,
  [SourceHash] NVARCHAR(128) NULL,
  [SourceVersion] INT NULL,
  [RowCountsJson] NVARCHAR(MAX) NULL,
  [Status] NVARCHAR(40) NOT NULL CONSTRAINT [DF_PerformanceMigrations_Status] DEFAULT N'Pending',
  [CompletedAt] DATETIME2(3) NULL,
  [CompletedBy] NVARCHAR(160) NULL,
  [Notes] NVARCHAR(1000) NULL,
  [CreatedAt] DATETIME2(3) NOT NULL CONSTRAINT [DF_PerformanceMigrations_CreatedAt] DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID(N'[hris].[PerformanceDomainDocuments]', N'U') IS NULL
CREATE TABLE [hris].[PerformanceDomainDocuments] (
  [DocumentKey] NVARCHAR(80) NOT NULL CONSTRAINT [PK_PerformanceDomainDocuments] PRIMARY KEY,
  [SchemaVersion] INT NOT NULL CONSTRAINT [DF_PerformanceDomainDocuments_SchemaVersion] DEFAULT (1),
  [DomainJson] NVARCHAR(MAX) NOT NULL,
  [SourceHash] NVARCHAR(128) NULL,
  [UpdatedAt] DATETIME2(3) NOT NULL CONSTRAINT [DF_PerformanceDomainDocuments_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedBy] NVARCHAR(160) NULL,
  [RowVersion] ROWVERSION NOT NULL
);

IF OBJECT_ID(N'[hris].[PerformanceCycles]', N'U') IS NULL
CREATE TABLE [hris].[PerformanceCycles] (
  [CycleId] NVARCHAR(80) NOT NULL CONSTRAINT [PK_PerformanceCycles] PRIMARY KEY,
  [Name] NVARCHAR(200) NOT NULL,
  [Type] NVARCHAR(80) NOT NULL,
  [Year] INT NOT NULL,
  [Status] NVARCHAR(60) NOT NULL,
  [StartDate] DATE NOT NULL,
  [EndDate] DATE NOT NULL,
  [EligibilityCount] INT NOT NULL CONSTRAINT [DF_PerformanceCycles_EligibilityCount] DEFAULT (0),
  [Version] INT NOT NULL CONSTRAINT [DF_PerformanceCycles_Version] DEFAULT (1),
  [PublishedAt] DATETIME2(3) NULL,
  [CreatedBy] NVARCHAR(160) NOT NULL,
  [CreatedAt] DATETIME2(3) NOT NULL CONSTRAINT [DF_PerformanceCycles_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(3) NOT NULL CONSTRAINT [DF_PerformanceCycles_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [CycleJson] NVARCHAR(MAX) NOT NULL
);

IF OBJECT_ID(N'[hris].[PerformanceCycleEligibility]', N'U') IS NULL
CREATE TABLE [hris].[PerformanceCycleEligibility] (
  [EligibilityId] NVARCHAR(80) NOT NULL CONSTRAINT [PK_PerformanceCycleEligibility] PRIMARY KEY,
  [CycleId] NVARCHAR(80) NOT NULL,
  [EmployeeId] NVARCHAR(80) NOT NULL,
  [EmployeeCode] NVARCHAR(80) NOT NULL,
  [FullName] NVARCHAR(220) NOT NULL,
  [Department] NVARCHAR(180) NULL,
  [JobTitle] NVARCHAR(180) NULL,
  [ManagerId] NVARCHAR(80) NULL,
  [ManagerName] NVARCHAR(220) NULL,
  [Included] BIT NOT NULL CONSTRAINT [DF_PerformanceCycleEligibility_Included] DEFAULT (1),
  [Reason] NVARCHAR(400) NULL,
  [SnapshotAt] DATETIME2(3) NOT NULL CONSTRAINT [DF_PerformanceCycleEligibility_SnapshotAt] DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID(N'[hris].[PerformanceGoals]', N'U') IS NULL
CREATE TABLE [hris].[PerformanceGoals] (
  [GoalId] NVARCHAR(80) NOT NULL CONSTRAINT [PK_PerformanceGoals] PRIMARY KEY,
  [CycleId] NVARCHAR(80) NOT NULL,
  [EmployeeId] NVARCHAR(80) NOT NULL,
  [EmployeeCode] NVARCHAR(80) NULL,
  [EmployeeName] NVARCHAR(220) NOT NULL,
  [ManagerId] NVARCHAR(80) NULL,
  [Status] NVARCHAR(60) NOT NULL,
  [ProgressPercent] DECIMAL(9, 4) NOT NULL CONSTRAINT [DF_PerformanceGoals_Progress] DEFAULT (0),
  [Weight] DECIMAL(9, 4) NOT NULL CONSTRAINT [DF_PerformanceGoals_Weight] DEFAULT (100),
  [Version] INT NOT NULL CONSTRAINT [DF_PerformanceGoals_Version] DEFAULT (1),
  [UpdatedAt] DATETIME2(3) NOT NULL CONSTRAINT [DF_PerformanceGoals_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [GoalJson] NVARCHAR(MAX) NOT NULL
);

IF OBJECT_ID(N'[hris].[PerformanceResults]', N'U') IS NULL
CREATE TABLE [hris].[PerformanceResults] (
  [ResultId] NVARCHAR(80) NOT NULL CONSTRAINT [PK_PerformanceResults] PRIMARY KEY,
  [CycleId] NVARCHAR(80) NOT NULL,
  [EmployeeId] NVARCHAR(80) NOT NULL,
  [EmployeeName] NVARCHAR(220) NOT NULL,
  [FinalScore] DECIMAL(19, 4) NOT NULL,
  [RatingBand] NVARCHAR(80) NOT NULL,
  [Status] NVARCHAR(60) NOT NULL,
  [Version] INT NOT NULL CONSTRAINT [DF_PerformanceResults_Version] DEFAULT (1),
  [PublishedAt] DATETIME2(3) NULL,
  [AcknowledgedAt] DATETIME2(3) NULL,
  [ResultJson] NVARCHAR(MAX) NOT NULL
);

IF OBJECT_ID(N'[hris].[PerformanceAssessments]', N'U') IS NULL
CREATE TABLE [hris].[PerformanceAssessments] (
  [AssessmentId] NVARCHAR(80) NOT NULL CONSTRAINT [PK_PerformanceAssessments] PRIMARY KEY,
  [CycleId] NVARCHAR(80) NOT NULL,
  [EmployeeId] NVARCHAR(80) NOT NULL,
  [EmployeeName] NVARCHAR(220) NOT NULL,
  [AssessmentType] NVARCHAR(40) NOT NULL,
  [Status] NVARCHAR(60) NOT NULL,
  [Version] INT NOT NULL CONSTRAINT [DF_PerformanceAssessments_Version] DEFAULT (1),
  [SubmittedAt] DATETIME2(3) NULL,
  [UpdatedAt] DATETIME2(3) NOT NULL CONSTRAINT [DF_PerformanceAssessments_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [AssessmentJson] NVARCHAR(MAX) NOT NULL
);

IF OBJECT_ID(N'[hris].[PerformanceTasks]', N'U') IS NULL
CREATE TABLE [hris].[PerformanceTasks] (
  [TaskId] NVARCHAR(80) NOT NULL CONSTRAINT [PK_PerformanceTasks] PRIMARY KEY,
  [CycleId] NVARCHAR(80) NULL,
  [EmployeeId] NVARCHAR(80) NOT NULL,
  [AssigneeId] NVARCHAR(80) NOT NULL,
  [Status] NVARCHAR(40) NOT NULL,
  [DueDate] DATE NULL,
  [Title] NVARCHAR(400) NOT NULL,
  [CreatedAt] DATETIME2(3) NOT NULL CONSTRAINT [DF_PerformanceTasks_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [TaskJson] NVARCHAR(MAX) NOT NULL
);

IF OBJECT_ID(N'[hris].[PerformanceAuditTrail]', N'U') IS NULL
CREATE TABLE [hris].[PerformanceAuditTrail] (
  [AuditId] NVARCHAR(80) NOT NULL CONSTRAINT [PK_PerformanceAuditTrail] PRIMARY KEY,
  [EventAt] DATETIME2(3) NOT NULL,
  [Actor] NVARCHAR(160) NOT NULL,
  [ActorRole] NVARCHAR(80) NOT NULL,
  [Action] NVARCHAR(200) NOT NULL,
  [EntityType] NVARCHAR(80) NOT NULL,
  [EntityId] NVARCHAR(80) NOT NULL,
  [BeforeValue] NVARCHAR(1000) NULL,
  [AfterValue] NVARCHAR(1000) NULL,
  [Reason] NVARCHAR(1000) NULL,
  [CorrelationId] NVARCHAR(80) NULL
);

IF OBJECT_ID(N'[hris].[PerformanceAnalyticsSnapshots]', N'U') IS NULL
CREATE TABLE [hris].[PerformanceAnalyticsSnapshots] (
  [SnapshotId] NVARCHAR(80) NOT NULL CONSTRAINT [PK_PerformanceAnalyticsSnapshots] PRIMARY KEY,
  [CycleId] NVARCHAR(80) NULL,
  [GeneratedAt] DATETIME2(3) NOT NULL CONSTRAINT [DF_PerformanceAnalyticsSnapshots_GeneratedAt] DEFAULT SYSUTCDATETIME(),
  [Employees] INT NOT NULL CONSTRAINT [DF_PerformanceAnalyticsSnapshots_Employees] DEFAULT (0),
  [ReviewsCompleted] INT NOT NULL CONSTRAINT [DF_PerformanceAnalyticsSnapshots_Reviews] DEFAULT (0),
  [PendingReviews] INT NOT NULL CONSTRAINT [DF_PerformanceAnalyticsSnapshots_Pending] DEFAULT (0),
  [GoalCompletionPct] DECIMAL(9, 4) NOT NULL CONSTRAINT [DF_PerformanceAnalyticsSnapshots_Goals] DEFAULT (0),
  [HighPerformers] INT NOT NULL CONSTRAINT [DF_PerformanceAnalyticsSnapshots_High] DEFAULT (0),
  [PipEmployees] INT NOT NULL CONSTRAINT [DF_PerformanceAnalyticsSnapshots_Pip] DEFAULT (0),
  [SnapshotJson] NVARCHAR(MAX) NULL
);

IF OBJECT_ID(N'[hris].[PerformanceNavPreferences]', N'U') IS NULL
CREATE TABLE [hris].[PerformanceNavPreferences] (
  [UserKey] NVARCHAR(120) NOT NULL CONSTRAINT [PK_PerformanceNavPreferences] PRIMARY KEY,
  [PreferencesJson] NVARCHAR(MAX) NOT NULL,
  [UpdatedAt] DATETIME2(3) NOT NULL CONSTRAINT [DF_PerformanceNavPreferences_UpdatedAt] DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID(N'[hris].[PerformanceOutbox]', N'U') IS NULL
CREATE TABLE [hris].[PerformanceOutbox] (
  [OutboxId] NVARCHAR(80) NOT NULL CONSTRAINT [PK_PerformanceOutbox] PRIMARY KEY,
  [Kind] NVARCHAR(80) NOT NULL,
  [PayloadJson] NVARCHAR(MAX) NOT NULL,
  [Status] NVARCHAR(40) NOT NULL CONSTRAINT [DF_PerformanceOutbox_Status] DEFAULT N'Pending',
  [CreatedAt] DATETIME2(3) NOT NULL CONSTRAINT [DF_PerformanceOutbox_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [ProcessedAt] DATETIME2(3) NULL,
  [ErrorMessage] NVARCHAR(1000) NULL
);

IF OBJECT_ID(N'[hris].[PerformanceProbationAlerts]', N'U') IS NULL
CREATE TABLE [hris].[PerformanceProbationAlerts] (
  [ProbationId] NVARCHAR(80) NOT NULL,
  [ThresholdDays] INT NOT NULL,
  [RaisedAt] DATETIME2(3) NOT NULL CONSTRAINT [DF_PerformanceProbationAlerts_RaisedAt] DEFAULT SYSUTCDATETIME(),
  [TaskId] NVARCHAR(80) NULL,
  CONSTRAINT [PK_PerformanceProbationAlerts] PRIMARY KEY ([ProbationId], [ThresholdDays])
);
`;

let schemaReady = false;

export const performanceSqlRequired = () => {
  const explicit = process.env.HRIS_PERFORMANCE_REQUIRE_SQL;
  if (explicit === 'false' || explicit === '0' || explicit === 'off') return false;
  if (explicit === 'true' || explicit === '1' || explicit === 'on') return true;
  return process.env.HRIS_REQUIRE_DB_EMPLOYEE_SOURCE !== 'false';
};

export const performanceJsonFallbackAllowed = () =>
  process.env.HRIS_PERFORMANCE_JSON_FALLBACK === 'true'
  || !performanceSqlRequired();

export const DOMAIN_DOCUMENT_KEY = 'performance-domain-v1';
export const MIGRATION_KEY = 'performance-domain-v1';

export const ensurePerformanceSqlSchema = async (pool: ConnectionPool) => {
  if (schemaReady) return;
  await pool.request().query(ENSURE_PERFORMANCE_SCHEMA_SQL);
  schemaReady = true;
};

export const resetPerformanceSchemaReadyFlag = () => {
  schemaReady = false;
};
