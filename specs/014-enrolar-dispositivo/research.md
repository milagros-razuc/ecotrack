# Research: Enrolamiento seguro de dispositivo

## Decisión 1: Separar reclamo y enrolamiento

**Decision**: El dashboard consume el código de alta y el token de un solo uso
mediante el flujo existente `POST /api/dispositivos`. El endpoint nuevo recibe
únicamente `device_id` y `device_secret`; consulta el `cliente_id` ya vinculado.

**Rationale**: Coincide con el flujo confirmado para el firmware y evita enviar
tokens administrativos al equipo. También permite que el body del endpoint sea
estable y mínimo.

**Alternatives considered**: Aceptar `activation_code` y `token` desde firmware
fue descartado porque contradice el flujo de reclamo previo y expone secretos de
control en un canal que solo necesita autenticación de fábrica.

## Decisión 2: Hash y validación

**Decision**: Mantener solo SHA-256 del secreto de fábrica en
`dispositivos_fabrica.factory_secret_hash`; comparar el secreto recibido con
`crypto.timingSafeEqual` sobre buffers de igual longitud. La consulta se bloquea
por `device_id` dentro de una transacción.

**Rationale**: La tabla ya iniciada por `014_factory_devices.sql` expresa el
contrato de exportación sin almacenar PIN/secreto. La comparación constante evita
una salida temporal obvia una vez encontrado el registro.

**Alternatives considered**: Guardar el secreto cifrado o reutilizar el hash del
token de reclamo fue descartado porque no representa el secreto de fábrica y
complica el proceso reproducible de exportación.

## Decisión 3: Adaptador dynamic-security reutilizable

**Decision**: Extraer la secuencia MQTT del script `scripts/provision-mqtt-dynamic.js`
a un servicio reutilizable con cliente admin, respuesta correlacionada, timeout y
compensación. Cada rol permite `publishClientSend` sobre
`ecotrack/<deviceId>/lecturas`, permite el propio patrón de suscripción con
prioridad mayor y deniega explícitamente `subscribePattern ecotrack/#`.

**Rationale**: El spike demostró que la denegación explícita de suscripción es
necesaria; duplicar la lógica produciría divergencia entre CLI y endpoint.

**Alternatives considered**: Invocar el script como subproceso fue descartado por
exponer secretos/procesos y dificultar transacciones y tests con doble MQTT.

## Decisión 4: Orden transaccional y rollback

**Decision**: Reservar el dispositivo con `SELECT ... FOR UPDATE`, crear MQTT,
persistir el vínculo/estado y consumir el resultado solo dentro de una transacción
local. Si falla persistencia después de crear MQTT, borrar cliente y rol; si falla
MQTT, hacer rollback SQL y no devolver credenciales.

**Rationale**: Evita dos estados visibles: dispositivo reclamado sin identidad o
identidad dinámica sin vínculo local. Un incidente de compensación fallida se
registra sanitizado y queda pendiente, nunca se presenta como éxito.

## Decisión 5: HTTPS y certificados

**Decision**: Añadir nginx en 443, proxy solo al backend interno en 3000, y emitir
con OpenSSL un certificado firmado por la CA de `codigo-esp32-mosquitto/ecotrack_ca.h`
con SAN DNS igual a `serverHost`. La clave y el certificado operativo se generan
en una ruta local ignorada y se montan como solo lectura.

**Rationale**: El firmware ya usa CA embebida para TLS MQTT; la misma CA permite
validar el backend sin `setInsecure`. El SAN DNS evita depender de IPs cambiantes.

**Alternatives considered**: Exponer directamente el puerto 3000, usar un
certificado autofirmado no confiable por el firmware o usar SAN de IP fueron
descartados por el requisito HTTPS y la identidad `serverHost`.

## Decisión 6: Rate limit y error uniforme

**Decision**: Crear un limiter específico para enrolamiento con claves combinadas
IP + `device_id`, límite configurable por entorno y respuesta genérica idéntica a
validaciones fallidas. No se usa `skipSuccessfulRequests`, porque toda solicitud
consume presupuesto contra fuerza bruta.

**Rationale**: Evita enumeración y mantiene el contrato de rechazo indistinguible.
Los logs solo registran una categoría sanitizada y un identificador truncado o
hash no reversible.
