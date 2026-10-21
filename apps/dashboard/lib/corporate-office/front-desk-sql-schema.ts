export const ensureFrontDeskSchemaSql = `
IF SCHEMA_ID(N'corporate') IS NULL EXEC(N'CREATE SCHEMA [corporate]');

IF OBJECT_ID(N'[corporate].[FrontDeskCorrespondence]', N'U') IS NULL
CREATE TABLE [corporate].[FrontDeskCorrespondence] (
  [CorrespondenceId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_FrontDeskCorrespondence] PRIMARY KEY,
  [ReferenceNo] NVARCHAR(40) NOT NULL,
  [DateReceived] DATE NOT NULL,
  [Description] NVARCHAR(2000) NOT NULL,
  [SenderCompany] NVARCHAR(300) NOT NULL,
  [SenderCategory] NVARCHAR(80) NOT NULL CONSTRAINT [DF_FrontDeskCorr_SenderCategory] DEFAULT N'Others',
  [Direction] NVARCHAR(20) NOT NULL CONSTRAINT [DF_FrontDeskCorr_Direction] DEFAULT N'Incoming',
  [Subject] NVARCHAR(500) NULL,
  [WorkflowStatus] NVARCHAR(40) NOT NULL CONSTRAINT [DF_FrontDeskCorr_Workflow] DEFAULT N'New',
  [AssignedEmployeeCode] NVARCHAR(40) NULL,
  [AssignedEmployeeName] NVARCHAR(180) NULL,
  [AcknowledgedAt] DATETIME2(0) NULL,
  [AcknowledgedBy] NVARCHAR(180) NULL,
  [DateSent] DATE NULL,
  [AddressedTo] NVARCHAR(300) NOT NULL,
  [Department] NVARCHAR(120) NOT NULL,
  [CorrespondenceType] NVARCHAR(80) NOT NULL,
  [Copies] INT NOT NULL CONSTRAINT [DF_FrontDeskCorr_Copies] DEFAULT 1,
  [Remarks] NVARCHAR(2000) NULL,
  [Priority] NVARCHAR(20) NOT NULL,
  [DueDate] DATE NULL,
  [Status] NVARCHAR(20) NOT NULL,
  [ClosedBy] NVARCHAR(180) NULL,
  [DateClosed] DATE NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FrontDeskCorr_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FrontDeskCorr_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(180) NULL,
  [UpdatedBy] NVARCHAR(180) NULL
);

IF COL_LENGTH(N'[corporate].[FrontDeskCorrespondence]', N'SenderCategory') IS NULL
  ALTER TABLE [corporate].[FrontDeskCorrespondence]
    ADD [SenderCategory] NVARCHAR(80) NOT NULL CONSTRAINT [DF_FrontDeskCorr_SenderCategory] DEFAULT N'Others';

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE name = N'UX_FrontDeskCorr_Reference' AND object_id = OBJECT_ID(N'[corporate].[FrontDeskCorrespondence]')
)
  CREATE UNIQUE INDEX [UX_FrontDeskCorr_Reference] ON [corporate].[FrontDeskCorrespondence]([ReferenceNo]);

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE name = N'IX_FrontDeskCorr_StatusDate' AND object_id = OBJECT_ID(N'[corporate].[FrontDeskCorrespondence]')
)
  CREATE INDEX [IX_FrontDeskCorr_StatusDate] ON [corporate].[FrontDeskCorrespondence]([Status], [DateReceived]);

IF OBJECT_ID(N'[corporate].[FrontDeskAttachments]', N'U') IS NULL
CREATE TABLE [corporate].[FrontDeskAttachments] (
  [AttachmentId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_FrontDeskAttachments] PRIMARY KEY,
  [CorrespondenceId] NVARCHAR(40) NOT NULL,
  [FileName] NVARCHAR(260) NOT NULL,
  [ContentType] NVARCHAR(120) NOT NULL,
  [SizeBytes] BIGINT NOT NULL CONSTRAINT [DF_FrontDeskAtt_Size] DEFAULT 0,
  [StorageKey] NVARCHAR(500) NOT NULL,
  [AddedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FrontDeskAtt_AddedAt] DEFAULT SYSUTCDATETIME(),
  CONSTRAINT [FK_FrontDeskAtt_Corr] FOREIGN KEY ([CorrespondenceId])
    REFERENCES [corporate].[FrontDeskCorrespondence]([CorrespondenceId]) ON DELETE CASCADE
);

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE name = N'IX_FrontDeskAtt_Corr' AND object_id = OBJECT_ID(N'[corporate].[FrontDeskAttachments]')
)
  CREATE INDEX [IX_FrontDeskAtt_Corr] ON [corporate].[FrontDeskAttachments]([CorrespondenceId]);

IF COL_LENGTH(N'[corporate].[FrontDeskCorrespondence]', N'Direction') IS NULL
  ALTER TABLE [corporate].[FrontDeskCorrespondence] ADD [Direction] NVARCHAR(20) NOT NULL CONSTRAINT [DF_FrontDeskCorr_Direction] DEFAULT N'Incoming';
IF COL_LENGTH(N'[corporate].[FrontDeskCorrespondence]', N'Subject') IS NULL
  ALTER TABLE [corporate].[FrontDeskCorrespondence] ADD [Subject] NVARCHAR(500) NULL;
IF COL_LENGTH(N'[corporate].[FrontDeskCorrespondence]', N'WorkflowStatus') IS NULL
  ALTER TABLE [corporate].[FrontDeskCorrespondence] ADD [WorkflowStatus] NVARCHAR(40) NOT NULL CONSTRAINT [DF_FrontDeskCorr_Workflow] DEFAULT N'New';
IF COL_LENGTH(N'[corporate].[FrontDeskCorrespondence]', N'AssignedEmployeeCode') IS NULL
  ALTER TABLE [corporate].[FrontDeskCorrespondence] ADD [AssignedEmployeeCode] NVARCHAR(40) NULL;
IF COL_LENGTH(N'[corporate].[FrontDeskCorrespondence]', N'AssignedEmployeeName') IS NULL
  ALTER TABLE [corporate].[FrontDeskCorrespondence] ADD [AssignedEmployeeName] NVARCHAR(180) NULL;
IF COL_LENGTH(N'[corporate].[FrontDeskCorrespondence]', N'AcknowledgedAt') IS NULL
  ALTER TABLE [corporate].[FrontDeskCorrespondence] ADD [AcknowledgedAt] DATETIME2(0) NULL;
IF COL_LENGTH(N'[corporate].[FrontDeskCorrespondence]', N'AcknowledgedBy') IS NULL
  ALTER TABLE [corporate].[FrontDeskCorrespondence] ADD [AcknowledgedBy] NVARCHAR(180) NULL;
IF COL_LENGTH(N'[corporate].[FrontDeskCorrespondence]', N'DateSent') IS NULL
  ALTER TABLE [corporate].[FrontDeskCorrespondence] ADD [DateSent] DATE NULL;

IF OBJECT_ID(N'[corporate].[FrontDeskEvents]', N'U') IS NULL
CREATE TABLE [corporate].[FrontDeskEvents] (
  [EventId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_FrontDeskEvents] PRIMARY KEY,
  [CorrespondenceId] NVARCHAR(40) NOT NULL,
  [Action] NVARCHAR(40) NOT NULL,
  [Actor] NVARCHAR(180) NOT NULL,
  [Detail] NVARCHAR(1000) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FrontDeskEvent_CreatedAt] DEFAULT SYSUTCDATETIME(),
  CONSTRAINT [FK_FrontDeskEvent_Corr] FOREIGN KEY ([CorrespondenceId])
    REFERENCES [corporate].[FrontDeskCorrespondence]([CorrespondenceId]) ON DELETE CASCADE
);

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE name = N'IX_FrontDeskEvent_Corr' AND object_id = OBJECT_ID(N'[corporate].[FrontDeskEvents]')
)
  CREATE INDEX [IX_FrontDeskEvent_Corr] ON [corporate].[FrontDeskEvents]([CorrespondenceId], [CreatedAt]);

IF OBJECT_ID(N'[corporate].[FrontDeskRecipients]', N'U') IS NULL
CREATE TABLE [corporate].[FrontDeskRecipients] (
  [RecipientId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_FrontDeskRecipients] PRIMARY KEY,
  [CorrespondenceId] NVARCHAR(40) NOT NULL,
  [EmployeeCode] NVARCHAR(40) NULL,
  [DisplayName] NVARCHAR(180) NOT NULL,
  [AcknowledgedAt] DATETIME2(0) NULL,
  [AcknowledgedBy] NVARCHAR(180) NULL,
  CONSTRAINT [FK_FrontDeskRecipient_Corr] FOREIGN KEY ([CorrespondenceId])
    REFERENCES [corporate].[FrontDeskCorrespondence]([CorrespondenceId]) ON DELETE CASCADE
);

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE name = N'IX_FrontDeskRecipient_Corr' AND object_id = OBJECT_ID(N'[corporate].[FrontDeskRecipients]')
)
  CREATE INDEX [IX_FrontDeskRecipient_Corr] ON [corporate].[FrontDeskRecipients]([CorrespondenceId]);

IF COL_LENGTH(N'[corporate].[FrontDeskCorrespondence]', N'Location') IS NULL
  ALTER TABLE [corporate].[FrontDeskCorrespondence] ADD [Location] NVARCHAR(180) NULL;

IF COL_LENGTH(N'[corporate].[FrontDeskCorrespondence]', N'AddressedEmployeeCode') IS NULL
  ALTER TABLE [corporate].[FrontDeskCorrespondence] ADD [AddressedEmployeeCode] NVARCHAR(40) NULL;

IF OBJECT_ID(N'[corporate].[FrontDeskRoutes]', N'U') IS NULL
CREATE TABLE [corporate].[FrontDeskRoutes] (
  [RouteId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_FrontDeskRoutes] PRIMARY KEY,
  [CorrespondenceId] NVARCHAR(40) NOT NULL,
  [Department] NVARCHAR(120) NOT NULL,
  [IsLead] BIT NOT NULL CONSTRAINT [DF_FrontDeskRoute_Lead] DEFAULT 0,
  [AssigneeEmployeeCode] NVARCHAR(40) NULL,
  [AssigneeEmployeeName] NVARCHAR(180) NULL,
  [HodEmployeeCode] NVARCHAR(40) NULL,
  [HodEmployeeName] NVARCHAR(180) NULL,
  [ActionRequired] NVARCHAR(500) NULL,
  [Priority] NVARCHAR(20) NOT NULL CONSTRAINT [DF_FrontDeskRoute_Priority] DEFAULT N'Medium',
  [DueDate] DATE NULL,
  [Status] NVARCHAR(40) NOT NULL CONSTRAINT [DF_FrontDeskRoute_Status] DEFAULT N'Pending',
  [AcknowledgedAt] DATETIME2(0) NULL,
  [AcknowledgedBy] NVARCHAR(180) NULL,
  [ProgressNote] NVARCHAR(1000) NULL,
  [CompletedAt] DATETIME2(0) NULL,
  [CompletedBy] NVARCHAR(180) NULL,
  [WaivedAt] DATETIME2(0) NULL,
  [WaivedBy] NVARCHAR(180) NULL,
  [WaiveReason] NVARCHAR(500) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FrontDeskRoute_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FrontDeskRoute_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  CONSTRAINT [FK_FrontDeskRoute_Corr] FOREIGN KEY ([CorrespondenceId])
    REFERENCES [corporate].[FrontDeskCorrespondence]([CorrespondenceId]) ON DELETE CASCADE
);

IF OBJECT_ID(N'[corporate].[FrontDeskNotices]', N'U') IS NULL
CREATE TABLE [corporate].[FrontDeskNotices] (
  [NoticeKey] NVARCHAR(200) NOT NULL CONSTRAINT [PK_FrontDeskNotices] PRIMARY KEY,
  [CorrespondenceId] NVARCHAR(40) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FrontDeskNotice_CreatedAt] DEFAULT SYSUTCDATETIME()
);

`;

export const ensureFrontDeskSchemaFollowupSql = `
UPDATE [corporate].[FrontDeskCorrespondence]
SET [WorkflowStatus] = N'Closed'
WHERE [Status] = N'Closed' AND ISNULL([WorkflowStatus], N'') NOT IN (N'Closed', N'Archived');

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE name = N'IX_FrontDeskCorr_DirectionDate' AND object_id = OBJECT_ID(N'[corporate].[FrontDeskCorrespondence]')
)
  CREATE INDEX [IX_FrontDeskCorr_DirectionDate] ON [corporate].[FrontDeskCorrespondence]([Direction], [DateReceived]);

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE name = N'IX_FrontDeskCorr_Assignee' AND object_id = OBJECT_ID(N'[corporate].[FrontDeskCorrespondence]')
)
  CREATE INDEX [IX_FrontDeskCorr_Assignee] ON [corporate].[FrontDeskCorrespondence]([AssignedEmployeeCode], [Status]);

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE name = N'IX_FrontDeskRoute_Corr' AND object_id = OBJECT_ID(N'[corporate].[FrontDeskRoutes]')
)
  CREATE INDEX [IX_FrontDeskRoute_Corr] ON [corporate].[FrontDeskRoutes]([CorrespondenceId], [Status]);

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE name = N'UX_FrontDeskRoute_Department' AND object_id = OBJECT_ID(N'[corporate].[FrontDeskRoutes]')
)
  CREATE UNIQUE INDEX [UX_FrontDeskRoute_Department] ON [corporate].[FrontDeskRoutes]([CorrespondenceId], [Department]);
`;
