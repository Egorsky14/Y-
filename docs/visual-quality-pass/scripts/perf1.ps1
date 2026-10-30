# perf1.ps1 <dist> <label> <WxH> — one GPU timing capture into perf-runs/<label> (one preview server, cleaned up after).
# Run captures one per call in the foreground: background shells are reaped when memory runs low.
param([string]$Dist, [string]$Label, [string]$Size)
Set-Location C:\Users\egohv\Projects\HVAC-Company-Owner-V3-ThreeJS
"free MB " + [int]((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1024)
$p = Start-Process -PassThru -WindowStyle Hidden -FilePath "cmd.exe" -ArgumentList "/c npx vite preview --outDir `"$Dist`" --host 127.0.0.1 --port 4194 --strictPort"
Start-Sleep 4
node docs/visual-quality-pass/scripts/capture.cjs $Label "http://127.0.0.1:4194/" docs/visual-quality-pass/perf-runs $Size --perf 2>&1 | Select-String -Pattern "errors|Error" | Select-Object -Last 3
"$Label exit $LASTEXITCODE"
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*4194*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
