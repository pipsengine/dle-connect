$ErrorActionPreference = 'Continue'
$out = 'F:\Dorman-Long\dle-connect\tmp\iis-start.txt'
$lines = New-Object System.Collections.Generic.List[string]
Import-Module WebAdministration -ErrorAction SilentlyContinue
try {
  Start-WebAppPool -Name 'DLE-CONNECT'
  $lines.Add('started pool DLE-CONNECT')
} catch {
  $lines.Add("pool fail $($_.Exception.Message)")
}
try {
  Start-Website -Name 'DLE-CONNECT'
  $lines.Add('started site DLE-CONNECT')
} catch {
  $lines.Add("site fail $($_.Exception.Message)")
}
$lines | Set-Content -LiteralPath $out
