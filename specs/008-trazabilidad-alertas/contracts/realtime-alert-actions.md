# Realtime Alert Actions Contract

## Event

Authenticated Socket.IO clients in room `cliente:<cliente_id>` receive:

`alerta-accion`

```json
{
  "id": 42,
  "alerta_id": 12,
  "cliente_id": 7,
  "usuario_id": 19,
  "usuario_username": "operador",
  "accion": "marcar_atendida",
  "detalle": "Se ajustó la ventilación",
  "timestamp": "2026-10-30T21:05:00.000Z"
}
```

## Rules

- The event is emitted only after the database transaction commits.
- `cliente_id` comes from the alert/action row and determines the room.
- A socket authenticated for another client receives no event.
- Automatic generation emits `generar_alerta` with actor `sistema`.
- The existing `alerta` event remains compatible for new alert notifications;
  this event adds the durable action record rather than replacing that signal.
- The frontend treats the event as a refresh/update signal and may refetch the
  read-only history to avoid duplicating rows.
