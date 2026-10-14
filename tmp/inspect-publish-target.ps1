$proc = Get-CimInstance Win32_Process -Filter "ProcessId=4640" -ErrorAction SilentlyContinue
if ($proc) {
  Write-Output ("PID=4640 CMD=" + $proc.CommandLine)
} else {
  Write-Output "PID=4640 not found"
}

Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue | ForEach-Object {
  Write-Output ("NODE PID=" + $_.ProcessId + " CMD=" + $_.CommandLine)
}

Import-Module WebAdministration -ErrorAction SilentlyContinue
Get-Website | ForEach-Object {
  $binds = ($_.bindings.Collection | ForEach-Object { $_.protocol + " " + $_.bindingInformation }) -join " | "
  Write-Output ("SITE=" + $_.Name + " STATE=" + $_.State + " PATH=" + $_.PhysicalPath + " BIND=" + $binds)
}
