import sql from 'mssql';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';

let schemaReady = false;

const ENSURE_PM_SCHEMA_SQL = `
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'pm') EXEC(N'CREATE SCHEMA pm');

IF OBJECT_ID(N'[pm].[Projects]', N'U') IS NULL
BEGIN
  CREATE TABLE [pm].[Projects](
    [ProjectId] uniqueidentifier NOT NULL CONSTRAINT [PK_pm_Projects] PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [ProjectCode] nvarchar(30) NOT NULL,
    [ProjectName] nvarchar(200) NOT NULL,
    [ProjectType] nvarchar(30) NOT NULL,
    [ClientId] uniqueidentifier NULL,
    [ClientName] nvarchar(200) NULL,
    [BusinessUnit] nvarchar(100) NOT NULL,
    [ProjectManagerEmployeeId] uniqueidentifier NULL,
    [ProjectManagerName] nvarchar(220) NULL,
    [ProjectManagerEmployeeCode] nvarchar(80) NULL,
    [ProjectManagerUsername] nvarchar(120) NULL,
    [RegistryId] nvarchar(80) NULL,
    [ExecutiveSponsorEmployeeId] uniqueidentifier NULL,
    [ContractNumber] nvarchar(80) NULL,
    [ContractValue] decimal(19,4) NOT NULL CONSTRAINT [DF_pm_Projects_ContractValue] DEFAULT 0,
    [Currency] char(3) NOT NULL CONSTRAINT [DF_pm_Projects_Currency] DEFAULT N'NGN',
    [CostCentre] nvarchar(40) NULL,
    [CommercialModel] nvarchar(30) NULL,
    [Location] nvarchar(200) NULL,
    [PlannedStart] date NOT NULL,
    [PlannedFinish] date NOT NULL,
    [ForecastFinish] date NULL,
    [ActualFinish] date NULL,
    [Phase] nvarchar(50) NULL,
    [Status] nvarchar(30) NOT NULL CONSTRAINT [DF_pm_Projects_Status] DEFAULT N'Draft',
    [Health] nvarchar(20) NOT NULL CONSTRAINT [DF_pm_Projects_Health] DEFAULT N'Healthy',
    [PlannedProgress] decimal(7,3) NOT NULL CONSTRAINT [DF_pm_Projects_PlannedProgress] DEFAULT 0,
    [ActualProgress] decimal(7,3) NOT NULL CONSTRAINT [DF_pm_Projects_ActualProgress] DEFAULT 0,
    [SchedulePerformanceIndex] decimal(8,4) NULL,
    [CostPerformanceIndex] decimal(8,4) NULL,
    [Description] nvarchar(max) NULL,
    [SecurityClassification] nvarchar(30) NOT NULL CONSTRAINT [DF_pm_Projects_Security] DEFAULT N'DLE Internal',
    [CreatedBy] uniqueidentifier NOT NULL,
    [CreatedAt] datetime2(3) NOT NULL CONSTRAINT [DF_pm_Projects_CreatedAt] DEFAULT SYSUTCDATETIME(),
    [ModifiedBy] uniqueidentifier NULL,
    [ModifiedAt] datetime2(3) NOT NULL CONSTRAINT [DF_pm_Projects_ModifiedAt] DEFAULT SYSUTCDATETIME(),
    [IsDeleted] bit NOT NULL CONSTRAINT [DF_pm_Projects_IsDeleted] DEFAULT 0,
    [RowVersion] rowversion,
    CONSTRAINT [UQ_pm_Projects_ProjectCode] UNIQUE([ProjectCode])
  );
  CREATE INDEX [IX_pm_Projects_StatusHealth] ON [pm].[Projects]([Status],[Health])
    INCLUDE([ProjectCode],[ProjectName],[PlannedFinish],[ActualProgress],[RegistryId]);
END;

IF COL_LENGTH(N'pm.Projects', N'RegistryId') IS NULL
  ALTER TABLE [pm].[Projects] ADD [RegistryId] nvarchar(80) NULL;
IF COL_LENGTH(N'pm.Projects', N'ProjectManagerName') IS NULL
  ALTER TABLE [pm].[Projects] ADD [ProjectManagerName] nvarchar(220) NULL;
IF COL_LENGTH(N'pm.Projects', N'ProjectManagerEmployeeCode') IS NULL
  ALTER TABLE [pm].[Projects] ADD [ProjectManagerEmployeeCode] nvarchar(80) NULL;
IF COL_LENGTH(N'pm.Projects', N'ProjectManagerUsername') IS NULL
  ALTER TABLE [pm].[Projects] ADD [ProjectManagerUsername] nvarchar(120) NULL;

IF OBJECT_ID(N'[pm].[ManHourBudgets]', N'U') IS NULL
BEGIN
  CREATE TABLE [pm].[ManHourBudgets](
    [ProjectCode] nvarchar(30) NOT NULL CONSTRAINT [PK_pm_ManHourBudgets] PRIMARY KEY,
    [BudgetedHours] decimal(12,2) NOT NULL CONSTRAINT [DF_pm_ManHourBudgets_Hours] DEFAULT 0,
    [EtcHours] decimal(12,2) NULL,
    [Notes] nvarchar(500) NULL,
    [ModifiedBy] nvarchar(120) NULL,
    [ModifiedAt] datetime2(3) NOT NULL CONSTRAINT [DF_pm_ManHourBudgets_ModifiedAt] DEFAULT SYSUTCDATETIME()
  );
END;

IF OBJECT_ID(N'[pm].[AuditEvents]', N'U') IS NULL
BEGIN
  CREATE TABLE [pm].[AuditEvents](
    [AuditEventId] uniqueidentifier NOT NULL CONSTRAINT [PK_pm_AuditEvents] PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [OccurredAt] datetime2(3) NOT NULL CONSTRAINT [DF_pm_AuditEvents_OccurredAt] DEFAULT SYSUTCDATETIME(),
    [ActorUserId] nvarchar(80) NULL,
    [ActorEmployeeCode] nvarchar(80) NULL,
    [ActorRole] nvarchar(120) NULL,
    [Action] nvarchar(80) NOT NULL,
    [EntityType] nvarchar(80) NOT NULL,
    [EntityId] nvarchar(80) NULL,
    [ProjectCode] nvarchar(30) NULL,
    [PreviousValue] nvarchar(max) NULL,
    [NewValue] nvarchar(max) NULL,
    [Reason] nvarchar(500) NULL,
    [ApprovalReference] nvarchar(120) NULL,
    [IpAddress] nvarchar(64) NULL
  );
  CREATE INDEX [IX_pm_AuditEvents_Project] ON [pm].[AuditEvents]([ProjectCode],[OccurredAt] DESC);
END;

IF OBJECT_ID(N'[pm].[Risks]', N'U') IS NULL
BEGIN
  CREATE TABLE [pm].[Risks](
    [RiskId] uniqueidentifier NOT NULL CONSTRAINT [PK_pm_Risks] PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [ProjectCode] nvarchar(30) NOT NULL,
    [Title] nvarchar(200) NOT NULL,
    [Category] nvarchar(80) NULL,
    [Likelihood] tinyint NOT NULL CONSTRAINT [CK_pm_Risks_Likelihood] CHECK ([Likelihood] BETWEEN 1 AND 5),
    [Impact] tinyint NOT NULL CONSTRAINT [CK_pm_Risks_Impact] CHECK ([Impact] BETWEEN 1 AND 5),
    [ResidualLikelihood] tinyint NULL,
    [ResidualImpact] tinyint NULL,
    [CostExposure] decimal(19,4) NULL,
    [ScheduleExposureDays] decimal(10,2) NULL,
    [OwnerEmployeeCode] nvarchar(80) NULL,
    [Status] nvarchar(30) NOT NULL CONSTRAINT [DF_pm_Risks_Status] DEFAULT N'Open',
    [Mitigation] nvarchar(max) NULL,
    [CreatedAt] datetime2(3) NOT NULL CONSTRAINT [DF_pm_Risks_CreatedAt] DEFAULT SYSUTCDATETIME(),
    [ModifiedAt] datetime2(3) NOT NULL CONSTRAINT [DF_pm_Risks_ModifiedAt] DEFAULT SYSUTCDATETIME(),
    [IsDeleted] bit NOT NULL CONSTRAINT [DF_pm_Risks_IsDeleted] DEFAULT 0
  );
  CREATE INDEX [IX_pm_Risks_ProjectStatus] ON [pm].[Risks]([ProjectCode],[Status]) WHERE [IsDeleted]=0;
END;

IF OBJECT_ID(N'[pm].[Actions]', N'U') IS NULL
BEGIN
  CREATE TABLE [pm].[Actions](
    [ActionId] uniqueidentifier NOT NULL CONSTRAINT [PK_pm_Actions] PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [ProjectCode] nvarchar(30) NULL,
    [Title] nvarchar(240) NOT NULL,
    [SourceModule] nvarchar(80) NULL,
    [OwnerEmployeeCode] nvarchar(80) NULL,
    [DueDate] date NULL,
    [Priority] nvarchar(20) NOT NULL CONSTRAINT [DF_pm_Actions_Priority] DEFAULT N'Medium',
    [Status] nvarchar(30) NOT NULL CONSTRAINT [DF_pm_Actions_Status] DEFAULT N'Open',
    [CreatedAt] datetime2(3) NOT NULL CONSTRAINT [DF_pm_Actions_CreatedAt] DEFAULT SYSUTCDATETIME(),
    [ModifiedAt] datetime2(3) NOT NULL CONSTRAINT [DF_pm_Actions_ModifiedAt] DEFAULT SYSUTCDATETIME(),
    [IsDeleted] bit NOT NULL CONSTRAINT [DF_pm_Actions_IsDeleted] DEFAULT 0
  );
  CREATE INDEX [IX_pm_Actions_OwnerDue] ON [pm].[Actions]([OwnerEmployeeCode],[DueDate]) WHERE [IsDeleted]=0;
END;

IF OBJECT_ID(N'[pm].[LessonsLearned]', N'U') IS NULL
BEGIN
  CREATE TABLE [pm].[LessonsLearned](
    [LessonId] uniqueidentifier NOT NULL CONSTRAINT [PK_pm_LessonsLearned] PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [ProjectCode] nvarchar(30) NULL,
    [Phase] nvarchar(80) NULL,
    [Discipline] nvarchar(80) NULL,
    [Category] nvarchar(80) NULL,
    [Situation] nvarchar(max) NULL,
    [WhatHappened] nvarchar(max) NULL,
    [RootCause] nvarchar(max) NULL,
    [Impact] nvarchar(max) NULL,
    [Lesson] nvarchar(max) NOT NULL,
    [Recommendation] nvarchar(max) NULL,
    [OwnerEmployeeCode] nvarchar(80) NULL,
    [Reusable] bit NOT NULL CONSTRAINT [DF_pm_Lessons_Reusable] DEFAULT 1,
    [Confidentiality] nvarchar(40) NOT NULL CONSTRAINT [DF_pm_Lessons_Conf] DEFAULT N'Internal',
    [CreatedAt] datetime2(3) NOT NULL CONSTRAINT [DF_pm_Lessons_CreatedAt] DEFAULT SYSUTCDATETIME(),
    [IsDeleted] bit NOT NULL CONSTRAINT [DF_pm_Lessons_IsDeleted] DEFAULT 0
  );
END;

IF OBJECT_ID(N'[pm].[AIInsights]', N'U') IS NULL
BEGIN
  CREATE TABLE [pm].[AIInsights](
    [InsightId] uniqueidentifier NOT NULL CONSTRAINT [PK_pm_AIInsights] PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [ProjectCode] nvarchar(30) NULL,
    [Title] nvarchar(240) NOT NULL,
    [Reason] nvarchar(max) NULL,
    [DataSource] nvarchar(200) NULL,
    [Confidence] decimal(5,2) NULL,
    [RecommendedAction] nvarchar(max) NULL,
    [GeneratedAt] datetime2(3) NOT NULL CONSTRAINT [DF_pm_AIInsights_GeneratedAt] DEFAULT SYSUTCDATETIME(),
    [Status] nvarchar(30) NOT NULL CONSTRAINT [DF_pm_AIInsights_Status] DEFAULT N'Open',
    [IsAdvisory] bit NOT NULL CONSTRAINT [DF_pm_AIInsights_Advisory] DEFAULT 1
  );
END;
`;

export async function ensurePmDb() {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) {
    throw new Error(
      'DLE Enterprise database is not configured. Verify DLE_ENTERPRISE_DB_HOST, DLE_ENTERPRISE_DB_NAME, and credentials.',
    );
  }
  if (!schemaReady) {
    await pool.request().query(ENSURE_PM_SCHEMA_SQL);
    schemaReady = true;
  }
  return pool;
}

export async function pmQuery<T = Record<string, unknown>>(
  text: string,
  params: Record<string, unknown> = {},
) {
  const pool = await ensurePmDb();
  const req = pool.request();
  for (const [key, value] of Object.entries(params)) {
    req.input(key, value as never);
  }
  const result = await req.query<T>(text);
  return result.recordset;
}

export { sql };
