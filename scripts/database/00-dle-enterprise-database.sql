/*
  DLE Enterprise SQL Server baseline.
  Run from master. Tokens are replaced by Invoke-DleEnterpriseDatabaseSetup.ps1.
*/

USE [master];
GO

IF DB_ID(N'DLE_Enterprise') IS NULL
BEGIN
  CREATE DATABASE [DLE_Enterprise];
END;
GO

ALTER DATABASE [DLE_Enterprise] SET RECOVERY FULL WITH NO_WAIT;
ALTER DATABASE [DLE_Enterprise] SET PAGE_VERIFY CHECKSUM WITH NO_WAIT;
ALTER DATABASE [DLE_Enterprise] SET AUTO_CLOSE OFF WITH NO_WAIT;
ALTER DATABASE [DLE_Enterprise] SET AUTO_SHRINK OFF WITH NO_WAIT;
ALTER DATABASE [DLE_Enterprise] SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE;
ALTER DATABASE [DLE_Enterprise] SET ALLOW_SNAPSHOT_ISOLATION ON;
GO

IF SUSER_ID(N'sa') IS NOT NULL
BEGIN
  ALTER LOGIN [sa] ENABLE;
  ALTER LOGIN [sa] WITH PASSWORD = N'$(SA_PASSWORD)', CHECK_POLICY = ON, CHECK_EXPIRATION = OFF;
END;
GO

USE [DLE_Enterprise];
GO

IF SCHEMA_ID(N'dba') IS NULL EXEC(N'CREATE SCHEMA [dba]');
IF SCHEMA_ID(N'audit') IS NULL EXEC(N'CREATE SCHEMA [audit]');
IF SCHEMA_ID(N'hris') IS NULL EXEC(N'CREATE SCHEMA [hris]');
IF SCHEMA_ID(N'integration') IS NULL EXEC(N'CREATE SCHEMA [integration]');
IF SCHEMA_ID(N'security') IS NULL EXEC(N'CREATE SCHEMA [security]');
GO

CREATE OR ALTER VIEW [dba].[DatabaseProtectionStatus]
AS
SELECT
  d.name AS database_name,
  d.recovery_model_desc,
  d.state_desc,
  d.page_verify_option_desc,
  d.is_auto_close_on,
  d.is_auto_shrink_on,
  d.is_read_committed_snapshot_on,
  d.snapshot_isolation_state_desc,
  MAX(CASE WHEN b.type = 'D' THEN b.backup_finish_date END) AS last_full_backup_at,
  MAX(CASE WHEN b.type = 'L' THEN b.backup_finish_date END) AS last_log_backup_at
FROM sys.databases d
LEFT JOIN msdb.dbo.backupset b
  ON b.database_name = d.name
WHERE d.name = N'DLE_Enterprise'
GROUP BY
  d.name,
  d.recovery_model_desc,
  d.state_desc,
  d.page_verify_option_desc,
  d.is_auto_close_on,
  d.is_auto_shrink_on,
  d.is_read_committed_snapshot_on,
  d.snapshot_isolation_state_desc;
GO
