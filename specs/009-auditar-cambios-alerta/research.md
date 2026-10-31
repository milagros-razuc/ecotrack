# Research: Auditar cambios de estado de alertas

## Decisión 1: Reutilizar `alerta_acciones`

**Decision**: Mantener `alerta_acciones` como historial canónico y no crear
`alertas_historial`. Ya contiene `alerta_id`, `cliente_id`, actor,
`usuario_username`, acción, detalle y timestamp; también registra la generación
automática y tiene índices por cliente, alerta y fecha.

**Rationale**: La feature 008 ya implementó inserción transaccional, consulta
aislada y consumo en frontend. Crear otra tabla duplicaría datos y exigiría
sincronizar dos historiales.

**Alternatives considered**: Crear la tabla propuesta; se descarta porque no
reutiliza la persistencia existente ni el contrato ya usado por actividad.

## Decisión 2: Mantener `/acciones` y agregar `/historial`

**Decision**: Agregar `GET /api/alertas/:id/historial` como contrato
documentado y conservar `/acciones` con la misma respuesta `{ data: [...] }`.

**Rationale**: El frontend y consumidores de la feature 008 ya usan `/acciones`;
el alias permite adoptar el nombre solicitado sin romperlos.

**Alternatives considered**: Reemplazar `/acciones`; se descarta por
compatibilidad.

## Decisión 3: Auditoría posterior al cambio

**Decision**: Después de confirmar estado y acción histórica, llamar a
`auditoriaService.registrar` con `accion: cambiar_estado_alerta` y
`entidad: alerta`. La función existente captura, registra y no relanza errores.

**Rationale**: Mantiene la política vigente: una falla de auditoría no revierte
una operación administrativa ya exitosa.

**Alternatives considered**: Insertar auditoría en la transacción; se descarta
porque haría que una falla administrativa revierta el estado.

## Decisión 4: Reutilizar columnas de auditoría

**Decision**: Conservar la nota en `detalle` y representar estado anterior,
nuevo y comentario dentro del detalle estable de auditoría, sin agregar
columnas ni cambiar la respuesta de PATCH. El historial canónico conserva
acción, actor, fecha y comentario.

**Rationale**: `auditoria` no tiene columnas separadas para estados y el
proyecto exige no inventar campos.

**Alternatives considered**: Agregar columnas nuevas; se descarta por alcance
innecesario y mayor migración.

## Decisión 5: Ampliación incremental de la UI

**Decision**: Conservar el modal de historial de `auditor.html`, consultar
`/historial` (manteniendo fallback/compatibilidad con `/acciones`) y agregar
“Última acción” calculada sin cambiar el payload de `GET /api/alertas`.

**Rationale**: El modal y la renderización segura ya existen; la ampliación es
pequeña y conserva el modo de solo lectura.

**Alternatives considered**: Crear una página nueva; se descarta por alcance.
