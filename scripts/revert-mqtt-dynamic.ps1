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

foreach ($relativePath in $files) {
    $source = Join-Path $SnapshotDir $relativePath
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
        throw "Rollback snapshot is incomplete: $source"
    }
}

& docker compose -f (Join-Path $repoRoot "docker-compose.yml") stop mosquitto
if ($LASTEXITCODE -ne 0) {
    throw "Could not stop the Mosquitto service."
}

foreach ($relativePath in $files) {
    $source = Join-Path $SnapshotDir $relativePath
    $destination = Join-Path $repoRoot $relativePath
    Copy-Item -LiteralPath $source -Destination $destination -Force
}

& docker compose -f (Join-Path $repoRoot "docker-compose.yml") up -d mosquitto
if ($LASTEXITCODE -ne 0) {
    throw "Could not restart the Mosquitto service after rollback."
}

Write-Output "Static Mosquitto configuration restored from $SnapshotDir"
