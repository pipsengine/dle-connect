param(
  [int]$Port = 3020,
  [switch]$Clean
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

$connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
$pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique

foreach ($processId in $pids) {
  try {
    $process = Get-Process -Id $processId -ErrorAction Stop
    Write-Host "Stopping $($process.ProcessName) (PID $processId) on port $Port..."
    Stop-Process -Id $processId -Force -ErrorAction Stop
  } catch {
    Write-Warning "Could not stop PID $processId on port ${Port}: $($_.Exception.Message)"
  }
}

if ($pids) {
  Start-Sleep -Seconds 1
}

# Full .next wipe forces every route to cold-compile again (very slow on this app).
# Use -Clean only when the cache is corrupt.
if ($Clean) {
  Write-Host "Cleaning apps/dashboard/.next..."
  & npm run clean
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} else {
  Write-Host "Keeping apps/dashboard/.next warm (pass -Clean to wipe cache)."
}

Write-Host "Starting dashboard dev server on port $Port (use http://localhost:$Port in your browser)..."
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot "scripts\Sync-MailEnvironment.ps1") -InternalServer -TargetFiles @((Join-Path $RepoRoot "apps\dashboard\.env")) 2>$null
$env:APP_URL = "http://192.168.5.5:$Port"
$env:NEXT_PUBLIC_APP_URL = "http://192.168.5.5:$Port"
& node node_modules/next/dist/bin/next dev apps/dashboard -p $Port -H 127.0.0.1
exit $LASTEXITCODE
