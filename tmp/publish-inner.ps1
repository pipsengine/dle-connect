$ErrorActionPreference = "Stop"
Set-Location "F:\Dorman-Long\dle-connect"
$log = "F:\Dorman-Long\dle-connect\deployment\iis\publish-elevated.log"
$host.UI.RawUI.WindowTitle = "DLE Connect publish"
"START $(Get-Date -Format o)" | Set-Content -LiteralPath $log
Write-Host "Publishing DLE Connect. This window stays open while the site is built."
Start-Transcript -LiteralPath $log -Append | Out-Null
try {
  & npm run publish:iis -- -SkipInstall
  $code = $LASTEXITCODE
} finally {
  Stop-Transcript | Out-Null
}
"EXIT $code $(Get-Date -Format o)" | Add-Content -LiteralPath $log
exit $code
