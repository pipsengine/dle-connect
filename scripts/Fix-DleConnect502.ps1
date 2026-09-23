param(
  [string]$SitePath = "F:\Dorman-Long\dle-connect\deployment\iis\site",
  [string]$SiteName = "DLE-CONNECT",
  [string]$AppPoolName = "DLE-CONNECT",
  [int]$PublicHttpsPort = 1432,
  [int]$ManualPort = 3020
)

$ErrorActionPreference = "Stop"

function Write-Utf8NoBom {
  param([Parameter(Mandatory = $true)][string]$Path, [Parameter(Mandatory = $true)][string]$Content)
  $encoding = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($Path, $Content, $encoding)
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

if (-not (Test-Path -LiteralPath $SitePath)) {
  throw "Site path not found: $SitePath"
}

$siteRoot = [System.IO.Path]::GetFullPath($SitePath)
$logDirectory = Join-Path $siteRoot "logs"
$serverPath = Join-Path $siteRoot "apps\dashboard\server.js"
$webConfigPath = Join-Path $siteRoot "web.config"
$nodePath = "C:\Program Files\nodejs\node.exe"

Write-Host "DLE Connect 502 fix"
Write-Host "Site: $siteRoot"
Write-Host ""

if (-not (Test-Path -LiteralPath $serverPath)) {
  throw "Missing $serverPath. Run npm run publish:iis first."
}
if (-not (Test-Path -LiteralPath $nodePath)) {
  throw "Node.js not found at $nodePath"
}
if (-not (Test-Path -LiteralPath $webConfigPath)) {
  throw "Missing $webConfigPath"
}

# 1) HttpPlatformHandler cannot start Node if the stdout log folder is missing.
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
Write-Host "Ensured logs folder: $logDirectory"

# 2) Rewrite web.config as UTF-8 without BOM (Set-Content BOM breaks IIS XML).
$webText = Get-Content -LiteralPath $webConfigPath -Raw
if ($webText -notmatch 'httpPlatformHandler') {
  Write-Warning "web.config does not reference httpPlatformHandler. Expected HttpPlatform hosting mode."
}
Write-Utf8NoBom -Path $webConfigPath -Content $webText
Write-Host "Rewrote web.config as UTF-8 (no BOM)"

# 3) App-pool identity needs write access for logs/.env/data.
$identities = @("IIS AppPool\$AppPoolName", "IIS_IUSRS")
foreach ($id in $identities) {
  Grant-ModifyAcl -Path $logDirectory -Identity $id
  Grant-ModifyAcl -Path (Join-Path $siteRoot ".env") -Identity $id
  Grant-ModifyAcl -Path (Join-Path $siteRoot "data") -Identity $id
  Grant-ModifyAcl -Path (Join-Path $siteRoot "apps\dashboard\data") -Identity $id
}
Write-Host "Granted modify ACL to app pool / IIS_IUSRS on logs, .env, data"

# 4) Smoke-test Node outside IIS so startup errors are visible.
Write-Host ""
Write-Host "Smoke-testing Node on 127.0.0.1:$ManualPort ..."
Get-NetTCPConnection -LocalPort $ManualPort -ErrorAction SilentlyContinue |
  ForEach-Object {
    try { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } catch {}
  }

$envFile = Join-Path $siteRoot ".env"
$env:NODE_ENV = "production"
$env:NEXT_TELEMETRY_DISABLED = "1"
$env:HOSTNAME = "127.0.0.1"
$env:PORT = [string]$ManualPort
if (Test-Path -LiteralPath $envFile) {
  Get-Content -LiteralPath $envFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#") -or $line.IndexOf("=") -lt 1) { return }
    $key = $line.Substring(0, $line.IndexOf("=")).Trim()
    $value = $line.Substring($line.IndexOf("=") + 1).Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    [System.Environment]::SetEnvironmentVariable($key, $value, "Process")
  }
}

$outLog = Join-Path $logDirectory "manual-smoke.out.log"
$errLog = Join-Path $logDirectory "manual-smoke.err.log"
$smoke = Start-Process -FilePath $nodePath -ArgumentList ".\apps\dashboard\server.js" `
  -WorkingDirectory $siteRoot `
  -RedirectStandardOutput $outLog `
  -RedirectStandardError $errLog `
  -PassThru -WindowStyle Hidden

$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 2
  if ($smoke.HasExited) { break }
  try {
    $probe = Invoke-WebRequest -Uri "http://127.0.0.1:$ManualPort/login" -UseBasicParsing -TimeoutSec 5
    if ($probe.StatusCode -ge 200 -and $probe.StatusCode -lt 500) {
      $ready = $true
      break
    }
  } catch {}
}

if ($ready) {
  Write-Host "Node smoke test OK on :$ManualPort"
} else {
  Write-Warning "Node smoke test failed. Recent stderr:"
  if (Test-Path -LiteralPath $errLog) { Get-Content -LiteralPath $errLog -Tail 40 }
  if (Test-Path -LiteralPath $outLog) { Get-Content -LiteralPath $outLog -Tail 40 }
}

try { Stop-Process -Id $smoke.Id -Force -ErrorAction SilentlyContinue } catch {}
Start-Sleep -Seconds 1

# 5) Recycle IIS so HttpPlatformHandler starts a fresh Node child.
Import-Module WebAdministration -ErrorAction Stop
Write-Host ""
Write-Host "Recycling IIS site '$SiteName' / app pool '$AppPoolName'..."
$poolState = (Get-WebAppPoolState -Name $AppPoolName -ErrorAction SilentlyContinue).Value
if ($poolState -eq "Started") {
  Restart-WebAppPool -Name $AppPoolName
} else {
  Start-WebAppPool -Name $AppPoolName
}
$site = Get-Website -Name $SiteName -ErrorAction SilentlyContinue
if ($site -and $site.State -ne "Started") {
  Start-Website -Name $SiteName
}

Write-Host "Waiting for HttpPlatform startup..."
Start-Sleep -Seconds 12

# 6) Probe public HTTPS binding (HttpPlatform does NOT use fixed :3020).
$publicOk = $false
foreach ($uri in @(
    "https://127.0.0.1:$PublicHttpsPort/login",
    "http://127.0.0.1:$PublicHttpsPort/login",
    "https://dleconnect.dormanlongeng.com:$PublicHttpsPort/login"
  )) {
  try {
    [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
    $response = Invoke-WebRequest -Uri $uri -UseBasicParsing -TimeoutSec 30
    Write-Host "Public probe OK: $uri -> HTTP $($response.StatusCode)"
    $publicOk = $true
    break
  } catch {
    Write-Warning "Public probe failed: $uri -> $($_.Exception.Message)"
  }
}

$latest = Get-ChildItem -LiteralPath $logDirectory -Filter "dle-dashboard*.log" -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
if ($latest) {
  Write-Host ""
  Write-Host "Latest HttpPlatform log: $($latest.FullName)"
  Get-Content -LiteralPath $latest.FullName -Tail 50
} else {
  Write-Warning "No dle-dashboard*.log yet. If 502 continues, HttpPlatformHandler may be missing or pool identity cannot write logs."
}

Write-Host ""
if ($publicOk) {
  Write-Host "Site looks healthy. Open https://dleconnect.dormanlongeng.com:$PublicHttpsPort/login"
} else {
  Write-Host "Still failing. Confirm HttpPlatformHandler is installed, then re-check the log tail above."
}
