# Tasks: Aislar Eventos en Tiempo Real por Cliente

**Input**: Design documents from `/specs/001-aislar-eventos-cliente/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [realtime-events.md](contracts/realtime-events.md), [quickstart.md](quickstart.md)

**Tests**: Incluidos porque la spec exige cobertura de integración con `socket.io-client` y un comando ejecutable.

**Organization**: Las tareas están agrupadas por historia de usuario y siguen la Implementation Sequence del plan.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Configurar dependencias y un comando reproducible de pruebas sin modificar el contrato de producción.

- [x] T001 Configure `socket.io-client` como dependencia de desarrollo y agregue el script `test`: `node --test src/test/*.test.js` en `backend/package.json` y `backend/package-lock.json`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Preparar la validación de sesión, el registro de sockets y el fixture reproducible que necesitan todas las historias.

- [x] T002 Extraiga una función reutilizable de validación de sesión desde `backend/src/middleware/auth.js` que verifique firma, `exp` y `tv` contra `usuarios.token_version`, manteniendo sin cambios las respuestas HTTP existentes.
- [x] T003 Cree en `backend/src/realtime/socketRegistry.js` únicamente la estructura del registro: nombres de rooms derivados de `clienteId` y `sub`, índice de sockets por usuario, y operaciones básicas de registro/desregistro; no agregue todavía timers de `exp` ni `disconnectUserSockets`.
- [x] T004 Configure `io.use()` y los hooks `connection`/`disconnect` en `backend/index.js` para rechazar handshake sin token, inválido o vencido, unir el socket a las rooms derivadas del token validado y conservar exactamente la configuración CORS actual.
- [x] T005 Cree el fixture de integración en `backend/src/test/realtime.test-support.js`: levante el servidor Socket.IO en un puerto de prueba y exponga cierre/limpieza, firme tokens con un `JWT_SECRET` exclusivo de test, use una base PostgreSQL de prueba aislada (no mocks) con usuarios que tengan `token_version`, dispositivos de al menos dos clientes y un dispositivo con `cliente_id = NULL`, y defina la invocación directa de la función de procesamiento de `backend/src/mqtt/client.js` con `topic` y payload sin conectar un broker real.

**Checkpoint**: La autenticación del handshake, la pertenencia a rooms y el fixture reproducible están disponibles para las historias de usuario.

---

## Phase 3: User Story 1 - Recibir eventos del propio cliente (Priority: P1) 🎯 MVP

**Goal**: Entregar `lectura` y `alerta` únicamente a usuarios autenticados del cliente dueño del dispositivo, compartiendo los eventos entre usuarios del mismo cliente y omitiéndolos para dispositivos sin cliente.

**Independent Test**: Con dos clientes conectados, publicar/generar eventos para cada dispositivo y comprobar que cada cliente recibe solo lo suyo; conectar dos usuarios del mismo cliente y comprobar que reciben el mismo evento; probar un dispositivo con `cliente_id = NULL` y comprobar que nadie recibe eventos.

### Tests for User Story 1

- [x] T006 [US1] Agregue en `backend/src/test/realtime.integration.test.js`, usando el fixture T005 y `socket.io-client`, pruebas para dos clientes simultáneos: una lectura de cliente A llega solo a A y una de cliente B llega solo a B.
- [x] T007 [US1] Agregue en `backend/src/test/realtime.integration.test.js`, usando el fixture T005, una prueba con dos usuarios del mismo cliente que reciben el mismo evento `alerta`, conservando nombre y payload existentes.
- [x] T008 [US1] Agregue en `backend/src/test/realtime.integration.test.js`, usando el fixture T005, una prueba de dispositivo sin cliente asignado que confirma que no se emiten `lectura` ni `alerta` a ningún socket.

### Implementation for User Story 1

- [x] T009 [US1] Añada en `backend/src/services/dispositivos.service.js` una consulta de ownership por `codigo` que devuelva `cliente_id`, incluyendo el caso `NULL` sin inferir un cliente.
- [x] T010 [US1] Exponga en `backend/src/mqtt/client.js` una función de procesamiento invocable por el fixture y reemplace ambos `io.emit` por emisiones a la room del `cliente_id` dueño del dispositivo, omitiendo toda emisión cuando el ownership sea `NULL` y sin cambiar ingesta MQTT, nombres ni payloads.

**Checkpoint**: US1 entrega eventos aislados y permite validar el MVP con `npm test` desde `backend/`.

---

## Phase 4: User Story 2 - Rechazar conexiones no autenticadas (Priority: P1)

**Goal**: Rechazar autenticación en el handshake, desconectar sesiones invalidadas, limpiar timers y evitar bucles de reconexión del dashboard.

**Independent Test**: Intentar conexiones sin token, con token inválido y vencido; comprobar rechazo durante handshake; vencer un token y cambiar contraseña o eliminar el usuario; comprobar desconexión y ausencia de eventos posteriores; verificar limpieza del timer y redirección al login sin reconexión infinita.

### Tests for User Story 2

- [ ] T011 [US2] Agregue en `backend/src/test/realtime.integration.test.js`, usando T005 y `socket.io-client`, pruebas para handshake sin token, token inválido y token vencido, verificando error de autenticación y cero eventos recibidos.
- [ ] T012 [US2] Agregue en `backend/src/test/realtime.integration.test.js`, usando T005, pruebas con `exp` controlado para desconexión al vencimiento, cambio de contraseña y eliminación del usuario, además de verificar que el timer queda limpio al desconectar antes del vencimiento y que no llegan eventos posteriores.
- [ ] T013 [US2] Extraiga el clasificador puro de errores de autenticación a `frontend/shared/socket-auth.js` y cree `backend/src/test/frontend.socket-auth.test.js` para verificar `connect_error` de autenticación y `disconnect` con motivo `io server disconnect`; el test debe ejecutarse con el glob `node --test src/test/*.test.js` de `backend/package.json`.

### Implementation for User Story 2

- [ ] T014 [US2] Complete en `backend/src/realtime/socketRegistry.js` los temporizadores de `exp`, el borrado del timer en `disconnect` y `disconnectUserSockets(userId)` para desconectar todas las sesiones indexadas por usuario.
- [ ] T015 [US2] Invoque `disconnectUserSockets(userId)` después de invalidar `token_version` en `backend/src/services/auth.service.js` y después de eliminar usuarios en `backend/src/services/usuarios.service.js`, sin cambiar sus contratos HTTP; conecte el mismo hook a cualquier operación existente de desactivación sin agregar una migración de usuario fuera de alcance.
- [ ] T016 [US2] Integre la función de `frontend/shared/socket-auth.js` en `frontend/shared/app.js` y cargue el helper antes de `app.js` en las páginas frontend correspondientes para que solo ante un `connect_error` de autenticación o `disconnect` con motivo exacto `io server disconnect` se desactive `socket.io` reconnection, se cierre la sesión local y se redirija al login, manteniendo intactos `lectura`, `alerta` y el resto del dashboard.

**Checkpoint**: US2 rechaza handshakes no autenticados, invalida sockets activos, limpia timers y evita reconexiones en bucle.

---

## Phase 5: User Story 3 - Determinar el cliente desde la sesión (Priority: P1)

**Goal**: Garantizar que el cliente de una conexión provenga exclusivamente del JWT validado y que ningún dato enviado por el navegador pueda cambiar su aislamiento.

**Independent Test**: Con un token del cliente A, intentar enviar un `clienteId` del cliente B en los datos de conexión y comprobar que el socket solo recibe eventos del cliente A.

### Tests for User Story 3

- [ ] T017 [US3] Agregue en `backend/src/test/realtime.integration.test.js`, usando T005 y `socket.io-client`, una prueba con token del cliente A y `auth`/datos adicionales que intenten seleccionar cliente B, verificando que solo se reciben eventos de A.

### Verification for User Story 3

- [ ] T018 [US3] Verifique junto con T017 en `backend/index.js` y `backend/src/realtime/socketRegistry.js` que ninguna room se calcula desde datos enviados por el navegador y que las rooms observadas por la prueba salen únicamente de `clienteId` y `sub` devueltos por la validación JWT; no agregue una segunda implementación de rooms.

**Checkpoint**: Las tres historias pasan juntas sin compartir eventos entre clientes ni aceptar ownership desde el navegador.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Ejecutar la validación completa y documentar únicamente el comportamiento que quedó implementado.

- [ ] T019 Run `npm test` from `backend/` and fix any regressions in `backend/src/test/usuarios.service.test.js`, `backend/src/test/realtime.integration.test.js`, or `backend/src/test/frontend.socket-auth.test.js` before documentation is updated.
- [ ] T020 Validate the end-to-end scenarios in `specs/001-aislar-eventos-cliente/quickstart.md`, including concurrent clients, handshake rejection, expiry, password change, deletion, unassigned devices, and timer cleanup; do not modify `docs/requisitos.md`.
- [ ] T021 After T019 and T020 pass, update only `README.md` with the implemented behavior: Socket.IO requires the session token in `auth.token`; `lectura` and `alerta` reach only users of the device owner's client; missing, invalid, or expired tokens are rejected during handshake; the server disconnects sockets on token expiry, password change, or user deletion; and add a link to `specs/001-aislar-eventos-cliente/contracts/realtime-events.md`. Document no behavior that is not implemented and do not modify `docs/requisitos.md`.

**Final checkpoint**: All requested tests pass, the quickstart scenarios pass, and README reflects only the shipped behavior. T021 is the final task.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 is first and enables the test command and Socket.IO client.
- **Foundational (Phase 2)**: T002-T005 depend on T001 and block all user stories.
- **User Story 1 (Phase 3)**: T006-T010 depend on T002-T005; tests T006-T008 are written before T009-T010.
- **User Story 2 (Phase 4)**: T011-T016 depend on the foundational phase and integrate with US1's rooms; tests precede implementation.
- **User Story 3 (Phase 5)**: T017-T018 depend on the validated handshake and room implementation from earlier phases.
- **Polish (Phase 6)**: T019-T021 depend on all user-story tasks; T021 depends explicitly on passing T019 and T020.

### User Story Dependencies

- **US1 (P1)**: Depends on Foundational; delivers the MVP event isolation path.
- **US2 (P1)**: Depends on Foundational and the live server wiring from US1 to test full lifecycle behavior.
- **US3 (P1)**: Depends on Foundational and US1 room routing; verifies token-derived tenant selection.

### Parallel Opportunities

- T006, T007, and T008 may be prepared in parallel conceptually, but they all edit `backend/src/test/realtime.integration.test.js` and must be merged sequentially to avoid conflicts.
- T011 and T012 edit the same integration test file and must be merged sequentially; T013 edits a separate test file and can be prepared in parallel after the fixture contract is stable.
- T009 and T014 touch different modules and can be implemented in parallel after their preceding tests, while T010 depends on T009.
- T017 shares `backend/src/test/realtime.integration.test.js` with earlier tests and must be merged sequentially; T018 is verification work paired with T017.

---

## Implementation Strategy

### MVP First (User Story 1)

1. Complete T001-T005.
2. Write T006-T008 and implement T009-T010.
3. Run `npm test` from `backend/` and validate the client-isolation MVP.

### Incremental Delivery

1. Complete US1 for tenant-scoped event delivery.
2. Complete US2 for handshake rejection, invalidation, expiry cleanup, and frontend login recovery.
3. Complete US3 for resistance to browser-supplied client identifiers.
4. Run T019 and T020 before the final documentation task T021.

### Traceability

- **US1**: FR-003, FR-004, FR-005, FR-007; SC-001, SC-003, SC-004.
- **US2**: FR-001, FR-006, FR-009, FR-010; SC-002, SC-005.
- **US3**: FR-002; SC-001, SC-004.
- **T021**: FR-008 and the explicit README/documentation constraint from the user request.

## Notes

- Every task uses the required checkbox, sequential ID, optional `[P]` marker, story label where applicable, and concrete file path.
- No task modifies `docs/requisitos.md`.
- `README.md` is intentionally the final task and must not be updated before implementation and tests pass.
