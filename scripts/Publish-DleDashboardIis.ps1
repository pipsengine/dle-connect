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
      $poolState = (Get-WebAppPoolState -Name $poolName -ErrorAction SilentlyContinue).Value
      if ($poolState -and $poolState -ne "Stopped") {
        Stop-WebAppPool -Name $poolName -ErrorAction SilentlyContinue
        $stopped.Add("IIS app pool '$poolName'")
      }
    }

    if ($site.State -ne "Stopped") {
      Stop-Website -Name $site.Name -ErrorAction SilentlyContinue
      $stopped.Add("IIS site '$($site.Name)'")
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
      $poolState = (Get-WebAppPoolState -Name $poolName -ErrorAction SilentlyContinue).Value
      if ($poolState -ne "Started") {
        Start-WebAppPool -Name $poolName -ErrorAction SilentlyContinue
        $started.Add("IIS app pool '$poolName'")
      }
    }

    if ($site.State -ne "Started") {
      Start-Website -Name $site.Name -ErrorAction SilentlyContinue
      $started.Add("IIS site '$($site.Name)'")
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
    [Parameter(Mandatory = $true)][string]$DestinationPath
  )

  if (-not (Test-Path -LiteralPath $SourcePath)) {
    throw "Required source path was not found: $SourcePath"
  }

  if (Test-Path -LiteralPath $DestinationPath) {
    Remove-PathWithRetry -TargetDirectory $DestinationPath
  }

  New-Item -ItemType Directory -Path $DestinationPath -Force | Out-Null
  Copy-Item -Path (Join-Path $SourcePath "*") -Destination $DestinationPath -Recurse -Force
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

  $DestinationEnv = Join-Path $DestinationRoot ".env"
  Copy-Item -LiteralPath $EnvSource -Destination $DestinationEnv -Force
  Ensure-InternalDeployEnvDefaults -EnvFilePath $DestinationEnv

  $DashboardEnvTargetDirectory = Join-Path $DestinationRoot "apps\dashboard"
  if (Test-Path -LiteralPath $DashboardEnvTargetDirectory) {
    $DashboardEnv = Join-Path $DashboardEnvTargetDirectory ".env"
    Copy-Item -LiteralPath $EnvSource -Destination $DashboardEnv -Force
    Ensure-InternalDeployEnvDefaults -EnvFilePath $DashboardEnv
  }

  Write-Host "Copied IIS runtime environment from $EnvSource"
}

function Ensure-InternalDeployEnvDefaults {
  param(
    [Parameter(Mandatory = $true)][string]$EnvFilePath
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
  if (Test-Path -LiteralPath $ExistingRuntimeData) {
    Copy-DirectoryContents -SourcePath $ExistingRuntimeData -DestinationPath $RuntimeDataBackupPath
  } elseif (Test-Path -LiteralPath $RuntimeDataBackupPath) {
    Remove-PathWithRetry -TargetDirectory $RuntimeDataBackupPath
  }

  if (-not $NoStop -and (Test-Path -LiteralPath $ResolvedOutputPath)) {
    Stop-PublishTargetLocks -TargetDirectory $ResolvedOutputPath
  }

  if (Test-Path -LiteralPath $ResolvedOutputPath) {
    Remove-PathWithRetry -TargetDirectory $ResolvedOutputPath -AttemptStopLocks:(-not $NoStop)
  }

  New-Item -ItemType Directory -Path $ResolvedOutputPath | Out-Null

  Copy-Item -Path (Join-Path $StandalonePath "*") -Destination $ResolvedOutputPath -Recurse -Force

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

  $WebConfigSource = if ($HostingMode -eq "HttpPlatform") {
    Join-Path $RepoRoot "deployment\iis\web.httpplatform.config"
  } else {
    Join-Path $RepoRoot "deployment\iis\web.config"
  }
  Copy-Item -LiteralPath $WebConfigSource -Destination (Join-Path $ResolvedOutputPath "web.config") -Force
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
