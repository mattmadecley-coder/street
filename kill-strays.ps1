Stop-Process -Id 20224 -Force -ErrorAction SilentlyContinue
Stop-Process -Id 15552 -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like "*classify-all*" } | Select-Object ProcessId,CommandLine
Write-Output "DONE"
