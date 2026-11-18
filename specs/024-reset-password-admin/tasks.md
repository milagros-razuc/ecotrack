---
description: "Task list for admin password reset"
---

# Tasks: Reseteo de contraseña por administrador

**Input**: [spec.md](./spec.md), [plan.md](./plan.md),
[research.md](./research.md), [data-model.md](./data-model.md),
[contracts/reset-password.md](./contracts/reset-password.md)

**Existing implementation verified**:

- `token_version`, JWT claim `tv`, comparison in `middleware/auth.js` and the
  Socket.IO handshake already exist; tasks only cover missing temporary-password
  behavior.
- `frontend/plataforma.html`, `frontend/shared/platform-panel-render.js` and
  `backend/src/services/auditoria.service.js` exist.
- `frontend/shared/platform-panel.test.js` does not exist; its new tests belong
  under `backend/src/test/`, which is included by the existing Node test command.

## Phase 1: Setup

- [x] T001 Confirmar en `backend/migrations/016_platform_admin_role.sql`, `backend/scripts/seed-platform-admin.js` y `backend/src/middleware/platformAdmin.js` que el único rol de plataforma usado por la aplicación es `platform_admin`, y actualizar fixtures nuevas en `backend/src/test/password-reset.service.test.js`
- [x] T002 [P] Implementar la política reutilizable de contraseñas nuevas, con mínimo general de 8 caracteres, rechazo de contraseñas comunes y rechazo de igualdad con la temporal, en `backend/src/services/password-policy.service.js`; mantener mínimos independientes de 12 para cuentas privilegiadas y temporales
- [x] T003 [P] Implementar el generador CSPRNG de contraseña temporal sin caracteres ambiguos en `backend/src/services/password-reset.service.js`, sin escribir el valor en logs

## Phase 2: Foundational

- [x] T004 Crear `backend/migrations/021_password_reset.sql` con `BEGIN;` y `COMMIT;`, agregando idempotentemente solo `password_temporal_expira TIMESTAMPTZ NULL` a `usuarios` mediante `ADD COLUMN IF NOT EXISTS`; reutilizar `must_change_password` y `token_version` existentes
- [x] T005 Actualizar `backend/src/test/platform-panel-schema.test.js` para incluir `021_password_reset.sql` en la lista ordenada posterior a 020, verificar su contenido idempotente y comprobar que el runner la aplica dos veces sin error
- [x] T006 [P] Agregar en `backend/src/test/password-reset.service.test.js` una prueba de que `token_version` ya existe y no se recrea en la migración ni en el servicio
- [x] T007 [P] Verificar en `backend/src/app.js` que `trust proxy` permanece configurado para un salto detrás de Caddy y agregar una prueba que confirme que la IP de `req.ip` usada por el reset es la real reenviada por Caddy, sin modificar los rate limiters existentes

## Phase 3: User Story 1 - Resetear contraseña de usuario (P1) 🎯 MVP

**Goal**: Un administrador autorizado genera una contraseña temporal para un usuario
común de su organización, la entrega una sola vez y permite el cambio obligatorio.

**Independent Test**: Con un `admin` y un usuario `comun` del mismo cliente, confirmar
`POST /api/usuarios/:id/reset-password`, recibir la temporal, iniciar sesión,
completar el cambio y comprobar que no queda texto plano.

- [x] T008 [P] [US1] Crear pruebas unitarias de `puedeResetear(solicitante, objetivo)` para `admin` -> `comun` del mismo `cliente_id`, auto-reset y objetivos no elegibles en `backend/src/test/password-reset.service.test.js`
- [x] T009 [P] [US1] Crear prueba de contrato para `POST /api/usuarios/:id/reset-password`, respuesta 200, `Cache-Control: no-store`, campos permitidos y ausencia de hash/contraseña en `backend/src/test/password-reset.integration.test.js`
- [x] T010 [US1] Implementar `puedeResetear(solicitante, objetivo)` como única función pura en `backend/src/services/password-reset.service.js`; debe aceptar `admin` solo sobre `comun` del mismo cliente y rechazar auto-reset, `platform_admin` y roles no permitidos
- [x] T011 [US1] Implementar el service transaccional en `backend/src/services/password-reset.service.js`: cargar el rol vigente del solicitante desde la base, cargar el objetivo, generar y hashear la temporal, fijar `must_change_password=true`, fijar `password_temporal_expira=NOW()+24h`, incrementar una sola vez `token_version` e insertar `reset_password` en auditoría con el `cliente_id` del objetivo y la IP
- [x] T012 [US1] Reutilizar `auditoriaService.registrarEnTransaccion` y `actor_tipo` de `018_audit_actor.sql` dentro del reset transaccional en `backend/src/services/auditoria.service.js`, sin incluir contraseña, hash ni token en el detalle
- [x] T013 [US1] Desconectar los sockets del objetivo únicamente después del commit mediante `backend/src/realtime/socketRegistry.js`, preservando el rollback si falla la actualización o la auditoría
- [x] T014 [US1] Montar únicamente la ruta exacta `POST /api/usuarios/:id/reset-password` en `backend/src/app.js`, antes de `app.use('/api/usuarios', ...)`, con `verificarToken` y `verificarRol('admin', 'platform_admin')`; no modificar `backend/src/middleware/rol.js`, `backend/src/middleware/cliente.js` ni ampliar `backend/src/routes/usuarios.js`
- [x] T015 [US1] Implementar el handler de la ruta en `backend/src/routes/usuarios.js` o en un módulo de ruta dedicado: devolver 404 genérico para objetivo inexistente o tenant ajeno de un `admin`, 403 para matriz no permitida y `500` sanitizado para rollback, siempre con `Cache-Control: no-store`
- [x] T016 [US1] Añadir pruebas de integración de reset exitoso, aislamiento, auto-reset, `admin` sobre `admin`, usuario inexistente/inactivo, auditoría bajo el cliente objetivo y ausencia de efectos parciales en `backend/src/test/password-reset.integration.test.js`
- [x] T017 [US1] Integrar en `frontend/usuarios.html` el botón "Resetear contraseña", confirmación explícita, modal de entrega única, copia y eliminación del valor al cerrar; un `admin` solo lo ve sobre usuarios `comun` elegibles

## Phase 4: User Story 2 - Reset de plataforma y aislamiento (P1)

**Goal**: Permitir que el único `platform_admin` resetee usuarios `admin` o `comun`
de cualquier cliente sin ampliar sus permisos sobre el router tenant general.

**Independent Test**: Ejecutar todas las combinaciones de la matriz pura y realizar
solicitudes HTTP como `admin` y `platform_admin`, verificando códigos, aislamiento
y auditoría bajo el cliente objetivo.

- [x] T018 [P] [US2] Completar la tabla de casos de `puedeResetear` para `platform_admin` -> `admin`/`comun` de cualquier cliente, rechazo de `platform_admin`, mismo rol, rol superior y auto-reset en `backend/src/test/password-reset.service.test.js`
- [x] T019 [P] [US2] Añadir fixtures reales de `platform_admin` y pruebas HTTP de 404 genérico para objetivo inexistente o de otro cliente cuando el actor es `admin` en `backend/src/test/password-reset.integration.test.js`
- [x] T020 [US2] Verificar en `backend/src/app.js` y `backend/src/routes/usuarios.js` que `platform_admin` solo alcanza la ruta de reset, mientras GET/POST/PATCH/DELETE de usuarios siguen bloqueadas por `backend/src/middleware/cliente.js` y el rol existente
- [x] T021 [US2] Exponer o adaptar el listado de usuarios por cliente para el panel de plataforma en `backend/src/routes/plataforma.js` y `backend/src/services/plataforma.service.js`, sin aceptar `cliente_id` como fuente de autorización del reset
- [x] T022 [US2] Integrar en `frontend/plataforma.html` y `frontend/shared/platform-panel-render.js` la solapa Clientes con selección de cliente, listado de usuarios y acción de reset para `platform_admin` sobre `admin` y `comun`, ocultándola para `platform_admin` y auto-reset
- [x] T023 [US2] Añadir pruebas de renderizado y contrato de visibilidad por rol, cliente seleccionado y objetivos no elegibles en `frontend/shared/platform-panel-render.test.js`, ubicación real de las pruebas del renderer del panel
- [x] T024 [US2] Verificar que la auditoría de éxitos y rechazos por permisos usa `cliente_id` del objetivo, `actor_tipo`, IP real y ningún secreto en `backend/src/test/password-reset.integration.test.js`

## Phase 5: User Story 3 - Login temporal y cambio obligatorio (P1)

**Goal**: Reutilizar la invalidación de sesiones existente y completar únicamente el
comportamiento faltante de expiración, login temporal, límite de intentos y cambio.

**Independent Test**: Probar login vigente, vencido, intentos limitados, segundo
reset, JWT restringido, cambio válido/inválido e invalidación de sockets.

- [x] T025 [P] [US3] Añadir pruebas separadas de login con temporal vigente y vencida a las 24 horas, `Cache-Control: no-store`, respuesta restringida sin campos extra, reemplazo por segundo reset y mensajes genéricos en `backend/src/test/password-reset.integration.test.js`
- [x] T026 [P] [US3] Añadir pruebas de política de contraseña mínima, comunes e igualdad con la temporal en `backend/src/test/auth.test.js`
- [x] T027 [US3] Revisar `backend/src/services/auth.service.js`, `backend/src/middleware/auth.js` y `backend/index.js` para conservar `tv`, la comparación de `token_version`, el bloqueo `mustChangePassword` y el rechazo del handshake Socket.IO; implementar solo la validación de expiración temporal y el límite de intentos faltantes, sin recrear JWT/session invalidation
- [x] T028 [US3] Extender `backend/src/services/auth.service.js` para seleccionar la variante por scope verificado, exigir el estado persistido del token restringido dentro de `SELECT ... FOR UPDATE`, aplicar la política, limpiar `password_temporal_expira`, poner `must_change_password=false`, incrementar `token_version`, desconectar sockets y emitir el token nuevo tras `change-password`
- [x] T029 [US3] Mantener los rate limiters de login existentes y agregar en `backend/src/middleware/rateLimiter.js` límites independientes por usuario e IP para `change-password`, contando rechazos de validación/política; probar temporales vencidas y rechazos de política en `backend/src/test/password-reset.integration.test.js`
- [x] T030 [US3] Integrar en `frontend/login.html` el cambio obligatorio con solo `passwordNueva` para tokens restringidos, ocultar la contraseña actual, mostrar mensajes sanitizados y redirigir al dashboard solo después del éxito
- [x] T031 [US3] Añadir pruebas de rutas HTTP bloqueadas, claims de rol desactualizados y handshake Socket.IO rechazado tanto con `scope=change-password` y `must_change_password` verdadero como con el estado de base falso, reutilizando `backend/src/test/auth.test.js` y `backend/src/test/realtime.integration.test.js`
- [x] T035 [US3] Actualizar `backend/src/schemas.js`, `backend/src/routes/auth.js`, `backend/src/services/password-policy.service.js`, `backend/scripts/crear-admin-cliente.js`, `backend/scripts/seed-platform-admin.js` y la documentación de `specs/024-reset-password-admin/` para centralizar mínimos general (8), privilegiado (12) y temporal (12)

## Phase 6: Documentation and cross-cutting validation

- [ ] T032 [P] Actualizar `README.MD` y documentación de gestión de usuarios con el endpoint, roles `admin`/`platform_admin`, auditoría, entrega única, expiración y ausencia de email
- [x] T033 [P] Revisar `backend/src/test/` y fixtures para asegurar que ninguna prueba, log o auditoría contiene contraseñas temporales en texto plano
- [ ] T034 Ejecutar `backend/npm test` y los escenarios de `specs/024-reset-password-admin/quickstart.md`; corregir solo regresiones relacionadas con esta feature

## Dependencies & Execution Order

- Setup T001-T003 precede Foundation T004-T007.
- US1 T008-T017 depende de T004-T007 y entrega el MVP tenant.
- US2 T018-T024 depende de T010-T015 y agrega `platform_admin`, panel de plataforma
  y auditoría multi-cliente.
- US3 T025-T031 depende de T011-T015 y usa la infraestructura JWT/sockets existente;
  no debe duplicarla.
- Polish T032-T034 depende de las historias seleccionadas.

## Parallel Opportunities

- T002-T003 y T005-T007 pueden ejecutarse en paralelo.
- T008-T009 pueden escribirse en paralelo antes de T010-T015.
- T018-T019, T021-T023 y T025-T026 son grupos paralelizables por archivos.
- T032-T033 pueden ejecutarse en paralelo con la preparación de la validación final.

## Implementation Strategy

1. **MVP**: T004-T017 (migración, matriz tenant, transacción, endpoint y
   `usuarios.html`).
2. **Plataforma**: T018-T024 (ruta para `platform_admin`, listado en Clientes,
   visibilidad y auditoría).
3. **Acceso seguro**: T025-T031 (temporal, expiración, rate limit, cambio y UI).
4. **Cierre**: T032-T034.
