# run-closeups.ps1 <beforeDist> <afterDist> — close-up evidence for five house styles, desktop and
# 390x844, before and after: one preview server and one capture at a time.
param([string]$BeforeDist, [string]$AfterDist)
Set-Location C:\Users\egohv\Projects\HVAC-Company-Owner-V3-ThreeJS
$lots = @('c-n-4', 'a-n-2', 'a-s-2', 'b-n-2', 'a-n-4')  # ranch (tutorial), two-story, premium, spanish, modern
$runs = @(@('before', $BeforeDist, '1920x1080'), @('after', $AfterDist, '1920x1080'), @('before-390', $BeforeDist, '390x844'), @('after-390', $AfterDist, '390x844'))
foreach ($r in $runs) {
  $label, $dist, $size = $r
  $p = Start-Process -PassThru -WindowStyle Hidden -FilePath "cmd.exe" -ArgumentList "/c npx vite preview --outDir `"$dist`" --host 127.0.0.1 --port 4192 --strictPort"
  Start-Sleep 4
  foreach ($lot in $lots) {
    node docs/camera-occlusion/scripts/closeup.cjs $label "http://127.0.0.1:4192/" docs/camera-occlusion $size $lot 2>&1 | Select-Object -Last 1
    "exit $LASTEXITCODE"
  }
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*4192*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
}
"done"
