[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateRange(1, 1000)]
    [int]$Count,
    [Parameter(Mandatory = $true)]
    [string]$ServerHost,
    [Parameter(Mandatory = $true)]
    [string]$Output,
    [Parameter(Mandatory = $false)]
    [string]$Firmware,
    [Parameter(Mandatory = $false)]
    [string]$Partitions,
    [Parameter(Mandatory = $false)]
    [string]$Nvs,
    [Parameter(Mandatory = $false)]
    [string]$Port,
    [Parameter(Mandatory = $false)]
    [string]$Esptool,
    [Parameter(Mandatory = $false)]
    [switch]$VerifyEnrollment,
    [Parameter(Mandatory = $false)]
    [ValidateRange(1, 86400)]
    [int]$WaitSeconds = 60,
    [Parameter(Mandatory = $false)]
    [ValidateRange(1, 3600)]
    [int]$PollSeconds = 5
)

$ErrorActionPreference = 'Stop'
$script:FailureExitCode = 1
trap {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit $script:FailureExitCode
}
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$outputPath = [System.IO.Path]::GetFullPath($Output)

function Test-OutsideRepository {
    param([string]$Candidate)
    $repoPrefix = $repositoryRoot.TrimEnd('\') + '\'
    return -not (
        $Candidate.Equals($repositoryRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
        $Candidate.StartsWith($repoPrefix, [System.StringComparison]::OrdinalIgnoreCase)
    )
}

function Invoke-External {
    param(
        [string]$FilePath,
        [string[]]$Arguments,
        [string]$FailureMessage
    )
    & $FilePath @Arguments *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "$FailureMessage (codigo de salida $LASTEXITCODE)."
    }
}

function Resolve-Esptool {
    param([string]$Override)
    if ($Override) {
        if (-not (Test-Path -LiteralPath $Override -PathType Leaf)) {
            throw 'Paso flasheo: falta esptool.'
        }
        return (Resolve-Path -LiteralPath $Override).Path
    }
    $root = Join-Path $env:LOCALAPPDATA 'Arduino15\packages\esp32\tools\esptool_py'
    if (-not (Test-Path -LiteralPath $root -PathType Container)) {
        throw 'Paso flasheo: falta esptool.'
    }
    $candidate = Get-ChildItem -LiteralPath $root -Directory |
        Sort-Object LastWriteTime -Descending |
        ForEach-Object { Join-Path $_.FullName 'esptool.exe' } |
        Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
        Select-Object -First 1
    if (-not $candidate) {
        throw 'Paso flasheo: falta esptool.'
    }
    return $candidate
}

function Resolve-SerialPort {
    param([string]$ExplicitPort)
    if ($ExplicitPort) {
        return $ExplicitPort
    }
    $ports = @(Get-CimInstance Win32_SerialPort)
    if ($ports.Count -eq 0) {
        throw 'Paso flasheo: falta puerto serie.'
    }
    if ($ports.Count -gt 1) {
        throw 'Paso flasheo: hay multiple puertos; indique -Port.'
    }
    return $ports[0].DeviceID
}

function Invoke-FlashWrite {
    param(
        [string]$Tool,
        [string]$SerialPort,
        [string]$Address,
        [string]$Image,
        [string]$StepName
    )
    $toolOutput = @(& $Tool --port $SerialPort write-flash $Address $Image 2>&1)
    if ($LASTEXITCODE -ne 0) {
        $safeTail = @(
            $toolOutput |
                ForEach-Object { "$_" -replace '(?i)((?:token(?: de reclamo)?|pin|secret|password)\s*[:=]\s*)\S+', '$1[REDACTED]' } |
                Select-Object -Last 8
        ) -join "`n"
        if ($safeTail) {
            throw "Paso ${StepName}: codigo de salida $LASTEXITCODE. Ultimas lineas de esptool:`n$safeTail"
        }
        throw "Paso ${StepName}: codigo de salida $LASTEXITCODE."
    }
}

function Get-EnrollmentState {
    param([string]$DeviceId)
    $query = "const pool=require('./src/config/db'); pool.query('SELECT enrolled_at FROM dispositivos_fabrica WHERE device_id = `$1',[process.argv[1]]).then(r=>{console.log(r.rows[0]&&r.rows[0].enrolled_at?'enrolado':'pendiente');}).finally(()=>pool.end());"
    $output = & docker compose exec -T backend node -e $query $DeviceId 2>$null
    if ($LASTEXITCODE -ne 0) {
        return 'error'
    }
    $state = ($output -join "`n")
    if ($state -match '(?im)^\s*enrolado\s*$') {
        return 'enrolado'
    }
    if ($state -match '(?im)^\s*pendiente\s*$') {
        return 'pendiente'
    }
    return 'error'
}

if (-not (Test-OutsideRepository $outputPath)) {
    throw 'La carpeta de salida debe estar fuera del repositorio.'
}
if (Test-Path -LiteralPath $outputPath) {
    if (-not (Get-Item -LiteralPath $outputPath).PSIsContainer) {
        throw 'La salida debe ser una carpeta.'
    }
    if (@(Get-ChildItem -LiteralPath $outputPath -Force).Count -ne 0) {
        throw 'La carpeta de salida debe estar vacia.'
    }
} else {
    New-Item -ItemType Directory -Path $outputPath -Force | Out-Null
}

if ($Firmware -and -not (Test-Path -LiteralPath $Firmware -PathType Leaf)) {
    throw 'El firmware indicado no existe.'
}
if ($Partitions -and -not (Test-Path -LiteralPath $Partitions -PathType Leaf)) {
    throw 'La tabla de particiones indicada no existe.'
}
$flashRequested = $Firmware -or $Partitions -or $Nvs -or $Port -or $Esptool -or $VerifyEnrollment
if ($flashRequested) {
    if (-not $Firmware) { throw 'Paso flasheo: falta -Firmware.' }
    if (-not $Partitions) { throw 'Paso flasheo: falta -Partitions.' }
    if (-not $Nvs -and $Count -ne 1) {
        throw 'Paso flasheo: falta -Nvs para un lote de varios dispositivos.'
    }
    $esptoolPath = Resolve-Esptool -Override $Esptool
    $serialPort = Resolve-SerialPort -ExplicitPort $Port
}

$factoryScript = Join-Path $repositoryRoot 'scripts\provision_factory.py'
$backendCsv = Join-Path $outputPath 'backend.csv'
$factoryManifest = Join-Path $outputPath 'factory.csv'
$tokenFile = Join-Path $outputPath 'claim-tokens.txt'
$containerCsv = '/tmp/backend.csv'

try {
    Invoke-External `
        -FilePath 'python' `
        -Arguments @(
            $factoryScript,
            '--count', "$Count",
            '--output', $outputPath,
            '--server-host', $ServerHost,
            '--nvs-size', '0x5000',
            '--export-backend'
        ) `
        -FailureMessage 'No se pudo generar la identidad de fabrica.'

    if (-not (Test-Path -LiteralPath $factoryManifest -PathType Leaf) -or
        -not (Test-Path -LiteralPath $backendCsv -PathType Leaf)) {
        throw 'La fabricacion no genero los manifiestos esperados.'
    }

    $rows = @(Import-Csv -LiteralPath $factoryManifest)
    if ($rows.Count -ne $Count) {
        throw 'La cantidad de dispositivos generados no coincide con la solicitada.'
    }

    Invoke-External `
        -FilePath 'docker' `
        -Arguments @('cp', $backendCsv, "ecotrack_backend:$containerCsv") `
        -FailureMessage 'No se pudo copiar backend.csv al contenedor backend.'
    try {
        $importOutput = & docker compose exec -T backend node scripts/import-factory-devices.js $containerCsv 2>&1
        $importExitCode = $LASTEXITCODE
        if ($importExitCode -ne 0) {
            throw "Paso importacion backend.csv fallo (codigo de salida $importExitCode)."
        }
        $importText = ($importOutput -join "`n")
        $match = [regex]::Match(
            $importText,
            '^Dispositivos de f\S+brica:\s*(\d+)\s+insertados,\s*(\d+)\s+omitidos',
            [System.Text.RegularExpressions.RegexOptions]::Multiline
        )
        if (-not $match.Success -or
            [int]$match.Groups[1].Value -ne $Count -or
            [int]$match.Groups[2].Value -ne 0) {
            throw "Paso importacion backend.csv: conteo inesperado (codigo de salida $importExitCode)."
        }
    } finally {
        & docker compose exec -T backend rm -f $containerCsv *> $null
    }

    # No se imprimen tokens; se guardan solo en el archivo local protegido.
    $tokenLines = [System.Collections.Generic.List[string]]::new()
    foreach ($row in $rows) {
        $tokenOutput = & docker compose exec -T backend node scripts/provision-device.js $row.device_id 2>&1
        $tokenExitCode = $LASTEXITCODE
        if ($tokenExitCode -ne 0) {
            throw "Paso generacion de token: codigo de salida $tokenExitCode."
        }
        $tokenText = ($tokenOutput -join "`n")
        $tokenMatch = [regex]::Match($tokenText, 'Token de reclamo:\s*(\S+)')
        if (-not $tokenMatch.Success) {
            throw "Paso generacion de token: formato invalido (codigo de salida $tokenExitCode)."
        }
        $tokenLines.Add("$($row.device_id)=$($tokenMatch.Groups[1].Value)")
        $labelPath = Join-Path $outputPath "$($row.device_id).label.txt"
        Set-Content -LiteralPath $labelPath -Value @(
            "device_id=$($row.device_id)"
            "setup_pin=$($row.setup_pin)"
        ) -Encoding UTF8
    }

    Set-Content -LiteralPath $tokenFile -Value $tokenLines -Encoding UTF8
    $currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    & icacls $tokenFile /inheritance:r /grant:r "${currentUser}:(R,W)" *> $null
    if ($LASTEXITCODE -ne 0) {
        throw 'No se pudo restringir el archivo de tokens al usuario actual.'
    }
    $acl = & icacls $tokenFile
    if (($acl -join "`n") -notmatch [regex]::Escape($currentUser)) {
        throw 'No se pudo verificar el ACL del archivo de tokens.'
    }

    if ($flashRequested) {
        foreach ($row in $rows) {
            $nvsImage = if ($Nvs) { $Nvs } else { Join-Path $outputPath $row.nvs_image }
            if (-not (Test-Path -LiteralPath $nvsImage -PathType Leaf)) {
                throw 'Paso flasheo: falta NVS.'
            }
            Invoke-FlashWrite -Tool $esptoolPath -SerialPort $serialPort `
                -Address '0x8000' -Image $Partitions -StepName 'particiones'
            Invoke-FlashWrite -Tool $esptoolPath -SerialPort $serialPort `
                -Address '0x10000' -Image $Firmware -StepName 'firmware'
            Invoke-FlashWrite -Tool $esptoolPath -SerialPort $serialPort `
                -Address '0x9000' -Image $nvsImage -StepName 'NVS'
        }
    }

    if ($VerifyEnrollment) {
        $deadline = (Get-Date).AddSeconds($WaitSeconds)
        foreach ($row in $rows) {
            $state = 'pendiente'
            while ((Get-Date) -lt $deadline) {
                $state = Get-EnrollmentState -DeviceId $row.device_id
                if ($state -eq 'enrolado' -or $state -eq 'error') {
                    break
                }
                Start-Sleep -Seconds $PollSeconds
            }
            if ($state -eq 'error') {
                $script:FailureExitCode = 3
                throw 'Paso verificacion de enrolamiento: codigo de salida 1.'
            }
            if ($state -ne 'enrolado') {
                $script:FailureExitCode = 2
                throw 'Paso verificacion de enrolamiento: codigo de salida 2.'
            }
        }
    }
} catch {
    if (Test-Path -LiteralPath $tokenFile) {
        Remove-Item -LiteralPath $tokenFile -Force -ErrorAction SilentlyContinue
    }
    throw
}

Write-Output "Fabricacion completada: $Count dispositivo(s)."
Write-Output "Tokens guardados fuera del repositorio con ACL restringido."
