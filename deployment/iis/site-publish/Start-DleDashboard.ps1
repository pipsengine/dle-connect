param(
  [int]$Port = 3010,
  [string]$HostName = "127.0.0.1"
)

$ErrorActionPreference = "Stop"

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$CandidateServerPaths = @(
  (Join-Path $ScriptRoot "..\site\apps\dashboard\server.js"),
  (Join-Path $ScriptRoot "apps\dashboard\server.js")
)

$ServerPath = $CandidateServerPaths |
  ForEach-Object { [System.IO.Path]::GetFullPath($_) } |
  Where-Object { Test-Path -LiteralPath $_ } |
  Select-Object -First 1

if (-not $ServerPath) {
  throw "Could not find apps\dashboard\server.js. Run npm run publish:iis first, then start from the published site folder."
}

$env:NODE_ENV = "production"
$env:NEXT_TELEMETRY_DISABLED = "1"
$env:PORT = [string]$Port
$env:HOSTNAME = $HostName

Set-Location (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $ServerPath)))
node $ServerPath
