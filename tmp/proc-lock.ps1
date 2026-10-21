$ErrorActionPreference = 'Continue'
$out = 'F:\Dorman-Long\dle-connect\tmp\proc-lock.txt'
$lines = New-Object System.Collections.Generic.List[string]
Import-Module WebAdministration -ErrorAction SilentlyContinue
if (Get-PSDrive -Name IIS -ErrorAction SilentlyContinue) {
  $site = Get-Website -Name 'DLE-CONNECT' -ErrorAction SilentlyContinue
  if ($site) {
    $lines.Add("SITE state=$($site.State) pool=$($site.applicationPool)")
    if ($site.State -ne 'Stopped') {
      try { Stop-Website -Name 'DLE-CONNECT'; $lines.Add('stopped site') } catch { $lines.Add("site fail $($_.Exception.Message)") }
    }
    try { Stop-WebAppPool -Name 'DLE-CONNECT'; $lines.Add('stopped pool') } catch { $lines.Add("pool fail $($_.Exception.Message)") }
  }
}
Get-CimInstance Win32_Process -Filter "Name = 'node.exe' OR Name = 'w3wp.exe'" | ForEach-Object {
  $cmd = [string]$_.CommandLine
  $lines.Add("PID $($_.ProcessId) $($_.Name) exe=$($_.ExecutablePath) cmd=$cmd")
  $normalized = $cmd.ToLowerInvariant()
  $isCursor = $normalized.Contains('\cursor\') -or $normalized.Contains('tsserver') -or $normalized.Contains('typingsinstaller')
  $isDashboard = $normalized.Contains('apps\dashboard\server.js') -or $normalized.Contains('deployment\iis\site') -or $normalized.Contains('dle-connect')
  if (-not $isCursor -and ($isDashboard -or $_.Name -eq 'w3wp.exe')) {
    try {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop
      $lines.Add("killed $($_.ProcessId)")
    } catch {
      $lines.Add("kill fail $($_.ProcessId) $($_.Exception.Message)")
    }
  }
}
$lines | Set-Content -LiteralPath $out
