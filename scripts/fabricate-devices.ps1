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
    [string]$Partitions
)

$ErrorActionPreference = 'Stop'
trap {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
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
        throw "$FailureMessage (código de salida $LASTEXITCODE)."
    }
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
            throw "Paso importación backend.csv falló (código de salida $importExitCode)."
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
            throw "Paso importación backend.csv: conteo inesperado (código de salida $importExitCode)."
        }
    } finally {
        & docker compose exec -T backend rm -f $containerCsv *> $null
    }

    # No se imprimen tokens; se guardan únicamente en el archivo local protegido.
    $tokenLines = [System.Collections.Generic.List[string]]::new()
    foreach ($row in $rows) {
        $tokenOutput = & docker compose exec -T backend node scripts/provision-device.js $row.device_id 2>&1
        $tokenExitCode = $LASTEXITCODE
        if ($tokenExitCode -ne 0) {
            throw "Paso generación de token: código de salida $tokenExitCode."
        }
        $tokenText = ($tokenOutput -join "`n")
        $tokenMatch = [regex]::Match($tokenText, 'Token de reclamo:\s*(\S+)')
        if (-not $tokenMatch.Success) {
            throw "Paso generación de token: formato inválido (código de salida $tokenExitCode)."
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
} catch {
    if (Test-Path -LiteralPath $tokenFile) {
        Remove-Item -LiteralPath $tokenFile -Force -ErrorAction SilentlyContinue
    }
    throw
}

Write-Output "Fabricación completada: $Count dispositivo(s)."
Write-Output "Tokens guardados fuera del repositorio con ACL restringido."
