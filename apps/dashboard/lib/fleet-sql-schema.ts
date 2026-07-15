/** Idempotent DDL for Logistics & Fleet in DLE_Enterprise. */
export const ensureFleetSchemaSql = `
IF SCHEMA_ID(N'fleet') IS NULL EXEC(N'CREATE SCHEMA [fleet]');

IF OBJECT_ID(N'[fleet].[Vehicles]', N'U') IS NULL
CREATE TABLE [fleet].[Vehicles] (
  [VehicleId] NVARCHAR(60) NOT NULL CONSTRAINT [PK_FleetVehicles] PRIMARY KEY,
  [AssetCode] NVARCHAR(60) NOT NULL,
  [PlateNumber] NVARCHAR(40) NOT NULL,
  [VehicleType] NVARCHAR(80) NOT NULL,
  [MakeModel] NVARCHAR(160) NOT NULL,
  [Year] INT NOT NULL CONSTRAINT [DF_FleetVehicles_Year] DEFAULT YEAR(SYSUTCDATETIME()),
  [Department] NVARCHAR(180) NULL,
  [Location] NVARCHAR(180) NULL,
  [Custodian] NVARCHAR(220) NULL,
  [Status] NVARCHAR(40) NOT NULL,
  [OdometerKm] INT NOT NULL CONSTRAINT [DF_FleetVehicles_Odometer] DEFAULT 0,
  [NextServiceKm] INT NOT NULL CONSTRAINT [DF_FleetVehicles_NextService] DEFAULT 0,
  [InsuranceExpiry] DATETIME2(0) NULL,
  [RoadWorthinessExpiry] DATETIME2(0) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FleetVehicles_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FleetVehicles_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [IsActive] BIT NOT NULL CONSTRAINT [DF_FleetVehicles_IsActive] DEFAULT 1,
  CONSTRAINT [UQ_FleetVehicles_AssetCode] UNIQUE ([AssetCode]),
  CONSTRAINT [UQ_FleetVehicles_PlateNumber] UNIQUE ([PlateNumber])
);

IF COL_LENGTH(N'fleet.Vehicles', N'OwnershipType') IS NULL
  ALTER TABLE [fleet].[Vehicles] ADD [OwnershipType] NVARCHAR(40) NULL;
IF COL_LENGTH(N'fleet.Vehicles', N'AcquisitionCost') IS NULL
  ALTER TABLE [fleet].[Vehicles] ADD [AcquisitionCost] DECIMAL(19,2) NULL;
IF COL_LENGTH(N'fleet.Vehicles', N'Supplier') IS NULL
  ALTER TABLE [fleet].[Vehicles] ADD [Supplier] NVARCHAR(180) NULL;
IF COL_LENGTH(N'fleet.Vehicles', N'PurchaseDate') IS NULL
  ALTER TABLE [fleet].[Vehicles] ADD [PurchaseDate] DATETIME2(0) NULL;
IF COL_LENGTH(N'fleet.Vehicles', N'WarrantyExpiry') IS NULL
  ALTER TABLE [fleet].[Vehicles] ADD [WarrantyExpiry] DATETIME2(0) NULL;
IF COL_LENGTH(N'fleet.Vehicles', N'FinancingNotes') IS NULL
  ALTER TABLE [fleet].[Vehicles] ADD [FinancingNotes] NVARCHAR(MAX) NULL;
IF COL_LENGTH(N'fleet.Vehicles', N'DepreciationMethod') IS NULL
  ALTER TABLE [fleet].[Vehicles] ADD [DepreciationMethod] NVARCHAR(80) NULL;
IF COL_LENGTH(N'fleet.Vehicles', N'DisposalDate') IS NULL
  ALTER TABLE [fleet].[Vehicles] ADD [DisposalDate] DATETIME2(0) NULL;
IF COL_LENGTH(N'fleet.Vehicles', N'ChassisNumber') IS NULL
  ALTER TABLE [fleet].[Vehicles] ADD [ChassisNumber] NVARCHAR(80) NULL;
IF COL_LENGTH(N'fleet.Vehicles', N'EngineNumber') IS NULL
  ALTER TABLE [fleet].[Vehicles] ADD [EngineNumber] NVARCHAR(80) NULL;
IF COL_LENGTH(N'fleet.Vehicles', N'FuelType') IS NULL
  ALTER TABLE [fleet].[Vehicles] ADD [FuelType] NVARCHAR(40) NULL;
IF COL_LENGTH(N'fleet.Vehicles', N'CostCenter') IS NULL
  ALTER TABLE [fleet].[Vehicles] ADD [CostCenter] NVARCHAR(80) NULL;
IF COL_LENGTH(N'fleet.Vehicles', N'ProjectCode') IS NULL
  ALTER TABLE [fleet].[Vehicles] ADD [ProjectCode] NVARCHAR(80) NULL;

IF OBJECT_ID(N'[fleet].[Drivers]', N'U') IS NULL
CREATE TABLE [fleet].[Drivers] (
  [DriverId] NVARCHAR(60) NOT NULL CONSTRAINT [PK_FleetDrivers] PRIMARY KEY,
  [EmployeeCode] NVARCHAR(40) NOT NULL,
  [LicenseNumber] NVARCHAR(80) NOT NULL,
  [LicenseClass] NVARCHAR(40) NULL,
  [LicenseExpiry] DATETIME2(0) NULL,
  [IssuingAuthority] NVARCHAR(160) NULL,
  [MedicalCertificateStatus] NVARCHAR(40) NOT NULL CONSTRAINT [DF_FleetDrivers_Medical] DEFAULT N'Missing',
  [DefensiveDrivingCertificate] NVARCHAR(40) NOT NULL CONSTRAINT [DF_FleetDrivers_Defensive] DEFAULT N'Missing',
  [DriverCategory] NVARCHAR(60) NOT NULL CONSTRAINT [DF_FleetDrivers_Category] DEFAULT N'Company Driver',
  [AvailabilityStatus] NVARCHAR(40) NOT NULL CONSTRAINT [DF_FleetDrivers_Avail] DEFAULT N'Available',
  [AssignedVehicleId] NVARCHAR(60) NULL,
  [Status] NVARCHAR(60) NOT NULL,
  [ComplianceStatus] NVARCHAR(60) NOT NULL CONSTRAINT [DF_FleetDrivers_Compliance] DEFAULT N'Missing Documents',
  [SafetyScore] INT NOT NULL CONSTRAINT [DF_FleetDrivers_Safety] DEFAULT 90,
  [RegisteredAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FleetDrivers_RegisteredAt] DEFAULT SYSUTCDATETIME(),
  [ApprovalStatus] NVARCHAR(40) NOT NULL CONSTRAINT [DF_FleetDrivers_Approval] DEFAULT N'Submitted',
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FleetDrivers_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FleetDrivers_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [IsActive] BIT NOT NULL CONSTRAINT [DF_FleetDrivers_IsActive] DEFAULT 1
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FleetDrivers_EmployeeCode' AND object_id = OBJECT_ID(N'[fleet].[Drivers]'))
  CREATE INDEX [IX_FleetDrivers_EmployeeCode] ON [fleet].[Drivers] ([EmployeeCode]);

IF OBJECT_ID(N'[fleet].[Trips]', N'U') IS NULL
CREATE TABLE [fleet].[Trips] (
  [TripId] NVARCHAR(60) NOT NULL CONSTRAINT [PK_FleetTrips] PRIMARY KEY,
  [RequestNo] NVARCHAR(60) NOT NULL,
  [VehicleId] NVARCHAR(60) NULL,
  [DriverId] NVARCHAR(80) NULL,
  [Requester] NVARCHAR(220) NOT NULL,
  [RequesterDepartment] NVARCHAR(180) NULL,
  [RequesterLocation] NVARCHAR(180) NULL,
  [Origin] NVARCHAR(200) NOT NULL,
  [Destination] NVARCHAR(200) NOT NULL,
  [Purpose] NVARCHAR(500) NULL,
  [StartDate] DATETIME2(0) NULL,
  [EndDate] DATETIME2(0) NULL,
  [ProjectCode] NVARCHAR(80) NULL,
  [CostCenter] NVARCHAR(80) NULL,
  [Status] NVARCHAR(40) NOT NULL,
  [ApprovedBy] NVARCHAR(160) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FleetTrips_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FleetTrips_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  CONSTRAINT [UQ_FleetTrips_RequestNo] UNIQUE ([RequestNo])
);

IF COL_LENGTH(N'fleet.Trips', N'RequesterEmployeeCode') IS NULL
  ALTER TABLE [fleet].[Trips] ADD [RequesterEmployeeCode] NVARCHAR(40) NULL;
IF COL_LENGTH(N'fleet.Trips', N'LineManagerEmployeeCode') IS NULL
  ALTER TABLE [fleet].[Trips] ADD [LineManagerEmployeeCode] NVARCHAR(40) NULL;
IF COL_LENGTH(N'fleet.Trips', N'LineManagerName') IS NULL
  ALTER TABLE [fleet].[Trips] ADD [LineManagerName] NVARCHAR(220) NULL;
IF COL_LENGTH(N'fleet.Trips', N'LineApprovedBy') IS NULL
  ALTER TABLE [fleet].[Trips] ADD [LineApprovedBy] NVARCHAR(160) NULL;
IF COL_LENGTH(N'fleet.Trips', N'LineApprovedAt') IS NULL
  ALTER TABLE [fleet].[Trips] ADD [LineApprovedAt] DATETIME2(0) NULL;
IF COL_LENGTH(N'fleet.Trips', N'LineRejectReason') IS NULL
  ALTER TABLE [fleet].[Trips] ADD [LineRejectReason] NVARCHAR(500) NULL;
IF COL_LENGTH(N'fleet.Trips', N'AllocatedBy') IS NULL
  ALTER TABLE [fleet].[Trips] ADD [AllocatedBy] NVARCHAR(160) NULL;
IF COL_LENGTH(N'fleet.Trips', N'AllocatedAt') IS NULL
  ALTER TABLE [fleet].[Trips] ADD [AllocatedAt] DATETIME2(0) NULL;
IF COL_LENGTH(N'fleet.Trips', N'DispatchedBy') IS NULL
  ALTER TABLE [fleet].[Trips] ADD [DispatchedBy] NVARCHAR(160) NULL;
IF COL_LENGTH(N'fleet.Trips', N'DispatchedAt') IS NULL
  ALTER TABLE [fleet].[Trips] ADD [DispatchedAt] DATETIME2(0) NULL;
IF COL_LENGTH(N'fleet.Trips', N'CompletedBy') IS NULL
  ALTER TABLE [fleet].[Trips] ADD [CompletedBy] NVARCHAR(160) NULL;
IF COL_LENGTH(N'fleet.Trips', N'CompletedAt') IS NULL
  ALTER TABLE [fleet].[Trips] ADD [CompletedAt] DATETIME2(0) NULL;
IF COL_LENGTH(N'fleet.Trips', N'CancelReason') IS NULL
  ALTER TABLE [fleet].[Trips] ADD [CancelReason] NVARCHAR(500) NULL;
IF COL_LENGTH(N'fleet.Trips', N'ReturnReason') IS NULL
  ALTER TABLE [fleet].[Trips] ADD [ReturnReason] NVARCHAR(500) NULL;

IF OBJECT_ID(N'[fleet].[Maintenance]', N'U') IS NULL
CREATE TABLE [fleet].[Maintenance] (
  [MaintenanceId] NVARCHAR(60) NOT NULL CONSTRAINT [PK_FleetMaintenance] PRIMARY KEY,
  [VehicleId] NVARCHAR(60) NOT NULL,
  [MaintenanceType] NVARCHAR(120) NOT NULL,
  [Vendor] NVARCHAR(180) NULL,
  [ScheduledDate] DATETIME2(0) NULL,
  [CompletedDate] DATETIME2(0) NULL,
  [Cost] DECIMAL(19,2) NOT NULL CONSTRAINT [DF_FleetMaintenance_Cost] DEFAULT 0,
  [Status] NVARCHAR(40) NOT NULL,
  [Notes] NVARCHAR(MAX) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FleetMaintenance_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FleetMaintenance_UpdatedAt] DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID(N'[fleet].[Fuel]', N'U') IS NULL
CREATE TABLE [fleet].[Fuel] (
  [FuelId] NVARCHAR(60) NOT NULL CONSTRAINT [PK_FleetFuel] PRIMARY KEY,
  [VehicleId] NVARCHAR(60) NOT NULL,
  [DriverId] NVARCHAR(80) NULL,
  [FuelDate] DATETIME2(0) NOT NULL,
  [Litres] DECIMAL(12,2) NOT NULL CONSTRAINT [DF_FleetFuel_Litres] DEFAULT 0,
  [Amount] DECIMAL(19,2) NOT NULL CONSTRAINT [DF_FleetFuel_Amount] DEFAULT 0,
  [OdometerKm] INT NOT NULL CONSTRAINT [DF_FleetFuel_Odometer] DEFAULT 0,
  [Station] NVARCHAR(180) NULL,
  [ProjectCode] NVARCHAR(80) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FleetFuel_CreatedAt] DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID(N'[fleet].[Compliance]', N'U') IS NULL
CREATE TABLE [fleet].[Compliance] (
  [ComplianceId] NVARCHAR(60) NOT NULL CONSTRAINT [PK_FleetCompliance] PRIMARY KEY,
  [VehicleId] NVARCHAR(60) NULL,
  [DriverId] NVARCHAR(80) NULL,
  [DocumentType] NVARCHAR(120) NOT NULL,
  [Reference] NVARCHAR(120) NOT NULL,
  [IssueDate] DATETIME2(0) NULL,
  [ExpiryDate] DATETIME2(0) NULL,
  [Status] NVARCHAR(40) NOT NULL,
  [VerifiedBy] NVARCHAR(160) NULL,
  [VerifiedAt] DATETIME2(0) NULL,
  [RejectionReason] NVARCHAR(500) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FleetCompliance_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FleetCompliance_UpdatedAt] DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID(N'[fleet].[Assignments]', N'U') IS NULL
CREATE TABLE [fleet].[Assignments] (
  [AssignmentId] NVARCHAR(60) NOT NULL CONSTRAINT [PK_FleetAssignments] PRIMARY KEY,
  [DriverId] NVARCHAR(60) NOT NULL,
  [VehicleId] NVARCHAR(60) NOT NULL,
  [Action] NVARCHAR(40) NOT NULL,
  [EffectiveDate] DATETIME2(0) NOT NULL,
  [EndedAt] DATETIME2(0) NULL,
  [Reason] NVARCHAR(500) NULL,
  [PerformedBy] NVARCHAR(160) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FleetAssignments_CreatedAt] DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID(N'[fleet].[Requests]', N'U') IS NULL
CREATE TABLE [fleet].[Requests] (
  [RequestId] NVARCHAR(60) NOT NULL CONSTRAINT [PK_FleetRequests] PRIMARY KEY,
  [RequestType] NVARCHAR(120) NOT NULL,
  [Requester] NVARCHAR(220) NOT NULL,
  [Department] NVARCHAR(180) NULL,
  [Details] NVARCHAR(MAX) NULL,
  [Priority] NVARCHAR(20) NOT NULL CONSTRAINT [DF_FleetRequests_Priority] DEFAULT N'Normal',
  [Status] NVARCHAR(40) NOT NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FleetRequests_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FleetRequests_UpdatedAt] DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID(N'[fleet].[AuditTrail]', N'U') IS NULL
CREATE TABLE [fleet].[AuditTrail] (
  [AuditId] NVARCHAR(60) NOT NULL CONSTRAINT [PK_FleetAuditTrail] PRIMARY KEY,
  [At] DATETIME2(0) NOT NULL CONSTRAINT [DF_FleetAuditTrail_At] DEFAULT SYSUTCDATETIME(),
  [Actor] NVARCHAR(160) NULL,
  [Action] NVARCHAR(160) NOT NULL,
  [Entity] NVARCHAR(120) NOT NULL,
  [Details] NVARCHAR(MAX) NULL
);

IF OBJECT_ID(N'[fleet].[Incidents]', N'U') IS NULL
CREATE TABLE [fleet].[Incidents] (
  [IncidentId] NVARCHAR(60) NOT NULL CONSTRAINT [PK_FleetIncidents] PRIMARY KEY,
  [Reference] NVARCHAR(80) NOT NULL,
  [VehicleId] NVARCHAR(60) NULL,
  [DriverId] NVARCHAR(80) NULL,
  [IncidentType] NVARCHAR(120) NOT NULL,
  [Severity] NVARCHAR(40) NOT NULL,
  [OccurredAt] DATETIME2(0) NOT NULL,
  [Location] NVARCHAR(200) NULL,
  [Description] NVARCHAR(MAX) NULL,
  [ClaimStatus] NVARCHAR(40) NOT NULL CONSTRAINT [DF_FleetIncidents_Claim] DEFAULT N'Open',
  [Status] NVARCHAR(40) NOT NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FleetIncidents_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FleetIncidents_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  CONSTRAINT [UQ_FleetIncidents_Reference] UNIQUE ([Reference])
);

IF OBJECT_ID(N'[fleet].[Vendors]', N'U') IS NULL
CREATE TABLE [fleet].[Vendors] (
  [VendorId] NVARCHAR(60) NOT NULL CONSTRAINT [PK_FleetVendors] PRIMARY KEY,
  [Name] NVARCHAR(200) NOT NULL,
  [Category] NVARCHAR(80) NULL,
  [ContactName] NVARCHAR(180) NULL,
  [Email] NVARCHAR(180) NULL,
  [Phone] NVARCHAR(60) NULL,
  [Location] NVARCHAR(180) NULL,
  [Status] NVARCHAR(40) NOT NULL,
  [Rating] DECIMAL(4,2) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FleetVendors_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FleetVendors_UpdatedAt] DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID(N'[fleet].[Contracts]', N'U') IS NULL
CREATE TABLE [fleet].[Contracts] (
  [ContractId] NVARCHAR(60) NOT NULL CONSTRAINT [PK_FleetContracts] PRIMARY KEY,
  [VendorId] NVARCHAR(60) NULL,
  [Title] NVARCHAR(200) NOT NULL,
  [ContractType] NVARCHAR(80) NULL,
  [StartDate] DATETIME2(0) NULL,
  [EndDate] DATETIME2(0) NULL,
  [Value] DECIMAL(19,2) NULL,
  [Status] NVARCHAR(40) NOT NULL,
  [Notes] NVARCHAR(MAX) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FleetContracts_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FleetContracts_UpdatedAt] DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID(N'[fleet].[TelematicsEvents]', N'U') IS NULL
CREATE TABLE [fleet].[TelematicsEvents] (
  [EventId] NVARCHAR(60) NOT NULL CONSTRAINT [PK_FleetTelematics] PRIMARY KEY,
  [VehicleId] NVARCHAR(60) NOT NULL,
  [EventType] NVARCHAR(80) NOT NULL,
  [Severity] NVARCHAR(40) NOT NULL CONSTRAINT [DF_FleetTelematics_Severity] DEFAULT N'Info',
  [OccurredAt] DATETIME2(0) NOT NULL,
  [Latitude] DECIMAL(10,6) NULL,
  [Longitude] DECIMAL(10,6) NULL,
  [SpeedKph] DECIMAL(8,2) NULL,
  [Details] NVARCHAR(MAX) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FleetTelematics_CreatedAt] DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID(N'[fleet].[CostEntries]', N'U') IS NULL
CREATE TABLE [fleet].[CostEntries] (
  [CostId] NVARCHAR(60) NOT NULL CONSTRAINT [PK_FleetCostEntries] PRIMARY KEY,
  [VehicleId] NVARCHAR(60) NULL,
  [Category] NVARCHAR(80) NOT NULL,
  [CostDate] DATETIME2(0) NOT NULL,
  [Amount] DECIMAL(19,2) NOT NULL,
  [CostCenter] NVARCHAR(80) NULL,
  [ProjectCode] NVARCHAR(80) NULL,
  [Notes] NVARCHAR(MAX) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FleetCostEntries_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(160) NULL
);

IF OBJECT_ID(N'[fleet].[Bootstrap]', N'U') IS NULL
CREATE TABLE [fleet].[Bootstrap] (
  [BootstrapKey] NVARCHAR(80) NOT NULL CONSTRAINT [PK_FleetBootstrap] PRIMARY KEY,
  [CompletedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FleetBootstrap_CompletedAt] DEFAULT SYSUTCDATETIME(),
  [Details] NVARCHAR(500) NULL
);
`;
