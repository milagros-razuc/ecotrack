---

description: "Task list for the platform clients section"
---

# Tasks: Seccion Clientes de plataforma

**Input**: Design documents from `/specs/026-seccion-clientes-platform/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare shared navigation and test surfaces

- [X] T001 Confirmar la estructura de la pagina plataforma y los contratos existentes de cliente/reset en `frontend/plataforma.html`, `backend/src/services/plataforma.service.js` y `backend/src/services/password-reset.service.js`
- [X] T002 [P] Documentar el alcance de la feature y los artefactos generados en `specs/026-seccion-clientes-platform/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core authorization and data contracts required before user story work

**CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 [P] Agregar `clientes` al enrutamiento por pagina en `frontend/shared/role-routing.js`, admitiendo solo `platform_admin` y conservando redirecciones existentes
- [X] T004 [P] Agregar pruebas de acceso directo para `clientes` en `frontend/shared/role-routing.test.js`
- [X] T005 Extender `listarClientes()` en `backend/src/services/plataforma.service.js` para incluir una sola agregacion de administradores activos con `rol = 'admin'`, `cliente_id` y arreglo vacio sin administrador
- [X] T006 [P] Actualizar el contrato HTTP de `GET /api/plataforma/clientes` en `backend/src/test/platform-panel.integration.test.js` con administradores, arreglo vacio y rechazo 403 para usuarios de cliente
- [X] T007 Verificar y conservar `app.use('/api/plataforma', verificarToken, requirePlatformAdmin, plataformaRouter)` en `backend/src/app.js` sin ampliar permisos tenant

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Consultar clientes y su administrador (Priority: P1) MVP

**Goal**: Mostrar una pagina propia «Clientes» con todos los clientes y el nombre/username de sus administradores

**Independent Test**: Iniciar como `platform_admin`, abrir «Clientes» desde desktop/movil y comprobar cero, uno y varios administradores; ingresar como otro rol y comprobar rechazo

### Tests for User Story 1

- [X] T008 [P] [US1] Agregar pruebas de renderizado de filas de clientes, estado «Sin administrador» y escape de nombre/username en `frontend/shared/platform-panel-render.test.js`
- [X] T009 [P] [US1] Agregar prueba de pagina y navegacion «Clientes» exclusiva para `platform_admin` en `frontend/platform-panel.test.js`
- [X] T010 [P] [US1] Agregar prueba HTTP de carga masiva sin consultas por cliente y rechazo multi-cliente en `backend/src/test/platform-panel.integration.test.js`

### Implementation for User Story 1

- [X] T011 [P] [US1] Agregar renderers seguros para `administradores`, estado sin administrador y filas de cliente en `frontend/shared/platform-panel-render.js`
- [X] T012 [US1] Crear `frontend/clientes.html` con listado responsive, estados de carga/error y guard por rol usando `frontend/shared/app.js` y `frontend/shared/role-routing.js`
- [X] T013 [P] [US1] Agregar el item «Clientes» para escritorio y movil, exclusivo con `data-platform-only`, en `frontend/shared/sidebar.html`
- [X] T014 [US1] Cargar `GET /api/plataforma/clientes` una sola vez desde `frontend/clientes.html` y agrupar los administradores recibidos sin solicitudes por fila
- [X] T015 [US1] Aplicar el guard de pagina `clientes` en `frontend/shared/app.js` y conservar el patron de redireccion segura ya usado por `plataforma.html`

**Checkpoint**: User Story 1 is functional and independently testable

---

## Phase 4: User Story 2 - Recuperar el acceso del administrador (Priority: P1)

**Goal**: Permitir reset desde cada fila elegible reutilizando el flujo seguro/auditable de la Feature 024

**Independent Test**: Confirmar reset de un administrador elegible, copiar la temporal una sola vez, cerrar el dialogo y verificar cambio obligatorio y auditoria

### Tests for User Story 2

- [X] T016 [P] [US2] Agregar pruebas de visibilidad y confirmacion del reset para objetivos `admin` elegibles y ausencia de accion para sin administrador o `platform_admin` en `frontend/shared/platform-panel-render.test.js`
- [X] T017 [P] [US2] Agregar prueba de entrega unica, cierre del dialogo y ausencia de recuperacion de temporal en `frontend/platform-panel.test.js`
- [X] T018 [P] [US2] Agregar pruebas de integracion del reset desde la nueva vista: rol actor, usuario objetivo, auditoria sin secreto y rechazo de `admin`/`comun` a la operacion en `backend/src/test/password-reset.integration.test.js`

### Implementation for User Story 2

- [X] T019 [US2] Integrar la accion de reset con confirmacion explicita y identidad visible del objetivo en `frontend/clientes.html`
- [X] T020 [US2] Crear modal temporal con opcion copiar y limpiar variable/HTML al cerrar o abandonar la pagina en `frontend/clientes.html`
- [X] T021 [US2] Reutilizar `POST /api/usuarios/:id/reset-password` desde `frontend/clientes.html` sin crear un endpoint paralelo ni aceptar `cliente_id` como origen de autorizacion
- [X] T022 [US2] Verificar que `backend/src/routes/reset-password.js` y `backend/src/services/password-reset.service.js` mantienen entrega no reversible, cambio obligatorio, invalidacion y auditoria existente
- [X] T023 [US2] Mostrar errores sanitizados y estados de carga en `frontend/clientes.html` sin registrar ni persistir la contraseña temporal

**Checkpoint**: User Story 2 is functional and independently testable

---

## Phase 5: User Story 3 - Resolver administracion ambigua y mover usuarios por cliente (Priority: P2)

**Goal**: Resolver clientes sin o con varios administradores y concentrar «Usuarios por cliente» en la nueva pantalla

**Independent Test**: Cargar clientes con cero, uno y varios administradores y comprobar seleccion unica; verificar que el panel global ya no duplica Usuarios por cliente

### Tests for User Story 3

- [X] T024 [P] [US3] Agregar pruebas de cero administradores, único administrador y administrador principal más antiguo con conteo de varios administradores en `frontend/shared/platform-panel-render.test.js`
- [X] T025 [P] [US3] Agregar prueba estructural de que `frontend/plataforma.html` ya no contiene el selector/tab «Usuarios por cliente» y que `frontend/clientes.html` sí lo incluye en `frontend/platform-panel.test.js`

### Implementation for User Story 3

- [X] T026 [US3] Mostrar el administrador principal con menor `id` y el conteo total cuando existan varios administradores en `frontend/clientes.html`
- [X] T027 [US3] Mantener el estado inequívoco «Sin administrador» y ocultar reset cuando `administradores` sea vacio en `frontend/clientes.html`
- [X] T028 [US3] Mover el selector y la tabla existentes de «Usuarios por cliente» desde `frontend/plataforma.html` a `frontend/clientes.html`
- [X] T029 [US3] Retirar de `frontend/plataforma.html` el bloque HTML, los estados y los listeners duplicados de «Usuarios por cliente»
- [X] T030 [US3] Reutilizar `GET /api/plataforma/clientes/:id/usuarios` desde `frontend/clientes.html` y conservar el listado de todos los usuarios sin solicitar consultas por usuario

**Checkpoint**: All user stories are functional and independently testable

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validate security, performance, documentation and user-facing consistency

- [X] T031 [P] Actualizar `README.MD` y/o documentación de gestion de usuarios con la ruta «Clientes», permisos y reutilizacion del reset de la Feature 024
- [X] T032 [P] Agregar o actualizar pruebas de escape, ausencia de secretos y entrega unica en `frontend/shared/platform-panel-render.test.js` y `backend/src/test/password-reset.integration.test.js`
- [X] T036 [P] Agregar prueba frontend del administrador principal más antiguo y conteo de múltiples administradores en `frontend/shared/platform-panel-render.test.js`
- [X] T037 [P] Agregar prueba de integración con un admin creado antes de la migración 020 y otro posterior en `backend/src/test/platform-panel.integration.test.js`
- [X] T038 [P] Mejorar visualmente `frontend/clientes.html` con columnas Cliente/Administrador/Usuarios/Acciones y panel sin selector
- [X] T039 [P] Mejorar el renderer de clientes y usuarios con avatar, etiquetas de rol, icono de reset, tooltip y foco visible en `frontend/shared/platform-panel-render.js`
- [X] T040 [P] Agregar pruebas de estructura visual, columnas, etiquetas, aria-label y desplazamiento en `frontend/platform-panel.test.js` y `frontend/shared/platform-panel-render.test.js`
- [X] T033 Revisar `frontend/clientes.html`, `frontend/plataforma.html` y `frontend/shared/sidebar.html` para consistencia responsive, accesibilidad y estados de carga/error
- [ ] T034 Ejecutar el subconjunto relevante con `cd backend && npm test` y verificar que pasan las pruebas frontend/backend modificadas (pendiente: configurar `TEST_DATABASE_URL` para las pruebas de integración)
- [ ] T035 Ejecutar los escenarios de `specs/026-seccion-clientes-platform/quickstart.md`, incluyendo 500 clientes y rechazo desde URL/API por roles no plataforma (pendiente del entorno PostgreSQL configurado)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup; blocks all user stories
- **User Stories (Phase 3+)**: Depend on Foundational; US1, US2 and US3 can proceed in parallel after it exists
- **Polish (Phase 6)**: Depends on all desired stories

### User Story Dependencies

- **User Story 1 (P1)**: Independent after foundational; provides the main listing
- **User Story 2 (P1)**: Reuses US1 row data but remains independently testable with a row and existing reset endpoint
- **User Story 3 (P2)**: Reuses US1 listing and US2 reset UI; can be implemented independently after foundational

### Within Each User Story

- Tests before implementation
- Service/data contract before frontend integration
- Core implementation before moving shared UI between pages
- Each story completes before its checkpoint validation

## Parallel Opportunities

- T003-T004 can run in parallel for routing and tests
- T008-T010 can run in parallel for frontend, structural and integration tests
- T011-T013 can run in parallel after tests fail
- T016-T018 can run in parallel for reset tests
- T024-T025 can run in parallel for multiple-admin and moved-section tests
- Polish tasks T031-T032 can run in parallel

## Implementation Strategy

### MVP First (User Story 1)

1. Complete Setup
2. Complete Foundational
3. Complete User Story 1
4. Stop and validate the listing and access restrictions
5. Demo/deploy the listing increment before reset work if needed

### Incremental Delivery

1. Setup + Foundational
2. Add User Story 1: clients and administrator listing
3. Add User Story 2: secure one-time reset
4. Add User Story 3: multiple-admin resolution and moved users view
5. Polish and run quickstart

## Notes

- [P] = different files and no dependency on incomplete tasks
- [Story] labels apply only to user story phases
- Every task includes an exact file path
- The temporary password must never be added to HTML persistence, logs or audit data
