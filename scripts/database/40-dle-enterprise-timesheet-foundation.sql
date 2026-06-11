USE [DLE_Enterprise];
GO

IF SCHEMA_ID(N'hris') IS NULL
  EXEC(N'CREATE SCHEMA [hris]');
GO

IF OBJECT_ID(N'[hris].[TimesheetProjects]', N'U') IS NULL
CREATE TABLE [hris].[TimesheetProjects] (
  [Id] NVARCHAR(80) NOT NULL CONSTRAINT [PK_TimesheetProjects] PRIMARY KEY,
  [Code] NVARCHAR(50) NOT NULL CONSTRAINT [UQ_TimesheetProjects_Code] UNIQUE,
  [Name] NVARCHAR(255) NOT NULL,
  [Site] NVARCHAR(160) NOT NULL,
  [ProjectManager] NVARCHAR(220) NULL,
  [Status] NVARCHAR(40) NOT NULL CONSTRAINT [DF_TimesheetProjects_Status] DEFAULT N'Active',
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TimesheetProjects_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TimesheetProjects_UpdatedAt] DEFAULT SYSUTCDATETIME()
);
GO

IF COL_LENGTH(N'hris.TimesheetProjects', N'ProjectManager') IS NULL
ALTER TABLE [hris].[TimesheetProjects] ADD [ProjectManager] NVARCHAR(220) NULL;
GO

IF OBJECT_ID(N'[hris].[TimesheetProjectTasks]', N'U') IS NULL
CREATE TABLE [hris].[TimesheetProjectTasks] (
  [Id] NVARCHAR(80) NOT NULL CONSTRAINT [PK_TimesheetProjectTasks] PRIMARY KEY,
  [ProjectId] NVARCHAR(80) NOT NULL,
  [Name] NVARCHAR(255) NOT NULL,
  [ActivityId] NVARCHAR(80) NULL,
  [ActivityName] NVARCHAR(255) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TimesheetProjectTasks_CreatedAt] DEFAULT SYSUTCDATETIME(),
  CONSTRAINT [FK_TimesheetProjectTasks_Project] FOREIGN KEY ([ProjectId]) REFERENCES [hris].[TimesheetProjects]([Id]) ON DELETE CASCADE
);
GO

IF OBJECT_ID(N'[hris].[TimesheetDepartments]', N'U') IS NULL
CREATE TABLE [hris].[TimesheetDepartments] (
  [Id] NVARCHAR(100) NOT NULL CONSTRAINT [PK_TimesheetDepartments] PRIMARY KEY,
  [Code] NVARCHAR(80) NOT NULL,
  [Name] NVARCHAR(180) NOT NULL,
  [SourceSystem] NVARCHAR(40) NOT NULL CONSTRAINT [DF_TimesheetDepartments_SourceSystem] DEFAULT N'Sage Payroll',
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TimesheetDepartments_UpdatedAt] DEFAULT SYSUTCDATETIME()
);
GO

IF OBJECT_ID(N'[hris].[TimesheetLocations]', N'U') IS NULL
CREATE TABLE [hris].[TimesheetLocations] (
  [Id] NVARCHAR(100) NOT NULL CONSTRAINT [PK_TimesheetLocations] PRIMARY KEY,
  [Code] NVARCHAR(80) NOT NULL,
  [Name] NVARCHAR(180) NOT NULL,
  [Site] NVARCHAR(180) NULL,
  [SourceSystem] NVARCHAR(40) NOT NULL CONSTRAINT [DF_TimesheetLocations_SourceSystem] DEFAULT N'Sage Payroll',
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TimesheetLocations_UpdatedAt] DEFAULT SYSUTCDATETIME()
);
GO

IF OBJECT_ID(N'[hris].[TimesheetWorkCenters]', N'U') IS NULL
CREATE TABLE [hris].[TimesheetWorkCenters] (
  [Id] NVARCHAR(100) NOT NULL CONSTRAINT [PK_TimesheetWorkCenters] PRIMARY KEY,
  [Code] NVARCHAR(80) NOT NULL CONSTRAINT [UQ_TimesheetWorkCenters_Code] UNIQUE,
  [Name] NVARCHAR(180) NOT NULL,
  [Location] NVARCHAR(180) NULL,
  [Site] NVARCHAR(180) NULL,
  [Status] NVARCHAR(20) NOT NULL CONSTRAINT [DF_TimesheetWorkCenters_Status] DEFAULT N'Active',
  [SourceSystem] NVARCHAR(40) NOT NULL CONSTRAINT [DF_TimesheetWorkCenters_SourceSystem] DEFAULT N'HRIS',
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TimesheetWorkCenters_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TimesheetWorkCenters_UpdatedAt] DEFAULT SYSUTCDATETIME()
);
GO

DECLARE @OfficialTimesheetWorkCenters TABLE ([Name] NVARCHAR(180) NOT NULL);
INSERT INTO @OfficialTimesheetWorkCenters ([Name])
VALUES
  (N'Material Preparation'),
  (N'Cutting'),
  (N'Fitting'),
  (N'Welding'),
  (N'Rigging'),
  (N'Machining'),
  (N'Rolling & Forming'),
  (N'Structural Assembly'),
  (N'Surface Preparation'),
  (N'Blasting'),
  (N'Painting'),
  (N'Galvanizing Preparation'),
  (N'Galvanizing'),
  (N'Galvanizing Finishing'),
  (N'QA/QC'),
  (N'NDT'),
  (N'Dimensional Control'),
  (N'Warehouse'),
  (N'Logistics'),
  (N'Loading & Offloading'),
  (N'Packing & Preservation'),
  (N'Mechanical Maintenance'),
  (N'Electrical Maintenance'),
  (N'Instrumentation'),
  (N'Utilities'),
  (N'Engineering Support'),
  (N'Planning & Production Control'),
  (N'Project Control'),
  (N'HSE'),
  (N'Security');

MERGE [hris].[TimesheetWorkCenters] AS target
USING (
  SELECT
    CONCAT(N'wc-', LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE([Name], N' & ', N'-'), N'/', N'-'), N' ', N'-'), N'--', N'-'), N'--', N'-'))) AS [Id],
    UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE([Name], N' & ', N'-'), N'/', N'-'), N' ', N'-'), N'--', N'-'), N'--', N'-')) AS [Code],
    [Name]
  FROM @OfficialTimesheetWorkCenters
) AS source
ON target.[Id] = source.[Id]
WHEN MATCHED THEN
  UPDATE SET [Code] = source.[Code], [Name] = source.[Name], [Location] = source.[Name], [Site] = source.[Name], [Status] = N'Active', [SourceSystem] = N'HRIS', [UpdatedAt] = SYSUTCDATETIME()
WHEN NOT MATCHED THEN
  INSERT ([Id], [Code], [Name], [Location], [Site], [Status], [SourceSystem])
  VALUES (source.[Id], source.[Code], source.[Name], source.[Name], source.[Name], N'Active', N'HRIS');

UPDATE [hris].[TimesheetWorkCenters]
SET [Status] = N'Inactive', [UpdatedAt] = SYSUTCDATETIME()
WHERE [SourceSystem] = N'Sage Payroll';
GO

IF OBJECT_ID(N'[hris].[TimesheetPeriods]', N'U') IS NULL
CREATE TABLE [hris].[TimesheetPeriods] (
  [Id] NVARCHAR(40) NOT NULL CONSTRAINT [PK_TimesheetPeriods] PRIMARY KEY,
  [Name] NVARCHAR(80) NOT NULL,
  [StartDate] DATE NOT NULL,
  [EndDate] DATE NOT NULL,
  [Status] NVARCHAR(20) NOT NULL,
  [OpenedAt] DATETIME2(0) NULL,
  [OpenedBy] NVARCHAR(120) NULL,
  [ClosedAt] DATETIME2(0) NULL,
  [ClosedBy] NVARCHAR(120) NULL,
  [UpdatedAt] DATETIME2(0) NULL,
  [UpdatedBy] NVARCHAR(120) NULL
);
GO

IF OBJECT_ID(N'[hris].[TimesheetHeaders]', N'U') IS NULL
CREATE TABLE [hris].[TimesheetHeaders] (
  [Id] NVARCHAR(160) NOT NULL CONSTRAINT [PK_TimesheetHeaders] PRIMARY KEY,
  [PeriodId] NVARCHAR(40) NOT NULL,
  [TimesheetDate] DATE NOT NULL,
  [SupervisorId] NVARCHAR(120) NOT NULL,
  [SupervisorName] NVARCHAR(180) NOT NULL,
  [WorkCenterId] NVARCHAR(100) NOT NULL,
  [WorkCenterName] NVARCHAR(180) NOT NULL,
  [Status] NVARCHAR(50) NOT NULL,
  [SubmittedAt] DATETIME2(0) NULL,
  [SubmittedBy] NVARCHAR(120) NULL,
  [ApprovedAt] DATETIME2(0) NULL,
  [ApprovedBy] NVARCHAR(120) NULL,
  [LastSyncAt] DATETIME2(0) NULL,
  [PayrollAcknowledgedAt] DATETIME2(0) NULL,
  [PayrollAcknowledgedBy] NVARCHAR(120) NULL
);
GO

IF COL_LENGTH(N'hris.TimesheetHeaders', N'ProjectManager') IS NULL
ALTER TABLE [hris].[TimesheetHeaders] ADD [ProjectManager] NVARCHAR(220) NULL;
GO

IF COL_LENGTH(N'hris.TimesheetHeaders', N'ProjectManagerProjectCode') IS NULL
ALTER TABLE [hris].[TimesheetHeaders] ADD [ProjectManagerProjectCode] NVARCHAR(50) NULL;
GO

IF COL_LENGTH(N'hris.TimesheetHeaders', N'CurrentApprovalStage') IS NULL
ALTER TABLE [hris].[TimesheetHeaders] ADD [CurrentApprovalStage] NVARCHAR(60) NULL;
GO

IF COL_LENGTH(N'hris.TimesheetHeaders', N'CurrentApprover') IS NULL
ALTER TABLE [hris].[TimesheetHeaders] ADD [CurrentApprover] NVARCHAR(220) NULL;
GO

IF OBJECT_ID(N'[hris].[TimesheetLines]', N'U') IS NULL
CREATE TABLE [hris].[TimesheetLines] (
  [Id] NVARCHAR(220) NOT NULL CONSTRAINT [PK_TimesheetLines] PRIMARY KEY,
  [HeaderId] NVARCHAR(160) NOT NULL,
  [EmployeeId] NVARCHAR(80) NOT NULL,
  [EmployeeNo] NVARCHAR(80) NOT NULL,
  [EmployeeName] NVARCHAR(220) NOT NULL,
  [BiometricId] NVARCHAR(120) NULL,
  [AttendanceId] NVARCHAR(120) NULL,
  [ClockIn] NVARCHAR(40) NULL,
  [ClockOut] NVARCHAR(40) NULL,
  [AttendanceDuration] DECIMAL(9,2) NOT NULL CONSTRAINT [DF_TimesheetLines_AttendanceDuration] DEFAULT 0,
  [UsedHours] DECIMAL(9,2) NOT NULL CONSTRAINT [DF_TimesheetLines_UsedHours] DEFAULT 0,
  [IdleHours] DECIMAL(9,2) NOT NULL CONSTRAINT [DF_TimesheetLines_IdleHours] DEFAULT 0,
  [TotalHours] DECIMAL(9,2) NOT NULL CONSTRAINT [DF_TimesheetLines_TotalHours] DEFAULT 0,
  [Variance] DECIMAL(9,2) NOT NULL CONSTRAINT [DF_TimesheetLines_Variance] DEFAULT 0,
  [Remarks] NVARCHAR(500) NULL,
  [ValidationStatus] NVARCHAR(30) NOT NULL,
  [ValidationMessage] NVARCHAR(500) NULL,
  CONSTRAINT [FK_TimesheetLines_Header] FOREIGN KEY ([HeaderId]) REFERENCES [hris].[TimesheetHeaders]([Id]) ON DELETE CASCADE
);
GO

IF OBJECT_ID(N'[hris].[TimesheetProjectAllocations]', N'U') IS NULL
CREATE TABLE [hris].[TimesheetProjectAllocations] (
  [Id] BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT [PK_TimesheetProjectAllocations] PRIMARY KEY,
  [LineId] NVARCHAR(220) NOT NULL,
  [ProjectId] NVARCHAR(80) NOT NULL,
  [ProjectCode] NVARCHAR(50) NOT NULL,
  [ProjectName] NVARCHAR(255) NOT NULL,
  [TaskId] NVARCHAR(80) NULL,
  [TaskName] NVARCHAR(255) NULL,
  [ActivityId] NVARCHAR(80) NULL,
  [Hours] DECIMAL(9,2) NOT NULL,
  [Remarks] NVARCHAR(500) NULL,
  CONSTRAINT [FK_TimesheetProjectAllocations_Line] FOREIGN KEY ([LineId]) REFERENCES [hris].[TimesheetLines]([Id]) ON DELETE CASCADE
);
GO

IF OBJECT_ID(N'[hris].[TimesheetIdleAllocations]', N'U') IS NULL
CREATE TABLE [hris].[TimesheetIdleAllocations] (
  [Id] BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT [PK_TimesheetIdleAllocations] PRIMARY KEY,
  [LineId] NVARCHAR(220) NOT NULL,
  [ReasonId] NVARCHAR(80) NOT NULL,
  [ReasonName] NVARCHAR(180) NOT NULL,
  [Hours] DECIMAL(9,2) NOT NULL,
  [Remarks] NVARCHAR(500) NULL,
  CONSTRAINT [FK_TimesheetIdleAllocations_Line] FOREIGN KEY ([LineId]) REFERENCES [hris].[TimesheetLines]([Id]) ON DELETE CASCADE
);
GO

IF OBJECT_ID(N'[hris].[TimesheetWorkflowEvents]', N'U') IS NULL
CREATE TABLE [hris].[TimesheetWorkflowEvents] (
  [Id] BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT [PK_TimesheetWorkflowEvents] PRIMARY KEY,
  [HeaderId] NVARCHAR(160) NOT NULL,
  [Stage] NVARCHAR(60) NOT NULL,
  [Decision] NVARCHAR(60) NOT NULL,
  [Actor] NVARCHAR(120) NOT NULL,
  [ActedAt] DATETIME2(0) NOT NULL,
  [Comment] NVARCHAR(500) NULL,
  CONSTRAINT [FK_TimesheetWorkflowEvents_Header] FOREIGN KEY ([HeaderId]) REFERENCES [hris].[TimesheetHeaders]([Id]) ON DELETE CASCADE
);
GO

IF OBJECT_ID(N'[hris].[TimesheetPayrollUpdates]', N'U') IS NULL
CREATE TABLE [hris].[TimesheetPayrollUpdates] (
  [Id] NVARCHAR(160) NOT NULL CONSTRAINT [PK_TimesheetPayrollUpdates] PRIMARY KEY,
  [PeriodId] NVARCHAR(40) NOT NULL,
  [PeriodName] NVARCHAR(80) NOT NULL,
  [AcknowledgedAt] DATETIME2(0) NOT NULL,
  [AcknowledgedBy] NVARCHAR(120) NOT NULL
);
GO

IF OBJECT_ID(N'[hris].[TimesheetPayrollUpdateHeaders]', N'U') IS NULL
CREATE TABLE [hris].[TimesheetPayrollUpdateHeaders] (
  [PayrollUpdateId] NVARCHAR(160) NOT NULL,
  [HeaderId] NVARCHAR(160) NOT NULL,
  CONSTRAINT [PK_TimesheetPayrollUpdateHeaders] PRIMARY KEY ([PayrollUpdateId], [HeaderId]),
  CONSTRAINT [FK_TimesheetPayrollUpdateHeaders_Update] FOREIGN KEY ([PayrollUpdateId]) REFERENCES [hris].[TimesheetPayrollUpdates]([Id]) ON DELETE CASCADE
);
GO

IF OBJECT_ID(N'[hris].[TimesheetPayrollUpdateEmployees]', N'U') IS NULL
CREATE TABLE [hris].[TimesheetPayrollUpdateEmployees] (
  [PayrollUpdateId] NVARCHAR(160) NOT NULL,
  [EmployeeId] NVARCHAR(80) NOT NULL,
  [EmployeeName] NVARCHAR(220) NOT NULL,
  [DaysWorked] INT NOT NULL,
  [AttendanceHours] DECIMAL(9,2) NOT NULL,
  [BookedHours] DECIMAL(9,2) NOT NULL,
  [IdleHours] DECIMAL(9,2) NOT NULL,
  CONSTRAINT [PK_TimesheetPayrollUpdateEmployees] PRIMARY KEY ([PayrollUpdateId], [EmployeeId]),
  CONSTRAINT [FK_TimesheetPayrollUpdateEmployees_Update] FOREIGN KEY ([PayrollUpdateId]) REFERENCES [hris].[TimesheetPayrollUpdates]([Id]) ON DELETE CASCADE
);
GO
