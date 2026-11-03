[CmdletBinding()]
param(
    [string]$EnvFile,
    [string]$Container = "ecotrack_mqtt"
)

$ErrorActionPreference = "Stop"
if ([string]::IsNullOrWhiteSpace($EnvFile)) {
    $EnvFile = Join-Path $PSScriptRoot "..\.env"
}

function Get-DotEnvValue {
    param(
        [string]$Path,
        [string]$Name
    )

    $line = Get-Content -LiteralPath $Path |
        Where-Object { $_ -match ("^\s*" + [regex]::Escape($Name) + "\s*=") } |
        Select-Object -First 1
    if (-not $line) {
        throw "Missing $Name in $Path"
    }

    $value = ($line -replace ("^\s*" + [regex]::Escape($Name) + "\s*="), "").Trim()
    if ($value.Length -ge 2 -and $value.StartsWith('"') -and $value.EndsWith('"')) {
        return $value.Substring(1, $value.Length - 2)
    }
    if ($value.Length -ge 2 -and $value.StartsWith("'") -and $value.EndsWith("'")) {
        return $value.Substring(1, $value.Length - 2)
    }
    return $value
}

function Invoke-DynsecCommand {
    param(
        [string]$Username,
        [string]$Password,
        [string[]]$Command
    )

    $inputText = $Password + [Environment]::NewLine
    $output = $inputText | & docker exec -i $Container mosquitto_ctrl `
        -h mosquitto `
        -p 8883 `
        --cafile /mosquitto/config/certs/ecotrack-ca.crt `
        -u $Username `
        dynsec @Command 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Dynamic Security command failed: $($Command -join ' ')"
    }
    return @($output)
}

if (-not (Test-Path -LiteralPath $EnvFile -PathType Leaf)) {
    throw "Environment file does not exist: $EnvFile"
}

$adminUser = Get-DotEnvValue -Path $EnvFile -Name "DYNSEC_ADMIN_USER"
$adminPass = Get-DotEnvValue -Path $EnvFile -Name "DYNSEC_ADMIN_PASS"
if ([string]::IsNullOrWhiteSpace($adminUser) -or [string]::IsNullOrWhiteSpace($adminPass)) {
    throw "DYNSEC_ADMIN_USER and DYNSEC_ADMIN_PASS must not be empty"
}
if ($adminUser -in @("admin", "democlient")) {
    throw "DYNSEC_ADMIN_USER must be different from the default users"
}

$staticUsers = Get-Content (Join-Path $PSScriptRoot "..\mosquitto\config\passwd") |
    ForEach-Object { if ($_ -match "^([^:]+):") { $Matches[1] } }
if ($adminUser -in $staticUsers) {
    throw "DYNSEC_ADMIN_USER already exists in the static password file"
}

$passwordFile = docker exec $Container sh -c "test -f /mosquitto/data/dynamic-security.json.pw"
if ($LASTEXITCODE -ne 0) {
    throw "The generated dynamic-security password file was not found"
}
$defaultAdminPass = docker exec $Container sh -c "sed -n 's/^admin //p' /mosquitto/data/dynamic-security.json.pw"
if ([string]::IsNullOrWhiteSpace($defaultAdminPass)) {
    throw "The default dynamic-security admin password could not be read"
}

$env:DYNSEC_CONTAINER = $Container
$env:DYNSEC_ENV_FILE = $EnvFile
node (Join-Path $PSScriptRoot "create-dynsec-admin.js")
if ($LASTEXITCODE -ne 0) {
    throw "Dynamic Security client creation failed"
}

$listOutput = Invoke-DynsecCommand -Username $adminUser -Password $adminPass -Command @("listClients")
if (-not ($listOutput -contains $adminUser)) {
    throw "The new admin was not returned by dynsec listClients"
}
Write-Output "Verified new admin with dynsec listClients:"
$listOutput | ForEach-Object { Write-Output $_ }

Invoke-DynsecCommand -Username $adminUser -Password $adminPass -Command @("deleteClient", "admin") | Out-Null
Invoke-DynsecCommand -Username $adminUser -Password $adminPass -Command @("deleteClient", "democlient") | Out-Null
docker exec $Container rm -f /mosquitto/data/dynamic-security.json.pw
if ($LASTEXITCODE -ne 0) {
    throw "Could not remove the generated dynamic-security password file"
}
$remainingPasswordFile = docker exec $Container sh -c "test -e /mosquitto/data/dynamic-security.json.pw"
if ($LASTEXITCODE -eq 0) {
    throw "The generated dynamic-security password file still exists"
}

Write-Output "Default dynamic-security users removed."
Write-Output "Generated dynamic-security password file removed."
