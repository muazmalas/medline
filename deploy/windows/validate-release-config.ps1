param(
    [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
    [switch]$RequireProviderCredentials,
    [switch]$RequireBackupEncryption
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Read-DotEnv {
    param([string]$Path)

    $values = @{}
    foreach ($line in Get-Content -LiteralPath $Path) {
        if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
            $values[$Matches[1]] = $Matches[2].Trim().Trim('"')
        }
    }
    return $values
}

function Require-Path {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { throw "Required release path is missing: $Path" }
}

function Require-Value {
    param([hashtable]$Values, [string]$Name)
    if (-not $Values.ContainsKey($Name) -or [string]::IsNullOrWhiteSpace([string]$Values[$Name]) -or [string]$Values[$Name] -match 'replace-with|example\.com|generate-a-unique-key') {
        throw "Required production value is missing or still a placeholder: $Name"
    }
}

$apiRoot = Join-Path $ProjectRoot 'api'
$webRoot = Join-Path $ProjectRoot 'web'
$apiEnv = Join-Path $apiRoot '.env'
$webEnv = Join-Path $webRoot '.env.production'

Require-Path $apiRoot
Require-Path $webRoot
Require-Path (Join-Path $apiRoot 'artisan')
Require-Path (Join-Path $apiRoot 'composer.lock')
Require-Path (Join-Path $webRoot 'package-lock.json')
Require-Path $apiEnv
Require-Path $webEnv

$api = Read-DotEnv $apiEnv
$web = Read-DotEnv $webEnv
foreach ($name in @('APP_KEY', 'APP_URL', 'DB_HOST', 'DB_DATABASE', 'DB_USERNAME', 'DB_PASSWORD', 'CORS_ALLOWED_ORIGINS')) { Require-Value $api $name }
foreach ($name in @('VITE_API_URL')) { Require-Value $web $name }

if ($api['APP_ENV'] -ne 'production') { throw 'api/.env must set APP_ENV=production for a release.' }
if ($api['APP_DEBUG'] -ne 'false') { throw 'api/.env must set APP_DEBUG=false for a release.' }
if ($api['DB_USERNAME'] -eq 'root') { throw 'Production API configuration must use a restricted MySQL account, not root.' }
if ($api['APP_URL'] -notmatch '^https://') { throw 'APP_URL must use HTTPS outside local development.' }
if ($web['VITE_API_URL'] -notmatch '^https://') { throw 'VITE_API_URL must use HTTPS outside local development.' }
if ($api['CORS_ALLOWED_ORIGINS'] -match '\*') { throw 'CORS_ALLOWED_ORIGINS must contain explicit trusted HTTPS origins, not a wildcard.' }
if ($api['MEDLINE_ENFORCE_HTTPS'] -ne 'true') { throw 'MEDLINE_ENFORCE_HTTPS=true is required for a production release.' }
if ($api['SESSION_SECURE_COOKIE'] -ne 'true') { throw 'SESSION_SECURE_COOKIE=true is required for a production release.' }
if ($api['SESSION_HTTP_ONLY'] -ne 'true') { throw 'SESSION_HTTP_ONLY=true is required for a production release.' }
if ($api['SESSION_SAME_SITE'] -notin @('lax', 'strict')) { throw 'SESSION_SAME_SITE must be lax or strict for a production release.' }
$tokenExpiration = 0
if (-not [int]::TryParse([string]$api['SANCTUM_TOKEN_EXPIRATION'], [ref]$tokenExpiration) -or $tokenExpiration -lt 15 -or $tokenExpiration -gt 1440) { throw 'SANCTUM_TOKEN_EXPIRATION must be between 15 and 1440 minutes for a production release.' }
$locationStaleMinutes = 0
if (-not [int]::TryParse([string]$api['MEDLINE_DELIVERY_LOCATION_STALE_MINUTES'], [ref]$locationStaleMinutes) -or $locationStaleMinutes -lt 1 -or $locationStaleMinutes -gt 1440) { throw 'MEDLINE_DELIVERY_LOCATION_STALE_MINUTES must be between 1 and 1440 minutes.' }
$transactionAttempts = 0
if (-not [int]::TryParse([string]$api['MEDLINE_DATABASE_TRANSACTION_ATTEMPTS'], [ref]$transactionAttempts) -or $transactionAttempts -lt 1 -or $transactionAttempts -gt 5) { throw 'MEDLINE_DATABASE_TRANSACTION_ATTEMPTS must be between 1 and 5 attempts.' }
if ($api['MEDLINE_IDEMPOTENCY_IN_PROGRESS_TIMEOUT_SECONDS'] -and ([int]$api['MEDLINE_IDEMPOTENCY_IN_PROGRESS_TIMEOUT_SECONDS'] -lt 60)) { throw 'MEDLINE_IDEMPOTENCY_IN_PROGRESS_TIMEOUT_SECONDS must be at least 60 seconds.' }
if ($api['FILESYSTEM_DISK'] -eq 'public') { throw 'FILESYSTEM_DISK=public is not permitted for private production documents.' }
if ($api['QUEUE_CONNECTION'] -eq 'sync') { throw 'QUEUE_CONNECTION=sync is not permitted in a production release.' }
if ([string]::IsNullOrWhiteSpace([string]$api['CACHE_STORE'])) { throw 'CACHE_STORE must be explicitly configured for a production release.' }
if ($api['MEDLINE_UPLOAD_SCAN_ENABLED'] -eq 'true') { Require-Value $api 'MEDLINE_UPLOAD_SCANNER_COMMAND' }
foreach ($name in @('MEDLINE_ANNUAL_PHARMACY_AMOUNT', 'MEDLINE_ANNUAL_WAREHOUSE_AMOUNT', 'MEDLINE_MAP_USER_AGENT')) { Require-Value $api $name }
if ((-not [string]::IsNullOrWhiteSpace([string]$api['MEDLINE_SMS_ENDPOINT'])) -xor (-not [string]::IsNullOrWhiteSpace([string]$api['MEDLINE_SMS_BEARER_TOKEN']))) { throw 'MEDLINE_SMS_ENDPOINT and MEDLINE_SMS_BEARER_TOKEN must be configured together or both left empty.' }

if ($RequireProviderCredentials) {
    foreach ($name in @('MAIL_HOST', 'MAIL_USERNAME', 'MAIL_PASSWORD', 'MEDLINE_FCM_ENDPOINT', 'MEDLINE_FCM_BEARER_TOKEN')) { Require-Value $api $name }
}

if ($RequireBackupEncryption) {
    $thumbprint = (([string]$env:MEDLINE_BACKUP_ENCRYPTION_CERT_THUMBPRINT) -replace '\s', '').ToUpperInvariant()
    if ($thumbprint -notmatch '^[A-F0-9]{40}$') { throw 'MEDLINE_BACKUP_ENCRYPTION_CERT_THUMBPRINT must be a 40-character hexadecimal value.' }
}

Write-Output 'MedLine release configuration shape is valid. No secrets were displayed and no external services were contacted.'
