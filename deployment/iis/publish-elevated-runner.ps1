$Host.UI.RawUI.WindowTitle = 'DLE Connect IIS publish'
$ErrorActionPreference = 'Continue'
Set-Location 'F:\Dorman-Long\dle-connect'
$log = 'F:\Dorman-Long\dle-connect\deployment\iis\publish-elevated.log'
try { Stop-Transcript | Out-Null } catch {}
Start-Transcript -LiteralPath $log -Force | Out-Null
Write-Host 'DLE Connect IIS publish starting. Progress appears in this window.'
Write-Host 'Leave this window open until it finishes.'
$code = 0
try {
  & 'F:\Dorman-Long\dle-connect\scripts\Publish-DleDashboardIis.ps1' -SkipInstall
  if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -gt 7) { $code = $LASTEXITCODE }
} catch {
  Write-Host $_.Exception.Message
  $code = 1
}
Write-Host "PUBLISH_EXIT_CODE=$code"
try { Stop-Transcript | Out-Null } catch {}
Add-Content -LiteralPath $log -Value "PUBLISH_EXIT_CODE=$code"
exit $code
