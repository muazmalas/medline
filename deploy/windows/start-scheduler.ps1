$apiRoot = Join-Path $PSScriptRoot '..\..\api'
Set-Location $apiRoot
php artisan schedule:work
