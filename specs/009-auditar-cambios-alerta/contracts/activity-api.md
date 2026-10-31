# Contrato: Registro de actividad

## `GET /api/auditoria`

Requiere rol `admin`. Los cambios de alerta aparecen una sola vez en la respuesta unificada,
desde `alerta_acciones`, con:

- `accion`: `cambiar_estado_alerta`
- `entidad`: `alerta`
- `entidad_id`: id de la alerta
- `usuario_username`: nombre conservado al ejecutar la operación
- `detalle`: estado anterior, estado nuevo y comentario disponible
- `timestamp`: fecha de registro
- `origen`: `alerta_acciones` (la identidad de una fila es `origen + id`)

La rama de `auditoria` excluye `accion = cambiar_estado_alerta` solo de esta
consulta unificada; la tabla `auditoria` conserva el registro y
`GET /api/auditoria?accion=cambiar_estado_alerta` devuelve una respuesta vacía.
Los demás filtros, paginación, autorización y aislamiento por cliente
conservan su comportamiento actual.
