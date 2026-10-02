# Implementation Plan: Aislar Eventos en Tiempo Real por Cliente

**Branch**: `001-aislar-eventos-cliente` | **Date**: 2026-10-02 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-aislar-eventos-cliente/spec.md`

## Summary

Autenticar cada conexión Socket.IO con la misma semántica JWT del middleware HTTP,
asociarla a rooms de cliente y usuario, y emitir `lectura`/`alerta` únicamente a la room del
cliente dueño del dispositivo. Un registro en memoria de sockets permitirá desconectar las
sesiones de un usuario cuando el token deje de ser válido, mientras que el frontend detendrá
los reintentos y enviará al usuario al login ante errores de autenticación. Los nombres y
payloads de eventos, la ingesta MQTT y CORS permanecen sin cambios.

## Technical Context

**Language/Version**: JavaScript/CommonJS on Node.js 18 (Docker Alpine)

**Primary Dependencies**: Express 4, Socket.IO 4.7, jsonwebtoken 9, pg 8, MQTT 5 client

**Storage**: PostgreSQL 15; existing `usuarios.token_version`, `usuarios.cliente_id`, and
`dispositivos.cliente_id`

**Testing**: Existing Node/assert service test style; add Socket.IO integration coverage with
`socket.io-client` and a test command as part of implementation because no test runner is
currently configured.

**Target Platform**: Docker Compose Linux containers, backend port 3000, static frontend served
by nginx on port 8080

**Project Type**: Web application with Node.js API/backend and static browser frontend

**Performance Goals**: Preserve event delivery without polling and without an additional query
per connected user; one device ownership lookup per processed reading/alert cycle is acceptable
for the current scope.

**Constraints**: Do not change MQTT ingestion, event names/payloads, dashboard event handling,
or CORS. Token claims are `clienteId` and `tv`, while the HTTP middleware compares `tv` with
`usuarios.token_version`. In-memory socket state is process-local and must be cleaned on every
disconnect.

**Scale/Scope**: Existing single backend process and current dashboard users; rooms must support
multiple simultaneous users and clients without broadcasting across tenants. No horizontal
socket-state adapter is introduced by this feature.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Modular Boundaries**: PASS. Authentication, socket lifecycle, MQTT emission, and frontend
  handling remain in their existing boundaries, with a small shared session-validation surface.
- **II. Secure By Default**: PASS. Handshake authentication is mandatory; browser-supplied
  client identifiers are ignored.
- **III. Validated Data Contracts**: PASS. Existing JWT verification and device ownership lookup
  are reused; event payloads remain unchanged.
- **IV. Testable Changes**: PASS with planned integration tests for cross-client delivery,
  invalid tokens, token invalidation, unassigned devices, and reconnection behavior.
- **V. Reliable and Observable Operation**: PASS. Expiry timers are cleared on disconnect and
  existing MQTT processing remains untouched.
- **VI. Tenant Isolation**: PASS. Sockets join rooms from the validated `clienteId`; emissions
  target the device owner's client room and skip unassigned devices.
- **VII. Controlled and Auditable Access**: PASS. No public API or audit behavior changes;
  authentication errors remain generic.

## Project Structure

### Documentation (this feature)

```text
specs/001-aislar-eventos-cliente/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/realtime-events.md
└── tasks.md
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── middleware/auth.js              # shared JWT validation surface
│   ├── realtime/socketRegistry.js      # socket rooms, user index, expiry timers
│   ├── services/auth.service.js        # invalidate sockets after password change
│   ├── services/usuarios.service.js    # invalidate sockets after deletion
│   ├── mqtt/client.js                  # owner lookup and room-targeted emissions
│   └── test/                            # service and realtime integration tests
└── index.js                             # io.use handshake and connection lifecycle

frontend/
└── shared/app.js                        # auth connection error handling

specs/001-aislar-eventos-cliente/
├── research.md
├── data-model.md
├── contracts/realtime-events.md
└── quickstart.md
```

**Structure Decision**: Keep the existing backend/frontend split. Add only a focused realtime
registry module under `backend/src/realtime/`; reuse the HTTP JWT semantics through the existing
auth middleware's shared validation surface. Keep ownership resolution in the MQTT boundary and
keep browser behavior in `frontend/shared/app.js`.

## Implementation Sequence

1. Extract the shared token-validation function from `backend/src/middleware/auth.js` without
  changing HTTP response behavior.
2. Add the process-local socket registry and lifecycle helpers for client/user rooms, `exp`
  timers, cleanup, and user-wide disconnection.
3. Configure `io.use()` and connection/disconnect hooks in `backend/index.js`; preserve the
  existing CORS configuration.
4. Add a device ownership lookup and replace only the two global MQTT emissions with client-room
  emissions; skip emission when ownership is `NULL`.
5. Invoke user-socket invalidation from password change, deletion, and any available user
  deactivation path without changing their existing HTTP contracts.
6. Handle authentication failures in `frontend/shared/app.js`: for `connect_error` caused by
  authentication and for `disconnect` with reason `io server disconnect`, disable reconnection
  attempts and redirect to login while leaving event listeners unchanged.
7. Add integration tests and run the quickstart scenarios.

The implementation must not alter MQTT topic parsing, schema validation, persistence, event
names, event payloads, dashboard event dispatch, or CORS.

## Post-Design Constitution Check

- **I. Modular Boundaries**: PASS. Shared JWT validation, socket lifecycle, MQTT routing, and
  browser auth-error handling have separate ownership boundaries.
- **II. Secure By Default**: PASS. No socket reaches a client room before JWT and `tv` checks.
- **III. Validated Data Contracts**: PASS. The existing JWT and MQTT validation contracts remain
  authoritative; no browser client identifier is trusted.
- **IV. Testable Changes**: PASS. The quickstart and planned integration suite cover every
  acceptance scenario, including lifecycle invalidation and concurrent tenants.
- **V. Reliable and Observable Operation**: PASS. Expiry timers and registry entries are cleaned
  up, and the MQTT processing path is otherwise unchanged.
- **VI. Tenant Isolation**: PASS. Client rooms derive from the validated token and device
  ownership; unassigned devices have no destination.
- **VII. Controlled and Auditable Access**: PASS. No API access or audit behavior is widened.

## Complexity Tracking

No constitution violations. The in-memory registry is required to track live sockets and expiry
timers within the existing single-process deployment; introducing a distributed adapter would
exceed the feature scope.
