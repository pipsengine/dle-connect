/*
  Production-ready backup strategy for DLE_Enterprise.
  Run from master. Tokens are replaced by Invoke-DleEnterpriseDatabaseSetup.ps1.
*/

USE [master];
GO

IF NOT EXISTS (SELECT 1 FROM sys.symmetric_keys WHERE name = N'##MS_DatabaseMasterKey##')
BEGIN
  CREATE MASTER KEY ENCRYPTION BY PASSWORD = N'$(BACKUP_CERT_PASSWORD)';
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.certificates WHERE name = N'DLE_Enterprise_BackupCert')
BEGIN
  CREATE CERTIFICATE [DLE_Enterprise_BackupCert]
    WITH SUBJECT = N'DLE_Enterprise encrypted backup certificate',
         EXPIRY_DATE = '20351231';
END;
GO

IF NOT EXISTS (
  SELECT 1
  FROM msdb.dbo.sysoperators
  WHERE name = N'DLE DBA'
)
BEGIN
  EXEC msdb.dbo.sp_add_operator
    @name = N'DLE DBA',
    @enabled = 1;
END;
GO

DECLARE @BackupRoot nvarchar(260) = N'$(BACKUP_ROOT)';
DECLARE @CertFile nvarchar(4000) = @BackupRoot + N'\Keys\DLE_Enterprise_BackupCert.cer';
DECLARE @KeyFile nvarchar(4000) = @BackupRoot + N'\Keys\DLE_Enterprise_BackupCert_PrivateKey.pvk';
DECLARE @sql nvarchar(max);

IF NOT EXISTS (
  SELECT 1
  FROM sys.certificates
  WHERE name = N'DLE_Enterprise_BackupCert'
    AND pvt_key_encryption_type_desc <> N'NO_PRIVATE_KEY'
)
BEGIN
  THROW 51000, 'Backup certificate private key is not available. Recreate/import the certificate before configuring encrypted backups.', 1;
END;

SET @sql = N'
BACKUP CERTIFICATE [DLE_Enterprise_BackupCert]
TO FILE = N''' + REPLACE(@CertFile, '''', '''''') + N'''
WITH PRIVATE KEY (
  FILE = N''' + REPLACE(@KeyFile, '''', '''''') + N''',
  ENCRYPTION BY PASSWORD = N''$(BACKUP_CERT_PASSWORD)''
);';

BEGIN TRY
  EXEC (@sql);
END TRY
BEGIN CATCH
  IF ERROR_NUMBER() NOT IN (15240, 15247, 15310)
    THROW;
END CATCH;
GO

USE [DLE_Enterprise];
GO

IF OBJECT_ID(N'dba.BackupHealthLog', N'U') IS NULL
BEGIN
  CREATE TABLE [dba].[BackupHealthLog] (
    backup_health_log_id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_BackupHealthLog PRIMARY KEY,
    checked_at datetime2(0) NOT NULL CONSTRAINT DF_BackupHealthLog_checked_at DEFAULT SYSUTCDATETIME(),
    database_name sysname NOT NULL,
    last_full_backup_at datetime NULL,
    last_log_backup_at datetime NULL,
    full_backup_age_hours int NULL,
    log_backup_age_minutes int NULL,
    status varchar(20) NOT NULL,
    message nvarchar(1000) NOT NULL
  );
END;
GO

CREATE OR ALTER PROCEDURE [dba].[usp_CheckBackupHealth]
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE
    @lastFull datetime,
    @lastLog datetime,
    @fullAgeHours int,
    @logAgeMinutes int,
    @status varchar(20) = 'OK',
    @message nvarchar(1000) = N'Backup health is within policy.';

  SELECT @lastFull = MAX(backup_finish_date)
  FROM msdb.dbo.backupset
  WHERE database_name = N'DLE_Enterprise'
    AND type = 'D'
    AND is_copy_only = 0;

  SELECT @lastLog = MAX(backup_finish_date)
  FROM msdb.dbo.backupset
  WHERE database_name = N'DLE_Enterprise'
    AND type = 'L';

  SET @fullAgeHours = CASE WHEN @lastFull IS NULL THEN NULL ELSE DATEDIFF(HOUR, @lastFull, GETDATE()) END;
  SET @logAgeMinutes = CASE WHEN @lastLog IS NULL THEN NULL ELSE DATEDIFF(MINUTE, @lastLog, GETDATE()) END;

  IF @lastFull IS NULL OR @fullAgeHours > 26
  BEGIN
    SET @status = 'CRITICAL';
    SET @message = N'Daily full backup is missing or older than 26 hours.';
  END
  ELSE IF @lastLog IS NULL OR @logAgeMinutes > 90
  BEGIN
    SET @status = 'CRITICAL';
    SET @message = N'Hourly transaction log backup is missing or older than 90 minutes.';
  END;

  INSERT [dba].[BackupHealthLog] (
    database_name,
    last_full_backup_at,
    last_log_backup_at,
    full_backup_age_hours,
    log_backup_age_minutes,
    status,
    message
  )
  VALUES (
    N'DLE_Enterprise',
    @lastFull,
    @lastLog,
    @fullAgeHours,
    @logAgeMinutes,
    @status,
    @message
  );

  IF @status = 'CRITICAL'
    THROW 51001, @message, 1;
END;
GO

USE [msdb];
GO

DECLARE @BackupRoot nvarchar(260) = N'$(BACKUP_ROOT)';
DECLARE @FullDir nvarchar(260) = @BackupRoot + N'\Full';
DECLARE @LogDir nvarchar(260) = @BackupRoot + N'\Log';
DECLARE @DataPath nvarchar(260) = CAST(SERVERPROPERTY('InstanceDefaultDataPath') AS nvarchar(260));
DECLARE @LogPath nvarchar(260) = CAST(SERVERPROPERTY('InstanceDefaultLogPath') AS nvarchar(260));

IF @DataPath IS NULL OR LEN(@DataPath) = 0 SET @DataPath = N'$(SQL_DATA_PATH)';
IF @LogPath IS NULL OR LEN(@LogPath) = 0 SET @LogPath = @DataPath;

DECLARE @jobId uniqueidentifier;

IF EXISTS (SELECT 1 FROM msdb.dbo.sysjobs WHERE name = N'DLE_Enterprise - Daily FULL Backup')
  EXEC msdb.dbo.sp_delete_job @job_name = N'DLE_Enterprise - Daily FULL Backup', @delete_unused_schedule = 1;

SET @jobId = NULL;
EXEC msdb.dbo.sp_add_job
  @job_name = N'DLE_Enterprise - Daily FULL Backup',
  @enabled = 1,
  @description = N'Daily encrypted full backup with checksum and compression for DLE_Enterprise.',
  @category_name = N'Database Maintenance',
  @job_id = @jobId OUTPUT;

EXEC msdb.dbo.sp_add_jobstep
  @job_id = @jobId,
  @step_name = N'Backup database',
  @subsystem = N'TSQL',
  @database_name = N'master',
  @command = N'
DECLARE @file nvarchar(4000) =
  N''$(BACKUP_ROOT)\Full\DLE_Enterprise_FULL_'' +
  REPLACE(REPLACE(CONVERT(varchar(19), SYSDATETIME(), 126), '':'', ''''), ''-'', '''') +
  N''.bak'';

BACKUP DATABASE [DLE_Enterprise]
TO DISK = @file
WITH INIT,
     COMPRESSION,
     CHECKSUM,
     STATS = 10,
     ENCRYPTION (ALGORITHM = AES_256, SERVER CERTIFICATE = [DLE_Enterprise_BackupCert]);',
  @retry_attempts = 2,
  @retry_interval = 5;

EXEC msdb.dbo.sp_add_schedule
  @schedule_name = N'DLE_Enterprise - Daily 23:00 Full Backup',
  @enabled = 1,
  @freq_type = 4,
  @freq_interval = 1,
  @freq_recurrence_factor = 1,
  @active_start_time = 230000;

EXEC msdb.dbo.sp_attach_schedule
  @job_id = @jobId,
  @schedule_name = N'DLE_Enterprise - Daily 23:00 Full Backup';

EXEC msdb.dbo.sp_add_jobserver @job_id = @jobId;

IF EXISTS (SELECT 1 FROM msdb.dbo.sysjobs WHERE name = N'DLE_Enterprise - Hourly LOG Backup')
  EXEC msdb.dbo.sp_delete_job @job_name = N'DLE_Enterprise - Hourly LOG Backup', @delete_unused_schedule = 1;

SET @jobId = NULL;
EXEC msdb.dbo.sp_add_job
  @job_name = N'DLE_Enterprise - Hourly LOG Backup',
  @enabled = 1,
  @description = N'Hourly encrypted transaction log backup with checksum and compression for DLE_Enterprise.',
  @category_name = N'Database Maintenance',
  @job_id = @jobId OUTPUT;

EXEC msdb.dbo.sp_add_jobstep
  @job_id = @jobId,
  @step_name = N'Backup transaction log',
  @subsystem = N'TSQL',
  @database_name = N'master',
  @command = N'
IF NOT EXISTS (
  SELECT 1 FROM msdb.dbo.backupset
  WHERE database_name = N''DLE_Enterprise''
    AND type = ''D''
    AND is_copy_only = 0
)
BEGIN
  RAISERROR(''A full backup is required before transaction log backups can run.'', 16, 1);
  RETURN;
END;

DECLARE @file nvarchar(4000) =
  N''$(BACKUP_ROOT)\Log\DLE_Enterprise_LOG_'' +
  REPLACE(REPLACE(CONVERT(varchar(19), SYSDATETIME(), 126), '':'', ''''), ''-'', '''') +
  N''.trn'';

BACKUP LOG [DLE_Enterprise]
TO DISK = @file
WITH INIT,
     COMPRESSION,
     CHECKSUM,
     STATS = 10,
     ENCRYPTION (ALGORITHM = AES_256, SERVER CERTIFICATE = [DLE_Enterprise_BackupCert]);',
  @retry_attempts = 2,
  @retry_interval = 5;

EXEC msdb.dbo.sp_add_schedule
  @schedule_name = N'DLE_Enterprise - Hourly Log Backup',
  @enabled = 1,
  @freq_type = 4,
  @freq_interval = 1,
  @freq_recurrence_factor = 1,
  @freq_subday_type = 8,
  @freq_subday_interval = 1,
  @active_start_time = 000000;

EXEC msdb.dbo.sp_attach_schedule
  @job_id = @jobId,
  @schedule_name = N'DLE_Enterprise - Hourly Log Backup';

EXEC msdb.dbo.sp_add_jobserver @job_id = @jobId;

IF EXISTS (SELECT 1 FROM msdb.dbo.sysjobs WHERE name = N'DLE_Enterprise - Weekly VERIFY and Restore Test')
  EXEC msdb.dbo.sp_delete_job @job_name = N'DLE_Enterprise - Weekly VERIFY and Restore Test', @delete_unused_schedule = 1;

SET @jobId = NULL;
EXEC msdb.dbo.sp_add_job
  @job_name = N'DLE_Enterprise - Weekly VERIFY and Restore Test',
  @enabled = 1,
  @description = N'Weekly RESTORE VERIFYONLY plus test restore and DBCC CHECKDB PHYSICAL_ONLY.',
  @category_name = N'Database Maintenance',
  @job_id = @jobId OUTPUT;

EXEC msdb.dbo.sp_add_jobstep
  @job_id = @jobId,
  @step_name = N'Verify and test restore latest full backup',
  @subsystem = N'TSQL',
  @database_name = N'master',
  @command = N'
DECLARE @backupFile nvarchar(4000);

SELECT TOP (1) @backupFile = mf.physical_device_name
FROM msdb.dbo.backupset bs
JOIN msdb.dbo.backupmediafamily mf ON mf.media_set_id = bs.media_set_id
WHERE bs.database_name = N''DLE_Enterprise''
  AND bs.type = ''D''
ORDER BY bs.backup_finish_date DESC;

IF @backupFile IS NULL
  THROW 51002, ''No full backup found for DLE_Enterprise.'', 1;

RESTORE VERIFYONLY
FROM DISK = @backupFile
WITH CHECKSUM;

IF DB_ID(N''DLE_Enterprise_RestoreTest'') IS NOT NULL
BEGIN
  ALTER DATABASE [DLE_Enterprise_RestoreTest] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
  DROP DATABASE [DLE_Enterprise_RestoreTest];
END;

RESTORE DATABASE [DLE_Enterprise_RestoreTest]
FROM DISK = @backupFile
WITH MOVE N''DLE_Enterprise'' TO N''$(SQL_DATA_PATH)DLE_Enterprise_RestoreTest.mdf'',
     MOVE N''DLE_Enterprise_log'' TO N''$(SQL_LOG_PATH)DLE_Enterprise_RestoreTest_log.ldf'',
     REPLACE,
     RECOVERY,
     CHECKSUM,
     STATS = 10;

DBCC CHECKDB ([DLE_Enterprise_RestoreTest]) WITH NO_INFOMSGS, PHYSICAL_ONLY;
ALTER DATABASE [DLE_Enterprise_RestoreTest] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
DROP DATABASE [DLE_Enterprise_RestoreTest];',
  @retry_attempts = 1,
  @retry_interval = 10;

EXEC msdb.dbo.sp_add_schedule
  @schedule_name = N'DLE_Enterprise - Weekly Sunday 03:00 Verify Restore',
  @enabled = 1,
  @freq_type = 8,
  @freq_interval = 1,
  @freq_recurrence_factor = 1,
  @active_start_time = 030000;

EXEC msdb.dbo.sp_attach_schedule
  @job_id = @jobId,
  @schedule_name = N'DLE_Enterprise - Weekly Sunday 03:00 Verify Restore';

EXEC msdb.dbo.sp_add_jobserver @job_id = @jobId;

IF EXISTS (SELECT 1 FROM msdb.dbo.sysjobs WHERE name = N'DLE_Enterprise - Backup Retention Cleanup')
  EXEC msdb.dbo.sp_delete_job @job_name = N'DLE_Enterprise - Backup Retention Cleanup', @delete_unused_schedule = 1;

SET @jobId = NULL;
EXEC msdb.dbo.sp_add_job
  @job_name = N'DLE_Enterprise - Backup Retention Cleanup',
  @enabled = 1,
  @description = N'Delete old backup files according to DLE retention policy.',
  @category_name = N'Database Maintenance',
  @job_id = @jobId OUTPUT;

EXEC msdb.dbo.sp_add_jobstep
  @job_id = @jobId,
  @step_name = N'Retain full 35 days, log 8 days',
  @subsystem = N'TSQL',
  @database_name = N'master',
  @command = N'
DECLARE @fullCutoff datetime = DATEADD(DAY, -35, GETDATE());
DECLARE @logCutoff datetime = DATEADD(DAY, -8, GETDATE());

EXEC master.dbo.xp_delete_file 0, N''$(BACKUP_ROOT)\Full'', N''bak'', @fullCutoff, 1;
EXEC master.dbo.xp_delete_file 0, N''$(BACKUP_ROOT)\Log'', N''trn'', @logCutoff, 1;',
  @retry_attempts = 1,
  @retry_interval = 10;

EXEC msdb.dbo.sp_add_schedule
  @schedule_name = N'DLE_Enterprise - Daily 02:00 Backup Cleanup',
  @enabled = 1,
  @freq_type = 4,
  @freq_interval = 1,
  @freq_recurrence_factor = 1,
  @active_start_time = 020000;

EXEC msdb.dbo.sp_attach_schedule
  @job_id = @jobId,
  @schedule_name = N'DLE_Enterprise - Daily 02:00 Backup Cleanup';

EXEC msdb.dbo.sp_add_jobserver @job_id = @jobId;

IF EXISTS (SELECT 1 FROM msdb.dbo.sysjobs WHERE name = N'DLE_Enterprise - Backup Health Monitor')
  EXEC msdb.dbo.sp_delete_job @job_name = N'DLE_Enterprise - Backup Health Monitor', @delete_unused_schedule = 1;

SET @jobId = NULL;
EXEC msdb.dbo.sp_add_job
  @job_name = N'DLE_Enterprise - Backup Health Monitor',
  @enabled = 1,
  @description = N'Raises a SQL Agent failure if DLE_Enterprise backup RPO policy is breached.',
  @category_name = N'Database Maintenance',
  @job_id = @jobId OUTPUT;

EXEC msdb.dbo.sp_add_jobstep
  @job_id = @jobId,
  @step_name = N'Check backup recency',
  @subsystem = N'TSQL',
  @database_name = N'DLE_Enterprise',
  @command = N'EXEC [dba].[usp_CheckBackupHealth];',
  @retry_attempts = 0;

EXEC msdb.dbo.sp_add_schedule
  @schedule_name = N'DLE_Enterprise - Every 30 Minutes Backup Health',
  @enabled = 1,
  @freq_type = 4,
  @freq_interval = 1,
  @freq_recurrence_factor = 1,
  @freq_subday_type = 4,
  @freq_subday_interval = 30,
  @active_start_time = 000000;

EXEC msdb.dbo.sp_attach_schedule
  @job_id = @jobId,
  @schedule_name = N'DLE_Enterprise - Every 30 Minutes Backup Health';

EXEC msdb.dbo.sp_add_jobserver @job_id = @jobId;
GO
