param(
  [string]$DleServerInstance = 'localhost',
  [string]$DleDatabase = 'DLE_Enterprise',
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

function EnvOrDefault {
  param([string]$Name, [string]$Default = '')
  $value = [Environment]::GetEnvironmentVariable($Name, 'Process')
  if ([string]::IsNullOrWhiteSpace($value)) { return $Default }
  return $value
}

function DbNullIfBlank {
  param($Value)
  if ($null -eq $Value) { return [DBNull]::Value }
  if ($Value -is [string] -and [string]::IsNullOrWhiteSpace($Value)) { return [DBNull]::Value }
  return $Value
}

function Normalize-String {
  param($Value)
  if ($null -eq $Value -or $Value -is [DBNull]) { return '' }
  return ([string]$Value).Trim()
}

function Normalize-Date {
  param($Value)
  if ($null -eq $Value -or $Value -is [DBNull]) { return [DBNull]::Value }
  try { return ([datetime]$Value).Date } catch { return [DBNull]::Value }
}

function Employee-Code {
  param([string]$EmployeeCode)
  $raw = $EmployeeCode.Trim()
  if ($raw -match '^[PCLpcl]') { return $raw.ToUpperInvariant() }
  return ('P' + $raw.Replace('_', '')).ToUpperInvariant()
}

function Employee-Type {
  param([string]$EmployeeCode)
  $code = (Employee-Code $EmployeeCode)
  if ($code.StartsWith('L')) { return 'Lumpsum' }
  if ($code.StartsWith('C')) { return 'Daily Rate' }
  return 'Permanent'
}

function Employment-Status {
  param([string]$StatusName, [string]$StatusCode)
  if ($StatusCode.Trim().ToUpperInvariant() -eq 'A' -or $StatusName.Trim().ToLowerInvariant() -eq 'active') { return 'Active' }
  $s = $StatusName.Trim()
  if ($s) { return $s }
  return 'Active'
}

$sageHost = EnvOrDefault 'SAGE_PAYROLL_DB_HOST' '192.168.5.8'
$sagePort = [int](EnvOrDefault 'SAGE_PAYROLL_DB_PORT' '1433')
$sageDb = EnvOrDefault 'SAGE_PAYROLL_DB_NAME' 'DLE_JUNE'
$sageUser = EnvOrDefault 'SAGE_PAYROLL_DB_USER' 'sa'
$sagePassword = EnvOrDefault 'SAGE_PAYROLL_DB_PASSWORD'
$sageInstance = EnvOrDefault 'SAGE_PAYROLL_DB_INSTANCE' 'MSSQLSERVERPEOPL'

if ([string]::IsNullOrWhiteSpace($sagePassword)) {
  throw 'SAGE_PAYROLL_DB_PASSWORD is required in .env or process environment.'
}

$sageConnectionString = "Server=tcp:$sageHost,$sagePort;Database=$sageDb;User ID=$sageUser;Password=$sagePassword;TrustServerCertificate=True;Encrypt=False"
if (-not [string]::IsNullOrWhiteSpace($sageInstance)) {
  $sageConnectionString = "Server=$sageHost\$sageInstance,$sagePort;Database=$sageDb;User ID=$sageUser;Password=$sagePassword;TrustServerCertificate=True;Encrypt=False"
}

$dleConnectionString = "Server=$DleServerInstance;Database=$DleDatabase;Integrated Security=True;TrustServerCertificate=True"

$sageQuery = @'
WITH latestContract AS (
  SELECT
    ec.EmployeeID,
    ec.ContractStartDate,
    ec.ContractExpiryDate,
    ROW_NUMBER() OVER (
      PARTITION BY ec.EmployeeID
      ORDER BY
        CASE WHEN ec.Active = 1 THEN 0 ELSE 1 END,
        ISNULL(ec.ContractStartDate, ec.TransactionDate) DESC,
        ec.EmployeeContractID DESC
    ) AS rn
  FROM Employee.EmployeeContract ec
)
SELECT
  e.EmployeeID AS employeeId,
  e.EmployeeCode AS employeeCode,
  CASE
    WHEN UPPER(LTRIM(RTRIM(e.EmployeeCode))) LIKE 'C%' OR UPPER(LTRIM(RTRIM(e.EmployeeCode))) LIKE 'L%'
      THEN LTRIM(RTRIM(e.EmployeeCode))
    WHEN UPPER(LTRIM(RTRIM(e.EmployeeCode))) LIKE 'P%'
      THEN LTRIM(RTRIM(e.EmployeeCode))
    ELSE CONCAT('P', REPLACE(LTRIM(RTRIM(e.EmployeeCode)), '_', ''))
  END AS directoryEmployeeCode,
  ge.EntityCode AS entityCode,
  COALESCE(NULLIF(LTRIM(RTRIM(ed.DisplayName)), ''), ge.DisplayName) AS displayName,
  ed.FirstNames AS firstNames,
  ed.LastName AS lastName,
  COALESCE(NULLIF(LTRIM(RTRIM(sd.email)), ''), NULLIF(LTRIM(RTRIM(ed.EmailAddress)), '')) AS emailAddress,
  COALESCE(NULLIF(LTRIM(RTRIM(sd.phone_number)), ''), NULLIF(LTRIM(RTRIM(ed.CellNo)), ''), NULLIF(LTRIM(RTRIM(ed.WorkTelNo)), '')) AS cellNo,
  ed.WorkTelNo AS workTelNo,
  COALESCE(NULLIF(LTRIM(RTRIM(sd.job_title)), ''), NULLIF(LTRIM(RTRIM(ed.JobTitle)), '')) AS jobTitle,
  ed.JobGrade AS jobGrade,
  COALESCE(NULLIF(LTRIM(RTRIM(sd.department_code)), ''), NULLIF(LTRIM(RTRIM(ed.HierarchyCodeB)), '')) AS departmentCode,
  COALESCE(NULLIF(LTRIM(RTRIM(sd.department_name)), ''), NULLIF(LTRIM(RTRIM(ed.HANameB)), ''), NULLIF(LTRIM(RTRIM(ed.HierarchyNameB)), '')) AS departmentName,
  COALESCE(NULLIF(LTRIM(RTRIM(sd.site_code)), ''), NULLIF(LTRIM(RTRIM(ed.HierarchyCode)), '')) AS siteCode,
  COALESCE(NULLIF(LTRIM(RTRIM(sd.site_name)), ''), NULLIF(LTRIM(RTRIM(ed.HAName)), ''), NULLIF(LTRIM(RTRIM(ed.HierarchyName)), '')) AS siteName,
  ed.HierarchyCode AS hierarchyLocationCode,
  COALESCE(NULLIF(LTRIM(RTRIM(ed.HAName)), ''), NULLIF(LTRIM(RTRIM(ed.HierarchyName)), '')) AS hierarchyLocationName,
  ed.HierarchyCodeB AS hierarchyDepartmentCode,
  COALESCE(NULLIF(LTRIM(RTRIM(ed.HANameB)), ''), NULLIF(LTRIM(RTRIM(ed.HierarchyNameB)), '')) AS hierarchyDepartmentName,
  ed.HierarchyCodeC AS hierarchyEmployeeTypeCode,
  COALESCE(NULLIF(LTRIM(RTRIM(ed.HANameC)), ''), NULLIF(LTRIM(RTRIM(ed.HierarchyNameC)), '')) AS hierarchyEmployeeTypeName,
  COALESCE(e.ReportToEmployeeID, reverseManager.ReportToEmployeeID) AS managerEmployeeId,
  COALESCE(mgr.EmployeeCode, reverseMgr.EmployeeCode) AS managerEmployeeCode,
  COALESCE(
    NULLIF(LTRIM(RTRIM(ed.ReportsToEmployeeDisplay)), ''),
    mgrge.DisplayName,
    reverseMgrGe.DisplayName
  ) AS managerName,
  ed.Nationality AS nationality,
  ed.DateEngaged AS dateEngaged,
  ed.DateJoinedGroup AS dateJoinedGroup,
  ed.ProbationPeriodEndDate AS probationPeriodEndDate,
  lc.ContractStartDate AS contractStartDate,
  lc.ContractExpiryDate AS contractExpiryDate,
  c.CompanyCode AS companyCode,
  cge.DisplayName AS companyName,
  es.Code AS statusCode,
  es.ShortDescription AS statusName,
  e.TerminationDate AS terminationDate
FROM Employee.Employee e
JOIN Entity.GenEntity ge
  ON ge.GenEntityID = e.GenEntityID
JOIN Company.Company c
  ON c.CompanyID = e.CompanyID
JOIN Entity.GenEntity cge
  ON cge.GenEntityID = c.GenEntityID
LEFT JOIN Employee.EmployeeStatus es
  ON es.EmployeeStatusID = e.EmployeeStatusID
LEFT JOIN Employee.EmployeeDetail ed
  ON ed.EmployeeID = e.EmployeeID
LEFT JOIN dbo.vw_ServiceDesk_Employees sd
  ON sd.external_employee_id = CAST(e.EmployeeID AS varchar(50))
LEFT JOIN Employee.Employee mgr
  ON mgr.EmployeeID = e.ReportToEmployeeID
LEFT JOIN Entity.GenEntity mgrge
  ON mgrge.GenEntityID = mgr.GenEntityID
LEFT JOIN Employee.EmployeesReportsToMeView reverseManager
  ON reverseManager.EmployeeID = e.EmployeeID
LEFT JOIN Employee.Employee reverseMgr
  ON reverseMgr.EmployeeID = reverseManager.ReportToEmployeeID
LEFT JOIN Entity.GenEntity reverseMgrGe
  ON reverseMgrGe.GenEntityID = reverseMgr.GenEntityID
LEFT JOIN latestContract lc
  ON lc.EmployeeID = e.EmployeeID
  AND lc.rn = 1
WHERE
  e.TerminationDate IS NULL
  AND ISNULL(es.Code, 'A') = 'A'
  AND ge.Status = 'A'
  AND c.Status = 'A'
ORDER BY e.EmployeeCode;
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
    return $dt
  }
  finally {
    $cn.Close()
    $cn.Dispose()
  }
}

Write-Host "Reading active employees from Sage payroll..."
$sageRows = Get-DataTable -ConnectionString $sageConnectionString -Query $sageQuery
Write-Host "Sage rows found: $($sageRows.Rows.Count)"

if ($WhatIf) {
  $sageRows | Select-Object -First 10 | Format-Table employeeId, employeeCode, directoryEmployeeCode, displayName, jobTitle, departmentName, siteName, statusName -AutoSize
  Write-Host "WhatIf mode: no DLE_Enterprise changes were made."
  return
}

$dle = [System.Data.SqlClient.SqlConnection]::new($dleConnectionString)
$dle.Open()

$inserted = 0
$updated = 0
$failed = 0
$failures = New-Object System.Collections.Generic.List[string]

try {
  foreach ($row in $sageRows.Rows) {
    $tx = $dle.BeginTransaction()
    try {
      $employeeCode = Normalize-String $row.directoryEmployeeCode
      if (-not $employeeCode) { $employeeCode = Employee-Code (Normalize-String $row.employeeCode) }
      $sourceEmployeeId = Normalize-String $row.employeeId
      $fullName = Normalize-String $row.displayName
      if (-not $fullName) { $fullName = ($sourceEmployeeId) }
      $firstNames = Normalize-String $row.firstNames
      $lastName = Normalize-String $row.lastName
      if (-not $firstNames) { $firstNames = $fullName }
      if (-not $lastName) { $lastName = $fullName }
      $employeeType = Employee-Type $employeeCode
      $status = Employment-Status (Normalize-String $row.statusName) (Normalize-String $row.statusCode)
      $rawPayload = [ordered]@{
        employeeId = $row.employeeId
        employeeCode = $row.employeeCode
        directoryEmployeeCode = $employeeCode
        entityCode = $row.entityCode
        displayName = $row.displayName
        firstNames = $row.firstNames
        lastName = $row.lastName
        emailAddress = $row.emailAddress
        cellNo = $row.cellNo
        workTelNo = $row.workTelNo
        jobTitle = $row.jobTitle
        jobGrade = $row.jobGrade
        departmentCode = $row.departmentCode
        departmentName = $row.departmentName
        siteCode = $row.siteCode
        siteName = $row.siteName
        hierarchyLocationCode = $row.hierarchyLocationCode
        hierarchyLocationName = $row.hierarchyLocationName
        hierarchyDepartmentCode = $row.hierarchyDepartmentCode
        hierarchyDepartmentName = $row.hierarchyDepartmentName
        hierarchyEmployeeTypeCode = $row.hierarchyEmployeeTypeCode
        hierarchyEmployeeTypeName = $row.hierarchyEmployeeTypeName
        managerEmployeeId = $row.managerEmployeeId
        managerEmployeeCode = $row.managerEmployeeCode
        managerName = $row.managerName
        nationality = $row.nationality
        dateEngaged = $row.dateEngaged
        dateJoinedGroup = $row.dateJoinedGroup
        probationPeriodEndDate = $row.probationPeriodEndDate
        contractStartDate = $row.contractStartDate
        contractExpiryDate = $row.contractExpiryDate
        companyCode = $row.companyCode
        companyName = $row.companyName
        statusCode = $row.statusCode
        statusName = $row.statusName
        terminationDate = $row.terminationDate
      }
      $rawJson = $rawPayload | ConvertTo-Json -Depth 5 -Compress

      $cmd = $dle.CreateCommand()
      $cmd.Transaction = $tx
      $cmd.CommandTimeout = 0
      $cmd.CommandText = @'
DECLARE @employee_id bigint;
DECLARE @was_insert bit = 0;

SELECT @employee_id = employee_id
FROM hris.Employees WITH (UPDLOCK, HOLDLOCK)
WHERE source_system = N'Sage 300 People Payroll'
  AND source_employee_id = @source_employee_id;

IF @employee_id IS NULL
BEGIN
  SELECT @employee_id = employee_id
  FROM hris.Employees WITH (UPDLOCK, HOLDLOCK)
  WHERE employee_code = @employee_code;
END;

IF @employee_id IS NULL
BEGIN
  INSERT hris.Employees(employee_code, full_name, preferred_name, employment_status, employment_type, source_system, source_employee_id, created_by)
  VALUES (@employee_code, @full_name, NULL, @employment_status, @employment_type, N'Sage 300 People Payroll', @source_employee_id, SUSER_SNAME());
  SET @employee_id = CONVERT(bigint, SCOPE_IDENTITY());
  SET @was_insert = 1;
END
ELSE
BEGIN
  UPDATE hris.Employees
  SET full_name = @full_name,
      employment_status = @employment_status,
      employment_type = @employment_type,
      source_system = N'Sage 300 People Payroll',
      source_employee_id = @source_employee_id,
      is_deleted = 0,
      deleted_at = NULL,
      deleted_by = NULL,
      modified_at = SYSUTCDATETIME(),
      modified_by = SUSER_SNAME()
  WHERE employee_id = @employee_id;
END;

MERGE hris.EmployeePersonalInfo AS target
USING (SELECT @employee_id AS employee_id) AS source
ON target.employee_id = source.employee_id
WHEN MATCHED THEN UPDATE SET
  first_name = @first_name,
  last_name = @last_name,
  nationality = @nationality,
  modified_at = SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT (employee_id, first_name, last_name, nationality)
VALUES (@employee_id, @first_name, @last_name, @nationality);

MERGE hris.EmployeeContactInfo AS target
USING (SELECT @employee_id AS employee_id) AS source
ON target.employee_id = source.employee_id
WHEN MATCHED THEN UPDATE SET
  official_email = @official_email,
  primary_phone = @primary_phone,
  alternate_phone = @alternate_phone,
  modified_at = SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT (employee_id, official_email, primary_phone, alternate_phone)
VALUES (@employee_id, @official_email, @primary_phone, @alternate_phone);

MERGE hris.EmployeeEmploymentInfo AS target
USING (SELECT @employee_id AS employee_id) AS source
ON target.employee_id = source.employee_id
WHEN MATCHED THEN UPDATE SET
  staff_category = @employee_type_name,
  employee_category = @employee_type_name,
  date_joined = @date_joined,
  probation_end_date = @probation_end_date,
  contract_start_date = @contract_start_date,
  contract_end_date = @contract_end_date,
  work_location = @work_location,
  expatriate_status = @expatriate_status,
  modified_at = SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT (
  employee_id, staff_category, employee_category, date_joined, probation_end_date, contract_start_date, contract_end_date, work_location, expatriate_status
) VALUES (
  @employee_id, @employee_type_name, @employee_type_name, @date_joined, @probation_end_date, @contract_start_date, @contract_end_date, @work_location, @expatriate_status
);

MERGE hris.EmployeeJobInfo AS target
USING (SELECT @employee_id AS employee_id) AS source
ON target.employee_id = source.employee_id
WHEN MATCHED THEN UPDATE SET
  job_title = @job_title,
  job_grade = @job_grade,
  department = @department,
  division = @department_code,
  business_unit = @company_code,
  cost_center = @department_code,
  project_site = @site_code,
  office_location = @site_name,
  reporting_manager = @manager_name,
  role_profile = @employee_type_name,
  modified_at = SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT (
  employee_id, job_title, job_grade, department, division, business_unit, cost_center, project_site, office_location, reporting_manager, role_profile
) VALUES (
  @employee_id, @job_title, @job_grade, @department, @department_code, @company_code, @department_code, @site_code, @site_name, @manager_name, @employee_type_name
);

MERGE hris.EmployeePayrollSetup AS target
USING (SELECT @employee_id AS employee_id) AS source
ON target.employee_id = source.employee_id
WHEN MATCHED THEN UPDATE SET
  payroll_group = @company_code,
  salary_grade = @job_grade,
  setup_assigned_to_payroll = 1,
  modified_at = SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT (employee_id, payroll_group, salary_grade, setup_assigned_to_payroll)
VALUES (@employee_id, @company_code, @job_grade, 1);

MERGE hris.EmployeeSourceRecords AS target
USING (SELECT N'Sage 300 People Payroll' AS source_system, @source_employee_id AS source_employee_id) AS source
ON target.source_system = source.source_system
AND target.source_employee_id = source.source_employee_id
WHEN MATCHED THEN UPDATE SET
  employee_id = @employee_id,
  source_employee_code = @source_employee_code,
  source_entity_code = @source_entity_code,
  source_company_code = @company_code,
  source_status_code = @source_status_code,
  source_status_name = @source_status_name,
  raw_payload_json = @raw_payload_json,
  imported_at = SYSUTCDATETIME(),
  imported_by = SUSER_SNAME()
WHEN NOT MATCHED THEN INSERT (
  employee_id, source_system, source_employee_id, source_employee_code, source_entity_code, source_company_code,
  source_status_code, source_status_name, raw_payload_json
) VALUES (
  @employee_id, N'Sage 300 People Payroll', @source_employee_id, @source_employee_code, @source_entity_code, @company_code,
  @source_status_code, @source_status_name, @raw_payload_json
);

INSERT hris.EmployeeAuditLog(employee_id, audit_action, performed_by, reason, new_value)
VALUES (@employee_id, N'Sage payroll employee import', SUSER_SNAME(), N'Imported/upserted from Sage 300 People Payroll', @raw_payload_json);

SELECT @employee_id AS employee_id, @was_insert AS was_insert;
'@

      $params = @{
        '@employee_code' = $employeeCode
        '@full_name' = $fullName
        '@employment_status' = $status
        '@employment_type' = $employeeType
        '@source_employee_id' = $sourceEmployeeId
        '@first_name' = $firstNames
        '@last_name' = $lastName
        '@nationality' = Normalize-String $row.nationality
        '@official_email' = Normalize-String $row.emailAddress
        '@primary_phone' = Normalize-String $row.cellNo
        '@alternate_phone' = Normalize-String $row.workTelNo
        '@employee_type_name' = Normalize-String $row.hierarchyEmployeeTypeName
        '@date_joined' = Normalize-Date $row.dateEngaged
        '@probation_end_date' = Normalize-Date $row.probationPeriodEndDate
        '@contract_start_date' = Normalize-Date $row.contractStartDate
        '@contract_end_date' = Normalize-Date $row.contractExpiryDate
        '@work_location' = Normalize-String $row.siteName
        '@expatriate_status' = if ((Normalize-String $row.nationality).ToLowerInvariant() -and (Normalize-String $row.nationality).ToLowerInvariant() -ne 'nigeria' -and (Normalize-String $row.nationality).ToLowerInvariant() -ne 'nigerian') { 'Expatriate' } else { 'Local' }
        '@job_title' = Normalize-String $row.jobTitle
        '@job_grade' = Normalize-String $row.jobGrade
        '@department' = Normalize-String $row.departmentName
        '@department_code' = Normalize-String $row.departmentCode
        '@company_code' = Normalize-String $row.companyCode
        '@site_code' = Normalize-String $row.siteCode
        '@site_name' = Normalize-String $row.siteName
        '@manager_name' = Normalize-String $row.managerName
        '@source_employee_code' = Normalize-String $row.employeeCode
        '@source_entity_code' = Normalize-String $row.entityCode
        '@source_status_code' = Normalize-String $row.statusCode
        '@source_status_name' = Normalize-String $row.statusName
        '@raw_payload_json' = $rawJson
      }

      foreach ($entry in $params.GetEnumerator()) {
        $p = $cmd.Parameters.Add($entry.Key, [System.Data.SqlDbType]::NVarChar)
        $p.Value = DbNullIfBlank $entry.Value
        if ($entry.Key -in @('@date_joined', '@probation_end_date', '@contract_start_date', '@contract_end_date')) {
          $p.SqlDbType = [System.Data.SqlDbType]::Date
        }
        if ($entry.Key -eq '@raw_payload_json') {
          $p.Size = -1
        } else {
          $p.Size = 1000
        }
      }

      $reader = $cmd.ExecuteReader()
      [void]$reader.Read()
      $wasInsert = [bool]$reader['was_insert']
      $reader.Close()
      $tx.Commit()
      if ($wasInsert) { $inserted++ } else { $updated++ }
    }
    catch {
      $tx.Rollback()
      $failed++
      $failures.Add("Sage employee $($row.employeeId) / $($row.employeeCode): $($_.Exception.Message)")
    }
  }
}
finally {
  $dle.Close()
  $dle.Dispose()
}

Write-Host "Import complete."
Write-Host "Inserted: $inserted"
Write-Host "Updated:  $updated"
Write-Host "Failed:   $failed"

if ($failures.Count -gt 0) {
  Write-Host "Failures:"
  $failures | Select-Object -First 25 | ForEach-Object { Write-Host " - $_" }
  if ($failures.Count -gt 25) { Write-Host " ... and $($failures.Count - 25) more." }
  exit 1
}
