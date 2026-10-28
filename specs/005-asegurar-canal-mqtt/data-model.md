# Data Model: Asegurar canal MQTT

Esta feature no cambia tablas PostgreSQL ni el modelo de ACL o credenciales. Define únicamente
las entidades operativas necesarias para el canal seguro.

## Broker Certificate Bundle

- **Representa**: material de identidad y confianza usado por Mosquitto.
- **Campos/archivos**:
  - `ca.crt`: certificado público de la CA privada, versionable.
  - `broker.crt`: certificado de servidor firmado por `ca.crt`, con SAN para todos los
    nombres/IP operativos.
  - `broker.key`: clave privada del broker, no versionable.
- **Relaciones**: `broker.crt` encadena a `ca.crt`; `broker.key` corresponde al certificado.
- **Validación**: el listener TLS debe rechazar certificados inválidos; el hostname usado por
  cada cliente debe estar en SAN.

## MQTT Client TLS Configuration

- **Representa**: configuración runtime de un cliente MQTT.
- **Backend**: `MQTT_HOST`, `MQTT_PORT=8883`, `MQTT_CA_PATH`, `MQTT_USER`, `MQTT_PASS`.
- **ESP32**: host, puerto 8883, CA embebida en el firmware/configuración local, usuario y
  contraseña actuales.
- **Validación**: CA obligatoria, validación de hostname activa, NTP previo en el ESP32 y sin
  fallback inseguro.

## MQTT Reading Message

- **Tópico**: `ecotrack/<deviceId>/lecturas`.
- **Payload**: JSON vigente con `temperatura`, `humedad` y `luminosidad`.
- **Regla**: no se agregan campos nuevos en este spec; backend mantiene validación y asociación
  actuales. La incorporación de `ts` se define en el spec 006.
