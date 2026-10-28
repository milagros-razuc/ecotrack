# Quickstart: Reclamo seguro y aprovisionamiento

## Prerrequisitos

- Docker Compose con PostgreSQL, Mosquitto y el backend disponible.
- Node.js y dependencias de `backend/` instaladas.
- Una base PostgreSQL de pruebas cuyo nombre termine en `_test`.
- `TEST_DATABASE_URL` configurada y distinta de `DATABASE_URL`.

## Validar migración idempotente

1. Ejecutar el backend una vez para crear/actualizar el esquema.
2. Crear o reclamar un dispositivo, darlo de baja y confirmar que `cliente_id` es `NULL` y `activo` es `false`.
3. Confirmar que `token_reclamo_hash` es `NULL` y que no existen umbrales.
4. Reiniciar el backend.
5. Confirmar que el dispositivo sigue liberado, que nombre/ubicación son nulos, que el hash sigue nulo y que no reaparecen umbrales.
6. Repetir el arranque y comprobar que la migración no cambia `cliente_id`, `reclamado_en` ni genera tokens para dispositivos existentes.

## Validar aprovisionamiento y reclamo

Desde `backend/`, ejecutar el script de aprovisionamiento con el formato definido por su ayuda:

```powershell
node scripts/provision-device.js --codigo QUICKSTART-001
```

Con un administrador del cliente:

1. Reclamar usando el código y el token mostrado por el script.
2. Confirmar que el dispositivo queda activo, asociado al cliente y con `reclamado_en`.
3. Repetir el reclamo con el mismo token y esperar HTTP `409` sin cambios.
4. Intentar con un token alterado y esperar HTTP `409` sin cambios.
5. Intentar solo con el código y esperar HTTP `409` sin cambios.

## Validar transferencia e ingestión

1. Generar una lectura y una alerta para el cliente A.
2. Dar de baja el dispositivo.
3. Publicar una lectura mientras está sin dueño y confirmar que no aparece en lecturas, alertas, Socket.io ni API pública.
4. Ejecutar `node scripts/provision-device.js --rotate QUICKSTART-001` y reclamar con el token nuevo desde el cliente B.
5. Generar una lectura para B.
6. Confirmar que A conserva su lectura/alerta y B solo recibe el dato posterior a su reclamo.

## Suite automatizada

```powershell
cd backend
$env:TEST_DATABASE_URL = '<postgres-test-url>'
npm test
```

La cobertura específica debe incluir reclamo válido, token inválido, token reutilizado, dos reclamos concurrentes y reinicio con dispositivo liberado. Los resultados esperados y los contratos HTTP están documentados en [dispositivos.md](./contracts/dispositivos.md).
