/*
  Additive EPC Project Management foundations for DLE_Enterprise.
  Safe to re-run. Does NOT drop tables or rename existing columns.
*/
USE [DLE_Enterprise];
GO

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'pm') EXEC(N'CREATE SCHEMA pm');
GO

/* Core tables are also ensured at runtime by apps/dashboard/lib/projects-engineering/db.ts */

IF OBJECT_ID(N'[pm].[WBS]', N'U') IS NULL
BEGIN
  CREATE TABLE [pm].[WBS](
    [WbsId] uniqueidentifier NOT NULL CONSTRAINT [PK_pm_WBS] PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [ProjectCode] nvarchar(30) NOT NULL,
    [WbsCode] nvarchar(60) NOT NULL,
    [ParentWbsId] uniqueidentifier NULL,
    [Title] nvarchar(200) NOT NULL,
    [SortOrder] int NOT NULL CONSTRAINT [DF_pm_WBS_Sort] DEFAULT 0,
    [IsDeleted] bit NOT NULL CONSTRAINT [DF_pm_WBS_IsDeleted] DEFAULT 0,
    [CreatedAt] datetime2(3) NOT NULL CONSTRAINT [DF_pm_WBS_CreatedAt] DEFAULT SYSUTCDATETIME(),
    CONSTRAINT [UQ_pm_WBS_ProjectCode] UNIQUE([ProjectCode],[WbsCode])
  );
END
GO

IF OBJECT_ID(N'[pm].[ScheduleActivities]', N'U') IS NULL
BEGIN
  CREATE TABLE [pm].[ScheduleActivities](
    [ActivityId] uniqueidentifier NOT NULL CONSTRAINT [PK_pm_ScheduleActivities] PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [ProjectCode] nvarchar(30) NOT NULL,
    [WbsCode] nvarchar(60) NULL,
    [ActivityCode] nvarchar(60) NOT NULL,
    [Title] nvarchar(240) NOT NULL,
    [BaselineStart] date NULL,
    [BaselineFinish] date NULL,
    [CurrentStart] date NULL,
    [CurrentFinish] date NULL,
    [ForecastFinish] date NULL,
    [PercentComplete] decimal(7,3) NOT NULL CONSTRAINT [DF_pm_SchedAct_Pct] DEFAULT 0,
    [IsCritical] bit NOT NULL CONSTRAINT [DF_pm_SchedAct_Critical] DEFAULT 0,
    [TotalFloatDays] decimal(10,2) NULL,
    [Status] nvarchar(30) NOT NULL CONSTRAINT [DF_pm_SchedAct_Status] DEFAULT N'Planned',
    [ModifiedAt] datetime2(3) NOT NULL CONSTRAINT [DF_pm_SchedAct_ModifiedAt] DEFAULT SYSUTCDATETIME(),
    CONSTRAINT [UQ_pm_SchedAct_Code] UNIQUE([ProjectCode],[ActivityCode])
  );
END
GO

IF OBJECT_ID(N'[pm].[CostCodes]', N'U') IS NULL
BEGIN
  CREATE TABLE [pm].[CostCodes](
    [CostCodeId] uniqueidentifier NOT NULL CONSTRAINT [PK_pm_CostCodes] PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [ProjectCode] nvarchar(30) NULL,
    [CostCode] nvarchar(40) NOT NULL,
    [Title] nvarchar(200) NOT NULL,
    [ParentCostCode] nvarchar(40) NULL,
    [IsActive] bit NOT NULL CONSTRAINT [DF_pm_CostCodes_Active] DEFAULT 1,
    CONSTRAINT [UQ_pm_CostCodes] UNIQUE([ProjectCode],[CostCode])
  );
END
GO

IF OBJECT_ID(N'[pm].[NCRs]', N'U') IS NULL
BEGIN
  CREATE TABLE [pm].[NCRs](
    [NcrId] uniqueidentifier NOT NULL CONSTRAINT [PK_pm_NCRs] PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [ProjectCode] nvarchar(30) NOT NULL,
    [NcrNumber] nvarchar(40) NOT NULL,
    [Title] nvarchar(240) NOT NULL,
    [Discipline] nvarchar(80) NULL,
    [RaisedAt] datetime2(3) NOT NULL CONSTRAINT [DF_pm_NCRs_RaisedAt] DEFAULT SYSUTCDATETIME(),
    [DueDate] date NULL,
    [Status] nvarchar(30) NOT NULL CONSTRAINT [DF_pm_NCRs_Status] DEFAULT N'Open',
    [IsDeleted] bit NOT NULL CONSTRAINT [DF_pm_NCRs_IsDeleted] DEFAULT 0,
    CONSTRAINT [UQ_pm_NCRs_Number] UNIQUE([ProjectCode],[NcrNumber])
  );
END
GO

IF OBJECT_ID(N'[pm].[HSEEvents]', N'U') IS NULL
BEGIN
  CREATE TABLE [pm].[HSEEvents](
    [HseEventId] uniqueidentifier NOT NULL CONSTRAINT [PK_pm_HSEEvents] PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [ProjectCode] nvarchar(30) NULL,
    [EventType] nvarchar(40) NOT NULL,
    [Severity] nvarchar(20) NULL,
    [Title] nvarchar(240) NOT NULL,
    [EventDate] date NOT NULL,
    [Status] nvarchar(30) NOT NULL CONSTRAINT [DF_pm_HSE_Status] DEFAULT N'Open',
    [OwnerEmployeeCode] nvarchar(80) NULL,
    [CreatedAt] datetime2(3) NOT NULL CONSTRAINT [DF_pm_HSE_CreatedAt] DEFAULT SYSUTCDATETIME(),
    [IsDeleted] bit NOT NULL CONSTRAINT [DF_pm_HSE_IsDeleted] DEFAULT 0
  );
END
GO

PRINT 'pm EPC additive migration complete.';
GO
