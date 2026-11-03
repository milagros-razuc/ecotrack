# Quickstart: Dynamic Security Spike

## Prerequisites

- Docker/Docker Compose available.
- Existing TLS CA and broker certificate generated locally.
- Backend MQTT admin username/password supplied through an untracked env file.
- Two test device credentials supplied through an untracked env file.
- No production secrets committed to `mosquitto/config` or scripts.

## Baseline snapshot

```powershell
Copy-Item mosquitto\config\mosquitto.conf .\session-mqtt-static.conf
Copy-Item mosquitto\config\acl.conf .\session-mqtt-static-acl.conf
Copy-Item mosquitto\config\passwd .\session-mqtt-static-passwd
```

Keep the snapshot outside Git. The exact restore command is supplied by the
implementation script and must restore the static configuration and compose mounts.

## Start the dynamic-security environment

```powershell
docker compose build mosquitto backend
docker compose up -d mosquitto backend
```

Confirm the plugin loads and the dynamic state file is writable before provisioning.
If the plugin is absent or the broker does not become healthy, stop and classify the
attempt as failed for that environment.

The image build searches for `mosquitto_dynamic_security.so` and fails if it is not
present. The versioned `dynamic-security.json.example` is only a schema/template;
the live `dynamic-security.json` must remain in the `mosquitto_data` volume and must
not be committed.

## Create the backend admin

Set `DYNSEC_ADMIN_USER` and `DYNSEC_ADMIN_PASS` in the ignored root `.env`. Run:

```powershell
.\scripts\provision-dynsec-admin.ps1
```

The script authenticates through stdin, never uses `-P`, prints no password, and
removes the generated `.pw` file only after the new admin successfully runs
`dynsec listClients`. It deletes the default `admin` and `democlient` clients only
after that verification succeeds.

## Provision two devices

```powershell
node scripts\provision-mqtt-dynamic.js
```

The script consumes `DYNSEC_ADMIN_USER` and `DYNSEC_ADMIN_PASS` from the ignored
root `.env`, generates random credentials for A/B, and stores them outside the
repository. It does not echo passwords or pass them as command-line arguments.

## Run the isolation verification

```powershell
node scripts\verify-mqtt-dynamic-security.js
```

Expected results:

- A publishes to A: pass.
- B publishes to B: pass.
- A publishes to B: fail/denied.
- B publishes to A: fail/denied.
- A subscribes to B: fail/denied.
- B subscribes to A: fail/denied.

The script must return non-zero if any expected result differs.

## Record result

Store the command output, broker version, image digest, effective configuration
hashes, and sanitized broker logs under the feature evidence location. The report
must say `Aprobado` only if all checks pass. Otherwise say `Fallido` or `Pendiente`
when the required environment/test was not available.

## Revert

```powershell
.\scripts\revert-mqtt-dynamic.ps1
```

Verify that the broker starts with the prior static `password_file`/`acl_file` and
that the existing backend/static ACL test still passes. Do not delete the dynamic
state or credentials unless the operator explicitly requests cleanup.
