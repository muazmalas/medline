param(
    [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
    [string]$OutputPath = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = Join-Path $ProjectRoot 'release-manifest.json'
}

$relativeRoots = @(
    'api/app',
    'api/config',
    'api/database',
    'api/routes',
    'web/dist',
    'mobile/build/app/outputs/flutter-apk',
    'docs',
    'deploy/windows'
)

$files = [System.Collections.Generic.List[object]]::new()
$missingRoots = [System.Collections.Generic.List[string]]::new()
foreach ($relativeRoot in $relativeRoots) {
    $absoluteRoot = Join-Path $ProjectRoot $relativeRoot
    if (-not (Test-Path -LiteralPath $absoluteRoot -PathType Container)) {
        $missingRoots.Add($relativeRoot)
        continue
    }

    Get-ChildItem -LiteralPath $absoluteRoot -File -Recurse | Where-Object {
        $_.FullName -notmatch '[\\/]storage[\\/]' -and
        $_.Name -notmatch '^\.env(\..*)?$' -and
        $_.Extension -notin @('.log', '.sql', '.cms')
    } | ForEach-Object {
        $files.Add([ordered]@{
            path = ([IO.Path]::GetRelativePath($ProjectRoot, $_.FullName)).Replace('\', '/')
            sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
            bytes = $_.Length
        })
    }
}

$gitCommit = $null
try {
    $gitCommit = (& git -C $ProjectRoot rev-parse --verify HEAD 2>$null).Trim()
} catch {
    $gitCommit = $null
}

$manifest = [ordered]@{
    product = 'MedLine'
    generated_at_utc = (Get-Date).ToUniversalTime().ToString('o')
    git_commit = if ([string]::IsNullOrWhiteSpace($gitCommit)) { $null } else { $gitCommit }
    excluded = @('environment files', 'runtime storage', 'logs', 'SQL dumps', 'CMS backup files', 'dependency caches')
    missing_roots = @($missingRoots)
    files = @($files | Sort-Object path)
}

$outputParent = Split-Path -Parent $OutputPath
if (-not [string]::IsNullOrWhiteSpace($outputParent) -and -not (Test-Path -LiteralPath $outputParent)) {
    New-Item -ItemType Directory -Path $outputParent -Force | Out-Null
}
$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $OutputPath -Encoding UTF8
Write-Output "Release manifest written to $OutputPath. Secrets and runtime data were excluded."
