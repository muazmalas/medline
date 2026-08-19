param(
    [int]$Port = 3001
)

$webRoot = Join-Path $PSScriptRoot '..\web'
Set-Location $webRoot
npm run dev -- --host 127.0.0.1 --port=$Port
