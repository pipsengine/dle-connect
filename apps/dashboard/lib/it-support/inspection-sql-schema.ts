/** Idempotent SQL Server DDL for IT inspection management. Target: DLE_Enterprise. */
export const ensureInspectionSchemaSql = `
IF SCHEMA_ID(N'it') IS NULL EXEC(N'CREATE SCHEMA [it]');

IF OBJECT_ID(N'[it].[InspectionSchedules]', N'U') IS NULL
CREATE TABLE [it].[InspectionSchedules] (
  [ScheduleId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ItInspectionSchedules] PRIMARY KEY,
  [Title] NVARCHAR(300) NOT NULL,
  [InspectionType] NVARCHAR(80) NOT NULL,
  [Location] NVARCHAR(180) NULL,
  [Department] NVARCHAR(180) NULL,
  [Frequency] NVARCHAR(40) NOT NULL,
  [NextDueDate] DATE NULL,
  [OwnerName] NVARCHAR(220) NULL,
  [Status] NVARCHAR(40) NOT NULL,
  [Notes] NVARCHAR(MAX) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItInspSched_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItInspSched_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NULL,
  [UpdatedBy] NVARCHAR(120) NULL
);

IF OBJECT_ID(N'[it].[Inspections]', N'U') IS NULL
CREATE TABLE [it].[Inspections] (
  [InspectionId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ItInspections] PRIMARY KEY,
  [ScheduleId] NVARCHAR(40) NULL,
  [Title] NVARCHAR(300) NOT NULL,
  [InspectionType] NVARCHAR(80) NOT NULL,
  [Location] NVARCHAR(180) NULL,
  [Department] NVARCHAR(180) NULL,
  [InspectorName] NVARCHAR(220) NULL,
  [ScheduledDate] DATE NULL,
  [CompletedDate] DATE NULL,
  [Status] NVARCHAR(40) NOT NULL,
  [Result] NVARCHAR(40) NULL,
  [Notes] NVARCHAR(MAX) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItInsp_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItInsp_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NULL,
  [UpdatedBy] NVARCHAR(120) NULL
);

IF OBJECT_ID(N'[it].[InspectionFindings]', N'U') IS NULL
CREATE TABLE [it].[InspectionFindings] (
  [FindingId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ItInspectionFindings] PRIMARY KEY,
  [InspectionId] NVARCHAR(40) NOT NULL,
  [Title] NVARCHAR(300) NOT NULL,
  [Severity] NVARCHAR(40) NOT NULL,
  [Status] NVARCHAR(40) NOT NULL,
  [OwnerName] NVARCHAR(220) NULL,
  [DueDate] DATE NULL,
  [Description] NVARCHAR(MAX) NULL,
  [Resolution] NVARCHAR(MAX) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItInspFind_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItInspFind_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NULL,
  [UpdatedBy] NVARCHAR(120) NULL
);

BEGIN TRY
  IF NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE name = N'IX_ItInspections_Status' AND object_id = OBJECT_ID(N'[it].[Inspections]')
  )
    EXEC(N'CREATE INDEX [IX_ItInspections_Status] ON [it].[Inspections]([Status], [UpdatedAt] DESC)');
END TRY BEGIN CATCH END CATCH;

IF COL_LENGTH(N'[it].[Inspections]', N'ChecklistJson') IS NULL
  ALTER TABLE [it].[Inspections] ADD [ChecklistJson] NVARCHAR(MAX) NULL;
IF COL_LENGTH(N'[it].[Inspections]', N'LocationId') IS NULL
  ALTER TABLE [it].[Inspections] ADD [LocationId] NVARCHAR(40) NULL;
IF COL_LENGTH(N'[it].[Inspections]', N'VisitType') IS NULL
  ALTER TABLE [it].[Inspections] ADD [VisitType] NVARCHAR(40) NULL;

IF OBJECT_ID(N'[it].[InspectionLocations]', N'U') IS NULL
CREATE TABLE [it].[InspectionLocations] (
  [LocationId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ItInspectionLocations] PRIMARY KEY,
  [Name] NVARCHAR(180) NOT NULL,
  [Frequency] NVARCHAR(40) NOT NULL,
  [LastInspectionDate] DATE NULL,
  [NextInspectionDate] DATE NULL,
  [ChecklistJson] NVARCHAR(MAX) NOT NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItInspLoc_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItInspLoc_UpdatedAt] DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID(N'[it].[InspectionActions]', N'U') IS NULL
CREATE TABLE [it].[InspectionActions] (
  [ActionId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ItInspectionActions] PRIMARY KEY,
  [InspectionId] NVARCHAR(40) NOT NULL,
  [Description] NVARCHAR(MAX) NOT NULL,
  [AssignedTo] NVARCHAR(220) NULL,
  [Priority] NVARCHAR(40) NOT NULL,
  [Status] NVARCHAR(40) NOT NULL,
  [DueDate] DATE NULL,
  [ClosureDate] DATE NULL,
  [VerificationComments] NVARCHAR(MAX) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItInspAct_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItInspAct_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NULL,
  [UpdatedBy] NVARCHAR(120) NULL
);

IF OBJECT_ID(N'[it].[HazidReports]', N'U') IS NULL
CREATE TABLE [it].[HazidReports] (
  [ReportId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ItHazidReports] PRIMARY KEY,
  [ReportDate] DATE NULL,
  [Reporter] NVARCHAR(220) NULL,
  [Category] NVARCHAR(80) NOT NULL,
  [Description] NVARCHAR(MAX) NOT NULL,
  [RiskLevel] NVARCHAR(40) NOT NULL,
  [CorrectiveAction] NVARCHAR(MAX) NULL,
  [Status] NVARCHAR(40) NOT NULL,
  [Location] NVARCHAR(180) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItHazid_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItHazid_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NULL,
  [UpdatedBy] NVARCHAR(120) NULL
);

IF OBJECT_ID(N'[it].[BbsObservations]', N'U') IS NULL
CREATE TABLE [it].[BbsObservations] (
  [ObservationId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ItBbsObservations] PRIMARY KEY,
  [Observer] NVARCHAR(220) NULL,
  [ObservationDate] DATE NULL,
  [SafeBehaviour] NVARCHAR(MAX) NULL,
  [UnsafeBehaviour] NVARCHAR(MAX) NULL,
  [Comments] NVARCHAR(MAX) NULL,
  [RecommendedAction] NVARCHAR(MAX) NULL,
  [Status] NVARCHAR(40) NOT NULL,
  [Department] NVARCHAR(180) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItBbs_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItBbs_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NULL,
  [UpdatedBy] NVARCHAR(120) NULL
);

IF OBJECT_ID(N'[it].[EmergencyDrills]', N'U') IS NULL
CREATE TABLE [it].[EmergencyDrills] (
  [DrillId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ItEmergencyDrills] PRIMARY KEY,
  [DrillDate] DATE NULL,
  [DrillType] NVARCHAR(80) NOT NULL,
  [Participants] INT NOT NULL CONSTRAINT [DF_ItDrill_Participants] DEFAULT 0,
  [AssignedPersonnel] INT NOT NULL CONSTRAINT [DF_ItDrill_Assigned] DEFAULT 0,
  [Outcome] NVARCHAR(MAX) NULL,
  [Findings] NVARCHAR(MAX) NULL,
  [CorrectiveActions] NVARCHAR(MAX) NULL,
  [DurationMinutes] INT NOT NULL CONSTRAINT [DF_ItDrill_Duration] DEFAULT 0,
  [Location] NVARCHAR(180) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItDrill_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItDrill_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NULL,
  [UpdatedBy] NVARCHAR(120) NULL
);

IF OBJECT_ID(N'[it].[EWasteRecords]', N'U') IS NULL
CREATE TABLE [it].[EWasteRecords] (
  [RecordId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ItEWasteRecords] PRIMARY KEY,
  [AssetTag] NVARCHAR(80) NOT NULL,
  [SerialNumber] NVARCHAR(80) NULL,
  [AssetDescription] NVARCHAR(300) NOT NULL,
  [AssetType] NVARCHAR(80) NOT NULL,
  [Location] NVARCHAR(180) NULL,
  [DisposalReason] NVARCHAR(300) NULL,
  [DisposalDate] DATE NULL,
  [ApprovalStatus] NVARCHAR(40) NOT NULL,
  [Vendor] NVARCHAR(220) NULL,
  [CertificateNumber] NVARCHAR(120) NULL,
  [WorkflowStep] INT NOT NULL CONSTRAINT [DF_ItEWaste_Step] DEFAULT 1,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItEWaste_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItEWaste_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NULL,
  [UpdatedBy] NVARCHAR(120) NULL
);
`;
