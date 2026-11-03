[CmdletBinding()]
param(
    [string]$SnapshotDir = (Join-Path $env:TEMP "ecotrack-mqtt-static-snapshot")
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$files = @(
    "mosquitto\config\mosquitto.conf",
    "mosquitto\config\acl.conf",
    "mosquitto\config\passwd",
    "docker-compose.yml"
)

New-Item -ItemType Directory -Force -Path $SnapshotDir | Out-Null
foreach ($relativePath in $files) {
    $source = Join-Path $repoRoot $relativePath
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
        throw "Snapshot source does not exist: $source"
    }

    $destination = Join-Path $SnapshotDir $relativePath
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
    Copy-Item -LiteralPath $source -Destination $destination -Force
}

Get-FileHash -LiteralPath (Join-Path $SnapshotDir "mosquitto\config\mosquitto.conf"),
    (Join-Path $SnapshotDir "mosquitto\config\acl.conf"),
    (Join-Path $SnapshotDir "mosquitto\config\passwd"),
    (Join-Path $SnapshotDir "docker-compose.yml") |
    Select-Object Algorithm, Hash, Path

Write-Output "Snapshot created at $SnapshotDir"
