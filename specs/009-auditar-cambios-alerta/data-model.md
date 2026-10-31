# Data Model: Auditar cambios de estado de alertas

## `alertas`

Registro existente con `id`, `cliente_id` histórico, estado (`pendiente` o
`atendida`), comentario opcional y timestamp de generación.

## `alerta_acciones`

| Campo | Regla |
|---|---|
| `id` | Identificador inmutable y desempate de orden. |
| `alerta_id` | Referencia obligatoria a `alertas`. |
| `cliente_id` | Debe coincidir con `alertas.cliente_id`. |
| `usuario_id` | Nullable para generación automática y eliminación posterior del usuario. |
| `usuario_username` | Copia del nombre en el momento del hecho. |
| `accion` | `generar_alerta`, `marcar_atendida` o `reabrir_alerta`. |
| `detalle` | Comentario opcional o detalle de generación. |
| `timestamp` | Fecha de la acción. |

La tabla ya dispone de índices para listar por cliente/alerta/fecha y por
cliente/fecha. No se agrega `alertas_historial`.

## `auditoria`

Se agrega una fila por transición válida con `cliente_id`, actor,
`usuario_username`, `accion = cambiar_estado_alerta`, `entidad = alerta`,
`entidad_id = alerta.id`, detalle y timestamp. El nombre se conserva aunque se
elimine la cuenta.

## Relaciones, aislamiento y transiciones

- Una alerta tiene cero o muchas acciones históricas.
- Cada acción debe pertenecer al mismo cliente de su alerta.
- Las consultas resuelven la alerta con `id` y `cliente_id` del token.
- El historial es append-only desde la interfaz.

```text
pendiente -- marcar_atendida --> atendida
atendida  -- reabrir_alerta  --> pendiente
```

Estado y acción histórica se confirman juntos. La escritura posterior en
`auditoria` no forma parte de esa transacción y no puede revertirla.
