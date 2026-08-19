param(
    [string]$BackupDirectory = (Join-Path $PSScriptRoot '..\backups\mysql'),
    [int]$RetentionDays = $(if ($env:MEDLINE_BACKUP_RETENTION_DAYS) { [int]$env:MEDLINE_BACKUP_RETENTION_DAYS } else { 30 })
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($RetentionDays -lt 1) { throw 'RetentionDays must be at least one day.' }
if (-not (Test-Path -LiteralPath $BackupDirectory)) {
    Write-Output "Backup directory does not exist; nothing to prune: $BackupDirectory"
    exit 0
}

$cutoff = (Get-Date).AddDays(-$RetentionDays)
$expired = Get-ChildItem -LiteralPath $BackupDirectory -File -Filter '*.sql.cms' | Where-Object { $_.LastWriteTime -lt $cutoff }
foreach ($file in $expired) { Remove-Item -LiteralPath $file.FullName -Force }
Write-Output "Pruned $($expired.Count) encrypted backup artifact(s) older than $RetentionDays day(s)."
