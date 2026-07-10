param(
  [string]$RepoRoot = "",
  [switch]$InternalServer,
  [string[]]$TargetFiles = @()
)

$ErrorActionPreference = "Stop"

if (-not $RepoRoot) {
  $RepoRoot = Split-Path -Parent $PSScriptRoot
}

$AppPath = Join-Path $RepoRoot "apps\dashboard"
$LocalEnv = Join-Path $AppPath ".env.local"
$AppEnv = Join-Path $AppPath ".env"
$SiteEnv = Join-Path $RepoRoot "deployment\iis\site\.env"
$SiteDashboardEnv = Join-Path $RepoRoot "deployment\iis\site\apps\dashboard\.env"

if (-not (Test-Path -LiteralPath $LocalEnv)) {
  throw "Missing $LocalEnv. Add Microsoft Graph or SMTP settings there first."
}

function Read-DotEnvMap {
  param([Parameter(Mandatory = $true)][string]$Path)

  $map = [ordered]@{}
  if (-not (Test-Path -LiteralPath $Path)) { return $map }

  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#") -or $line.IndexOf("=") -lt 1) { return }
    $key = $line.Substring(0, $line.IndexOf("=")).Trim()
    $value = $line.Substring($line.IndexOf("=") + 1).Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $map[$key] = $value
  }
  return $map
}

function Write-DotEnvMap {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][hashtable]$Map
  )

  $parent = Split-Path -Parent $Path
  if ($parent -and -not (Test-Path -LiteralPath $parent)) {
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
  }

  $lines = New-Object System.Collections.Generic.List[string]
  foreach ($entry in $Map.GetEnumerator()) {
    $value = [string]$entry.Value
    if ($value -match '[\s#"]') {
      $lines.Add("$($entry.Key)=`"$($value.Replace('"', '\"'))`"")
    } else {
      $lines.Add("$($entry.Key)=$value")
    }
  }
  Set-Content -LiteralPath $Path -Value $lines -Encoding UTF8
}

function Merge-MailEnvironment {
  param(
    [Parameter(Mandatory = $true)][string]$TargetPath,
    [Parameter(Mandatory = $true)][hashtable]$MailValues
  )

  $existing = Read-DotEnvMap -Path $TargetPath
  foreach ($entry in $MailValues.GetEnumerator()) {
    $existing[$entry.Key] = $entry.Value
  }
  Write-DotEnvMap -Path $TargetPath -Map $existing
  Write-Host "Updated mail environment in $TargetPath"
}

$localMap = Read-DotEnvMap -Path $LocalEnv
$mailKeys = @(
  'APP_URL',
  'NEXT_PUBLIC_APP_URL',
  'DLE_PUBLIC_APP_URL',
  'DLE_INTERNAL_APP_URL',
  'DLE_MAIL_PROVIDER',
  'MS_GRAPH_TENANT_ID',
  'MS_GRAPH_CLIENT_ID',
  'MS_GRAPH_CLIENT_SECRET',
  'MS_GRAPH_SENDER_EMAIL',
  'MS_GRAPH_SCOPE',
  'DLE_SMTP_HOST',
  'DLE_SMTP_PORT',
  'DLE_SMTP_SECURE',
  'DLE_SMTP_REQUIRE_TLS',
  'DLE_SMTP_USER',
  'DLE_SMTP_PASSWORD',
  'DLE_SMTP_FROM',
  'DLE_SMTP_REPLY_TO',
  'PAYROLL_APPROVAL_FALLBACK_EMAIL',
  'AUTH_SESSION_SECRET'
)

$mailValues = [ordered]@{}
foreach ($key in $mailKeys) {
  if ($localMap.Contains($key) -and [string]::IsNullOrWhiteSpace([string]$localMap[$key]) -eq $false) {
    $mailValues[$key] = $localMap[$key]
  }
}

if ($InternalServer) {
  $mailValues['APP_URL'] = 'http://192.168.5.5:3020'
  $mailValues['NEXT_PUBLIC_APP_URL'] = 'http://192.168.5.5:3020'
  $mailValues['DLE_INTERNAL_APP_URL'] = 'http://192.168.5.5:3020'
  $mailValues['DLE_PUBLIC_APP_URL'] = 'http://192.168.5.5:3020'
  Write-Host "Applied internal server URLs (192.168.5.5:3020) for workflow email links."
}

if (-not $mailValues.Contains('DLE_MAIL_PROVIDER')) {
  throw "DLE_MAIL_PROVIDER is missing from $LocalEnv"
}

if ($mailValues['DLE_MAIL_PROVIDER'] -eq 'graph') {
  foreach ($required in @('MS_GRAPH_TENANT_ID', 'MS_GRAPH_CLIENT_ID', 'MS_GRAPH_CLIENT_SECRET', 'MS_GRAPH_SENDER_EMAIL')) {
    if (-not $mailValues.Contains($required)) {
      throw "Graph mail is selected but $required is missing from $LocalEnv"
    }
  }
}

if ($mailValues['DLE_MAIL_PROVIDER'] -eq 'smtp') {
  foreach ($required in @('DLE_SMTP_HOST', 'DLE_SMTP_FROM', 'DLE_SMTP_USER', 'DLE_SMTP_PASSWORD')) {
    if (-not $mailValues.Contains($required)) {
      throw "SMTP mail is selected but $required is missing from $LocalEnv"
    }
  }
}

if (-not $TargetFiles -or $TargetFiles.Count -eq 0) {
  $TargetFiles = @($AppEnv, $SiteEnv, $SiteDashboardEnv)
}

foreach ($target in $TargetFiles) {
  if ([string]::IsNullOrWhiteSpace($target)) { continue }
  $resolved = if ([System.IO.Path]::IsPathRooted($target)) { $target } else { Join-Path $RepoRoot $target }
  Merge-MailEnvironment -TargetPath $resolved -MailValues $mailValues
}

Write-Host "Mail environment sync complete."
