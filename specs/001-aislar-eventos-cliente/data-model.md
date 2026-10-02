# Data Model: Aislar Eventos en Tiempo Real por Cliente

## Existing persisted entities

### Usuario

- `id`: identity used by the JWT `sub` claim and the user room.
- `cliente_id`: tenant identity represented in the JWT as `clienteId` and used for the client
  room.
- `token_version`: persisted session invalidation counter compared with JWT claim `tv`.
- Lifecycle: password changes increment `token_version`; deletion removes the row. The current
  schema has no `activo` field for users, so a future/current deactivation operation must invoke
  the same socket invalidation hook.

### Dispositivo

- `codigo`: globally unique device identity from the MQTT topic.
- `cliente_id`: owning tenant; nullable while unassigned.
- `activo`: logical device state already checked by MQTT ingestion.

## Runtime entities

### Authenticated socket session

- `socket.id`: Socket.IO connection identity.
- `userId`: validated JWT `sub`.
- `clienteId`: validated JWT `clienteId`.
- `tokenVersion`: validated JWT `tv` used by the shared session validator.
- `expiresAt`: JWT `exp` converted to milliseconds for the disconnect timer.
- `expiryTimer`: process-local timer cleared on socket disconnect or explicit invalidation.

### Room membership

- `clientRoom(clienteId)`: receives `lectura` and `alerta` events for all assigned devices of
  that tenant.
- `userRoom(userId)`: index/target for disconnecting every active socket for one user. It is not
  an event broadcast room and must not be populated from browser input.

## State transitions

1. **Handshake pending**: token is read from Socket.IO auth data but not trusted.
2. **Authenticated**: shared JWT and `tv` validation succeeds; socket joins client and user
   rooms and receives an expiry timer.
3. **Rejected**: missing, malformed, invalid, expired, unknown, or token-version-mismatched
   session fails the handshake with an authentication error.
4. **Connected invalidated**: expiry timer, password change, deletion, or deactivation triggers
   disconnect; no later events are delivered.
5. **Disconnected**: timer is cleared and the socket is removed from the user index.

## Invariants

- A socket is in at most one client room derived from its validated token.
- A device with `cliente_id = NULL` has no destination room and produces no real-time event.
- No client room name or user room name is accepted from the browser.
- Existing event names and payload fields remain unchanged.
