$apiRoot = Join-Path $PSScriptRoot '..\api'
Set-Location $apiRoot
php artisan queue:work --tries=3 --backoff=5
