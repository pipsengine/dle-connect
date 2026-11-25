export const ensureGalvanizingSchemaSql = `
IF SCHEMA_ID(N'galvanizing') IS NULL EXEC(N'CREATE SCHEMA [galvanizing]');

IF OBJECT_ID(N'[galvanizing].[Jobs]', N'U') IS NULL
CREATE TABLE [galvanizing].[Jobs] (
  [Id] INT IDENTITY(1,1) NOT NULL CONSTRAINT [PK_GalvJobs] PRIMARY KEY,
  [Number] NVARCHAR(40) NOT NULL CONSTRAINT [UQ_GalvJobs_Number] UNIQUE,
  [Ownership] NVARCHAR(12) NOT NULL,
  [CustomerProject] NVARCHAR(160) NOT NULL,
  [CustomerCode] NVARCHAR(80) NOT NULL CONSTRAINT [DF_GalvJobs_Customer] DEFAULT N'',
  [ProjectCode] NVARCHAR(80) NOT NULL CONSTRAINT [DF_GalvJobs_Project] DEFAULT N'',
  [ReferenceNo] NVARCHAR(100) NOT NULL CONSTRAINT [DF_GalvJobs_Ref] DEFAULT N'',
  [Status] NVARCHAR(32) NOT NULL,
  [DueDate] NVARCHAR(20) NOT NULL CONSTRAINT [DF_GalvJobs_Due] DEFAULT N'',
  [Title] NVARCHAR(220) NOT NULL CONSTRAINT [DF_GalvJobs_Title] DEFAULT N'',
  [Priority] NVARCHAR(16) NOT NULL CONSTRAINT [DF_GalvJobs_Priority] DEFAULT N'NORMAL',
  [EstimatedTonnes] FLOAT NOT NULL CONSTRAINT [DF_GalvJobs_Tonnes] DEFAULT 0,
  [CoatingStandard] NVARCHAR(80) NOT NULL CONSTRAINT [DF_GalvJobs_Standard] DEFAULT N'ISO 1461',
  [CreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_GalvJobs_Created] DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID(N'[galvanizing].[Receipts]', N'U') IS NULL
CREATE TABLE [galvanizing].[Receipts] (
  [Id] INT IDENTITY(1,1) NOT NULL CONSTRAINT [PK_GalvReceipts] PRIMARY KEY,
  [Number] NVARCHAR(40) NOT NULL CONSTRAINT [UQ_GalvReceipts_Number] UNIQUE,
  [JobId] INT NULL,
  [DocumentNo] NVARCHAR(100) NOT NULL CONSTRAINT [DF_GalvReceipts_Doc] DEFAULT N'',
  [Vehicle] NVARCHAR(50) NOT NULL CONSTRAINT [DF_GalvReceipts_Vehicle] DEFAULT N'',
  [DriverName] NVARCHAR(120) NOT NULL CONSTRAINT [DF_GalvReceipts_Driver] DEFAULT N'',
  [SourceType] NVARCHAR(24) NOT NULL CONSTRAINT [DF_GalvReceipts_Source] DEFAULT N'CUSTOMER_WAYBILL',
  [MissingWaybill] NVARCHAR(8) NOT NULL CONSTRAINT [DF_GalvReceipts_Missing] DEFAULT N'NO',
  [ExceptionMemo] NVARCHAR(MAX) NOT NULL CONSTRAINT [DF_GalvReceipts_Memo] DEFAULT N'',
  [ExceptionReason] NVARCHAR(40) NOT NULL CONSTRAINT [DF_GalvReceipts_ExReason] DEFAULT N'',
  [ExceptionApprovedBy] NVARCHAR(120) NOT NULL CONSTRAINT [DF_GalvReceipts_ExBy] DEFAULT N'',
  [ExceptionApprovedAt] NVARCHAR(40) NOT NULL CONSTRAINT [DF_GalvReceipts_ExAt] DEFAULT N'',
  [GateInAt] NVARCHAR(40) NOT NULL CONSTRAINT [DF_GalvReceipts_Gate] DEFAULT N'',
  [GrossKg] FLOAT NOT NULL CONSTRAINT [DF_GalvReceipts_Gross] DEFAULT 0,
  [TareKg] FLOAT NOT NULL CONSTRAINT [DF_GalvReceipts_Tare] DEFAULT 0,
  [TareRecorded] NVARCHAR(3) NOT NULL CONSTRAINT [DF_GalvReceipts_TareRec] DEFAULT N'NO',
  [NetKg] FLOAT NOT NULL CONSTRAINT [DF_GalvReceipts_Net] DEFAULT 0,
  [ArticleCount] INT NOT NULL CONSTRAINT [DF_GalvReceipts_Count] DEFAULT 0,
  [Status] NVARCHAR(32) NOT NULL,
  [LocationName] NVARCHAR(80) NOT NULL CONSTRAINT [DF_GalvReceipts_Loc] DEFAULT N'Receiving Yard',
  [QcInspector] NVARCHAR(120) NOT NULL CONSTRAINT [DF_GalvReceipts_Inspector] DEFAULT N'',
  [QcSupervisor] NVARCHAR(120) NOT NULL CONSTRAINT [DF_GalvReceipts_Supervisor] DEFAULT N'',
  [QcDisposition] NVARCHAR(20) NOT NULL CONSTRAINT [DF_GalvReceipts_QcDisp] DEFAULT N'',
  [QcSeverity] NVARCHAR(16) NOT NULL CONSTRAINT [DF_GalvReceipts_QcSev] DEFAULT N'',
  CONSTRAINT [FK_GalvReceipts_Job] FOREIGN KEY ([JobId]) REFERENCES [galvanizing].[Jobs]([Id])
);

IF OBJECT_ID(N'[galvanizing].[Articles]', N'U') IS NULL
CREATE TABLE [galvanizing].[Articles] (
  [Id] INT IDENTITY(1,1) NOT NULL CONSTRAINT [PK_GalvArticles] PRIMARY KEY,
  [ReceiptId] INT NOT NULL,
  [Tag] NVARCHAR(80) NOT NULL CONSTRAINT [UQ_GalvArticles_Tag] UNIQUE,
  [Description] NVARCHAR(180) NOT NULL,
  [Quantity] INT NOT NULL,
  [AcceptedQty] INT NULL,
  [RejectedQty] INT NULL,
  [HoleCount] INT NULL,
  [DoubleDip] NVARCHAR(3) NOT NULL CONSTRAINT [DF_GalvArticles_Dip] DEFAULT N'',
  [DoubleDipCount] INT NULL,
  [SteelThicknessMm] FLOAT NULL,
  [CoatingThicknessUm] FLOAT NULL,
  [WeightKg] FLOAT NOT NULL,
  [Ownership] NVARCHAR(12) NOT NULL CONSTRAINT [DF_GalvArticles_Owner] DEFAULT N'',
  [Status] NVARCHAR(24) NOT NULL,
  [LocationName] NVARCHAR(80) NOT NULL CONSTRAINT [DF_GalvArticles_Loc] DEFAULT N'',
  CONSTRAINT [FK_GalvArticles_Receipt] FOREIGN KEY ([ReceiptId]) REFERENCES [galvanizing].[Receipts]([Id])
);

IF OBJECT_ID(N'[galvanizing].[Batches]', N'U') IS NULL
CREATE TABLE [galvanizing].[Batches] (
  [Id] INT IDENTITY(1,1) NOT NULL CONSTRAINT [PK_GalvBatches] PRIMARY KEY,
  [Number] NVARCHAR(40) NOT NULL CONSTRAINT [UQ_GalvBatches_Number] UNIQUE,
  [JobId] INT NOT NULL,
  [WeightKg] FLOAT NOT NULL,
  [Stage] NVARCHAR(30) NOT NULL,
  [Status] NVARCHAR(24) NOT NULL,
  [Kettle] NVARCHAR(40) NOT NULL CONSTRAINT [DF_GalvBatches_Kettle] DEFAULT N'Kettle 1',
  [ShiftName] NVARCHAR(16) NOT NULL CONSTRAINT [DF_GalvBatches_Shift] DEFAULT N'Day',
  [Supervisor] NVARCHAR(100) NOT NULL CONSTRAINT [DF_GalvBatches_Supervisor] DEFAULT N'',
  [ArticleCount] INT NOT NULL CONSTRAINT [DF_GalvBatches_Count] DEFAULT 0,
  [CompletedAt] DATETIME2 NULL,
  CONSTRAINT [FK_GalvBatches_Job] FOREIGN KEY ([JobId]) REFERENCES [galvanizing].[Jobs]([Id])
);

IF OBJECT_ID(N'[galvanizing].[BatchArticles]', N'U') IS NULL
CREATE TABLE [galvanizing].[BatchArticles] (
  [Id] INT IDENTITY(1,1) NOT NULL CONSTRAINT [PK_GalvBatchArticles] PRIMARY KEY,
  [BatchId] INT NOT NULL,
  [ArticleId] INT NOT NULL,
  [Quantity] INT NOT NULL CONSTRAINT [DF_GalvBatchArticles_Qty] DEFAULT 1,
  [WeightKg] FLOAT NOT NULL CONSTRAINT [DF_GalvBatchArticles_Weight] DEFAULT 0,
  CONSTRAINT [UQ_GalvBatchArticle] UNIQUE ([BatchId], [ArticleId]),
  CONSTRAINT [FK_GalvBatchArticles_Batch] FOREIGN KEY ([BatchId]) REFERENCES [galvanizing].[Batches]([Id]),
  CONSTRAINT [FK_GalvBatchArticles_Article] FOREIGN KEY ([ArticleId]) REFERENCES [galvanizing].[Articles]([Id])
);

IF OBJECT_ID(N'[galvanizing].[StageEvents]', N'U') IS NULL
CREATE TABLE [galvanizing].[StageEvents] (
  [Id] INT IDENTITY(1,1) NOT NULL CONSTRAINT [PK_GalvStageEvents] PRIMARY KEY,
  [BatchId] INT NOT NULL,
  [Stage] NVARCHAR(30) NOT NULL,
  [ActionName] NVARCHAR(20) NOT NULL,
  [OperatorName] NVARCHAR(100) NOT NULL,
  [Detail] NVARCHAR(500) NOT NULL CONSTRAINT [DF_GalvStage_Detail] DEFAULT N'',
  [At] DATETIME2 NOT NULL CONSTRAINT [DF_GalvStage_At] DEFAULT SYSUTCDATETIME(),
  CONSTRAINT [FK_GalvStage_Batch] FOREIGN KEY ([BatchId]) REFERENCES [galvanizing].[Batches]([Id])
);

IF OBJECT_ID(N'[galvanizing].[Inspections]', N'U') IS NULL
CREATE TABLE [galvanizing].[Inspections] (
  [Id] INT IDENTITY(1,1) NOT NULL CONSTRAINT [PK_GalvInspections] PRIMARY KEY,
  [BatchId] INT NOT NULL,
  [Kind] NVARCHAR(20) NOT NULL,
  [Outcome] NVARCHAR(20) NOT NULL,
  [ThicknessUm] FLOAT NULL,
  [SteelThicknessMm] FLOAT NULL,
  [StandardName] NVARCHAR(40) NOT NULL CONSTRAINT [DF_GalvInsp_Standard] DEFAULT N'ISO 1461',
  [Inspector] NVARCHAR(100) NOT NULL,
  [Remarks] NVARCHAR(MAX) NOT NULL CONSTRAINT [DF_GalvInsp_Remarks] DEFAULT N'',
  [At] DATETIME2 NOT NULL CONSTRAINT [DF_GalvInsp_At] DEFAULT SYSUTCDATETIME(),
  CONSTRAINT [FK_GalvInsp_Batch] FOREIGN KEY ([BatchId]) REFERENCES [galvanizing].[Batches]([Id])
);

IF OBJECT_ID(N'[galvanizing].[Ncr]', N'U') IS NULL
CREATE TABLE [galvanizing].[Ncr] (
  [Id] INT IDENTITY(1,1) NOT NULL CONSTRAINT [PK_GalvNcr] PRIMARY KEY,
  [BatchId] INT NOT NULL,
  [Defect] NVARCHAR(MAX) NOT NULL,
  [Severity] NVARCHAR(16) NOT NULL CONSTRAINT [DF_GalvNcr_Severity] DEFAULT N'MAJOR',
  [Disposition] NVARCHAR(20) NOT NULL CONSTRAINT [DF_GalvNcr_Disp] DEFAULT N'HOLD',
  [Status] NVARCHAR(20) NOT NULL,
  [Approver] NVARCHAR(100) NOT NULL CONSTRAINT [DF_GalvNcr_Approver] DEFAULT N'',
  [CreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_GalvNcr_Created] DEFAULT SYSUTCDATETIME(),
  CONSTRAINT [FK_GalvNcr_Batch] FOREIGN KEY ([BatchId]) REFERENCES [galvanizing].[Batches]([Id])
);

IF OBJECT_ID(N'[galvanizing].[Approvals]', N'U') IS NULL
CREATE TABLE [galvanizing].[Approvals] (
  [Id] INT IDENTITY(1,1) NOT NULL CONSTRAINT [PK_GalvApprovals] PRIMARY KEY,
  [JobId] INT NOT NULL,
  [Decision] NVARCHAR(20) NOT NULL,
  [Actor] NVARCHAR(100) NOT NULL,
  [Comment] NVARCHAR(MAX) NOT NULL CONSTRAINT [DF_GalvAppr_Comment] DEFAULT N'',
  [At] DATETIME2 NOT NULL CONSTRAINT [DF_GalvAppr_At] DEFAULT SYSUTCDATETIME(),
  CONSTRAINT [FK_GalvAppr_Job] FOREIGN KEY ([JobId]) REFERENCES [galvanizing].[Jobs]([Id])
);

IF OBJECT_ID(N'[galvanizing].[InventoryMovements]', N'U') IS NULL
CREATE TABLE [galvanizing].[InventoryMovements] (
  [Id] INT IDENTITY(1,1) NOT NULL CONSTRAINT [PK_GalvMoves] PRIMARY KEY,
  [Material] NVARCHAR(50) NOT NULL,
  [Quantity] FLOAT NOT NULL,
  [Kind] NVARCHAR(20) NOT NULL,
  [ReferenceNo] NVARCHAR(100) NOT NULL,
  [LotNo] NVARCHAR(80) NOT NULL CONSTRAINT [DF_GalvMoves_Lot] DEFAULT N'',
  [LocationName] NVARCHAR(120) NOT NULL CONSTRAINT [DF_GalvMoves_Loc] DEFAULT N'',
  [Reason] NVARCHAR(200) NOT NULL,
  [EvidenceRef] NVARCHAR(200) NOT NULL,
  [UnitCost] FLOAT NOT NULL CONSTRAINT [DF_GalvMoves_Cost] DEFAULT 0,
  [Actor] NVARCHAR(100) NOT NULL,
  [At] DATETIME2 NOT NULL CONSTRAINT [DF_GalvMoves_At] DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID(N'[galvanizing].[Dispatches]', N'U') IS NULL
CREATE TABLE [galvanizing].[Dispatches] (
  [Id] INT IDENTITY(1,1) NOT NULL CONSTRAINT [PK_GalvDispatch] PRIMARY KEY,
  [Number] NVARCHAR(40) NOT NULL CONSTRAINT [UQ_GalvDispatch_Number] UNIQUE,
  [JobId] INT NOT NULL,
  [BatchId] INT NOT NULL,
  [WeightKg] FLOAT NOT NULL,
  [Waybill] NVARCHAR(100) NOT NULL,
  [Vehicle] NVARCHAR(50) NOT NULL,
  [Destination] NVARCHAR(160) NOT NULL,
  [Status] NVARCHAR(24) NOT NULL,
  [CommercialCleared] NVARCHAR(8) NOT NULL CONSTRAINT [DF_GalvDisp_Comm] DEFAULT N'NO',
  [GateVerified] NVARCHAR(8) NOT NULL CONSTRAINT [DF_GalvDisp_Gate] DEFAULT N'NO',
  [WeightOk] NVARCHAR(8) NOT NULL CONSTRAINT [DF_GalvDisp_Weight] DEFAULT N'YES',
  [PodRef] NVARCHAR(120) NOT NULL CONSTRAINT [DF_GalvDisp_Pod] DEFAULT N'',
  [WeighbridgeRef] NVARCHAR(120) NOT NULL CONSTRAINT [DF_GalvDisp_Wb] DEFAULT N'',
  [AuthorizedBy] NVARCHAR(100) NOT NULL,
  [At] DATETIME2 NOT NULL CONSTRAINT [DF_GalvDisp_At] DEFAULT SYSUTCDATETIME(),
  CONSTRAINT [UQ_GalvDispatch_Waybill] UNIQUE ([Waybill]),
  CONSTRAINT [FK_GalvDisp_Job] FOREIGN KEY ([JobId]) REFERENCES [galvanizing].[Jobs]([Id]),
  CONSTRAINT [FK_GalvDisp_Batch] FOREIGN KEY ([BatchId]) REFERENCES [galvanizing].[Batches]([Id])
);

IF OBJECT_ID(N'[galvanizing].[Audit]', N'U') IS NULL
CREATE TABLE [galvanizing].[Audit] (
  [Id] INT IDENTITY(1,1) NOT NULL CONSTRAINT [PK_GalvAudit] PRIMARY KEY,
  [Entity] NVARCHAR(40) NOT NULL,
  [EntityId] INT NOT NULL,
  [ActionName] NVARCHAR(40) NOT NULL,
  [Actor] NVARCHAR(120) NOT NULL,
  [Detail] NVARCHAR(500) NOT NULL CONSTRAINT [DF_GalvAudit_Detail] DEFAULT N'',
  [At] DATETIME2 NOT NULL CONSTRAINT [DF_GalvAudit_At] DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID(N'[galvanizing].[Receipts]', N'U') IS NOT NULL
AND EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'[galvanizing].[Receipts]') AND name = N'JobId' AND is_nullable = 0
)
BEGIN
  IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_GalvReceipts_Job')
    ALTER TABLE [galvanizing].[Receipts] DROP CONSTRAINT [FK_GalvReceipts_Job];
  ALTER TABLE [galvanizing].[Receipts] ALTER COLUMN [JobId] INT NULL;
END;

IF OBJECT_ID(N'[galvanizing].[Receipts]', N'U') IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_GalvReceipts_Job')
  ALTER TABLE [galvanizing].[Receipts] ADD CONSTRAINT [FK_GalvReceipts_Job] FOREIGN KEY ([JobId]) REFERENCES [galvanizing].[Jobs]([Id]);

IF COL_LENGTH(N'galvanizing.Receipts', N'TareRecorded') IS NULL
  ALTER TABLE [galvanizing].[Receipts] ADD [TareRecorded] NVARCHAR(3) NOT NULL CONSTRAINT [DF_GalvReceipts_TareRec] DEFAULT N'NO';
IF COL_LENGTH(N'galvanizing.Receipts', N'ExceptionReason') IS NULL
  ALTER TABLE [galvanizing].[Receipts] ADD [ExceptionReason] NVARCHAR(40) NOT NULL CONSTRAINT [DF_GalvReceipts_ExReason] DEFAULT N'';
IF COL_LENGTH(N'galvanizing.Receipts', N'ExceptionApprovedBy') IS NULL
  ALTER TABLE [galvanizing].[Receipts] ADD [ExceptionApprovedBy] NVARCHAR(120) NOT NULL CONSTRAINT [DF_GalvReceipts_ExBy] DEFAULT N'';
IF COL_LENGTH(N'galvanizing.Receipts', N'ExceptionApprovedAt') IS NULL
  ALTER TABLE [galvanizing].[Receipts] ADD [ExceptionApprovedAt] NVARCHAR(40) NOT NULL CONSTRAINT [DF_GalvReceipts_ExAt] DEFAULT N'';
IF COL_LENGTH(N'galvanizing.Receipts', N'QcDisposition') IS NULL
  ALTER TABLE [galvanizing].[Receipts] ADD [QcDisposition] NVARCHAR(20) NOT NULL CONSTRAINT [DF_GalvReceipts_QcDisp] DEFAULT N'';
IF COL_LENGTH(N'galvanizing.Receipts', N'QcSeverity') IS NULL
  ALTER TABLE [galvanizing].[Receipts] ADD [QcSeverity] NVARCHAR(16) NOT NULL CONSTRAINT [DF_GalvReceipts_QcSev] DEFAULT N'';

IF COL_LENGTH(N'galvanizing.Articles', N'AcceptedQty') IS NULL
  ALTER TABLE [galvanizing].[Articles] ADD [AcceptedQty] INT NULL;
IF COL_LENGTH(N'galvanizing.Articles', N'RejectedQty') IS NULL
  ALTER TABLE [galvanizing].[Articles] ADD [RejectedQty] INT NULL;
IF COL_LENGTH(N'galvanizing.Articles', N'HoleCount') IS NULL
  ALTER TABLE [galvanizing].[Articles] ADD [HoleCount] INT NULL;
IF COL_LENGTH(N'galvanizing.Articles', N'DoubleDip') IS NULL
  ALTER TABLE [galvanizing].[Articles] ADD [DoubleDip] NVARCHAR(3) NOT NULL CONSTRAINT [DF_GalvArticles_Dip] DEFAULT N'';
IF COL_LENGTH(N'galvanizing.Articles', N'DoubleDipCount') IS NULL
  ALTER TABLE [galvanizing].[Articles] ADD [DoubleDipCount] INT NULL;
IF COL_LENGTH(N'galvanizing.Articles', N'SteelThicknessMm') IS NULL
  ALTER TABLE [galvanizing].[Articles] ADD [SteelThicknessMm] FLOAT NULL;
IF COL_LENGTH(N'galvanizing.Articles', N'CoatingThicknessUm') IS NULL
  ALTER TABLE [galvanizing].[Articles] ADD [CoatingThicknessUm] FLOAT NULL;

IF COL_LENGTH(N'galvanizing.Inspections', N'SteelThicknessMm') IS NULL
  ALTER TABLE [galvanizing].[Inspections] ADD [SteelThicknessMm] FLOAT NULL;

IF OBJECT_ID(N'[galvanizing].[JobReleases]', N'U') IS NULL
CREATE TABLE [galvanizing].[JobReleases] (
  [Id] INT IDENTITY(1,1) NOT NULL CONSTRAINT [PK_GalvJobReleases] PRIMARY KEY,
  [ReleaseOrderNo] NVARCHAR(40) NOT NULL CONSTRAINT [UQ_GalvJobReleases_No] UNIQUE,
  [FormNo] NVARCHAR(40) NOT NULL,
  [Dated] NVARCHAR(20) NOT NULL,
  [Batch] NVARCHAR(40) NOT NULL CONSTRAINT [DF_GalvRel_Batch] DEFAULT N'',
  [JobType] NVARCHAR(40) NOT NULL,
  [JobTypeOther] NVARCHAR(120) NOT NULL CONSTRAINT [DF_GalvRel_TypeOther] DEFAULT N'',
  [ClientName] NVARCHAR(200) NOT NULL,
  [ClientPoNo] NVARCHAR(80) NOT NULL CONSTRAINT [DF_GalvRel_Po] DEFAULT N'',
  [ScheduledDelivery] NVARCHAR(20) NOT NULL CONSTRAINT [DF_GalvRel_Delivery] DEFAULT N'',
  [PfiNo] NVARCHAR(80) NOT NULL CONSTRAINT [DF_GalvRel_Pfi] DEFAULT N'',
  [PfiDate] NVARCHAR(20) NOT NULL CONSTRAINT [DF_GalvRel_PfiDate] DEFAULT N'',
  [MaterialReceiptDate] NVARCHAR(20) NOT NULL CONSTRAINT [DF_GalvRel_ReceiptDate] DEFAULT N'',
  [BlackWeight] FLOAT NULL,
  [WeighbridgeTicketNo] NVARCHAR(80) NOT NULL CONSTRAINT [DF_GalvRel_Ticket] DEFAULT N'',
  [AdditionalWork] NVARCHAR(400) NOT NULL CONSTRAINT [DF_GalvRel_Work] DEFAULT N'',
  [AdditionalWorkOther] NVARCHAR(200) NOT NULL CONSTRAINT [DF_GalvRel_WorkOther] DEFAULT N'',
  [ItemsList] NVARCHAR(MAX) NOT NULL CONSTRAINT [DF_GalvRel_Items] DEFAULT N'',
  [Packaging] NVARCHAR(400) NOT NULL CONSTRAINT [DF_GalvRel_Pack] DEFAULT N'',
  [PackagingOther] NVARCHAR(200) NOT NULL CONSTRAINT [DF_GalvRel_PackOther] DEFAULT N'',
  [Remarks] NVARCHAR(MAX) NOT NULL CONSTRAINT [DF_GalvRel_Remarks] DEFAULT N'',
  [VariationReason] NVARCHAR(MAX) NOT NULL CONSTRAINT [DF_GalvRel_Variation] DEFAULT N'',
  [JobNo] NVARCHAR(80) NOT NULL CONSTRAINT [DF_GalvRel_JobNo] DEFAULT N'',
  [JobDate] NVARCHAR(20) NOT NULL CONSTRAINT [DF_GalvRel_JobDate] DEFAULT N'',
  [QcReportNo] NVARCHAR(80) NOT NULL CONSTRAINT [DF_GalvRel_Qc] DEFAULT N'',
  [QcReportDate] NVARCHAR(20) NOT NULL CONSTRAINT [DF_GalvRel_QcDate] DEFAULT N'',
  [HdgRate] NVARCHAR(80) NOT NULL CONSTRAINT [DF_GalvRel_Rate] DEFAULT N'',
  [OtherCharges] NVARCHAR(200) NOT NULL CONSTRAINT [DF_GalvRel_Charges] DEFAULT N'',
  [DispatchDate] NVARCHAR(20) NOT NULL CONSTRAINT [DF_GalvRel_Dispatch] DEFAULT N'',
  [TicketNo] NVARCHAR(80) NOT NULL CONSTRAINT [DF_GalvRel_OutTicket] DEFAULT N'',
  [GalvanizedWeight] FLOAT NULL,
  [WaybillNo] NVARCHAR(80) NOT NULL CONSTRAINT [DF_GalvRel_Waybill] DEFAULT N'',
  [WaybillDate] NVARCHAR(20) NOT NULL CONSTRAINT [DF_GalvRel_WaybillDate] DEFAULT N'',
  [PaymentReceiptNo] NVARCHAR(80) NOT NULL CONSTRAINT [DF_GalvRel_Payment] DEFAULT N'',
  [PaymentReceiptDate] NVARCHAR(20) NOT NULL CONSTRAINT [DF_GalvRel_PaymentDate] DEFAULT N'',
  [JobId] INT NULL,
  [ReceiptId] INT NULL,
  [IssuedName] NVARCHAR(120) NOT NULL CONSTRAINT [DF_GalvRel_IssuedName] DEFAULT N'',
  [IssuedDesignation] NVARCHAR(120) NOT NULL CONSTRAINT [DF_GalvRel_IssuedRole] DEFAULT N'',
  [IssuedDate] NVARCHAR(20) NOT NULL CONSTRAINT [DF_GalvRel_IssuedDate] DEFAULT N'',
  [ReceivedName] NVARCHAR(120) NOT NULL CONSTRAINT [DF_GalvRel_ReceivedName] DEFAULT N'',
  [ReceivedDesignation] NVARCHAR(120) NOT NULL CONSTRAINT [DF_GalvRel_ReceivedRole] DEFAULT N'',
  [ReceivedDate] NVARCHAR(20) NOT NULL CONSTRAINT [DF_GalvRel_ReceivedDate] DEFAULT N'',
  [ReviewedName] NVARCHAR(120) NOT NULL CONSTRAINT [DF_GalvRel_ReviewedName] DEFAULT N'',
  [ReviewedDesignation] NVARCHAR(120) NOT NULL CONSTRAINT [DF_GalvRel_ReviewedRole] DEFAULT N'',
  [ReviewedDate] NVARCHAR(20) NOT NULL CONSTRAINT [DF_GalvRel_ReviewedDate] DEFAULT N'',
  [ApprovedName] NVARCHAR(120) NOT NULL CONSTRAINT [DF_GalvRel_ApprovedName] DEFAULT N'',
  [ApprovedDesignation] NVARCHAR(120) NOT NULL CONSTRAINT [DF_GalvRel_ApprovedRole] DEFAULT N'',
  [ApprovedDate] NVARCHAR(20) NOT NULL CONSTRAINT [DF_GalvRel_ApprovedDate] DEFAULT N'',
  [CreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_GalvRel_Created] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_GalvRel_Updated] DEFAULT SYSUTCDATETIME(),
  [MaterialRegisterId] INT NULL,
  CONSTRAINT [FK_GalvRel_Job] FOREIGN KEY ([JobId]) REFERENCES [galvanizing].[Jobs]([Id]),
  CONSTRAINT [FK_GalvRel_Receipt] FOREIGN KEY ([ReceiptId]) REFERENCES [galvanizing].[Receipts]([Id])
);

IF OBJECT_ID(N'[galvanizing].[MaterialRegister]', N'U') IS NULL
CREATE TABLE [galvanizing].[MaterialRegister] (
  [Id] INT IDENTITY(1,1) NOT NULL CONSTRAINT [PK_GalvMaterialRegister] PRIMARY KEY,
  [DateReceived] NVARCHAR(20) NOT NULL,
  [ClientName] NVARCHAR(200) NOT NULL,
  [Items] NVARCHAR(500) NOT NULL,
  [JobNo] NVARCHAR(80) NOT NULL CONSTRAINT [UQ_GalvMaterial_JobNo] UNIQUE,
  [WeighMethod] NVARCHAR(20) NOT NULL,
  [VehicleNo] NVARCHAR(50) NOT NULL CONSTRAINT [DF_GalvMat_Vehicle] DEFAULT N'',
  [GrossWeight] FLOAT NULL,
  [EmptyWeight] FLOAT NULL,
  [DirectNetWeight] FLOAT NULL,
  [NoWaybill] NVARCHAR(3) NOT NULL CONSTRAINT [DF_GalvMat_NoWaybill] DEFAULT N'NO',
  [DeliveryNote] NVARCHAR(120) NOT NULL CONSTRAINT [DF_GalvMat_Note] DEFAULT N'',
  [MemoDate] NVARCHAR(20) NOT NULL CONSTRAINT [DF_GalvMat_MemoDate] DEFAULT N'',
  [TicketNumber] NVARCHAR(80) NOT NULL CONSTRAINT [DF_GalvMat_Ticket] DEFAULT N'',
  [MemoVehicle] NVARCHAR(80) NOT NULL CONSTRAINT [DF_GalvMat_MemoVehicle] DEFAULT N'',
  [DeliveryNumber] NVARCHAR(80) NOT NULL CONSTRAINT [DF_GalvMat_Delivery] DEFAULT N'',
  [MemoClientName] NVARCHAR(200) NOT NULL CONSTRAINT [DF_GalvMat_MemoClient] DEFAULT N'',
  [OrderNumber] NVARCHAR(80) NOT NULL CONSTRAINT [DF_GalvMat_Order] DEFAULT N'',
  [TripNo] NVARCHAR(80) NOT NULL CONSTRAINT [DF_GalvMat_Trip] DEFAULT N'',
  [Destination] NVARCHAR(200) NOT NULL CONSTRAINT [DF_GalvMat_Destination] DEFAULT N'',
  [Product] NVARCHAR(MAX) NOT NULL CONSTRAINT [DF_GalvMat_Product] DEFAULT N'',
  [DriverName] NVARCHAR(120) NOT NULL CONSTRAINT [DF_GalvMat_Driver] DEFAULT N'',
  [ClientSignatoryName] NVARCHAR(120) NOT NULL CONSTRAINT [DF_GalvMat_Signatory] DEFAULT N'',
  [CreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_GalvMat_Created] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_GalvMat_Updated] DEFAULT SYSUTCDATETIME()
);

IF COL_LENGTH(N'galvanizing.JobReleases', N'MaterialRegisterId') IS NULL
  ALTER TABLE [galvanizing].[JobReleases] ADD [MaterialRegisterId] INT NULL;

IF OBJECT_ID(N'[galvanizing].[JobReleases]', N'U') IS NOT NULL
AND OBJECT_ID(N'[galvanizing].[MaterialRegister]', N'U') IS NOT NULL
AND COL_LENGTH(N'galvanizing.JobReleases', N'MaterialRegisterId') IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_GalvRel_Material')
  EXEC(N'ALTER TABLE [galvanizing].[JobReleases] ADD CONSTRAINT [FK_GalvRel_Material] FOREIGN KEY ([MaterialRegisterId]) REFERENCES [galvanizing].[MaterialRegister]([Id]);');
`;
