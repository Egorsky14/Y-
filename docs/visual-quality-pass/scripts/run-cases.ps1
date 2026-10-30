# run-cases.ps1 <outFile> <case> [<case> ...] — browser cases ("project|spec") one at a time, one worker,
# appending exit code, counts, time, free memory and leftover browsers to <outFile>. Run a few cases per
# call in the foreground: background shells are reaped when memory runs low.
param([string]$OutFile, [Parameter(ValueFromRemainingArguments = $true)][string[]]$Cases)
Set-Location C:\Users\egohv\Projects\HVAC-Company-Owner-V3-ThreeJS
function FreeMB { [int]((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1024) }
foreach ($c in $Cases) {
  $proj, $spec = $c.Split('|')
  for ($i = 0; $i -lt 60 -and (FreeMB) -lt 1500; $i++) { Start-Sleep 5 }
  $free = FreeMB
  $t0 = Get-Date
  $log = Join-Path $env:TEMP "pw-$proj-$spec.log"
  cmd /c "npx playwright test e2e/$spec --project=$proj --workers=1 --reporter=line > `"$log`" 2>&1"
  $code = $LASTEXITCODE
  $text = Get-Content $log -Raw
  $passed = if ($text -match '(\d+) passed') { $Matches[1] } else { '' }
  $failed = if ($text -match '(\d+) failed') { $Matches[1] } else { '' }
  Start-Sleep 2
  $left = @(Get-CimInstance Win32_Process -Filter "Name='chrome.exe' OR Name='headless_shell.exe'" | Where-Object { $_.CommandLine -like '*playwright*' }).Count
  $line = "$proj|$spec exit=$code passed=$passed failed=$failed secs=$([int]((Get-Date) - $t0).TotalSeconds) freeRamMB=$free leftover=$left"
  $line | Add-Content -Encoding utf8 $OutFile
  $line
  if ($code -ne 0) { Copy-Item $log (Join-Path (Split-Path $OutFile) "fail-$proj-$spec.log"); Get-Content $log -Tail 25 }
}
git checkout -- docs/screenshots 2>$null
