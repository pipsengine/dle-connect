$ErrorActionPreference = "Stop"
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
$admin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Write-Output ("ADMIN=" + $admin)
$inner = "F:\Dorman-Long\dle-connect\tmp\publish-inner.ps1"
if ($admin) {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $inner
  exit $LASTEXITCODE
}
$process = Start-Process -FilePath "powershell.exe" -Verb RunAs -Wait -PassThru -WindowStyle Normal -ArgumentList @(
  "-NoProfile",
  "-ExecutionPolicy",
  "Bypass",
  "-File",
  $inner
)
Write-Output ("ELEVATED_EXIT=" + $process.ExitCode)
exit $process.ExitCode
