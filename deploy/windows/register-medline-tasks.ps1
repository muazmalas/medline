param(
    [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
    [string]$PhpBinary = $(if ($env:MEDLINE_PHP_BIN) { $env:MEDLINE_PHP_BIN } else { 'C:\PHP\8.2\php.exe' }),
    [string]$TaskUser = 'SYSTEM'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$apiRoot = Join-Path $ProjectRoot 'api'
$artisan = Join-Path $apiRoot 'artisan'
$queueScript = Join-Path $ProjectRoot 'scripts\start-queue.ps1'
$schedulerScript = Join-Path $ProjectRoot 'deploy\windows\start-scheduler.ps1'
$backupScript = Join-Path $ProjectRoot 'scripts\backup-mysql.ps1'
$pruneBackupScript = Join-Path $ProjectRoot 'scripts\prune-encrypted-backups.ps1'

foreach ($requiredPath in @($PhpBinary, $artisan, $queueScript, $schedulerScript, $backupScript, $pruneBackupScript)) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
        throw "Required deployment path was not found: $requiredPath"
    }
}

function Register-MedLineTask {
    param([string]$Name, [Microsoft.Management.Infrastructure.CimInstance]$Action, [Microsoft.Management.Infrastructure.CimInstance]$Trigger)
    $principal = New-ScheduledTaskPrincipal -UserId $TaskUser -LogonType ServiceAccount -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Days 1)
    Register-ScheduledTask -TaskName $Name -Action $Action -Trigger $Trigger -Principal $principal -Settings $settings -Force | Out-Null
}

$queueAction = New-ScheduledTaskAction -Execute $PhpBinary -Argument ('"{0}" queue:work --tries=3 --backoff=5 --sleep=3' -f $artisan) -WorkingDirectory $apiRoot
$schedulerAction = New-ScheduledTaskAction -Execute $PhpBinary -Argument ('"{0}" schedule:work' -f $artisan) -WorkingDirectory $apiRoot
$backupAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -File "{0}" -RequireEncryption' -f $backupScript) -WorkingDirectory $ProjectRoot
$pruneBackupAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -File "{0}"' -f $pruneBackupScript) -WorkingDirectory $ProjectRoot
$startupTrigger = New-ScheduledTaskTrigger -AtStartup
$backupTrigger = New-ScheduledTaskTrigger -Daily -At 2:00AM
$pruneBackupTrigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At 3:30AM

Register-MedLineTask -Name 'MedLine Laravel Queue' -Action $queueAction -Trigger $startupTrigger
Register-MedLineTask -Name 'MedLine Laravel Scheduler' -Action $schedulerAction -Trigger $startupTrigger
Register-MedLineTask -Name 'MedLine MySQL Backup' -Action $backupAction -Trigger $backupTrigger
Register-MedLineTask -Name 'MedLine Encrypted Backup Retention' -Action $pruneBackupAction -Trigger $pruneBackupTrigger

Write-Output 'MedLine native scheduled tasks registered.'
