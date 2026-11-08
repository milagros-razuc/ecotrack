# Research: Proteger portal SoftAP con WPA2

## Decision 1: Usar el código compartido solicitado

- **Decision**: Configurar el SoftAP con `EcoTrack.123` para todos los dispositivos.
- **Rationale**: El usuario prioriza una clave fácil de distribuir y acepta que sea conocida y compartida.
- **Risk accepted**: Quien conozca el repositorio, manual o código puede asociarse a cualquier SoftAP activo. WPA2 protege las tramas frente a personas que no conocen la clave, pero no autentica individualmente al técnico ni garantiza privacidad frente a clientes asociados. El portal sigue en HTTP.
- **Alternatives considered**: Clave aleatoria por dispositivo desde NVS; se sustituye por la decisión explícita del usuario.
- **Source check**: La [API Wi-Fi de Arduino-ESP32](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/wifi.html) documenta el parámetro `passphrase` para `softAP`; con contraseña, el modo por defecto es WPA2-PSK.

## Decision 2: Eliminar credenciales de fábrica del SoftAP

- **Decision**: Retirar `softApPass` de `DeviceConfig` y del generador/etiqueta de fábrica.
- **Rationale**: El firmware usa la constante pública; mantener una credencial individual produciría una segunda fuente contradictoria y ya no sería necesaria para abrir la red.
- **Compatibility**: El nuevo firmware ignora el `softApPass` sobrante en imágenes NVS existentes; no requiere migración del esquema por este campo.

## Decision 3: Retirar el PIN

- **Decision**: Eliminar `/unlock`, pantalla PIN, contador de intentos, bloqueo y generación/rotulado del PIN.
- **Rationale**: La asociación WPA2 pasa a ser la única puerta de entrada del flujo simplificado pedido.

## Decision 4: Mantener HTTP local

- **Decision**: No cambiar HTTP ni introducir certificados en esta feature.
- **Rationale**: Mantener el alcance en el acceso SoftAP y el formulario. Se documenta que el ESP32 recibe los valores en claro en el extremo local y que cualquier cliente con la clave compartida puede alcanzar el portal.
