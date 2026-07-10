param(
  [switch]$SkipInstall,
  [switch]$DevOnly
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

Write-Host "Syncing dashboard source from origin/main..."
git fetch origin
git reset --hard origin/main

if ($DevOnly) {
  Write-Host "Restarting dev server on port 3020..."
  npm run dev:3020:restart
  exit $LASTEXITCODE
}

Write-Host "Syncing mail environment for IIS/runtime..."
npm run sync:mail-env
if ($LASTEXITCODE -ne 0) {
  Write-Warning "Mail environment sync failed. Ensure apps/dashboard/.env.local exists on the server with Graph or SMTP credentials."
}

Write-Host "Publishing IIS dashboard package..."
if ($SkipInstall) {
  npm run publish:iis -- -SkipInstall
} else {
  npm run publish:iis
}
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Repairing IIS site..."
npm run repair:iis
exit $LASTEXITCODE
