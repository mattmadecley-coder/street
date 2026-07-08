$sw = [Diagnostics.Stopwatch]::StartNew()
$r = curl.exe -s --max-time 90 -H 'Authorization: Bearer Cleymadematt8@' 'https://street-beryl.vercel.app/api/cron/catalog?mode=classify&limit=3'
$sw.Stop()
Write-Output "ELAPSED: $($sw.Elapsed.TotalSeconds)s"
Write-Output $r
