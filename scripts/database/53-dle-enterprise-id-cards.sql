/*
  DLE_Enterprise HRIS employee ID card issuance ledger.
  Cards are rebuilt from the employee directory; this stores who was issued a card and when.
  Safe to rerun. The application also creates these tables on first use.
*/

USE [DLE_Enterprise];
GO

IF SCHEMA_ID(N'hris') IS NULL
  EXEC(N'CREATE SCHEMA [hris]');
GO

IF OBJECT_ID(N'[hris].[IdCardBatches]', N'U') IS NULL
BEGIN
  CREATE TABLE [hris].[IdCardBatches] (
    [Id] NVARCHAR(40) NOT NULL CONSTRAINT [PK_IdCardBatches] PRIMARY KEY,
    [TemplateId] NVARCHAR(40) NOT NULL,
    [ExportFormat] NVARCHAR(10) NOT NULL,
    [CardCount] INT NOT NULL,
    [IssuedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_IdCardBatches_IssuedAt] DEFAULT SYSUTCDATETIME(),
    [IssuedBy] NVARCHAR(120) NOT NULL
  );
END;
GO

IF OBJECT_ID(N'[hris].[IdCardIssues]', N'U') IS NULL
BEGIN
  CREATE TABLE [hris].[IdCardIssues] (
    [Id] NVARCHAR(40) NOT NULL CONSTRAINT [PK_IdCardIssues] PRIMARY KEY,
    [BatchId] NVARCHAR(40) NOT NULL,
    [EmployeeCode] NVARCHAR(80) NOT NULL,
    [EmployeeName] NVARCHAR(220) NOT NULL,
    [Department] NVARCHAR(180) NULL,
    [JobTitle] NVARCHAR(180) NULL,
    [TemplateId] NVARCHAR(40) NOT NULL,
    [ExportFormat] NVARCHAR(10) NOT NULL,
    [PhotoPresent] BIT NOT NULL,
    [Status] NVARCHAR(20) NOT NULL,
    [IssuedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_IdCardIssues_IssuedAt] DEFAULT SYSUTCDATETIME(),
    [IssuedBy] NVARCHAR(120) NOT NULL
  );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_IdCardIssues_EmployeeCode' AND object_id = OBJECT_ID(N'[hris].[IdCardIssues]'))
  CREATE INDEX [IX_IdCardIssues_EmployeeCode] ON [hris].[IdCardIssues]([EmployeeCode], [IssuedAt] DESC);
GO
