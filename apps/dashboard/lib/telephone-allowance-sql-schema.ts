/** Idempotent SQL Server DDL for Telephone Allowance / Call Credit. */
export const ensureTelephoneAllowanceSchemaSql = `
IF SCHEMA_ID(N'hris') IS NULL EXEC(N'CREATE SCHEMA [hris]');

IF OBJECT_ID(N'[hris].[TelephoneAllowanceEntitlement]', N'U') IS NULL
CREATE TABLE [hris].[TelephoneAllowanceEntitlement] (
  [Id] NVARCHAR(120) NOT NULL CONSTRAINT [PK_TelephoneAllowanceEntitlement] PRIMARY KEY,
  [EmployeeCode] NVARCHAR(80) NOT NULL,
  [EmployeeName] NVARCHAR(220) NOT NULL,
  [Department] NVARCHAR(180) NULL,
  [JobTitle] NVARCHAR(180) NULL,
  [MonthlyAmount] DECIMAL(18,2) NOT NULL,
  [EffectiveFrom] DATE NOT NULL,
  [EffectiveTo] DATE NULL,
  [Status] NVARCHAR(40) NOT NULL,
  [BankName] NVARCHAR(180) NULL,
  [AccountNo] NVARCHAR(80) NULL,
  [SortCode] NVARCHAR(40) NULL,
  [CreatedBy] NVARCHAR(220) NOT NULL,
  [CreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_TA_Entitlement_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_TA_Entitlement_UpdatedAt] DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID(N'[hris].[TelephoneAllowanceCycle]', N'U') IS NULL
CREATE TABLE [hris].[TelephoneAllowanceCycle] (
  [Id] NVARCHAR(120) NOT NULL CONSTRAINT [PK_TelephoneAllowanceCycle] PRIMARY KEY,
  [CycleCode] NVARCHAR(80) NOT NULL,
  [Year] INT NOT NULL,
  [Month1] INT NOT NULL,
  [Month2] INT NOT NULL,
  [PairLabel] NVARCHAR(40) NOT NULL,
  [PairCode] NVARCHAR(20) NOT NULL,
  [Status] NVARCHAR(60) NOT NULL,
  [CurrentOwnerRole] NVARCHAR(80) NOT NULL,
  [PreparedBy] NVARCHAR(220) NOT NULL,
  [HrReviewedBy] NVARCHAR(220) NULL,
  [Locked] BIT NOT NULL CONSTRAINT [DF_TA_Cycle_Locked] DEFAULT 0,
  [RowVersion] INT NOT NULL CONSTRAINT [DF_TA_Cycle_RowVersion] DEFAULT 1,
  [Month1Total] DECIMAL(18,2) NOT NULL,
  [Month2Total] DECIMAL(18,2) NOT NULL,
  [BimonthlyTotal] DECIMAL(18,2) NOT NULL,
  [BeneficiaryCount] INT NOT NULL,
  [OriginalBeneficiaryCount] INT NULL,
  [OriginalBimonthlyTotal] DECIMAL(18,2) NULL,
  [PayloadJson] NVARCHAR(MAX) NOT NULL,
  [CreatedBy] NVARCHAR(220) NOT NULL,
  [CreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_TA_Cycle_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_TA_Cycle_UpdatedAt] DEFAULT SYSUTCDATETIME()
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_TelephoneAllowanceCycle_Code' AND object_id = OBJECT_ID(N'[hris].[TelephoneAllowanceCycle]'))
  CREATE UNIQUE INDEX [UX_TelephoneAllowanceCycle_Code] ON [hris].[TelephoneAllowanceCycle]([CycleCode]);

IF OBJECT_ID(N'[hris].[TelephoneAllowancePayment]', N'U') IS NULL
CREATE TABLE [hris].[TelephoneAllowancePayment] (
  [Id] NVARCHAR(120) NOT NULL CONSTRAINT [PK_TelephoneAllowancePayment] PRIMARY KEY,
  [CycleId] NVARCHAR(120) NOT NULL,
  [CycleCode] NVARCHAR(80) NOT NULL,
  [Status] NVARCHAR(60) NOT NULL,
  [AuthorizedAmount] DECIMAL(18,2) NOT NULL,
  [PaidAmount] DECIMAL(18,2) NOT NULL,
  [BeneficiaryCount] INT NOT NULL,
  [PaymentDate] DATE NULL,
  [PaymentReference] NVARCHAR(120) NULL,
  [BankReference] NVARCHAR(120) NULL,
  [BatchReference] NVARCHAR(120) NULL,
  [Remarks] NVARCHAR(700) NULL,
  [PayloadJson] NVARCHAR(MAX) NOT NULL,
  [CreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_TA_Payment_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_TA_Payment_UpdatedAt] DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID(N'[hris].[TelephoneAllowanceException]', N'U') IS NULL
CREATE TABLE [hris].[TelephoneAllowanceException] (
  [Id] NVARCHAR(120) NOT NULL CONSTRAINT [PK_TelephoneAllowanceException] PRIMARY KEY,
  [CycleId] NVARCHAR(120) NOT NULL,
  [CycleCode] NVARCHAR(80) NOT NULL,
  [EmployeeCode] NVARCHAR(80) NULL,
  [EmployeeName] NVARCHAR(220) NULL,
  [Type] NVARCHAR(120) NOT NULL,
  [Severity] NVARCHAR(20) NOT NULL,
  [Owner] NVARCHAR(220) NOT NULL,
  [Status] NVARCHAR(40) NOT NULL,
  [Resolution] NVARCHAR(700) NULL,
  [CreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_TA_Exception_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [ResolvedAt] DATETIME2 NULL
);

IF OBJECT_ID(N'[hris].[TelephoneAllowanceAudit]', N'U') IS NULL
CREATE TABLE [hris].[TelephoneAllowanceAudit] (
  [Id] NVARCHAR(120) NOT NULL CONSTRAINT [PK_TelephoneAllowanceAudit] PRIMARY KEY,
  [CycleId] NVARCHAR(120) NULL,
  [EmployeeCode] NVARCHAR(80) NULL,
  [UserName] NVARCHAR(220) NOT NULL,
  [UserRole] NVARCHAR(120) NOT NULL,
  [ActionName] NVARCHAR(160) NOT NULL,
  [PreviousValue] NVARCHAR(MAX) NULL,
  [NewValue] NVARCHAR(MAX) NULL,
  [Reason] NVARCHAR(700) NULL,
  [WorkflowStage] NVARCHAR(60) NULL,
  [IpAddress] NVARCHAR(80) NULL,
  [CreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_TA_Audit_CreatedAt] DEFAULT SYSUTCDATETIME()
);
`;
