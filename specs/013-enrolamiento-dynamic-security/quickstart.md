# Quickstart: Dynamic Security Spike

## Prerequisites

- Docker/Docker Compose with its daemon running.
- Existing TLS CA and broker certificate generated locally.
- Local `mosquitto/config/passwd` and `acl.conf` files; do not copy their contents into evidence.
- `DYNSEC_ADMIN_USER` and `DYNSEC_ADMIN_PASS` supplied through the ignored root `.env`.
- No production secrets committed to `mosquitto/config`, scripts, or evidence.

## Baseline snapshot

```powershell
$SnapshotDir = Join-Path $env:TEMP "ecotrack-mqtt-static-snapshot"
.\scripts\snapshot-mqtt-static.ps1 -SnapshotDir $SnapshotDir
```

Keep the snapshot outside Git. The rollback script expects this complete directory;
use the same `$SnapshotDir` with `scripts/revert-mqtt-dynamic.ps1`.

## Initialize the dynamic-security state

First inspect only the usernames in the static file and select an admin username
that does not appear there. Then set the selected username and password in the
ignored root `.env`. Initialize the named volume
before starting the broker. Mosquitto prompts interactively for the password; enter
the same value as `DYNSEC_ADMIN_PASS`. The username is not secret and is validated
before being passed to the command. Do not supply the password as an argument.

```powershell
$adminUser = Read-Host "Dynamic Security admin username"
if ($adminUser -notmatch '^[A-Za-z0-9_-]+$') { throw "Invalid admin username" }
docker compose run --rm -it --no-deps --user root --entrypoint sh mosquitto -c "mosquitto_ctrl dynsec init /mosquitto/data/dynamic-security.json $adminUser && chown mosquitto:mosquitto /mosquitto/data/dynamic-security.json && chmod 0600 /mosquitto/data/dynamic-security.json"
```

This is a one-time initialization. If `dynamic-security.json` already exists, stop
and inspect it rather than overwriting it. The image build searches for
`mosquitto_dynamic_security.so` and fails if the plugin is absent. The tracked
`dynamic-security.json.example` is only a template; the live state stays in the
`mosquitto_data` volume and must not be committed. See the official
[Dynamic Security initialization and default role](https://mosquitto.org/documentation/dynamic-security/)
documentation for the initial `admin` identity and its default permissions.

## Start the broker and restrict the admin role

```powershell
docker compose build mosquitto backend
docker compose up -d mosquitto backend
```

Confirm the plugin loads and the state file is writable. The initial admin role
created by Mosquitto includes broad read/monitor ACLs. Before provisioning devices
or allowing application clients to use this broker, remove those permissions so
the admin is limited to `$CONTROL/dynamic-security/#`. Each command prompts for
the admin password; do not add `-P` or put the secret in shell history.

```powershell
docker compose run --rm -it --no-deps --entrypoint mosquitto_ctrl mosquitto --cafile /mosquitto/config/certs/ecotrack-ca.crt -h mosquitto -p 8883 -u $adminUser dynsec removeRoleACL admin publishClientReceive '$SYS/#'
docker compose run --rm -it --no-deps --entrypoint mosquitto_ctrl mosquitto --cafile /mosquitto/config/certs/ecotrack-ca.crt -h mosquitto -p 8883 -u $adminUser dynsec removeRoleACL admin subscribePattern '$SYS/#'
docker compose run --rm -it --no-deps --entrypoint mosquitto_ctrl mosquitto --cafile /mosquitto/config/certs/ecotrack-ca.crt -h mosquitto -p 8883 -u $adminUser dynsec removeRoleACL admin publishClientReceive '#'
docker compose run --rm -it --no-deps --entrypoint mosquitto_ctrl mosquitto --cafile /mosquitto/config/certs/ecotrack-ca.crt -h mosquitto -p 8883 -u $adminUser dynsec removeRoleACL admin subscribePattern '#'
docker compose run --rm -it --no-deps --entrypoint mosquitto_ctrl mosquitto --cafile /mosquitto/config/certs/ecotrack-ca.crt -h mosquitto -p 8883 -u $adminUser dynsec removeRoleACL admin unsubscribePattern '#'
```

The admin's control-topic publish/receive/subscribe permissions remain. If any
removal command fails, stop and do not provision devices; record the environment
as pending until the effective role ACLs are inspected.

## Provision two devices

List only the static usernames before selecting device IDs, and confirm the admin
and generated device usernames are absent from `passwd`:

```powershell
Get-Content mosquitto\config\passwd | ForEach-Object { ($_ -split ':', 2)[0] }
```

Use device IDs that are unique in Dynamic Security. The provisioning command fails
closed on rejected role/client/ACL operations; it does not treat arbitrary broker
errors as an existing object and never rotates an existing password. If a run fails
after creating its role, it attempts to remove that role; inspect Dynamic Security
state before retrying if cleanup fails. Use new test IDs after an ambiguous timeout.

```powershell
node scripts\provision-mqtt-dynamic.js
node scripts\provision-mqtt-dynamic.js --remove <deviceId>
```

The script consumes `DYNSEC_ADMIN_USER` and `DYNSEC_ADMIN_PASS` from the ignored
root `.env`, generates random credentials for A/B, and stores them outside the
repository in a file with restricted permissions. It does not echo passwords or
pass them as command-line arguments.

## Run the isolation verification

```powershell
node scripts\verify-mqtt-dynamic-security.js
```

Expected results:

- A publishes to A: pass.
- B publishes to B: pass.
- A publishes to B: rejected by the broker.
- B publishes to A: rejected by the broker.
- A subscribes to B: rejected by the broker.
- B subscribes to A: rejected by the broker.

The script returns non-zero when any expected result differs. Connection, TLS, or
timeout errors do not count as authorization denials.

## Record result

The verification command writes only the A/B matrix to `evidence/acl-ab.md`; a
passing matrix does not approve the complete spike. Store the broker version, image
digest, effective configuration hashes, sanitized logs, static-user checks, and
rollback result under the feature evidence location. Keep `evidence/report.md` as
`Pendiente` until TLS/persistence, static coexistence, the A/B matrix, and rollback
are all verified. Use `Fallido` only for a reproduced failed acceptance criterion;
use `Pendiente` when required evidence or an environment is unavailable.

## Revert

```powershell
.\scripts\revert-mqtt-dynamic.ps1 -SnapshotDir <snapshot-directory>
```

Verify that the broker starts with the prior static `password_file`/`acl_file` and
that the existing backend/static ACL test still passes. Do not delete the dynamic
state or credentials unless the operator explicitly requests cleanup.
