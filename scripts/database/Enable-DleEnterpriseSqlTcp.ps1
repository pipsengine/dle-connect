param(
  [string]$InstanceRegistryName = 'MSSQL17.MSSQLSERVER',
  [string]$SqlServiceName = 'MSSQLSERVER',
  [int]$Port = 1433
)

$ErrorActionPreference = 'Stop'

$principal = [Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  throw 'Run this script from an elevated PowerShell window as Administrator.'
}

$tcpRoot = "HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\$InstanceRegistryName\MSSQLServer\SuperSocketNetLib\Tcp"
$ipAll = Join-Path $tcpRoot 'IPAll'

if (-not (Test-Path $tcpRoot)) {
  throw "SQL Server TCP registry path not found: $tcpRoot"
}

Set-ItemProperty -LiteralPath $tcpRoot -Name Enabled -Value 1
Set-ItemProperty -LiteralPath $tcpRoot -Name ListenOnAllIPs -Value 1
Set-ItemProperty -LiteralPath $ipAll -Name TcpPort -Value ([string]$Port)
Set-ItemProperty -LiteralPath $ipAll -Name TcpDynamicPorts -Value ''

$ruleName = "DLE Enterprise SQL Server TCP $Port"
if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port | Out-Null
}

if (Get-Service SQLBrowser -ErrorAction SilentlyContinue) {
  Set-Service SQLBrowser -StartupType Automatic
  Start-Service SQLBrowser
}

Restart-Service $SqlServiceName -Force

Write-Host "SQL Server TCP/IP is enabled on port $Port for $InstanceRegistryName."
Write-Host "Verify with: Test-NetConnection -ComputerName localhost -Port $Port"
