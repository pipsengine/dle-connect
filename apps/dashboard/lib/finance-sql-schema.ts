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
  (N'DLENG', N'Dorman Long Engineering Limited', 1),
  (N'DLPCG', N'Dorman Long Protective Coatings', 2)
) AS source ([SiteCode], [SiteName], [SortOrder])
ON target.[SiteCode] = source.[SiteCode]
WHEN MATCHED THEN UPDATE SET
  [SiteName] = source.[SiteName],
  [SortOrder] = source.[SortOrder],
  [IsActive] = 1,
  [UpdatedAt] = SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT ([SiteCode], [SiteName], [SortOrder], [IsActive])
VALUES (source.[SiteCode], source.[SiteName], source.[SortOrder], 1);

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

IF COL_LENGTH(N'finance.PaymentRequests', N'ExpenseCode') IS NULL
  ALTER TABLE [finance].[PaymentRequests] ADD [ExpenseCode] NVARCHAR(40) NULL;
IF COL_LENGTH(N'finance.PaymentRequests', N'Location') IS NULL
  ALTER TABLE [finance].[PaymentRequests] ADD [Location] NVARCHAR(150) NULL;
IF COL_LENGTH(N'finance.PaymentRequests', N'PaymentSiteCode') IS NULL
  ALTER TABLE [finance].[PaymentRequests] ADD [PaymentSiteCode] NVARCHAR(40) NULL;
IF COL_LENGTH(N'finance.PaymentRequests', N'PaymentSiteName') IS NULL
  ALTER TABLE [finance].[PaymentRequests] ADD [PaymentSiteName] NVARCHAR(200) NULL;

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
`;
