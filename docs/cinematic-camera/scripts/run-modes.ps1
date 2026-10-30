# run-modes.ps1 <dist> <label> <size> <lot> [<lot> ...] — one preview server, then modes.cjs for each
# lot in turn (one browser at a time: the machine has little free memory). Shots go to
# docs/cinematic-camera/<label>/.
param([string]$Dist, [string]$Label, [string]$Size, [Parameter(ValueFromRemainingArguments = $true)][string[]]$Lots)
Set-Location C:\Users\egohv\Projects\HVAC-Company-Owner-V3-ThreeJS
$p = Start-Process -PassThru -WindowStyle Hidden -FilePath "cmd.exe" -ArgumentList "/c npx vite preview --outDir `"$Dist`" --host 127.0.0.1 --port 4195 --strictPort"
Start-Sleep 4
foreach ($lot in $Lots) {
  cmd /c "node docs/cinematic-camera/scripts/modes.cjs $Label http://127.0.0.1:4195/ docs/cinematic-camera $Size $lot 2>&1"
  "$Label $lot exit $LASTEXITCODE"
}
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*4195*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
'done'
