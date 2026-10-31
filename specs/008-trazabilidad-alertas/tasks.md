# Tasks: Trazabilidad de alertas

**Input**: Design documents from `specs/008-trazabilidad-alertas/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`,
`contracts/`, `quickstart.md`

**Tests**: Incluidos porque la constitution exige pruebas focalizadas para nuevo
comportamiento, persistencia, contratos externos, aislamiento y realtime.

## Phase 1: Setup

**Purpose**: Preparar el alcance de implementación sin agregar dependencias.

- [X] T001 Confirmar en `backend/package.json` que Express, `pg`, Socket.IO, Zod y `socket.io-client` existentes cubren la feature y no agregar dependencias nuevas
- [X] T002 [P] Revisar `backend/src/test/realtime.test-support.js` y documentar en `backend/src/test/trazabilidad-alertas.integration.test.js` los fixtures de dos clientes, usuarios y dispositivos que se reutilizarán

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Crear la persistencia y los contratos internos que necesitan todas
las historias.

- [X] T003 Crear la migración repetible de `alerta_acciones` en `backend/src/config/migrate.js` con `id SERIAL PRIMARY KEY`, `alerta_id INTEGER NOT NULL REFERENCES alertas(id)`, `cliente_id INTEGER NOT NULL REFERENCES clientes(id)`, `usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL`, `usuario_username VARCHAR(50)`, `accion VARCHAR(50) NOT NULL`, `detalle TEXT` y `timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- [X] T004 [P] Agregar en `backend/src/config/migrate.js` los índices `(cliente_id, alerta_id, timestamp ASC, id ASC)` y `(cliente_id, timestamp DESC)`, además de la restricción de acciones `generar_alerta`, `marcar_atendida` y `reabrir_alerta`
- [X] T005 Crear `backend/src/services/alerta-acciones.service.js` con inserción append-only, consultas por `cliente_id` y `alerta_id` ordenadas por `timestamp ASC, id ASC`, y sin métodos de actualización o eliminación
- [X] T006 [P] Extender `backend/src/schemas.js` o los validadores existentes para mantener `estado` limitado a `pendiente`/`atendida` y `comentario` opcional con máximo 500 caracteres, sin aceptar `cliente_id` en payloads
- [X] T007 [P] Definir en `backend/src/realtime/socketRegistry.js` y/o un helper realtime compartido el uso de `clientRoom(clienteId)` para emitir `alerta-accion` únicamente a la sala del cliente histórico

**Checkpoint**: La tabla, índices, validación y primitives de aislamiento están
listas; las historias pueden implementarse sin cambiar dependencias.

---

## Phase 3: User Story 1 - Registrar acciones de una alerta (Priority: P1) 🎯 MVP

**Goal**: Registrar generación y cada transición válida con actor, fecha,
detalle y cliente histórico, manteniendo estado y acción atómicos y notificando
por Socket.IO después del commit.

**Independent Test**: Generar una alerta, marcarla atendida con nota, reabrirla
con otra nota y verificar tres acciones, actores, timestamps, estado final,
rollback ante error y evento solo para el cliente dueño histórico.

### Tests for User Story 1

- [X] T008 [P] [US1] Agregar en `backend/src/test/trazabilidad-alertas.integration.test.js` una prueba de generación MQTT que verifique una alerta y exactamente una acción `generar_alerta` con `usuario_id` nulo, `usuario_username` `sistema` y el mismo `cliente_id`
- [X] T009 [P] [US1] Agregar en `backend/src/test/trazabilidad-alertas.integration.test.js` una prueba de PATCH que verifique acciones `marcar_atendida` y `reabrir_alerta`, actor autenticado, detalle opcional, orden e historial append-only
- [X] T010 [P] [US1] Agregar en `backend/src/test/trazabilidad-alertas.integration.test.js` una prueba de rollback que fuerce el fallo de inserción de acción y confirme que no queda cambio de estado ni acción parcial
- [X] T011 [P] [US1] Agregar en `backend/src/test/realtime.integration.test.js` la prueba de `alerta-accion` para dos sockets de clientes distintos y confirmar que solo recibe el cliente de `alerta_acciones.cliente_id`

### Implementation for User Story 1

- [X] T012 [US1] Refactorizar `backend/src/services/alertas.service.js` para que la generación inserte `alertas` y `generar_alerta` en una única transacción, copie el `cliente_id` histórico del dispositivo y use `sistema` como actor sin usuario
- [X] T013 [US1] Refactorizar `backend/src/services/alertas.service.js` para que `actualizarEstado` tome un cliente de `pool.connect()`, ejecute `BEGIN`, bloquee/valide la alerta por `id` y `cliente_id`, actualice estado/comentario e inserte la acción en la misma transacción, con `COMMIT`, `ROLLBACK` y `release` seguros
- [X] T014 [US1] Integrar en `backend/src/mqtt/client.js` la emisión de `alerta-accion` después del commit de generación, usando la sala `clientRoom(clienteId)`, sin eliminar ni cambiar el evento existente `alerta`
- [X] T015 [US1] Integrar en `backend/src/routes/alertas.js` el actor `req.usuario.sub`/`req.usuario.username` al cambio de estado y conservar el contrato existente de `PATCH /api/alertas/:id`
- [X] T016 [US1] Verificar en `backend/src/services/alertas.service.js` y `backend/src/services/alerta-acciones.service.js` que errores de validación, autorización, alerta inexistente o cliente sin dueño no creen acciones y no expongan `cliente_id` configurable

**Checkpoint**: US1 completa y probada; generación, transiciones, transacción,
aislamiento y evento realtime funcionan independientemente.

---

## Phase 4: User Story 2 - Consultar el historial de una alerta (Priority: P1)

**Goal**: Permitir consultar desde `auditor.html` el historial de una alerta,
ordenado cronológicamente y en modo solo lectura.

**Independent Test**: Abrir una alerta con generación, atención y reapertura;
verificar actor, fecha, acción y detalle en orden ascendente, y confirmar que
otro cliente obtiene `404` sin datos.

### Tests for User Story 2

- [X] T017 [P] [US2] Agregar en `backend/src/test/trazabilidad-alertas.integration.test.js` pruebas del endpoint `GET /api/alertas/:id/acciones` para orden `timestamp ASC, id ASC`, historial vacío de alertas antiguas y respuesta segura `404` fuera del cliente
- [X] T018 [P] [US2] Agregar en `backend/src/test/trazabilidad-alertas.integration.test.js` una prueba de transferencia de dispositivo que confirme que la alerta y sus acciones conservan el `cliente_id` original y no aparecen para el nuevo cliente

### Implementation for User Story 2

- [X] T019 [US2] Implementar en `backend/src/routes/alertas.js` `GET /api/alertas/:id/acciones`, resolviendo el alcance exclusivamente desde `req.clienteId` y devolviendo `{ data: [...] }` o `404` sin distinguir inexistencia de pertenencia
- [X] T020 [US2] Completar en `backend/src/services/alerta-acciones.service.js` la consulta aislada por `cliente_id` y `alerta_id`, incluyendo validación de pertenencia y orden estable `timestamp ASC, id ASC`
- [X] T021 [US2] Agregar en `frontend/auditor.html` una acción de “Ver historial” por alerta y un modal/panel de solo lectura con `usuario_username`, `accion`, `detalle` y `timestamp`, estados de carga, vacío y error
- [X] T022 [US2] Integrar en `frontend/shared/app.js` la escucha de `alerta-accion` y el evento `ecotrack:alerta-accion`, para refrescar el historial abierto o invalidar su carga sin duplicar filas
- [X] T023 [US2] Verificar en `frontend/auditor.html` que el historial no tenga controles de edición/eliminación/reordenamiento persistente y que sus textos/detalles se escapen de forma segura antes de insertarse en HTML

**Checkpoint**: US2 completa y probada; cualquier usuario autorizado del cliente
puede consultar historial de solo lectura sin cruzar tenants.

---

## Phase 5: User Story 3 - Auditar acciones de alertas (Priority: P2)

**Goal**: Integrar las acciones de alerta en el Registro de actividad admin,
con filtros, paginación y acceso contextual al historial.

**Independent Test**: Como admin, filtrar `entidad=alerta`, localizar acciones
por fecha/acción, paginar y abrir el historial; como usuario común, confirmar
que se mantiene el `403` existente.

### Tests for User Story 3

- [X] T024 [P] [US3] Agregar en `backend/src/test/trazabilidad-alertas.integration.test.js` una prueba de `GET /api/auditoria` que mezcle auditoría existente y acciones de alerta, respete filtros, paginación, orden descendente y `cliente_id`
- [X] T025 [P] [US3] Agregar en `backend/src/test/trazabilidad-alertas.integration.test.js` una prueba de autorización que confirme que un usuario no admin conserva `403` y que un admin de otro cliente no ve acciones ajenas

### Implementation for User Story 3

- [X] T026 [US3] Extender `backend/src/services/auditoria.service.js` para proyectar `alerta_acciones` al formato existente (`entidad=alerta`, `entidad_id`, `accion`, `usuario_username`, `detalle`, `timestamp`), combinarlas con `auditoria` y aplicar los filtros/paginación por `cliente_id`
- [X] T027 [US3] Mantener en `backend/src/routes/auditoria.js` la restricción `verificarRol('admin')` y documentar el contrato unificado sin aceptar `cliente_id` desde query
- [X] T028 [US3] Actualizar `frontend/auditor.html` para mostrar acciones de alerta en Registro de actividad, enlazar `entidad_id` al historial y conservar filtros de entidad/acción/fechas y paginación

**Checkpoint**: US3 completa y probada; el auditor ve acciones de alerta junto
con el resto de la actividad sin ampliar permisos.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validación final, documentación y regresión.

- [ ] T029 [P] Actualizar `specs/008-trazabilidad-alertas/quickstart.md` con los comandos y resultados reales de las pruebas focalizadas y completas
- [ ] T030 [P] Revisar `backend/src/config/migrate.js`, `backend/src/services/alertas.service.js` y `backend/src/services/alerta-acciones.service.js` para confirmar que no existen endpoints de update/delete de acciones ni emisiones antes de `COMMIT`
- [ ] T031 Ejecutar desde `backend/` `npm test -- --test-name-pattern="trazabilidad|alerta|realtime"` y corregir regresiones directamente relacionadas en los archivos de la feature
- [ ] T032 Ejecutar desde `backend/` `npm test` y verificar `git diff --check` sobre todos los archivos modificados
- [ ] T033 [P] Validar manualmente en `auditor.html` el flujo de generación, atención, reapertura, historial, Registro de actividad, dos clientes y transferencia de dispositivo según `specs/008-trazabilidad-alertas/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; T001 y T002 pueden ejecutarse en paralelo.
- **Foundational (Phase 2)**: Depende de Setup; T003 precede T005, y T006/T007
  pueden ejecutarse en paralelo con T003 si no modifican las mismas líneas.
- **User Stories**: Dependen de toda la fase Foundational.
- **US1 (P1)**: No depende de US2 ni US3; es el MVP.
- **US2 (P1)**: Depende de US1 para que existan acciones, aunque su endpoint/UI
  puede desarrollarse en paralelo después de T005.
- **US3 (P2)**: Depende de T005 y de la forma final de las acciones de US1; su
  proyección puede desarrollarse en paralelo con US2 una vez fijado el contrato.
- **Polish**: Depende de las historias seleccionadas para entrega.

### User Story Dependencies

```text
Foundation
   |
   +--> US1 Registrar acciones (MVP)
   |       |
   |       +--> US2 Consultar historial
   |       |
   |       +--> US3 Auditar acciones
   |
   +--> US2/US3 frontend contract work may proceed in parallel after T005
```

### Parallel Opportunities

- T001 y T002.
- T004, T006 y T007 después de acordar el punto de migración.
- T008, T009, T010 y T011 son pruebas independientes.
- T017 y T018 son pruebas independientes.
- T024 y T025 son pruebas independientes.
- T029, T030 y T033 pueden ejecutarse en paralelo cuando la implementación esté estable.

## Parallel Example: User Story 1

```text
Task T008: prueba de generación y actor sistema
Task T009: prueba de transiciones y notas
Task T010: prueba de rollback
Task T011: prueba de aislamiento del evento Socket.IO
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Completar Setup y Foundational.
2. Implementar la tabla y el servicio append-only.
3. Implementar generación y cambio de estado transaccionales.
4. Emitir `alerta-accion` después del commit.
5. Ejecutar las pruebas T008-T011.

### Incremental Delivery

1. Entregar US1 como base operativa auditable.
2. Añadir US2 para historial individual de solo lectura.
3. Añadir US3 para la vista administrativa unificada.
4. Ejecutar Polish y la suite completa antes de cerrar la feature.

## Completion Criteria

- Todas las tareas usan checkbox, ID secuencial, etiquetas `[P]` solo cuando
  corresponde, etiqueta `[USn]` en fases de historias y rutas concretas.
- Cada historia tiene objetivo, prueba independiente, pruebas automatizadas e
  implementación.
- Los escenarios de `quickstart.md` están cubiertos por tareas explícitas.
