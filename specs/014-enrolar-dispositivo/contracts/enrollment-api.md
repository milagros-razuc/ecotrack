# Enrollment API Contract

## Request

`POST /api/dispositivos/enrolar` over HTTPS 443.

```json
{
  "device_id": "ESP32-001",
  "device_secret": "<factory-secret>"
}
```

No acepta `activation_code`, `codigo`, `token`, `cliente_id` ni credenciales MQTT
en el body. Los campos adicionales se rechazan con el mismo error genérico.

## Authentication and authorization

- HTTPS is mandatory.
- The firmware call is authenticated by `device_id` + factory secret.
- The device must already have `cliente_id` and `reclamado_en` from the dashboard
  claim flow.
- `cliente_id` is never trusted from request input.

## Success

Status `200` and exactly one response containing the MQTT credentials:

```json
{
  "device_id": "ESP32-001",
  "mqtt_user": "ecotrack-esp32-001",
  "mqtt_pass": "<generated-once>",
  "mqtt_host": "<broker-host>",
  "mqtt_port": 8883
}
```

The password is not logged, persisted as recoverable plaintext, or returned by a
retry.

## Rejection

All invalid body, unknown factory device, hash mismatch, unclaimed device,
already-enrolled device, rate limit, authorization and internal provisioning
failures use the same public status and body:

```json
{
  "error": "No se pudo enrolar el dispositivo"
}
```

## Dynamic-security transaction

1. Validate and lock the local device/factory row.
2. Create role.
3. Add publish ACL and explicit subscribe deny/own allow ACLs.
4. Create MQTT client and attach role.
5. Commit local enrollment state.
6. Return credentials once.

Any failure triggers compensating deletion/revocation and returns the generic
error. A failed compensation is logged as an incident without secrets.
