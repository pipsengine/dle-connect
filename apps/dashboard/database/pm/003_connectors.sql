/* Optional connector registry for Project Management integrations
   Apply after 001_project_management_schema.sql
*/
IF OBJECT_ID('pm.Connectors','U') IS NULL
BEGIN
  CREATE TABLE pm.Connectors(
    ConnectorId uniqueidentifier NOT NULL CONSTRAINT PK_pm_Connectors PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    ConnectorCode nvarchar(60) NOT NULL,
    ConnectorName nvarchar(120) NOT NULL,
    VendorName nvarchar(80) NULL,
    Category nvarchar(40) NOT NULL,
    EndpointEnvVar nvarchar(80) NULL,
    Mode nvarchar(80) NULL,
    OwnerTeam nvarchar(80) NULL,
    Status nvarchar(30) NOT NULL DEFAULT 'Not configured',
    LastSyncAt datetime2(3) NULL,
    LastSyncCorrelationId uniqueidentifier NULL,
    ConfigJson nvarchar(max) NULL,
    IsActive bit NOT NULL DEFAULT 1,
    CreatedAt datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
    ModifiedAt datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_pm_Connectors_Code UNIQUE(ConnectorCode)
  );
END
GO

IF OBJECT_ID('pm.ConnectorSyncJobs','U') IS NULL
BEGIN
  CREATE TABLE pm.ConnectorSyncJobs(
    SyncJobId uniqueidentifier NOT NULL CONSTRAINT PK_pm_ConnectorSyncJobs PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    ConnectorId uniqueidentifier NOT NULL,
    ProjectId uniqueidentifier NULL,
    CorrelationId uniqueidentifier NOT NULL,
    RequestedBy uniqueidentifier NULL,
    RequestedAt datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
    StartedAt datetime2(3) NULL,
    CompletedAt datetime2(3) NULL,
    Status nvarchar(30) NOT NULL DEFAULT 'Queued',
    Message nvarchar(500) NULL,
    RecordsProcessed int NULL,
    CONSTRAINT FK_pm_SyncJob_Connector FOREIGN KEY(ConnectorId) REFERENCES pm.Connectors(ConnectorId)
  );
  CREATE INDEX IX_pm_SyncJobs_Status ON pm.ConnectorSyncJobs(Status, RequestedAt DESC);
END
GO
