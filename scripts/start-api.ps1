param(
    [int]$Port = 8000
)

$apiRoot = Join-Path $PSScriptRoot '..\api'
Set-Location $apiRoot
php artisan serve --host=127.0.0.1 --port=$Port
