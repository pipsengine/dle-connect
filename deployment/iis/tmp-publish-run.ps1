$ErrorActionPreference = 'Continue'
$log = 'F:\Dorman-Long\dle-connect\deployment\iis\tmp-publish.log'
Set-Location 'F:\Dorman-Long\dle-connect'
"PUBLISH_START $(Get-Date -Format o)" | Set-Content -LiteralPath $log -Encoding UTF8
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'F:\Dorman-Long\dle-connect\scripts\Publish-DleDashboardIis.ps1' *>&1 | Tee-Object -FilePath $log -Append
"PUBLISH_EXIT=$LASTEXITCODE" | Add-Content -LiteralPath $log
