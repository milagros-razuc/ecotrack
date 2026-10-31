# Research: Endurecer aprovisionamiento WiFi

## Decisión 1: Mantener Arduino IDE como flujo de firmware

- **Decision**: Mantener el sketch en `codigo-esp32-mosquitto/` como proyecto de Arduino IDE y documentar el esquema de particiones mediante el mecanismo equivalente disponible en la instalación del ESP32. No agregar PlatformIO.
- **Rationale**: El repositorio no contiene `platformio.ini`, `platformio/` ni otra configuración de PlatformIO; el README indica Arduino IDE como herramienta de programación. Cambiar de ecosistema introduciría una migración no solicitada.
- **Alternatives considered**: Incorporar PlatformIO para obtener `board_build.partitions = partitions.csv`. Se descarta porque añadiría una segunda ruta de compilación sin necesidad funcional.

## Decisión 2: Separar secretos de fábrica del firmware

- **Decision**: El firmware leerá la identidad de fábrica desde NVS con `Preferences`; el script Python generará los valores y una imagen NVS compatible con `nvs_partition_gen.py`. Los CSV y las imágenes generadas se guardarán en una carpeta local ignorada por Git.
- **Rationale**: `Preferences` ya es la abstracción NVS usada por `DeviceConfig.cpp`, y la imagen permite cargar valores por dispositivo sin recompilar el sketch ni incluir secretos en el repositorio. La separación satisface RNF06.
- **Alternatives considered**: Mantener `esp32Secret.h` como archivo local de credenciales o generar valores en el propio firmware. La primera alternativa conserva valores iniciales mezclados con el código; la segunda no produce un registro controlado para el operario.

## Decisión 3: Generación criptográfica en Python

- **Decision**: Usar `secrets` para generar un `device_id`, una clave SoftAP WPA2 y un secreto de dispositivo por unidad. El script validará unicidad dentro del lote/salida solicitada y fallará ante colisiones o entradas inválidas.
- **Rationale**: `secrets` usa una fuente apropiada para valores no predecibles y no requiere dependencias externas.
- **Alternatives considered**: `random`, UUID no criptográfico o claves derivadas de la MAC. Se descartan por menor garantía de impredecibilidad o por crear una relación innecesaria entre identificador y secreto.

## Decisión 4: Cierre explícito del SoftAP y timeout monotónico

- **Decision**: Al confirmar WiFi/MQTT, el flujo llamará a `WiFi.softAPdisconnect(true)` y `WiFi.mode(WIFI_STA)`. El portal registrará actividad y medirá el vencimiento con `millis()`; el timeout nominal será de 10 minutos.
- **Rationale**: `millis()` evita depender del reloj NTP para una política de exposición local. El cierre explícito evita conservar la interfaz AP al pasar a estación.
- **Alternatives considered**: Timeout basado en `time(nullptr)` o dejar el cierre para una fase posterior del estado `readyDisplay`. Se descartan porque NTP puede no estar disponible y dejan el AP expuesto más tiempo.

## Decisión 5: Compatibilidad del contrato MQTT

- **Decision**: No cambiar el puerto TLS 8883, la CA, las ACL, el usuario MQTT, el tópico `ecotrack/<deviceId>/lecturas` ni el JSON actual.
- **Rationale**: La constitución exige compatibilidad hacia atrás del tópico y payload. La identidad nueva se integra con la autenticación y ACL existentes sin cambiar el contrato de mensajes.
- **Alternatives considered**: Crear tópicos versionados o modificar el payload para transportar el secreto. Se descartan por innecesarios y riesgosos.

## Decisión 6: Esquema de particiones preparado para OTA, sin OTA

- **Decision**: Usar `partitions.csv`, con dos slots de aplicación y LittleFS/Minimal SPIFFS según la variante soportada por la placa, y exigir reflasheo USB. No se agregará lógica OTA.
- **Rationale**: Cumple la preparación solicitada sin ampliar el alcance. El cambio puede borrar NVS, por lo que la guía ordenará cargar la imagen NVS después del flasheo.
- **Alternatives considered**: Mantener el esquema actual o implementar OTA ahora. Mantenerlo no prepara slots; implementar OTA contradice el fuera de alcance.

## Decisión 7: Verificación en dispositivo real y evidencia reproducible

- **Decision**: La validación principal será una guía manual reproducible para dos ESP32 reales, complementada por pruebas automatizadas del generador Python y verificaciones estáticas de secretos.
- **Rationale**: El apagado del SoftAP, la transición a estación, el botón BOOT y TLS dependen de hardware y radio reales.
- **Alternatives considered**: Simular todo en host o limitarse a compilación. No prueban WPA2, particiones ni TLS extremo a extremo.
