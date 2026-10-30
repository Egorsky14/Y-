# run-specs.ps1 <outFile> — the 21-case browser matrix, one Playwright case at a time (one worker),
# waiting for 1.5 GB free RAM before each case and recording exit code, counts, time and leftovers.
param([string]$OutFile)
Set-Location C:\Users\egohv\Projects\HVAC-Company-Owner-V3-ThreeJS
$cases = @(
  'desktop-1080p|gameplay.spec.ts', 'desktop-1080p|graphics.spec.ts', 'desktop-1080p|automation.spec.ts', 'desktop-1080p|banking.spec.ts', 'desktop-1080p|banking-layout.spec.ts', 'desktop-1080p|supply.spec.ts',
  'laptop-768p|graphics.spec.ts',
  'small-1024|graphics.spec.ts', 'small-1024|banking-layout.spec.ts', 'small-1024|supply.spec.ts', 'small-1024|automation.spec.ts',
  'iphone-portrait|mobile.spec.ts', 'iphone-portrait|banking-layout.spec.ts',
  'phone-390x844|banking-layout.spec.ts', 'phone-390x844|supply.spec.ts', 'phone-390x844|automation.spec.ts',
  'iphone-landscape|mobile.spec.ts', 'iphone-landscape|supply.spec.ts',
  'android-portrait|mobile.spec.ts', 'android-landscape|mobile.spec.ts', 'tablet-portrait|mobile.spec.ts'
)
if (Test-Path $OutFile) { Remove-Item $OutFile }
function FreeMB { [int]((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1024) }
foreach ($c in $cases) {
  $proj, $spec = $c.Split('|')
  for ($i = 0; $i -lt 60 -and (FreeMB) -lt 1500; $i++) { Start-Sleep 5 }
  $minFree = FreeMB
  $t0 = Get-Date
  $log = Join-Path $env:TEMP "pw-$proj-$spec.log"
  $job = Start-Process -PassThru -NoNewWindow -FilePath "cmd.exe" -ArgumentList "/c npx playwright test e2e/$spec --project=$proj --workers=1 --reporter=line > `"$log`" 2>&1"
  $null = $job.Handle  # cache the handle so ExitCode is available after exit
  while (-not $job.HasExited) { Start-Sleep 2; $f = FreeMB; if ($f -lt $minFree) { $minFree = $f } }
  $code = $job.ExitCode
  $secs = [int]((Get-Date) - $t0).TotalSeconds
  $text = Get-Content $log -Raw
  $passed = if ($text -match '(\d+) passed') { $Matches[1] } else { '' }
  $failed = if ($text -match '(\d+) failed') { $Matches[1] } else { '' }
  Start-Sleep 2
  $left = @(Get-CimInstance Win32_Process -Filter "Name='chrome.exe' OR Name='headless_shell.exe'" | Where-Object { $_.CommandLine -like '*playwright*' }).Count
  "$proj|$spec exit=$code passed=$passed failed=$failed secs=$secs minFreeRamMB=$minFree leftover=$left" | Add-Content -Encoding utf8 $OutFile
  if ($null -eq $code -or $code -ne 0) { Copy-Item $log (Join-Path (Split-Path $OutFile) "fail-$proj-$spec.log") }
}
git checkout -- docs/screenshots 2>$null
"done" | Add-Content -Encoding utf8 $OutFile
