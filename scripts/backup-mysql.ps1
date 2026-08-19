param(
    [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\backups\mysql'),
    [string]$Database = 'medline',
    [string]$Username = $(if ($env:MEDLINE_BACKUP_DB_USER) { $env:MEDLINE_BACKUP_DB_USER } else { 'medline_app' }),
    [string]$HostName = $(if ($env:MEDLINE_BACKUP_DB_HOST) { $env:MEDLINE_BACKUP_DB_HOST } else { '127.0.0.1' }),
    [int]$Port = $(if ($env:MEDLINE_BACKUP_DB_PORT) { [int]$env:MEDLINE_BACKUP_DB_PORT } else { 3306 }),
    [string]$MySqlBin = $(if ($env:MEDLINE_MYSQL_BIN) { $env:MEDLINE_MYSQL_BIN } else { 'C:\Program Files\MySQL\MySQL Server 8.0\bin' }),
    [string]$EncryptionCertificateThumbprint = $(if ($env:MEDLINE_BACKUP_ENCRYPTION_CERT_THUMBPRINT) { $env:MEDLINE_BACKUP_ENCRYPTION_CERT_THUMBPRINT } else { '' }),
    [switch]$RequireEncryption
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $env:MEDLINE_BACKUP_DB_PASSWORD) {
    throw 'Set MEDLINE_BACKUP_DB_PASSWORD in the protected backup task environment before running this script.'
}

if ($RequireEncryption -and [string]::IsNullOrWhiteSpace($EncryptionCertificateThumbprint)) {
    throw 'Production backups require MEDLINE_BACKUP_ENCRYPTION_CERT_THUMBPRINT or an explicit encryption certificate thumbprint.'
}

$dumpTool = Join-Path $MySqlBin 'mysqldump.exe'
if (-not (Test-Path -LiteralPath $dumpTool)) {
    throw "mysqldump.exe was not found at $dumpTool"
}

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupPath = Join-Path $OutputDirectory "$Database-$stamp.sql"
$env:MYSQL_PWD = $env:MEDLINE_BACKUP_DB_PASSWORD

try {
    & $dumpTool --host=$HostName --port=$Port --user=$Username --single-transaction --routines --events --triggers --hex-blob --default-character-set=utf8mb4 --result-file=$backupPath $Database
    if ($LASTEXITCODE -ne 0) {
        throw "mysqldump failed with exit code $LASTEXITCODE"
    }
    if (-not [string]::IsNullOrWhiteSpace($EncryptionCertificateThumbprint)) {
        $thumbprint = ($EncryptionCertificateThumbprint -replace '\s', '').ToUpperInvariant()
        if ($thumbprint -notmatch '^[A-F0-9]{40}$') { throw 'The backup encryption certificate thumbprint must be a 40-character hexadecimal value.' }
        $certificate = Get-ChildItem -LiteralPath "Cert:\LocalMachine\My\$thumbprint" -ErrorAction SilentlyContinue
        if (-not $certificate) { throw "Backup encryption certificate was not found in the LocalMachine certificate store: $thumbprint" }
        $encryptedPath = "$backupPath.cms"
        Protect-CmsMessage -To $certificate -Path $backupPath -OutFile $encryptedPath
        Remove-Item -LiteralPath $backupPath
        Write-Output "Created encrypted backup: $encryptedPath"
    } else {
        Write-Output "Created unencrypted backup: $backupPath"
    }
}
finally {
    Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue
}
