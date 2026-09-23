param(
  [string]$SitePath = "",
  [int]$Port = 3020,
  [int]$PublicHttpsPort = 1432,
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

function Start-Or-Recycle-WebAppPool {
  param([Parameter(Mandatory = $true)][string]$PoolName)

  if ([string]::IsNullOrWhiteSpace($PoolName)) { return }

  $poolState = (Get-WebAppPoolState -Name $PoolName -ErrorAction SilentlyContinue).Value
  if ($poolState -eq "Started") {
    Write-Host "Recycling app pool '$PoolName'..."
    Restart-WebAppPool -Name $PoolName -ErrorAction Stop
    return
  }

  Write-Host "Starting stopped app pool '$PoolName' (was: $poolState)..."
  Start-WebAppPool -Name $PoolName -ErrorAction Stop
}

function Start-Or-Recycle-Website {
  param([Parameter(Mandatory = $true)][string]$SiteName)

  if ([string]::IsNullOrWhiteSpace($SiteName)) { return }

  $site = Get-Website -Name $SiteName -ErrorAction SilentlyContinue
  if (-not $site) {
    Write-Warning "IIS site '$SiteName' was not found."
    return
  }

  if ($site.State -eq "Started") {
    Write-Host "IIS site '$SiteName' is already started."
    return
  }

  Write-Host "Starting stopped IIS site '$SiteName'..."
  Start-Website -Name $SiteName -ErrorAction Stop
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

function Grant-ModifyAcl {
  param([Parameter(Mandatory = $true)][string]$Path, [Parameter(Mandatory = $true)][string]$Identity)
  if (-not (Test-Path -LiteralPath $Path)) { return }
  try {
    icacls $Path /grant "${Identity}:(OI)(CI)M" /T /C /Q | Out-Null
  } catch {
    Write-Warning "Could not grant ACL to ${Identity} on ${Path}: $($_.Exception.Message)"
  }
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
$webConfigPath = Join-Path $siteRoot "web.config"

Write-Host "DLE Dashboard IIS repair"
Write-Host "Site path: $siteRoot"
Write-Host "Expected manual/reverse-proxy port: $Port"
Write-Host "Public HTTPS port: $PublicHttpsPort"
Write-Host ""

if (-not (Test-Path -LiteralPath $serverPath)) {
  throw "Missing $serverPath. Republish with: npm run publish:iis"
}

$nodePath = "C:\Program Files\nodejs\node.exe"
if (-not (Test-Path -LiteralPath $nodePath)) {
  throw "Node.js not found at $nodePath. Install Node.js LTS on this server."
}

# HttpPlatformHandler cannot launch Node if stdoutLogFile's directory is missing.
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
Write-Host "Ensured logs folder: $logDirectory"

if (Test-Path -LiteralPath $webConfigPath) {
  $webText = Get-Content -LiteralPath $webConfigPath -Raw
  $utf8NoBom = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($webConfigPath, $webText, $utf8NoBom)
  Write-Host "Normalized web.config encoding (UTF-8 no BOM)"
}

$matchedPoolName = $null
if (-not (Get-Module -ListAvailable -Name WebAdministration)) {
  Write-Warning "WebAdministration module unavailable. Install IIS management tools or recycle the app pool manually."
} else {
  Import-Module WebAdministration -ErrorAction SilentlyContinue
  if (Get-PSDrive -Name IIS -ErrorAction SilentlyContinue) {
    $matchedSites = @()
    $target = Get-NormalizedPath -TargetDirectory $siteRoot
    foreach ($site in Get-ChildItem IIS:\Sites) {
      $bindingMatch = @(
        $site.bindings.Collection | Where-Object {
          $_.bindingInformation -like "*:${Port}:*" -or
          $_.bindingInformation -like "*:${PublicHttpsPort}:*"
        }
      )
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
      Write-Warning "No IIS site matched path $siteRoot or ports $Port/$PublicHttpsPort."
    } else {
      foreach ($site in $matchedSites) {
        $poolName = [string]$site.applicationPool
        $matchedPoolName = $poolName
        $physicalPath = if ([string]::IsNullOrWhiteSpace($site.physicalPath)) { "(not set)" } else { $site.physicalPath }
        Write-Host "Repairing IIS site '$($site.Name)' / app pool '$poolName' (path: $physicalPath)..."
        try {
          if ($poolName) {
            Grant-ModifyAcl -Path $logDirectory -Identity "IIS AppPool\$poolName"
            Grant-ModifyAcl -Path (Join-Path $siteRoot ".env") -Identity "IIS AppPool\$poolName"
            Grant-ModifyAcl -Path (Join-Path $siteRoot "data") -Identity "IIS AppPool\$poolName"
            Start-Or-Recycle-WebAppPool -PoolName $poolName
          }
          Start-Or-Recycle-Website -SiteName $site.Name
        } catch {
          Write-Warning "Could not repair IIS site '$($site.Name)': $($_.Exception.Message)"
        }
      }
      Start-Sleep -Seconds 8
    }
  }
}

if (-not $RecycleOnly) {
  # HttpPlatform uses %HTTP_PLATFORM_PORT% (dynamic). Prefer the public IIS binding.
  $probes = @(
    "https://127.0.0.1:$PublicHttpsPort/login",
    "http://127.0.0.1:$PublicHttpsPort/login",
    "http://127.0.0.1:$Port/login"
  )
  $ok = $false
  foreach ($uri in $probes) {
    Write-Host "Probing $uri ..."
    try {
      [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
      $response = Invoke-WebRequest -Uri $uri -UseBasicParsing -TimeoutSec 45
      Write-Host "Health check OK: HTTP $($response.StatusCode) ($uri)"
      $ok = $true
      break
    } catch {
      Write-Warning "Health check failed: $($_.Exception.Message)"
    }
  }

  if (-not $ok) {
    Write-Host ""
    Write-Host "Manual startup test (Ctrl+C after you see Ready or an error):"
    Write-Host "  cd `"$siteRoot`""
    Write-Host "  .\Start-DleDashboard.ps1 -Port $Port"
    Write-Host "Or run: powershell -ExecutionPolicy Bypass -File scripts\Fix-DleConnect502.ps1"
    Show-LogTail -LogDirectory $logDirectory
  }
} else {
  Show-LogTail -LogDirectory $logDirectory
}

Write-Host ""
Write-Host "If HTTP 502/503 persists:"
Write-Host "  1. Confirm HttpPlatformHandler is installed in IIS."
Write-Host "  2. Confirm deployment\iis\site\web.config uses HttpPlatform mode."
Write-Host "  3. Grant the app pool identity read/write on site\.env, site\data, and site\logs."
Write-Host "  4. Re-run: npm run publish:iis"
if ($matchedPoolName) {
  Write-Host "  5. App pool in use: $matchedPoolName"
}
