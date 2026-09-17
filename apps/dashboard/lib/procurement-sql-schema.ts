export const ensureProcurementSchemaSql = `
IF SCHEMA_ID(N'procurement') IS NULL EXEC(N'CREATE SCHEMA [procurement]');

IF OBJECT_ID(N'[procurement].[Suppliers]', N'U') IS NULL
CREATE TABLE [procurement].[Suppliers] (
  [SupplierId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ProcSuppliers] PRIMARY KEY,
  [Name] NVARCHAR(220) NOT NULL,
  [Code] NVARCHAR(80) NULL,
  [IsApproved] BIT NOT NULL CONSTRAINT [DF_ProcSuppliers_IsApproved] DEFAULT 1,
  [Currency] NVARCHAR(10) NULL,
  [PaymentTerms] NVARCHAR(200) NULL,
  [DeliveryPeriod] NVARCHAR(120) NULL,
  [DeliveryLocation] NVARCHAR(200) NULL,
  [Outstanding] DECIMAL(19,2) NOT NULL CONSTRAINT [DF_ProcSuppliers_Outstanding] DEFAULT 0,
  [Email] NVARCHAR(200) NULL,
  [Phone] NVARCHAR(80) NULL,
  [Notes] NVARCHAR(MAX) NULL,
  [IsActive] BIT NOT NULL CONSTRAINT [DF_ProcSuppliers_IsActive] DEFAULT 1,
  [IsBlacklisted] BIT NOT NULL CONSTRAINT [DF_ProcSuppliers_IsBlacklisted] DEFAULT 0,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ProcSuppliers_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ProcSuppliers_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NULL,
  [UpdatedBy] NVARCHAR(120) NULL
);

IF COL_LENGTH(N'[procurement].[Suppliers]', N'IsBlacklisted') IS NULL
  ALTER TABLE [procurement].[Suppliers] ADD [IsBlacklisted] BIT NOT NULL CONSTRAINT [DF_ProcSuppliers_IsBlacklisted] DEFAULT 0;
IF COL_LENGTH(N'[procurement].[Suppliers]', N'Source') IS NULL
  ALTER TABLE [procurement].[Suppliers] ADD [Source] NVARCHAR(20) NOT NULL CONSTRAINT [DF_ProcSuppliers_Source] DEFAULT N'LOCAL';
IF COL_LENGTH(N'[procurement].[Suppliers]', N'SageCode') IS NULL
  ALTER TABLE [procurement].[Suppliers] ADD [SageCode] NVARCHAR(80) NULL;
IF COL_LENGTH(N'[procurement].[Suppliers]', N'ShortName') IS NULL
  ALTER TABLE [procurement].[Suppliers] ADD [ShortName] NVARCHAR(80) NULL;
IF COL_LENGTH(N'[procurement].[Suppliers]', N'ContactName') IS NULL
  ALTER TABLE [procurement].[Suppliers] ADD [ContactName] NVARCHAR(220) NULL;
IF COL_LENGTH(N'[procurement].[Suppliers]', N'AddressLine') IS NULL
  ALTER TABLE [procurement].[Suppliers] ADD [AddressLine] NVARCHAR(500) NULL;
IF COL_LENGTH(N'[procurement].[Suppliers]', N'City') IS NULL
  ALTER TABLE [procurement].[Suppliers] ADD [City] NVARCHAR(120) NULL;
IF COL_LENGTH(N'[procurement].[Suppliers]', N'StateName') IS NULL
  ALTER TABLE [procurement].[Suppliers] ADD [StateName] NVARCHAR(120) NULL;
IF COL_LENGTH(N'[procurement].[Suppliers]', N'Country') IS NULL
  ALTER TABLE [procurement].[Suppliers] ADD [Country] NVARCHAR(80) NULL;
IF COL_LENGTH(N'[procurement].[Suppliers]', N'PostalCode') IS NULL
  ALTER TABLE [procurement].[Suppliers] ADD [PostalCode] NVARCHAR(40) NULL;
IF COL_LENGTH(N'[procurement].[Suppliers]', N'Mobile') IS NULL
  ALTER TABLE [procurement].[Suppliers] ADD [Mobile] NVARCHAR(80) NULL;
IF COL_LENGTH(N'[procurement].[Suppliers]', N'Website') IS NULL
  ALTER TABLE [procurement].[Suppliers] ADD [Website] NVARCHAR(200) NULL;
IF COL_LENGTH(N'[procurement].[Suppliers]', N'TaxId') IS NULL
  ALTER TABLE [procurement].[Suppliers] ADD [TaxId] NVARCHAR(80) NULL;
IF COL_LENGTH(N'[procurement].[Suppliers]', N'RegistrationNo') IS NULL
  ALTER TABLE [procurement].[Suppliers] ADD [RegistrationNo] NVARCHAR(80) NULL;
BEGIN TRY
  IF NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE name = N'UX_ProcSuppliers_Code' AND object_id = OBJECT_ID(N'[procurement].[Suppliers]')
  )
    EXEC(N'CREATE UNIQUE INDEX [UX_ProcSuppliers_Code] ON [procurement].[Suppliers]([Code]) WHERE [Code] IS NOT NULL AND LTRIM(RTRIM([Code])) <> N''''');
END TRY BEGIN CATCH END CATCH;
BEGIN TRY
  IF NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE name = N'UX_ProcSuppliers_SageCode' AND object_id = OBJECT_ID(N'[procurement].[Suppliers]')
  )
    EXEC(N'CREATE UNIQUE INDEX [UX_ProcSuppliers_SageCode] ON [procurement].[Suppliers]([SageCode]) WHERE [SageCode] IS NOT NULL AND LTRIM(RTRIM([SageCode])) <> N''''');
END TRY BEGIN CATCH END CATCH;

IF OBJECT_ID(N'[procurement].[PurchaseRequisitions]', N'U') IS NULL
CREATE TABLE [procurement].[PurchaseRequisitions] (
  [PrId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ProcPRs] PRIMARY KEY,
  [Title] NVARCHAR(300) NOT NULL,
  [Description] NVARCHAR(MAX) NULL,
  [Department] NVARCHAR(180) NULL,
  [Project] NVARCHAR(180) NULL,
  [RequesterName] NVARCHAR(220) NULL,
  [Status] NVARCHAR(40) NOT NULL,
  [Currency] NVARCHAR(10) NULL,
  [EstimatedAmount] DECIMAL(19,2) NULL,
  [RequiredDate] DATE NULL,
  [CurrentWith] NVARCHAR(120) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ProcPRs_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ProcPRs_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NULL,
  [UpdatedBy] NVARCHAR(120) NULL
);

IF COL_LENGTH(N'[procurement].[PurchaseRequisitions]', N'RequiredDate') IS NULL
  ALTER TABLE [procurement].[PurchaseRequisitions] ADD [RequiredDate] DATE NULL;
IF COL_LENGTH(N'[procurement].[PurchaseRequisitions]', N'CurrentWith') IS NULL
  ALTER TABLE [procurement].[PurchaseRequisitions] ADD [CurrentWith] NVARCHAR(120) NULL;

IF OBJECT_ID(N'[procurement].[PurchaseRequisitionLines]', N'U') IS NULL
CREATE TABLE [procurement].[PurchaseRequisitionLines] (
  [LineId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ProcPRLines] PRIMARY KEY,
  [PrId] NVARCHAR(40) NOT NULL,
  [Description] NVARCHAR(500) NOT NULL,
  [Uom] NVARCHAR(40) NULL,
  [Qty] DECIMAL(19,4) NOT NULL CONSTRAINT [DF_ProcPRLines_Qty] DEFAULT 1,
  [UnitEstimate] DECIMAL(19,2) NULL,
  [SortOrder] INT NOT NULL CONSTRAINT [DF_ProcPRLines_Sort] DEFAULT 0
);

IF OBJECT_ID(N'[procurement].[Rfqs]', N'U') IS NULL
CREATE TABLE [procurement].[Rfqs] (
  [RfqId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ProcRfqs] PRIMARY KEY,
  [PrId] NVARCHAR(40) NULL,
  [Title] NVARCHAR(300) NOT NULL,
  [Status] NVARCHAR(40) NOT NULL,
  [IssueDate] DATE NULL,
  [SubmissionDeadline] DATE NULL,
  [BuyerName] NVARCHAR(220) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ProcRfqs_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ProcRfqs_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NULL,
  [UpdatedBy] NVARCHAR(120) NULL
);

IF OBJECT_ID(N'[procurement].[RfqInvites]', N'U') IS NULL
CREATE TABLE [procurement].[RfqInvites] (
  [InviteId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ProcRfqInvites] PRIMARY KEY,
  [RfqId] NVARCHAR(40) NOT NULL,
  [SupplierId] NVARCHAR(40) NOT NULL,
  [SupplierName] NVARCHAR(220) NOT NULL,
  [Status] NVARCHAR(40) NOT NULL CONSTRAINT [DF_ProcRfqInvites_Status] DEFAULT N'Invited',
  [InvitedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ProcRfqInvites_InvitedAt] DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID(N'[procurement].[CbeEvaluations]', N'U') IS NULL
CREATE TABLE [procurement].[CbeEvaluations] (
  [CbeId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ProcCbe] PRIMARY KEY,
  [Title] NVARCHAR(300) NOT NULL,
  [RfqId] NVARCHAR(40) NULL,
  [RfqNumber] NVARCHAR(80) NULL,
  [PrId] NVARCHAR(40) NULL,
  [Project] NVARCHAR(180) NULL,
  [Department] NVARCHAR(180) NULL,
  [BuyerName] NVARCHAR(220) NULL,
  [Currency] NVARCHAR(10) NOT NULL CONSTRAINT [DF_ProcCbe_Currency] DEFAULT N'NGN',
  [EvaluationMethod] NVARCHAR(120) NULL,
  [Status] NVARCHAR(60) NOT NULL,
  [BidsLocked] BIT NOT NULL CONSTRAINT [DF_ProcCbe_BidsLocked] DEFAULT 0,
  [RecommendedSupplierId] NVARCHAR(40) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ProcCbe_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ProcCbe_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NULL,
  [UpdatedBy] NVARCHAR(120) NULL
);

IF OBJECT_ID(N'[procurement].[CbeBidders]', N'U') IS NULL
CREATE TABLE [procurement].[CbeBidders] (
  [BidderId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ProcCbeBidders] PRIMARY KEY,
  [CbeId] NVARCHAR(40) NOT NULL,
  [SupplierId] NVARCHAR(40) NULL,
  [Name] NVARCHAR(220) NOT NULL,
  [Code] NVARCHAR(80) NULL,
  [Approved] BIT NOT NULL CONSTRAINT [DF_ProcCbeBidders_Approved] DEFAULT 1,
  [QuoteNo] NVARCHAR(80) NULL,
  [QuoteDate] NVARCHAR(40) NULL,
  [ValidUntil] NVARCHAR(40) NULL,
  [Currency] NVARCHAR(10) NULL,
  [PaymentTerms] NVARCHAR(200) NULL,
  [DeliveryPeriod] NVARCHAR(120) NULL,
  [DeliveryLocation] NVARCHAR(200) NULL,
  [Outstanding] DECIMAL(19,2) NOT NULL CONSTRAINT [DF_ProcCbeBidders_Outstanding] DEFAULT 0,
  [Discount] DECIMAL(19,2) NOT NULL CONSTRAINT [DF_ProcCbeBidders_Discount] DEFAULT 0,
  [Transportation] DECIMAL(19,2) NOT NULL CONSTRAINT [DF_ProcCbeBidders_Transportation] DEFAULT 0,
  [OtherCharges] DECIMAL(19,2) NOT NULL CONSTRAINT [DF_ProcCbeBidders_OtherCharges] DEFAULT 0,
  [VatRate] DECIMAL(9,4) NOT NULL CONSTRAINT [DF_ProcCbeBidders_VatRate] DEFAULT 7.5,
  [SortOrder] INT NOT NULL CONSTRAINT [DF_ProcCbeBidders_Sort] DEFAULT 0
);

IF OBJECT_ID(N'[procurement].[CbeBidItems]', N'U') IS NULL
CREATE TABLE [procurement].[CbeBidItems] (
  [ItemId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ProcCbeItems] PRIMARY KEY,
  [CbeId] NVARCHAR(40) NOT NULL,
  [LineNo] INT NOT NULL,
  [Description] NVARCHAR(500) NOT NULL,
  [Uom] NVARCHAR(40) NULL,
  [Qty] DECIMAL(19,4) NOT NULL CONSTRAINT [DF_ProcCbeItems_Qty] DEFAULT 1
);

IF OBJECT_ID(N'[procurement].[CbeBidPrices]', N'U') IS NULL
CREATE TABLE [procurement].[CbeBidPrices] (
  [PriceId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ProcCbePrices] PRIMARY KEY,
  [CbeId] NVARCHAR(40) NOT NULL,
  [ItemId] NVARCHAR(40) NOT NULL,
  [BidderId] NVARCHAR(40) NOT NULL,
  [OriginalUnit] DECIMAL(19,4) NOT NULL CONSTRAINT [DF_ProcCbePrices_Original] DEFAULT 0,
  [NegotiatedUnit] DECIMAL(19,4) NULL
);

IF OBJECT_ID(N'[procurement].[CbeTechnicalCriteria]', N'U') IS NULL
CREATE TABLE [procurement].[CbeTechnicalCriteria] (
  [CriteriaId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ProcCbeTech] PRIMARY KEY,
  [CbeId] NVARCHAR(40) NOT NULL,
  [LineNo] INT NOT NULL,
  [Section] NVARCHAR(200) NOT NULL,
  [Requirement] NVARCHAR(500) NOT NULL,
  [Mandatory] BIT NOT NULL CONSTRAINT [DF_ProcCbeTech_Mandatory] DEFAULT 1,
  [SupplierStatusJson] NVARCHAR(MAX) NULL,
  [Comments] NVARCHAR(MAX) NULL
);

IF OBJECT_ID(N'[procurement].[CbeNegotiationRounds]', N'U') IS NULL
CREATE TABLE [procurement].[CbeNegotiationRounds] (
  [RoundId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ProcCbeNeg] PRIMARY KEY,
  [CbeId] NVARCHAR(40) NOT NULL,
  [BidderId] NVARCHAR(40) NOT NULL,
  [RoundDate] NVARCHAR(40) NULL,
  [Method] NVARCHAR(120) NULL,
  [NegotiatedBy] NVARCHAR(220) NULL,
  [OriginalValue] DECIMAL(19,2) NOT NULL CONSTRAINT [DF_ProcCbeNeg_Original] DEFAULT 0,
  [VendorOffer] DECIMAL(19,2) NOT NULL CONSTRAINT [DF_ProcCbeNeg_Offer] DEFAULT 0,
  [AgreedValue] DECIMAL(19,2) NOT NULL CONSTRAINT [DF_ProcCbeNeg_Agreed] DEFAULT 0,
  [Notes] NVARCHAR(MAX) NULL,
  [IsBafo] BIT NOT NULL CONSTRAINT [DF_ProcCbeNeg_Bafo] DEFAULT 0,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ProcCbeNeg_CreatedAt] DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID(N'[procurement].[CbeRecommendations]', N'U') IS NULL
CREATE TABLE [procurement].[CbeRecommendations] (
  [RecommendationId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ProcCbeRec] PRIMARY KEY,
  [CbeId] NVARCHAR(40) NOT NULL,
  [RecommendedBidderId] NVARCHAR(40) NULL,
  [RecommendedName] NVARCHAR(220) NULL,
  [Basis] NVARCHAR(MAX) NULL,
  [ScoresJson] NVARCHAR(MAX) NULL,
  [Status] NVARCHAR(40) NOT NULL CONSTRAINT [DF_ProcCbeRec_Status] DEFAULT N'Draft',
  [SubmittedAt] DATETIME2(0) NULL,
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ProcCbeRec_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedBy] NVARCHAR(120) NULL
);

IF OBJECT_ID(N'[procurement].[CbeApprovals]', N'U') IS NULL
CREATE TABLE [procurement].[CbeApprovals] (
  [ApprovalId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ProcCbeAppr] PRIMARY KEY,
  [CbeId] NVARCHAR(40) NOT NULL,
  [StepNo] INT NOT NULL,
  [RoleName] NVARCHAR(120) NOT NULL,
  [ActorName] NVARCHAR(220) NULL,
  [Status] NVARCHAR(40) NOT NULL,
  [ActionAt] DATETIME2(0) NULL,
  [Notes] NVARCHAR(MAX) NULL
);

IF OBJECT_ID(N'[procurement].[CbeDocuments]', N'U') IS NULL
CREATE TABLE [procurement].[CbeDocuments] (
  [DocumentId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ProcCbeDocs] PRIMARY KEY,
  [CbeId] NVARCHAR(40) NOT NULL,
  [Name] NVARCHAR(300) NOT NULL,
  [Category] NVARCHAR(120) NULL,
  [Vendor] NVARCHAR(220) NULL,
  [Version] NVARCHAR(40) NULL,
  [UploadedBy] NVARCHAR(220) NULL,
  [UploadedOn] NVARCHAR(80) NULL,
  [SizeLabel] NVARCHAR(40) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ProcCbeDocs_CreatedAt] DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID(N'[procurement].[CbeAuditLog]', N'U') IS NULL
CREATE TABLE [procurement].[CbeAuditLog] (
  [AuditId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ProcCbeAudit] PRIMARY KEY,
  [CbeId] NVARCHAR(40) NOT NULL,
  [Action] NVARCHAR(300) NOT NULL,
  [Section] NVARCHAR(80) NULL,
  [Details] NVARCHAR(MAX) NULL,
  [ActorName] NVARCHAR(220) NULL,
  [ActorRole] NVARCHAR(120) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ProcCbeAudit_CreatedAt] DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID(N'[procurement].[PurchaseOrders]', N'U') IS NULL
CREATE TABLE [procurement].[PurchaseOrders] (
  [PoId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ProcPOs] PRIMARY KEY,
  [Title] NVARCHAR(300) NOT NULL,
  [SupplierId] NVARCHAR(40) NULL,
  [SupplierName] NVARCHAR(220) NULL,
  [CbeId] NVARCHAR(40) NULL,
  [Status] NVARCHAR(40) NOT NULL,
  [Currency] NVARCHAR(10) NULL,
  [Amount] DECIMAL(19,2) NULL,
  [OrderDate] DATE NULL,
  [ExpectedDate] DATE NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ProcPOs_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ProcPOs_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NULL,
  [UpdatedBy] NVARCHAR(120) NULL
);

IF OBJECT_ID(N'[procurement].[Contracts]', N'U') IS NULL
CREATE TABLE [procurement].[Contracts] (
  [ContractId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ProcContracts] PRIMARY KEY,
  [Title] NVARCHAR(300) NOT NULL,
  [SupplierId] NVARCHAR(40) NULL,
  [SupplierName] NVARCHAR(220) NULL,
  [PoId] NVARCHAR(40) NULL,
  [Status] NVARCHAR(40) NOT NULL,
  [StartDate] DATE NULL,
  [EndDate] DATE NULL,
  [Value] DECIMAL(19,2) NULL,
  [Notes] NVARCHAR(MAX) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ProcContracts_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ProcContracts_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NULL,
  [UpdatedBy] NVARCHAR(120) NULL
);

IF OBJECT_ID(N'[procurement].[Settings]', N'U') IS NULL
CREATE TABLE [procurement].[Settings] (
  [SettingId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ProcSettings] PRIMARY KEY,
  [SettingType] NVARCHAR(60) NOT NULL,
  [Name] NVARCHAR(200) NOT NULL,
  [Value] NVARCHAR(200) NULL,
  [PayloadJson] NVARCHAR(MAX) NULL,
  [SortOrder] INT NOT NULL CONSTRAINT [DF_ProcSettings_Sort] DEFAULT 0,
  [IsActive] BIT NOT NULL CONSTRAINT [DF_ProcSettings_IsActive] DEFAULT 1,
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ProcSettings_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedBy] NVARCHAR(120) NULL
);

IF COL_LENGTH(N'[procurement].[PurchaseRequisitions]', N'RequestType') IS NULL
  ALTER TABLE [procurement].[PurchaseRequisitions] ADD [RequestType] NVARCHAR(40) NULL;
IF COL_LENGTH(N'[procurement].[PurchaseRequisitions]', N'CostCentre') IS NULL
  ALTER TABLE [procurement].[PurchaseRequisitions] ADD [CostCentre] NVARCHAR(100) NULL;
IF COL_LENGTH(N'[procurement].[PurchaseRequisitions]', N'BudgetLine') IS NULL
  ALTER TABLE [procurement].[PurchaseRequisitions] ADD [BudgetLine] NVARCHAR(120) NULL;
IF COL_LENGTH(N'[procurement].[PurchaseRequisitions]', N'BusinessJustification') IS NULL
  ALTER TABLE [procurement].[PurchaseRequisitions] ADD [BusinessJustification] NVARCHAR(MAX) NULL;
IF COL_LENGTH(N'[procurement].[PurchaseRequisitions]', N'DeliveryLocation') IS NULL
  ALTER TABLE [procurement].[PurchaseRequisitions] ADD [DeliveryLocation] NVARCHAR(200) NULL;
IF COL_LENGTH(N'[procurement].[PurchaseRequisitions]', N'Priority') IS NULL
  ALTER TABLE [procurement].[PurchaseRequisitions] ADD [Priority] NVARCHAR(20) NULL;
IF COL_LENGTH(N'[procurement].[PurchaseRequisitions]', N'Site') IS NULL
  ALTER TABLE [procurement].[PurchaseRequisitions] ADD [Site] NVARCHAR(20) NULL;
IF COL_LENGTH(N'[procurement].[PurchaseRequisitions]', N'Location') IS NULL
  ALTER TABLE [procurement].[PurchaseRequisitions] ADD [Location] NVARCHAR(200) NULL;
IF COL_LENGTH(N'[procurement].[PurchaseRequisitions]', N'AttachmentsJson') IS NULL
  ALTER TABLE [procurement].[PurchaseRequisitions] ADD [AttachmentsJson] NVARCHAR(MAX) NULL;

IF COL_LENGTH(N'[procurement].[PurchaseRequisitionLines]', N'Description') IS NOT NULL
  AND COL_LENGTH(N'[procurement].[PurchaseRequisitionLines]', N'Description') BETWEEN 1 AND 3999
  ALTER TABLE [procurement].[PurchaseRequisitionLines] ALTER COLUMN [Description] NVARCHAR(2000) NOT NULL;

IF COL_LENGTH(N'[procurement].[PurchaseRequisitionLines]', N'ItemCode') IS NULL
  ALTER TABLE [procurement].[PurchaseRequisitionLines] ADD [ItemCode] NVARCHAR(80) NULL;
IF COL_LENGTH(N'[procurement].[PurchaseRequisitionLines]', N'Specification') IS NULL
  ALTER TABLE [procurement].[PurchaseRequisitionLines] ADD [Specification] NVARCHAR(2000) NULL;
ELSE IF COL_LENGTH(N'[procurement].[PurchaseRequisitionLines]', N'Specification') BETWEEN 1 AND 3999
  ALTER TABLE [procurement].[PurchaseRequisitionLines] ALTER COLUMN [Specification] NVARCHAR(2000) NULL;
IF COL_LENGTH(N'[procurement].[PurchaseRequisitionLines]', N'TaxRate') IS NULL
  ALTER TABLE [procurement].[PurchaseRequisitionLines] ADD [TaxRate] DECIMAL(9,4) NOT NULL CONSTRAINT [DF_ProcPRLines_Tax] DEFAULT 0;
IF COL_LENGTH(N'[procurement].[PurchaseRequisitionLines]', N'RequiredDate') IS NULL
  ALTER TABLE [procurement].[PurchaseRequisitionLines] ADD [RequiredDate] DATE NULL;
IF COL_LENGTH(N'[procurement].[PurchaseRequisitionLines]', N'DeliveryLocation') IS NULL
  ALTER TABLE [procurement].[PurchaseRequisitionLines] ADD [DeliveryLocation] NVARCHAR(200) NULL;

IF COL_LENGTH(N'[procurement].[Rfqs]', N'RfxType') IS NULL
  ALTER TABLE [procurement].[Rfqs] ADD [RfxType] NVARCHAR(20) NULL;
IF COL_LENGTH(N'[procurement].[Rfqs]', N'ProcurementMethod') IS NULL
  ALTER TABLE [procurement].[Rfqs] ADD [ProcurementMethod] NVARCHAR(80) NULL;
IF COL_LENGTH(N'[procurement].[Rfqs]', N'EvaluationMethod') IS NULL
  ALTER TABLE [procurement].[Rfqs] ADD [EvaluationMethod] NVARCHAR(120) NULL;
IF COL_LENGTH(N'[procurement].[Rfqs]', N'TechnicalWeight') IS NULL
  ALTER TABLE [procurement].[Rfqs] ADD [TechnicalWeight] DECIMAL(9,4) NULL;
IF COL_LENGTH(N'[procurement].[Rfqs]', N'CommercialWeight') IS NULL
  ALTER TABLE [procurement].[Rfqs] ADD [CommercialWeight] DECIMAL(9,4) NULL;
IF COL_LENGTH(N'[procurement].[Rfqs]', N'Instructions') IS NULL
  ALTER TABLE [procurement].[Rfqs] ADD [Instructions] NVARCHAR(MAX) NULL;

IF COL_LENGTH(N'[procurement].[PurchaseOrders]', N'AwardRef') IS NULL
  ALTER TABLE [procurement].[PurchaseOrders] ADD [AwardRef] NVARCHAR(80) NULL;
IF COL_LENGTH(N'[procurement].[PurchaseOrders]', N'ContractId') IS NULL
  ALTER TABLE [procurement].[PurchaseOrders] ADD [ContractId] NVARCHAR(40) NULL;
IF COL_LENGTH(N'[procurement].[PurchaseOrders]', N'PaymentTerms') IS NULL
  ALTER TABLE [procurement].[PurchaseOrders] ADD [PaymentTerms] NVARCHAR(200) NULL;
IF COL_LENGTH(N'[procurement].[PurchaseOrders]', N'DeliveryTerms') IS NULL
  ALTER TABLE [procurement].[PurchaseOrders] ADD [DeliveryTerms] NVARCHAR(200) NULL;
IF COL_LENGTH(N'[procurement].[PurchaseOrders]', N'DeliveryLocation') IS NULL
  ALTER TABLE [procurement].[PurchaseOrders] ADD [DeliveryLocation] NVARCHAR(200) NULL;
IF COL_LENGTH(N'[procurement].[PurchaseOrders]', N'QuoteRef') IS NULL
  ALTER TABLE [procurement].[PurchaseOrders] ADD [QuoteRef] NVARCHAR(120) NULL;
IF COL_LENGTH(N'[procurement].[PurchaseOrders]', N'Project') IS NULL
  ALTER TABLE [procurement].[PurchaseOrders] ADD [Project] NVARCHAR(180) NULL;
IF COL_LENGTH(N'[procurement].[PurchaseOrders]', N'CostCentre') IS NULL
  ALTER TABLE [procurement].[PurchaseOrders] ADD [CostCentre] NVARCHAR(100) NULL;

IF OBJECT_ID(N'[procurement].[PurchaseOrderLines]', N'U') IS NULL
CREATE TABLE [procurement].[PurchaseOrderLines] (
  [LineId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ProcPOLines] PRIMARY KEY,
  [PoId] NVARCHAR(40) NOT NULL,
  [ItemCode] NVARCHAR(80) NULL,
  [Description] NVARCHAR(500) NOT NULL,
  [Specification] NVARCHAR(500) NULL,
  [Uom] NVARCHAR(40) NULL,
  [Qty] DECIMAL(19,4) NOT NULL CONSTRAINT [DF_ProcPOLines_Qty] DEFAULT 1,
  [UnitPrice] DECIMAL(19,4) NOT NULL CONSTRAINT [DF_ProcPOLines_Unit] DEFAULT 0,
  [TaxRate] DECIMAL(9,4) NOT NULL CONSTRAINT [DF_ProcPOLines_Tax] DEFAULT 0,
  [RequiredDate] DATE NULL,
  [DeliveryLocation] NVARCHAR(200) NULL,
  [SortOrder] INT NOT NULL CONSTRAINT [DF_ProcPOLines_Sort] DEFAULT 0
);

IF COL_LENGTH(N'[procurement].[Contracts]', N'ContractType') IS NULL
  ALTER TABLE [procurement].[Contracts] ADD [ContractType] NVARCHAR(80) NULL;
IF COL_LENGTH(N'[procurement].[Contracts]', N'Currency') IS NULL
  ALTER TABLE [procurement].[Contracts] ADD [Currency] NVARCHAR(10) NULL;
IF COL_LENGTH(N'[procurement].[Contracts]', N'PaymentTerms') IS NULL
  ALTER TABLE [procurement].[Contracts] ADD [PaymentTerms] NVARCHAR(200) NULL;
IF COL_LENGTH(N'[procurement].[Contracts]', N'PerformanceSecurity') IS NULL
  ALTER TABLE [procurement].[Contracts] ADD [PerformanceSecurity] NVARCHAR(200) NULL;
IF COL_LENGTH(N'[procurement].[Contracts]', N'Warranty') IS NULL
  ALTER TABLE [procurement].[Contracts] ADD [Warranty] NVARCHAR(200) NULL;

IF COL_LENGTH(N'[procurement].[Suppliers]', N'Category') IS NULL
  ALTER TABLE [procurement].[Suppliers] ADD [Category] NVARCHAR(120) NULL;
IF COL_LENGTH(N'[procurement].[Suppliers]', N'PrequalificationStatus') IS NULL
  ALTER TABLE [procurement].[Suppliers] ADD [PrequalificationStatus] NVARCHAR(80) NULL;
IF COL_LENGTH(N'[procurement].[Suppliers]', N'RiskRating') IS NULL
  ALTER TABLE [procurement].[Suppliers] ADD [RiskRating] NVARCHAR(40) NULL;
IF COL_LENGTH(N'[procurement].[Suppliers]', N'PerformanceScore') IS NULL
  ALTER TABLE [procurement].[Suppliers] ADD [PerformanceScore] DECIMAL(9,2) NULL;
IF COL_LENGTH(N'[procurement].[Suppliers]', N'ComplianceExpiry') IS NULL
  ALTER TABLE [procurement].[Suppliers] ADD [ComplianceExpiry] DATE NULL;

IF OBJECT_ID(N'[procurement].[DomainRecords]', N'U') IS NULL
CREATE TABLE [procurement].[DomainRecords] (
  [RecordId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ProcDomain] PRIMARY KEY,
  [Domain] NVARCHAR(60) NOT NULL,
  [Reference] NVARCHAR(80) NOT NULL,
  [Title] NVARCHAR(300) NOT NULL,
  [Status] NVARCHAR(40) NOT NULL,
  [Priority] NVARCHAR(20) NULL,
  [Project] NVARCHAR(180) NULL,
  [CostCentre] NVARCHAR(100) NULL,
  [OwnerName] NVARCHAR(220) NULL,
  [Currency] NVARCHAR(10) NULL,
  [Amount] DECIMAL(19,2) NULL,
  [DueDate] DATETIME2(0) NULL,
  [PayloadJson] NVARCHAR(MAX) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ProcDomain_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ProcDomain_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NULL,
  [UpdatedBy] NVARCHAR(120) NULL
);

IF OBJECT_ID(N'[procurement].[DomainLines]', N'U') IS NULL
CREATE TABLE [procurement].[DomainLines] (
  [LineId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ProcDomainLines] PRIMARY KEY,
  [RecordId] NVARCHAR(40) NOT NULL,
  [ItemCode] NVARCHAR(80) NULL,
  [Description] NVARCHAR(500) NOT NULL,
  [Specification] NVARCHAR(500) NULL,
  [Uom] NVARCHAR(40) NULL,
  [Qty] DECIMAL(19,4) NOT NULL CONSTRAINT [DF_ProcDomainLines_Qty] DEFAULT 1,
  [UnitPrice] DECIMAL(19,4) NOT NULL CONSTRAINT [DF_ProcDomainLines_Unit] DEFAULT 0,
  [TaxRate] DECIMAL(9,4) NOT NULL CONSTRAINT [DF_ProcDomainLines_Tax] DEFAULT 0,
  [RequiredDate] DATE NULL,
  [DeliveryLocation] NVARCHAR(200) NULL,
  [SortOrder] INT NOT NULL CONSTRAINT [DF_ProcDomainLines_Sort] DEFAULT 0
);

BEGIN TRY
  IF NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE name = N'IX_ProcDomain_DomainUpdated' AND object_id = OBJECT_ID(N'[procurement].[DomainRecords]')
  )
    EXEC(N'CREATE INDEX [IX_ProcDomain_DomainUpdated] ON [procurement].[DomainRecords]([Domain], [UpdatedAt] DESC)');
END TRY BEGIN CATCH END CATCH;
`;
