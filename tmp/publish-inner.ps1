$ErrorActionPreference = "Continue"
Set-Location "F:\Dorman-Long\dle-connect"
$log = "F:\Dorman-Long\dle-connect\deployment\iis\publish-elevated.log"
"Publish started $(Get-Date -Format o)" | Set-Content -LiteralPath $log -Encoding utf8
cmd /c "npm run publish:iis -- -SkipInstall >> `"$log`" 2>&1"
$code = $LASTEXITCODE
"Publish finished $(Get-Date -Format o) exit=$code" | Add-Content -LiteralPath $log -Encoding utf8
exit $code
