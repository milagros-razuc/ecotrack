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

Una temporal válida devuelve `mustChangePassword: true` y un JWT restringido con
`scope: "change-password"` y expiración máxima de 10 minutos. La respuesta
exitosa del login restringido lleva `Cache-Control: no-store`, no incluye campos
extra ni un JWT completo. Una temporal vencida o invalidada devuelve el mismo
status y cuerpo que cualquier credencial inválida y consume los rate limiters
existentes. Mientras esté pendiente, solo `GET /api/auth/me` y
`POST /api/auth/change-password` quedan permitidos por una allowlist central.
El estado pendiente reutiliza `usuarios.must_change_password`, que ya es la
fuente consumida por login, middleware de autenticación y handshake de Socket.IO;
la restricción se aplica si `scope` o el estado de base indican cambio pendiente.

`POST /api/auth/change-password` selecciona el schema exclusivamente desde el
scope del JWT ya verificado:

- token restringido (`scope = "change-password"`): body estricto con solo
  `passwordNueva`; si incluye `passwordActual`, se rechaza;
- token completo: body estricto con `passwordActual` y `passwordNueva`
  obligatorias.

Con token restringido, dentro de la transacción se bloquea el usuario con
`SELECT ... FOR UPDATE` y se exige que `must_change_password = true` y que la
temporal no esté vencida, consultando ambos valores desde la base. Si alguna
condición falla, se devuelve el mismo status y cuerpo genérico que una
credencial inválida. Luego se rechazan contraseñas de menos de 8 caracteres,
comunes o iguales a la temporal. Con token completo se verifica la contraseña
actual y se aplica la misma política. Las cuentas privilegiadas mantienen un
mínimo de 12 caracteres y las contraseñas temporales se generan con un mínimo
independiente de 12 caracteres.

El endpoint aplica rate limiting independiente por usuario y por IP, y los
rechazos de validación o política consumen el límite. Registra éxitos y
rechazos sin secretos en auditoría, limpia
`password_temporal_expira`, incrementa `token_version` en una única transacción
y devuelve un JWT completo nuevo con `Cache-Control: no-store`.
