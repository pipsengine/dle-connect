# DLE_Enterprise SQL Server Database Operations

This folder contains the SQL Server setup and backup strategy for `DLE_Enterprise`.

## Setup

Run from PowerShell as a Windows account with SQL Server `sysadmin` rights:

```powershell
$env:DLE_ENTERPRISE_SA_PASSWORD = '<secure password>'
.\scripts\database\Invoke-DleEnterpriseDatabaseSetup.ps1 `
  -ServerInstance localhost `
  -SaPassword $env:DLE_ENTERPRISE_SA_PASSWORD `
  -BackupCertificatePassword $env:DLE_ENTERPRISE_SA_PASSWORD `
  -BackupRoot 'C:\SQLBackups\DLE_Enterprise'
```

## Backup Policy

- Recovery model: `FULL`
- Full backups: daily at 23:00
- Transaction log backups: every 5 minutes (near real-time RPO)
- Verification and restore testing: weekly on Sunday at 03:00
- Retention:
  - Full backups: 35 days
  - Log backups: 8 days
- Backup encryption: AES-256 using `master.dbo.DLE_Enterprise_BackupCert`
- Backup options: `COMPRESSION`, `CHECKSUM`, `INIT`

## Storage Recommendations

- Keep `C:\SQLBackups\DLE_Enterprise` on storage separate from SQL data and log files in production.
- Replicate backup files off-host after each successful job, ideally to immutable/object storage.
- Restrict the `Keys` folder to SQL Server service account and DBA administrators only.
- Store a separate offline copy of:
  - `DLE_Enterprise_BackupCert.cer`
  - `DLE_Enterprise_BackupCert_PrivateKey.pvk`
  - the private-key password

Encrypted backups cannot be restored without this certificate/private key.

## SQL Server Agent Jobs

- `DLE_Enterprise - Daily FULL Backup`
- `DLE_Enterprise - Real-time LOG Backup` (every 5 minutes)
- `DLE_Enterprise - Weekly VERIFY and Restore Test`
- `DLE_Enterprise - Backup Retention Cleanup`
- `DLE_Enterprise - Backup Health Monitor`

## Monitoring

The setup creates:

- `[DLE_Enterprise].[dba].[DatabaseProtectionStatus]`
- `[DLE_Enterprise].[dba].[BackupHealthLog]`
- `[DLE_Enterprise].[dba].[usp_CheckBackupHealth]`

The monitor job fails if:

- the latest full backup is missing or older than 26 hours
- the latest log backup is missing or older than 15 minutes

## Application scheduler (dashboard)

The dashboard also runs `DLE Backup Scheduler` (see `apps/dashboard/lib/backup-scheduler.ts`):

- Starts with the Node process via `instrumentation.ts`
- Executes **Automated** policies from Backup & Disaster Recovery (full/log/diff DB + application/config file backups)
- Default near-real-time log policy: every 5 minutes
- Default application file backup: every 15 minutes to `{Primary Backup}\Application\`

Configure the **Primary Backup** location before automated runs succeed.
## Payroll cutover backups (HRIS)

When a payroll period is fully posted and closed through the payroll workflow, HRIS automatically:

1. Runs a **verified full database backup** (`BACKUP DATABASE` + `RESTORE VERIFYONLY`)
2. Stores the file under `{Primary Backup}\PayrollCutover\{YYYY-MM}\`
3. Records the cutover in Backup & Disaster Recovery audit history
4. **Blocks opening the next payroll period** until that verified backup exists

Environment flags:

- `HRIS_PAYROLL_CUTOVER_BACKUP_ENABLED` — default `true`
- `HRIS_PAYROLL_CUTOVER_BACKUP_BLOCK_OPEN` — default `true` (gate next period open)

Daily SQL Agent backups remain the baseline; payroll cutover backups are an additional recovery point taken at payroll month-end before the next period opens.

Manual retry: run **Full Backup** from Administration → Backup & Disaster Recovery, or close the period again through payroll workflow (skipped if a successful cutover backup already exists for that period).

Configure Database Mail and SQL Agent alert notifications for job failures in production.

## RBAC Foundation

`20-dle-enterprise-rbac-foundation.sql` creates the role-management foundation only:

- `security.RoleCategories`
- `security.Roles`
- `security.RoleHierarchy`
- `security.RoleAuditLog`
- `security.ActiveRoles`
- `security.usp_SoftDeleteRole`

The script seeds approved DLE roles across Executive, Management, Lead, Supervisor, Operational, System Administration, External, and Employee categories. It does not create application users and does not create user-role mappings. User import and `security.UserRoles` should be added later after Sage user records are available.

## HRIS Employee Onboarding Foundation

`30-dle-enterprise-employee-onboarding.sql` creates the durable database entities used by the Add New Employee page:

- `hris.EmployeeDrafts`
- `hris.Employees`
- `hris.EmployeePersonalInfo`
- `hris.EmployeeContactInfo`
- `hris.EmployeeEmploymentInfo`
- `hris.EmployeeJobInfo`
- `hris.EmployeeEmergencyContacts`
- `hris.EmployeeDocuments`
- `hris.EmployeePayrollSetup`
- `hris.EmployeeOnboardingChecklist`
- `hris.EmployeeDraftAuditLog`
- `hris.EmployeeAuditLog`
- `hris.EmployeeMasterView`

Drafts are stored as validated JSON with indexed snapshot columns for duplicate checks and review queues. Final employee creation is normalized into separate HRIS tables with foreign keys, check constraints, unique constraints, filtered indexes, audit columns, row versions, and soft-delete support on the employee master record.

## Recovery Procedure

For point-in-time recovery:

1. Stop application writes or record the incident time.
2. Back up the tail of the log if the source database is available:
   `BACKUP LOG [DLE_Enterprise] TO DISK = '<tail-log-file>' WITH NO_TRUNCATE, CHECKSUM;`
3. Restore the latest full backup with `NORECOVERY`.
4. Restore each transaction log backup in sequence with `NORECOVERY`.
5. Restore the final log with `STOPAT = '<incident-safe-time>'` and `RECOVERY`.
6. Run validation checks before reconnecting the application.

For encrypted backup restore on another server, first restore the master key and certificate/private key.
