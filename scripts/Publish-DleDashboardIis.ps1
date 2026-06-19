param(
  [string]$OutputPath = "deployment\iis\site",
  [ValidateSet("ReverseProxy", "HttpPlatform")]
  [string]$HostingMode = "HttpPlatform",
  [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"

$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$AppPath = Join-Path $RepoRoot "apps\dashboard"
$BuildPath = Join-Path $AppPath ".next"
$StandalonePath = Join-Path $BuildPath "standalone"
$ResolvedOutputPath = [System.IO.Path]::GetFullPath((Join-Path $RepoRoot $OutputPath))
$RuntimeDataBackupPath = Join-Path $RepoRoot "deployment\iis\.runtime-data-backup"

function Copy-DirectoryContents {
  param(
    [Parameter(Mandatory = $true)][string]$SourcePath,
    [Parameter(Mandatory = $true)][string]$DestinationPath
  )

  if (-not (Test-Path -LiteralPath $SourcePath)) {
    throw "Required source path was not found: $SourcePath"
  }

  if (Test-Path -LiteralPath $DestinationPath) {
    Remove-Item -LiteralPath $DestinationPath -Recurse -Force
  }

  New-Item -ItemType Directory -Path $DestinationPath -Force | Out-Null
  Copy-Item -Path (Join-Path $SourcePath "*") -Destination $DestinationPath -Recurse -Force
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
    npm ci
  }

  npm run build

  if (-not (Test-Path -LiteralPath $StandalonePath)) {
    throw "Standalone build output was not found at $StandalonePath."
  }

  $ExistingRuntimeData = Join-Path $ResolvedOutputPath "data"
  if (Test-Path -LiteralPath $ExistingRuntimeData) {
    Copy-DirectoryContents -SourcePath $ExistingRuntimeData -DestinationPath $RuntimeDataBackupPath
  } elseif (Test-Path -LiteralPath $RuntimeDataBackupPath) {
    Remove-Item -LiteralPath $RuntimeDataBackupPath -Recurse -Force
  }

  if (Test-Path -LiteralPath $ResolvedOutputPath) {
    Remove-Item -LiteralPath $ResolvedOutputPath -Recurse -Force
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
  $EnvPath = Join-Path $RepoRoot ".env"
  if (Test-Path -LiteralPath $EnvPath) {
    Copy-Item -LiteralPath $EnvPath -Destination (Join-Path $ResolvedOutputPath ".env") -Force
  }

  Test-NextTraceFiles -NextRootPath (Join-Path $ResolvedOutputPath "apps\dashboard\.next")

  if (Test-Path -LiteralPath $RuntimeDataBackupPath) {
    Remove-Item -LiteralPath $RuntimeDataBackupPath -Recurse -Force
  }

  Write-Host "IIS deployment package created at $ResolvedOutputPath"
  Write-Host "Hosting mode: $HostingMode"
  Write-Host "Run Start-DleDashboard.ps1 as a Windows service, then point IIS at this folder."
}
finally {
  Pop-Location
}
