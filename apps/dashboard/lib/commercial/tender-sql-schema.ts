export const ensureTenderSchemaSql = `
IF SCHEMA_ID(N'commercial') IS NULL EXEC(N'CREATE SCHEMA [commercial]');

IF OBJECT_ID(N'[commercial].[TenderOpportunities]', N'U') IS NULL
CREATE TABLE [commercial].[TenderOpportunities] (
  [OpportunityId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_TenderOpportunities] PRIMARY KEY,
  [ReferenceNo] NVARCHAR(80) NOT NULL,
  [EnquiryRef] NVARCHAR(80) NULL,
  [Title] NVARCHAR(300) NOT NULL,
  [Description] NVARCHAR(MAX) NULL,
  [OpportunityType] NVARCHAR(40) NOT NULL,
  [SourceName] NVARCHAR(80) NOT NULL,
  [TenderType] NVARCHAR(40) NOT NULL,
  [Category] NVARCHAR(80) NULL,
  [SubCategory] NVARCHAR(80) NULL,
  [BusinessUnit] NVARCHAR(160) NULL,
  [Status] NVARCHAR(40) NOT NULL,
  [Stage] NVARCHAR(40) NOT NULL,
  [Priority] NVARCHAR(20) NOT NULL,
  [BidDecision] NVARCHAR(20) NULL,
  [ClientName] NVARCHAR(220) NOT NULL,
  [ClientAddress] NVARCHAR(500) NULL,
  [ContactPerson] NVARCHAR(180) NULL,
  [Designation] NVARCHAR(120) NULL,
  [Email] NVARCHAR(200) NULL,
  [Phone] NVARCHAR(80) NULL,
  [Department] NVARCHAR(180) NULL,
  [LocationName] NVARCHAR(180) NULL,
  [SiteName] NVARCHAR(180) NULL,
  [EstimatedValue] DECIMAL(19,2) NOT NULL CONSTRAINT [DF_TenderOpp_Value] DEFAULT 0,
  [Currency] NVARCHAR(10) NOT NULL CONSTRAINT [DF_TenderOpp_Currency] DEFAULT N'NGN',
  [ContractType] NVARCHAR(80) NULL,
  [ProjectLocation] NVARCHAR(220) NULL,
  [ContractDuration] INT NULL,
  [DurationUnit] NVARCHAR(20) NULL,
  [AllowJv] BIT NOT NULL CONSTRAINT [DF_TenderOpp_AllowJv] DEFAULT 0,
  [Retentions] BIT NOT NULL CONSTRAINT [DF_TenderOpp_Retentions] DEFAULT 0,
  [ScopeSummary] NVARCHAR(MAX) NULL,
  [SubmissionDeadline] DATE NULL,
  [ClosingDate] DATE NULL,
  [InvitationDate] DATE NULL,
  [SiteVisitDate] DATE NULL,
  [ClarificationDeadline] DATE NULL,
  [OwnerName] NVARCHAR(180) NULL,
  [TeamNotes] NVARCHAR(MAX) NULL,
  [ApprovalNotes] NVARCHAR(MAX) NULL,
  [Watchlisted] BIT NOT NULL CONSTRAINT [DF_TenderOpp_Watch] DEFAULT 0,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TenderOpp_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TenderOpp_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NULL,
  [UpdatedBy] NVARCHAR(120) NULL
);

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE name = N'UX_TenderOpp_Reference' AND object_id = OBJECT_ID(N'[commercial].[TenderOpportunities]')
)
  CREATE UNIQUE INDEX [UX_TenderOpp_Reference] ON [commercial].[TenderOpportunities]([ReferenceNo]);

IF OBJECT_ID(N'[commercial].[TenderDocuments]', N'U') IS NULL
CREATE TABLE [commercial].[TenderDocuments] (
  [DocumentId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_TenderDocuments] PRIMARY KEY,
  [OpportunityId] NVARCHAR(40) NOT NULL,
  [FileName] NVARCHAR(260) NOT NULL,
  [Category] NVARCHAR(80) NULL,
  [ContentType] NVARCHAR(120) NULL,
  [SizeBytes] BIGINT NOT NULL CONSTRAINT [DF_TenderDocs_Size] DEFAULT 0,
  [StorageKey] NVARCHAR(500) NOT NULL,
  [UploadedBy] NVARCHAR(120) NULL,
  [UploadedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TenderDocs_UploadedAt] DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID(N'[commercial].[TenderLines]', N'U') IS NULL
CREATE TABLE [commercial].[TenderLines] (
  [LineId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_TenderLines] PRIMARY KEY,
  [OpportunityId] NVARCHAR(40) NOT NULL,
  [SectionName] NVARCHAR(120) NULL,
  [Description] NVARCHAR(300) NOT NULL,
  [Quantity] DECIMAL(19,4) NOT NULL,
  [Unit] NVARCHAR(25) NULL,
  [UnitCost] DECIMAL(19,2) NOT NULL,
  [MarkupPct] DECIMAL(9,2) NOT NULL CONSTRAINT [DF_TenderLines_Markup] DEFAULT 0,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TenderLines_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NULL
);

IF OBJECT_ID(N'[commercial].[TenderApprovals]', N'U') IS NULL
CREATE TABLE [commercial].[TenderApprovals] (
  [ApprovalId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_TenderApprovals] PRIMARY KEY,
  [OpportunityId] NVARCHAR(40) NOT NULL,
  [StageName] NVARCHAR(40) NOT NULL,
  [Decision] NVARCHAR(20) NOT NULL,
  [ActorName] NVARCHAR(120) NOT NULL,
  [Comments] NVARCHAR(MAX) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TenderApprovals_CreatedAt] DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID(N'[commercial].[TenderSubmissions]', N'U') IS NULL
CREATE TABLE [commercial].[TenderSubmissions] (
  [SubmissionId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_TenderSubmissions] PRIMARY KEY,
  [OpportunityId] NVARCHAR(40) NOT NULL,
  [Channel] NVARCHAR(80) NOT NULL,
  [ReceiptReference] NVARCHAR(150) NOT NULL,
  [SubmittedBy] NVARCHAR(120) NOT NULL,
  [SubmittedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TenderSubmissions_SubmittedAt] DEFAULT SYSUTCDATETIME(),
  [Notes] NVARCHAR(MAX) NULL
);

IF OBJECT_ID(N'[commercial].[TenderAwards]', N'U') IS NULL
CREATE TABLE [commercial].[TenderAwards] (
  [AwardId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_TenderAwards] PRIMARY KEY,
  [OpportunityId] NVARCHAR(40) NOT NULL,
  [ContractRef] NVARCHAR(100) NOT NULL,
  [AwardedValue] DECIMAL(19,2) NOT NULL,
  [AwardDate] DATE NULL,
  [HandoverOwner] NVARCHAR(120) NULL,
  [HandoverNotes] NVARCHAR(MAX) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TenderAwards_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NULL
);

IF OBJECT_ID(N'[commercial].[TenderItems]', N'U') IS NULL
CREATE TABLE [commercial].[TenderItems] (
  [ItemId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_TenderItems] PRIMARY KEY,
  [OpportunityId] NVARCHAR(40) NOT NULL,
  [Kind] NVARCHAR(40) NOT NULL,
  [Title] NVARCHAR(300) NOT NULL,
  [Details] NVARCHAR(MAX) NULL,
  [Status] NVARCHAR(30) NOT NULL CONSTRAINT [DF_TenderItems_Status] DEFAULT N'OPEN',
  [Assignee] NVARCHAR(120) NULL,
  [DueAt] DATE NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TenderItems_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NULL
);

IF OBJECT_ID(N'[commercial].[TenderAudit]', N'U') IS NULL
CREATE TABLE [commercial].[TenderAudit] (
  [AuditId] BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT [PK_TenderAudit] PRIMARY KEY,
  [OpportunityId] NVARCHAR(40) NULL,
  [ActorName] NVARCHAR(120) NOT NULL,
  [ActionName] NVARCHAR(90) NOT NULL,
  [Details] NVARCHAR(MAX) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TenderAudit_CreatedAt] DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID(N'[commercial].[TenderSettings]', N'U') IS NULL
CREATE TABLE [commercial].[TenderSettings] (
  [SettingKey] NVARCHAR(90) NOT NULL CONSTRAINT [PK_TenderSettings] PRIMARY KEY,
  [SettingValue] NVARCHAR(MAX) NOT NULL,
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TenderSettings_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedBy] NVARCHAR(120) NULL
);

IF COL_LENGTH(N'commercial.TenderAwards', N'Currency') IS NULL
  ALTER TABLE [commercial].[TenderAwards] ADD [Currency] NVARCHAR(10) NOT NULL CONSTRAINT [DF_TenderAwards_Currency] DEFAULT N'NGN';

IF COL_LENGTH(N'commercial.TenderDocuments', N'ContentHash') IS NULL
  ALTER TABLE [commercial].[TenderDocuments] ADD [ContentHash] NVARCHAR(64) NULL;
IF COL_LENGTH(N'commercial.TenderDocuments', N'VersionNo') IS NULL
  ALTER TABLE [commercial].[TenderDocuments] ADD [VersionNo] INT NOT NULL CONSTRAINT [DF_TenderDocs_Version] DEFAULT 1;

IF OBJECT_ID(N'[commercial].[TenderLots]', N'U') IS NULL
CREATE TABLE [commercial].[TenderLots] (
  [LotId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_TenderLots] PRIMARY KEY,
  [OpportunityId] NVARCHAR(40) NOT NULL,
  [CompanyCode] NVARCHAR(20) NOT NULL CONSTRAINT [DF_TenderLots_Company] DEFAULT N'DLE',
  [LotCode] NVARCHAR(40) NOT NULL,
  [Title] NVARCHAR(300) NOT NULL,
  [EstimatedValue] DECIMAL(19,2) NOT NULL CONSTRAINT [DF_TenderLots_Value] DEFAULT 0,
  [Currency] NVARCHAR(10) NOT NULL CONSTRAINT [DF_TenderLots_Currency] DEFAULT N'NGN',
  [Status] NVARCHAR(30) NOT NULL CONSTRAINT [DF_TenderLots_Status] DEFAULT N'OPEN',
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TenderLots_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NULL
);

IF OBJECT_ID(N'[commercial].[TenderParties]', N'U') IS NULL
CREATE TABLE [commercial].[TenderParties] (
  [PartyId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_TenderParties] PRIMARY KEY,
  [OpportunityId] NVARCHAR(40) NOT NULL,
  [CompanyCode] NVARCHAR(20) NOT NULL CONSTRAINT [DF_TenderParties_Company] DEFAULT N'DLE',
  [RoleName] NVARCHAR(40) NOT NULL,
  [PartyName] NVARCHAR(220) NOT NULL,
  [WorksharePct] DECIMAL(9,2) NOT NULL CONSTRAINT [DF_TenderParties_Share] DEFAULT 0,
  [Liability] NVARCHAR(300) NULL,
  [AccessScope] NVARCHAR(300) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TenderParties_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NULL
);

IF OBJECT_ID(N'[commercial].[TenderQualifications]', N'U') IS NULL
CREATE TABLE [commercial].[TenderQualifications] (
  [QualificationId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_TenderQualifications] PRIMARY KEY,
  [OpportunityId] NVARCHAR(40) NOT NULL,
  [CompanyCode] NVARCHAR(20) NOT NULL CONSTRAINT [DF_TenderQual_Company] DEFAULT N'DLE',
  [CertificateName] NVARCHAR(220) NOT NULL,
  [ReferenceNo] NVARCHAR(120) NULL,
  [ExpiresOn] DATE NULL,
  [Eligibility] NVARCHAR(20) NOT NULL CONSTRAINT [DF_TenderQual_Eligibility] DEFAULT N'PENDING',
  [Evidence] NVARCHAR(MAX) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TenderQual_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NULL
);

IF OBJECT_ID(N'[commercial].[TenderBidScores]', N'U') IS NULL
CREATE TABLE [commercial].[TenderBidScores] (
  [ScoreId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_TenderBidScores] PRIMARY KEY,
  [OpportunityId] NVARCHAR(40) NOT NULL,
  [CompanyCode] NVARCHAR(20) NOT NULL CONSTRAINT [DF_TenderScores_Company] DEFAULT N'DLE',
  [Criterion] NVARCHAR(180) NOT NULL,
  [WeightPct] DECIMAL(9,2) NOT NULL,
  [Score] DECIMAL(9,2) NOT NULL,
  [OverrideReason] NVARCHAR(MAX) NULL,
  [AuthorityName] NVARCHAR(120) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TenderScores_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NULL
);

IF OBJECT_ID(N'[commercial].[TenderRoles]', N'U') IS NULL
CREATE TABLE [commercial].[TenderRoles] (
  [RoleId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_TenderRoles] PRIMARY KEY,
  [OpportunityId] NVARCHAR(40) NOT NULL,
  [CompanyCode] NVARCHAR(20) NOT NULL CONSTRAINT [DF_TenderRoles_Company] DEFAULT N'DLE',
  [RoleName] NVARCHAR(80) NOT NULL,
  [PersonName] NVARCHAR(180) NOT NULL,
  [EmployeeCode] NVARCHAR(80) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TenderRoles_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NULL
);

IF OBJECT_ID(N'[commercial].[TenderRates]', N'U') IS NULL
CREATE TABLE [commercial].[TenderRates] (
  [RateId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_TenderRates] PRIMARY KEY,
  [CompanyCode] NVARCHAR(20) NOT NULL CONSTRAINT [DF_TenderRates_Company] DEFAULT N'DLE',
  [RateCode] NVARCHAR(40) NOT NULL,
  [Description] NVARCHAR(300) NOT NULL,
  [Unit] NVARCHAR(25) NOT NULL,
  [Rate] DECIMAL(19,4) NOT NULL,
  [Currency] NVARCHAR(10) NOT NULL CONSTRAINT [DF_TenderRates_Currency] DEFAULT N'NGN',
  [LocationFactor] DECIMAL(9,4) NOT NULL CONSTRAINT [DF_TenderRates_Factor] DEFAULT 1,
  [EffectiveFrom] DATE NULL,
  [ApprovedBy] NVARCHAR(120) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TenderRates_CreatedAt] DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID(N'[commercial].[TenderEstimates]', N'U') IS NULL
CREATE TABLE [commercial].[TenderEstimates] (
  [EstimateId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_TenderEstimates] PRIMARY KEY,
  [OpportunityId] NVARCHAR(40) NOT NULL,
  [CompanyCode] NVARCHAR(20) NOT NULL CONSTRAINT [DF_TenderEst_Company] DEFAULT N'DLE',
  [VersionNo] INT NOT NULL,
  [Label] NVARCHAR(180) NOT NULL,
  [Locked] BIT NOT NULL CONSTRAINT [DF_TenderEst_Locked] DEFAULT 1,
  [Currency] NVARCHAR(10) NOT NULL,
  [FxRate] DECIMAL(19,6) NOT NULL CONSTRAINT [DF_TenderEst_Fx] DEFAULT 1,
  [TotalCost] DECIMAL(19,2) NOT NULL,
  [TotalSell] DECIMAL(19,2) NOT NULL,
  [Explanation] NVARCHAR(MAX) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TenderEst_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NULL
);

IF OBJECT_ID(N'[commercial].[TenderEstimateLines]', N'U') IS NULL
CREATE TABLE [commercial].[TenderEstimateLines] (
  [EstimateLineId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_TenderEstimateLines] PRIMARY KEY,
  [EstimateId] NVARCHAR(40) NOT NULL,
  [OpportunityId] NVARCHAR(40) NOT NULL,
  [SectionName] NVARCHAR(120) NULL,
  [Description] NVARCHAR(300) NOT NULL,
  [Quantity] DECIMAL(19,4) NOT NULL,
  [Unit] NVARCHAR(25) NULL,
  [UnitCost] DECIMAL(19,2) NOT NULL,
  [MarkupPct] DECIMAL(9,2) NOT NULL,
  [Sell] DECIMAL(19,2) NOT NULL
);

IF OBJECT_ID(N'[commercial].[TenderQuotes]', N'U') IS NULL
CREATE TABLE [commercial].[TenderQuotes] (
  [QuoteId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_TenderQuotes] PRIMARY KEY,
  [OpportunityId] NVARCHAR(40) NOT NULL,
  [CompanyCode] NVARCHAR(20) NOT NULL CONSTRAINT [DF_TenderQuotes_Company] DEFAULT N'DLE',
  [SupplierName] NVARCHAR(220) NOT NULL,
  [LotCode] NVARCHAR(40) NULL,
  [TechnicalNotes] NVARCHAR(MAX) NULL,
  [CommercialAmount] DECIMAL(19,2) NOT NULL,
  [Currency] NVARCHAR(10) NOT NULL CONSTRAINT [DF_TenderQuotes_Currency] DEFAULT N'NGN',
  [AmountHash] NVARCHAR(64) NOT NULL,
  [ReleasedAt] DATETIME2(0) NULL,
  [ReleasedBy] NVARCHAR(120) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TenderQuotes_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NULL
);

IF OBJECT_ID(N'[commercial].[TenderScenarios]', N'U') IS NULL
CREATE TABLE [commercial].[TenderScenarios] (
  [ScenarioId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_TenderScenarios] PRIMARY KEY,
  [OpportunityId] NVARCHAR(40) NOT NULL,
  [CompanyCode] NVARCHAR(20) NOT NULL CONSTRAINT [DF_TenderScen_Company] DEFAULT N'DLE',
  [ScenarioName] NVARCHAR(40) NOT NULL,
  [FxRate] DECIMAL(19,6) NOT NULL,
  [EscalationPct] DECIMAL(9,2) NOT NULL,
  [ProductivityPct] DECIMAL(9,2) NOT NULL,
  [DelayDays] INT NOT NULL,
  [OverrunPct] DECIMAL(9,2) NOT NULL,
  [Cost] DECIMAL(19,2) NOT NULL,
  [Sell] DECIMAL(19,2) NOT NULL,
  [Margin] DECIMAL(19,2) NOT NULL,
  [Assumptions] NVARCHAR(MAX) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TenderScen_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NULL
);

IF OBJECT_ID(N'[commercial].[TenderCashFlows]', N'U') IS NULL
CREATE TABLE [commercial].[TenderCashFlows] (
  [PeriodId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_TenderCashFlows] PRIMARY KEY,
  [OpportunityId] NVARCHAR(40) NOT NULL,
  [CompanyCode] NVARCHAR(20) NOT NULL CONSTRAINT [DF_TenderCash_Company] DEFAULT N'DLE',
  [PeriodMonth] CHAR(7) NOT NULL,
  [Inflow] DECIMAL(19,2) NOT NULL,
  [Outflow] DECIMAL(19,2) NOT NULL,
  [Retention] DECIMAL(19,2) NOT NULL,
  [Mobilization] DECIMAL(19,2) NOT NULL,
  [Guarantee] DECIMAL(19,2) NOT NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TenderCash_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NULL
);

IF OBJECT_ID(N'[commercial].[TenderClauses]', N'U') IS NULL
CREATE TABLE [commercial].[TenderClauses] (
  [ClauseId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_TenderClauses] PRIMARY KEY,
  [OpportunityId] NVARCHAR(40) NOT NULL,
  [CompanyCode] NVARCHAR(20) NOT NULL CONSTRAINT [DF_TenderClause_Company] DEFAULT N'DLE',
  [ClauseType] NVARCHAR(80) NOT NULL,
  [ClauseText] NVARCHAR(MAX) NULL,
  [Deviation] NVARCHAR(MAX) NULL,
  [ResidualRisk] NVARCHAR(300) NULL,
  [OwnerName] NVARCHAR(120) NULL,
  [Acceptance] NVARCHAR(40) NOT NULL CONSTRAINT [DF_TenderClause_Acceptance] DEFAULT N'OPEN',
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TenderClause_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NULL
);

IF OBJECT_ID(N'[commercial].[TenderManifest]', N'U') IS NULL
CREATE TABLE [commercial].[TenderManifest] (
  [ManifestId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_TenderManifest] PRIMARY KEY,
  [SubmissionId] NVARCHAR(40) NOT NULL,
  [OpportunityId] NVARCHAR(40) NOT NULL,
  [CompanyCode] NVARCHAR(20) NOT NULL CONSTRAINT [DF_TenderManifest_Company] DEFAULT N'DLE',
  [FileName] NVARCHAR(260) NOT NULL,
  [ContentHash] NVARCHAR(64) NOT NULL,
  [SizeBytes] BIGINT NOT NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TenderManifest_CreatedAt] DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID(N'[commercial].[TenderBaselines]', N'U') IS NULL
CREATE TABLE [commercial].[TenderBaselines] (
  [BaselineId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_TenderBaselines] PRIMARY KEY,
  [OpportunityId] NVARCHAR(40) NOT NULL,
  [AwardId] NVARCHAR(40) NOT NULL,
  [CompanyCode] NVARCHAR(20) NOT NULL CONSTRAINT [DF_TenderBase_Company] DEFAULT N'DLE',
  [LotCode] NVARCHAR(40) NOT NULL CONSTRAINT [DF_TenderBase_Lot] DEFAULT N'',
  [ProjectCode] NVARCHAR(30) NOT NULL,
  [AcceptedBy] NVARCHAR(180) NOT NULL,
  [Snapshot] NVARCHAR(MAX) NOT NULL,
  [Status] NVARCHAR(30) NOT NULL CONSTRAINT [DF_TenderBase_Status] DEFAULT N'ACCEPTED',
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TenderBase_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NULL
);

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE name = N'UX_TenderBaseline_AwardLot' AND object_id = OBJECT_ID(N'[commercial].[TenderBaselines]')
)
  CREATE UNIQUE INDEX [UX_TenderBaseline_AwardLot] ON [commercial].[TenderBaselines]([AwardId],[LotCode]);

IF OBJECT_ID(N'[commercial].[TenderAiReviews]', N'U') IS NULL
CREATE TABLE [commercial].[TenderAiReviews] (
  [ReviewId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_TenderAiReviews] PRIMARY KEY,
  [OpportunityId] NVARCHAR(40) NOT NULL,
  [CompanyCode] NVARCHAR(20) NOT NULL CONSTRAINT [DF_TenderAi_Company] DEFAULT N'DLE',
  [Ruleset] NVARCHAR(40) NOT NULL,
  [Finding] NVARCHAR(300) NOT NULL,
  [Evidence] NVARCHAR(MAX) NULL,
  [Confidence] DECIMAL(9,2) NOT NULL,
  [HumanDecision] NVARCHAR(20) NULL,
  [Outcome] NVARCHAR(MAX) NULL,
  [DecidedBy] NVARCHAR(120) NULL,
  [DecidedAt] DATETIME2(0) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TenderAi_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NULL
);

IF COL_LENGTH(N'commercial.TenderOpportunities', N'PreparationStatus') IS NULL
  ALTER TABLE [commercial].[TenderOpportunities] ADD [PreparationStatus] NVARCHAR(20) NULL;
IF COL_LENGTH(N'commercial.TenderOpportunities', N'ClientStatus') IS NULL
  ALTER TABLE [commercial].[TenderOpportunities] ADD [ClientStatus] NVARCHAR(20) NULL;
IF COL_LENGTH(N'commercial.TenderOpportunities', N'AwardedToDle') IS NULL
  ALTER TABLE [commercial].[TenderOpportunities] ADD [AwardedToDle] NVARCHAR(20) NULL;
IF COL_LENGTH(N'commercial.TenderOpportunities', N'OwnerEmployeeCode') IS NULL
  ALTER TABLE [commercial].[TenderOpportunities] ADD [OwnerEmployeeCode] NVARCHAR(80) NULL;
IF COL_LENGTH(N'commercial.TenderOpportunities', N'AssignedAt') IS NULL
  ALTER TABLE [commercial].[TenderOpportunities] ADD [AssignedAt] DATETIME2(0) NULL;
IF COL_LENGTH(N'commercial.TenderOpportunities', N'AcknowledgedAt') IS NULL
  ALTER TABLE [commercial].[TenderOpportunities] ADD [AcknowledgedAt] DATETIME2(0) NULL;
IF COL_LENGTH(N'commercial.TenderOpportunities', N'DeadlineOverrideReason') IS NULL
  ALTER TABLE [commercial].[TenderOpportunities] ADD [DeadlineOverrideReason] NVARCHAR(500) NULL;
IF COL_LENGTH(N'commercial.TenderOpportunities', N'UrgentException') IS NULL
  ALTER TABLE [commercial].[TenderOpportunities] ADD [UrgentException] BIT NOT NULL CONSTRAINT [DF_TenderOpp_Urgent] DEFAULT 0;

IF COL_LENGTH(N'commercial.TenderOpportunities', N'CommercialKind') IS NULL
  ALTER TABLE [commercial].[TenderOpportunities] ADD [CommercialKind] NVARCHAR(10) NULL;
IF COL_LENGTH(N'commercial.TenderOpportunities', N'CommercialReview') IS NULL
  ALTER TABLE [commercial].[TenderOpportunities] ADD [CommercialReview] NVARCHAR(40) NULL;
IF COL_LENGTH(N'commercial.TenderOpportunities', N'CommercialReviewNote') IS NULL
  ALTER TABLE [commercial].[TenderOpportunities] ADD [CommercialReviewNote] NVARCHAR(MAX) NULL;
IF COL_LENGTH(N'commercial.TenderOpportunities', N'CommercialReviewedBy') IS NULL
  ALTER TABLE [commercial].[TenderOpportunities] ADD [CommercialReviewedBy] NVARCHAR(120) NULL;
IF COL_LENGTH(N'commercial.TenderOpportunities', N'CommercialReviewedAt') IS NULL
  ALTER TABLE [commercial].[TenderOpportunities] ADD [CommercialReviewedAt] DATETIME2(0) NULL;
IF COL_LENGTH(N'commercial.TenderOpportunities', N'OriginalInternalDeadline') IS NULL
  ALTER TABLE [commercial].[TenderOpportunities] ADD [OriginalInternalDeadline] DATE NULL;
IF COL_LENGTH(N'commercial.TenderOpportunities', N'GmBidDecision') IS NULL
  ALTER TABLE [commercial].[TenderOpportunities] ADD [GmBidDecision] NVARCHAR(20) NULL;

IF COL_LENGTH(N'commercial.TenderOpportunities', N'CommercialKind') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE name = N'IX_TenderOpp_CommercialDashboard' AND object_id = OBJECT_ID(N'[commercial].[TenderOpportunities]')
  )
  EXEC(N'CREATE INDEX [IX_TenderOpp_CommercialDashboard] ON [commercial].[TenderOpportunities]([CommercialKind],[CommercialReview],[BidDecision],[SubmissionDeadline],[ClosingDate])');

IF OBJECT_ID(N'[commercial].[TenderReminderLog]', N'U') IS NULL
CREATE TABLE [commercial].[TenderReminderLog] (
  [ReminderKey] NVARCHAR(180) NOT NULL CONSTRAINT [PK_TenderReminderLog] PRIMARY KEY,
  [OpportunityId] NVARCHAR(40) NOT NULL,
  [SlotName] NVARCHAR(40) NOT NULL,
  [StatusName] NVARCHAR(20) NOT NULL,
  [Detail] NVARCHAR(500) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TenderReminder_CreatedAt] DEFAULT SYSUTCDATETIME()
);
`;
