# Alert History API Contract

All endpoints require the existing bearer token. `cliente_id` is resolved from
the authenticated token and is never accepted as a request parameter.

## Get alert history

`GET /api/alertas/:id/acciones`

### Success `200`

```json
{
  "data": [
    {
      "id": 41,
      "alerta_id": 12,
      "cliente_id": 7,
      "usuario_id": null,
      "usuario_username": "sistema",
      "accion": "generar_alerta",
      "detalle": "Alerta generada por temperatura fuera de umbral",
      "timestamp": "2026-10-30T21:00:00.000Z"
    },
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
  ]
}
```

Rows are ordered `timestamp ASC, id ASC`. An existing alert with no history
returns `{ "data": [] }`; it does not receive fabricated actions.

### Errors

- `401` when the token is missing or invalid.
- `404` when the alert does not belong to the authenticated client or does not
  exist. The response must not reveal which condition occurred.

## Change alert state

`PATCH /api/alertas/:id`

The existing request and response contract remains compatible:

```json
{
  "estado": "atendida",
  "comentario": "Se ajustó la ventilación"
}
```

On success, the alert response remains the existing alert object. The
corresponding action is committed atomically and delivered through the realtime
contract. Validation and authorization failures do not create an action.

## Activity projection

`GET /api/auditoria`

The existing admin-only filters and pagination remain. Alert actions are
included with:

- `entidad: "alerta"`
- `entidad_id`: alert id as text
- `accion`: action name
- `usuario_username`
- `detalle`
- `timestamp`

Rows remain scoped to `req.clienteId` and ordered newest first, like current
activity rows.
