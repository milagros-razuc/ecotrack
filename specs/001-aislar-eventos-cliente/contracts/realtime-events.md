# Real-Time Event Contract

## Connection authentication

The dashboard opens a Socket.IO connection with the existing session token in the authentication
handshake. The server validates the token signature and expiration, then checks the JWT `tv`
claim against `usuarios.token_version`. The validated `clienteId` claim determines room
membership. The browser cannot select or override a client.

| Connection state | Result |
|---|---|
| Missing token | Handshake rejected with an authentication error |
| Invalid signature or malformed token | Handshake rejected with an authentication error |
| Expired token | Handshake rejected with an authentication error |
| User missing or `tv` mismatched | Handshake rejected with an authentication error |
| Valid token | Socket joins its client room and user invalidation index |

The server disconnects an already-connected socket when `exp` is reached or when the user's
session becomes invalid because of a password change, deletion, or deactivation. The dashboard
stops reconnection attempts for the authentication error and redirects to login.

## Events

The event names and payloads are unchanged.

### `lectura`

Emitted to the room of the device's persisted `cliente_id` after the existing MQTT validation
and persistence flow succeeds. No event is emitted when the device has no assigned client.

```json
{
  "dispositivoCodigo": "ESP32-001",
  "temperatura": 23.4,
  "humedad": 47,
  "luminosidad": 65,
  "timestamp": "2026-10-02T12:00:00.000Z"
}
```

### `alerta`

Emitted to the room of the client that owns the alert's device. No event is emitted when the
device has no assigned client.

```json
{
  "dispositivoCodigo": "ESP32-001",
  "variable": "temperatura",
  "valor": 85,
  "umbralMin": 0,
  "umbralMax": 80,
  "timestamp": "2026-10-02T12:00:00.000Z"
}
```

## Isolation contract

- Users in the same client receive the same matching events.
- Users in different clients receive no events from one another.
- An unassigned device has no event destination.
- The event payload does not gain `cliente_id`; routing is server-side through persisted device
  ownership.
