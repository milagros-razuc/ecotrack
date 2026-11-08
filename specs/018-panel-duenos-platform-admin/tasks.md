---

description: "Task list for platform owner panel"
---

# Tasks: Panel global de dueños de plataforma

**Input**: Design documents from `/specs/018-panel-duenos-platform-admin/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Testing approach**: TDD. All tests in the user-story phases MUST be written and
executed before their implementation tasks, and MUST fail for the missing feature
behavior before implementation begins.

**Commit policy**: Create one commit per completed task or coherent task group; each
commit MUST include the required Copilot co-author trailer. Do not combine unrelated
stories or migrations in one commit.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish test and configuration surfaces without changing runtime behavior.

- [X] T001 [P] Create the platform-panel test fixture and isolated test helpers in `backend/src/test/platform-panel.test-support.js`, reusing the existing `TEST_DATABASE_URL` guard and recording the baseline as 266 de 299, with subtest 13 known and 32 todo.
- [X] T002 [P] Add platform-panel test configuration helpers in `backend/src/config/platformPanelConfig.js` with defaults, always-run-at-startup environment validation, and explicit error reporting; define the maximum `PLATFORM_LAST_READING_WINDOW_DAYS` constant as 365, alongside `PLATFORM_RESET_RATE_LIMIT_MAX`, `PLATFORM_RESET_RATE_LIMIT_WINDOW_MS`, `PLATFORM_READ_RATE_LIMIT_MAX`, and `PLATFORM_READ_RATE_LIMIT_WINDOW_MS`.
- [X] T003 [P] Add the frontend panel test harness or lightweight DOM test entrypoint in `frontend/` without adding external dependencies, covering role-based rendering and reset confirmation.

**Checkpoint**: Test/configuration surfaces exist; no production endpoint or schema behavior has changed.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Verify the existing database contracts and define migration boundaries before story implementation.

- [X] T004 [P] Write a schema-contract test in `backend/src/test/platform-panel-schema.test.js` that queries the real `lecturas` definition and confirms the column is exactly `dispositivo_codigo`, not an inferred alternative.
- [X] T005 [P] Write a migration/index contract test in `backend/src/test/platform-panel-schema.test.js` that requires the composite index `(dispositivo_codigo, timestamp DESC)` on the partitioned parent table and verifies migrations are repeatable.
- [X] T006 [P] Write configuration startup tests in `backend/src/test/platform-panel-config.test.js` proving validation always runs at startup: absent uses 30, non-integer/zero/negative values fail startup, 365 is valid, and 366 fails at startup.
- [X] T007 [P] Write rate-limit contract tests in `backend/src/test/platform-panel-rate-limit.test.js` proving reset and read limiters have separate in-memory counters, defaults of 10/15 minutes and 300/15 minutes respectively, and environment overrides are applied.
- [X] T008 Create the new numbered role migration `backend/migrations/016_platform_admin_role.sql` without editing prior migrations; expand the role constraint to accept `platform_admin` while preserving `admin` and `comun`.
- [X] T009 Create the new numbered platform-client migration `backend/migrations/017_platform_client.sql` without editing prior migrations; add `clientes.es_plataforma BOOLEAN NOT NULL DEFAULT false`, enforce the intended uniqueness invariant for the marked platform client, and make the migration rerunnable.
- [X] T010 Create the new numbered audit-actor migration `backend/migrations/018_audit_actor.sql` without editing prior migrations; add `auditoria.actor_tipo VARCHAR(30) NOT NULL DEFAULT 'tenant'` in a rerunnable way.
- [X] T011 Create the parent-table index migration `backend/migrations/019_platform_reading_index.sql` without editing prior migrations; verify by definition that the real partitioned `lecturas` parent has `(dispositivo_codigo, timestamp DESC)` and create a replacement only when no equivalent index exists, rerunnable.
- [X] T012 [P] Write migration-order and no-edit regression checks in `backend/src/test/platform-panel-schema.test.js` against the real migration list, confirming 015 is immediately followed by migrations 016–019, which are idempotent and do not modify migrations 014 or 015.

### Phase 2A: Test Database Migration Delivery

**Purpose**: Ensure every newly initialized test database receives migrations
016 onward explicitly, after the base schema has been created by `migrate.js`.

- [X] T048 Write a test in `backend/src/test/platform-panel-schema.test.js` that creates a fresh temporary test database, initializes its base schema with `migrate.js`, invokes the explicit migration runner through the test helper, verifies migrations 016–019 are applied, runs the runner a second time to prove idempotence, and drops the temporary database in cleanup.
- [X] T049 Implement `backend/scripts/run-migrations.js` as an explicit idempotent runner invoked by the test helper, applying `backend/migrations/016_*.sql` onward in numeric order after the base schema exists; record applied migrations, expose failures instead of silently continuing, and do not wrap migrations in an additional transaction.

**Checkpoint**: Foundational schema/configuration tests fail before implementation; migration names, database contracts, and delivery to fresh test databases are fixed.

---

## Phase 3: User Story 1 - Consultar el inventario global (Priority: P1) 🎯 MVP

**Goal**: Let a `platform_admin` see operational clients and devices globally without exposing the marked platform client or secrets.

**Independent Test**: With at least two operational clients and devices in all lifecycle states, the platform endpoints return paginated, filtered, secret-free global results and correct summary counts.

### Tests for User Story 1 (write first and keep failing before implementation)

- [X] T013 [P] [US1] Write T1 integration tests in `backend/src/test/platform-panel.integration.test.js` for a seeded `platform_admin` listing devices from multiple operational clients, while a client `admin` receives 403 on every `/api/plataforma/...` endpoint.
- [X] T014 [P] [US1] Write T2 integration tests in `backend/src/test/platform-panel.integration.test.js` using raw `Authorization: <JWT>` against `GET /api/dispositivos`, `GET /api/dispositivos/estado`, and `POST /api/dispositivos/:codigo/reset-credenciales`; prove `platform_admin` receives no tenant-admin permission and only `/api/plataforma/...` is authorized.
- [X] T015 [P] [US1] Write T3 whitelist tests in `backend/src/test/platform-panel.integration.test.js` that recursively reject secret, hash, token, password, MQTT credential, and factory-secret fields in every platform response.
- [X] T016 [P] [US1] Write T4 lifecycle tests in `backend/src/test/platform-panel.integration.test.js` for `fabricado`, `reclamado sin enrolar`, `enrolado`, and the post-reset transition back to `reclamado sin enrolar`.
- [X] T017 [P] [US1] Write T7 pagination/filter/limit tests in `backend/src/test/platform-panel.integration.test.js` for `cliente_id`, lifecycle state, firmware, page bounds, maximum limit, invalid query values, and exclusion of the `es_plataforma` client even when requested by `cliente_id`.
- [X] T018 [P] [US1] Write T6 generic-error tests in `backend/src/test/platform-panel.integration.test.js` for nonexistent and ineligible device codes without existence leakage.
- [X] T019 [P] [US1] Write last-reading tests in `backend/src/test/platform-panel.integration.test.js` proving the paginated-device query uses `LEFT JOIN LATERAL` semantics, applies the configurable 30-day window, returns `ultima_lectura = null` outside the window, and separates it from `ultima_conexion`.

### Implementation for User Story 1

- [X] T020 [P] [US1] Write seed tests in `backend/src/test/platform-panel-seed.test.js` proving the platform seed is idempotent, reuses the marked client/user on repeated runs, and never prints credentials, hashes, tokens, or secrets.
- [X] T021 [US1] Implement the idempotent local platform seed in `backend/scripts/seed-platform-admin.js`, locating the single `clientes.es_plataforma = true` row, creating or reusing the `platform_admin` user, and never exposing credentials in output; depends explicitly on T008 and T009.
- [X] T022 [P] [US1] Implement platform-only authorization middleware in `backend/src/middleware/platformAdmin.js` that validates `platform_admin` without depending on `extraerCliente` and never aliases the role to `admin`.
- [X] T023 [US1] Implement paginated global inventory queries in `backend/src/services/plataforma.service.js`, using the real `dispositivo_codigo` column, `LEFT JOIN dispositivos_fabrica ON device_id = codigo`, explicit `es_plataforma` exclusion, lifecycle derivation, whitelist mapping, and `LEFT JOIN LATERAL` only after pagination with `timestamp >= NOW() - (window_days * INTERVAL '1 day')`.
- [X] T024 [US1] Implement summary and client-list queries in `backend/src/services/plataforma.service.js`, excluding `es_plataforma` from clients, filters, totals, lifecycle counts, and firmware distributions.
- [X] T025 [US1] Implement validated platform routes in `backend/src/routes/plataforma.js` for `GET /api/plataforma/resumen`, `GET /api/plataforma/clientes`, and `GET /api/plataforma/dispositivos`, including 401/403 behavior, raw JWT header compatibility, read rate limiting, and the whitelist response contract.
- [X] T026 [US1] Mount `/api/plataforma` in `backend/src/app.js` with token verification and platform middleware only, preserving all existing tenant route middleware and isolation.
- [X] T027 [US1] Implement the platform panel page in `frontend/plataforma.html` and shared navigation visibility in `frontend/shared/app.js` and `frontend/shared/sidebar.html`, showing only `platform_admin`, operational clients, lifecycle/firmware fields, and “sin lectura reciente (últimos N días)” for null readings.

**Checkpoint**: US1 is independently usable and its T1, T2, T3, T4, T6, T7, and last-reading tests pass while the pre-existing baseline remains documented.

---

## Phase 4: User Story 2 - Restablecer credenciales desde el panel (Priority: P1)

**Goal**: Reset an enrolled device through the platform panel, preserve its tenant claim, and audit the action without exposing the global actor.

**Independent Test**: Confirm one reset, repeat it for `already_reset`, inspect the affected tenant audit, and verify no secrets or personal platform-admin data are visible.

### Tests for User Story 2 (write first and keep failing before implementation)

- [ ] T028 [P] [US2] Write T5 integration tests in `backend/src/test/platform-reset.integration.test.js` for 200 `reset`, 200 `already_reset`, preserved `reclamado_en`, and the `enrolled_at` transition.
- [ ] T029 [P] [US2] Write T8 authorization/error tests in `backend/src/test/platform-reset.integration.test.js` for missing, invalid, and wrong-role tokens, reset rate limit 10 per 15 minutes, body `cliente_id` rejection, and generic nonexistent-device errors.
- [ ] T030 [P] [US2] Write audit tests in `backend/src/test/platform-reset.integration.test.js` for `cliente_id` of the affected device, `actor_tipo = platform_admin`, service-level actor masking, tenant display `Administración de la plataforma`, absence of email/username/name/secrets, and the real client audit endpoint response.
- [ ] T031 [P] [US2] Write T9 frontend tests in `frontend/` for panel omission on non-`platform_admin` roles and mandatory reset confirmation before the POST.
- [ ] T032 [P] [US2] Write failure/compensation tests in `backend/src/test/platform-reset.integration.test.js` proving service delegation is HTTP-agnostic, does not read `req.clienteId`, and never returns success after Dynamic Security or persistence failure.

### Implementation for User Story 2

- [ ] T033 [P] [US2] Extend `backend/src/services/auditoria.service.js` with `actor_tipo NOT NULL DEFAULT 'tenant'` handling and service-level masking of platform actor fields before tenant responses.
- [ ] T034 [US2] Verify `backend/src/services/resetCredenciales.service.js` already receives explicit `{ deviceId, clienteId }` arguments; if so, leave it unchanged, otherwise make only that explicit-argument correction while preserving spec 016 behavior and avoiding any HTTP request object or `req.clienteId` dependency; must finish before T035.
- [ ] T035 [US2] Implement platform reset delegation and affected-client resolution in `backend/src/routes/plataforma.js`, record audit with `cliente_id` from the device and sanitized platform actor, and apply the independent reset limiter.
- [ ] T036 [US2] Add reset confirmation/result handling to `frontend/plataforma.html`, showing generic `reset`/`already_reset` outcomes and no broker, credential, hash, or persistence details.

**Checkpoint**: US2 is independently testable with idempotent reset, sanitized tenant audit, and isolated reset rate limiting.

---

## Phase 5: User Story 3 - Mantener aislamiento y acceso restringido (Priority: P1)

**Goal**: Ensure platform authorization never broadens tenant-admin permissions and all global responses remain safe.

**Independent Test**: Exercise every platform endpoint with no token, invalid token, `admin`, `comun`, and `platform_admin`, then inspect responses and existing tenant routes.

### Tests for User Story 3 (write first and keep failing before implementation)

- [ ] T037 [P] [US3] Write authorization regression tests in `backend/src/test/platform-authorization.integration.test.js` for 401 without/with invalid token, 403 for `admin`/`comun` on `/api/plataforma/...`, and allowed platform access with raw JWT.
- [ ] T038 [P] [US3] Write isolation regression tests in `backend/src/test/platform-authorization.integration.test.js` proving client A cannot see client B through existing or new routes and `platform_admin` cannot use tenant routes as `admin`.
- [ ] T039 [P] [US3] Write authorization-regression checks in `backend/src/test/platform-authorization.integration.test.js` and `frontend/` that only verify secret/hash fields do not appear in the frontend and that the panel remains omitted after authorization changes; do not duplicate T9.

### Implementation for User Story 3

- [ ] T040 [US3] Harden all platform response mappers and tenant audit serialization in `backend/src/services/plataforma.service.js` and `backend/src/services/auditoria.service.js` against secret/hash leakage.
- [ ] T041 [US3] Confirm `backend/src/routes/dispositivos.js`, `backend/src/middleware/rol.js`, and `backend/src/middleware/cliente.js` do not treat `platform_admin` as `admin`; make only tightly coupled authorization corrections required by the failing T2 tests, then run the complete backend suite immediately afterward and record any regression.
- [ ] T042 [US3] Add platform read/reset rate-limit configuration and in-memory counter documentation to `backend/src/middleware/rateLimiter.js` and the relevant project documentation, with separate read/reset counters and environment variables.

**Checkpoint**: US3 preserves tenant isolation and explicitly proves platform-only authorization.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Complete validation, documentation, and delivery evidence without changing unrelated behavior.

- [ ] T043 [P] Add focused unit coverage for configuration bounds, lifecycle derivation, whitelist mapping, LATERAL query parameters, and actor masking in `backend/src/test/platform-panel.unit.test.js`.
- [ ] T044 [P] Update `README.MD` or the relevant operational documentation with seed invocation, environment variables, raw JWT header convention, in-memory rate-limit limitation, and migration order.
- [ ] T045 Run the focused platform tests and then the broader backend suite from `backend/`; record the known baseline result of 266/299 (32 todo) separately from feature regressions and do not rewrite the pre-existing continuity failure.
- [ ] T046 Execute the final manual validation with a real ESP32 board that is not `ET-974XQNAHDYVX`, following [quickstart.md](./quickstart.md), and record panel listing, reset, re-enrollment, reading/connection timestamps, firmware, audit masking, and rate-limit observations.
- [ ] T047 Verify `git diff --check`, migration repeatability, no edits to migrations 014/015, no secrets in responses/logs/audit, and all task-level commits before delivery in `specs/018-panel-duenos-platform-admin/`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; T001–T003 can run in parallel.
- **Foundational (Phase 2)**: Depends on Setup; T004–T007 can run in parallel, then
  T008–T011 migrations, with T012 verifying their ordering and idempotence. T048
  must be written and observed failing before T049 implements the migration runner.
- **US1 (Phase 3)**: Depends on the foundational schema/configuration contracts and
  the test database migration delivery tasks T048–T049; T013 depends explicitly
  on T049 so its integration fixture cannot run before the runner is available.
  T013–T020 are tests and are written first; then T021–T027.
- **US2 (Phase 4)**: Depends on T022, T025, T026 and the existing spec 016 reset
  service; T028–T032 are tests-first and can be authored in parallel, then T033–T036.
- **US3 (Phase 5)**: Depends on the platform middleware/routes and T2; T037–T039
  can be authored in parallel, then T040–T042.
- **Polish (Phase 6)**: Depends on all desired stories and their checkpoints.

### User Story Dependencies

- **US1 (P1)**: Foundational phase only; MVP. T020 must fail before T021; T021 depends on T008 and T009.
- **US2 (P1)**: Depends on US1 routing/middleware and spec 016 service contract.
- **US3 (P1)**: Depends on US1 and US2 surfaces but validates their security boundary.

### Test-First Gate

For each story, the listed tests MUST be run and observed failing before the
corresponding implementation tasks begin. A test that passes before implementation
must be investigated for fixture leakage or an incomplete assertion.

### Commit Groups

- `T001–T007`: test/configuration scaffolding.
- `T008–T012`: numbered migrations and schema contracts.
- `T048–T049`: test database migration delivery and idempotence.
- `T013–T019`: US1 failing tests.
- `T020`: US1 seed tests.
- `T021–T027`: US1 implementation.
- `T028–T032`: US2 failing tests.
- `T033–T036`: US2 implementation.
- `T037–T039`: US3 failing tests.
- `T040–T042`: US3 implementation and rate-limit documentation.
- `T043–T047`: polish, validation, and manual evidence.

Each group is a coherent commit boundary; no code or commit is created by this
task-generation step.

### Parallel Opportunities

- T001–T003 are independent setup work.
- T004–T007 and T012 can be split by file only after avoiding concurrent edits to
  the same test file.
- T013–T019, T020, T028–T032, and T037–T039 are independent test-writing batches.
- T022 and T023–T024 can proceed after their shared contracts are stable; T023
  and T024 edit the same `plataforma.service.js` file and therefore run in
  sequence, not in parallel; route mounting waits for both.
- T033 can proceed in parallel with T034; T034 verifies the spec 016 service and
  must finish before T035.
- T048 precedes T049; both affect test database initialization and are sequential.
- T013 depends on T049 and must remain after the explicit runner is available.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete T001–T012, then write and implement T048–T049.
2. Write and observe failing T013–T020.
3. Implement T021–T027.
4. Run the US1 checkpoint and verify the pre-existing 266/299 baseline separately.
5. Stop for an MVP review before starting reset behavior.

### Incremental Delivery

1. Add US2 reset delegation, audit masking, and independent reset limiter.
2. Add US3 authorization and isolation regression coverage.
3. Run polish, documentation, full suite, and manual validation with a board other
   than ET-974XQNAHDYVX.

### Notes

- Every task uses the required `- [ ] T###` checklist format.
- `[P]` appears only where the task can proceed independently without incomplete
  prerequisites.
- All user-story tasks carry `[US1]`, `[US2]`, or `[US3]`.
- T048–T049 are foundational infrastructure tasks and intentionally have no
  user-story tag.
- No code, migration, or commit is created by this generation step.
