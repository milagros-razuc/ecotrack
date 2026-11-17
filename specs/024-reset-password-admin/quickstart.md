# Quickstart de validación

## Prerrequisitos

1. Definir `TEST_DATABASE_URL` para una base `*_test` o `hardening_*`.
2. Ejecutar el runner desde `backend/`:

```powershell
node scripts/run-migrations.js
```

Debe aplicar `021_password_reset.sql` después de 020 y poder ejecutarse
nuevamente sin error.

## Validación automatizada

Desde `backend/`:

```powershell
npm test -- --test-name-pattern "password|reset|auth|migration"
```

Validar como mínimo:

1. `platform-panel-schema.test.js` incluye 021 en orden, lectura desde
   `backend/migrations` y ejecución repetible.
2. `puedeResetear` permite `admin` -> `comun` del mismo cliente y
   `platform_admin` -> `admin`/`comun` de cualquier cliente.
3. Rechaza `admin` -> otro cliente con 404 genérico, además de mismo rol,
   `platform_admin` y auto-reset con 403.
4. El endpoint devuelve una temporal una sola vez, no la persiste en claro y fija
   `Cache-Control: no-store`.
5. Se invalidan JWT/sockets previos, vence en 24 horas y el segundo reset reemplaza
   el primero.
6. La auditoría exitosa y los rechazos por permisos usan el `cliente_id` del
   objetivo, `actor_tipo`, IP y ningún secreto.
7. El login temporal queda restringido hasta el cambio obligatorio.

## Validación manual de interfaces

1. En `frontend/usuarios.html`, iniciar sesión como `admin` y comprobar que el
   botón solo aparece sobre usuarios `comun` del mismo cliente.
2. En `frontend/plataforma.html`, abrir la solapa **Clientes** como
   `platform_admin`, seleccionar un cliente y comprobar el listado de usuarios.
3. Confirmar que el botón aparece sobre usuarios `admin` y `comun`, pero no sobre
   `platform_admin` ni sobre el propio usuario.
4. Confirmar el reset, copiar la temporal y cerrar el resultado; el valor no debe
   volver a mostrarse.

Los formatos de request/response están en
[contracts/reset-password.md](./contracts/reset-password.md); las entidades y
transiciones están en [data-model.md](./data-model.md).
