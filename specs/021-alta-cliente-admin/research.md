# Feature 021 Research

## Decision: Reuse the existing authentication primitives

**Rationale**: `auth.service.js` already hashes passwords with bcrypt, issues JWTs
with `clienteId` and `token_version`, and exposes `POST /api/auth/change-password`.
The new account state must be persisted and checked by authentication middleware;
JWT claims alone are insufficient for the required first-login restriction.

**Alternatives considered**:
- Store the pending state only in the JWT: rejected because a stale claim could
  bypass the server-side requirement.
- Introduce a second password-changing flow: rejected because it duplicates the
  existing endpoint and session invalidation behavior.

## Decision: Add a persisted forced-password-change state

**Rationale**: The current `usuarios` table has no first-login flag. A migration is
required so protected requests consult current account state. The state is cleared
with the password update and `token_version` increment.

**Alternatives considered**:
- Infer temporary status from password format: rejected because bcrypt hashes do not
  preserve a reliable lifecycle marker.
- Trust a JWT flag: rejected by the specification's server-side verification rule.

## Decision: Use two explicit platform routes

**Rationale**: `POST /api/plataforma/clientes` creates a client and its initial admin;
`POST /api/plataforma/clientes/:id/admin` creates an admin for an existing client.
The route shape makes `cliente_id` unavailable in the new-client body and prevents
ambiguous payload modes.

**Alternatives considered**:
- One endpoint with a mode field: rejected because it increases schema branching.

## Decision: Normalize before uniqueness checks and enforce uniqueness in PostgreSQL

**Rationale**: The current schema has case-sensitive `UNIQUE` constraints on
`clientes.nombre` and `usuarios.username`, and login uses exact equality. The feature
normalizes `trim` and lowercases usernames, then adds idempotent unique indexes on
`lower(nombre)` and `lower(username)` after historical collisions are reviewed.
Application checks provide friendly error codes; indexes protect concurrent requests.

**Alternatives considered**:
- Transactional pre-check only: rejected because concurrent requests can race.
- PostgreSQL `citext`: rejected to minimize schema changes and preserve column types.

## Decision: Use the platform client for global audit rows

**Rationale**: `auditoria.cliente_id` is required and tenant listings filter by client.
Global client-management actions are attributed to the platform client, keeping them
out of operational tenant audit views while retaining actor and actor type.

**Alternatives considered**:
- Attribute the row to the new client: rejected because the tenant must not receive
  platform-global administrative history.
- Allow NULL: rejected because it conflicts with the current foreign-key contract.

## Decision: Keep the default rate limit aligned with Feature 020

**Rationale**: Five requests per authenticated platform user per 15 minutes bounds
the workflow and follows the existing platform provisioning limiter. The counter key
is separate from read, reset, and device provisioning counters.

**Alternatives considered**:
- Reuse the provisioning limiter: rejected because client creation has a distinct
  abuse and audit boundary.

## Decision: Generate and deliver the temporary password once

**Rationale**: The server generates a CSPRNG password of at least 16 characters using
an unambiguous alphabet, returns it only in the immediate allowlisted response, and
the static modal uses `textContent`, copy, and close-time cleanup.

**Alternatives considered**:
- Accept an operator-selected password: rejected because it increases secret handling.
- Download or email the password: rejected by the one-time modal requirement.

## Decision: No broker operation is part of client creation

**Rationale**: Client creation is relational state only; MQTT/Dynamic Security
operations are device-enrollment concerns. The seed creates clients and users through
PostgreSQL and does not contact the broker.

**Alternatives considered**:
- Provision broker credentials during client creation: rejected as out of scope.
