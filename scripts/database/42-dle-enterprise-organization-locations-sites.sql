/*
  DLE_Enterprise HRIS organization locations and sites.
  Stores locations and sites migrated from Sage Payroll for Organization > Locations & Sites.
  Safe to rerun.
*/

USE [DLE_Enterprise];
GO

IF SCHEMA_ID(N'hris') IS NULL
  EXEC(N'CREATE SCHEMA [hris]');
GO

IF OBJECT_ID(N'[hris].[OrganizationLocationsSites]', N'U') IS NULL
CREATE TABLE [hris].[OrganizationLocationsSites] (
  [Id] NVARCHAR(140) NOT NULL CONSTRAINT [PK_OrganizationLocationsSites] PRIMARY KEY,
  [SourceSystem] NVARCHAR(80) NOT NULL,
  [SourceCode] NVARCHAR(100) NOT NULL,
  [Name] NVARCHAR(180) NOT NULL,
  [RecordType] NVARCHAR(20) NOT NULL,
  [ParentName] NVARCHAR(180) NULL,
  [Region] NVARCHAR(180) NOT NULL,
  [Country] NVARCHAR(100) NOT NULL,
  [SiteCategory] NVARCHAR(60) NOT NULL,
  [Leader] NVARCHAR(220) NOT NULL,
  [Location] NVARCHAR(180) NOT NULL,
  [Headcount] INT NOT NULL CONSTRAINT [DF_OrganizationLocationsSites_Headcount] DEFAULT 0,
  [OpenRoles] INT NOT NULL CONSTRAINT [DF_OrganizationLocationsSites_OpenRoles] DEFAULT 0,
  [BudgetUsd] DECIMAL(19,2) NOT NULL CONSTRAINT [DF_OrganizationLocationsSites_BudgetUsd] DEFAULT 0,
  [PayrollUsd] DECIMAL(19,2) NOT NULL CONSTRAINT [DF_OrganizationLocationsSites_PayrollUsd] DEFAULT 0,
  [SpanOfControl] DECIMAL(9,2) NOT NULL CONSTRAINT [DF_OrganizationLocationsSites_SpanOfControl] DEFAULT 0,
  [SuccessionCoveragePct] DECIMAL(9,2) NOT NULL CONSTRAINT [DF_OrganizationLocationsSites_SuccessionCoveragePct] DEFAULT 0,
  [AttritionRiskPct] DECIMAL(9,2) NOT NULL CONSTRAINT [DF_OrganizationLocationsSites_AttritionRiskPct] DEFAULT 0,
  [HealthStatus] NVARCHAR(40) NOT NULL,
  [CostCenter] NVARCHAR(100) NOT NULL,
  [Description] NVARCHAR(600) NOT NULL,
  [NodeCount] INT NOT NULL CONSTRAINT [DF_OrganizationLocationsSites_NodeCount] DEFAULT 0,
  [DivisionCount] INT NOT NULL CONSTRAINT [DF_OrganizationLocationsSites_DivisionCount] DEFAULT 0,
  [BusinessUnitCount] INT NOT NULL CONSTRAINT [DF_OrganizationLocationsSites_BusinessUnitCount] DEFAULT 0,
  [DepartmentCount] INT NOT NULL CONSTRAINT [DF_OrganizationLocationsSites_DepartmentCount] DEFAULT 0,
  [TeamCount] INT NOT NULL CONSTRAINT [DF_OrganizationLocationsSites_TeamCount] DEFAULT 0,
  [ParentChainJson] NVARCHAR(MAX) NOT NULL,
  [RelatedItemsJson] NVARCHAR(MAX) NOT NULL,
  [SourceSnapshotJson] NVARCHAR(MAX) NOT NULL,
  [LastSyncedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_OrganizationLocationsSites_LastSyncedAt] DEFAULT SYSUTCDATETIME(),
  CONSTRAINT [UQ_OrganizationLocationsSites_Source] UNIQUE ([SourceSystem], [RecordType], [SourceCode]),
  CONSTRAINT [CK_OrganizationLocationsSites_ParentChainJson] CHECK (ISJSON([ParentChainJson]) = 1),
  CONSTRAINT [CK_OrganizationLocationsSites_RelatedItemsJson] CHECK (ISJSON([RelatedItemsJson]) = 1),
  CONSTRAINT [CK_OrganizationLocationsSites_SourceSnapshotJson] CHECK (ISJSON([SourceSnapshotJson]) = 1)
);
GO

