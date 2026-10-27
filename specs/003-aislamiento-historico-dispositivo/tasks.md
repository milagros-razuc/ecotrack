---

description: "Tareas de implementación para aislar el histórico al transferir dispositivos"
---

# Tasks: Aislamiento histórico al transferir un dispositivo

**Input**: Design documents from `/specs/003-aislamiento-historico-dispositivo/`

**Prerequisites**: `plan.md` y `spec.md`

**Tests**: Solo se solicita crear el archivo de prueba; no ejecutar pruebas como parte de estas tareas.

## User Story 1 - Conservar la pertenencia histórica de los datos (Priority: P1)

**Goal**: Mantener lecturas y alertas asociadas al cliente histórico, sin depender del dueño actual del dispositivo.

**Independent Test**: Las consultas históricas y las superficies de lectura/alerta seleccionan por `cliente_id` persistido y no exponen datos de otro cliente tras una transferencia.

- [X] T001 [US1] Persistir y migrar `lecturas.cliente_id` y `alertas.cliente_id` en `backend/src/config/migrate.js`
- [X] T002 [US1] Consultar el histórico de lecturas por pertenencia histórica en `backend/src/services/lecturas.service.js`
- [X] T003 [US1] Consultar y actualizar alertas por pertenencia histórica en `backend/src/services/alertas.service.js`
- [X] T004 [US1] Ajustar las consultas restantes para que filtros, rangos, resúmenes, estados, API pública y rutas protegidas usen el `cliente_id` histórico en `backend/src/routes/alertas.js`, `backend/src/routes/lecturas.js`, `backend/src/routes/public.routes.js`, `backend/src/services/umbrales.service.js` y `backend/src/mqtt/client.js`; conservar los `JOIN` descriptivos sin usarlos para decidir visibilidad

## User Story 2 - Transferir un dispositivo sin arrastrar datos al nuevo cliente (Priority: P1)

**Goal**: Liberar el dispositivo de A, eliminar su configuración de umbrales y permitir que B lo reclame sin modificar el histórico.

**Independent Test**: La baja deja el dispositivo sin dueño y sin umbrales; el reclamo posterior asigna B sin borrar ni reatribuir lecturas o alertas de A.

- [X] T005 [US2] Implementar la baja transaccional que establezca `cliente_id = NULL`, `activo = false`, `nombre = NULL` y `ubicacion = NULL`, elimine los umbrales y preserve lecturas, alertas y auditoría en `backend/src/services/dispositivos.service.js` y `backend/src/routes/dispositivos.js`
- [X] T006 [US2] Completar el reclamo de dispositivos sin dueño y bloquear persistencia, evaluación de umbrales, alertas y emisiones para lecturas recibidas mientras `cliente_id IS NULL` en `backend/src/services/dispositivos.service.js`, `backend/src/services/umbrales.service.js` y `backend/src/mqtt/client.js`

## User Story 3 - Aislar todos los canales de consulta y notificación (Priority: P1)

**Goal**: Cubrir el flujo A → baja → B → reclamo y verificar la visibilidad histórica mediante servicios y API pública.

**Independent Test**: A conserva sus lecturas y alertas; B solo recibe datos generados desde su reclamo; el archivo de prueba cubre también la ausencia de umbrales tras la baja.

- [X] T007 [US3] Crear, sin ejecutar, el archivo de prueba de integración `backend/src/test/aislamiento-historico-dispositivo.integration.test.js` con el escenario A → baja → B → reclamo, verificaciones de `cliente_id IS NULL`, ausencia de umbrales, consultas de servicios/API pública y conservación del histórico de A

## Dependencies

- T001, T002 y T003 ya están completadas y sirven como base de T004, T005 y T006.
- T005 debe completarse antes de T006 y T007 porque el reclamo y la limpieza de umbrales son prerrequisitos del flujo de transferencia.
- T004 es independiente de T005 y puede ejecutarse en paralelo con T005.
- T007 depende de T004, T005 y T006 para describir y cubrir el comportamiento final.

## Parallel Opportunities

- T004 y T005 pueden trabajarse en paralelo porque modifican superficies distintas.
- T006 puede dividirse entre `dispositivos.service.js` y `mqtt/client.js` si se preserva el contrato transaccional de la baja.
- T007 puede crearse en paralelo con T004-T006, pero no debe ejecutarse hasta que esas tareas estén terminadas.

## Implementation Strategy

1. Mantener como base los cambios ya realizados en migración y servicios históricos.
2. Corregir las consultas y los canales de ingesta/notificación restantes.
3. Completar baja, reclamo y eliminación de umbrales en una operación consistente.
4. Crear el archivo de integración del criterio de aceptación; la ejecución queda fuera de esta lista.
