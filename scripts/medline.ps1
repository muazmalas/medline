$ErrorActionPreference = 'Stop'
$scriptArguments = @($args)

$options = @{
    Help           = $false
    ForceInstall   = $false
    FreshSeed      = $false
    InstallOnly    = $false
    SkipMobile     = $false
    SelectPorts    = $false
    ApiPort        = 8000
    ReverbPort     = 8090
    WebPort        = 3001
    MobileDevice   = ''
    MobileApiUrl   = ''
}

function Show-Help {
    @'
MedLine local setup and runtime launcher

USAGE
  .\scripts\medline.ps1 [options]

BEHAVIOR
  With no options, the script checks the environment, dependencies, and
  database migrations. It runs the safe first-time setup only when something
  is missing, then starts MySQL, Laravel, Reverb, the queue worker, scheduler,
  React/Vite, and Flutter in separate PowerShell windows.

OPTIONS
  --help, -h                    Show this help.
  --force-install              Rerun safe dependency setup and migrations.
                               Existing application data is preserved.
  --fresh-seed                 DESTRUCTIVE: rebuild and seed the database.
                               This also implies --force-install.
  --install-only               Run setup without starting services.
  --skip-mobile                Do not validate or launch Flutter.
  --select-ports               Interactively select API, Reverb, and web ports.
  --api-port PORT              Laravel HTTP port. Default: 8000.
  --reverb-port PORT           Reverb WebSocket port. Default: 8090.
  --web-port PORT              React/Vite port. Default: 3001.
  --mobile-device DEVICE_ID    Flutter Android device ID to launch.
  --mobile-api-url URL         Override the API URL passed to Flutter. By
                               default the launcher uses 10.0.2.2 for an
                               emulator and this computer's LAN IP for a
                               physical Android device.

EXAMPLES
  # Normal daily startup; initialization is automatic only if required.
  .\scripts\medline.ps1

  # Explicitly rerun dependency installation and pending migrations.
  .\scripts\medline.ps1 --force-install

  # First-time reset with the complete theater dataset. Deletes existing data.
  .\scripts\medline.ps1 --force-install --fresh-seed

  # Prepare the project without launching runtime windows.
  .\scripts\medline.ps1 --force-install --install-only

  # Start backend and web only.
  .\scripts\medline.ps1 --skip-mobile

  # Prompt for all runtime ports before startup.
  .\scripts\medline.ps1 --select-ports

  # Select ports non-interactively.
  .\scripts\medline.ps1 --api-port 8100 --reverb-port 8190 --web-port 3100

  # Launch a particular running Android emulator or attached device.
  .\scripts\medline.ps1 --mobile-device emulator-5554

NOTES
  - Run PowerShell as Administrator only when the MySQL80 service needs to be
    started and your account cannot start Windows services normally.
  - Port 8080 is occupied by a Windows service on this workstation, so Reverb
    defaults to port 8090.
  - The script can locate Flutter at C:\src\flutter even when Flutter is not on
    PATH. An Android emulator/device must still be running for mobile startup.
'@ | Write-Host
}

function Read-NextArgument {
    param(
        [string] $OptionName,
        [int] $CurrentIndex
    )

    if ($CurrentIndex + 1 -ge $scriptArguments.Count) {
        throw "Missing value after $OptionName. Run .\scripts\medline.ps1 --help for usage."
    }

    return [string] $scriptArguments[$CurrentIndex + 1]
}

for ($index = 0; $index -lt $scriptArguments.Count; $index++) {
    $token = ([string] $scriptArguments[$index]).ToLowerInvariant()
    switch ($token) {
        '--help' { $options.Help = $true }
        '-help' { $options.Help = $true }
        '-h' { $options.Help = $true }
        '--force-install' { $options.ForceInstall = $true }
        '-forceinstall' { $options.ForceInstall = $true }
        '--fresh-seed' { $options.FreshSeed = $true; $options.ForceInstall = $true }
        '-freshseed' { $options.FreshSeed = $true; $options.ForceInstall = $true }
        '--install-only' { $options.InstallOnly = $true }
        '-installonly' { $options.InstallOnly = $true }
        '--skip-mobile' { $options.SkipMobile = $true }
        '-skipmobile' { $options.SkipMobile = $true }
        '--select-ports' { $options.SelectPorts = $true }
        '-selectports' { $options.SelectPorts = $true }
        '--api-port' {
            $options.ApiPort = [int] (Read-NextArgument '--api-port' $index)
            $index++
        }
        '--reverb-port' {
            $options.ReverbPort = [int] (Read-NextArgument '--reverb-port' $index)
            $index++
        }
        '--web-port' {
            $options.WebPort = [int] (Read-NextArgument '--web-port' $index)
            $index++
        }
        '--mobile-device' {
            $options.MobileDevice = Read-NextArgument '--mobile-device' $index
            $index++
        }
        '--mobile-api-url' {
            $options.MobileApiUrl = Read-NextArgument '--mobile-api-url' $index
            $index++
        }
        default {
            throw "Unknown option '$($scriptArguments[$index])'. Run .\scripts\medline.ps1 --help for usage."
        }
    }
}

if ($options.Help) {
    Show-Help
    exit 0
}

function Read-SelectedPort {
    param(
        [string] $ServiceName,
        [int] $CurrentPort
    )

    $answer = Read-Host "$ServiceName port [$CurrentPort]"
    if ([string]::IsNullOrWhiteSpace($answer)) {
        return $CurrentPort
    }

    $selectedPort = 0
    if (-not [int]::TryParse($answer.Trim(), [ref] $selectedPort)) {
        throw "$ServiceName port must be a whole number."
    }

    return $selectedPort
}

if ($options.SelectPorts) {
    Write-Host 'Select MedLine runtime ports. Press Enter to keep the displayed value.' -ForegroundColor Cyan
    $options.ApiPort = Read-SelectedPort 'Laravel API' $options.ApiPort
    $options.ReverbPort = Read-SelectedPort 'Reverb WebSocket' $options.ReverbPort
    $options.WebPort = Read-SelectedPort 'React/Vite web' $options.WebPort
}

foreach ($portName in @('ApiPort', 'ReverbPort', 'WebPort')) {
    $port = [int] $options[$portName]
    if ($port -lt 1 -or $port -gt 65535) {
        throw "$portName must be between 1 and 65535."
    }
}

if (($options.ApiPort -eq $options.ReverbPort) -or
    ($options.ApiPort -eq $options.WebPort) -or
    ($options.ReverbPort -eq $options.WebPort)) {
    throw 'The API, Reverb, and web ports must be different.'
}

if ($options.MobileDevice -and $options.MobileDevice -notmatch '^[A-Za-z0-9._:-]+$') {
    throw 'The mobile device ID contains unsupported characters.'
}

$mobileApiUrlWasProvided = -not [string]::IsNullOrWhiteSpace($options.MobileApiUrl)
if (-not $mobileApiUrlWasProvided) {
    $options.MobileApiUrl = "http://10.0.2.2:$($options.ApiPort)/api/v1"
}

$mobileUri = $null
if (-not [Uri]::TryCreate($options.MobileApiUrl, [UriKind]::Absolute, [ref] $mobileUri) -or
    $mobileUri.Scheme -notin @('http', 'https')) {
    throw '--mobile-api-url must be an absolute HTTP or HTTPS URL.'
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$apiRoot = Join-Path $repoRoot 'api'
$webRoot = Join-Path $repoRoot 'web'
$mobileRoot = Join-Path $repoRoot 'mobile'

function Write-Section {
    param([string] $Message)
    Write-Host "`n== $Message ==" -ForegroundColor Cyan
}

function Write-Info {
    param([string] $Message)
    Write-Host "[MedLine] $Message" -ForegroundColor Gray
}

function Write-Success {
    param([string] $Message)
    Write-Host "[MedLine] $Message" -ForegroundColor Green
}

function Resolve-Tool {
    param(
        [string[]] $Names,
        [string[]] $FallbackPaths = @()
    )

    foreach ($name in $Names) {
        $command = Get-Command $name -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($command) {
            if ($command.Source) {
                return $command.Source
            }
            return $command.Path
        }
    }

    foreach ($path in $FallbackPaths) {
        if ($path -and (Test-Path -LiteralPath $path)) {
            return (Resolve-Path -LiteralPath $path).Path
        }
    }

    return $null
}

function Invoke-Checked {
    param(
        [string] $Label,
        [string] $WorkingDirectory,
        [string] $FilePath,
        [string[]] $Arguments = @()
    )

    Write-Info $Label
    Push-Location $WorkingDirectory
    try {
        & $FilePath @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "$Label failed with exit code $LASTEXITCODE."
        }
    } finally {
        Pop-Location
    }
}

function Get-DotEnvValue {
    param(
        [string] $Path,
        [string] $Name,
        [string] $Default = ''
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return $Default
    }

    $line = Get-Content -LiteralPath $Path | Where-Object { $_ -match "^$([Regex]::Escape($Name))=" } | Select-Object -First 1
    if (-not $line) {
        return $Default
    }

    $value = ([string] $line).Substring($Name.Length + 1).Trim()
    if ($value.Length -ge 2 -and
        (($value.StartsWith('"') -and $value.EndsWith('"')) -or
         ($value.StartsWith("'") -and $value.EndsWith("'")))) {
        $value = $value.Substring(1, $value.Length - 2)
    }

    return $value
}

function Ensure-MySqlService {
    $service = Get-Service -Name 'MySQL80' -ErrorAction SilentlyContinue
    if (-not $service) {
        Write-Warning 'The MySQL80 Windows service was not found. The configured MySQL server must already be reachable.'
        return
    }

    if ($service.Status -eq 'Running') {
        Write-Info 'MySQL80 is already running.'
        return
    }

    Write-Info 'Starting MySQL80...'
    try {
        Start-Service -Name 'MySQL80'
        (Get-Service -Name 'MySQL80').WaitForStatus('Running', [TimeSpan]::FromSeconds(20))
        Write-Success 'MySQL80 started.'
    } catch {
        throw "Unable to start MySQL80. Open PowerShell as Administrator and retry. $($_.Exception.Message)"
    }
}

function Ensure-MySqlDatabase {
    $envPath = Join-Path $apiRoot '.env'
    $connection = Get-DotEnvValue $envPath 'DB_CONNECTION' 'mysql'
    if ($connection -ne 'mysql') {
        Write-Info "Skipping database creation because DB_CONNECTION is '$connection'."
        return
    }

    $database = Get-DotEnvValue $envPath 'DB_DATABASE' 'medline'
    if ($database -notmatch '^[A-Za-z0-9_]+$') {
        throw 'DB_DATABASE may contain only letters, numbers, and underscores for automatic setup.'
    }

    $mysqlPath = Resolve-Tool @('mysql.exe', 'mysql') @(
        'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe',
        'C:\Program Files\MySQL\MySQL Workbench 8.0 CE\mysql.exe'
    )
    if (-not $mysqlPath) {
        Write-Warning "MySQL CLI was not found. Database '$database' must already exist before migrations run."
        return
    }

    $hostName = Get-DotEnvValue $envPath 'DB_HOST' '127.0.0.1'
    $port = Get-DotEnvValue $envPath 'DB_PORT' '3306'
    $username = Get-DotEnvValue $envPath 'DB_USERNAME' 'root'
    $password = Get-DotEnvValue $envPath 'DB_PASSWORD' ''
    $previousPassword = [Environment]::GetEnvironmentVariable('MYSQL_PWD', 'Process')
    [Environment]::SetEnvironmentVariable('MYSQL_PWD', $password, 'Process')

    try {
        Invoke-Checked "Ensuring MySQL database '$database' exists..." $apiRoot $mysqlPath @(
            '--protocol=tcp',
            "--host=$hostName",
            "--port=$port",
            "--user=$username",
            '--default-character-set=utf8mb4',
            "--execute=CREATE DATABASE IF NOT EXISTS ``$database`` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
        )
    } finally {
        [Environment]::SetEnvironmentVariable('MYSQL_PWD', $previousPassword, 'Process')
    }
}

function Get-InstallationReasons {
    param([string] $PhpPath)

    $reasons = [System.Collections.Generic.List[string]]::new()
    $apiEnv = Join-Path $apiRoot '.env'
    if (-not (Test-Path -LiteralPath $apiEnv)) {
        [void] $reasons.Add('api/.env is missing')
    }
    if (-not (Test-Path -LiteralPath (Join-Path $apiRoot 'vendor\autoload.php'))) {
        [void] $reasons.Add('Laravel Composer dependencies are missing')
    }
    if (-not (Test-Path -LiteralPath (Join-Path $webRoot '.env'))) {
        [void] $reasons.Add('web/.env is missing')
    }
    if (-not (Test-Path -LiteralPath (Join-Path $webRoot 'node_modules'))) {
        [void] $reasons.Add('React npm dependencies are missing')
    }
    if (-not $options.SkipMobile -and
        -not (Test-Path -LiteralPath (Join-Path $mobileRoot '.dart_tool\package_config.json'))) {
        [void] $reasons.Add('Flutter packages are missing')
    }
    if ((Test-Path -LiteralPath $apiEnv) -and -not (Get-DotEnvValue $apiEnv 'APP_KEY' '')) {
        [void] $reasons.Add('Laravel APP_KEY is missing')
    }

    if ($reasons.Count -eq 0) {
        Push-Location $apiRoot
        try {
            $migrationStatus = (& $PhpPath artisan migrate:status --no-ansi 2>&1 | Out-String)
            if ($LASTEXITCODE -ne 0) {
                [void] $reasons.Add('database migrations could not be verified')
            } elseif ($migrationStatus -match '(?m)\bPending\b') {
                [void] $reasons.Add('database migrations are pending')
            }
        } finally {
            Pop-Location
        }
    }

    return $reasons.ToArray()
}

function Initialize-MedLine {
    param(
        [string] $PhpPath,
        [string] $ComposerPath,
        [string] $NpmPath,
        [string] $FlutterPath
    )

    Write-Section 'First-time/safe installation'

    $apiEnv = Join-Path $apiRoot '.env'
    if (-not (Test-Path -LiteralPath $apiEnv)) {
        Copy-Item -LiteralPath (Join-Path $apiRoot '.env.example') -Destination $apiEnv
        Write-Success 'Created api/.env from api/.env.example.'
    }
    $webEnv = Join-Path $webRoot '.env'
    if (-not (Test-Path -LiteralPath $webEnv)) {
        Copy-Item -LiteralPath (Join-Path $webRoot '.env.example') -Destination $webEnv
        Write-Success 'Created web/.env from web/.env.example.'
    }

    if ($options.ForceInstall -or -not (Test-Path -LiteralPath (Join-Path $apiRoot 'vendor\autoload.php'))) {
        Invoke-Checked 'Installing Laravel Composer dependencies...' $apiRoot $ComposerPath @('install')
    }

    if (-not (Get-DotEnvValue $apiEnv 'APP_KEY' '')) {
        Invoke-Checked 'Generating Laravel application key...' $apiRoot $PhpPath @('artisan', 'key:generate', '--force')
    } else {
        Write-Info 'Existing Laravel APP_KEY preserved.'
    }

    Invoke-Checked 'Clearing cached Laravel configuration...' $apiRoot $PhpPath @('artisan', 'config:clear')
    Ensure-MySqlDatabase

    if ($options.FreshSeed) {
        Write-Warning 'Fresh seed requested: all existing application tables/data will be rebuilt.'
        Invoke-Checked 'Rebuilding migrations and loading theater seed data...' $apiRoot $PhpPath @('artisan', 'migrate:fresh', '--seed', '--force')
    } else {
        Invoke-Checked 'Applying pending database migrations...' $apiRoot $PhpPath @('artisan', 'migrate', '--force')
    }

    Invoke-Checked 'Backfilling authoritative road routes and delivery fees...' $apiRoot $PhpPath @('artisan', 'medline:routes:backfill')

    if ($options.ForceInstall -or -not (Test-Path -LiteralPath (Join-Path $webRoot 'node_modules'))) {
        Invoke-Checked 'Installing React npm dependencies...' $webRoot $NpmPath @('install')
    }

    if (-not $options.SkipMobile) {
        if ($options.ForceInstall -or -not (Test-Path -LiteralPath (Join-Path $mobileRoot '.dart_tool\package_config.json'))) {
            Invoke-Checked 'Installing Flutter packages...' $mobileRoot $FlutterPath @('pub', 'get')
        }
        Write-Info 'Checking Flutter and Android toolchains...'
        Push-Location $mobileRoot
        try {
            & $FlutterPath doctor
            if ($LASTEXITCODE -ne 0) {
                Write-Warning 'Flutter doctor reported an incomplete toolchain. Review the output before mobile startup.'
            }
        } finally {
            Pop-Location
        }
    }

    Write-Success 'Initialization completed without replacing existing application data.'
}

function Quote-PowerShellLiteral {
    param([string] $Value)
    return "'" + $Value.Replace("'", "''") + "'"
}

function Start-MedLineTerminal {
    param(
        [string] $Name,
        [string] $WorkingDirectory,
        [string] $Command
    )

    $title = Quote-PowerShellLiteral "MedLine - $Name"
    $directory = Quote-PowerShellLiteral $WorkingDirectory
    $scriptBlock = "`$Host.UI.RawUI.WindowTitle = $title; Set-Location -LiteralPath $directory; $Command"
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($scriptBlock))
    Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoLogo', '-NoExit', '-NoProfile', '-EncodedCommand', $encoded) | Out-Null
    Write-Success "$Name terminal started."
}

function Get-PortListener {
    param([int] $Port)
    return Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
}

function Get-ListenerDescription {
    param($Listener)
    if (-not $Listener) {
        return ''
    }
    $process = Get-Process -Id $Listener.OwningProcess -ErrorAction SilentlyContinue
    if ($process) {
        return "$($process.ProcessName) (PID $($Listener.OwningProcess))"
    }
    return "PID $($Listener.OwningProcess)"
}

function Test-CommandLineProcess {
    param([string] $Pattern)
    return [bool] (Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -and $_.CommandLine -match $Pattern } |
        Select-Object -First 1)
}

function Get-AndroidDeviceId {
    param([string] $FlutterPath)

    if ($options.MobileDevice) {
        return $options.MobileDevice
    }

    Push-Location $mobileRoot
    try {
        $json = (& $FlutterPath devices --machine 2>$null | Out-String)
        if ($LASTEXITCODE -ne 0 -or -not $json.Trim()) {
            return $null
        }
        $devices = $json | ConvertFrom-Json
        $android = $devices | Where-Object { $_.targetPlatform -like 'android-*' -and $_.isSupported } | Select-Object -First 1
        if ($android) {
            return [string] $android.id
        }
    } catch {
        Write-Warning "Unable to inspect Flutter devices: $($_.Exception.Message)"
    } finally {
        Pop-Location
    }

    return $null
}

function Get-LanIPv4Address {
    $configurations = Get-NetIPConfiguration -ErrorAction SilentlyContinue |
        Where-Object {
            $_.NetAdapter.Status -eq 'Up' -and
            $_.IPv4DefaultGateway -and
            $_.IPv4Address
        } |
        Sort-Object { $_.NetIPv4Interface.InterfaceMetric }

    foreach ($configuration in $configurations) {
        foreach ($address in @($configuration.IPv4Address)) {
            $value = [string] $address.IPAddress
            if ($value -and $value -notlike '127.*' -and $value -notlike '169.254.*') {
                return $value
            }
        }
    }

    return $null
}

function Start-MedLineRuntime {
    param(
        [string] $PhpPath,
        [string] $NpmPath,
        [string] $FlutterPath
    )

    Write-Section 'Runtime services'
    Invoke-Checked 'Clearing cached Laravel configuration for local runtime ports...' $apiRoot $PhpPath @('artisan', 'config:clear')

    $php = Quote-PowerShellLiteral $PhpPath
    $npm = Quote-PowerShellLiteral $NpmPath
    $apiEnvironment = "`$env:APP_URL = 'http://127.0.0.1:$($options.ApiPort)'; `$env:REVERB_HOST = '127.0.0.1'; `$env:REVERB_PORT = '$($options.ReverbPort)'; `$env:REVERB_SCHEME = 'http'; `$env:REVERB_SERVER_HOST = '127.0.0.1'; `$env:REVERB_SERVER_PORT = '$($options.ReverbPort)'; `$env:MEDLINE_WEB_URL = 'http://127.0.0.1:$($options.WebPort)';"

    $apiListener = Get-PortListener $options.ApiPort
    $startApi = $true
    if ($apiListener) {
        try {
            $health = Invoke-RestMethod -Uri "http://127.0.0.1:$($options.ApiPort)/api/v1/health" -TimeoutSec 2
            if ($apiListener.LocalAddress -in @('0.0.0.0', '::')) {
                Write-Info "Laravel API is already listening on all interfaces at port $($options.ApiPort)."
                $startApi = $false
            } else {
                Write-Warning "Restarting the MedLine API because it is only listening on $($apiListener.LocalAddress):$($options.ApiPort)."
                Stop-Process -Id $apiListener.OwningProcess -Force
                for ($attempt = 0; $attempt -lt 20 -and (Get-PortListener $options.ApiPort); $attempt++) {
                    Start-Sleep -Milliseconds 100
                }
                if (Get-PortListener $options.ApiPort) {
                    throw "The old API process did not release port $($options.ApiPort)."
                }
            }
        } catch {
            if (Get-PortListener $options.ApiPort) {
                throw "API port $($options.ApiPort) is occupied by $(Get-ListenerDescription $apiListener), but it is not a reachable MedLine API."
            }
        }
    }
    if ($startApi) {
        Start-MedLineTerminal 'API' $apiRoot "$apiEnvironment & $php artisan serve --host=0.0.0.0 --port=$($options.ApiPort)"
    }

    $reverbListener = Get-PortListener $options.ReverbPort
    if ($reverbListener) {
        $owner = Get-ListenerDescription $reverbListener
        if ($options.ReverbPort -eq 8080 -and $owner -match 'svchost') {
            throw 'Reverb port 8080 is held by Windows. Use --reverb-port 8090.'
        }
        Write-Warning "Reverb port $($options.ReverbPort) is already listening via $owner; a second Reverb process was not started."
    } else {
        Start-MedLineTerminal 'Reverb' $apiRoot "$apiEnvironment & $php artisan reverb:start --host=127.0.0.1 --port=$($options.ReverbPort)"
    }

    if (Test-CommandLineProcess 'artisan\s+queue:(work|listen)') {
        Write-Info 'A Laravel queue worker is already running.'
    } else {
        Start-MedLineTerminal 'Queue' $apiRoot "$apiEnvironment & $php artisan queue:work --tries=3 --backoff=5"
    }

    if (Test-CommandLineProcess 'artisan\s+schedule:work') {
        Write-Info 'The Laravel scheduler is already running.'
    } else {
        Start-MedLineTerminal 'Scheduler' $apiRoot "$apiEnvironment & $php artisan schedule:work"
    }

    $webListener = Get-PortListener $options.WebPort
    if ($webListener) {
        Write-Warning "Web port $($options.WebPort) is already listening via $(Get-ListenerDescription $webListener); a second Vite process was not started."
    } else {
        $webApiUrl = "http://127.0.0.1:$($options.ApiPort)/api/v1"
        $webEnvironment = "`$env:VITE_API_URL = '$webApiUrl'; `$env:VITE_REVERB_APP_KEY = 'medline-local-key'; `$env:VITE_REVERB_HOST = '127.0.0.1'; `$env:VITE_REVERB_PORT = '$($options.ReverbPort)'; `$env:VITE_REVERB_SCHEME = 'http';"
        Start-MedLineTerminal 'Web' $webRoot "$webEnvironment & $npm run dev -- --host 127.0.0.1 --port $($options.WebPort)"
    }

    if (-not $options.SkipMobile) {
        if (Test-CommandLineProcess 'flutter_tools\.snapshot.+\srun(\s|$)') {
            Write-Info 'A Flutter run process is already active.'
        } else {
            $deviceId = Get-AndroidDeviceId $FlutterPath
            if (-not $deviceId) {
                Write-Warning 'Mobile was not started because no supported Android device or emulator is connected.'
                Write-Host '  Create/start an Android emulator, then run:' -ForegroundColor Yellow
                Write-Host '  .\scripts\medline.ps1 --mobile-device YOUR_DEVICE_ID' -ForegroundColor Yellow
            } else {
                $effectiveMobileApiUrl = $options.MobileApiUrl
                $isAndroidEmulator = $deviceId -match '^emulator-'
                if (-not $mobileApiUrlWasProvided -and -not $isAndroidEmulator) {
                    $lanAddress = Get-LanIPv4Address
                    if (-not $lanAddress) {
                        throw 'A LAN IPv4 address could not be detected for the connected physical phone. Use --mobile-api-url http://YOUR_PC_IP:API_PORT/api/v1.'
                    }
                    $effectiveMobileApiUrl = "http://${lanAddress}:$($options.ApiPort)/api/v1"
                    Write-Info "Physical Android device detected; using $effectiveMobileApiUrl."
                }

                $flutter = Quote-PowerShellLiteral $FlutterPath
                $quotedDevice = Quote-PowerShellLiteral $deviceId
                $quotedApiUrl = Quote-PowerShellLiteral $effectiveMobileApiUrl
                Start-MedLineTerminal 'Mobile' $mobileRoot "& $flutter run -d $quotedDevice --flavor development --dart-define=MEDLINE_API_URL=$quotedApiUrl"
            }
        }
    } else {
        Write-Info 'Flutter startup skipped by --skip-mobile.'
    }

    Write-Host "`nMedLine runtime launch complete:" -ForegroundColor Green
    Write-Host "  API:     http://127.0.0.1:$($options.ApiPort)/api/v1"
    Write-Host "  Reverb:  ws://127.0.0.1:$($options.ReverbPort)"
    Write-Host "  Web:     http://127.0.0.1:$($options.WebPort)"
}

Write-Section 'Prerequisites'
$phpPath = Resolve-Tool @('php.exe', 'php')
$npmPath = Resolve-Tool @('npm.cmd', 'npm')
$composerPath = Resolve-Tool @('composer.bat', 'composer.cmd', 'composer')
$flutterPath = $null
if (-not $options.SkipMobile) {
    $flutterPath = Resolve-Tool @('flutter.bat', 'flutter') @(
        'C:\src\flutter\bin\flutter.bat',
        (Join-Path $repoRoot 'flutter_sdk\flutter\bin\flutter.bat'),
        (Join-Path $repoRoot 'flutter_sdk\bin\flutter.bat')
    )
}

if (-not $phpPath) {
    throw 'PHP was not found on PATH.'
}
if (-not $npmPath) {
    throw 'npm was not found on PATH. Install Node.js and reopen PowerShell.'
}
if (-not $options.SkipMobile -and -not $flutterPath) {
    throw 'Flutter was not found on PATH or at C:\src\flutter\bin\flutter.bat.'
}

Write-Success "PHP: $phpPath"
Write-Success "npm: $npmPath"
if ($flutterPath) {
    Write-Success "Flutter: $flutterPath"
}

Ensure-MySqlService
$installationReasons = Get-InstallationReasons $phpPath
$shouldInstall = $options.ForceInstall -or $installationReasons.Count -gt 0

if ($shouldInstall) {
    if ($installationReasons.Count -gt 0) {
        Write-Info ('Initialization required: ' + ($installationReasons -join '; ') + '.')
    } else {
        Write-Info 'Initialization forced by --force-install.'
    }
    if (-not $composerPath) {
        throw 'Composer was not found on PATH and is required for initialization.'
    }
    Initialize-MedLine $phpPath $composerPath $npmPath $flutterPath
} else {
    Write-Success 'Existing installation detected; setup was skipped.'
}

if ($options.InstallOnly) {
    Write-Success 'Install-only mode complete. Runtime services were not started.'
    exit 0
}

Start-MedLineRuntime $phpPath $npmPath $flutterPath
