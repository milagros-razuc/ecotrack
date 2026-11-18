# Implementation Plan: Reseteo de contraseña por administrador

**Branch**: `024-reset-password-admin` | **Date**: 2026-11-16 | **Spec**: [spec.md](./spec.md)

## Summary

Implementar `POST /api/usuarios/:id/reset-password` para `admin` y
`platform_admin`, con la autorización centralizada en
`puedeResetear(solicitante, objetivo)`. El `admin` queda limitado a usuarios
`comun` del mismo `cliente_id`; el `platform_admin` puede resetear usuarios
`admin` o `comun` de cualquier cliente, pero nunca a otro `platform_admin`, a sí
mismo ni a un usuario de su mismo rol. La operación actualiza credenciales y
auditoría en una única transacción y reutiliza `token_version` para invalidar
sesiones.

## Technical Context

**Language/Version**: Node.js CommonJS

**Primary Dependencies**: Express, pg, bcryptjs, jsonwebtoken, crypto, Zod,
Socket.IO, HTML/Tailwind/JavaScript

**Storage**: PostgreSQL 15. La migración nueva es
`backend/migrations/021_password_reset.sql`, que agrega únicamente
`password_temporal_expira`; `must_change_password` y `token_version` ya existen
y se reutilizan.

**Testing**: `node --test`; integración con `TEST_DATABASE_URL` mediante el runner
de `backend/scripts/run-migrations.js`

**Target Platform**: Backend detrás de Caddy y dashboard web estático

**Project Type**: Aplicación web multi-cliente con API REST

**Performance Goals**: Reset completo en menos de un minuto para el administrador y
una única transacción de actualización/auditoría por solicitud exitosa

**Constraints**: Sin contraseña temporal en texto plano persistido, logs o
auditoría; respuesta `Cache-Control: no-store`; aislamiento por JWT; no email;
`platform_admin` no puede usar las rutas tenant generales; migraciones repetibles.
El cambio de contraseña selecciona un schema Zod estricto según el scope
verificado: el token restringido solo acepta `passwordNueva`, mientras que el
token completo exige también `passwordActual`. El endpoint tiene límites
independientes por usuario e IP y cuenta rechazos de validación y política.
La política general usa mínimo 8 caracteres; la creación de cuentas privilegiadas
(`admin` y `platform_admin`) conserva un mínimo de 12, y la contraseña temporal
tiene un mínimo independiente de 12 con longitud por defecto 16.

## Constitution Check

- **PASS - Modular Boundaries**: ruta especial de reset, service, middleware,
  persistencia y frontend permanecen separados.
- **PASS - Secure By Default**: bcrypt, CSPRNG, autorización backend, expiración,
  intentos y sesión invalidada.
- **PASS - Validated Data Contracts**: Zod valida request; `cliente_id` no viene
  del cliente.
- **PASS - Testable Changes**: matriz pura y pruebas de ruta/integración.
- **PASS - Reliable and Observable**: migración SQL repetible y auditoría
  transaccional con IP/resultado.
- **PASS - Tenant Isolation**: `admin` consulta por `cliente_id` del JWT; la
  auditoría exitosa usa el `cliente_id` del objetivo.
- **PASS - Controlled and Auditable Access**: éxitos y rechazos por permisos
  registran actor, objetivo disponible, IP y resultado sin secretos.
- **PASS - Requirements**: implementa RF14, RF16-RF18, RF20, RI01, RI06, RI08 y
  RI17 sin modificar `backend/src/config/migrate.js`.

## Migration and execution

`backend/scripts/run-migrations.js` descubre archivos `NNN_*.sql` desde
`backend/migrations`, aplica desde la migración 016 y registra cada versión en
`schema_migrations`. La migración 021 debe usar `BEGIN;`, `COMMIT;` y agregar
idempotentemente solo `password_temporal_expira`; `must_change_password` y
`token_version` ya forman parte del esquema existente. `backend/src/test/platform-panel-schema.test.js`
debe incluir 021 en la lista, orden y comprobación de repetición.

## Endpoint mounting design

El router existente [usuarios.js](../../backend/src/routes/usuarios.js) aplica
`verificarRol('admin')` a todas sus rutas y el middleware
[cliente.js](../../backend/src/middleware/cliente.js) rechaza explícitamente a
`platform_admin`. Para no ampliar el acceso tenant:

1. extraer el handler del reset a un service/handler reutilizable;
2. montar la ruta exacta `/api/usuarios/:id/reset-password` antes de
   `app.use('/api/usuarios', verificarToken, extraerCliente, usuariosRouter)`;
3. protegerla con `verificarToken` y `verificarRol('admin', 'platform_admin')`;
4. dejar intactas las rutas GET/POST/PATCH/DELETE existentes, que siguen pasando
   por `extraerCliente` y solo admiten `admin`.

El service usa `req.usuario.clienteId` solo para `admin`; `platform_admin` puede
resolver cualquier cliente sin pasar por `extraerCliente`.

## Project Structure

```text
backend/
├── migrations/021_password_reset.sql
├── scripts/run-migrations.js
├── src/app.js
├── src/middleware/cliente.js
├── src/middleware/rol.js
├── src/routes/usuarios.js
├── src/services/usuarios.service.js
├── src/services/password-reset.service.js
├── src/services/auditoria.service.js
├── src/realtime/socketRegistry.js
└── src/test/
    ├── password-reset.service.test.js
    ├── password-reset.integration.test.js
    ├── auth-first-login.integration.test.js
    ├── auth.test.js
    └── platform-panel-schema.test.js
frontend/
├── usuarios.html
├── plataforma.html
└── shared/platform-panel-render.js
```

Los archivos de frontend y auditoría listados fueron verificados en el repositorio.
No se crea `backend/scripts/reset-admin-password.js`: la gestión del
`platform_admin` sigue perteneciendo a `scripts/seed-platform-admin.js` y queda
fuera de este endpoint.

## Complexity Tracking

No hay violaciones de la constitución ni nuevos proyectos. No se modifica el
middleware global para agregar `platform_admin` a las rutas tenant; se agrega una
única ruta especial de reset para preservar el aislamiento existente.
