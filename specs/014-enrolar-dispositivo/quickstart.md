# Quickstart: Enrolamiento seguro

## Prerequisites

- Docker Compose, PostgreSQL, Mosquitto and nginx available.
- Existing dashboard claim flow can claim a factory device with code + one-time
  token.
- Factory export contains only `device_id` and `factory_secret_hash`.
- `DYNSEC_ADMIN_USER` and `DYNSEC_ADMIN_PASS` are in an ignored env file.
- `serverHost` is a DNS hostname and the CA matching `ecotrack_ca.h` is available.

## Prepare data

1. Run the factory export outside Git.
2. Apply the factory-device migration.
3. Claim one device for client A and another for client B through the existing
   dashboard flow.
4. Confirm no request body or log contains the claim token.

## Issue HTTPS certificate

Run the reproducible certificate script with `serverHost` and an output directory
outside the repository:

```powershell
.\scripts\emit-backend-certificate.ps1 -ServerHost mqtt.example.test -OutputDir $env:USERPROFILE\ecotrack-certs
```

Verify the leaf certificate has `DNS:mqtt.example.test` and chains to the CA
embedded in the firmware. Do not copy private keys into Git.

## Start the proxy

```powershell
docker compose up -d mosquitto backend nginx
```

Verify port 3000 is not published externally and nginx answers on 443 with the
expected SAN.

## Enrol firmware credentials

Send exactly `device_id` and `device_secret` to:

```text
https://<serverHost>/api/dispositivos/enrolar
```

The success response is captured once by the firmware and its MQTT password is
not printed. Repeat the request and verify the generic rejection without
credentials.

## Unit tests

```powershell
Set-Location backend
npm test -- --test-name-pattern=enrolamiento
```

Tests must cover invalid/unclaimed/already-enrolled requests, uniform errors,
rate limiting, constant-time comparison, MQTT timeout/error compensation and
two isolated clients A/B. No result is recorded as passing without actual output.

## Evidence

Record sanitized status codes, response shapes, broker ACL outcomes and TLS
certificate verification. Never store factory secrets, PINs, MQTT passwords,
tokens or private keys in the repository.
