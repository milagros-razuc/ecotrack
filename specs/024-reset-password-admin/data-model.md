# Data Model: Reseteo de contraseña por administrador

## `usuarios`

La migración `backend/migrations/021_password_reset.sql` agrega:

| Campo | Tipo/estado | Reglas |
|---|---|---|
| `password_temporal_expira` | `TIMESTAMPTZ NULL` | `NULL` sin emisión pendiente; login temporal rechaza después de la fecha. |

`must_change_password` ya existe en `usuarios` y es el único indicador de que la
contraseña temporal requiere cambio; login, middleware y Socket.IO lo consumen.
`token_version` ya existe en `usuarios` y se incrementa para invalidar JWT y
sesiones previas; no se vuelve a crear ni migrar. `password_hash` contiene solo
bcrypt. El rol real admite `comun`, `admin` y `platform_admin`, según la migración
016.

## Autorización

`puedeResetear(solicitante, objetivo)` recibe objetos con `id`, `rol` y
`cliente_id`:

| Solicitante | Objetivo | Resultado |
|---|---|---|
| `admin` | `comun` del mismo cliente | permitido |
| `admin` | otro cliente, `admin`, `platform_admin` o sí mismo | rechazado |
| `platform_admin` | `admin` o `comun` de cualquier cliente | permitido |
| cualquier rol | `platform_admin`, mismo rol o sí mismo | rechazado |

El service carga el solicitante desde la base para obtener su rol vigente. Para un
`admin`, un objetivo inexistente o de otro `cliente_id` responde 404 genérico. Las
violaciones de matriz sobre un objetivo conocido responden 403.

## `auditoria`

Se reutilizan `actor_tipo` y `registrarEnTransaccion` de la migración 018:

- `accion = 'reset_password'`;
- `entidad = 'usuarios'`;
- `entidad_id` igual al objetivo;
- `cliente_id` igual al `cliente_id` del objetivo;
- actor e `actor_tipo` según el solicitante;
- detalle JSON con IP y resultado, sin password, hash ni token.

Los éxitos y rechazos por permisos se auditan. Una solicitud a un objetivo
inexistente no tiene cliente objetivo para registrar y conserva su respuesta
sanitizada.

## Transiciones

1. Emisión: bcrypt temporal + `must_change_password=true` +
   `password_temporal_expira=now()+24h` + `token_version+1` + auditoría.
2. Reemisión: sustituye hash y expiración; la emisión anterior queda inválida.
3. Cambio obligatorio: limpia marca/expiración y vuelve a incrementar `token_version`.
4. Vencimiento o cinco intentos fallidos: la emisión no permite login posterior.
