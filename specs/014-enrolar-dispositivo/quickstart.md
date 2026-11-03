# Quickstart: Enrolamiento seguro

## Prerequisites

- Docker Compose, PostgreSQL, Mosquitto and nginx available.
- Existing dashboard claim flow can claim a factory device with code + one-time
  token.
- Factory export contains only `device_id` and `factory_secret_hash`.
- `DYNSEC_ADMIN_USER` and `DYNSEC_ADMIN_PASS` are in the ignored root `.env`,
  because Compose interpolates these values there. The backend `env_file` is
  `./backend/.env`, a different file.
- `DYNSEC_CA_PATH=/run/secrets/ecotrack-ca.crt` is declared in the backend
  service in `docker-compose.yml`; it is not read from the root `.env`.
- `MQTT_PUBLIC_HOST` is a separate root `.env` variable for the hostname visible
  to the board. Its definitive value is pending and must not be replaced by the
  internal Docker hostname `mosquitto`.
- `serverHost` is a DNS hostname and the CA matching `ecotrack_ca.h` is available.

## Prepare data

1. Run the factory export outside Git.
2. Apply the factory-device migration.
3. For every exported factory `device_id`, first create the corresponding
   pending row in `dispositivos` by running `provision-device.js`, and then claim
   that same device in the dashboard:

   ```powershell
   docker compose exec -T backend node scripts/provision-device.js <device_id>
   ```

   Capture the one-time claim token only in a protected variable or secret
   operator channel. Do not put it in the factory backend export: that export
   contains only `device_id` and `factory_secret_hash`.
4. Claim one device for client A and another for client B through the existing
   dashboard flow, using the `device_id` as the claim `codigo` and the
   one-time token from the previous step.
5. Confirm no request body or log contains the claim token.

## Issue HTTPS certificate

Run the reproducible certificate script with the real `serverHost` and an output
directory outside the repository. In the verification environment the host is
`Milagros`; do not use `localhost`:

```powershell
.\scripts\emit-backend-certificate.ps1 -ServerHost Milagros -OutputDir $env:USERPROFILE\ecotrack-certs
```

Verify the leaf certificate has `DNS:Milagros` and chains to the CA embedded in
the firmware. The MQTT and HTTPS clients must connect using `Milagros`, not
`localhost`, so hostname verification and SNI exercise the real SAN. Do not
copy private keys into Git.

## Start the proxy

```powershell
docker compose up -d mosquitto backend nginx
```

Verify port 3000 is not published externally and nginx answers on 443 with the
expected `DNS:Milagros` SAN. The backend Compose service must define
`DYNSEC_CA_PATH=/run/secrets/ecotrack-ca.crt`; this is the CA consumed by the
backend Dynamic Security client. If Dynamic Security fails during enrolment,
the local transaction rolls back, `enrolled_at` remains NULL, and the service
attempts to delete the created Dynamic Security client and role. A failed
compensation emits only a sanitized stderr log and requires manual resolution;
it is not a persisted or dashboard-visible pending incident, and must not be
reported as approved.

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

The endpoint does not use a dashboard JWT. The dashboard administrator first
claims the device with its code and one-time token; the firmware then calls this
endpoint with only `device_id` and `device_secret`.

The success response contains `mqtt_host` from `MQTT_PUBLIC_HOST`, never the
internal Compose hostname `mosquitto`. The public hostname remains intentionally
unset until the deployment hostname is decided.

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
