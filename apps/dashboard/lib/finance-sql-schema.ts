/** Idempotent DDL for Finance Intelligence & Approvals in DLE_Enterprise. */
export const ensureFinanceSchemaSql = `
IF SCHEMA_ID(N'finance') IS NULL EXEC(N'CREATE SCHEMA [finance]');

IF OBJECT_ID(N'[finance].[IntegrationStatus]', N'U') IS NULL
CREATE TABLE [finance].[IntegrationStatus] (
  [IntegrationId] NVARCHAR(60) NOT NULL CONSTRAINT [PK_FinanceIntegrationStatus] PRIMARY KEY,
  [SourceSystem] NVARCHAR(80) NOT NULL CONSTRAINT [DF_FinanceIntegration_Source] DEFAULT N'Sage X3 Enterprise',
  [CompanyCode] NVARCHAR(40) NULL,
  [Status] NVARCHAR(40) NOT NULL CONSTRAINT [DF_FinanceIntegration_Status] DEFAULT N'Pending',
  [LastRefreshAt] DATETIME2(0) NULL,
  [LastSuccessAt] DATETIME2(0) NULL,
  [LastError] NVARCHAR(MAX) NULL,
  [RecordsSynced] INT NOT NULL CONSTRAINT [DF_FinanceIntegration_Records] DEFAULT 0,
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FinanceIntegration_UpdatedAt] DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID(N'[finance].[Entities]', N'U') IS NULL
CREATE TABLE [finance].[Entities] (
  [EntityId] NVARCHAR(60) NOT NULL CONSTRAINT [PK_FinanceEntities] PRIMARY KEY,
  [EntityCode] NVARCHAR(40) NOT NULL,
  [EntityName] NVARCHAR(200) NOT NULL,
  [ParentEntityId] NVARCHAR(60) NULL,
  [CurrencyCode] NVARCHAR(10) NOT NULL CONSTRAINT [DF_FinanceEntities_Currency] DEFAULT N'NGN',
  [IsActive] BIT NOT NULL CONSTRAINT [DF_FinanceEntities_Active] DEFAULT 1,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FinanceEntities_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FinanceEntities_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  CONSTRAINT [UQ_FinanceEntities_Code] UNIQUE ([EntityCode])
);

IF OBJECT_ID(N'[finance].[ReportingPeriods]', N'U') IS NULL
CREATE TABLE [finance].[ReportingPeriods] (
  [PeriodId] NVARCHAR(60) NOT NULL CONSTRAINT [PK_FinanceReportingPeriods] PRIMARY KEY,
  [FiscalYear] INT NOT NULL,
  [PeriodNumber] INT NOT NULL,
  [PeriodLabel] NVARCHAR(80) NOT NULL,
  [StartDate] DATE NOT NULL,
  [EndDate] DATE NOT NULL,
  [Status] NVARCHAR(40) NOT NULL CONSTRAINT [DF_FinancePeriods_Status] DEFAULT N'Open',
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FinancePeriods_CreatedAt] DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID(N'[finance].[ApprovalRequests]', N'U') IS NULL
CREATE TABLE [finance].[ApprovalRequests] (
  [RequestId] NVARCHAR(60) NOT NULL CONSTRAINT [PK_FinanceApprovalRequests] PRIMARY KEY,
  [RequestNumber] NVARCHAR(60) NOT NULL,
  [PaymentType] NVARCHAR(80) NOT NULL,
  [Title] NVARCHAR(250) NOT NULL,
  [Beneficiary] NVARCHAR(250) NOT NULL,
  [Description] NVARCHAR(MAX) NULL,
  [Amount] DECIMAL(19,4) NOT NULL,
  [CurrencyCode] NVARCHAR(10) NOT NULL CONSTRAINT [DF_FinanceApprovals_Currency] DEFAULT N'NGN',
  [Department] NVARCHAR(150) NULL,
  [ProjectCode] NVARCHAR(80) NULL,
  [CostCentre] NVARCHAR(80) NULL,
  [RequesterCode] NVARCHAR(60) NULL,
  [RequesterName] NVARCHAR(200) NULL,
  [SubmittedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FinanceApprovals_SubmittedAt] DEFAULT SYSUTCDATETIME(),
  [CurrentStage] NVARCHAR(80) NOT NULL,
  [CurrentApproverCode] NVARCHAR(60) NULL,
  [CurrentApproverName] NVARCHAR(200) NULL,
  [Status] NVARCHAR(40) NOT NULL CONSTRAINT [DF_FinanceApprovals_Status] DEFAULT N'Pending',
  [Priority] NVARCHAR(40) NOT NULL CONSTRAINT [DF_FinanceApprovals_Priority] DEFAULT N'Normal',
  [DueDate] DATE NULL,
  [SageReference] NVARCHAR(120) NULL,
  [SourceDocumentNo] NVARCHAR(120) NULL,
  [RiskFlags] NVARCHAR(MAX) NULL,
  [BankDetailsSummary] NVARCHAR(500) NULL,
  [FinancialContextJson] NVARCHAR(MAX) NULL,
  [PayloadJson] NVARCHAR(MAX) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FinanceApprovals_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FinanceApprovals_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  CONSTRAINT [UQ_FinanceApprovals_RequestNumber] UNIQUE ([RequestNumber])
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FinanceApprovals_Status' AND object_id = OBJECT_ID(N'[finance].[ApprovalRequests]'))
  CREATE INDEX [IX_FinanceApprovals_Status] ON [finance].[ApprovalRequests] ([Status], [SubmittedAt] DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FinanceApprovals_Approver' AND object_id = OBJECT_ID(N'[finance].[ApprovalRequests]'))
  CREATE INDEX [IX_FinanceApprovals_Approver] ON [finance].[ApprovalRequests] ([CurrentApproverCode], [Status]);

IF OBJECT_ID(N'[finance].[ApprovalActions]', N'U') IS NULL
CREATE TABLE [finance].[ApprovalActions] (
  [ActionId] NVARCHAR(60) NOT NULL CONSTRAINT [PK_FinanceApprovalActions] PRIMARY KEY,
  [RequestId] NVARCHAR(60) NOT NULL,
  [ActionType] NVARCHAR(40) NOT NULL,
  [Stage] NVARCHAR(80) NULL,
  [ActorCode] NVARCHAR(60) NULL,
  [ActorName] NVARCHAR(200) NULL,
  [Comment] NVARCHAR(MAX) NULL,
  [Reason] NVARCHAR(MAX) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FinanceApprovalActions_CreatedAt] DEFAULT SYSUTCDATETIME()
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FinanceApprovalActions_Request' AND object_id = OBJECT_ID(N'[finance].[ApprovalActions]'))
  CREATE INDEX [IX_FinanceApprovalActions_Request] ON [finance].[ApprovalActions] ([RequestId], [CreatedAt] DESC);

IF OBJECT_ID(N'[finance].[ApprovalDelegations]', N'U') IS NULL
CREATE TABLE [finance].[ApprovalDelegations] (
  [DelegationId] NVARCHAR(60) NOT NULL CONSTRAINT [PK_FinanceApprovalDelegations] PRIMARY KEY,
  [FromEmployeeCode] NVARCHAR(60) NOT NULL,
  [ToEmployeeCode] NVARCHAR(60) NOT NULL,
  [StartsAt] DATETIME2(0) NOT NULL,
  [EndsAt] DATETIME2(0) NULL,
  [IsActive] BIT NOT NULL CONSTRAINT [DF_FinanceDelegations_Active] DEFAULT 1,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FinanceDelegations_CreatedAt] DEFAULT SYSUTCDATETIME()
);

IF COL_LENGTH(N'finance.ApprovalDelegations', N'FromEmployeeName') IS NULL
  ALTER TABLE [finance].[ApprovalDelegations] ADD [FromEmployeeName] NVARCHAR(200) NULL;
IF COL_LENGTH(N'finance.ApprovalDelegations', N'ToEmployeeName') IS NULL
  ALTER TABLE [finance].[ApprovalDelegations] ADD [ToEmployeeName] NVARCHAR(200) NULL;
IF COL_LENGTH(N'finance.ApprovalDelegations', N'ApproverRole') IS NULL
  ALTER TABLE [finance].[ApprovalDelegations] ADD [ApproverRole] NVARCHAR(120) NULL;
IF COL_LENGTH(N'finance.ApprovalDelegations', N'Scope') IS NULL
  ALTER TABLE [finance].[ApprovalDelegations] ADD [Scope] NVARCHAR(80) NULL;
IF COL_LENGTH(N'finance.ApprovalDelegations', N'Status') IS NULL
  ALTER TABLE [finance].[ApprovalDelegations] ADD [Status] NVARCHAR(40) NULL;
IF COL_LENGTH(N'finance.ApprovalDelegations', N'Reason') IS NULL
  ALTER TABLE [finance].[ApprovalDelegations] ADD [Reason] NVARCHAR(500) NULL;
IF COL_LENGTH(N'finance.ApprovalDelegations', N'CreatedBy') IS NULL
  ALTER TABLE [finance].[ApprovalDelegations] ADD [CreatedBy] NVARCHAR(120) NULL;
IF COL_LENGTH(N'finance.ApprovalDelegations', N'UpdatedBy') IS NULL
  ALTER TABLE [finance].[ApprovalDelegations] ADD [UpdatedBy] NVARCHAR(120) NULL;
IF COL_LENGTH(N'finance.ApprovalDelegations', N'UpdatedAt') IS NULL
  ALTER TABLE [finance].[ApprovalDelegations] ADD [UpdatedAt] DATETIME2(0) NULL;

IF OBJECT_ID(N'[finance].[ApprovalDelegationAudit]', N'U') IS NULL
CREATE TABLE [finance].[ApprovalDelegationAudit] (
  [AuditId] NVARCHAR(60) NOT NULL CONSTRAINT [PK_FinanceApprovalDelegationAudit] PRIMARY KEY,
  [DelegationId] NVARCHAR(60) NULL,
  [ActionType] NVARCHAR(40) NOT NULL,
  [ActorName] NVARCHAR(200) NULL,
  [DetailJson] NVARCHAR(MAX) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FinanceDelegationAudit_CreatedAt] DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID(N'[finance].[Reports]', N'U') IS NULL
CREATE TABLE [finance].[Reports] (
  [ReportId] NVARCHAR(60) NOT NULL CONSTRAINT [PK_FinanceReports] PRIMARY KEY,
  [ReportCode] NVARCHAR(80) NOT NULL,
  [ReportName] NVARCHAR(200) NOT NULL,
  [Category] NVARCHAR(80) NOT NULL,
  [DefinitionJson] NVARCHAR(MAX) NULL,
  [Status] NVARCHAR(40) NOT NULL CONSTRAINT [DF_FinanceReports_Status] DEFAULT N'Draft',
  [LastGeneratedAt] DATETIME2(0) NULL,
  [PendingSignOffCount] INT NOT NULL CONSTRAINT [DF_FinanceReports_PendingSignOff] DEFAULT 0,
  [CreatedBy] NVARCHAR(120) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FinanceReports_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FinanceReports_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  CONSTRAINT [UQ_FinanceReports_Code] UNIQUE ([ReportCode])
);

IF OBJECT_ID(N'[finance].[ReportVersions]', N'U') IS NULL
CREATE TABLE [finance].[ReportVersions] (
  [VersionId] NVARCHAR(60) NOT NULL CONSTRAINT [PK_FinanceReportVersions] PRIMARY KEY,
  [ReportId] NVARCHAR(60) NOT NULL,
  [VersionNumber] INT NOT NULL,
  [SnapshotJson] NVARCHAR(MAX) NULL,
  [CreatedBy] NVARCHAR(120) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FinanceReportVersions_CreatedAt] DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID(N'[finance].[ReportSignOffs]', N'U') IS NULL
CREATE TABLE [finance].[ReportSignOffs] (
  [SignOffId] NVARCHAR(60) NOT NULL CONSTRAINT [PK_FinanceReportSignOffs] PRIMARY KEY,
  [ReportId] NVARCHAR(60) NOT NULL,
  [VersionId] NVARCHAR(60) NULL,
  [SignerCode] NVARCHAR(60) NULL,
  [SignerName] NVARCHAR(200) NULL,
  [Status] NVARCHAR(40) NOT NULL,
  [Comment] NVARCHAR(MAX) NULL,
  [SignedAt] DATETIME2(0) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FinanceReportSignOffs_CreatedAt] DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID(N'[finance].[ReportDistributions]', N'U') IS NULL
CREATE TABLE [finance].[ReportDistributions] (
  [DistributionId] NVARCHAR(60) NOT NULL CONSTRAINT [PK_FinanceReportDistributions] PRIMARY KEY,
  [ReportId] NVARCHAR(60) NULL,
  [PackId] NVARCHAR(60) NULL,
  [Channel] NVARCHAR(40) NOT NULL CONSTRAINT [DF_FinanceDist_Channel] DEFAULT N'Email',
  [RecipientsJson] NVARCHAR(MAX) NULL,
  [ScheduledFor] DATETIME2(0) NULL,
  [Status] NVARCHAR(40) NOT NULL CONSTRAINT [DF_FinanceDist_Status] DEFAULT N'Scheduled',
  [FailureReason] NVARCHAR(MAX) NULL,
  [DeliveredAt] DATETIME2(0) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FinanceDist_CreatedAt] DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID(N'[finance].[FinancePacks]', N'U') IS NULL
CREATE TABLE [finance].[FinancePacks] (
  [PackId] NVARCHAR(60) NOT NULL CONSTRAINT [PK_FinancePacks] PRIMARY KEY,
  [PackType] NVARCHAR(80) NOT NULL,
  [PackName] NVARCHAR(200) NOT NULL,
  [PeriodLabel] NVARCHAR(80) NULL,
  [Status] NVARCHAR(40) NOT NULL CONSTRAINT [DF_FinancePacks_Status] DEFAULT N'Draft',
  [ContentsJson] NVARCHAR(MAX) NULL,
  [CreatedBy] NVARCHAR(120) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FinancePacks_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FinancePacks_UpdatedAt] DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID(N'[finance].[AiAnalyses]', N'U') IS NULL
CREATE TABLE [finance].[AiAnalyses] (
  [AnalysisId] NVARCHAR(60) NOT NULL CONSTRAINT [PK_FinanceAiAnalyses] PRIMARY KEY,
  [ConversationId] NVARCHAR(60) NULL,
  [Question] NVARCHAR(MAX) NOT NULL,
  [Response] NVARCHAR(MAX) NULL,
  [Confidence] NVARCHAR(40) NULL,
  [PeriodLabel] NVARCHAR(80) NULL,
  [SourceSystem] NVARCHAR(80) NOT NULL CONSTRAINT [DF_FinanceAi_Source] DEFAULT N'Sage X3 Enterprise',
  [EvidenceJson] NVARCHAR(MAX) NULL,
  [AssumptionsJson] NVARCHAR(MAX) NULL,
  [CreatedBy] NVARCHAR(120) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FinanceAi_CreatedAt] DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID(N'[finance].[AuditEvents]', N'U') IS NULL
CREATE TABLE [finance].[AuditEvents] (
  [EventId] NVARCHAR(60) NOT NULL CONSTRAINT [PK_FinanceAuditEvents] PRIMARY KEY,
  [EventType] NVARCHAR(80) NOT NULL,
  [ActorCode] NVARCHAR(60) NULL,
  [ActorName] NVARCHAR(200) NULL,
  [ResourceType] NVARCHAR(80) NULL,
  [ResourceId] NVARCHAR(120) NULL,
  [DetailJson] NVARCHAR(MAX) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FinanceAudit_CreatedAt] DEFAULT SYSUTCDATETIME()
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FinanceAudit_CreatedAt' AND object_id = OBJECT_ID(N'[finance].[AuditEvents]'))
  CREATE INDEX [IX_FinanceAudit_CreatedAt] ON [finance].[AuditEvents] ([CreatedAt] DESC);

IF OBJECT_ID(N'[finance].[Exceptions]', N'U') IS NULL
CREATE TABLE [finance].[Exceptions] (
  [ExceptionId] NVARCHAR(60) NOT NULL CONSTRAINT [PK_FinanceExceptions] PRIMARY KEY,
  [ExceptionType] NVARCHAR(80) NOT NULL,
  [Severity] NVARCHAR(40) NOT NULL CONSTRAINT [DF_FinanceExceptions_Severity] DEFAULT N'Medium',
  [Title] NVARCHAR(250) NOT NULL,
  [Detail] NVARCHAR(MAX) NULL,
  [Status] NVARCHAR(40) NOT NULL CONSTRAINT [DF_FinanceExceptions_Status] DEFAULT N'Open',
  [RelatedRequestId] NVARCHAR(60) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FinanceExceptions_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [ResolvedAt] DATETIME2(0) NULL
);

IF OBJECT_ID(N'[finance].[ApprovalMatrix]', N'U') IS NULL
CREATE TABLE [finance].[ApprovalMatrix] (
  [MatrixId] NVARCHAR(60) NOT NULL CONSTRAINT [PK_FinanceApprovalMatrix] PRIMARY KEY,
  [RuleName] NVARCHAR(80) NOT NULL,
  [PaymentType] NVARCHAR(80) NOT NULL,
  [PathType] NVARCHAR(40) NULL,
  [CompanyCode] NVARCHAR(40) NULL,
  [EntityName] NVARCHAR(200) NULL,
  [MinAmount] DECIMAL(19,4) NOT NULL CONSTRAINT [DF_FinanceMatrix_Min] DEFAULT 0,
  [MaxAmount] DECIMAL(19,4) NULL,
  [ApprovalLevel] INT NOT NULL CONSTRAINT [DF_FinanceMatrix_Level] DEFAULT 1,
  [ApproverRoles] NVARCHAR(250) NOT NULL,
  [StagesJson] NVARCHAR(MAX) NULL,
  [CurrencyCode] NVARCHAR(10) NOT NULL CONSTRAINT [DF_FinanceMatrix_Currency] DEFAULT N'NGN',
  [DualControl] BIT NOT NULL CONSTRAINT [DF_FinanceMatrix_Dual] DEFAULT 0,
  [Status] NVARCHAR(40) NOT NULL CONSTRAINT [DF_FinanceMatrix_Status] DEFAULT N'Active',
  [IsActive] BIT NOT NULL CONSTRAINT [DF_FinanceMatrix_Active] DEFAULT 1,
  [CreatedBy] NVARCHAR(120) NULL,
  [UpdatedBy] NVARCHAR(120) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FinanceMatrix_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FinanceMatrix_UpdatedAt] DEFAULT SYSUTCDATETIME()
);

IF COL_LENGTH(N'finance.ApprovalMatrix', N'RuleName') IS NULL
  ALTER TABLE [finance].[ApprovalMatrix] ADD [RuleName] NVARCHAR(80) NULL;
IF COL_LENGTH(N'finance.ApprovalMatrix', N'CompanyCode') IS NULL
  ALTER TABLE [finance].[ApprovalMatrix] ADD [CompanyCode] NVARCHAR(40) NULL;
IF COL_LENGTH(N'finance.ApprovalMatrix', N'EntityName') IS NULL
  ALTER TABLE [finance].[ApprovalMatrix] ADD [EntityName] NVARCHAR(200) NULL;
IF COL_LENGTH(N'finance.ApprovalMatrix', N'ApprovalLevel') IS NULL
  ALTER TABLE [finance].[ApprovalMatrix] ADD [ApprovalLevel] INT NOT NULL CONSTRAINT [DF_FinanceMatrix_Level2] DEFAULT 1;
IF COL_LENGTH(N'finance.ApprovalMatrix', N'ApproverRoles') IS NULL
  ALTER TABLE [finance].[ApprovalMatrix] ADD [ApproverRoles] NVARCHAR(250) NULL;
IF COL_LENGTH(N'finance.ApprovalMatrix', N'StagesJson') IS NULL
  ALTER TABLE [finance].[ApprovalMatrix] ADD [StagesJson] NVARCHAR(MAX) NULL;
IF COL_LENGTH(N'finance.ApprovalMatrix', N'CurrencyCode') IS NULL
  ALTER TABLE [finance].[ApprovalMatrix] ADD [CurrencyCode] NVARCHAR(10) NULL;
IF COL_LENGTH(N'finance.ApprovalMatrix', N'DualControl') IS NULL
  ALTER TABLE [finance].[ApprovalMatrix] ADD [DualControl] BIT NOT NULL CONSTRAINT [DF_FinanceMatrix_Dual2] DEFAULT 0;
IF COL_LENGTH(N'finance.ApprovalMatrix', N'Status') IS NULL
  ALTER TABLE [finance].[ApprovalMatrix] ADD [Status] NVARCHAR(40) NULL;
IF COL_LENGTH(N'finance.ApprovalMatrix', N'CreatedBy') IS NULL
  ALTER TABLE [finance].[ApprovalMatrix] ADD [CreatedBy] NVARCHAR(120) NULL;
IF COL_LENGTH(N'finance.ApprovalMatrix', N'UpdatedBy') IS NULL
  ALTER TABLE [finance].[ApprovalMatrix] ADD [UpdatedBy] NVARCHAR(120) NULL;
IF COL_LENGTH(N'finance.ApprovalMatrix', N'CreatedAt') IS NULL
  ALTER TABLE [finance].[ApprovalMatrix] ADD [CreatedAt] DATETIME2(0) NULL;
IF COL_LENGTH(N'finance.ApprovalMatrix', N'PathType') IS NULL
  ALTER TABLE [finance].[ApprovalMatrix] ADD [PathType] NVARCHAR(40) NULL;
IF COL_LENGTH(N'finance.ApprovalMatrix', N'IsActive') IS NULL
  ALTER TABLE [finance].[ApprovalMatrix] ADD [IsActive] BIT NOT NULL CONSTRAINT [DF_FinanceMatrix_Active2] DEFAULT 1;
IF COL_LENGTH(N'finance.ApprovalMatrix', N'MinAmount') IS NULL
  ALTER TABLE [finance].[ApprovalMatrix] ADD [MinAmount] DECIMAL(19,4) NOT NULL CONSTRAINT [DF_FinanceMatrix_Min2] DEFAULT 0;
IF COL_LENGTH(N'finance.ApprovalMatrix', N'MaxAmount') IS NULL
  ALTER TABLE [finance].[ApprovalMatrix] ADD [MaxAmount] DECIMAL(19,4) NULL;
IF COL_LENGTH(N'finance.ApprovalMatrix', N'PaymentType') IS NULL
  ALTER TABLE [finance].[ApprovalMatrix] ADD [PaymentType] NVARCHAR(80) NULL;
IF COL_LENGTH(N'finance.ApprovalMatrix', N'UpdatedAt') IS NULL
  ALTER TABLE [finance].[ApprovalMatrix] ADD [UpdatedAt] DATETIME2(0) NULL;

IF OBJECT_ID(N'[finance].[FxRates]', N'U') IS NULL
CREATE TABLE [finance].[FxRates] (
  [RateId] NVARCHAR(60) NOT NULL CONSTRAINT [PK_FinanceFxRates] PRIMARY KEY,
  [FromCurrency] NVARCHAR(10) NOT NULL,
  [ToCurrency] NVARCHAR(10) NOT NULL CONSTRAINT [DF_FinanceFxRates_To] DEFAULT N'NGN',
  [RateDate] DATE NOT NULL,
  [Rate] DECIMAL(19,8) NOT NULL,
  [Source] NVARCHAR(80) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FinanceFxRates_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FinanceFxRates_UpdatedAt] DEFAULT SYSUTCDATETIME()
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FinanceFxRates_Lookup' AND object_id = OBJECT_ID(N'[finance].[FxRates]'))
  CREATE UNIQUE INDEX [IX_FinanceFxRates_Lookup] ON [finance].[FxRates] ([FromCurrency], [ToCurrency], [RateDate]);

-- Keep NGN identity only. Live USD/EUR/GBP rates are synced from market providers
-- (see fx-rates-service). Do NOT overwrite market rates with hardcoded seed values.
MERGE [finance].[FxRates] AS target
USING (VALUES
  (N'FX-NGN-' + CONVERT(NVARCHAR(8), CAST(SYSUTCDATETIME() AS DATE), 112), N'NGN', N'NGN', CAST(SYSUTCDATETIME() AS DATE), CAST(1.00000000 AS DECIMAL(19,8)), N'Identity')
) AS source ([RateId], [FromCurrency], [ToCurrency], [RateDate], [Rate], [Source])
ON target.[FromCurrency] = source.[FromCurrency]
 AND target.[ToCurrency] = source.[ToCurrency]
 AND target.[RateDate] = source.[RateDate]
WHEN MATCHED AND (target.[Source] IS NULL OR target.[Source] LIKE N'%seed%' OR target.[Source] = N'Identity') THEN UPDATE SET
  [Rate] = source.[Rate],
  [Source] = source.[Source],
  [UpdatedAt] = SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT ([RateId], [FromCurrency], [ToCurrency], [RateDate], [Rate], [Source])
VALUES (source.[RateId], source.[FromCurrency], source.[ToCurrency], source.[RateDate], source.[Rate], source.[Source]);

-- Dynamic SQL so PathType ALTER above is visible (same-batch MERGE would fail compile on older tables).
IF OBJECT_ID(N'[finance].[ApprovalMatrix]', N'U') IS NOT NULL
 AND COL_LENGTH(N'finance.ApprovalMatrix', N'PathType') IS NOT NULL
BEGIN
  EXEC(N'
MERGE [finance].[ApprovalMatrix] AS target
USING (VALUES
  (N''LIM-NONPROJ-200K'', N''NONPROJ_LE_200K'', N''Employee Payment'', N''Non-project'', CAST(0 AS DECIMAL(19,4)), CAST(200000 AS DECIMAL(19,4)), 2,
   N''Reporting Manager → Finance Manager'',
   N''["Reporting Manager","Finance Manager"]''),
  (N''LIM-NONPROJ-1M'', N''NONPROJ_LE_1M'', N''Employee Payment'', N''Non-project'', CAST(200000.01 AS DECIMAL(19,4)), CAST(1000000 AS DECIMAL(19,4)), 3,
   N''Reporting Manager → Finance Manager → CFO'',
   N''["Reporting Manager","Finance Manager","CFO"]''),
  (N''LIM-NONPROJ-OPEN'', N''NONPROJ_GT_1M'', N''Employee Payment'', N''Non-project'', CAST(1000000.01 AS DECIMAL(19,4)), CAST(NULL AS DECIMAL(19,4)), 4,
   N''Reporting Manager → Finance Manager → CFO → MD/CEO'',
   N''["Reporting Manager","Finance Manager","CFO","MD/CEO"]''),
  (N''LIM-PROJ-200K'', N''PROJ_LE_200K'', N''Employee Payment'', N''Project'', CAST(0 AS DECIMAL(19,4)), CAST(200000 AS DECIMAL(19,4)), 3,
   N''Project Manager → Cost Controller → Finance Manager'',
   N''["Project Manager","Cost Controller","Finance Manager"]''),
  (N''LIM-PROJ-5M'', N''PROJ_LE_5M'', N''Employee Payment'', N''Project'', CAST(200000.01 AS DECIMAL(19,4)), CAST(5000000 AS DECIMAL(19,4)), 5,
   N''Project Manager → Cost Controller → Finance Manager → GM → CFO'',
   N''["Project Manager","Cost Controller","Finance Manager","GM","CFO"]''),
  (N''LIM-PROJ-OPEN'', N''PROJ_GT_5M'', N''Employee Payment'', N''Project'', CAST(5000000.01 AS DECIMAL(19,4)), CAST(NULL AS DECIMAL(19,4)), 6,
   N''Project Manager → Cost Controller → Finance Manager → GM → CFO → MD/CEO'',
   N''["Project Manager","Cost Controller","Finance Manager","GM","CFO","MD/CEO"]'')
) AS source (
  [MatrixId], [RuleName], [PaymentType], [PathType], [MinAmount], [MaxAmount], [ApprovalLevel], [ApproverRoles], [StagesJson]
)
ON target.[MatrixId] = source.[MatrixId]
WHEN NOT MATCHED THEN INSERT (
  [MatrixId], [RuleName], [PaymentType], [PathType], [CompanyCode], [EntityName], [MinAmount], [MaxAmount],
  [ApprovalLevel], [ApproverRoles], [StagesJson], [CurrencyCode], [DualControl], [Status], [IsActive], [CreatedBy], [UpdatedBy]
) VALUES (
  source.[MatrixId], source.[RuleName], source.[PaymentType], source.[PathType], N''DLE'', N''Dorman Long Nigeria Ltd'',
  source.[MinAmount], source.[MaxAmount], source.[ApprovalLevel], source.[ApproverRoles], source.[StagesJson],
  N''NGN'', 0, N''Active'', 1, N''System Seed'', N''System Seed''
);

-- MERGE is insert-only; restore MD/CEO on existing high-band rows seeded without it.
UPDATE [finance].[ApprovalMatrix]
SET [ApprovalLevel] = 4,
    [ApproverRoles] = N''Reporting Manager → Finance Manager → CFO → MD/CEO'',
    [StagesJson] = N''["Reporting Manager","Finance Manager","CFO","MD/CEO"]'',
    [UpdatedBy] = N''System Seed'',
    [UpdatedAt] = SYSUTCDATETIME()
WHERE [MatrixId] = N''LIM-NONPROJ-OPEN''
  AND CHARINDEX(N''MD/CEO'', ISNULL([StagesJson], N'''')) = 0;

UPDATE [finance].[ApprovalMatrix]
SET [ApprovalLevel] = 6,
    [ApproverRoles] = N''Project Manager → Cost Controller → Finance Manager → GM → CFO → MD/CEO'',
    [StagesJson] = N''["Project Manager","Cost Controller","Finance Manager","GM","CFO","MD/CEO"]'',
    [UpdatedBy] = N''System Seed'',
    [UpdatedAt] = SYSUTCDATETIME()
WHERE [MatrixId] = N''LIM-PROJ-OPEN''
  AND CHARINDEX(N''MD/CEO'', ISNULL([StagesJson], N'''')) = 0;
');
END

IF OBJECT_ID(N'[finance].[ApprovalMatrixAudit]', N'U') IS NULL
CREATE TABLE [finance].[ApprovalMatrixAudit] (
  [AuditId] NVARCHAR(60) NOT NULL CONSTRAINT [PK_FinanceApprovalMatrixAudit] PRIMARY KEY,
  [MatrixId] NVARCHAR(60) NULL,
  [ActionType] NVARCHAR(40) NOT NULL,
  [ActorName] NVARCHAR(200) NULL,
  [DetailJson] NVARCHAR(MAX) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FinanceMatrixAudit_CreatedAt] DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID(N'[finance].[SageSyncQueue]', N'U') IS NULL
CREATE TABLE [finance].[SageSyncQueue] (
  [QueueId] NVARCHAR(60) NOT NULL CONSTRAINT [PK_FinanceSageSyncQueue] PRIMARY KEY,
  [Direction] NVARCHAR(20) NOT NULL,
  [Operation] NVARCHAR(80) NOT NULL,
  [PayloadJson] NVARCHAR(MAX) NULL,
  [Status] NVARCHAR(40) NOT NULL CONSTRAINT [DF_FinanceSageQueue_Status] DEFAULT N'Pending',
  [Attempts] INT NOT NULL CONSTRAINT [DF_FinanceSageQueue_Attempts] DEFAULT 0,
  [LastError] NVARCHAR(MAX) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FinanceSageQueue_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [ProcessedAt] DATETIME2(0) NULL
);

IF OBJECT_ID(N'[finance].[PaymentSites]', N'U') IS NULL
CREATE TABLE [finance].[PaymentSites] (
  [SiteCode] NVARCHAR(40) NOT NULL CONSTRAINT [PK_FinancePaymentSites] PRIMARY KEY,
  [SiteName] NVARCHAR(200) NOT NULL,
  [IsActive] BIT NOT NULL CONSTRAINT [DF_FinancePaymentSites_Active] DEFAULT 1,
  [SortOrder] INT NOT NULL CONSTRAINT [DF_FinancePaymentSites_Sort] DEFAULT 0,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FinancePaymentSites_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FinancePaymentSites_UpdatedAt] DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID(N'[finance].[ExpenseCodes]', N'U') IS NULL
CREATE TABLE [finance].[ExpenseCodes] (
  [ExpenseCode] NVARCHAR(40) NOT NULL CONSTRAINT [PK_FinanceExpenseCodes] PRIMARY KEY,
  [Description] NVARCHAR(250) NOT NULL,
  [IsActive] BIT NOT NULL CONSTRAINT [DF_FinanceExpenseCodes_Active] DEFAULT 1,
  [SortOrder] INT NOT NULL CONSTRAINT [DF_FinanceExpenseCodes_Sort] DEFAULT 0,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FinanceExpenseCodes_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FinanceExpenseCodes_UpdatedAt] DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID(N'[finance].[CashAdvanceWaivers]', N'U') IS NULL
CREATE TABLE [finance].[CashAdvanceWaivers] (
  [WaiverId] NVARCHAR(60) NOT NULL CONSTRAINT [PK_FinanceCashAdvanceWaivers] PRIMARY KEY,
  [EmployeeCode] NVARCHAR(60) NOT NULL,
  [GrantedBy] NVARCHAR(200) NOT NULL,
  [Reason] NVARCHAR(MAX) NOT NULL,
  [Status] NVARCHAR(40) NOT NULL CONSTRAINT [DF_FinanceCashAdvanceWaivers_Status] DEFAULT N'Active',
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FinanceCashAdvanceWaivers_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [ConsumedAt] DATETIME2(0) NULL,
  [ConsumedByRequestId] NVARCHAR(60) NULL
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FinanceCashAdvanceWaivers_Employee' AND object_id = OBJECT_ID(N'[finance].[CashAdvanceWaivers]'))
  CREATE INDEX [IX_FinanceCashAdvanceWaivers_Employee] ON [finance].[CashAdvanceWaivers] ([EmployeeCode], [Status], [CreatedAt] DESC);

MERGE [finance].[PaymentSites] AS target
USING (VALUES
  (N'DLE', N'Dorman Long Engineering Limited', 1),
  (N'DLPC', N'Dorman Long Protective Coatings', 2)
) AS source ([SiteCode], [SiteName], [SortOrder])
ON target.[SiteCode] = source.[SiteCode]
WHEN MATCHED THEN UPDATE SET
  [SiteName] = source.[SiteName],
  [SortOrder] = source.[SortOrder],
  [IsActive] = 1,
  [UpdatedAt] = SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT ([SiteCode], [SiteName], [SortOrder], [IsActive])
VALUES (source.[SiteCode], source.[SiteName], source.[SortOrder], 1);

-- Retire legacy long site codes (DLENG / DLPCG → DLE / DLPC).
UPDATE [finance].[PaymentSites]
SET [IsActive] = 0, [UpdatedAt] = SYSUTCDATETIME()
WHERE [SiteCode] IN (N'DLENG', N'DLPCG');

IF OBJECT_ID(N'[finance].[PaymentRequests]', N'U') IS NOT NULL
BEGIN
  UPDATE [finance].[PaymentRequests]
  SET [PaymentSiteCode] = N'DLE',
      [CompanyCode] = CASE WHEN [CompanyCode] IN (N'DLENG', N'DLE') THEN N'DLE' ELSE [CompanyCode] END,
      [UpdatedAt] = SYSUTCDATETIME()
  WHERE [PaymentSiteCode] = N'DLENG' OR [CompanyCode] = N'DLENG';

  UPDATE [finance].[PaymentRequests]
  SET [PaymentSiteCode] = N'DLPC',
      [CompanyCode] = CASE WHEN [CompanyCode] IN (N'DLPCG', N'DLPC') THEN N'DLPC' ELSE [CompanyCode] END,
      [UpdatedAt] = SYSUTCDATETIME()
  WHERE [PaymentSiteCode] = N'DLPCG' OR [CompanyCode] = N'DLPCG';
END;

MERGE [finance].[ExpenseCodes] AS target
USING (VALUES
  (N'COE', N'Corporate Office Expenses', 1),
  (N'DEM', N'Demurrage payment', 2),
  (N'DPR', N'Department of Petroleum Resources', 3),
  (N'DUTY', N'Duty Payment', 4),
  (N'ENT', N'Entertainment Expense', 5),
  (N'EXP', N'Expatriate Expenses', 6),
  (N'FLD', N'Petrol and Diesel', 7),
  (N'FLT', N'Float', 8),
  (N'GAS', N'Maintenance', 9),
  (N'HTA', N'Hotel Accommodation', 10),
  (N'INT', N'Internet Expense', 11),
  (N'LOG', N'Logistics cost of project', 12),
  (N'LTP', N'Local Transportation', 13),
  (N'MDE', N'Medical Expenses', 14),
  (N'MIS', N'Miscellaneous', 15),
  (N'MKT', N'Marketing Expense', 16),
  (N'MOE', N'Maintenance of equipment', 17),
  (N'MTN', N'Maintenance', 18),
  (N'NWS', N'Newspapers and Subscriptions', 19),
  (N'OFFS', N'Office Stationaries', 20),
  (N'OFS', N'Office Supply', 21),
  (N'ORE', N'Office Running Expenses', 22),
  (N'PRE', N'Project Expense', 23),
  (N'PRT', N'Printing and Stationery', 24),
  (N'PTC', N'Postage and Courier', 25),
  (N'SND', N'Sundry Admin Expenses', 26),
  (N'SPG', N'Safety and Protective Gear', 27),
  (N'TLE', N'Telephone Expenses', 28)
) AS source ([ExpenseCode], [Description], [SortOrder])
ON target.[ExpenseCode] = source.[ExpenseCode]
WHEN MATCHED THEN UPDATE SET
  [Description] = source.[Description],
  [SortOrder] = source.[SortOrder],
  [IsActive] = 1,
  [UpdatedAt] = SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT ([ExpenseCode], [Description], [SortOrder], [IsActive])
VALUES (source.[ExpenseCode], source.[Description], source.[SortOrder], 1);

IF OBJECT_ID(N'[finance].[PaymentRequests]', N'U') IS NULL
CREATE TABLE [finance].[PaymentRequests] (
  [RequestId] NVARCHAR(60) NOT NULL CONSTRAINT [PK_FinancePaymentRequests] PRIMARY KEY,
  [RequestNumber] NVARCHAR(60) NOT NULL,
  [PaymentType] NVARCHAR(80) NOT NULL,
  [RequestCategory] NVARCHAR(80) NULL,
  [Title] NVARCHAR(250) NOT NULL,
  [Purpose] NVARCHAR(MAX) NULL,
  [BusinessJustification] NVARCHAR(MAX) NULL,
  [BeneficiaryType] NVARCHAR(40) NOT NULL CONSTRAINT [DF_FinancePayReq_BeneficiaryType] DEFAULT N'Employee',
  [BeneficiaryCode] NVARCHAR(80) NULL,
  [BeneficiaryName] NVARCHAR(250) NOT NULL,
  [BeneficiaryBankSummary] NVARCHAR(500) NULL,
  [Description] NVARCHAR(MAX) NULL,
  [GrossAmount] DECIMAL(19,4) NOT NULL CONSTRAINT [DF_FinancePayReq_Gross] DEFAULT 0,
  [VatAmount] DECIMAL(19,4) NOT NULL CONSTRAINT [DF_FinancePayReq_Vat] DEFAULT 0,
  [WhtAmount] DECIMAL(19,4) NOT NULL CONSTRAINT [DF_FinancePayReq_Wht] DEFAULT 0,
  [RetentionAmount] DECIMAL(19,4) NOT NULL CONSTRAINT [DF_FinancePayReq_Retention] DEFAULT 0,
  [NetAmount] DECIMAL(19,4) NOT NULL CONSTRAINT [DF_FinancePayReq_Net] DEFAULT 0,
  [CurrencyCode] NVARCHAR(10) NOT NULL CONSTRAINT [DF_FinancePayReq_Currency] DEFAULT N'NGN',
  [CompanyCode] NVARCHAR(40) NULL,
  [PaymentSiteCode] NVARCHAR(40) NULL,
  [PaymentSiteName] NVARCHAR(200) NULL,
  [ExpenseCode] NVARCHAR(40) NULL,
  [Department] NVARCHAR(150) NULL,
  [Location] NVARCHAR(150) NULL,
  [CostCentre] NVARCHAR(80) NULL,
  [ProjectCode] NVARCHAR(80) NULL,
  [Priority] NVARCHAR(40) NOT NULL CONSTRAINT [DF_FinancePayReq_Priority] DEFAULT N'Normal',
  [RequiredDate] DATE NULL,
  [RequesterCode] NVARCHAR(60) NULL,
  [RequesterName] NVARCHAR(200) NULL,
  [RequesterJobTitle] NVARCHAR(150) NULL,
  [SupervisorName] NVARCHAR(200) NULL,
  [SubmittedAt] DATETIME2(0) NULL,
  [CurrentStage] NVARCHAR(80) NOT NULL CONSTRAINT [DF_FinancePayReq_Stage] DEFAULT N'Draft',
  [CurrentApproverCode] NVARCHAR(60) NULL,
  [CurrentApproverName] NVARCHAR(200) NULL,
  [Status] NVARCHAR(40) NOT NULL CONSTRAINT [DF_FinancePayReq_Status] DEFAULT N'Draft',
  [RiskLevel] NVARCHAR(40) NOT NULL CONSTRAINT [DF_FinancePayReq_Risk] DEFAULT N'Normal',
  [RiskFlags] NVARCHAR(MAX) NULL,
  [OverrideOutstandingAdvance] BIT NOT NULL CONSTRAINT [DF_FinancePayReq_Override] DEFAULT 0,
  [OverrideReason] NVARCHAR(MAX) NULL,
  [SageReference] NVARCHAR(120) NULL,
  [SourceDocumentNo] NVARCHAR(120) NULL,
  [InvoiceNumber] NVARCHAR(120) NULL,
  [InvoiceDate] DATE NULL,
  [DueDate] DATE NULL,
  [PurchaseOrderNo] NVARCHAR(120) NULL,
  [DeliveryNoteNo] NVARCHAR(120) NULL,
  [GrnNo] NVARCHAR(120) NULL,
  [ContractNo] NVARCHAR(120) NULL,
  [PayloadJson] NVARCHAR(MAX) NULL,
  [AttachmentsJson] NVARCHAR(MAX) NULL,
  [RetirementJson] NVARCHAR(MAX) NULL,
  [TreasuryJson] NVARCHAR(MAX) NULL,
  [PaidAt] DATETIME2(0) NULL,
  [PaymentReference] NVARCHAR(120) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FinancePayReq_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FinancePayReq_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  CONSTRAINT [UQ_FinancePaymentRequests_Number] UNIQUE ([RequestNumber])
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FinancePaymentRequests_Status' AND object_id = OBJECT_ID(N'[finance].[PaymentRequests]'))
  CREATE INDEX [IX_FinancePaymentRequests_Status] ON [finance].[PaymentRequests] ([Status], [SubmittedAt] DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FinancePaymentRequests_Type' AND object_id = OBJECT_ID(N'[finance].[PaymentRequests]'))
  CREATE INDEX [IX_FinancePaymentRequests_Type] ON [finance].[PaymentRequests] ([PaymentType], [Status]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FinancePaymentRequests_Requester' AND object_id = OBJECT_ID(N'[finance].[PaymentRequests]'))
  CREATE INDEX [IX_FinancePaymentRequests_Requester] ON [finance].[PaymentRequests] ([RequesterCode], [Status]);

IF COL_LENGTH(N'finance.PaymentRequests', N'Purpose') IS NULL
  ALTER TABLE [finance].[PaymentRequests] ADD [Purpose] NVARCHAR(MAX) NULL;
IF COL_LENGTH(N'finance.PaymentRequests', N'BusinessJustification') IS NULL
  ALTER TABLE [finance].[PaymentRequests] ADD [BusinessJustification] NVARCHAR(MAX) NULL;
IF COL_LENGTH(N'finance.PaymentRequests', N'ExpenseCode') IS NULL
  ALTER TABLE [finance].[PaymentRequests] ADD [ExpenseCode] NVARCHAR(40) NULL;
IF COL_LENGTH(N'finance.PaymentRequests', N'Department') IS NULL
  ALTER TABLE [finance].[PaymentRequests] ADD [Department] NVARCHAR(150) NULL;
IF COL_LENGTH(N'finance.PaymentRequests', N'Location') IS NULL
  ALTER TABLE [finance].[PaymentRequests] ADD [Location] NVARCHAR(150) NULL;
IF COL_LENGTH(N'finance.PaymentRequests', N'PaymentSiteCode') IS NULL
  ALTER TABLE [finance].[PaymentRequests] ADD [PaymentSiteCode] NVARCHAR(40) NULL;
IF COL_LENGTH(N'finance.PaymentRequests', N'PaymentSiteName') IS NULL
  ALTER TABLE [finance].[PaymentRequests] ADD [PaymentSiteName] NVARCHAR(200) NULL;
IF COL_LENGTH(N'finance.PaymentRequests', N'PostingStatus') IS NULL
  ALTER TABLE [finance].[PaymentRequests] ADD [PostingStatus] NVARCHAR(40) NULL;
IF COL_LENGTH(N'finance.PaymentRequests', N'PostedAt') IS NULL
  ALTER TABLE [finance].[PaymentRequests] ADD [PostedAt] DATETIME2(0) NULL;
IF COL_LENGTH(N'finance.PaymentRequests', N'PostedBy') IS NULL
  ALTER TABLE [finance].[PaymentRequests] ADD [PostedBy] NVARCHAR(120) NULL;
IF COL_LENGTH(N'finance.PaymentRequests', N'PostingJson') IS NULL
  ALTER TABLE [finance].[PaymentRequests] ADD [PostingJson] NVARCHAR(MAX) NULL;
IF COL_LENGTH(N'finance.PaymentRequests', N'StageEnteredAt') IS NULL
  ALTER TABLE [finance].[PaymentRequests] ADD [StageEnteredAt] DATETIME2(0) NULL;
IF COL_LENGTH(N'finance.PaymentRequests', N'LastReminderAt') IS NULL
  ALTER TABLE [finance].[PaymentRequests] ADD [LastReminderAt] DATETIME2(0) NULL;

IF OBJECT_ID(N'[finance].[PaymentRequestActions]', N'U') IS NULL
CREATE TABLE [finance].[PaymentRequestActions] (
  [ActionId] NVARCHAR(60) NOT NULL CONSTRAINT [PK_FinancePaymentRequestActions] PRIMARY KEY,
  [RequestId] NVARCHAR(60) NOT NULL,
  [ActionType] NVARCHAR(40) NOT NULL,
  [Stage] NVARCHAR(80) NULL,
  [ActorCode] NVARCHAR(60) NULL,
  [ActorName] NVARCHAR(200) NULL,
  [Comment] NVARCHAR(MAX) NULL,
  [Reason] NVARCHAR(MAX) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FinancePayReqActions_CreatedAt] DEFAULT SYSUTCDATETIME()
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FinancePayReqActions_Request' AND object_id = OBJECT_ID(N'[finance].[PaymentRequestActions]'))
  CREATE INDEX [IX_FinancePayReqActions_Request] ON [finance].[PaymentRequestActions] ([RequestId], [CreatedAt] DESC);

IF OBJECT_ID(N'[finance].[PaymentRequestComments]', N'U') IS NULL
CREATE TABLE [finance].[PaymentRequestComments] (
  [CommentId] NVARCHAR(60) NOT NULL CONSTRAINT [PK_FinancePaymentRequestComments] PRIMARY KEY,
  [RequestId] NVARCHAR(60) NOT NULL,
  [ActorCode] NVARCHAR(60) NULL,
  [ActorName] NVARCHAR(200) NULL,
  [Body] NVARCHAR(MAX) NOT NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FinancePayReqComments_CreatedAt] DEFAULT SYSUTCDATETIME()
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FinancePayReqComments_Request' AND object_id = OBJECT_ID(N'[finance].[PaymentRequestComments]'))
  CREATE INDEX [IX_FinancePayReqComments_Request] ON [finance].[PaymentRequestComments] ([RequestId], [CreatedAt] ASC);
`;
