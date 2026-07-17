param(
  [string]$ServerInstance = 'localhost',
  [string]$SaPassword,
  [string]$BackupCertificatePassword,
  [string]$BackupRoot = 'C:\SQLBackups\DLE_Enterprise'
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($SaPassword)) {
  throw 'Pass -SaPassword or set the DLE_ENTERPRISE_SA_PASSWORD environment variable.'
}

if ([string]::IsNullOrWhiteSpace($BackupCertificatePassword)) {
  $BackupCertificatePassword = $SaPassword
}

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$folders = @(
  $BackupRoot,
  (Join-Path $BackupRoot 'Full'),
  (Join-Path $BackupRoot 'Log'),
  (Join-Path $BackupRoot 'Verify'),
  (Join-Path $BackupRoot 'Keys')
)

foreach ($folder in $folders) {
  New-Item -ItemType Directory -Path $folder -Force | Out-Null
}

Add-Type -AssemblyName System.Data

function Invoke-SqlBatchFile {
  param(
    [Parameter(Mandatory=$true)][string]$Path,
    [Parameter(Mandatory=$true)][hashtable]$Tokens
  )

  $sql = Get-Content -LiteralPath $Path -Raw
  foreach ($key in $Tokens.Keys) {
    $sql = $sql.Replace('$(' + $key + ')', [string]$Tokens[$key])
  }

  $batches = [regex]::Split($sql, '(?im)^\s*GO\s*$') | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
  $connectionString = "Server=$ServerInstance;Database=master;Integrated Security=True;TrustServerCertificate=True"
  $connection = [System.Data.SqlClient.SqlConnection]::new($connectionString)
  $connection.Open()
  try {
    foreach ($batch in $batches) {
      $command = $connection.CreateCommand()
      $command.CommandTimeout = 0
      $command.CommandText = $batch
      [void]$command.ExecuteNonQuery()
      $command.Dispose()
    }
  }
  finally {
    $connection.Close()
    $connection.Dispose()
  }
}

$connectionString = "Server=$ServerInstance;Database=master;Integrated Security=True;TrustServerCertificate=True"
$connection = [System.Data.SqlClient.SqlConnection]::new($connectionString)
$connection.Open()
try {
  $cmd = $connection.CreateCommand()
  $cmd.CommandText = "SELECT CAST(SERVERPROPERTY('InstanceDefaultDataPath') AS nvarchar(260)), CAST(SERVERPROPERTY('InstanceDefaultLogPath') AS nvarchar(260))"
  $reader = $cmd.ExecuteReader()
  [void]$reader.Read()
  $dataPath = [string]$reader.GetValue(0)
  $logPath = [string]$reader.GetValue(1)
  $reader.Close()
}
finally {
  $connection.Close()
  $connection.Dispose()
}

if ([string]::IsNullOrWhiteSpace($dataPath)) { $dataPath = 'C:\Program Files\Microsoft SQL Server\MSSQL17.MSSQLSERVER\MSSQL\DATA\' }
if ([string]::IsNullOrWhiteSpace($logPath)) { $logPath = $dataPath }
if (-not $dataPath.EndsWith('\')) { $dataPath += '\' }
if (-not $logPath.EndsWith('\')) { $logPath += '\' }

$tokens = @{
  SA_PASSWORD = $SaPassword.Replace("'", "''")
  BACKUP_CERT_PASSWORD = $BackupCertificatePassword.Replace("'", "''")
  BACKUP_ROOT = $BackupRoot.TrimEnd('\').Replace("'", "''")
  SQL_DATA_PATH = $dataPath.Replace("'", "''")
  SQL_LOG_PATH = $logPath.Replace("'", "''")
}

Invoke-SqlBatchFile -Path (Join-Path $scriptRoot '00-dle-enterprise-database.sql') -Tokens $tokens
Invoke-SqlBatchFile -Path (Join-Path $scriptRoot '10-dle-enterprise-backup-strategy.sql') -Tokens $tokens
Invoke-SqlBatchFile -Path (Join-Path $scriptRoot '20-dle-enterprise-rbac-foundation.sql') -Tokens $tokens
Invoke-SqlBatchFile -Path (Join-Path $scriptRoot '30-dle-enterprise-employee-onboarding.sql') -Tokens $tokens
Invoke-SqlBatchFile -Path (Join-Path $scriptRoot '40-dle-enterprise-timesheet-foundation.sql') -Tokens $tokens
Invoke-SqlBatchFile -Path (Join-Path $scriptRoot '41-dle-enterprise-organization-departments.sql') -Tokens $tokens
Invoke-SqlBatchFile -Path (Join-Path $scriptRoot '42-dle-enterprise-organization-locations-sites.sql') -Tokens $tokens
Invoke-SqlBatchFile -Path (Join-Path $scriptRoot '43-dle-enterprise-employees-remove-source-soft-delete-columns.sql') -Tokens $tokens
Invoke-SqlBatchFile -Path (Join-Path $scriptRoot '45-dle-enterprise-payroll-runs.sql') -Tokens $tokens
Invoke-SqlBatchFile -Path (Join-Path $scriptRoot '46-dle-enterprise-payroll-periods.sql') -Tokens $tokens
Invoke-SqlBatchFile -Path (Join-Path $scriptRoot '51-dle-enterprise-performance-management.sql') -Tokens $tokens

Write-Host "DLE_Enterprise database baseline, encrypted backup certificate, SQL Agent jobs, monitoring, RBAC foundation, HRIS employee onboarding, timesheet, department, location, payroll runs, payroll period, and performance management entities are configured."
Write-Host "Backup root: $BackupRoot"
