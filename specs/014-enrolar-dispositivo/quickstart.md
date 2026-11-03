# Quickstart: Enrolamiento seguro

## Prerequisites

- Docker Compose, PostgreSQL, Mosquitto and Caddy available.
- Existing dashboard claim flow can claim a factory device with code + one-time
  token.
- Factory export contains only `device_id` and `factory_secret_hash`.
- `DYNSEC_ADMIN_USER` and `DYNSEC_ADMIN_PASS` are in the ignored root `.env`,
  because Compose interpolates these values there. The backend `env_file` is
  `./backend/.env`, a different file.
- `DYNSEC_CA_PATH=/run/secrets/ecotrack-ca.crt` is declared in the backend
  service in `docker-compose.yml`; it is not read from the root `.env`.
- `MQTT_PUBLIC_HOST` is the single root `.env` value for the public host visible
  to the board and the Caddy site. Do not use the internal Docker hostname
  `mosquitto` there.
- `serverHost` is a DNS hostname and the CA matching `ecotrack_ca.h` is available.

## Prepare data

1. Run the factory export outside Git.
2. Apply the factory-device migration.
3. Import `backend.csv` into `dispositivos_fabrica` from a path outside the
   repository. The command validates all rows before opening the transaction;
   it never prints hashes and reports only inserted/omitted counts:

   ```powershell
   $backendCsv = 'C:\ruta\fuera\del\repo\backend.csv'
   docker compose cp $backendCsv backend:/tmp/backend.csv
   docker compose exec -T backend node scripts/import-factory-devices.js `
     /tmp/backend.csv
   docker compose exec -T backend rm -f /tmp/backend.csv
   ```

   This is the container workflow: `docker compose cp` places the file in
   `/tmp`, the import runs inside the backend container, and the temporary file
   is removed afterward. If running the script directly on the host instead,
   provide `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` and `DB_PASS` for the
   target database in the environment; the CSV must still be outside the
   repository.

4. For every exported factory `device_id`, first create the corresponding
   pending row in `dispositivos` by running `provision-device.js`, and then claim
   that same device in the dashboard:

   ```powershell
   docker compose exec -T backend node scripts/provision-device.js <device_id>
   ```

   Capture the one-time claim token only in a protected variable or secret
   operator channel. Do not put it in the factory backend export: that export
   contains only `device_id` and `factory_secret_hash`.
5. Claim one device for client A and another for client B through the existing
   dashboard flow, using the `device_id` as the claim `codigo` and the
   one-time token from the previous step.
6. Confirm no request body or log contains the claim token.

## Issue HTTPS certificate

For development, set `MQTT_PUBLIC_HOST` to the PC IP or a local DNS name. Caddy
receives the same value as `PUBLIC_HOST` and creates an internal certificate for
that site; `localhost` remains available as an additional local test site.
`MQTT_PUBLIC_HOST` must not be `localhost`, because that name is already the
additional site.
Start the services and export Caddy's persisted root CA outside the repository:

```powershell
docker compose up -d mosquitto backend caddy
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt `
  (Join-Path $env:TEMP 'ecotrack-caddy-root.crt')
```

Use the exported root CA with `curl.exe --cacert`; do not use `-k`. This
development CA is separate from the firmware CA and is not suitable for the
physical firmware flow.

## Start the proxy

```powershell
docker compose up -d mosquitto backend caddy
```

Verify ports 3000 and 8080 are not published externally and Caddy answers on
`https://<MQTT_PUBLIC_HOST>:443` (and `https://localhost:443`). The dashboard
and its API use the same HTTPS origin;
the frontend uses relative `/api/*` URLs, so login cookies/tokens are not sent
cross-origin. The backend Compose service must define
`DYNSEC_CA_PATH=/run/secrets/ecotrack-ca.crt`; this is the CA consumed by the
backend Dynamic Security client. If Dynamic Security fails during enrolment,
the local transaction rolls back, `enrolled_at` remains NULL, and the service
attempts to delete the created Dynamic Security client and role. A failed
compensation emits only a sanitized stderr log and requires manual resolution;
it is not a persisted or dashboard-visible pending incident, and must not be
reported as approved.

To manually verify the login path without exposing credentials in the command
line, first open `https://localhost/login.html` in a browser trusted with the
exported Caddy CA, then submit the login form. The browser request must be
`POST https://localhost/api/auth/login` and must not request
`http://localhost:3000` or `http://localhost:8080`.

When moving to a production DNS name, keep the same `MQTT_PUBLIC_HOST` value
and remove `tls internal` from the public site block in `caddy/Caddyfile`.
Caddy will then obtain and renew a publicly trusted certificate automatically;
the `localhost` block can remain internal for local tests.

When the public host changes, reissue the broker certificate with the matching
SAN before restarting the broker. The command accepts either an IP or DNS name,
keeps private keys outside Git, and updates the firmware copy of the project CA:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\generate-mqtt-certs.ps1 `
  -HostName $env:MQTT_PUBLIC_HOST
docker compose restart mosquitto backend
```

The script creates or reuses the project CA at
`mosquitto/config/certs/ecotrack-ca.key` and writes the broker certificate and
key beside it. The CA private key is ignored by Git and must never be copied
into the repository or printed. `codigo-esp32-mosquitto/ecotrack_ca.h` contains
the public CA certificate used by firmware as `kEcotrackCa`; it is not a private
key. If that embedded certificate predates the current CA, regenerate the
firmware header from the public `ecotrack-ca.crt` before flashing.

## MQTT CLI credentials without password arguments

Mosquitto 2.x client tools use a client configuration file with one option per
line in `-option value` format. Use `-o <file>`; do not use `-P` or
`--config-file` for this verification procedure. Create the file outside the
repository with restrictive permissions and delete it immediately after each
test:

```text
-h Milagros
-p 8883
--cafile C:\path\outside\repo\ecotrack-ca.crt
-tls-version tlsv1.2
-u <mqtt-user>
-P <mqtt-password>
```

The password is therefore not a process argument, but it does exist briefly in
the temporary file. Do not print that file or commit it. For `mosquitto_pub`
and `mosquitto_sub`, add `-V mqttv5 -d` on the command line to make the MQTT v5
CONNACK/PUBACK/SUBACK rejection visible:

```powershell
# Host: run these commands where the mosquitto client tools are installed.
mosquitto_pub.exe -o $mqttConfig -V mqttv5 -d -t $ownTopic -m $payload -q 1
mosquitto_sub.exe -o $mqttConfig -V mqttv5 -d -t $otherTopic -C 1 -W 5
```

The expected cross-topic result is a non-zero exit and an authorization
rejection in the debug output. Do not classify a timeout alone as an ACL
rejection.

`mosquitto_ctrl` uses the same one-option-per-line format, but its option is
`-o <file>`:

```text
-h Milagros
-p 8883
--cafile /mosquitto/config/certs/ecotrack-ca.crt
-V mqttv5
-u <dynsec-admin-user>
-P <dynsec-admin-password>
```

Run `mosquitto_ctrl` inside the Mosquitto container, so
`/mosquitto/config/certs/ecotrack-ca.crt` resolves to the mounted CA:

```powershell
# Container: execute after copying/creating the temporary config inside it.
docker compose exec mosquitto mosquitto_ctrl -o /tmp/dynsec.conf dynsec getClient
```

Piping the password to stdin is not a reliable non-TTY contract for
`mosquitto_ctrl`; use the temporary `-o` file instead, outside Git, and remove
it after the command. Do not pass the password with `-P` on the command line.

## Enrol firmware credentials

Send exactly `device_id` and `device_secret` to:

```text
https://<serverHost>/api/dispositivos/enrolar
```

For development, use:

```powershell
$body = '{"device_id":"<device-id>","device_secret":"<factory-secret>"}'
curl.exe --cacert (Join-Path $env:TEMP 'ecotrack-caddy-root.crt') `
  -H 'Content-Type: application/json' `
  --data-raw $body `
  https://localhost/api/dispositivos/enrolar
```

The endpoint does not use a dashboard JWT. The dashboard administrator first
claims the device with its code and one-time token; the firmware then calls this
endpoint with only `device_id` and `device_secret`.

The success response contains `mqtt_host` from `MQTT_PUBLIC_HOST`, never the
internal Compose hostname `mosquitto`. The public hostname remains intentionally
unset until the deployment hostname is decided.

The success response is captured once by the firmware and its MQTT password is
not printed. Repeat the request and verify the generic rejection without
credentials.

The normal firmware build requires a local, ignored
`codigo-esp32-mosquitto/enroll_ca.h`, copied from the public Caddy enrollment CA
or the production CA. Its `kEnrollCa` constant is separate from
`kEcotrackCa`, which validates MQTT; never use `setInsecure()` and never commit
the operational CA bundle. The firmware synchronizes NTP before this HTTPS
request, retries generic failures with a non-blocking backoff starting at 90
seconds (capped at 15 minutes, with jitter), and does not reopen the portal.

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
