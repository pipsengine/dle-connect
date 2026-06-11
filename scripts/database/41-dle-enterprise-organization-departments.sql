/*
  DLE_Enterprise HRIS organization departments.
  Stores departments migrated from Sage Payroll for the HRIS Organization > Departments page.
  Safe to rerun.
*/

USE [DLE_Enterprise];
GO

IF SCHEMA_ID(N'hris') IS NULL
  EXEC(N'CREATE SCHEMA [hris]');
GO

IF OBJECT_ID(N'[hris].[OrganizationDepartments]', N'U') IS NULL
CREATE TABLE [hris].[OrganizationDepartments] (
  [Id] NVARCHAR(120) NOT NULL CONSTRAINT [PK_OrganizationDepartments] PRIMARY KEY,
  [SourceSystem] NVARCHAR(80) NOT NULL,
  [SourceCode] NVARCHAR(80) NOT NULL,
  [Name] NVARCHAR(180) NOT NULL,
  [ParentName] NVARCHAR(180) NULL,
  [ParentKind] NVARCHAR(40) NULL,
  [Location] NVARCHAR(180) NOT NULL,
  [Leader] NVARCHAR(220) NOT NULL,
  [Headcount] INT NOT NULL CONSTRAINT [DF_OrganizationDepartments_Headcount] DEFAULT 0,
  [OpenRoles] INT NOT NULL CONSTRAINT [DF_OrganizationDepartments_OpenRoles] DEFAULT 0,
  [BudgetUsd] DECIMAL(19,2) NOT NULL CONSTRAINT [DF_OrganizationDepartments_BudgetUsd] DEFAULT 0,
  [PayrollUsd] DECIMAL(19,2) NOT NULL CONSTRAINT [DF_OrganizationDepartments_PayrollUsd] DEFAULT 0,
  [SpanOfControl] DECIMAL(9,2) NOT NULL CONSTRAINT [DF_OrganizationDepartments_SpanOfControl] DEFAULT 0,
  [SuccessionCoveragePct] DECIMAL(9,2) NOT NULL CONSTRAINT [DF_OrganizationDepartments_SuccessionCoveragePct] DEFAULT 0,
  [AttritionRiskPct] DECIMAL(9,2) NOT NULL CONSTRAINT [DF_OrganizationDepartments_AttritionRiskPct] DEFAULT 0,
  [HealthStatus] NVARCHAR(40) NOT NULL,
  [CostCenter] NVARCHAR(100) NOT NULL,
  [Description] NVARCHAR(500) NOT NULL,
  [TeamCount] INT NOT NULL CONSTRAINT [DF_OrganizationDepartments_TeamCount] DEFAULT 0,
  [TeamHeadcount] INT NOT NULL CONSTRAINT [DF_OrganizationDepartments_TeamHeadcount] DEFAULT 0,
  [TeamsJson] NVARCHAR(MAX) NOT NULL,
  [SourceSnapshotJson] NVARCHAR(MAX) NOT NULL,
  [LastSyncedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_OrganizationDepartments_LastSyncedAt] DEFAULT SYSUTCDATETIME(),
  CONSTRAINT [UQ_OrganizationDepartments_Source] UNIQUE ([SourceSystem], [SourceCode]),
  CONSTRAINT [CK_OrganizationDepartments_TeamsJson] CHECK (ISJSON([TeamsJson]) = 1),
  CONSTRAINT [CK_OrganizationDepartments_SourceSnapshotJson] CHECK (ISJSON([SourceSnapshotJson]) = 1)
);
GO

