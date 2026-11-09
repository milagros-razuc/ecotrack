---
description: "Tareas de implementación para alta de cliente y administrador inicial"
---

# Tasks: Alta de cliente y administrador inicial

**Input**: Design documents from `specs/021-alta-cliente-admin/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`

**Testing**: TDD requerido; escribir y ejecutar primero pruebas contra PostgreSQL
real cuando corresponda, con `skip` únicamente si falta `TEST_DATABASE_URL`.

## Phase 1: Setup

**Purpose**: Preparar contratos, configuración y numeración de migraciones.

- [ ] T001 Revisar `specs/021-alta-cliente-admin/contracts/platform-client-admin.md` y convertir endpoints, códigos de error, lista blanca y restricciones de primer login en casos de prueba de `backend/src/test/platform-client-admin.integration.test.js`.
- [ ] T002 [P] Añadir únicamente la configuración de `rateLimits.clientAdmin` en `backend/src/config/platformPanelConfig.js`: máximo 5, ventana de 15 minutos, `counterKey: 'platform-client-admin'`, validación al arranque y contador por usuario; no montar todavía el limiter en rutas.
- [ ] T003 [P] Verificar en `backend/migrations/` y `backend/src/test/platform-panel-schema.test.js` que 019 es la última migración aplicada y reservar 020 para esta feature, sin renumerar migraciones existentes.
- [ ] T004 [P] Verificar en `backend/migrations/018_audit_actor.sql`, `backend/src/services/auditoria.service.js` y las consultas de auditoría los valores permitidos de `actor_tipo`; documentar en `specs/021-alta-cliente-admin/research.md` la decisión compatible antes de añadir constraints o nuevos valores.

---

## Phase 2: Foundational

**Purpose**: Crear la base de datos, autenticación restringida y utilidades compartidas.

- [ ] T005 Escribir primero en `backend/src/test/platform-client-admin.integration.test.js` una prueba PostgreSQL de la migración 020 que verifique el marcador de cambio obligatorio `NOT NULL DEFAULT false`, los índices únicos sobre `lower(clientes.nombre)` y `lower(usuarios.username)`, y la detección de colisiones históricas; confirmar el fallo antes de implementar.
- [ ] T006 Implementar `backend/migrations/020_client_admin.sql` como migración idempotente posterior a 019: resolver o rechazar duplicados por `lower()` antes de crear índices, agregar el marcador `NOT NULL DEFAULT false` y aplicar solo los valores de `actor_tipo` verificados en T004.
- [ ] T007 Escribir primero pruebas en `backend/src/test/auth.test.js` para login con cambio obligatorio, bloqueo server-side, limpieza del marcador y rechazo de reutilización de la contraseña temporal como contraseña nueva; confirmar los fallos correctos antes de implementar.
- [ ] T008 Implementar el estado persistido y el flujo de `backend/src/services/auth.service.js`, `backend/src/middleware/auth.js` y `backend/src/routes/auth.js`: permitir solo login, me mínima y change-password, consultar la base, incrementar `token_version` y rechazar la nueva contraseña igual a la temporal.
- [ ] T009 [P] Escribir primero pruebas unitarias en `backend/src/test/platform-client-admin.test.js` para trim, username en minúsculas, reservados y contraseña CSPRNG de mínimo 16 caracteres sin `0`, `O`, `1`, `I` ni `l`; confirmar que fallan antes de implementar.
- [ ] T010 [P] Implementar normalización, reservados y generación de contraseña temporal en `backend/src/services/plataforma.service.js` o módulo compartido existente, reutilizando bcrypt y sin registrar el secreto.

**Checkpoint**: La migración 020, el primer-login restringido y las utilidades comunes
están disponibles para las historias.

---

## Phase 3: User Story 1 - Crear cliente y administrador inicial (Priority: P1) 🎯 MVP

**Goal**: Crear cliente y admin en una sola transacción y mostrar la contraseña
temporal una sola vez.

**Independent Test**: Un `platform_admin` crea un cliente en PostgreSQL real y se
verifican cliente, usuario admin, auditoría de plataforma, hash bcrypt y respuesta
de lista blanca.

### Tests for User Story 1 (TDD)

- [ ] T011 [P] [US1] Escribir primero el test de contrato en `backend/src/test/platform-client-admin.integration.test.js` para `POST /api/plataforma/clientes`, JWT crudo, payload `{ nombre_cliente, username, nombre_admin, motivo }`, 201, username normalizado y lista blanca; confirmar el fallo antes de implementar.
- [ ] T012 [P] [US1] Escribir primero el test PostgreSQL en `backend/src/test/platform-client-admin.integration.test.js` que cuente clientes, usuarios y auditoría, verifique `rol = 'admin'`, hash bcrypt y ausencia de contraseña en persistencia.
- [ ] T013 [P] [US1] Escribir primero el test de login en `backend/src/test/platform-client-admin.integration.test.js` con username normalizado, sesión restringida, bloqueo operativo, change-password, incremento de `token_version` e invalidación de la sesión anterior.
- [ ] T014 [P] [US1] Escribir primero el test frontend en `backend/src/test/platform-client-admin.test.js` para modal, `textContent`, copiar, ausencia de descarga y limpieza de secreto del DOM y variables.

### Implementation for User Story 1

- [ ] T015 Implementar el schema estricto de `POST /api/plataforma/clientes` en `backend/src/schemas.js`, aceptando solo `nombre_cliente`, `username`, `nombre_admin` y `motivo`, con trim, límites cliente 1-100, username 3-50 y motivo 3-200.
- [ ] T016 Implementar el servicio transaccional en `backend/src/services/plataforma.service.js`, generando y hasheando la contraseña, insertando cliente y admin, y devolviendo solo el contrato.
- [ ] T017 Integrar auditoría fail-closed en `backend/src/services/auditoria.service.js` y `backend/src/services/plataforma.service.js`, usando el `cliente_id` especial de plataforma y el `actor_tipo` permitido verificado en T004, sin contraseña ni hash.
- [ ] T018 Montar `POST /api/plataforma/clientes` en `backend/src/routes/plataforma.js` con autorización `platform_admin`, respuesta `Cache-Control: no-store`, errores sanitizados y el schema estricto.
- [ ] T019 Montar el limiter ya configurado en T002 para ambas rutas en `backend/src/routes/plataforma.js`; no redefinir máximos, ventana ni `counterKey` aquí.
- [ ] T020 Implementar el modal en `frontend/plataforma.html` con `textContent`, copiar contraseña, advertencia de entrega única y limpieza al cerrar, sin descarga.
- [ ] T021 Ejecutar T011-T014 y verificar US1 contra PostgreSQL real; usar `skip` solo cuando falte `TEST_DATABASE_URL`.

---

## Phase 4: User Story 2 - Rechazar solicitudes no autorizadas o inválidas (Priority: P1)

**Goal**: Rechazar roles, payloads, reservados y conflictos sin filas parciales.

**Independent Test**: La app real devuelve 401/403/400 y códigos de conflicto estables,
sin exponer constraints ni modificar la base.

### Tests for User Story 2 (TDD)

- [ ] T022 [P] [US2] Escribir primero en `backend/src/test/platform-client-admin.integration.test.js` el test contra la app real para 401 sin token, 403 con `admin` y `operario1`, y 400 por campos extra, verificando conteos intactos.
- [ ] T023 [P] [US2] Escribir primero el test de validación en `backend/src/test/platform-client-admin.integration.test.js` para espacios, longitudes, motivo inválido y campos `cliente_id`, `rol` o `password`.
- [ ] T024 [P] [US2] Escribir primero el test de conflictos en `backend/src/test/platform-client-admin.integration.test.js` para `Acme`/`acme`, `Admin`/`admin`, reservados `platform_admin`, `plataforma`, `root`, y cliente `plataforma`.

### Implementation for User Story 2

- [ ] T025 Implementar validación y normalización compartida en `backend/src/schemas.js` y `backend/src/services/plataforma.service.js`, manteniendo las reglas de caracteres existentes.
- [ ] T026 Mapear 23505 y reservados a `CLIENT_NAME_TAKEN` y `USERNAME_TAKEN` en `backend/src/routes/plataforma.js`, sin exponer constraints o mensajes PostgreSQL.
- [ ] T027 Ejecutar T022-T024 contra la app real y preservar las pruebas de autorización existentes en `backend/src/test/platform-panel.integration.test.js`.

---

## Phase 5: User Story 3 - Seguridad, trazabilidad y operación controlada (Priority: P1)

**Goal**: Garantizar atomicidad, auditoría fail-closed, rate limit aislado y ausencia
de secretos en todas las superficies.

**Independent Test**: Fallos inducidos revierten todo, el sexto pedido devuelve 429 y
no aparece la contraseña en respuestas, GET, logs o auditoría.

### Tests for User Story 3 (TDD)

- [ ] T028 [P] [US3] Escribir primero el test de atomicidad real en `backend/src/test/platform-client-admin.integration.test.js` con fallo inducido en el usuario, contando `clientes`, `usuarios` y `auditoria` antes/después y confirmando cero filas nuevas.
- [ ] T029 [P] [US3] Escribir primero el test fail-closed real en `backend/src/test/platform-client-admin.integration.test.js` con fallo inducido en auditoría, sin mockear pool, transacción ni auditoría.
- [ ] T030 [P] [US3] Escribir primero el test de rate limit en `backend/src/test/platform-client-admin.integration.test.js`: limiter sin opciones, cinco respuestas 200, sexta 429, `max = 5`, ventana 15 minutos y contador independiente por `req.usuario.sub`.
- [ ] T031 [P] [US3] Escribir primero el test de no filtración en `backend/src/test/platform-client-admin.integration.test.js`, capturando `console.log/error/warn` y revisando respuesta, GET, auditoría y errores.

### Implementation for User Story 3

- [ ] T032 Implementar rollback completo y propagación genérica de errores en `backend/src/services/plataforma.service.js`, sin cambiar el fail-closed de auditoría.
- [ ] T033 Implementar la lista blanca, `Cache-Control: no-store` y sanitización de logs en `backend/src/routes/plataforma.js` y `backend/src/services/plataforma.service.js`; no duplicar la configuración del limiter de T002.
- [ ] T034 Ejecutar T028-T031 contra la base temporal real y el test frontend, con `skip` explícito solo por ausencia de `TEST_DATABASE_URL`.

---

## Phase 6: User Story 4 - Crear admin para cliente existente (Priority: P2)

**Goal**: Crear el primer admin de un cliente existente sin duplicarlo ni permitir
dos altas concurrentes.

**Independent Test**: Un cliente sin admin recibe uno; un cliente inexistente, ya
administrado o concurrentemente reclamado produce un error estable sin filas parciales.

### Tests for User Story 4 (TDD)

- [ ] T035 [P] [US4] Escribir primero el test de contrato en `backend/src/test/platform-client-admin.integration.test.js` para `POST /api/plataforma/clientes/:id/admin`, payload estricto `{ username, nombre_admin, motivo }`, id solo en ruta y username normalizado.
- [ ] T036 [P] [US4] Escribir primero el test PostgreSQL para cliente sin admin, con admin, inexistente y `cliente_id` en body, verificando asociación y cero filas parciales.
- [ ] T037 [P] [US4] Escribir primero el test de concurrencia en `backend/src/test/platform-client-admin.integration.test.js` con dos altas simultáneas de admin para el mismo cliente; una sola debe ganar y la otra recibir conflicto por `23505` mapeado.

### Implementation for User Story 4

- [ ] T038 Implementar schema y servicio de `POST /api/plataforma/clientes/:id/admin` en `backend/src/schemas.js` y `backend/src/services/plataforma.service.js`, tomando el id solo de `req.params.id`, bloqueando el cliente con `SELECT ... FOR UPDATE` y reutilizando password, auditoría y normalización.
- [ ] T039 Montar la ruta en `backend/src/routes/plataforma.js` con autorización, limiter de T002, lista blanca y errores sanitizados; no duplicar la implementación del limiter.
- [ ] T040 Ejecutar T035-T037 y la regresión de las historias anteriores, verificando que el cliente no se duplica.

---

## Phase 7: Backend mutation validation

**Purpose**: Demostrar que cada garantía crítica depende de una aserción concreta.
Para cada tarea, aplicar una sola mutación en el archivo productivo indicado,
confirmar el cambio con `git --no-pager diff`, ejecutar el test dirigido, mostrar
que falla por la razón correcta y restaurar inmediatamente con `git checkout --
<archivo>` antes de continuar. No combinar mutaciones.

- [ ] T041 [US1] Mutar el rollback de `backend/src/services/plataforma.service.js`, confirmar diff, ejecutar el test de atomicidad, mostrar fallo por filas residuales y restaurar con `git checkout -- backend/src/services/plataforma.service.js`.
- [ ] T042 [US3] Mutar la propagación fail-closed de `backend/src/services/auditoria.service.js`, confirmar diff, ejecutar el test de auditoría, mostrar fallo por alta sin auditoría y restaurar con `git checkout -- backend/src/services/auditoria.service.js`.
- [ ] T043 [US3] Mutar la clave `counterKey` del limiter en `backend/src/config/platformPanelConfig.js`, confirmar diff, ejecutar el test de aislamiento del rate limit, mostrar fallo por contador compartido y restaurar con `git checkout -- backend/src/config/platformPanelConfig.js`.
- [ ] T044 [US3] Mutar la exclusión de secretos de la auditoría en `backend/src/services/plataforma.service.js`, confirmar diff, ejecutar el test de secretos, mostrar fallo por hash/token en `detalle` y restaurar con `git checkout -- backend/src/services/plataforma.service.js`.
- [ ] T045 [US3] Mutar la exclusión de secretos de logs en `backend/src/routes/plataforma.js`, confirmar diff, ejecutar el test de captura de `console.*`, mostrar fallo por secreto registrado y restaurar con `git checkout -- backend/src/routes/plataforma.js`.
- [ ] T046 [US2] Mutar la autorización `platform_admin` de ambas rutas en `backend/src/routes/plataforma.js`, confirmar diff, ejecutar 401/403 contra la app real, mostrar fallo para rol no permitido y restaurar con `git checkout -- backend/src/routes/plataforma.js`.
- [ ] T047 [US1] Mutar el bloqueo server-side del cambio obligatorio en `backend/src/middleware/auth.js`, confirmar diff, ejecutar el recorrido de rutas pendientes, mostrar acceso operativo indebido y restaurar con `git checkout -- backend/src/middleware/auth.js`.
- [ ] T048 [US4] Mutar `FOR UPDATE` del alta de admin en `backend/src/services/plataforma.service.js`, confirmar diff, ejecutar concurrencia, mostrar dos altas aceptadas o condición de carrera y restaurar con `git checkout -- backend/src/services/plataforma.service.js`.

---

## Phase 8: Cross-surface authentication and concurrency

- [ ] T049 [P] Escribir y ejecutar en `backend/src/test/auth-pending-routes.integration.test.js` un test que recorra todas las rutas HTTP autenticadas y espere 403 con código estable para un usuario pendiente, excepto login, me y change-password; incluir una conexión Socket.IO autenticada y verificar el mismo bloqueo.
- [ ] T050 [P] Escribir y ejecutar en `backend/src/test/platform-client-admin.integration.test.js` dos altas simultáneas del mismo nombre y username; verificar una sola creación, un código estable de conflicto, mapeo de `23505` y cero filas parciales.
- [ ] T051 [P] Añadir a `backend/src/test/platform-client-admin.integration.test.js` el test de migración que consulte `information_schema`/`pg_attribute` y compruebe explícitamente `NOT NULL` y `DEFAULT false` del marcador.

---

## Phase 9: Deployment and Polish

- [ ] T052 [P] Documentar en `specs/021-alta-cliente-admin/quickstart.md` el despliegue: backup previo, consultas para detectar duplicados por `lower(clientes.nombre)` y `lower(usuarios.username)`, resolución aprobada y ejecución de la migración 020.
- [ ] T053 [P] Actualizar `README.md` y `specs/021-alta-cliente-admin/contracts/platform-client-admin.md` con endpoints, cambio obligatorio, conflictos y procedimiento de migración.
- [ ] T054 [P] Revisar `backend/src/test/usuarios.test.js`, `backend/src/test/auth.test.js`, tests del panel y scripts de provisión para asegurar regresión sin fugas.
- [ ] T055 Ejecutar la suite completa en una ventana limpia con `TEST_DATABASE_URL`, exigir exactamente 0 skipped y 0 fallos en los 32 tests de Feature 021, y ejecutar además la regresión específica de tests con mayúsculas (`Acme`/`acme` y `Admin`/`admin`).
- [ ] T056 Ejecutar `git diff --check`, verificar migraciones repetibles, lista de archivos y ausencia de secretos en código, logs de prueba y documentación.

---

## Dependencies & Execution Order

### Phase Dependencies

- Setup no depende de otras fases.
- Foundational depende de Setup y bloquea todas las historias.
- US1 depende de Foundational y es el MVP.
- US2 depende de US1 para la ruta base.
- US3 depende de US1 y US2.
- US4 depende de US1 para reutilizar servicio/auditoría, y su concurrencia requiere
  `FOR UPDATE`.
- Mutation validation depende de los tests y de la implementación de la garantía
  que muta; cada mutación es independiente y debe restaurarse antes de la siguiente.
- Cross-surface y Polish dependen de las historias implementadas.

### Parallel Opportunities

- T002-T004 en Setup.
- T005, T007 y T009 en Foundational.
- T011-T014, T022-T024, T028-T031 y T035-T037 en sus respectivas fases.
- T049-T051 después de las implementaciones correspondientes.
- T052-T054 en Polish.

## Implementation Strategy

### MVP First

1. Completar Setup y Foundational.
2. Escribir T011-T014 y confirmar fallos.
3. Implementar T015-T020.
4. Ejecutar T021 y el flujo completo de US1.

### Incremental Delivery

1. Añadir US2 y conflictos case-insensitive.
2. Añadir US3, seguridad y rate limit.
3. Añadir US4 con `FOR UPDATE` y concurrencia.
4. Ejecutar mutaciones, Socket.IO, suite completa y despliegue.
