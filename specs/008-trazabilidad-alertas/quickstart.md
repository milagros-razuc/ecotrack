# Quickstart: Trazabilidad de alertas

## Prerequisites

- Docker Compose PostgreSQL/MQTT environment running.
- Backend dependencies installed in `backend/`.
- `TEST_DATABASE_URL` configured for integration tests.
- Two fixture users from different clients and one device that can be
  transferred between them.

## Automated validation

From `backend/`:

```powershell
npm test -- --test-name-pattern="trazabilidad|alerta"
```

The focused integration coverage must verify:

1. Alert generation creates one `alertas` row and one `generar_alerta` action
   atomically.
2. A valid state change creates exactly one action with the authenticated
   actor and optional detail.
3. A failed state change creates neither a state mutation nor an action.
4. History returns ascending chronological rows and returns no rows across
   clients.
5. Device transfer leaves the original alert/action `cliente_id` unchanged.
6. The admin activity projection includes alert actions without removing
   existing audit rows.
7. Socket clients in the owning client's room receive `alerta-accion`, while
   another client's socket receives nothing.

Run the complete backend suite after focused tests:

```powershell
npm test
```

## Manual UI validation

1. Log in to `auditor.html` as an admin.
2. Confirm an incoming alert appears and open its read-only history.
3. Mark it attended with a note, then reopen it with another note.
4. Confirm the history shows generation, attendance and reopening in ascending
   time order with actor and detail.
5. Open **Registro de actividad** and filter `entidad=alerta`; confirm the same
   actions appear newest first and remain paginated.
6. Open two browser sessions for different clients and confirm neither alert
   history nor `alerta-accion` events cross the client boundary.
7. Transfer the device and confirm the old alert remains visible only to its
   original client.

See [alert-history-api.md](contracts/alert-history-api.md) and
[realtime-alert-actions.md](contracts/realtime-alert-actions.md) for exact
response and event shapes.
