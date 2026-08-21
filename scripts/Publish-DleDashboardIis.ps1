param(
  [string]$OutputPath = "deployment\iis\site",
  [ValidateSet("ReverseProxy", "HttpPlatform")]
  [string]$HostingMode = "HttpPlatform",
  [switch]$SkipInstall,
  [switch]$NoStop
)

$ErrorActionPreference = "Stop"

$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$AppPath = Join-Path $RepoRoot "apps\dashboard"
$BuildPath = Join-Path $AppPath ".next"
$StandalonePath = Join-Path $BuildPath "standalone"
$script:ResolvedOutputPath = [System.IO.Path]::GetFullPath((Join-Path $RepoRoot $OutputPath))
$ResolvedOutputPath = $script:ResolvedOutputPath
$RuntimeDataBackupPath = Join-Path $RepoRoot "deployment\iis\.runtime-data-backup"
$script:PublishStoppedIis = $false

function Get-NormalizedDirectoryPath {
  param([Parameter(Mandatory = $true)][string]$TargetDirectory)

  if ([string]::IsNullOrWhiteSpace($TargetDirectory)) {
    throw "A directory path is required."
  }

  return [System.IO.Path]::GetFullPath($TargetDirectory).TrimEnd('\', '/').ToLowerInvariant()
}

function Test-UnderPublishSitePath {
  param([Parameter(Mandatory = $true)][string]$TargetDirectory)

  if ([string]::IsNullOrWhiteSpace($TargetDirectory) -or [string]::IsNullOrWhiteSpace($script:ResolvedOutputPath)) {
    return $false
  }

  $candidate = Get-NormalizedDirectoryPath -TargetDirectory $TargetDirectory
  $siteRoot = Get-NormalizedDirectoryPath -TargetDirectory $script:ResolvedOutputPath
  return $candidate -eq $siteRoot -or $candidate.StartsWith("$siteRoot\")
}

function Stop-NodeProcessesUsingPath {
  param([Parameter(Mandatory = $true)][string]$TargetDirectory)

  if ([string]::IsNullOrWhiteSpace($TargetDirectory)) {
    return @()
  }

  $target = Get-NormalizedDirectoryPath -TargetDirectory $TargetDirectory
  $stopped = New-Object "System.Collections.Generic.List[string]"

  Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue | ForEach-Object {
    $commandLine = [string]$_.CommandLine
    if (-not $commandLine) {
      return
    }

    $normalizedCommand = $commandLine.ToLowerInvariant()
    if ($normalizedCommand.Contains($target)) {
      $processId = $_.ProcessId
      try {
        Stop-Process -Id $processId -Force -ErrorAction Stop
        $stopped.Add("node.exe (PID $processId)")
      } catch {
        Write-Warning "Could not stop node.exe PID ${processId}: $($_.Exception.Message)"
      }
    }
  }

  return $stopped
}

function Invoke-IisControlWithRetry {
  param(
    [Parameter(Mandatory = $true)][scriptblock]$Action,
    [Parameter(Mandatory = $true)][string]$Label,
    [int]$Attempts = 6,
    [int]$DelaySeconds = 3
  )

  for ($Attempt = 1; $Attempt -le $Attempts; $Attempt++) {
    try {
      & $Action
      return $true
    } catch {
      $message = [string]$_.Exception.Message
      $busy = $message -match 'cannot accept control messages|0x80070425|2147943461'
      if ($Attempt -eq $Attempts) {
        Write-Warning ("{0} failed after {1} attempts: {2}" -f $Label, $Attempts, $message)
        return $false
      }
      if ($busy) {
        Write-Warning ("{0}: IIS busy (attempt {1}/{2}). Waiting {3}s..." -f $Label, $Attempt, $Attempts, $DelaySeconds)
      } else {
        Write-Warning ("{0} failed (attempt {1}/{2}): {3}" -f $Label, $Attempt, $Attempts, $message)
      }
      Start-Sleep -Seconds $DelaySeconds
    }
  }

  return $false
}

function Stop-IisSitesUsingPath {
  param([Parameter(Mandatory = $true)][string]$TargetDirectory)

  if ([string]::IsNullOrWhiteSpace($TargetDirectory)) {
    return @()
  }

  $target = Get-NormalizedDirectoryPath -TargetDirectory $TargetDirectory
  $stopped = New-Object "System.Collections.Generic.List[string]"

  if (-not (Get-Module -ListAvailable -Name WebAdministration)) {
    return $stopped
  }

  Import-Module WebAdministration -ErrorAction SilentlyContinue
  if (-not (Get-PSDrive -Name IIS -ErrorAction SilentlyContinue)) {
    return $stopped
  }

  foreach ($site in Get-ChildItem IIS:\Sites) {
    if ([string]::IsNullOrWhiteSpace($site.physicalPath)) {
      continue
    }

    $sitePath = Get-NormalizedDirectoryPath -TargetDirectory $site.physicalPath
    if ($sitePath -ne $target -and -not $sitePath.StartsWith("$target\")) {
      continue
    }

    $poolName = [string]$site.applicationPool
    if ($poolName) {
      $poolState = $null
      try {
        $poolState = (Get-WebAppPoolState -Name $poolName -ErrorAction Stop).Value
      } catch {
        $poolState = $null
      }

      if ($poolState -and $poolState -ne "Stopped") {
        # ErrorAction alone is not enough: IIS COM errors can still terminate under $ErrorActionPreference=Stop.
        $ok = Invoke-IisControlWithRetry -Label "Stop app pool '$poolName'" -Action {
          Stop-WebAppPool -Name $poolName -ErrorAction Stop
        }
        if ($ok) {
          $stopped.Add("IIS app pool '$poolName'")
        }
      }
    }

    if ($site.State -ne "Stopped") {
      $ok = Invoke-IisControlWithRetry -Label "Stop site '$($site.Name)'" -Action {
        Stop-Website -Name $site.Name -ErrorAction Stop
      }
      if ($ok) {
        $stopped.Add("IIS site '$($site.Name)'")
      }
    }
  }

  return $stopped
}

function Start-IisSitesUsingPath {
  param([Parameter(Mandatory = $true)][string]$TargetDirectory)

  if ([string]::IsNullOrWhiteSpace($TargetDirectory)) {
    return @()
  }

  $target = Get-NormalizedDirectoryPath -TargetDirectory $TargetDirectory
  $started = New-Object "System.Collections.Generic.List[string]"

  if (-not (Get-Module -ListAvailable -Name WebAdministration)) {
    return $started
  }

  Import-Module WebAdministration -ErrorAction SilentlyContinue
  if (-not (Get-PSDrive -Name IIS -ErrorAction SilentlyContinue)) {
    return $started
  }

  foreach ($site in Get-ChildItem IIS:\Sites) {
    if ([string]::IsNullOrWhiteSpace($site.physicalPath)) {
      continue
    }

    $sitePath = Get-NormalizedDirectoryPath -TargetDirectory $site.physicalPath
    if ($sitePath -ne $target -and -not $sitePath.StartsWith("$target\")) {
      continue
    }

    $poolName = [string]$site.applicationPool
    if ($poolName) {
      $poolState = $null
      try {
        $poolState = (Get-WebAppPoolState -Name $poolName -ErrorAction Stop).Value
      } catch {
        $poolState = $null
      }

      if ($poolState -ne "Started") {
        $ok = Invoke-IisControlWithRetry -Label "Start app pool '$poolName'" -Action {
          Start-WebAppPool -Name $poolName -ErrorAction Stop
        }
        if ($ok) {
          $started.Add("IIS app pool '$poolName'")
        }
      }
    }

    if ($site.State -ne "Started") {
      $ok = Invoke-IisControlWithRetry -Label "Start site '$($site.Name)'" -Action {
        Start-Website -Name $site.Name -ErrorAction Stop
      }
      if ($ok) {
        $started.Add("IIS site '$($site.Name)'")
      }
    }
  }

  return $started
}

function Stop-PublishTargetLocks {
  param([Parameter(Mandatory = $true)][string]$TargetDirectory)

  if ([string]::IsNullOrWhiteSpace($TargetDirectory)) {
    Write-Warning "Skipped stopping IIS/node locks because the publish target path was empty."
    return
  }

  $lockTarget = [string]$TargetDirectory
  $stopped = @()
  $stopped += Stop-IisSitesUsingPath -TargetDirectory $lockTarget
  $stopped += Stop-NodeProcessesUsingPath -TargetDirectory $lockTarget
  $stopped = @($stopped | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique)

  if ($stopped.Count -gt 0) {
    Write-Host ("Stopped publish locks: {0}" -f ($stopped -join ", "))
    $script:PublishStoppedIis = $true
    Start-Sleep -Seconds 2
  }
}

function Remove-PathWithRetry {
  param(
    [Parameter(Mandatory = $true)][string]$TargetDirectory,
    [int]$Attempts = 8,
    [int]$DelaySeconds = 3,
    [switch]$AttemptStopLocks
  )

  if ([string]::IsNullOrWhiteSpace($TargetDirectory)) {
    return
  }

  if (-not (Test-Path -LiteralPath $TargetDirectory)) {
    return
  }

  for ($Attempt = 1; $Attempt -le $Attempts; $Attempt++) {
    try {
      Remove-Item -LiteralPath $TargetDirectory -Recurse -Force -ErrorAction Stop
      return
    } catch {
      if ($AttemptStopLocks -and $Attempt -eq 1 -and (Test-UnderPublishSitePath -TargetDirectory $TargetDirectory)) {
        Stop-PublishTargetLocks -TargetDirectory $script:ResolvedOutputPath
      }

      if ($Attempt -eq $Attempts) {
        throw @"
Could not remove '$TargetDirectory'.

The build succeeded, but another process is still using files inside the IIS publish folder (usually IIS HttpPlatformHandler, w3wp.exe, or a running node dashboard service).

Fix:
  1. Stop the IIS site/app pool that points at this folder, or stop the dashboard Windows service.
  2. Close File Explorer windows and terminals whose current directory is under deployment\iis\site.
  3. Rerun: npm run publish:iis -- -SkipInstall

Optional manual stop (run as Administrator):
  Import-Module WebAdministration
  Get-Website | Where-Object { `$_.physicalPath -like '*deployment\iis\site*' } | ForEach-Object { Stop-WebAppPool `$_.applicationPool; Stop-Website `$_.Name }

Original error: $($_.Exception.Message)
"@
      }

      Start-Sleep -Seconds $DelaySeconds
    }
  }
}

function Copy-DirectoryContents {
  param(
    [Parameter(Mandatory = $true)][string]$SourcePath,
    [Parameter(Mandatory = $true)][string]$DestinationPath,
    [string[]]$ExcludeDirectoryNames = @()
  )

  if (-not (Test-Path -LiteralPath $SourcePath)) {
    throw "Required source path was not found: $SourcePath"
  }

  if (Test-Path -LiteralPath $DestinationPath) {
    Remove-PathWithRetry -TargetDirectory $DestinationPath
  }

  New-Item -ItemType Directory -Path $DestinationPath -Force | Out-Null
  Copy-TreeSafe -SourcePath $SourcePath -DestinationPath $DestinationPath -ExcludeDirectoryNames $ExcludeDirectoryNames
}

function Test-IsReparsePoint {
  param([Parameter(Mandatory = $true)][string]$Path)
  try {
    $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
    return [bool]($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint)
  } catch {
    return $false
  }
}

function Copy-TreeSafe {
  param(
    [Parameter(Mandatory = $true)][string]$SourcePath,
    [Parameter(Mandatory = $true)][string]$DestinationPath,
    [string[]]$ExcludeDirectoryNames = @()
  )

  $sourceFull = [System.IO.Path]::GetFullPath($SourcePath).TrimEnd('\', '/')
  $destFull = [System.IO.Path]::GetFullPath($DestinationPath).TrimEnd('\', '/')
  $excludeSet = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  foreach ($name in $ExcludeDirectoryNames) {
    if (-not [string]::IsNullOrWhiteSpace($name)) { [void]$excludeSet.Add($name.Trim()) }
  }

  # Prefer robocopy with /XJ so junctions/symlinks cannot recurse into the publish site.
  $robocopy = Get-Command robocopy.exe -ErrorAction SilentlyContinue
  if ($robocopy) {
    $args = @(
      $sourceFull,
      $destFull,
      '/E',
      '/COPY:DAT',
      '/R:1',
      '/W:1',
      '/NFL',
      '/NDL',
      '/NJH',
      '/NJS',
      '/NP',
      '/XJ'
    )
    foreach ($name in $excludeSet) {
      $args += '/XD'
      $args += $name
    }
    & robocopy.exe @args | Out-Null
    $code = $LASTEXITCODE
    # Robocopy 0-7 = success / partial copy; 8+ = failure.
    if ($code -ge 8) {
      throw "Safe copy failed (robocopy exit $code) from $sourceFull to $destFull"
    }
    return
  }

  # Fallback: manual copy that skips reparse points and excluded directory names.
  New-Item -ItemType Directory -Path $destFull -Force | Out-Null
  Get-ChildItem -LiteralPath $sourceFull -Force | ForEach-Object {
    if ($_.PSIsContainer -and $excludeSet.Contains($_.Name)) { return }
    if (Test-IsReparsePoint -Path $_.FullName) {
      Write-Warning "Skipping reparse point during publish copy: $($_.FullName)"
      return
    }
    $target = Join-Path $destFull $_.Name
    if ($_.PSIsContainer) {
      Copy-TreeSafe -SourcePath $_.FullName -DestinationPath $target -ExcludeDirectoryNames $ExcludeDirectoryNames
    } else {
      Copy-Item -LiteralPath $_.FullName -Destination $target -Force
    }
  }
}

function Clear-StandalonePublishLoops {
  param([Parameter(Mandatory = $true)][string]$StandaloneRoot)

  # Next standalone tracing can pull in repo folders. A nested deployment\iis\site
  # (or a junction to the publish target) causes Copy-Item -Recurse path explosions.
  $suspects = @(
    (Join-Path $StandaloneRoot "deployment"),
    (Join-Path $StandaloneRoot "deployment\iis\site")
  )
  foreach ($path in $suspects) {
    if (-not (Test-Path -LiteralPath $path)) { continue }
    Write-Warning "Removing standalone path that can recurse into the IIS site: $path"
    try {
      Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction Stop
    } catch {
      # If it's a junction, remove the link without descending.
      cmd /c "rmdir `"$path`"" | Out-Null
    }
  }
}

function Invoke-CheckedCommand {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [string[]]$ArgumentList = @()
  )

  & $FilePath @ArgumentList
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code $LASTEXITCODE`: $FilePath $($ArgumentList -join ' ')"
  }
}

function Copy-IisEnvironmentFile {
  param(
    [Parameter(Mandatory = $true)][string]$DestinationRoot
  )

  $CandidateEnvPaths = @(
    (Join-Path $RepoRoot ".env"),
    (Join-Path $AppPath ".env")
  )

  $EnvSource = $CandidateEnvPaths |
    Where-Object { Test-Path -LiteralPath $_ } |
    Select-Object -First 1

  if (-not $EnvSource) {
    Write-Warning "No .env file found at repo root or apps\dashboard. IIS package will rely on machine-level environment variables."
    return
  }

  # Durable finance attachments live OUTSIDE the IIS package so publish cannot wipe them.
  # Live server path: F:\Dorman-Long\dle-connect\data\finance\payment-attachments
  $FinanceDataDir = [System.IO.Path]::GetFullPath((Join-Path $RepoRoot "data\finance"))
  $HrisDataDir = [System.IO.Path]::GetFullPath((Join-Path $RepoRoot "data\hris"))

  $DestinationEnv = Join-Path $DestinationRoot ".env"
  Copy-Item -LiteralPath $EnvSource -Destination $DestinationEnv -Force
  Ensure-InternalDeployEnvDefaults -EnvFilePath $DestinationEnv -FinanceDataDir $FinanceDataDir -HrisDataDir $HrisDataDir

  $DashboardEnvTargetDirectory = Join-Path $DestinationRoot "apps\dashboard"
  if (Test-Path -LiteralPath $DashboardEnvTargetDirectory) {
    $DashboardEnv = Join-Path $DashboardEnvTargetDirectory ".env"
    Copy-Item -LiteralPath $EnvSource -Destination $DashboardEnv -Force
    Ensure-InternalDeployEnvDefaults -EnvFilePath $DashboardEnv -FinanceDataDir $FinanceDataDir -HrisDataDir $HrisDataDir
  }

  Write-Host "Copied IIS runtime environment from $EnvSource"
  Write-Host "DLE_FINANCE_DATA_DIR => $FinanceDataDir"
  Write-Host "DLE_HRIS_DATA_DIR => $HrisDataDir"

  $SyncMailScript = Join-Path $RepoRoot "scripts\Sync-MailEnvironment.ps1"
  if (Test-Path -LiteralPath $SyncMailScript) {
    $MailTargets = @($DestinationEnv)
    if (Test-Path -LiteralPath $DashboardEnvTargetDirectory) {
      $MailTargets += (Join-Path $DashboardEnvTargetDirectory ".env")
    }
    try {
      & $SyncMailScript -RepoRoot $RepoRoot -InternalServer -TargetFiles $MailTargets
    } catch {
      Write-Warning "Mail environment was not merged into the IIS package: $($_.Exception.Message)"
    }
  }

  # Re-assert after mail sync so attachment / HRIS paths cannot be dropped.
  Set-Or-AppendEnvValue -EnvFilePath $DestinationEnv -Key "DLE_FINANCE_DATA_DIR" -Value $FinanceDataDir
  Set-Or-AppendEnvValue -EnvFilePath $DestinationEnv -Key "DLE_HRIS_DATA_DIR" -Value $HrisDataDir
  if (Test-Path -LiteralPath $DashboardEnvTargetDirectory) {
    Set-Or-AppendEnvValue -EnvFilePath (Join-Path $DashboardEnvTargetDirectory ".env") -Key "DLE_FINANCE_DATA_DIR" -Value $FinanceDataDir
    Set-Or-AppendEnvValue -EnvFilePath (Join-Path $DashboardEnvTargetDirectory ".env") -Key "DLE_HRIS_DATA_DIR" -Value $HrisDataDir
  }
}

function Set-Or-AppendEnvValue {
  param(
    [Parameter(Mandatory = $true)][string]$EnvFilePath,
    [Parameter(Mandatory = $true)][string]$Key,
    [Parameter(Mandatory = $true)][string]$Value
  )

  if (-not (Test-Path -LiteralPath $EnvFilePath)) { return }

  $Lines = @(Get-Content -LiteralPath $EnvFilePath)
  $Found = $false
  $Next = foreach ($Line in $Lines) {
    if ($Line -match ("^\s*" + [regex]::Escape($Key) + "\s*=")) {
      $Found = $true
      "{0}={1}" -f $Key, $Value
    } else {
      $Line
    }
  }

  if (-not $Found) {
    $Next += ""
    $Next += "# Durable payment attachment / finance file store"
    $Next += ("{0}={1}" -f $Key, $Value)
  }

  Set-Content -LiteralPath $EnvFilePath -Value $Next
}

function Ensure-InternalDeployEnvDefaults {
  param(
    [Parameter(Mandatory = $true)][string]$EnvFilePath,
    [string]$FinanceDataDir = "",
    [string]$HrisDataDir = ""
  )

  if (-not (Test-Path -LiteralPath $EnvFilePath)) { return }

  $Defaults = [ordered]@{
    'DLE_DEPLOY_ENV' = 'internal'
    'HRIS_TIMESHEET_OVERTIME_BOOKING_ENABLED' = 'true'
    'HRIS_TIMESHEET_OVERTIME_DEV_RELAXED' = 'true'
    'HRIS_TIMESHEET_OVERTIME_RETRO_CORRECTION' = 'true'
    'HRIS_TIMESHEET_OVERTIME_OPEN_BOOKING' = 'true'
  }

  $Lines = Get-Content -LiteralPath $EnvFilePath
  $ExistingKeys = New-Object 'System.Collections.Generic.HashSet[string]'
  foreach ($Line in $Lines) {
    if ($Line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=') {
      [void]$ExistingKeys.Add($Matches[1])
    }
  }

  $Appended = @()
  foreach ($Entry in $Defaults.GetEnumerator()) {
    if ($ExistingKeys.Contains($Entry.Key)) { continue }
    $Appended += "$($Entry.Key)=$($Entry.Value)"
  }

  if ($Appended.Count -gt 0) {
    Add-Content -LiteralPath $EnvFilePath -Value ""
    Add-Content -LiteralPath $EnvFilePath -Value "# Added by Publish-DleDashboardIis.ps1 for internal UAT parity"
    Add-Content -LiteralPath $EnvFilePath -Value $Appended
    Write-Host "Ensured internal deploy defaults in $EnvFilePath"
  }

  if ($FinanceDataDir) {
    Set-Or-AppendEnvValue -EnvFilePath $EnvFilePath -Key "DLE_FINANCE_DATA_DIR" -Value $FinanceDataDir
  }
  if ($HrisDataDir) {
    Set-Or-AppendEnvValue -EnvFilePath $EnvFilePath -Key "DLE_HRIS_DATA_DIR" -Value $HrisDataDir
  }
}

function Test-NextTraceFiles {
  param(
    [Parameter(Mandatory = $true)][string]$NextRootPath
  )

  $TraceFiles = Get-ChildItem -LiteralPath (Join-Path $NextRootPath "server") -Recurse -Filter "*.nft.json"
  $RequiredFiles = New-Object "System.Collections.Generic.HashSet[string]"
  foreach ($TraceFile in $TraceFiles) {
    $Trace = Get-Content -Raw -LiteralPath $TraceFile.FullName | ConvertFrom-Json
    $TraceDir = Split-Path -Parent $TraceFile.FullName
    foreach ($RelativeFile in $Trace.files) {
      if ($RelativeFile -notmatch "(^|/|\\)(chunks|webpack-runtime\.js)(/|\\|$)") {
        continue
      }

      $RequiredFile = [System.IO.Path]::GetFullPath((Join-Path $TraceDir $RelativeFile))
      [void]$RequiredFiles.Add($RequiredFile)
    }
  }

  foreach ($RequiredFile in $RequiredFiles) {
    if (-not (Test-Path -LiteralPath $RequiredFile)) {
      throw "Deployment package is missing traced Next.js server file: $RequiredFile"
    }
  }
}

Push-Location $RepoRoot
try {
  if (-not $SkipInstall) {
    Invoke-CheckedCommand -FilePath "npm" -ArgumentList @("ci")
  } elseif (-not (Test-Path -LiteralPath (Join-Path $RepoRoot "node_modules\nodemailer\package.json"))) {
    Write-Host "SkipInstall set but nodemailer is missing; installing declared dependencies..."
    Invoke-CheckedCommand -FilePath "npm" -ArgumentList @("install", "--no-audit", "--no-fund")
  }

  Invoke-CheckedCommand -FilePath "npm" -ArgumentList @("run", "build")

  if (-not (Test-Path -LiteralPath $StandalonePath)) {
    throw "Standalone build output was not found at $StandalonePath."
  }

  $ExistingRuntimeData = Join-Path $ResolvedOutputPath "data"
  $ExistingNestedFinanceData = Join-Path $ResolvedOutputPath "apps\dashboard\data\finance"
  $DurableAttachments = Join-Path $RepoRoot "data\finance\payment-attachments"
  New-Item -ItemType Directory -Path $DurableAttachments -Force | Out-Null

  # BEFORE site wipe: pull any existing attachments into the durable repo-root store.
  foreach ($LegacyRoot in @(
    (Join-Path $ExistingRuntimeData "finance\payment-attachments"),
    (Join-Path $ExistingNestedFinanceData "payment-attachments")
  )) {
    if (Test-Path -LiteralPath $LegacyRoot) {
      $legacyFiles = @(Get-ChildItem -LiteralPath $LegacyRoot -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -ne '.gitkeep' -and $_.Name -ne 'README.md' })
      if ($legacyFiles.Count -gt 0) {
        Write-Host "Pre-publish migrate $($legacyFiles.Count) attachment file(s): $LegacyRoot -> $DurableAttachments"
        Copy-DirectoryContents -SourcePath $LegacyRoot -DestinationPath $DurableAttachments
      }
    }
  }

  if (Test-Path -LiteralPath $ExistingRuntimeData) {
    Copy-DirectoryContents -SourcePath $ExistingRuntimeData -DestinationPath $RuntimeDataBackupPath
  } elseif (Test-Path -LiteralPath $RuntimeDataBackupPath) {
    Remove-PathWithRetry -TargetDirectory $RuntimeDataBackupPath
  }
  # Preserve payment attachments previously stored under apps/dashboard/data/finance (pre-durable-root).
  if (Test-Path -LiteralPath $ExistingNestedFinanceData) {
    $NestedFinanceBackup = Join-Path $RuntimeDataBackupPath "finance"
    New-Item -ItemType Directory -Path $NestedFinanceBackup -Force | Out-Null
    Copy-DirectoryContents -SourcePath $ExistingNestedFinanceData -DestinationPath $NestedFinanceBackup
  }

  if (-not $NoStop -and (Test-Path -LiteralPath $ResolvedOutputPath)) {
    Stop-PublishTargetLocks -TargetDirectory $ResolvedOutputPath
  }

  if (Test-Path -LiteralPath $ResolvedOutputPath) {
    Remove-PathWithRetry -TargetDirectory $ResolvedOutputPath -AttemptStopLocks:(-not $NoStop)
  }

  New-Item -ItemType Directory -Path $ResolvedOutputPath | Out-Null

  Clear-StandalonePublishLoops -StandaloneRoot $StandalonePath
  Copy-TreeSafe -SourcePath $StandalonePath -DestinationPath $ResolvedOutputPath -ExcludeDirectoryNames @('deployment')

  $ServerSource = Join-Path $BuildPath "server"
  $ServerTarget = Join-Path $ResolvedOutputPath "apps\dashboard\.next\server"
  Copy-DirectoryContents -SourcePath $ServerSource -DestinationPath $ServerTarget

  $StaticTarget = Join-Path $ResolvedOutputPath "apps\dashboard\.next\static"
  Copy-DirectoryContents -SourcePath (Join-Path $BuildPath "static") -DestinationPath $StaticTarget

  $PublicTarget = Join-Path $ResolvedOutputPath "apps\dashboard\public"
  Copy-DirectoryContents -SourcePath (Join-Path $AppPath "public") -DestinationPath $PublicTarget

  $DataSource = Join-Path $AppPath "data"
  if (Test-Path -LiteralPath $DataSource) {
    $DataTarget = Join-Path $ResolvedOutputPath "apps\dashboard\data"
    Copy-DirectoryContents -SourcePath $DataSource -DestinationPath $DataTarget
    $RootDataTarget = Join-Path $ResolvedOutputPath "data"
    if (Test-Path -LiteralPath $RuntimeDataBackupPath) {
      Copy-DirectoryContents -SourcePath $RuntimeDataBackupPath -DestinationPath $RootDataTarget
    } else {
      Copy-DirectoryContents -SourcePath $DataSource -DestinationPath $RootDataTarget
    }
  }

  # Seed / ensure durable finance attachment store at REPO ROOT (not under IIS site package).
  $RepoFinanceData = Join-Path $RepoRoot "data\finance"
  $RepoHrisData = Join-Path $RepoRoot "data\hris"
  $DurableAttachments = Join-Path $RepoFinanceData "payment-attachments"
  $NestedAttachments = Join-Path $ResolvedOutputPath "apps\dashboard\data\finance\payment-attachments"
  $SitePackageAttachments = Join-Path $ResolvedOutputPath "data\finance\payment-attachments"
  $NestedHrisData = Join-Path $ResolvedOutputPath "apps\dashboard\data\hris"
  $SitePackageHrisData = Join-Path $ResolvedOutputPath "data\hris"
  New-Item -ItemType Directory -Path $DurableAttachments -Force | Out-Null
  New-Item -ItemType Directory -Path $NestedAttachments -Force | Out-Null
  New-Item -ItemType Directory -Path $SitePackageAttachments -Force | Out-Null
  New-Item -ItemType Directory -Path $RepoHrisData -Force | Out-Null
  New-Item -ItemType Directory -Path $NestedHrisData -Force | Out-Null
  New-Item -ItemType Directory -Path $SitePackageHrisData -Force | Out-Null

  # Migrate any attachments previously written into the IIS package into the durable repo store.
  foreach ($LegacyRoot in @($SitePackageAttachments, $NestedAttachments)) {
    if (Test-Path -LiteralPath $LegacyRoot) {
      $legacyFiles = Get-ChildItem -LiteralPath $LegacyRoot -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -ne '.gitkeep' -and $_.Name -ne 'README.md' }
      if ($legacyFiles) {
        Write-Host "Migrating $($legacyFiles.Count) legacy attachment file(s) from $LegacyRoot -> $DurableAttachments"
        Copy-DirectoryContents -SourcePath $LegacyRoot -DestinationPath $DurableAttachments
      }
    }
  }

  # Keep a read-only mirror under the site package for older code paths (primary is repo root).
  if (Test-Path -LiteralPath $DurableAttachments) {
    Copy-DirectoryContents -SourcePath $DurableAttachments -DestinationPath $SitePackageAttachments
    Copy-DirectoryContents -SourcePath $DurableAttachments -DestinationPath $NestedAttachments
  }
  Write-Host "Ensured durable payment attachments folder: $DurableAttachments"

  # Migrate HRIS JSON stores (dayrate overlay, earning adjustments, etc.) out of the IIS package.
  foreach ($LegacyHrisRoot in @($SitePackageHrisData, $NestedHrisData)) {
    if (Test-Path -LiteralPath $LegacyHrisRoot) {
      $legacyHrisFiles = @(Get-ChildItem -LiteralPath $LegacyHrisRoot -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -ne '.gitkeep' -and $_.Name -ne 'README.md' })
      if ($legacyHrisFiles.Count -gt 0) {
        Write-Host "Migrating $($legacyHrisFiles.Count) HRIS data file(s) from $LegacyHrisRoot -> $RepoHrisData"
        Copy-DirectoryContents -SourcePath $LegacyHrisRoot -DestinationPath $RepoHrisData
      }
    }
  }
  if (Test-Path -LiteralPath $RepoHrisData) {
    Copy-DirectoryContents -SourcePath $RepoHrisData -DestinationPath $SitePackageHrisData
    Copy-DirectoryContents -SourcePath $RepoHrisData -DestinationPath $NestedHrisData
  }
  Write-Host "Ensured durable HRIS data folder: $RepoHrisData"

  $WebConfigSource = if ($HostingMode -eq "HttpPlatform") {
    Join-Path $RepoRoot "deployment\iis\web.httpplatform.config"
  } else {
    Join-Path $RepoRoot "deployment\iis\web.config"
  }
  Copy-Item -LiteralPath $WebConfigSource -Destination (Join-Path $ResolvedOutputPath "web.config") -Force
  # HttpPlatform injects web.config env vars first; dotenv will not override them.
  # Rewrite to absolute durable repo paths so Apply/payroll never write under the site package.
  $PublishedWebConfig = Join-Path $ResolvedOutputPath "web.config"
  $RepoFinanceData = Join-Path $RepoRoot "data\finance"
  $RepoHrisData = Join-Path $RepoRoot "data\hris"
  if (Test-Path -LiteralPath $PublishedWebConfig) {
    $WebConfigText = Get-Content -LiteralPath $PublishedWebConfig -Raw
    $WebConfigText = [regex]::Replace(
      $WebConfigText,
      'name="DLE_FINANCE_DATA_DIR"\s+value="[^"]*"',
      ('name="DLE_FINANCE_DATA_DIR" value="{0}"' -f $RepoFinanceData)
    )
    $WebConfigText = [regex]::Replace(
      $WebConfigText,
      'name="DLE_HRIS_DATA_DIR"\s+value="[^"]*"',
      ('name="DLE_HRIS_DATA_DIR" value="{0}"' -f $RepoHrisData)
    )
    Set-Content -LiteralPath $PublishedWebConfig -Value $WebConfigText -NoNewline
    Write-Host "Pinned web.config DLE_FINANCE_DATA_DIR => $RepoFinanceData"
    Write-Host "Pinned web.config DLE_HRIS_DATA_DIR => $RepoHrisData"
  }
  Copy-Item -LiteralPath (Join-Path $RepoRoot "deployment\iis\Start-DleDashboard.ps1") -Destination (Join-Path $ResolvedOutputPath "Start-DleDashboard.ps1") -Force
  Copy-IisEnvironmentFile -DestinationRoot $ResolvedOutputPath

  Test-NextTraceFiles -NextRootPath (Join-Path $ResolvedOutputPath "apps\dashboard\.next")

  if (Test-Path -LiteralPath $RuntimeDataBackupPath) {
    Remove-PathWithRetry -TargetDirectory $RuntimeDataBackupPath
  }

  Write-Host "IIS deployment package created at $ResolvedOutputPath"
  Write-Host "Hosting mode: $HostingMode"

  if (-not $NoStop -and $script:PublishStoppedIis) {
    $started = @(Start-IisSitesUsingPath -TargetDirectory $ResolvedOutputPath | Select-Object -Unique)
    if ($started.Count -gt 0) {
      Write-Host ("Restarted IIS after publish: {0}" -f ($started -join ", "))
    } else {
      Write-Host "Recycle the IIS site/application pool if the dashboard still returns HTTP 503."
    }
  } elseif ($HostingMode -eq "ReverseProxy") {
    Write-Host "Run Start-DleDashboard.ps1 as a Windows service, then point IIS at this folder."
  } else {
    Write-Host "If needed, recycle the IIS application pool for the site pointing at this folder."
  }
}
finally {
  Pop-Location
}
