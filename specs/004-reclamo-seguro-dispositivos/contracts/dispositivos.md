# Contrato de dispositivos

## Aprovisionamiento operativo

El script `backend/scripts/provision-device.js <codigo>` crea un dispositivo nuevo sin dueño, inactivo, sin nombre, ubicación ni umbrales, genera un token nuevo y lo imprime una sola vez. Si el código ya existe, termina con error y no modifica ninguna columna ni token.

El script `backend/scripts/provision-device.js --rotate <codigo>` solo funciona cuando el código existe y el dispositivo no tiene dueño. Reemplaza el hash anterior por el de un token nuevo, invalida el token anterior y lo imprime una sola vez. Si el dispositivo tiene dueño, el código no existe o la operación no puede completarse, termina con error sin modificar el registro. Nunca hay más de un token válido.

La salida estándar no imprime hashes ni credenciales de base de datos. El token no se guarda en archivos ni en texto plano.

## API protegida

Todas las rutas requieren sesión válida y `cliente_id` derivado del token. Las operaciones de escritura requieren rol `admin`.

### Reclamar un dispositivo

`POST /api/dispositivos`

Request:

```json
{
  "codigo": "ESP32-001",
  "nombre": "Nodo principal",
  "ubicacion": "Invernadero",
  "token": "token-de-reclamo"
}
```

Success `200`:

```json
{
  "ok": true,
  "codigo": "ESP32-001",
  "reclamadoEn": "2026-10-27T23:48:00.000Z"
}
```

Rejected `409 Conflict`:

```json
{
  "error": "No se pudo reclamar el dispositivo"
}
```

El estado `409` y el formato de error son exactamente los mismos para:

1. código inexistente;
2. dispositivo con dueño existente;
3. token inválido o ausente;
4. token ya usado.

El error no revela cuál de esas condiciones provocó el rechazo, y el rechazo no modifica el dispositivo.

### Dar de baja

`DELETE /api/dispositivos/:codigo`

Success `204 No Content`, sin cuerpo y sin token en la respuesta. El dispositivo queda sin dueño, inactivo, sin nombre, ubicación ni umbrales, con `token_reclamo_hash = NULL`. Solo el operador puede volver a habilitar un ciclo mediante `scripts/provision-device.js --rotate <codigo>`.

### Compatibilidad de frontend

El formulario existente de alta en `frontend/index.html` agrega el campo visible `token de reclamo`. El envío conserva `POST /api/dispositivos` y agrega `token` al JSON junto con `codigo`, `nombre` y `ubicacion`. Ante `409`, `frontend/shared/app.js` o el manejador existente muestra un mensaje genérico de reclamo rechazado, sin distinguir la causa. No se incluye rediseño.

## Migración

La migración agrega las columnas del hash y `reclamado_en` sin generar tokens para dispositivos existentes, tengan o no dueño. El backfill de `cliente_id` de dispositivos solo corre cuando la columna se crea por primera vez. Los seeds de umbrales solo se insertan para un dispositivo con dueño.

## Ingesta MQTT

Se conserva `ecotrack/<codigo>/lecturas` y su payload actual. Si el dispositivo no tiene dueño, el mensaje se descarta antes de persistir lectura, alerta o emitir eventos.

## Auditoría

Las operaciones exitosas de aprovisionamiento, rotación, reclamo y baja registran una entrada en auditoría con el usuario/cliente y código cuando existe un actor autenticado. Los detalles no incluyen el token, hash ni payload secreto.
