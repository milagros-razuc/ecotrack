# Quickstart de validación: Panel de plataforma

## Prerrequisitos

- Docker Compose levantado con PostgreSQL, backend, frontend y broker.
- `TEST_DATABASE_URL` configurada para la base aislada existente.
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

Las guardas existentes deben rechazar cualquier base que no cumpla el contrato actual
de `TEST_DATABASE_URL`.

La línea base previa registrada es 76/77 tests de integración: 76 pasaron y 1 falló
en el subtest 13 de continuidad por falta de partición mensual; el subtest T011 pasó.

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
