param(
  [string]$SitePath = "",
  [int]$Port = 3020,
  [switch]$RecycleOnly
)

$ErrorActionPreference = "Stop"

function Get-NormalizedPath {
  param([Parameter(Mandatory = $true)][string]$TargetDirectory)

  if ([string]::IsNullOrWhiteSpace($TargetDirectory)) {
    throw "A directory path is required."
  }

  return [System.IO.Path]::GetFullPath($TargetDirectory).TrimEnd('\', '/').ToLowerInvariant()
}

function Import-DotEnv {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) { return }
  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#") -or $line.IndexOf("=") -lt 1) { return }
    $key = $line.Substring(0, $line.IndexOf("=")).Trim()
    $value = $line.Substring($line.IndexOf("=") + 1).Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    if (-not [System.Environment]::GetEnvironmentVariable($key, "Process")) {
      [System.Environment]::SetEnvironmentVariable($key, $value, "Process")
    }
  }
}

function Show-LogTail {
  param([Parameter(Mandatory = $true)][string]$LogDirectory)

  if (-not (Test-Path -LiteralPath $LogDirectory)) {
    Write-Warning "Log directory not found: $LogDirectory"
    return
  }

  $latest = Get-ChildItem -LiteralPath $LogDirectory -Filter "dle-dashboard*.log" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  if (-not $latest) {
    Write-Warning "No dle-dashboard*.log files found in $LogDirectory"
    return
  }

  Write-Host ""
  Write-Host "Latest log: $($latest.FullName)"
  Get-Content -LiteralPath $latest.FullName -Tail 40 | ForEach-Object { Write-Host $_ }
}

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
if (-not $SitePath) {
  $candidates = @(
    (Join-Path $repoRoot "deployment\iis\site"),
    "F:\Dorman-Long\dle-connect\deployment\iis\site",
    "C:\inetpub\wwwroot\dle-connect"
  )
  $SitePath = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}

if (-not $SitePath -or -not (Test-Path -LiteralPath $SitePath)) {
  throw "Published IIS site folder not found. Run npm run publish:iis first or pass -SitePath."
}

$siteRoot = [System.IO.Path]::GetFullPath($SitePath)
$serverPath = Join-Path $siteRoot "apps\dashboard\server.js"
$logDirectory = Join-Path $siteRoot "logs"

Write-Host "DLE Dashboard IIS repair"
Write-Host "Site path: $siteRoot"
Write-Host "Expected port: $Port"
Write-Host ""

if (-not (Test-Path -LiteralPath $serverPath)) {
  throw "Missing $serverPath. Republish with: npm run publish:iis"
}

$nodePath = "C:\Program Files\nodejs\node.exe"
if (-not (Test-Path -LiteralPath $nodePath)) {
  throw "Node.js not found at $nodePath. Install Node.js LTS on this server."
}

if (-not (Get-Module -ListAvailable -Name WebAdministration)) {
  Write-Warning "WebAdministration module unavailable. Install IIS management tools or recycle the app pool manually."
} else {
  Import-Module WebAdministration -ErrorAction SilentlyContinue
  if (Get-PSDrive -Name IIS -ErrorAction SilentlyContinue) {
    $matchedSites = @()
    $target = Get-NormalizedPath -TargetDirectory $siteRoot
    foreach ($site in Get-ChildItem IIS:\Sites) {
      $bindingMatch = @($site.bindings.Collection | Where-Object { $_.bindingInformation -like "*:${Port}:*" })
      $pathMatch = $false
      $physicalPath = [string]$site.physicalPath
      if (-not [string]::IsNullOrWhiteSpace($physicalPath)) {
        try {
          $sitePhysical = Get-NormalizedPath -TargetDirectory $physicalPath
          $pathMatch = ($sitePhysical -eq $target) -or $sitePhysical.StartsWith("$target\")
        } catch {
          Write-Warning "Could not read physical path for IIS site '$($site.Name)': $($_.Exception.Message)"
        }
      }

      if ($pathMatch -or $bindingMatch.Count -gt 0) {
        $matchedSites += $site
      }
    }

    if ($matchedSites.Count -eq 0) {
      Write-Warning "No IIS site matched path $siteRoot or port $Port."
    } else {
      foreach ($site in $matchedSites) {
        $poolName = [string]$site.applicationPool
        $physicalPath = if ([string]::IsNullOrWhiteSpace($site.physicalPath)) { "(not set)" } else { $site.physicalPath }
        Write-Host "Recycling IIS site '$($site.Name)' / app pool '$poolName' (path: $physicalPath)..."
        if ($poolName) {
          Restart-WebAppPool -Name $poolName -ErrorAction SilentlyContinue
        }
        if ($site.State -ne "Started") {
          Start-Website -Name $site.Name -ErrorAction SilentlyContinue
        }
      }
      Start-Sleep -Seconds 5
    }
  }
}

if (-not $RecycleOnly) {
  Write-Host "Probing http://127.0.0.1:$Port/ ..."
  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/" -UseBasicParsing -TimeoutSec 45
    Write-Host "Health check OK: HTTP $($response.StatusCode)"
  } catch {
    Write-Warning "Health check failed: $($_.Exception.Message)"
    Write-Host ""
    Write-Host "Manual startup test (Ctrl+C after you see 'Ready' or an error):"
    Write-Host "  cd `"$siteRoot`""
    Write-Host "  .\Start-DleDashboard.ps1 -Port $Port"
    Show-LogTail -LogDirectory $logDirectory
  }
} else {
  Show-LogTail -LogDirectory $logDirectory
}

Write-Host ""
Write-Host "If HTTP 503 persists:"
Write-Host "  1. Confirm HttpPlatformHandler is installed in IIS."
Write-Host "  2. Confirm deployment\iis\site\web.config uses HttpPlatform mode."
Write-Host "  3. Grant the app pool identity read/write on site\.env, site\data, and site\logs."
Write-Host "  4. Re-run: npm run publish:iis"
