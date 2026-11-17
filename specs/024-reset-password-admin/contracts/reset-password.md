# Contract: `POST /api/usuarios/:id/reset-password`

## Authorization and mounting

JWT requerido. La ruta exacta se monta antes del router tenant general con
`verificarToken` y `verificarRol('admin', 'platform_admin')`.

El resto de `/api/usuarios` conserva `verificarRol('admin')` y
`extraerCliente`; `platform_admin` no obtiene acceso a listar, crear, editar o
eliminar usuarios por este cambio.

El service carga el solicitante desde la base y aplica
`puedeResetear(solicitante, objetivo)`.

## Request

```http
POST /api/usuarios/42/reset-password
Authorization: <jwt>
```

No se acepta `cliente_id` en el cuerpo.

## Success

`200 OK` with `Cache-Control: no-store`:

```json
{
  "usuario": { "id": 42, "username": "operador", "nombre": "Operador" },
  "password_temporal": "generated-once",
  "expira_en": "2026-11-17T22:38:24.585Z"
}
```

El texto temporal solo aparece en esta respuesta y no se escribe en logs,
auditoría ni errores.

## Errors

- `401`: token ausente, inválido o sesión invalidada.
- `403`: actor no permitido, mismo rol, objetivo `platform_admin` o auto-reset.
- `404`: objetivo inexistente; también objetivo de otro cliente cuando el actor es
  `admin`, sin revelar si existe.
- `500`: fallo transaccional, sin contraseña en la respuesta.

## Auditoría

El evento usa `accion = 'reset_password'`, `entidad = 'usuarios'`,
`actor_tipo` del mecanismo de la migración 018 y `cliente_id` del usuario
objetivo. El detalle JSON registra IP y resultado, nunca la contraseña.

## UI surfaces

- `frontend/usuarios.html`: para `admin`, mostrar "Resetear contraseña" solo junto
  a usuarios `comun` del mismo cliente.
- `frontend/plataforma.html`, solapa **Clientes**: mostrar a
  `platform_admin` el listado de usuarios por cliente y la acción para objetivos
  `admin` y `comun`. No mostrarla para `platform_admin` ni para sí mismo.

## Login and mandatory change

Una temporal válida devuelve `mustChangePassword: true`; una temporal vencida o
invalidada devuelve el error genérico de credenciales. Mientras esté pendiente,
solo `GET /api/auth/me` y `POST /api/auth/change-password` quedan permitidos.
