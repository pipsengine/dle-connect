param(
  [switch]$SkipInstall,
  [switch]$DevOnly
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

function Sync-OriginMain {
  $env:GIT_TERMINAL_PROMPT = "0"
  $maxAttempts = 4

  for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    Write-Host "Syncing dashboard source from origin/main (attempt $attempt/$maxAttempts)..."

    Get-Process git -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2

    # Disable auto-gc during fetch to reduce pack file churn on Windows.
    git -c gc.auto=0 fetch origin 2>&1 | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -eq 0) {
      git reset --hard origin/main
      if ($LASTEXITCODE -eq 0) { return }
    }

    if ($attempt -lt $maxAttempts) {
      Write-Warning "git sync failed. Retrying in 5 seconds. Close IDE/dev servers using this repo if this keeps failing."
      Start-Sleep -Seconds 5
    }
  }

  throw @"
git fetch/reset failed after $maxAttempts attempts.

Windows often blocks .git\objects\pack\*.idx while Cursor, npm, or another git process is running.

On the server, run:
  Get-Process git* | Stop-Process -Force
  cd F:\Dorman-Long\dle-connect
  git -c gc.auto=0 fetch origin
  git reset --hard origin/main

Then rerun: npm run deploy:server
"@
}

Sync-OriginMain

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
