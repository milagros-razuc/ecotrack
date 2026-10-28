# Research: Asegurar canal MQTT

## Decisión 1: TLS de servidor con CA privada y certificado SAN

- **Decisión**: Generar una CA privada autofirmada para el entorno y un certificado de
  servidor del broker firmado por esa CA. El certificado incluirá SAN para `mosquitto`,
  `localhost` y las IP/nombres usados por el ESP32. Mosquitto escuchará en `8883` con
  `cafile`, `certfile`, `keyfile` y TLS 1.2 como mínimo. Se conserva autenticación por
  usuario/contraseña y la ACL existente; no se introduce mTLS.
- **Rationale**: Cifra lecturas y credenciales sin modificar el modelo actual de
  identidad/autorización. La validación moderna depende de SAN, y una CA separada permite
  distribuir solo confianza pública y rotar el certificado hoja.
- **Alternativas consideradas**:
  - Mantener `1883` además de `8883`: descartado porque deja disponible una ruta operativa
    sin cifrado.
  - Usar un certificado de hoja autofirmado: descartado por peor rotación y distribución
    de confianza.
  - mTLS: descartado por ampliar el alcance a certificados, provisión y renovación de cada
    dispositivo.
  - CA pública: descartada para nombres internos y entorno local.

## Decisión 2: Backend con CA por ruta y validación obligatoria

- **Decisión**: El cliente MQTT del backend usará `mqtts://`, leerá el CA desde la ruta
  indicada por `MQTT_CA_PATH`, exigirá `rejectUnauthorized: true` y validará hostname.
  Compose montará el CA como archivo de solo lectura y configurará `MQTT_PORT=8883`.
- **Rationale**: La CA no se incrusta en código ni se confía en todo el almacén global.
  Una ruta explícita hace visible el requisito operativo y permite rotación sin cambiar
  lógica de ingesta.
- **Alternativas consideradas**:
  - CA inline en variable de entorno: descartada por formato, rotación y manejo menos
    claro.
  - Almacén global del sistema: descartado porque no garantiza la CA privada esperada.
  - `rejectUnauthorized: false`: descartado porque permitiría una conexión no validada.

## Decisión 3: Validación TLS del ESP32 precedida por NTP

- **Decisión**: Cambiar a `WiFiClientSecure`, sincronizar la hora por NTP después de
  conectarse a WiFi y antes del primer handshake MQTT, cargar la CA con `setCACert`, y
  usar el puerto `8883`. Si NTP falla, no se conecta de forma insegura y las lecturas
  siguen el flujo del buffer.
- **Rationale**: La validación temporal del certificado necesita un reloj válido; NTP
  evita fallos por fecha de arranque. `setInsecure()` no es aceptable.
- **Alternativas consideradas**:
  - Fecha fija: descartada por reinicios, deriva y renovación de certificados.
  - TLS sin NTP: descartado por fallos intermitentes de validación.
  - `setInsecure()`: descartado porque elimina la autenticación del broker.

## Decisión 4: Ring buffer fijo en RAM

- **Decisión**: Añadir un buffer circular de `PendingReading` en RAM, con capacidad
  compilable `PENDING_READING_CAPACITY` y valor predeterminado 32. Se conserva FIFO
  mientras hay capacidad; cuando se llena se sobrescribe la entrada más antigua. Tras
  reconectar se reenvía la cabeza antes de lecturas nuevas. Una entrada se retira solo
  si `publish()` devuelve aceptación; ante fallo se conserva y se detiene el vaciado.
  El buffer no sobrevive un reinicio.
- **Rationale**: Tiene memoria acotada, inserción/extracción O(1), no requiere asignación
  dinámica y satisface descarte de lecturas viejas. No cambia el payload MQTT.
- **Alternativas consideradas**:
  - Buffer dinámico: descartado por fragmentación de heap en el ESP32.
  - Flash/NVS: descartado por desgaste y alcance mayor; se documenta la pérdida al reinicio.
  - Descartar la lectura nueva: descartado porque se requiere conservar las más recientes.
  - QoS 1/deduplicación: reservado para otra feature; aumentaría el contrato y el alcance.

## Decisión 5: Prueba de ACL en el backend

- **Decisión**: Crear una prueba de integración que use dos usuarios MQTT de prueba,
  publique desde A en el tópico propio y en el de B, y observe la ingesta del backend
  durante una ventana acotada. La publicación cruzada se verifica por ausencia del
  mensaje/lectura, compatible con MQTT 3.1.1, y no por un error de publicación.
- **Rationale**: Comprueba la propiedad observable que importa: el backend nunca procesa
  el mensaje cruzado, incluso si el broker lo descarta silenciosamente.
- **Alternativas consideradas**:
  - Afirmar un error en el publicador: descartado porque no es una garantía de MQTT 3.1.1.
  - Probar solo el archivo ACL: descartado porque no valida la integración broker-backend.

## Decisión 6: Material de certificados

- **Decisión**: Versionar únicamente el CA público de desarrollo. Mantener claves privadas
  (`*.key`) y certificados/credenciales generados que puedan contener secretos fuera de Git
  mediante `.gitignore`. Documentar comandos OpenSSL reproducibles y la necesidad de
  regenerar material local.
- **Rationale**: Permite que backend y firmware compartan la raíz de confianza sin exponer
  la clave de firma ni la clave privada del broker.
- **Alternativas consideradas**:
  - Versionar todo el material: descartado por exposición de claves privadas.
  - Generar certificados automáticamente durante cada arranque: descartado porque cambia
    la identidad del broker y dificulta el firmware.
