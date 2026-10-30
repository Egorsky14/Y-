# cap.ps1 <dist dir> <label> <outRoot> <size> [extra args...] — one preview server, one capture, then clean up.
param([string]$Dist, [string]$Label, [string]$OutRoot, [string]$Size, [Parameter(ValueFromRemainingArguments = $true)][string[]]$Extra)
$port = 4190
$p = Start-Process -PassThru -WindowStyle Hidden -FilePath "cmd.exe" -ArgumentList "/c npx vite preview --outDir `"$Dist`" --host 127.0.0.1 --port $port --strictPort"
Start-Sleep 4
node docs/graphics-revolution-2/scripts/capture.cjs $Label "http://127.0.0.1:$port/" $OutRoot $Size @Extra 2>&1 | Select-String -Pattern "errors|Error|gpuMs" | Select-Object -Last 14
$code = $LASTEXITCODE
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like "*$port*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
"exit $code"
