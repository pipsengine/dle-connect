$ErrorActionPreference = "Stop"
Import-Module WebAdministration
Restart-WebAppPool -Name "DLE-CONNECT"
$site = Get-Website -Name "DLE-CONNECT"
if ($site.State -ne "Started") {
  Start-Website -Name "DLE-CONNECT"
}
Write-Output "RECYCLED DLE-CONNECT"
Get-WebAppPoolState -Name "DLE-CONNECT"
(Get-Website -Name "DLE-CONNECT").State
