$ErrorActionPreference = 'Continue'
$secret = 'Cleymadematt8@'
$base = 'https://street-beryl.vercel.app/api/cron/catalog?mode=classify&limit=6'
$logPath = 'C:\Users\mattm\Documents\street\classify-log.txt'
$total = 0
$errors = 0
$batchNum = 0
"Starting classify run at $(Get-Date -Format o)" | Out-File -FilePath $logPath -Append

while ($true) {
  $batchNum++
  try {
    $raw = curl.exe -s --max-time 90 -H "Authorization: Bearer $secret" $base
    $json = $raw | ConvertFrom-Json
  } catch {
    "Batch $batchNum : FAILED to parse response: $raw" | Out-File -FilePath $logPath -Append
    Start-Sleep -Seconds 5
    continue
  }

  if (-not $json) {
    "Batch $batchNum : empty response, retrying" | Out-File -FilePath $logPath -Append
    Start-Sleep -Seconds 5
    continue
  }

  $count = $json.results.Count
  $errCount = ($json.results | Where-Object { $_.status -eq 'error' }).Count
  $total += $count
  $errors += $errCount
  "Batch $batchNum : processed=$count errors=$errCount runningTotal=$total runningErrors=$errors found=$($json.found)" | Out-File -FilePath $logPath -Append

  if ($count -eq 0 -or $json.found -eq 0) {
    "Classify run COMPLETE at $(Get-Date -Format o). Total processed: $total, total errors: $errors" | Out-File -FilePath $logPath -Append
    break
  }

  Start-Sleep -Seconds 2
}
