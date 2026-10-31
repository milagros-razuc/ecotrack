# Research: Trazabilidad de alertas

## Decision: Tabla append-only específica para acciones

**Decision**: Crear `alerta_acciones` con `cliente_id` y `alerta_id`, en lugar
de reutilizar `auditoria` como almacenamiento primario del historial.

**Rationale**: El historial de una alerta necesita una relación fuerte con la
alerta y aislamiento independiente del dispositivo actual. La tabla existente
`auditoria` representa operaciones administrativas generales y contiene
campos compatibles, pero no garantiza por sí sola una FK a `alertas` ni una
consulta específica del historial. El Registro de actividad puede proyectar
las acciones de alerta al mismo formato visible sin duplicar la fuente de
verdad.

**Alternatives considered**: agregar más filas a `auditoria`; rechazado porque
mezcla dos propósitos y deja la integridad de la alerta en `entidad_id`
textual. Agregar columnas de historial a `alertas`; rechazado porque
sobrescribe acciones previas.

## Decision: Transacciones con el mismo cliente PostgreSQL

**Decision**: `registrar` y `actualizarEstado` usarán un cliente obtenido de
`pool.connect()`, ejecutarán `BEGIN`, la operación de alerta y la inserción de
acción, y harán `COMMIT`/`ROLLBACK` con `finally` para liberar el cliente.

**Rationale**: El estado actual y su evidencia histórica no pueden divergir.
El proyecto ya usa este patrón en `dispositivos.service.js` y en la migración.

**Alternatives considered**: registrar la acción después de un `UPDATE` ya
confirmado; rechazado porque deja estados sin historial ante una falla.

## Decision: Eventos después de commit en la sala histórica del cliente

**Decision**: emitir `alerta-accion` mediante `io.to(clientRoom(clienteId))`
solo luego de un commit exitoso. La emisión llevará el `cliente_id` de la
alerta, no el dueño actual del dispositivo.

**Rationale**: `socketRegistry` ya autentica el token y une sockets a
`cliente:<id>`, y MQTT ya publica eventos por esa sala. Emitir después del
commit evita que la UI vea una acción que luego fue revertida.

**Alternatives considered**: emitir antes del commit; rechazado por
inconsistencia visible. Crear salas por alerta; rechazado porque aumenta
complejidad sin mejorar el aislamiento de cliente.

## Decision: Actor sistema explícito con campos nullable existentes

**Decision**: la acción de generación tendrá `usuario_id = NULL` y
`usuario_username = 'sistema'`; las acciones manuales usarán `req.usuario.sub`
y `req.usuario.username`.

**Rationale**: El esquema existente ya permite actor nullable y el requisito
necesita distinguir generación automática de acciones humanas sin inventar
una identidad de usuario.

**Alternatives considered**: crear un usuario sistema en `usuarios`; rechazado
porque introduce credenciales y permisos innecesarios.

## Decision: Registro de actividad como proyección unificada

**Decision**: `auditoria.service.listar` incorporará acciones de
`alerta_acciones` con el formato de fila existente (`usuario_username`,
`accion`, `entidad`, `entidad_id`, `detalle`, `timestamp`), manteniendo sus
filtros, paginación y restricción admin.

**Rationale**: `auditor.html` ya consume ese contrato y así las acciones
aparecen junto con altas/bajas administrativas sin una segunda pantalla.

**Alternatives considered**: reemplazar la tabla `auditoria`; rechazado porque
rompe la trazabilidad administrativa ya implementada.
