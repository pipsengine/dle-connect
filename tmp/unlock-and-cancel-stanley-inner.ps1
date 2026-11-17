$ErrorActionPreference = 'Stop'
Import-Module WebAdministration

$src = 'C:\ProgramData\DLE-Connect\hris\ess-requests.json.tmp-stanley-cancel'
$dest = 'C:\ProgramData\DLE-Connect\hris\ess-requests.json'
if (-not (Test-Path -LiteralPath $src)) {
  throw "Updated leave file was not found: $src"
}

$poolName = 'DLE-CONNECT'
try {
  Stop-WebAppPool -Name $poolName
  $deadline = (Get-Date).AddSeconds(40)
  do {
    Start-Sleep -Milliseconds 500
    $state = (Get-WebAppPoolState -Name $poolName).Value
  } while ($state -ne 'Stopped' -and (Get-Date) -lt $deadline)
  if ((Get-WebAppPoolState -Name $poolName).Value -ne 'Stopped') {
    throw 'DLE-CONNECT app pool did not stop.'
  }
  Copy-Item -LiteralPath $src -Destination $dest -Force
  Remove-Item -LiteralPath $src -Force
  Write-Output 'ESS_REQUESTS_UPDATED'
} finally {
  Start-WebAppPool -Name $poolName
  $deadline = (Get-Date).AddSeconds(40)
  do {
    Start-Sleep -Milliseconds 500
    $state = (Get-WebAppPoolState -Name $poolName).Value
  } while ($state -ne 'Started' -and (Get-Date) -lt $deadline)
  Write-Output ("APP_POOL_STATE=" + (Get-WebAppPoolState -Name $poolName).Value)
}
