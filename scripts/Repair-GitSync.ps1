# Repairs git fetch "Unlink of pack *.idx failed" on Windows IIS servers.
# Run in elevated PowerShell from the repo root, with Cursor/npm stopped.
param(
  [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Stop"
Set-Location $RepoRoot

Write-Host "Stopping stray git processes..."
Get-Process git -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

$env:GIT_TERMINAL_PROMPT = "0"

Write-Host "Disabling auto-gc during sync..."
git config gc.auto 0

Write-Host "Fetching origin/main..."
git -c gc.auto=0 fetch origin
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "Fetch still failed. Common fixes:" -ForegroundColor Yellow
  Write-Host "  1. Close Cursor/VS Code on this repo"
  Write-Host "  2. Stop npm/IIS app pools using F:\Dorman-Long\dle-connect"
  Write-Host "  3. Exclude .git from antivirus real-time scan"
  Write-Host "  4. Run: resmon -> CPU -> Associated Handles -> search pack-02783"
  exit 1
}

Write-Host "Resetting to origin/main..."
git reset --hard origin/main
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Git sync complete. You can run: npm run deploy:server" -ForegroundColor Green
