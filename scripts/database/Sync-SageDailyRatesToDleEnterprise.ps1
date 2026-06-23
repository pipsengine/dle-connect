param(
  [string]$DleServerInstance = 'localhost',
  [string]$DleDatabase = 'DLE_Enterprise',
  [switch]$Overwrite,
  [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'

function Read-DotEnv {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return }
  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#') -or $line -notmatch '=') { return }
    $parts = $line.Split('=', 2)
    $name = $parts[0].Trim()
    $value = $parts[1].Trim().Trim('"').Trim("'")
    if (-not [Environment]::GetEnvironmentVariable($name, 'Process')) {
      [Environment]::SetEnvironmentVariable($name, $value, 'Process')
    }
  }
}

Read-DotEnv -Path (Join-Path (Get-Location) '.env')
Read-DotEnv -Path (Join-Path (Get-Location) 'apps\dashboard\.env')
Read-DotEnv -Path (Join-Path (Get-Location) 'deployment\iis\site\.env')
Read-DotEnv -Path (Join-Path (Get-Location) 'deployment\iis\site\apps\dashboard\.env')

function EnvOrDefault {
  param([string]$Name, [string]$Default = '')
  $value = [Environment]::GetEnvironmentVariable($Name, 'Process')
  if ([string]::IsNullOrWhiteSpace($value)) { return $Default }
  return $value
}

function Get-Field {
  param($Row, [string]$Name)
  if ($null -eq $Row) { return $null }
  try { return $Row[$Name] } catch {}
  try { return $Row.$Name } catch {}
  return $null
}

function Normalize-String {
  param($Value)
  if ($null -eq $Value -or $Value -is [DBNull]) { return '' }
  return ([string]$Value).Trim()
}

function Normalize-Money {
  param($Value)
  if ($null -eq $Value -or $Value -is [DBNull]) { return [DBNull]::Value }
  try {
    $number = [decimal]$Value
    if ($number -le 0) { return [DBNull]::Value }
    return $number
  } catch {
    return [DBNull]::Value
  }
}

$sageHost = EnvOrDefault 'SAGE_PAYROLL_DB_HOST' '192.168.5.8'
$sagePort = [int](EnvOrDefault 'SAGE_PAYROLL_DB_PORT' '1433')
$sageDb = EnvOrDefault 'SAGE_PAYROLL_DB_NAME' 'DLE_JUNE'
$sageUser = EnvOrDefault 'SAGE_PAYROLL_DB_USER' 'sa'
$sagePassword = EnvOrDefault 'SAGE_PAYROLL_DB_PASSWORD'
$sageInstance = EnvOrDefault 'SAGE_PAYROLL_DB_INSTANCE' 'MSSQLSERVERPEOPL'
$dleUser = EnvOrDefault 'DLE_ENTERPRISE_DB_USER'
$dlePassword = EnvOrDefault 'DLE_ENTERPRISE_DB_PASSWORD'

if ([string]::IsNullOrWhiteSpace($sagePassword)) {
  throw 'SAGE_PAYROLL_DB_PASSWORD is required in .env or process environment.'
}

$sageConnectionString = "Server=tcp:$sageHost,$sagePort;Database=$sageDb;User ID=$sageUser;Password=$sagePassword;TrustServerCertificate=True;Encrypt=False"
if (-not [string]::IsNullOrWhiteSpace($sageInstance)) {
  $sageConnectionString = "Server=$sageHost\$sageInstance;Database=$sageDb;User ID=$sageUser;Password=$sagePassword;TrustServerCertificate=True;Encrypt=False"
}

$dleConnectionString = "Server=$DleServerInstance;Database=$DleDatabase;Integrated Security=True;TrustServerCertificate=True"
if (-not [string]::IsNullOrWhiteSpace($dleUser) -and -not [string]::IsNullOrWhiteSpace($dlePassword)) {
  $dleConnectionString = "Server=$DleServerInstance;Database=$DleDatabase;User ID=$dleUser;Password=$dlePassword;TrustServerCertificate=True;Encrypt=False"
}

$sageQuery = @'
WITH activeContractEmployees AS (
  SELECT e.EmployeeID, e.EmployeeCode
  FROM Employee.Employee e
  JOIN Entity.GenEntity ge
    ON ge.GenEntityID = e.GenEntityID
  JOIN Company.Company c
    ON c.CompanyID = e.CompanyID
  LEFT JOIN Employee.EmployeeStatus es
    ON es.EmployeeStatusID = e.EmployeeStatusID
  WHERE
    UPPER(LTRIM(RTRIM(e.EmployeeCode))) LIKE 'C%'
    AND e.TerminationDate IS NULL
    AND ISNULL(es.Code, 'A') = 'A'
    AND ge.Status = 'A'
    AND c.Status = 'A'
),
contractWeekdayRates AS (
  SELECT
    ce.EmployeeID,
    ce.EmployeeCode,
    epp.EmployeePayPeriodID,
    edef.DefCode,
    MAX(CASE WHEN peu.EmployeeRate > 0 THEN peu.EmployeeRate ELSE NULL END) AS EmployeeRate
  FROM activeContractEmployees ce
  JOIN Employee.EmployeePayPeriod epp
    ON epp.EmployeeID = ce.EmployeeID
  JOIN Payroll.Payslip p
    ON p.EmployeePayPeriodID = epp.EmployeePayPeriodID
  JOIN Payroll.PayslipEarnLine pel
    ON pel.PayslipID = p.PayslipID
  JOIN Payroll.EarningDef edef
    ON edef.EarningDefID = pel.DefID
  JOIN Payroll.PayslipEarnUnit peu
    ON peu.PayslipEarnLineID = pel.PayslipEarnLineID
  WHERE
    edef.DefCode IN ('JCWEEKDAY', 'JCWEEKDAY_NT')
    AND ISNULL(peu.EmployeeRate, 0) > 0
  GROUP BY ce.EmployeeID, ce.EmployeeCode, epp.EmployeePayPeriodID, edef.DefCode
),
contractRatePeriods AS (
  SELECT
    EmployeeID,
    EmployeePayPeriodID,
    ROW_NUMBER() OVER (PARTITION BY EmployeeID ORDER BY EmployeePayPeriodID DESC) AS rn
  FROM (
    SELECT DISTINCT EmployeeID, EmployeePayPeriodID
    FROM contractWeekdayRates
  ) periods
)
SELECT
  wr.EmployeeID AS sageEmployeeId,
  wr.EmployeeCode AS sageEmployeeCode,
  REPLACE(UPPER(LTRIM(RTRIM(wr.EmployeeCode))), '_', '') AS directoryEmployeeCode,
  SUM(wr.EmployeeRate) AS ratePerDay,
  SUM(wr.EmployeeRate) / COALESCE(NULLIF(MAX(ed.HoursPerDay), 0), 8.0) AS ratePerHour,
  COALESCE(NULLIF(MAX(ed.HoursPerDay), 0), 8.0) AS hoursPerDay,
  COALESCE(NULLIF(MAX(ed.HoursPerPeriod), 0), COALESCE(NULLIF(MAX(ed.HoursPerDay), 0), 8.0) * 22.0) AS hoursPerPeriod,
  MAX(wr.EmployeePayPeriodID) AS sourcePayPeriodId
FROM contractWeekdayRates wr
LEFT JOIN Employee.EmployeeDetail ed
  ON ed.EmployeeID = wr.EmployeeID
JOIN contractRatePeriods rp
  ON rp.EmployeeID = wr.EmployeeID
  AND rp.EmployeePayPeriodID = wr.EmployeePayPeriodID
  AND rp.rn = 1
GROUP BY wr.EmployeeID, wr.EmployeeCode
ORDER BY wr.EmployeeCode;
'@

Add-Type -AssemblyName System.Data

function Get-DataTable {
  param([string]$ConnectionString, [string]$Query)
  $cn = [System.Data.SqlClient.SqlConnection]::new($ConnectionString)
  $cn.Open()
  try {
    $cmd = $cn.CreateCommand()
    $cmd.CommandTimeout = 0
    $cmd.CommandText = $Query
    $da = [System.Data.SqlClient.SqlDataAdapter]::new($cmd)
    $dt = [System.Data.DataTable]::new()
    [void]$da.Fill($dt)
    return ,$dt
  }
  finally {
    $cn.Close()
    $cn.Dispose()
  }
}

Write-Host "Reading contract daily rates from Sage 300 Payroll..."
$sageRows = Get-DataTable -ConnectionString $sageConnectionString -Query $sageQuery
Write-Host "Sage daily-rate rows found: $($sageRows.Rows.Count)"

if ($WhatIf) {
  $sageRows.Rows | Select-Object -First 30 | Format-Table sageEmployeeId, sageEmployeeCode, directoryEmployeeCode, ratePerDay, ratePerHour, sourcePayPeriodId -AutoSize
  Write-Host "WhatIf mode: no DLE_Enterprise changes were made."
  return
}

$dle = [System.Data.SqlClient.SqlConnection]::new($dleConnectionString)
$dle.Open()

$updated = 0
$skipped = 0
$failed = 0
$failures = New-Object System.Collections.Generic.List[string]

try {
  foreach ($row in $sageRows.Rows) {
    $tx = $dle.BeginTransaction()
    try {
      $sageEmployeeId = Normalize-String (Get-Field $row 'sageEmployeeId')
      $sageEmployeeCode = Normalize-String (Get-Field $row 'sageEmployeeCode')
      $employeeCode = Normalize-String (Get-Field $row 'directoryEmployeeCode')
      $ratePerDay = Normalize-Money (Get-Field $row 'ratePerDay')
      $ratePerHour = Normalize-Money (Get-Field $row 'ratePerHour')
      $hoursPerDay = Normalize-Money (Get-Field $row 'hoursPerDay')
      $hoursPerPeriod = Normalize-Money (Get-Field $row 'hoursPerPeriod')
      $workingDays = if ($hoursPerDay -is [DBNull] -or $hoursPerPeriod -is [DBNull] -or $hoursPerDay -le 0) { [decimal]22 } else { [decimal]$hoursPerPeriod / [decimal]$hoursPerDay }
      $periodSalary = if ($ratePerDay -is [DBNull]) { [DBNull]::Value } else { [decimal]$ratePerDay * $workingDays }

      $cmd = $dle.CreateCommand()
      $cmd.Transaction = $tx
      $cmd.CommandTimeout = 0
      $cmd.CommandText = @'
DECLARE @employee_id bigint;

SELECT @employee_id = employee_id
FROM hris.EmployeeSourceRecords WITH (UPDLOCK, HOLDLOCK)
WHERE source_system = N'Sage 300 People Payroll'
  AND source_employee_id = @sage_employee_id;

IF @employee_id IS NULL
BEGIN
  SELECT TOP (1) @employee_id = employee_id
  FROM hris.Employees WITH (UPDLOCK, HOLDLOCK)
  WHERE REPLACE(UPPER(LTRIM(RTRIM(employee_code))), '_', '') = @employee_code;
END;

IF @employee_id IS NULL
BEGIN
  SELECT CAST(0 AS bit) AS updated, N'Employee not found in DLE_Enterprise' AS reason;
  RETURN;
END;

IF @overwrite = 0
  AND EXISTS (
    SELECT 1
    FROM hris.EmployeePayrollSetup
    WHERE employee_id = @employee_id
      AND (ISNULL(rate_per_day, 0) > 0 OR ISNULL(rate_per_hour, 0) > 0)
  )
BEGIN
  SELECT CAST(0 AS bit) AS updated, N'Existing daily/hourly rate kept. Use -Overwrite to replace it.' AS reason;
  RETURN;
END;

MERGE hris.EmployeePayrollSetup AS target
USING (SELECT @employee_id AS employee_id) AS source
ON target.employee_id = source.employee_id
WHEN MATCHED THEN UPDATE SET
  payroll_group = COALESCE(NULLIF(target.payroll_group, N''), N'Daily Rate'),
  salary_grade = N'Daily Rate',
  pay_currency = COALESCE(NULLIF(target.pay_currency, N''), N'NGN'),
  payment_run = COALESCE(NULLIF(target.payment_run, N''), N'Daily Timesheet'),
  payment_type = COALESCE(NULLIF(target.payment_type, N''), N'Daily Timesheet Rate'),
  period_salary = @period_salary,
  rate_per_day = @rate_per_day,
  rate_per_hour = @rate_per_hour,
  hours_per_day = @hours_per_day,
  hours_per_period = @hours_per_period,
  setup_assigned_to_payroll = 1,
  modified_at = SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT (
  employee_id, payroll_group, salary_grade, pay_currency, payment_run, payment_type,
  period_salary, rate_per_day, rate_per_hour, hours_per_day, hours_per_period, setup_assigned_to_payroll
) VALUES (
  @employee_id, N'Daily Rate', N'Daily Rate', N'NGN', N'Daily Timesheet', N'Daily Timesheet Rate',
  @period_salary, @rate_per_day, @rate_per_hour, @hours_per_day, @hours_per_period, 1
);

INSERT hris.EmployeeAuditLog(employee_id, audit_action, performed_by, reason, new_value)
VALUES (
  @employee_id,
  N'Sage daily rate sync',
  SUSER_SNAME(),
  N'Migrated contract daily rate from Sage 300 Payroll',
  CONCAT(N'{"sageEmployeeId":"', @sage_employee_id, N'","sageEmployeeCode":"', @sage_employee_code, N'","ratePerDay":', CONVERT(nvarchar(50), @rate_per_day), N',"ratePerHour":', CONVERT(nvarchar(50), @rate_per_hour), N'}')
);

SELECT CAST(1 AS bit) AS updated, N'Updated' AS reason;
'@

      $params = @{
        '@sage_employee_id' = $sageEmployeeId
        '@sage_employee_code' = $sageEmployeeCode
        '@employee_code' = $employeeCode
        '@period_salary' = $periodSalary
        '@rate_per_day' = $ratePerDay
        '@rate_per_hour' = $ratePerHour
        '@hours_per_day' = $hoursPerDay
        '@hours_per_period' = $hoursPerPeriod
        '@overwrite' = if ($Overwrite) { 1 } else { 0 }
      }

      foreach ($name in $params.Keys) {
        $parameter = $cmd.Parameters.Add($name, [System.Data.SqlDbType]::NVarChar)
        if ($name -in @('@period_salary', '@rate_per_day', '@rate_per_hour')) {
          $parameter.SqlDbType = [System.Data.SqlDbType]::Decimal
          $parameter.Precision = 19
          $parameter.Scale = 4
        } elseif ($name -in @('@hours_per_day', '@hours_per_period')) {
          $parameter.SqlDbType = [System.Data.SqlDbType]::Decimal
          $parameter.Precision = 9
          $parameter.Scale = 4
        } elseif ($name -eq '@overwrite') {
          $parameter.SqlDbType = [System.Data.SqlDbType]::Bit
        }
        $parameter.Value = $params[$name]
      }

      $reader = $cmd.ExecuteReader()
      $result = $null
      if ($reader.Read()) {
        $result = @{
          updated = [bool]$reader['updated']
          reason = [string]$reader['reason']
        }
      }
      $reader.Close()

      if ($result.updated) { $updated++ } else { $skipped++ }
      $tx.Commit()
    }
    catch {
      $failed++
      $failures.Add("$sageEmployeeCode - $($_.Exception.Message)") | Out-Null
      try { $tx.Rollback() } catch {}
    }
  }
}
finally {
  $dle.Close()
  $dle.Dispose()
}

Write-Host "Daily-rate sync complete. Updated: $updated. Skipped: $skipped. Failed: $failed."
if ($failures.Count -gt 0) {
  Write-Host "Failures:"
  $failures | Select-Object -First 20 | ForEach-Object { Write-Host " - $_" }
}
