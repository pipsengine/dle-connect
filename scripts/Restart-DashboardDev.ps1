param(
  [int]$Port = 3020
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

Write-Host "Cleaning apps/dashboard/.next..."
& npm run clean
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Starting dashboard dev server on port $Port (use http://localhost:$Port in your browser)..."
$env:APP_URL = "http://localhost:$Port"
$env:NEXT_PUBLIC_APP_URL = "http://localhost:$Port"
& node node_modules/next/dist/bin/next dev apps/dashboard -p $Port -H 127.0.0.1
exit $LASTEXITCODE
