export const ensureVisitorSchemaSql = `
IF SCHEMA_ID(N'security') IS NULL EXEC(N'CREATE SCHEMA [security]');

IF OBJECT_ID(N'[security].[VisitorVisits]', N'U') IS NULL
CREATE TABLE [security].[VisitorVisits] (
  [VisitId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_VisitorVisits] PRIMARY KEY,
  [VisitorName] NVARCHAR(180) NOT NULL,
  [Phone] NVARCHAR(40) NULL,
  [Email] NVARCHAR(180) NULL,
  [Company] NVARCHAR(180) NULL,
  [VisitorType] NVARCHAR(80) NULL,
  [Nationality] NVARCHAR(80) NULL,
  [VisitDate] DATE NULL,
  [VisitTime] NVARCHAR(20) NULL,
  [DurationLabel] NVARCHAR(40) NULL,
  [Purpose] NVARCHAR(500) NULL,
  [HostName] NVARCHAR(180) NULL,
  [HostEmployeeCode] NVARCHAR(40) NULL,
  [Department] NVARCHAR(180) NULL,
  [LocationName] NVARCHAR(180) NULL,
  [MeetingRoom] NVARCHAR(180) NULL,
  [FloorLabel] NVARCHAR(80) NULL,
  [HostPhone] NVARCHAR(40) NULL,
  [IdType] NVARCHAR(80) NULL,
  [IdNumber] NVARCHAR(80) NULL,
  [ItemsCarried] NVARCHAR(500) NULL,
  [VehicleRegistered] NVARCHAR(180) NULL,
  [Notes] NVARCHAR(2000) NULL,
  [Priority] NVARCHAR(20) NOT NULL CONSTRAINT [DF_VisitorVisits_Priority] DEFAULT N'Medium',
  [Status] NVARCHAR(40) NOT NULL CONSTRAINT [DF_VisitorVisits_Status] DEFAULT N'Pending Approval',
  [ApprovalNote] NVARCHAR(1000) NULL,
  [IdVerified] BIT NOT NULL CONSTRAINT [DF_VisitorVisits_IdVerified] DEFAULT 0,
  [BadgeNumber] NVARCHAR(40) NULL,
  [BadgeStatus] NVARCHAR(40) NULL,
  [BadgeTemplate] NVARCHAR(120) NULL,
  [CheckInAt] DATETIME2(0) NULL,
  [CheckOutAt] DATETIME2(0) NULL,
  [IsVip] BIT NOT NULL CONSTRAINT [DF_VisitorVisits_IsVip] DEFAULT 0,
  [Blacklisted] BIT NOT NULL CONSTRAINT [DF_VisitorVisits_Blacklisted] DEFAULT 0,
  [AttachmentsJson] NVARCHAR(MAX) NULL,
  [TimelineJson] NVARCHAR(MAX) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_VisitorVisits_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_VisitorVisits_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(180) NULL,
  [UpdatedBy] NVARCHAR(180) NULL
);

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE name = N'IX_VisitorVisits_StatusDate' AND object_id = OBJECT_ID(N'[security].[VisitorVisits]')
)
  CREATE INDEX [IX_VisitorVisits_StatusDate] ON [security].[VisitorVisits]([Status], [VisitDate]);

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE name = N'IX_VisitorVisits_Host' AND object_id = OBJECT_ID(N'[security].[VisitorVisits]')
)
  CREATE INDEX [IX_VisitorVisits_Host] ON [security].[VisitorVisits]([HostName]);

IF COL_LENGTH(N'[security].[VisitorVisits]', N'RequesterEmail') IS NULL
  ALTER TABLE [security].[VisitorVisits] ADD [RequesterEmail] NVARCHAR(180) NULL;

IF COL_LENGTH(N'[security].[VisitorVisits]', N'RequesterEmployeeCode') IS NULL
  ALTER TABLE [security].[VisitorVisits] ADD [RequesterEmployeeCode] NVARCHAR(40) NULL;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE name = N'IX_VisitorVisits_Requester' AND object_id = OBJECT_ID(N'[security].[VisitorVisits]')
)
  CREATE INDEX [IX_VisitorVisits_Requester] ON [security].[VisitorVisits]([RequesterEmployeeCode]);

IF OBJECT_ID(N'[security].[VisitorEvents]', N'U') IS NULL
CREATE TABLE [security].[VisitorEvents] (
  [EventId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_VisitorEvents] PRIMARY KEY,
  [VisitId] NVARCHAR(40) NOT NULL,
  [Action] NVARCHAR(80) NOT NULL,
  [Actor] NVARCHAR(180) NOT NULL,
  [Detail] NVARCHAR(1000) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_VisitorEvents_CreatedAt] DEFAULT SYSUTCDATETIME(),
  CONSTRAINT [FK_VisitorEvents_Visit] FOREIGN KEY ([VisitId])
    REFERENCES [security].[VisitorVisits]([VisitId]) ON DELETE CASCADE
);

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE name = N'IX_VisitorEvents_Visit' AND object_id = OBJECT_ID(N'[security].[VisitorEvents]')
)
  CREATE INDEX [IX_VisitorEvents_Visit] ON [security].[VisitorEvents]([VisitId], [CreatedAt]);

IF OBJECT_ID(N'[security].[VisitorArtifacts]', N'U') IS NULL
CREATE TABLE [security].[VisitorArtifacts] (
  [ArtifactId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_VisitorArtifacts] PRIMARY KEY,
  [Kind] NVARCHAR(40) NOT NULL,
  [Name] NVARCHAR(200) NOT NULL,
  [PayloadJson] NVARCHAR(MAX) NOT NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_VisitorArtifacts_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_VisitorArtifacts_UpdatedAt] DEFAULT SYSUTCDATETIME()
);

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE name = N'IX_VisitorArtifacts_Kind' AND object_id = OBJECT_ID(N'[security].[VisitorArtifacts]')
)
  CREATE INDEX [IX_VisitorArtifacts_Kind] ON [security].[VisitorArtifacts]([Kind], [UpdatedAt]);
`;
