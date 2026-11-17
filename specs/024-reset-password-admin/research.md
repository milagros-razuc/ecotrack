# Research: Reseteo de contraseña por administrador

## Decisiones

### Rol de plataforma

- **Decision**: usar exactamente `platform_admin`, que ya está permitido por la
  migración `016_platform_admin_role.sql`, creado por
  `backend/scripts/seed-platform-admin.js` y validado por
  `backend/src/middleware/platformAdmin.js`.
- **Rationale**: es el valor real de `usuarios.rol`; no se agrega ni se renombra
  ningún rol.
- **Alternatives considered**: un nombre alternativo para el rol queda descartado
  porque no existe en el constraint ni en el seed actual.

### Migración y runner

- **Decision**: crear `backend/migrations/021_password_reset.sql` con `BEGIN;`,
  `COMMIT;`, `ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS` únicamente para
  `password_temporal_expira TIMESTAMPTZ NULL`. `must_change_password` ya existe
  y es la única marca de cambio obligatorio consumida por autenticación.
- **Rationale**: `backend/scripts/run-migrations.js` descubre y aplica las
  migraciones numeradas desde 016, registra versiones en `schema_migrations` y las
  pruebas de `platform-panel-schema.test.js` verifican orden y repetibilidad.
- **Alternatives considered**: modificar `backend/src/config/migrate.js` se descarta
  porque el esquema de esta feature pertenece al historial de migraciones.
  `token_version` ya existe y se reutiliza.

### Matriz de autorización

- **Decision**: implementar una única función pura
  `puedeResetear(solicitante, objetivo)`.
- **Reglas**: `admin` solo puede resetear `comun` del mismo cliente;
  `platform_admin` puede resetear `admin` o `comun` de cualquier cliente. Nadie
  puede resetear a un `platform_admin`, a sí mismo o a un usuario de su mismo rol.
- **Rationale**: la matriz queda aislada y testeable sin base de datos. El service
  carga el rol del solicitante desde la base, no confía únicamente en el JWT.
- **Alternatives considered**: repartir reglas entre middleware, route y frontend
  permitiría inconsistencias y no satisface el contrato de función única.

### Montaje de ruta

- **Decision**: montar solo `/api/usuarios/:id/reset-password` antes del router
  tenant general, con `verificarToken` y `verificarRol('admin', 'platform_admin')`.
- **Rationale**: `routes/usuarios.js` aplica `verificarRol('admin')` globalmente y
  `middleware/cliente.js` rechaza `platform_admin`; mover la ruta especial evita
  ampliar GET/POST/PATCH/DELETE al rol de plataforma.
- **Alternatives considered**: cambiar el middleware global o agregar
  `platform_admin` al router completo rompería el límite de permisos.

### Auditoría

- **Decision**: reutilizar `auditoriaService.registrarEnTransaccion` y `actor_tipo`
  de `018_audit_actor.sql`, con `cliente_id` igual al del usuario objetivo.
- **Rationale**: coincide con el patrón usado por `plataforma.service.js` y permite
  que la auditoría sea visible en el tenant afectado. El detalle JSON contiene IP y
  resultado, nunca contraseña, hash o token.
- **Alternatives considered**: usar el cliente del actor rompería la visibilidad
  del administrador del cliente objetivo.

## Resultado

No quedan decisiones técnicas pendientes para el diseño.
