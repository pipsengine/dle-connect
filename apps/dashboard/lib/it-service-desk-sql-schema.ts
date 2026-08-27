export const ensureItServiceDeskSchemaSql = `
IF SCHEMA_ID(N'it') IS NULL EXEC(N'CREATE SCHEMA [it]');

IF OBJECT_ID(N'[it].[ItsmTickets]', N'U') IS NULL
CREATE TABLE [it].[ItsmTickets] (
  [TicketId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ItsmTickets] PRIMARY KEY,
  [Subject] NVARCHAR(300) NOT NULL,
  [Description] NVARCHAR(MAX) NULL,
  [Status] NVARCHAR(40) NOT NULL,
  [Priority] NVARCHAR(20) NOT NULL,
  [Category] NVARCHAR(80) NULL,
  [Queue] NVARCHAR(80) NULL,
  [RequesterId] NVARCHAR(80) NULL,
  [RequesterName] NVARCHAR(220) NULL,
  [Department] NVARCHAR(180) NULL,
  [AssigneeId] NVARCHAR(80) NULL,
  [AssigneeName] NVARCHAR(220) NULL,
  [Impact] NVARCHAR(40) NULL,
  [Urgency] NVARCHAR(40) NULL,
  [SlaDueAt] DATETIME2(0) NULL,
  [ResolvedAt] DATETIME2(0) NULL,
  [ClosedAt] DATETIME2(0) NULL,
  [IsArchived] BIT NOT NULL CONSTRAINT [DF_ItsmTickets_IsArchived] DEFAULT 0,
  [IsReopened] BIT NOT NULL CONSTRAINT [DF_ItsmTickets_IsReopened] DEFAULT 0,
  [AttachmentMetaJson] NVARCHAR(MAX) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItsmTickets_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItsmTickets_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NULL,
  [UpdatedBy] NVARCHAR(120) NULL
);

IF OBJECT_ID(N'[it].[ItsmTicketComments]', N'U') IS NULL
CREATE TABLE [it].[ItsmTicketComments] (
  [CommentId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ItsmTicketComments] PRIMARY KEY,
  [TicketId] NVARCHAR(40) NOT NULL,
  [Body] NVARCHAR(MAX) NOT NULL,
  [AuthorName] NVARCHAR(220) NOT NULL,
  [AuthorId] NVARCHAR(80) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItsmTicketComments_CreatedAt] DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID(N'[it].[ItsmTicketActivity]', N'U') IS NULL
CREATE TABLE [it].[ItsmTicketActivity] (
  [ActivityId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ItsmTicketActivity] PRIMARY KEY,
  [TicketId] NVARCHAR(40) NOT NULL,
  [Action] NVARCHAR(300) NOT NULL,
  [ActorName] NVARCHAR(220) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItsmTicketActivity_CreatedAt] DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID(N'[it].[ItsmTicketTemplates]', N'U') IS NULL
CREATE TABLE [it].[ItsmTicketTemplates] (
  [TemplateId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ItsmTicketTemplates] PRIMARY KEY,
  [Name] NVARCHAR(200) NOT NULL,
  [Subject] NVARCHAR(300) NOT NULL,
  [Description] NVARCHAR(MAX) NULL,
  [Category] NVARCHAR(80) NULL,
  [Priority] NVARCHAR(20) NULL,
  [IsFavorite] BIT NOT NULL CONSTRAINT [DF_ItsmTicketTemplates_IsFavorite] DEFAULT 0,
  [IsArchived] BIT NOT NULL CONSTRAINT [DF_ItsmTicketTemplates_IsArchived] DEFAULT 0,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItsmTicketTemplates_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItsmTicketTemplates_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NULL,
  [UpdatedBy] NVARCHAR(120) NULL
);

IF OBJECT_ID(N'[it].[ItsmIncidents]', N'U') IS NULL
CREATE TABLE [it].[ItsmIncidents] (
  [IncidentId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ItsmIncidents] PRIMARY KEY,
  [Title] NVARCHAR(300) NOT NULL,
  [Description] NVARCHAR(MAX) NULL,
  [Priority] NVARCHAR(20) NOT NULL,
  [Status] NVARCHAR(40) NOT NULL,
  [Impact] NVARCHAR(200) NULL,
  [AssignedTeam] NVARCHAR(120) NULL,
  [Service] NVARCHAR(180) NULL,
  [IsMajor] BIT NOT NULL CONSTRAINT [DF_ItsmIncidents_IsMajor] DEFAULT 0,
  [WarRoomJson] NVARCHAR(MAX) NULL,
  [SlaDueAt] DATETIME2(0) NULL,
  [ResolvedAt] DATETIME2(0) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItsmIncidents_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItsmIncidents_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NULL,
  [UpdatedBy] NVARCHAR(120) NULL
);

IF OBJECT_ID(N'[it].[ItsmIncidentEvents]', N'U') IS NULL
CREATE TABLE [it].[ItsmIncidentEvents] (
  [EventId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ItsmIncidentEvents] PRIMARY KEY,
  [IncidentId] NVARCHAR(40) NOT NULL,
  [Description] NVARCHAR(MAX) NOT NULL,
  [EventAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItsmIncidentEvents_EventAt] DEFAULT SYSUTCDATETIME(),
  [ActorName] NVARCHAR(220) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItsmIncidentEvents_CreatedAt] DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID(N'[it].[ItsmIncidentRca]', N'U') IS NULL
CREATE TABLE [it].[ItsmIncidentRca] (
  [RcaId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ItsmIncidentRca] PRIMARY KEY,
  [IncidentId] NVARCHAR(40) NOT NULL,
  [PayloadJson] NVARCHAR(MAX) NOT NULL,
  [Status] NVARCHAR(40) NOT NULL CONSTRAINT [DF_ItsmIncidentRca_Status] DEFAULT N'Draft',
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItsmIncidentRca_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItsmIncidentRca_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedBy] NVARCHAR(120) NULL
);

IF OBJECT_ID(N'[it].[ItsmServiceCatalog]', N'U') IS NULL
CREATE TABLE [it].[ItsmServiceCatalog] (
  [ServiceId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ItsmServiceCatalog] PRIMARY KEY,
  [Name] NVARCHAR(200) NOT NULL,
  [Description] NVARCHAR(MAX) NULL,
  [Category] NVARCHAR(80) NULL,
  [EstimatedCompletion] NVARCHAR(80) NULL,
  [ApprovalRequired] BIT NOT NULL CONSTRAINT [DF_ItsmServiceCatalog_ApprovalRequired] DEFAULT 0,
  [IsPopular] BIT NOT NULL CONSTRAINT [DF_ItsmServiceCatalog_IsPopular] DEFAULT 0,
  [IsFeatured] BIT NOT NULL CONSTRAINT [DF_ItsmServiceCatalog_IsFeatured] DEFAULT 0,
  [IsActive] BIT NOT NULL CONSTRAINT [DF_ItsmServiceCatalog_IsActive] DEFAULT 1,
  [SortOrder] INT NOT NULL CONSTRAINT [DF_ItsmServiceCatalog_SortOrder] DEFAULT 0,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItsmServiceCatalog_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItsmServiceCatalog_UpdatedAt] DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID(N'[it].[ItsmServiceRequests]', N'U') IS NULL
CREATE TABLE [it].[ItsmServiceRequests] (
  [RequestId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ItsmServiceRequests] PRIMARY KEY,
  [ServiceId] NVARCHAR(40) NULL,
  [ServiceName] NVARCHAR(200) NOT NULL,
  [Title] NVARCHAR(300) NOT NULL,
  [Description] NVARCHAR(MAX) NULL,
  [Stage] NVARCHAR(40) NOT NULL,
  [Priority] NVARCHAR(20) NULL,
  [RequesterId] NVARCHAR(80) NULL,
  [RequesterName] NVARCHAR(220) NULL,
  [AssigneeName] NVARCHAR(220) NULL,
  [Department] NVARCHAR(180) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItsmServiceRequests_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItsmServiceRequests_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NULL,
  [UpdatedBy] NVARCHAR(120) NULL
);

IF OBJECT_ID(N'[it].[ItsmProblems]', N'U') IS NULL
CREATE TABLE [it].[ItsmProblems] (
  [ProblemId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ItsmProblems] PRIMARY KEY,
  [Title] NVARCHAR(300) NOT NULL,
  [Description] NVARCHAR(MAX) NULL,
  [Status] NVARCHAR(40) NOT NULL,
  [Priority] NVARCHAR(20) NULL,
  [Kind] NVARCHAR(40) NOT NULL CONSTRAINT [DF_ItsmProblems_Kind] DEFAULT N'Problem',
  [Workaround] NVARCHAR(MAX) NULL,
  [RootCause] NVARCHAR(MAX) NULL,
  [LinkedIncidentId] NVARCHAR(40) NULL,
  [OwnerName] NVARCHAR(220) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItsmProblems_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItsmProblems_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NULL,
  [UpdatedBy] NVARCHAR(120) NULL
);

IF OBJECT_ID(N'[it].[ItsmSlaPolicies]', N'U') IS NULL
CREATE TABLE [it].[ItsmSlaPolicies] (
  [PolicyId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ItsmSlaPolicies] PRIMARY KEY,
  [Name] NVARCHAR(200) NOT NULL,
  [Priority] NVARCHAR(20) NOT NULL,
  [ResponseMinutes] INT NOT NULL,
  [ResolveMinutes] INT NOT NULL,
  [IsActive] BIT NOT NULL CONSTRAINT [DF_ItsmSlaPolicies_IsActive] DEFAULT 1,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItsmSlaPolicies_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItsmSlaPolicies_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedBy] NVARCHAR(120) NULL
);

IF OBJECT_ID(N'[it].[ItsmEscalations]', N'U') IS NULL
CREATE TABLE [it].[ItsmEscalations] (
  [EscalationId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ItsmEscalations] PRIMARY KEY,
  [Name] NVARCHAR(200) NOT NULL,
  [TriggerType] NVARCHAR(80) NOT NULL,
  [Target] NVARCHAR(200) NULL,
  [LinkedTicketId] NVARCHAR(40) NULL,
  [Status] NVARCHAR(40) NOT NULL CONSTRAINT [DF_ItsmEscalations_Status] DEFAULT N'Active',
  [Notes] NVARCHAR(MAX) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItsmEscalations_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItsmEscalations_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NULL
);

IF OBJECT_ID(N'[it].[ItsmChanges]', N'U') IS NULL
CREATE TABLE [it].[ItsmChanges] (
  [ChangeId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ItsmChanges] PRIMARY KEY,
  [Title] NVARCHAR(300) NOT NULL,
  [Description] NVARCHAR(MAX) NULL,
  [ChangeType] NVARCHAR(40) NOT NULL,
  [Status] NVARCHAR(40) NOT NULL,
  [CabStatus] NVARCHAR(40) NULL,
  [ScheduledStart] DATETIME2(0) NULL,
  [ScheduledEnd] DATETIME2(0) NULL,
  [RollbackPlan] NVARCHAR(MAX) NULL,
  [OwnerName] NVARCHAR(220) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItsmChanges_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItsmChanges_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NULL,
  [UpdatedBy] NVARCHAR(120) NULL
);

IF OBJECT_ID(N'[it].[ItsmAutomationRules]', N'U') IS NULL
CREATE TABLE [it].[ItsmAutomationRules] (
  [RuleId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ItsmAutomationRules] PRIMARY KEY,
  [Name] NVARCHAR(200) NOT NULL,
  [RuleType] NVARCHAR(60) NOT NULL,
  [IsEnabled] BIT NOT NULL CONSTRAINT [DF_ItsmAutomationRules_IsEnabled] DEFAULT 1,
  [ConfigJson] NVARCHAR(MAX) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItsmAutomationRules_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItsmAutomationRules_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedBy] NVARCHAR(120) NULL
);

IF OBJECT_ID(N'[it].[ItsmSettings]', N'U') IS NULL
CREATE TABLE [it].[ItsmSettings] (
  [SettingId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ItsmSettings] PRIMARY KEY,
  [SettingType] NVARCHAR(60) NOT NULL,
  [Name] NVARCHAR(200) NOT NULL,
  [Value] NVARCHAR(200) NULL,
  [PayloadJson] NVARCHAR(MAX) NULL,
  [SortOrder] INT NOT NULL CONSTRAINT [DF_ItsmSettings_SortOrder] DEFAULT 0,
  [IsActive] BIT NOT NULL CONSTRAINT [DF_ItsmSettings_IsActive] DEFAULT 1,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItsmSettings_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItsmSettings_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedBy] NVARCHAR(120) NULL
);

IF OBJECT_ID(N'[it].[ItsmKbArticles]', N'U') IS NULL
CREATE TABLE [it].[ItsmKbArticles] (
  [ArticleId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ItsmKbArticles] PRIMARY KEY,
  [Title] NVARCHAR(300) NOT NULL,
  [Body] NVARCHAR(MAX) NULL,
  [Keywords] NVARCHAR(500) NULL,
  [IsActive] BIT NOT NULL CONSTRAINT [DF_ItsmKbArticles_IsActive] DEFAULT 1,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItsmKbArticles_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItsmKbArticles_UpdatedAt] DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID(N'[it].[ItsmFeedback]', N'U') IS NULL
CREATE TABLE [it].[ItsmFeedback] (
  [FeedbackId] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ItsmFeedback] PRIMARY KEY,
  [FeedbackType] NVARCHAR(40) NOT NULL,
  [Title] NVARCHAR(300) NULL,
  [Body] NVARCHAR(MAX) NULL,
  [Rating] INT NULL,
  [TicketId] NVARCHAR(40) NULL,
  [AuthorName] NVARCHAR(220) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItsmFeedback_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ItsmFeedback_UpdatedAt] DEFAULT SYSUTCDATETIME()
);
`;
