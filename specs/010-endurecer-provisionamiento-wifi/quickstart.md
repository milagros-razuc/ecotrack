# Quickstart de validación: aprovisionamiento WiFi endurecido

Esta guía valida el firmware en dos ESP32 reales y el script de fabricación. El backend no se modifica.

## Prerrequisitos

- Dos ESP32 compatibles con el sketch y cable USB.
- Arduino IDE con el core ESP32 y las librerías actuales del proyecto.
- Python 3 instalado.
- Herramientas Espressif que incluyen `nvs_partition_gen.py`.
- Broker Mosquitto EcoTrack con TLS en `8883`, CA del proyecto y ACL separadas para cada dispositivo.
- Directorio local fuera del repositorio para CSV, etiquetas e imágenes NVS.

## 1. Generar identidades

```powershell
python scripts\provision_factory.py --count 2 --output C:\ecotrack-factory --server-host broker.ecotrack.local --nvs-size 0x5000
```

Resultados esperados:

- Dos filas de registro y dos imágenes NVS.
- `device_id`, PIN y secreto distintos por unidad; `serverHost` coincide con el broker.
- Las imágenes pueden inspeccionarse/cargarse con `nvs_partition_gen.py`.
- Ningún CSV ni `.bin` aparece en `git status`.

## 2. Cargar esquema e identidad

1. Copiar `codigo-esp32-mosquitto/partitions.csv` al directorio `tools/partitions` del core ESP32 si la instalación no ofrece el esquema equivalente y seleccionarlo desde **Herramientas > Partition Scheme**.
2. Compilar y cargar el firmware por USB.
3. Cargar la imagen NVS correspondiente a cada placa usando la herramienta de particiones y el offset/tamaño del esquema.
4. Registrar bytes usados, capacidad del slot y `porcentaje = usados / capacidad * 100`.
5. Reiniciar y abrir el monitor serial a 115200; confirmar que no existe ningún flujo OTA.

La carga de un esquema nuevo puede borrar NVS: cargar la imagen de fábrica después del reflasheo y no asumir que la configuración WiFi anterior se conserva.

## 3. Verificar portal temporal

Para cada placa:

1. Sin configuración editable, reiniciar y confirmar que aparece `EcoTrack-Setup-...`.
2. Conectar un teléfono/PC al SoftAP abierto, ingresar el PIN de su etiqueta y confirmar que un PIN de otra placa falla.
3. Guardar una red válida y observar en serial la confirmación WiFi, MQTT y TLS.
4. Confirmar que el SoftAP desaparece y que la placa queda en `WIFI_STA`.
5. Reabrir con BOOT sostenido durante 3 s y verificar el bloqueo tras cinco PINs incorrectos.
6. Repetir dejando el portal sin una configuración válida durante 10 minutos; confirmar el cierre dentro de 10 min 30 s.
7. Probar datos inválidos; confirmar respuesta de error, portal activo y ausencia de cambio a estación.

## 4. Verificar compatibilidad TLS/MQTT

1. Confirmar conexión autenticada por TLS en `8883`.
2. Confirmar en Mosquitto que cada usuario publica únicamente en `ecotrack/<device_id>/lecturas`.
3. Confirmar que el backend recibe el JSON vigente sin cambios de nombres ni estructura.
4. Confirmar que no se tocó el backend ni sus archivos de configuración.

## 5. Evidencia a registrar

Para cada dispositivo anotar: `device_id`, fecha, versión/compilación, tamaño y porcentaje de flash, resultado de carga USB, PIN validado sin registrarlo, SoftAP abierto, hora de cierre por configuración, hora de cierre por timeout, resultado de BOOT, estado TLS 8883, tópico publicado y capturas/logs seriales. No incluir PIN, claves ni secretos en commits ni en reportes públicos.
