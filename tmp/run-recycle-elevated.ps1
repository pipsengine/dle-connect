$ErrorActionPreference = "Stop"
$inner = "F:\Dorman-Long\dle-connect\tmp\recycle-iis-inner.ps1"
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $inner
  exit $LASTEXITCODE
}
$process = Start-Process -FilePath "powershell.exe" -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList @(
  "-NoProfile",
  "-ExecutionPolicy",
  "Bypass",
  "-File",
  $inner
)
Write-Output ("ELEVATED_EXIT=" + $process.ExitCode)
exit $process.ExitCode
