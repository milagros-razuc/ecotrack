---
description: "Task list for secure device claiming and provisioning"
---

# Tasks: Reclamo seguro y aprovisionamiento de dispositivos

**Input**: Design documents from `specs/004-reclamo-seguro-dispositivos/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/dispositivos.md](./contracts/dispositivos.md), [quickstart.md](./quickstart.md)

**Tests**: Included because the specification explicitly requires integration coverage for valid claims, invalid/reused tokens, concurrent claims, migration restart behavior, historical isolation, and rejection contracts.

**Organization**: Tasks are grouped by user story so each story can be implemented and tested as an independent increment after the foundational schema changes.

## Phase 1: Setup

**Purpose**: Prepare the implementation and test surfaces without changing runtime behavior.

- [ ] T001 [P] Create the provisioning script entry point and CLI help skeleton in `backend/scripts/provision-device.js`
- [ ] T002 [P] Add the new integration test file structure and PostgreSQL test-fixture helpers in `backend/src/test/reclamo-dispositivo.integration.test.js` and `backend/src/test/realtime.test-support.js`
- [ ] T003 [P] Record the new operational commands and rejection behavior in `README.md` or the relevant backend operations documentation

---

## Phase 2: Foundational

**Purpose**: Establish the database, token, validation, and shared authorization primitives required by every user story.

**⚠️ CRITICAL**: No user story implementation can begin until this phase is complete.

- [ ] T004 Add nullable `token_reclamo_hash VARCHAR(64)` and `reclamado_en TIMESTAMPTZ` columns to `dispositivos` in `backend/src/config/migrate.js` without generating tokens for any existing device, including devices that already have a dueño
- [ ] T005 Make the `cliente_id` backfill in `backend/src/config/migrate.js` run only when `dispositivos.cliente_id` is created for the first time, so later startup cannot reassign released devices; keep the existing user backfill behavior within the same first-creation guard
- [ ] T006 Convert `alertas.valor`, `alertas.umbral_min`, and `alertas.umbral_max` to `DECIMAL(6,2)` with an explicit PostgreSQL `USING` conversion in `backend/src/config/migrate.js`
- [ ] T007 Make the seed in `backend/src/config/migrate.js` insert thresholds only when `ESP32-001` exists with a non-null `cliente_id`, and never restore thresholds for an unowned device
- [ ] T008 [P] Add token generation and SHA-256 hashing helpers using `crypto.randomBytes` in `backend/src/services/dispositivos.service.js`; keep plaintext tokens transient and never log or persist them
- [ ] T009 [P] Extend `backend/src/schemas.js` with the validated `token` request field while preserving required `codigo`, optional `nombre`, and optional `ubicacion` constraints
- [ ] T010 [P] Add shared test assertions in `backend/src/test/realtime.test-support.js` for token hashes, owner state, `reclamado_en`, empty configuration, and absence of thresholds
- [ ] T011 Run the existing backend test suite against `TEST_DATABASE_URL` and resolve migration/type regressions before starting story work

**Checkpoint**: The schema is repeatable, existing owned devices are untouched, and shared token/validation primitives are available.

---

## Phase 3: User Story 1 - Aprovisionar y rotar un dispositivo sin dueño (Priority: P1) 🎯 MVP

**Goal**: An operator can create a new unowned device, print exactly one token, reject duplicate codes without changes, and rotate a token only for an unowned device.

**Independent Test**: Run `node scripts/provision-device.js <codigo>`, verify the unowned inactive state and one-time output, repeat with the same code and expect no changes, then run `--rotate` and verify only the new token works.

### Tests for User Story 1

- [ ] T012 [P] [US1] Test provisioning a new code, one-time token output, unowned inactive state, null name/location, no thresholds, and stored hash only in `backend/src/test/reclamo-dispositivo.integration.test.js`
- [ ] T013 [P] [US1] Test that provisioning an existing code rejects without changing any device columns or token hash in `backend/src/test/reclamo-dispositivo.integration.test.js`
- [ ] T014 [P] [US1] Test `--rotate` for an unowned device, including old-token rejection and new-token acceptance, in `backend/src/test/reclamo-dispositivo.integration.test.js`
- [ ] T015 [P] [US1] Test `--rotate` on an owned device rejects without changing owner, configuration, or current token in `backend/src/test/reclamo-dispositivo.integration.test.js`

### Implementation for User Story 1

- [ ] T016 [US1] Implement idempotent create-only provisioning and single-use stdout token printing in `backend/scripts/provision-device.js`; reject an existing `codigo VARCHAR(50) UNIQUE` without updates
- [ ] T017 [US1] Implement `--rotate <codigo>` in `backend/scripts/provision-device.js` to require `cliente_id IS NULL`, replace exactly one `token_reclamo_hash`, clear any stale hash before replacement, and reject owned or missing devices without changes
- [ ] T018 [US1] Implement service methods for provisioning and rotation in `backend/src/services/dispositivos.service.js` using PostgreSQL transactions and no plaintext token persistence
- [ ] T019 [US1] Add provisioning/rotation audit calls without token or hash details through `backend/src/services/auditoria.service.js`
- [ ] T020 [US1] Verify the script uses the repository database configuration and closes the PostgreSQL pool on success and failure in `backend/scripts/provision-device.js`

**Checkpoint**: US1 is independently executable and proves that only the operator can create or rotate a usable claim token.

---

## Phase 4: User Story 2 - Reclamar un dispositivo con token válido (Priority: P1)

**Goal**: An authenticated admin claims an unowned device atomically with the token and the frontend sends the token while showing a generic error for every rejected claim.

**Independent Test**: Submit `POST /api/dispositivos` with a valid token, then repeat with missing/invalid/reused tokens, an unknown code, and an owned device; every rejection returns HTTP `409` with the same generic error and no state change.

### Tests for User Story 2

- [ ] T021 [P] [US2] Add API contract tests for valid claim response `200`, `reclamadoEn`, admin-only authorization, and HTTP `409` rejection shape in `backend/src/test/reclamo-dispositivo.integration.test.js`
- [ ] T022 [P] [US2] Add tests proving code-only, invalid, missing, reused, unknown-code, and already-owned claims all return HTTP `409` with the same generic error in `backend/src/test/reclamo-dispositivo.integration.test.js`
- [ ] T023 [P] [US2] Add concurrent claim tests using the same code and token to prove exactly one success, one `409`, one owner, one `reclamado_en`, and no duplicate mutation in `backend/src/test/reclamo-dispositivo.integration.test.js`
- [ ] T024 [P] [US2] Add a frontend behavior test or browser-level fixture for the token field, JSON `token` submission, and generic rejected-claim message covering `frontend/index.html` and `frontend/shared/app.js`

### Implementation for User Story 2

- [ ] T025 [US2] Replace code-only upsert behavior with an atomic `INSERT ... ON CONFLICT (codigo) DO UPDATE ... WHERE cliente_id IS NULL AND token_reclamo_hash = $tokenHash` in `backend/src/services/dispositivos.service.js`, setting owner, active state, name, location, and `reclamado_en` while consuming the hash
- [ ] T026 [US2] Update `backend/src/routes/dispositivos.js` to accept the validated `token` field on `POST /api/dispositivos`, derive the owner from `req.clienteId`, return `200` with `codigo` and `reclamadoEn`, and return the same generic `409` for unknown code, owned device, missing/invalid token, or reused token
- [ ] T027 [US2] Ensure `backend/src/routes/dispositivos.js` does not expose token hashes, owner history, or token-specific rejection reasons and records successful claim audit entries
- [ ] T028 [US2] Add the `token de reclamo` input to the existing device form in `frontend/index.html` without redesigning the page
- [ ] T029 [US2] Include `token` in the existing `POST /api/dispositivos` JSON and display a generic claim-rejected message for HTTP `409` in `frontend/index.html` and `frontend/shared/app.js` without distinguishing rejection causes
- [ ] T030 [US2] Preserve existing device list and dashboard behavior after the claim response changes in `frontend/index.html` and `frontend/shared/app.js`

**Checkpoint**: US2 is independently testable through the API and existing frontend form, with uniform non-disclosing rejection behavior.

---

## Phase 5: User Story 3 - Dar de baja y reutilizar un dispositivo (Priority: P1)

**Goal**: An admin releases a device with no valid token, MQTT messages are discarded while unowned, historical data remains with its original client, and an operator must rotate before the next claim.

**Independent Test**: Create historical data for client A, release the device, verify `204` with no body and a completely cleared operational state, publish while unowned and verify discard, restart the backend, rotate, claim for client B, and verify historical isolation.

### Tests for User Story 3

- [ ] T031 [P] [US3] Test `DELETE /api/dispositivos/:codigo` returns exactly `204` with an empty body and clears owner, active state, name, location, thresholds, and `token_reclamo_hash` in `backend/src/test/reclamo-dispositivo.integration.test.js`
- [ ] T032 [P] [US3] Test that an old token cannot reclaim after baja and that claim remains `409` until operator `--rotate` in `backend/src/test/reclamo-dispositivo.integration.test.js`
- [ ] T033 [P] [US3] Test MQTT messages for an unowned device are discarded without readings, alerts, realtime events, or public API results in `backend/src/test/reclamo-dispositivo.integration.test.js`
- [ ] T034 [P] [US3] Test backend restart/migration with a released device preserves null owner, inactive state, null token hash, cleared thresholds, and historical client ownership in `backend/src/test/reclamo-dispositivo.integration.test.js`
- [ ] T035 [P] [US3] Extend historical transfer coverage to verify client A retains readings/alerts and client B sees only post-claim data after operator rotation in `backend/src/test/aislamiento-historico-dispositivo.integration.test.js`

### Implementation for User Story 3

- [ ] T036 [US3] Update the transactional baja in `backend/src/services/dispositivos.service.js` to set `cliente_id = NULL`, `activo = false`, `nombre = NULL`, `ubicacion = NULL`, and `token_reclamo_hash = NULL`, then delete all device thresholds without modifying historical readings or alerts
- [ ] T037 [US3] Keep `DELETE /api/dispositivos/:codigo` as a `204 No Content` response with no body and audit the successful baja in `backend/src/routes/dispositivos.js`
- [ ] T038 [US3] Verify MQTT ownership checks in `backend/src/mqtt/client.js`, `backend/src/services/lecturas.service.js`, and `backend/src/services/alertas.service.js` discard unowned messages before persistence, alerts, or realtime emission
- [ ] T039 [US3] Preserve client-scoped historical queries and public API behavior for readings and alerts in `backend/src/services/lecturas.service.js`, `backend/src/services/alertas.service.js`, and `backend/src/routes/public.routes.js`
- [ ] T040 [US3] Add migration restart assertions and seed guards in `backend/src/config/migrate.js` so released devices are not reassigned and thresholds are not reinserted

**Checkpoint**: US3 proves safe release, operator-controlled re-enablement, MQTT discard, restart safety, and RNF18 historical isolation.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validate the complete feature and document operational behavior.

- [ ] T041 [P] Update `README.md` or relevant operations documentation with provisioning, `--rotate`, one-time token handling, HTTP `409` rejection semantics, and HTTP `204` baja semantics
- [ ] T042 [P] Add assertions that audit records for provisioning, rotation, claim, and baja never contain plaintext tokens or token hashes in `backend/src/test/reclamo-dispositivo.integration.test.js`
- [ ] T043 Run the complete backend test command from `backend/package.json` against an isolated `_test` database and resolve all regressions
- [ ] T044 Run the scenarios in `specs/004-reclamo-seguro-dispositivos/quickstart.md`, including restart and frontend claim rejection behavior
- [ ] T045 Review changed files for secret exposure, migration repeatability, API contract compatibility, and accidental frontend redesign

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies; can start immediately.
- **Phase 2 (Foundational)**: Depends on Phase 1 and blocks all user-story implementation.
- **Phase 3 (US1)**: Depends on Phase 2; delivers the MVP provisioning/rotation capability.
- **Phase 4 (US2)**: Depends on Phase 2 and the token/service primitives from US1, especially T016-T018.
- **Phase 5 (US3)**: Depends on Phase 2 and the claim/state contract from US2, especially T025-T027.
- **Phase 6 (Polish)**: Depends on all required user stories.

### User Story Dependencies

- **US1 (P1)**: Depends only on Foundational; independently testable.
- **US2 (P1)**: Depends on US1 token generation/storage behavior; independently testable after provisioning or fixture setup.
- **US3 (P1)**: Depends on US2 claim semantics to exercise release and re-claim; historical isolation remains independently asserted.

### Parallel Opportunities

- Phase 1: T001, T002, and T003 can run in parallel.
- Phase 2: T008, T009, and T010 can run in parallel after migration design is agreed; T004-T007 should remain ordered within `migrate.js`.
- US1: T012-T015 can be written in parallel; T016-T020 then implement the tested script/service behavior.
- US2: T021-T024 can be written in parallel; T028 can proceed in parallel with backend implementation after the request contract is fixed.
- US3: T031-T035 can be written in parallel; T038-T039 can proceed in parallel with T036 after the ownership contract is fixed.
- Phase 6: T041 and T042 can run in parallel; T043-T045 are final validation tasks.

### Implementation Strategy

1. Complete the migration and token primitives first, preserving existing historical data and startup behavior.
2. Deliver **US1 as the MVP** so operators can provision or rotate a device safely.
3. Deliver US2 next to enable secure admin claims through the existing API and minimal frontend form.
4. Deliver US3 to complete lifecycle release, MQTT discard, restart safety, and historical isolation.
5. Run the full quickstart and backend suite before implementation is considered complete.
