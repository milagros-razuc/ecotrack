---
description: "Tareas de implementación para endurecer el backend en producción"
---

# Tasks: Endurecer backend para producción

**Input**: Design documents from `/specs/002-endurecer-backend-produccion/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/cors-and-compatibility.md`, `quickstart.md`

**Organization**: Las tareas están agrupadas por historia de usuario para permitir implementación y validación independiente.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Preparar dependencias y configuración documentada sin introducir credenciales reales.

- [X] T001 [P] Agregar `helmet` como dependencia de producción y actualizar el lockfile en `backend/package.json` y `backend/package-lock.json`
- [X] T002 [P] Documentar `NODE_ENV`, `ADMIN_PASS` y `CORS_ORIGIN` con placeholders seguros en `backend/.env.example`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: No se requieren cambios fundacionales adicionales; la estructura CommonJS, el fixture de PostgreSQL y la suite `node:test` existentes son suficientes para implementar las historias.

---

## Phase 3: User Story 1 - Arranque seguro según el entorno (Priority: P1) 🎯 MVP

**Goal**: Impedir el arranque inseguro en producción y conservar el comportamiento de desarrollo con una advertencia visible.

**Independent Test**: En una base temporal `hardening_*`, verificar con procesos hijos que producción sin `ADMIN_PASS` falla cuando no hay usuarios, que producción no crea usuarios de prueba, que producción con usuarios existentes arranca sin `ADMIN_PASS` y que desarrollo conserva defaults y advierte.

### Tests for User Story 1

- [X] T003 [US1] Añadir el grupo de tests de arranque para producción, desarrollo, `ADMIN_PASS` ausente/vacío, base con usuarios y ausencia de usuario de prueba en `backend/src/test/hardening.integration.test.js`. Leer primero `backend/src/config/db.js` para ver qué variables usa (`DB_HOST` y las demás). El test debe: (a) descomponer `TEST_DATABASE_URL`, crear una base temporal `hardening_<timestamp>` y eliminarla al terminar; (b) lanzar `migrate.js` en un proceso hijo (`child_process`) pasándole por variables de entorno `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` y `DB_NAME` (o los nombres que use `db.js`) apuntando a la base temporal, junto con `NODE_ENV` y `ADMIN_PASS` según el caso; (c) verificar, antes de ejecutar nada, que el nombre de la base empieza con `hardening_` o termina en `_test`, y abortar sin tocar la base si no. El hijo nunca debe heredar `DB_NAME` ni `DB_HOST` del `.env` de desarrollo.

### Implementation for User Story 1

- [X] T004 [US1] Actualizar la inicialización de usuarios en `backend/src/config/migrate.js` para exigir `ADMIN_PASS` solo al crear el administrador inicial en producción (base sin usuarios), lanzar `Error` sin `process.exit`, conservar defaults de desarrollo con una advertencia en consola, y evitar usuarios de prueba en producción

**Checkpoint**: La política de arranque puede validarse sin ejecutar las historias de integridad o CORS.

---

## Phase 4: User Story 2 - Datos y migraciones consistentes (Priority: P1)

**Goal**: Hacer repetibles las migraciones y aplicar los dominios válidos de roles, estados y la relación de alertas en PostgreSQL.

**Independent Test**: Ejecutar `migrate.js` dos veces y comprobar que ambas ejecuciones terminan correctamente; verificar que PostgreSQL rechaza roles distintos de `admin`/`comun` y estados distintos de `pendiente`/`atendida`, sin perder registros válidos.

### Tests for User Story 2

- [X] T005 [US2] Añadir el grupo de tests de migración/CHECK para repetición, rechazo de `usuarios.rol`, rechazo de `alertas.estado` e idempotencia de `fk_alertas_dispositivo` en `backend/src/test/hardening.integration.test.js`, usando la misma base temporal `hardening_*` de T003 (nunca la base compartida)

### Implementation for User Story 2

- [X] T006 [US2] Actualizar `backend/src/config/migrate.js` para crear de forma idempotente (bloque `DO $$` que consulte `pg_constraint`) los CHECK de `usuarios.rol` y `alertas.estado` y la FK `fk_alertas_dispositivo`, sin duplicar restricciones ni alterar valores válidos

**Checkpoint**: La migración es repetible y la base protege los dominios de datos directamente.

---

## Phase 5: User Story 3 - Protección de solicitudes y conexiones (Priority: P1)

**Goal**: Aplicar Helmet y una única lista normalizada de orígenes a REST y Socket.io, preservando endpoints, payloads y eventos.

**Independent Test**: Con `CORS_ORIGIN` explícito, verificar CORS REST y Socket.io para orígenes permitidos y no permitidos; sin configuración, verificar `http://localhost:8080`; comprobar cabeceras Helmet y regresión de contratos existentes.

### Tests for User Story 3

- [X] T007 [US3] Añadir el grupo de tests de CORS para normalización, espacios, duplicados, valor por defecto, REST y Socket.io (enviando el encabezado `Origin` con `extraHeaders` de `socket.io-client`) en `backend/src/test/hardening.integration.test.js`
- [X] T008 [US3] Añadir el grupo de tests de Helmet para `X-Content-Type-Options` y preservación de endpoints, payloads y eventos en `backend/src/test/hardening.integration.test.js` y `backend/src/test/realtime.test-support.js` solo si el ajuste del soporte existente es necesario

### Implementation for User Story 3

- [X] T009 [US3] Crear la función compartida de normalización de `CORS_ORIGIN` en `backend/src/config/cors.js`: separa por comas, elimina espacios y duplicados, usa `http://localhost:8080` si la variable está ausente o vacía, y lanza un `Error` descriptivo si algún valor es un comodín (`*`)
- [X] T010 [US3] Integrar Helmet y la política CORS compartida antes de las rutas sin cambiar `module.exports = app` en `backend/src/app.js`
- [X] T011 [US3] Reutilizar la misma lista de orígenes para configurar Socket.io en `backend/index.js`, manteniendo los eventos `lectura` y `alerta` y los clientes sin cabecera `Origin`

**Checkpoint**: REST y Socket.io comparten exactamente la política de orígenes y las respuestas incluyen protección HTTP sin cambios de contrato.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 y T002 no dependen de otras tareas y pueden comenzar inmediatamente.
- **Foundational (Phase 2)**: No agrega tareas; la base existente permite comenzar las historias tras Setup.
- **User Stories (Phases 3-5)**: Todas dependen de T001 y T002. Son independientes entre sí, pero se ejecutan en secuencia (US1, US2, US3) porque comparten el archivo de tests.
- **Validación final**: Después de T003-T011, ejecutar la suite indicada en `specs/002-endurecer-backend-produccion/quickstart.md` desde `backend` con `TEST_DATABASE_URL` aislada; esta validación no agrega una tarea de modificación de archivos.

### User Story Dependencies

- **User Story 1 (P1)**: Depende de T001-T002; no depende de otras historias.
- **User Story 2 (P1)**: Depende de T001-T002; no depende de otras historias.
- **User Story 3 (P1)**: Depende de T001-T002; no depende de User Story 1 ni User Story 2.

### Within Each User Story

- Los tests de cada historia deben escribirse primero y fallar antes de implementar.
- En User Story 3, T009 debe completarse antes de T010 y T011 porque ambos consumidores deben reutilizar la función compartida.
- La implementación de una historia debe quedar validada por su grupo de tests antes del checkpoint.

### Parallel Opportunities

- T001 y T002 pueden ejecutarse en paralelo (archivos distintos).
- Todas las demás tareas se ejecutan en secuencia: T003, T005, T007 y T008 editan el mismo archivo de tests (`hardening.integration.test.js`) y no deben ejecutarse en paralelo.

## Implementation Strategy

1. **MVP**: Completar User Story 1 (T003-T004) para bloquear arranques inseguros en producción.
2. Completar User Story 2 (T005-T006) para asegurar la integridad de datos y la repetibilidad de migraciones.
3. Completar User Story 3 (T007-T011) para cubrir Helmet y CORS en REST y Socket.io.
4. Validar el resultado con una base PostgreSQL de pruebas: nunca usar la base de desarrollo.

**Total de tareas**: 11