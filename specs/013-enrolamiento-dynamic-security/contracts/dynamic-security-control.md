# Dynamic Security Control Contract

## Transport

- Protocol: MQTT over TLS.
- Broker listener: `8883`.
- CA validation: use the repository CA and reject unauthorized certificates.
- Control topic: `$CONTROL/dynamic-security/v1`.
- Response topic: `$CONTROL/dynamic-security/v1/response`.
- The admin client must not use `setInsecure` or an equivalent.

## Command envelope

Each command is a JSON object with a unique `correlationData` identifier, the
command name, and command-specific properties. The implementation must subscribe
to the response topic before publishing, match the response correlation value, use
a timeout, and fail closed on an unknown or duplicate response.

Required command sequence for a new device:

1. `createRole` with a deterministic per-device role name.
2. `addRoleACL` for `publishClientSend` on
   `ecotrack/<deviceId>/lecturas`, allow.
3. `addRoleACL` for `subscribePattern` on `#`, deny, or an equivalent explicit
   deny that the installed plugin proves effective.
4. `createClient` with the device username and generated password, attaching the
   role when supported by the installed command shape.
5. `addClientRole` to attach the role when it was not attached at creation.

The sequence must be idempotent or detect an existing object before creating it.
Partial success must trigger compensating removal/revocation commands.

The admin username and every dynamic device username MUST be absent from the
static `passwd` file. Static users remain enabled during the spike through the
plugin's deferred authentication path.

## Verification matrix

| Identity | Operation | Expected |
|---|---|---|
| device A | publish `ecotrack/A/lecturas` | Allowed |
| device A | publish `ecotrack/B/lecturas` | Rejected |
| device A | subscribe `ecotrack/B/lecturas` | Rejected |
| device B | publish `ecotrack/B/lecturas` | Allowed |
| device B | publish `ecotrack/A/lecturas` | Rejected |
| device B | subscribe `ecotrack/A/lecturas` | Rejected |

## Failure contract

- Timeout, malformed response, authorization failure, TLS failure or unexpected
  command result is a failed operation.
- The script exits non-zero and prints only sanitized diagnostic fields.
- It must not print passwords, full secrets, control payloads containing secrets or
  persisted dynamic-security content.
