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
`;
