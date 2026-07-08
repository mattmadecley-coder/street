Start-Sleep -Seconds 75
$r = curl.exe -s --max-time 90 -H 'Authorization: Bearer Cleymadematt8@' 'https://street-beryl.vercel.app/api/cron/catalog?mode=classify-preview&limit=1'
Write-Output $r
