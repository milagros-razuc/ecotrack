# Data Model: Trazabilidad de alertas

## Existing entities

### `alertas`

Existing table. Relevant fields:

- `id`: integer primary key.
- `cliente_id`: historical owner captured at generation; source for isolation.
- `dispositivo_codigo`, `variable`, `valor`, `umbral_min`, `umbral_max`.
- `timestamp`: generation timestamp.
- `estado`: `pendiente` or `atendida`.
- `comentario`: current optional note, max 500 characters through the existing
  request schema.

### `auditoria`

Existing administrative activity table. It remains the source for existing
device, user, threshold and API-key operations. Its current projection is
preserved for the activity screen.

## New entity: `alerta_acciones`

Append-only history of alert lifecycle actions.

| Field | Type/constraint | Meaning |
|---|---|---|
| `id` | `SERIAL PRIMARY KEY` | Stable action identifier and tie-breaker. |
| `alerta_id` | `INTEGER NOT NULL REFERENCES alertas(id)` | Alert whose history owns the action. |
| `cliente_id` | `INTEGER NOT NULL REFERENCES clientes(id)` | Historical client copied from the alert; never from request input. |
| `usuario_id` | `INTEGER REFERENCES usuarios(id) ON DELETE SET NULL` | Human actor, null for automatic generation. |
| `usuario_username` | `VARCHAR(50)` | Actor display value, or `sistema` for generation. |
| `accion` | `VARCHAR(50) NOT NULL` | `generar_alerta`, `marcar_atendida` or `reabrir_alerta`. |
| `detalle` | `TEXT` | Optional note and transition context; generated from validated input. |
| `timestamp` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | Action time; generation uses the alert generation time when inserted together. |

## Relationships

- One `alertas` row has zero or many `alerta_acciones` rows.
- Every action belongs to exactly one historical `cliente_id`.
- `alerta_acciones.cliente_id` must equal `alertas.cliente_id` at insertion.
- A device transfer does not update either the alert or its actions.

## Indexes and integrity

- Unique/foreign-key relationship on `alerta_id`.
- Index `(cliente_id, alerta_id, timestamp ASC, id ASC)` for isolated history.
- Index `(cliente_id, timestamp DESC)` for the activity projection.
- A database check or service invariant restricts `accion` to the supported
  action names.
- No update or delete endpoint is exposed for actions.

## State and transaction rules

1. MQTT generation inserts `alertas` and its `generar_alerta` action in one
   transaction. If no device client exists, neither record is created.
2. A valid PATCH locks/selects the alert by `id` and `cliente_id`, updates
   `estado` and current `comentario`, then inserts one action in the same
   transaction.
3. Invalid, unauthorized or missing alerts roll back and create no action.
4. The action is emitted to the historical client's Socket.IO room only after
   commit.
5. History reads filter by both authenticated `cliente_id` and `alerta_id`;
   callers cannot supply the client scope.
