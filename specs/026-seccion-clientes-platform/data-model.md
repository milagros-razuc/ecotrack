# Data Model: Seccion Clientes de plataforma

## Cliente

- `id`: identificador existente.
- `nombre`: nombre visible.
- `es_plataforma`: excluye al cliente interno de plataforma.

## Usuario administrador

- `id`: objetivo elegible del reset.
- `username`: identificación visible.
- `nombre`: nombre visible.
- `rol`: debe ser `admin`.
- `cliente_id`: asociación con el cliente.

Un administrador existe si el usuario permanece en `usuarios`. Usuarios eliminados
no aparecen. No se agrega una columna de estado de usuario.

## Relación

- Un cliente puede tener cero, uno o varios usuarios con `rol = 'admin'`.
- El administrador principal es el usuario con menor `id` entre los
  administradores activos del cliente.
- Si hay varios, el listado muestra el principal y la cantidad total; el reset
  solo puede apuntar al principal.
- El resto de usuarios no se muestra como administrador en la fila principal,
  pero sí en la vista «Usuarios por cliente».

## Resultado de reset

Se reutilizan los campos existentes de la Feature 024:

- `password_hash`
- `password_temporal_expira`
- `must_change_password`
- `token_version`

La contraseña temporal solo existe en memoria durante la respuesta y se elimina
de la interfaz al cerrar el diálogo.

## Auditoría

Se reutiliza `reset_password` con cliente objetivo, usuario objetivo, actor,
fecha/hora, IP y resultado. No contiene contraseña temporal, hash ni token.
