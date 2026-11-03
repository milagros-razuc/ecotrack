# Data Model: Mosquitto Dynamic Security

## Dynamic client

| Field | Type | Rules |
|---|---|---|
| username | string | Unique in dynamic-security; never reused for another device |
| password | secret string | Generated/provided outside Git; never logged |
| disabled | boolean | False for an active test client; true/revoked on removal |
| device_id | string | Validated identifier; maps to one topic namespace |

## Device role

| Field | Type | Rules |
|---|---|---|
| role_name | string | Deterministic, unique per device, derived from validated device_id |
| publish ACL | topic rule | Allow only `ecotrack/<device_id>/lecturas` |
| subscribe ACL | topic rule | Deny cross-device filters; no `#` or `ecotrack/+` allowance |
| receive ACL | topic rule | Explicitly defined and tested; default deny unless required |

## Backend admin client

| Field | Type | Rules |
|---|---|---|
| username | string | Dedicated control identity, not a device identity |
| password | secret string | Environment/local secret, never committed or printed |
| control topic | string | `$CONTROL/dynamic-security/v1` |

## Provisioning operation

| Field | Type | Rules |
|---|---|---|
| request_id | string | Unique correlation value per command |
| operation | enum | create, attach-role, add-acl, remove/revoke |
| device_id | string | Validated before any control command |
| result | enum | success, broker-error, timeout, validation-error |
| evidence | sanitized text | Must omit passwords, tokens and full secrets |

## State transitions

```text
unknown -> validated -> client-created -> role-created -> acl-applied -> verified
                                      \-> rollback-requested -> removed/revoked
```

Any failed transition must not be reported as a successful provisioning result.
