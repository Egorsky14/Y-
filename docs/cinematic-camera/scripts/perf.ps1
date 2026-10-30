# perf.ps1 <dist> <label> <WxH> — one GPU timing capture (the Visual Quality Pass views and method,
# docs/visual-quality-pass/scripts/capture.cjs --perf) into docs/cinematic-camera/perf-runs/<label>.
# One preview server, cleaned up after; run one per call in the foreground (low free memory).
param([string]$Dist, [string]$Label, [string]$Size)
Set-Location C:\Users\egohv\Projects\HVAC-Company-Owner-V3-ThreeJS
"free MB " + [int]((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1024)
$p = Start-Process -PassThru -WindowStyle Hidden -FilePath "cmd.exe" -ArgumentList "/c npx vite preview --outDir `"$Dist`" --host 127.0.0.1 --port 4196 --strictPort"
Start-Sleep 4
node docs/visual-quality-pass/scripts/capture.cjs $Label "http://127.0.0.1:4196/" docs/cinematic-camera/perf-runs $Size --perf 2>&1 | Select-String -Pattern "errors|Error" | Select-Object -Last 3
"$Label exit $LASTEXITCODE"
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*4196*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
