Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Select-Object ProcessId,CreationDate,CommandLine | Format-List
