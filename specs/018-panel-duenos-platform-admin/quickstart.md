# Quickstart de validación: Panel de plataforma

## Prerrequisitos

- PostgreSQL de pruebas levantado como `ecotrack_pg_test` y publicado en
  `127.0.0.1:5433`.
- `TEST_DATABASE_URL` apuntando a `ecotrack_test` en ese puerto, por ejemplo:
  `postgresql://<usuario>:<password>@127.0.0.1:5433/ecotrack_test`.
- No usar el PostgreSQL de desarrollo en `5432`; las guardas existentes deben
  rechazar cualquier base que no sea `*_test` o `hardening_*`.
- El inicializador `backend/src/config/migrate.js` crea el esquema base mediante
  SQL inline, incluyendo las estructuras correspondientes a `014` y `015`, y
  no ejecuta archivos de `backend/migrations/`.
- El script explícito `backend/scripts/run-migrations.js` aplica `016` en
  adelante en orden numérico sobre una base cuyo esquema base ya fue inicializado.
  Se invoca desde el helper de tests, no al arrancar el backend, es repetible y
  no envuelve las migraciones en una transacción adicional.
- Registra las versiones aplicadas en `schema_migrations`, no detecta cambios
  posteriores en una migración ya registrada y exige una migración nueva para
  cualquier modificación. Si `016` a `019` fueron aplicadas manualmente, las
  ejecuta una vez más y luego las registra; toda migración nueva debe ser
  repetible. No es importado por `app.js` ni por `migrate.js`.
- Usuario `platform_admin` creado por el seed local idempotente.
- Al menos dos clientes operativos y dispositivos fabricados, reclamados y
  enrolados.
- Para la prueba manual: una placa real enrolable y acceso al broker/backend.

## Validación automatizada

Desde `backend/`:

```powershell
node --test --test-timeout=30000 --test-concurrency=1 src/test/*platform*.test.js
```

La suite debe cubrir:

- 401 sin token, 401 con token inválido y 403 con roles no autorizados.
- T2 contra `/api/dispositivos`, `/api/dispositivos/estado` y el reset existente.
- Listado global, filtro `cliente_id`, exclusión del cliente “plataforma”, paginación
  y lista blanca.
- Estados de ciclo de vida y separación entre última lectura y última conexión.
- Última lectura calculada con ventana temporal y `null` explícito cuando no hay
  lectura dentro de la ventana.
- Reset, idempotencia, auditoría tenant y actor sanitizado.
- Rate limit propio del panel: 10 solicitudes por 15 minutos.
- Seed repetido sin duplicar cliente especial ni usuario.

La línea base medida en `ecotrack_pg_test` (`127.0.0.1:5433`) fue de 266 de 299:
1 fallo conocido (subtest 13 de continuidad, causa sin diagnosticar) y 32 tests
`todo`.

## Prueba manual final con placa real

1. Iniciar sesión como `platform_admin` y abrir el panel.
2. Confirmar que aparecen dos clientes operativos y que “plataforma” no aparece en
   clientes, filtros ni conteos.
3. Localizar una placa ESP32 real enrolada y verificar estado, firmware reportado,
   última lectura y última conexión por separado.
4. Confirmar “Resetear credenciales”.
5. Verificar que la placa queda reclamada sin enrolar y conserva `reclamado_en`.
6. Repetir el reset y verificar `already_reset`.
7. Re-enrolar la placa mediante el flujo existente, publicar una lectura y confirmar
   que el panel vuelve a mostrar `enrolado`, nueva última lectura y última conexión.
8. Consultar la auditoría del cliente y confirmar la columna
   `actor_tipo = platform_admin` y el actor “Administración de la plataforma”, sin
   nombre/email del usuario global ni secretos.

## Referencias

- [data-model.md](./data-model.md)
- [contracts/platform-api.md](./contracts/platform-api.md)
- [contracts/authorization-and-audit.md](./contracts/authorization-and-audit.md)
- [contracts/ui.md](./contracts/ui.md)
