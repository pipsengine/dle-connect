$ErrorActionPreference = 'Continue'
$out = 'F:\Dorman-Long\dle-connect\tmp\iis-stop.txt'
$lines = New-Object System.Collections.Generic.List[string]
Import-Module WebAdministration -ErrorAction SilentlyContinue
if (Get-PSDrive -Name IIS -ErrorAction SilentlyContinue) {
  foreach ($site in Get-ChildItem IIS:\Sites) {
    $lines.Add("SITE $($site.Name) pool=$($site.applicationPool) path=$($site.physicalPath) state=$($site.State)")
    if ([string]$site.physicalPath -like '*dle-connect*') {
      try {
        Stop-WebAppPool -Name $site.applicationPool
        $lines.Add("stopped pool $($site.applicationPool)")
      } catch {
        $lines.Add("pool fail $($_.Exception.Message)")
      }
      try {
        Stop-Website -Name $site.Name
        $lines.Add("stopped site $($site.Name)")
      } catch {
        $lines.Add("site fail $($_.Exception.Message)")
      }
    }
  }
} else {
  $lines.Add('no IIS drive')
}
Get-Process w3wp -ErrorAction SilentlyContinue | ForEach-Object {
  try {
    Stop-Process -Id $_.Id -Force
    $lines.Add("killed w3wp $($_.Id)")
  } catch {
    $lines.Add("w3wp fail $($_.Exception.Message)")
  }
}
$lines | Set-Content -LiteralPath $out
