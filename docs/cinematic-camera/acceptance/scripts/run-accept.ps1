# run-accept.ps1 <profile> <lot> [<lot> ...] - accept.cjs for each lot in turn, one browser at a time
# (the machine has little free memory), against $env:ACCEPT_URL. Appends to acceptance/runs.txt.
param([string]$Profile, [Parameter(ValueFromRemainingArguments = $true)][string[]]$Lots)
Set-Location C:\Users\egohv\Projects\HVAC-Company-Owner-V3-ThreeJS
foreach ($lot in $Lots) {
  $s = Get-Date
  $free = [int]((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1024)
  $o = cmd /c "node docs/cinematic-camera/acceptance/scripts/accept.cjs docs/cinematic-camera/acceptance $Profile $lot 2>&1"
  $line = "$Profile|$lot exit=$LASTEXITCODE secs=$([int]((Get-Date) - $s).TotalSeconds) freeMB=$free :: $(($o | Select-Object -Last 2) -join ' / ')"
  Add-Content docs/cinematic-camera/acceptance/runs.txt $line
  $line
}
