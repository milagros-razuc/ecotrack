---
description: "Task list for auditing alert state changes"
---

# Tasks: Auditar cambios de estado de alertas

**Input**: Design documents from `/specs/009-auditar-cambios-alerta/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/,
quickstart.md

**Tests**: Included because the specification requires integration coverage for
transactions, isolation, duplicate activity rows, historical alerts and audit
failure behavior.

## Phase 1: Setup

**Purpose**: Confirm the existing feature-008 surfaces before changing them.

- [X] T001 Review the existing alert history, audit, migration and frontend contracts in `backend/src/services/alertas.service.js`, `backend/src/services/alerta-acciones.service.js`, `backend/src/services/auditoria.service.js`, `backend/src/config/migrate.js`, `backend/src/routes/alertas.js`, and `frontend/auditor.html`
- [X] T002 [P] Record the current response shapes for `GET /api/alertas`, `PATCH /api/alertas/:id`, `GET /api/alertas/:id/acciones`, and `GET /api/auditoria` in `backend/src/test/trazabilidad-alertas.integration.test.js` before extending them

---

## Phase 2: Foundational

**Purpose**: Establish the shared persistence and contract rules required by all
user stories.

- [X] T003 Confirm the idempotent `alerta_acciones` migration in `backend/src/config/migrate.js` preserves `usuario_id` nullable and `usuario_username`, and add only any missing compatibility migration
- [X] T004 [P] Add a shared historical-generation projection contract in `backend/src/services/alerta-acciones.service.js` for deriving `generar_alerta` from `alertas.timestamp` and `alertas.cliente_id` when no stored generation action exists, without inserting a backfill row
- [X] T005 [P] Define the activity identity contract in `backend/src/services/auditoria.service.js` and `frontend/auditor.html` so rows use `origen + id`; the external activity SELECT must return `origen` because ids can overlap between source tables

**Checkpoint**: Existing schemas and response compatibility are documented;
history derivation and activity row identity are ready for story work.

---

## Phase 3: User Story 1 - Registrar una transición de alerta (Priority: P1) 🎯 MVP

**Goal**: Persist every valid transition with its actor and comment, keep the
state/action transaction atomic, and record the administrative audit after
commit without changing the successful PATCH response.

**Independent Test**: Execute atendida and pendiente transitions, inspect
`alerta_acciones` and `auditoria`, simulate an INSERT failure in
`auditoria`, and confirm PATCH still returns its normal response while the
state and historical action remain committed.

### Tests for User Story 1

- [X] T006 [P] [US1] Add integration coverage for atendida and reabrir transitions, including `usuario_id`, `usuario_username`, previous/new state, comment in `alerta_acciones.detalle`, timestamp, exactly one corresponding activity representation, and an assertion that no new `alerta_acciones` row uses `accion = cambiar_estado_alerta` because the table CHECK permits only alert action values in `backend/src/test/trazabilidad-alertas.integration.test.js`
- [X] T007 [P] [US1] Add an integration test that stubs or forces the `pool.query` INSERT into `auditoria` to throw, then verifies PATCH status/body compatibility, committed alert state, and committed `alerta_acciones` row in `backend/src/test/trazabilidad-alertas.integration.test.js`
- [X] T008 [P] [US1] Add an integration test proving invalid, unauthorized, missing-alert, cross-client PATCH requests, and marking an already-attended alert as attended or reopening an already-pending alert create neither a transition action nor an audit row in `backend/src/test/trazabilidad-alertas.integration.test.js`

### Implementation for User Story 1

- [X] T009 [US1] Update `backend/src/services/alertas.service.js` to read the previous state with `SELECT ... FOR UPDATE` inside the same transaction before the UPDATE, then return the previous state alongside the committed alert/action context needed to build an audit detail without changing the PATCH response
- [X] T010 [US1] Update `backend/src/routes/alertas.js` to call `auditoriaService.registrar` only after `alertas.service.actualizarEstado` commits, using `accion = cambiar_estado_alerta`, `entidad = alerta`, the authenticated actor, and the alert client; preserve the existing non-throwing audit-error policy
- [X] T011 [US1] Encode the administrative audit detail in `backend/src/routes/alertas.js` or the existing alert service contract so it includes previous state, new state, and the optional comment while leaving `alerta_acciones.detalle` as the user comment
- [X] T012 [US1] Extend `backend/src/services/auditoria.service.js` so the unified activity query adds `WHERE accion <> 'cambiar_estado_alerta'` only inside its `SELECT ... FROM auditoria` branch, while retaining all rows in the `auditoria` table and leaving the outer SELECT unchanged in this task

**Checkpoint**: PATCH records actor/comment/state transition, audit failures
do not roll back committed state, and activity has one row per transition.

---

## Phase 4: User Story 2 - Consultar la trazabilidad en la alerta (Priority: P1)

**Goal**: Expose a client-isolated chronological timeline, including a
derived generation entry for existing alerts without stored generation actions.

**Independent Test**: Query `/historial` for a new alert, an existing alert
without `generar_alerta`, and an alert from another client; verify ordering,
generation timestamp/client, actor name, and comment detail.

### Tests for User Story 2

- [X] T013 [P] [US2] Add contract/integration coverage for `GET /api/alertas/:id/historial` returning `{ data: [...] }`, ordered by timestamp then id, in `backend/src/test/trazabilidad-alertas.integration.test.js`
- [X] T014 [P] [US2] Add integration coverage for an existing alert with no `generar_alerta` row, asserting `/historial` returns one derived "Generada" entry from `alertas.timestamp` and `alertas.cliente_id` without inserting data in `backend/src/test/trazabilidad-alertas.integration.test.js`
- [X] T015 [P] [US2] Add integration coverage for cross-client history access returning 404 and for preserving `usuario_username` and `detalle` after the actor account is deleted in `backend/src/test/trazabilidad-alertas.integration.test.js`

### Implementation for User Story 2

- [X] T016 [US2] Implement the history query in `backend/src/services/alerta-acciones.service.js` to union stored actions with one derived `generar_alerta` row only when the alert has no stored generation action, using the alert's historical client and timestamp and ordering chronologically
- [X] T017 [US2] Add `GET /api/alertas/:id/historial` in `backend/src/routes/alertas.js` with the same client-scoped authorization and `{ data: [...] }` response as `/acciones`, retaining `/acciones` as a compatibility alias
- [X] T018 [US2] Update `frontend/auditor.html` to consume `/historial`, render the derived or stored "Generada" event, display actor/date/comment detail safely, and preserve the existing read-only modal behavior
- [X] T019 [US2] Add additive `ultima_accion_usuario` and `ultima_accion_fecha` fields to `GET /api/alertas` through a `LEFT JOIN LATERAL` selecting the latest `alerta_acciones` row by `timestamp, id`, then render the "Última acción" column in `frontend/auditor.html` without changing existing fields or their response shape

**Checkpoint**: Users see a complete, read-only, client-isolated timeline for
both new and pre-existing alerts.

---

## Phase 5: User Story 3 - Integrar la transición en actividad administrativa (Priority: P2)

**Goal**: Show alert changes once in the admin activity tab, with stable source
identity and existing filters/pagination.

**Independent Test**: As an admin, filter activity by entity/action/date and
verify one row per alert transition; `accion=cambiar_estado_alerta` returns no
rows because those audit-table rows are excluded from the unified response.

### Tests for User Story 3

- [X] T020 [P] [US3] Add integration coverage that `GET /api/auditoria` returns one alert row from `alerta_acciones`, includes `origen`, and does not duplicate the matching audit-table row in `backend/src/test/trazabilidad-alertas.integration.test.js`
- [X] T021 [P] [US3] Add integration coverage that `GET /api/auditoria?accion=cambiar_estado_alerta` returns an empty result while the underlying `auditoria` row remains present in `backend/src/test/trazabilidad-alertas.integration.test.js`
- [X] T022 [P] [US3] Add frontend regression coverage or a static assertion for `frontend/auditor.html` confirming activity rows do not use `id` alone as their identity and preserve `origen + id`

### Implementation for User Story 3

- [X] T023 [US3] After T012, update only the outer activity SELECT and response mapping in `backend/src/services/auditoria.service.js` to return `origen` in addition to `id`, preserve filters/pagination, and keep the duplicate exclusion solely in the audit branch
- [X] T024 [US3] Update activity rendering and any row/action identity logic in `frontend/auditor.html` to use `origen + id`, while keeping alert history links based on the alert entity id
- [X] T025 [US3] Verify admin authorization and client scoping remain unchanged in `backend/src/routes/auditoria.js` and add explicit error handling for any new frontend activity/history load failure in `frontend/auditor.html`

**Checkpoint**: Admin activity is filtered, paginated, client-isolated, and
contains exactly one representation of each alert transition.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Align documentation and run the complete focused validation.

- [X] T026 [P] Update the data dictionary and sections 4.5.1/4.5.2, 4.3.2, 4.6.6, 3.4, and CU06 in `docs/PROYECTO FINAL DE SISTEMAS-ECOTRACK.md`; describe `/historial`, note that `/acciones` is retained only for compatibility, and clarify that state changes are stored in `auditoria` but displayed in activity through `alerta_acciones`
- [X] T027 [P] Update the feature contracts and validation guide in `specs/009-auditar-cambios-alerta/contracts/alert-history-api.md`, `specs/009-auditar-cambios-alerta/contracts/activity-api.md`, and `specs/009-auditar-cambios-alerta/quickstart.md` to document derived generation, `origen`, duplicate filtering, and audit-failure behavior
- [ ] T028 Confirm the focused integration suite uses a separate test database, rebuild the backend container with `docker compose up -d --build backend`, run the suite from `backend` using the command in `specs/009-auditar-cambios-alerta/quickstart.md`, verify the frontend afterward, then run `git diff --check` and resolve regressions without changing unrelated worktree files

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup; blocks all story phases.
- **User Story 1 (Phase 3)**: Depends on Foundational; MVP.
- **User Story 2 (Phase 4)**: Depends on Foundational and the committed action contract from US1.
- **User Story 3 (Phase 5)**: Depends on Foundational and the audit/activity behavior from US1.
- **Polish (Phase 6)**: Depends on all selected user stories.

### User Story Dependencies

- **US1 (P1)**: Can start after Phase 2; no story dependency.
- **US2 (P1)**: Uses the existing history model and can develop in parallel with US1 after Phase 2, but its final endpoint/UI verification depends on the action contract from US1.
- **US3 (P2)**: Uses the existing unified activity model and can develop in parallel with US1 after Phase 2, but final duplicate-count verification depends on US1's audit row.
- **T023**: Depends on **T012** because both edit `backend/src/services/auditoria.service.js`; T012 changes only the audit branch filter and T023 changes only the outer SELECT and response mapping.

### Parallel Opportunities

- T002, T004, and T005 can run in parallel after T001.
- T006-T008 can run in parallel before US1 implementation.
- T013-T015 can run in parallel before US2 implementation.
- T020-T022 can run in parallel before US3 implementation.
- T026 and T027 can run in parallel after implementation; T028 runs last.

## Implementation Strategy

1. Complete US1 first as the MVP: transaction-safe history plus post-commit
   administrative audit.
2. Deliver US2 next: compatibility history endpoint, derived generation, and
   timeline/last-action UI.
3. Deliver US3: deduplicated activity response with stable `origen + id`.
4. Finish documentation and focused regression validation.
