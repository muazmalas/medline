param(
    [Parameter(Mandatory = $true)]
    [uri]$BaseUri,
    [int]$TimeoutSeconds = 15,
    [string]$FailureLogPath = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($BaseUri.Scheme -ne 'https') {
    throw 'The health probe requires an HTTPS base URI.'
}
if ($TimeoutSeconds -lt 1 -or $TimeoutSeconds -gt 120) {
    throw 'TimeoutSeconds must be between 1 and 120.'
}

function Test-MedLineEndpoint {
    param([uri]$Uri)

    try {
        $response = Invoke-WebRequest -Uri $Uri -Method Get -Headers @{ Accept = 'application/json' } -TimeoutSec $TimeoutSeconds -UseBasicParsing
        if ($response.StatusCode -ne 200) {
            throw "Unexpected HTTP status $($response.StatusCode)."
        }
    } catch {
        $message = "MedLine health check failed for ${Uri}: $($_.Exception.Message)"
        if (-not [string]::IsNullOrWhiteSpace($FailureLogPath)) {
            $parent = Split-Path -Parent $FailureLogPath
            if (-not [string]::IsNullOrWhiteSpace($parent) -and -not (Test-Path -LiteralPath $parent)) {
                New-Item -ItemType Directory -Path $parent -Force | Out-Null
            }
            Add-Content -LiteralPath $FailureLogPath -Value ("{0:u} {1}" -f (Get-Date), $message)
        }
        throw $message
    }
}

$base = $BaseUri.AbsoluteUri.TrimEnd('/')
Test-MedLineEndpoint -Uri ([uri]"$base/api/v1/health")
Test-MedLineEndpoint -Uri ([uri]"$base/api/v1/health/ready")
Write-Output 'MedLine liveness and readiness checks passed. Response bodies were not logged.'
