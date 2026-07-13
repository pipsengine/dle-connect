export const ensureItAssetSchemaSql = `
IF SCHEMA_ID(N'it') IS NULL EXEC(N'CREATE SCHEMA [it]');

IF OBJECT_ID(N'[it].[Assets]', N'U') IS NULL
CREATE TABLE [it].[Assets] (
  [AssetId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ItAssets] PRIMARY KEY,
  [AssetTag] NVARCHAR(40) NOT NULL,
  [Name] NVARCHAR(200) NOT NULL,
  [AssetType] NVARCHAR(40) NOT NULL,
  [Category] NVARCHAR(60) NOT NULL,
  [SubCategory] NVARCHAR(60) NULL,
  [SerialNumber] NVARCHAR(120) NULL,
  [Status] NVARCHAR(40) NOT NULL,
  [WarrantyStatus] NVARCHAR(40) NULL,
  [Location] NVARCHAR(180) NULL,
  [Department] NVARCHAR(180) NULL,
  [OwnerUnit] NVARCHAR(120) NULL,
  [AssignedEmployeeId] NVARCHAR(40) NULL,
  [AssignedEmployeeName] NVARCHAR(220) NULL,
  [AssignedOn] DATE NULL,
  [PurchaseDate] DATE NULL,
  [WarrantyExpiry] DATE NULL,
  [PurchaseCost] DECIMAL(19,2) NULL,
  [Notes] NVARCHAR(MAX) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItAssets_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItAssets_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NULL,
  [UpdatedBy] NVARCHAR(120) NULL,
  [IsActive] BIT NOT NULL CONSTRAINT [DF_ItAssets_IsActive] DEFAULT 1,
  CONSTRAINT [UQ_ItAssets_AssetTag] UNIQUE ([AssetTag])
);

IF OBJECT_ID(N'[it].[InventoryStock]', N'U') IS NULL
CREATE TABLE [it].[InventoryStock] (
  [StockId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ItInventoryStock] PRIMARY KEY,
  [Sku] NVARCHAR(60) NOT NULL,
  [Name] NVARCHAR(200) NOT NULL,
  [Category] NVARCHAR(60) NOT NULL,
  [Quantity] INT NOT NULL CONSTRAINT [DF_ItInventoryStock_Quantity] DEFAULT 0,
  [Status] NVARCHAR(40) NOT NULL,
  [Location] NVARCHAR(180) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItInventoryStock_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItInventoryStock_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedBy] NVARCHAR(120) NULL,
  CONSTRAINT [UQ_ItInventoryStock_Sku] UNIQUE ([Sku])
);

IF OBJECT_ID(N'[it].[MaintenanceRecords]', N'U') IS NULL
CREATE TABLE [it].[MaintenanceRecords] (
  [MaintenanceId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ItMaintenanceRecords] PRIMARY KEY,
  [Title] NVARCHAR(200) NOT NULL,
  [AssetId] NVARCHAR(40) NULL,
  [AssetName] NVARCHAR(200) NOT NULL,
  [Category] NVARCHAR(60) NOT NULL,
  [ScheduledDate] DATE NULL,
  [Priority] NVARCHAR(20) NOT NULL,
  [Status] NVARCHAR(40) NOT NULL,
  [AssignedTo] NVARCHAR(180) NULL,
  [Notes] NVARCHAR(MAX) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItMaintenanceRecords_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItMaintenanceRecords_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NULL,
  [UpdatedBy] NVARCHAR(120) NULL
);

IF COL_LENGTH(N'it.MaintenanceRecords', N'Department') IS NULL
  ALTER TABLE [it].[MaintenanceRecords] ADD [Department] NVARCHAR(180) NULL;
IF COL_LENGTH(N'it.MaintenanceRecords', N'Location') IS NULL
  ALTER TABLE [it].[MaintenanceRecords] ADD [Location] NVARCHAR(180) NULL;

IF OBJECT_ID(N'[it].[AssetAssignments]', N'U') IS NULL
CREATE TABLE [it].[AssetAssignments] (
  [AssignmentId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ItAssetAssignments] PRIMARY KEY,
  [AssetId] NVARCHAR(40) NOT NULL,
  [AssetTag] NVARCHAR(40) NOT NULL,
  [AssetName] NVARCHAR(200) NOT NULL,
  [AssetType] NVARCHAR(40) NOT NULL,
  [EmployeeId] NVARCHAR(40) NULL,
  [EmployeeName] NVARCHAR(220) NOT NULL,
  [Department] NVARCHAR(180) NULL,
  [Location] NVARCHAR(180) NULL,
  [Status] NVARCHAR(40) NOT NULL,
  [AssignedOn] DATE NULL,
  [ReturnedOn] DATE NULL,
  [Notes] NVARCHAR(MAX) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItAssetAssignments_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItAssetAssignments_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NULL
);

IF OBJECT_ID(N'[it].[SoftwareLicenses]', N'U') IS NULL
CREATE TABLE [it].[SoftwareLicenses] (
  [LicenseId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ItSoftwareLicenses] PRIMARY KEY,
  [ProductName] NVARCHAR(200) NOT NULL,
  [VendorName] NVARCHAR(180) NULL,
  [LicenseType] NVARCHAR(60) NOT NULL,
  [SeatsTotal] INT NOT NULL CONSTRAINT [DF_ItSoftwareLicenses_SeatsTotal] DEFAULT 0,
  [SeatsUsed] INT NOT NULL CONSTRAINT [DF_ItSoftwareLicenses_SeatsUsed] DEFAULT 0,
  [ComplianceStatus] NVARCHAR(40) NOT NULL,
  [ExpiryDate] DATE NULL,
  [AnnualCost] DECIMAL(19,2) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItSoftwareLicenses_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItSoftwareLicenses_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedBy] NVARCHAR(120) NULL
);

IF OBJECT_ID(N'[it].[Vendors]', N'U') IS NULL
CREATE TABLE [it].[Vendors] (
  [VendorId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ItVendors] PRIMARY KEY,
  [Name] NVARCHAR(200) NOT NULL,
  [Category] NVARCHAR(80) NULL,
  [ContactName] NVARCHAR(180) NULL,
  [Email] NVARCHAR(180) NULL,
  [Phone] NVARCHAR(60) NULL,
  [Website] NVARCHAR(220) NULL,
  [Location] NVARCHAR(180) NULL,
  [Status] NVARCHAR(40) NOT NULL,
  [Rating] DECIMAL(4,2) NULL,
  [SpendYtd] DECIMAL(19,2) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItVendors_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItVendors_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedBy] NVARCHAR(120) NULL
);

IF OBJECT_ID(N'[it].[Warranties]', N'U') IS NULL
CREATE TABLE [it].[Warranties] (
  [WarrantyId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ItWarranties] PRIMARY KEY,
  [AssetId] NVARCHAR(40) NULL,
  [AssetTag] NVARCHAR(40) NULL,
  [AssetName] NVARCHAR(200) NOT NULL,
  [Provider] NVARCHAR(180) NULL,
  [CoverageType] NVARCHAR(80) NULL,
  [StartDate] DATE NULL,
  [EndDate] DATE NULL,
  [Status] NVARCHAR(40) NOT NULL,
  [CoverageValue] DECIMAL(19,2) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItWarranties_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItWarranties_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedBy] NVARCHAR(120) NULL
);

IF OBJECT_ID(N'[it].[ProcurementOrders]', N'U') IS NULL
CREATE TABLE [it].[ProcurementOrders] (
  [OrderId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ItProcurementOrders] PRIMARY KEY,
  [OrderNumber] NVARCHAR(40) NOT NULL,
  [Title] NVARCHAR(200) NOT NULL,
  [VendorName] NVARCHAR(180) NULL,
  [Category] NVARCHAR(80) NULL,
  [Status] NVARCHAR(40) NOT NULL,
  [OrderDate] DATE NULL,
  [ExpectedDate] DATE NULL,
  [Amount] DECIMAL(19,2) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItProcurementOrders_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItProcurementOrders_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NULL,
  CONSTRAINT [UQ_ItProcurementOrders_OrderNumber] UNIQUE ([OrderNumber])
);

IF OBJECT_ID(N'[it].[AssetAuditLog]', N'U') IS NULL
CREATE TABLE [it].[AssetAuditLog] (
  [AuditId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ItAssetAuditLog] PRIMARY KEY,
  [EntityType] NVARCHAR(40) NOT NULL,
  [EntityId] NVARCHAR(40) NOT NULL,
  [Action] NVARCHAR(80) NOT NULL,
  [Actor] NVARCHAR(120) NULL,
  [Details] NVARCHAR(MAX) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItAssetAuditLog_CreatedAt] DEFAULT SYSUTCDATETIME()
);

IF COL_LENGTH(N'it.Assets', N'SubCategory') IS NULL
  ALTER TABLE [it].[Assets] ADD [SubCategory] NVARCHAR(60) NULL;

IF COL_LENGTH(N'it.Assets', N'Manufacturer') IS NULL
  ALTER TABLE [it].[Assets] ADD [Manufacturer] NVARCHAR(120) NULL;
IF COL_LENGTH(N'it.Assets', N'Model') IS NULL
  ALTER TABLE [it].[Assets] ADD [Model] NVARCHAR(200) NULL;
IF COL_LENGTH(N'it.Assets', N'AssignedEmail') IS NULL
  ALTER TABLE [it].[Assets] ADD [AssignedEmail] NVARCHAR(180) NULL;
IF COL_LENGTH(N'it.Assets', N'AssetCondition') IS NULL
  ALTER TABLE [it].[Assets] ADD [AssetCondition] NVARCHAR(40) NULL;
IF COL_LENGTH(N'it.Assets', N'OperatingSystem') IS NULL
  ALTER TABLE [it].[Assets] ADD [OperatingSystem] NVARCHAR(80) NULL;
IF COL_LENGTH(N'it.Assets', N'PmStatus') IS NULL
  ALTER TABLE [it].[Assets] ADD [PmStatus] NVARCHAR(40) NULL;
IF COL_LENGTH(N'it.Assets', N'NextPmDue') IS NULL
  ALTER TABLE [it].[Assets] ADD [NextPmDue] DATE NULL;
IF COL_LENGTH(N'it.Assets', N'LastMaintenanceDate') IS NULL
  ALTER TABLE [it].[Assets] ADD [LastMaintenanceDate] DATE NULL;
IF COL_LENGTH(N'it.Assets', N'NextMaintenanceDate') IS NULL
  ALTER TABLE [it].[Assets] ADD [NextMaintenanceDate] DATE NULL;
IF COL_LENGTH(N'it.Assets', N'RegisterStatus') IS NULL
  ALTER TABLE [it].[Assets] ADD [RegisterStatus] NVARCHAR(40) NULL;
IF COL_LENGTH(N'it.Assets', N'Processor') IS NULL
  ALTER TABLE [it].[Assets] ADD [Processor] NVARCHAR(120) NULL;
IF COL_LENGTH(N'it.Assets', N'RamGb') IS NULL
  ALTER TABLE [it].[Assets] ADD [RamGb] INT NULL;
IF COL_LENGTH(N'it.Assets', N'StorageSpec') IS NULL
  ALTER TABLE [it].[Assets] ADD [StorageSpec] NVARCHAR(120) NULL;
IF COL_LENGTH(N'it.Assets', N'SourceAssetId') IS NULL
  ALTER TABLE [it].[Assets] ADD [SourceAssetId] NVARCHAR(40) NULL;

IF OBJECT_ID(N'[it].[SoftwareCatalog]', N'U') IS NULL
CREATE TABLE [it].[SoftwareCatalog] (
  [CatalogId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ItSoftwareCatalog] PRIMARY KEY,
  [ProductName] NVARCHAR(200) NOT NULL,
  [VendorName] NVARCHAR(180) NULL,
  [Category] NVARCHAR(80) NULL,
  [Edition] NVARCHAR(120) NULL,
  [Status] NVARCHAR(40) NOT NULL,
  [AnnualCost] DECIMAL(19,2) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItSoftwareCatalog_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItSoftwareCatalog_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedBy] NVARCHAR(120) NULL
);

IF OBJECT_ID(N'[it].[InstalledSoftware]', N'U') IS NULL
CREATE TABLE [it].[InstalledSoftware] (
  [InstallId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ItInstalledSoftware] PRIMARY KEY,
  [ProductName] NVARCHAR(200) NOT NULL,
  [Version] NVARCHAR(80) NULL,
  [AssetId] NVARCHAR(40) NULL,
  [AssetTag] NVARCHAR(40) NULL,
  [InstalledOn] NVARCHAR(220) NULL,
  [Status] NVARCHAR(40) NOT NULL,
  [LastSeenAt] DATE NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItInstalledSoftware_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItInstalledSoftware_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedBy] NVARCHAR(120) NULL
);

IF OBJECT_ID(N'[it].[SoftwareRequests]', N'U') IS NULL
CREATE TABLE [it].[SoftwareRequests] (
  [RequestId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ItSoftwareRequests] PRIMARY KEY,
  [Title] NVARCHAR(200) NOT NULL,
  [RequesterName] NVARCHAR(220) NOT NULL,
  [Department] NVARCHAR(180) NULL,
  [Priority] NVARCHAR(20) NOT NULL,
  [Status] NVARCHAR(40) NOT NULL,
  [RequestedOn] DATE NULL,
  [Notes] NVARCHAR(MAX) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItSoftwareRequests_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItSoftwareRequests_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NULL
);
`;
