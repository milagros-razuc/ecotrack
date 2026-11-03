param(
    [Parameter(Mandatory = $true)]
    [Alias('HostIp')]
    [string]$HostName,
    [string]$OutputRoot
)

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $OutputRoot) { $OutputRoot = Join-Path $scriptDir '..' }
$repoRoot = (Resolve-Path $OutputRoot).Path
$mosquittoCerts = Join-Path $repoRoot 'mosquitto\config\certs'
$esp32Certs = Join-Path $repoRoot 'codigo-esp32-mosquitto\certs'

New-Item -ItemType Directory -Force -Path $mosquittoCerts, $esp32Certs | Out-Null

$caKey = Join-Path $mosquittoCerts 'ecotrack-ca.key'
$caCert = Join-Path $mosquittoCerts 'ecotrack-ca.crt'
$brokerKey = Join-Path $mosquittoCerts 'broker.key'
$brokerCsr = Join-Path $mosquittoCerts 'broker.csr'
$brokerCert = Join-Path $mosquittoCerts 'broker.crt'

if (-not ((Test-Path $caKey) -and (Test-Path $caCert))) {
    openssl req -x509 -newkey rsa:4096 -sha256 -days 3650 -nodes `
        -keyout $caKey -out $caCert `
        -subj '/C=AR/O=EcoTrack/OU=Development/CN=EcoTrack MQTT CA'
}

openssl req -new -newkey rsa:2048 -nodes `
    -keyout $brokerKey -out $brokerCsr `
    -subj '/C=AR/O=EcoTrack/OU=Development/CN=mosquitto'

$parsedIp = $null
$isIp = [System.Net.IPAddress]::TryParse($HostName, [ref]$parsedIp)
$san = @"
[server_cert]
basicConstraints = critical,CA:false
keyUsage = critical,digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = mosquitto
DNS.2 = localhost
DNS.3 = $HostName
"@
if ($isIp) {
    $san += "IP.1 = $HostName`r`n"
}
$temporarySanConfig = Join-Path $env:TEMP ('ecotrack-mqtt-san-' + [guid]::NewGuid().ToString() + '.cnf')
Set-Content -Path $temporarySanConfig -Value $san -Encoding ascii
try {
    openssl x509 -req -sha256 -days 825 `
        -in $brokerCsr -CA $caCert -CAkey $caKey -CAcreateserial `
        -out $brokerCert -extfile $temporarySanConfig -extensions server_cert
}
finally {
    Remove-Item -LiteralPath $temporarySanConfig -Force -ErrorAction SilentlyContinue
}

Copy-Item -LiteralPath $caCert -Destination (Join-Path $esp32Certs 'ecotrack-ca.crt') -Force
Remove-Item -LiteralPath $brokerCsr, (Join-Path $mosquittoCerts 'ecotrack-ca.srl') -Force -ErrorAction SilentlyContinue

Write-Output "CA publica: $caCert"
Write-Output "Certificado del broker: $brokerCert"
Write-Output "Claves privadas generadas en una ruta ignorada por Git."
