# run-evidence.ps1 <beforeDist> <afterDist> [perf] — matched captures for the Visual Quality Pass, one
# preview server and one capture at a time (the machine has little free memory).
#   Without "perf": before/ and after/ (1920x1080), before-390/ and after-390/ (390x844).
#   With "perf": GPU timing runs into perf-runs/, alternating base and new (desktop x2 each, phone x2 each).
param([string]$BeforeDist, [string]$AfterDist, [string]$Mode = '')
Set-Location C:\Users\egohv\Projects\HVAC-Company-Owner-V3-ThreeJS
$out = 'docs/visual-quality-pass'
function Capture([string]$dist, [string]$label, [string]$root, [string]$size, [string[]]$extra) {
  $p = Start-Process -PassThru -WindowStyle Hidden -FilePath "cmd.exe" -ArgumentList "/c npx vite preview --outDir `"$dist`" --host 127.0.0.1 --port 4194 --strictPort"
  Start-Sleep 4
  node docs/visual-quality-pass/scripts/capture.cjs $label "http://127.0.0.1:4194/" $root $size @extra 2>&1 | Select-String -Pattern "errors|Error" | Select-Object -Last 3
  "$label exit $LASTEXITCODE"
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*4194*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
}
if ($Mode -eq 'perf') {
  foreach ($r in @(@('base', $BeforeDist), @('new', $AfterDist), @('base2', $BeforeDist), @('new2', $AfterDist))) {
    Capture $r[1] "perf-$($r[0])" "$out/perf-runs" '1920x1080' @('--perf')
    Capture $r[1] "phone-$($r[0])" "$out/perf-runs" '390x844' @('--perf')
  }
} else {
  Capture $BeforeDist 'before' $out '1920x1080' @()
  Capture $AfterDist 'after' $out '1920x1080' @()
  Capture $BeforeDist 'before-390' $out '390x844' @()
  Capture $AfterDist 'after-390' $out '390x844' @()
}
'done'
