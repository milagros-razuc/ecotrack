# Implementation Plan: Endurecer aprovisionamiento WiFi

**Branch**: `010-endurecer-provisionamiento-wifi` | **Date**: 2026-10-31 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from [spec.md](spec.md)

## Summary

El firmware ESP32 leerá la identidad de fábrica desde NVS mediante `Preferences`, eliminará
las credenciales por defecto del portal y gestionará el cierre del SoftAP con una transición
explícita a estación y un timeout monotónico de 10 minutos. Un script Python usará `secrets`
para generar por unidad el `device_id`, la clave SoftAP y el secreto reservado, generará una
imagen NVS mediante `nvs_partition_gen.py` y producirá un CSV/etiqueta en una salida ignorada
por Git. El esquema de flash se cambiará al layout de `partitions.csv` con dos slots y
LittleFS/Minimal SPIFFS, sin implementar OTA. TLS/MQTT en 8883, ACL, tópicos, payload y
backend permanecen sin cambios.

## Technical Context

**Language/Version**: Arduino C++ para ESP32 (Arduino IDE/core ESP32 existente); Python 3 para fabricación

**Primary Dependencies**: `WiFi.h`, `Preferences`, `WebServer`, `DNSServer`, `PubSubClient`, `WiFiClientSecure`, CA de EcoTrack y `nvs_partition_gen.py`

**Storage**: NVS del ESP32 para identidad/configuración; archivos CSV, etiquetas e imágenes NVS únicamente en una salida local ignorada

**Testing**: pruebas unitarias del generador Python; compilación Arduino; verificación estática de secretos; pruebas manuales reproducibles en dos ESP32 reales y broker TLS

**Target Platform**: ESP32/NodeMCU-32S y estación de fabricación Windows; Arduino IDE como flujo vigente

**Project Type**: firmware embebido más herramienta CLI de fabricación

**Performance Goals**: cerrar el SoftAP inmediatamente tras confirmación y dentro de 10 minutos 30 segundos por inactividad; no degradar la publicación existente

**Constraints**: recursos limitados de flash/RAM; no secretos versionados; no cambios backend; no OTA; no persistencia del buffer; TLS 8883 y payload MQTT compatibles; reflasheo USB obligatorio al cambiar particiones

**Scale/Scope**: lotes de fabricación de dispositivos individuales o pequeños; afecta el sketch ESP32, NVS, script Python, `.gitignore`, documentación y pruebas, no backend

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Resultado | Evidencia |
|---|---|---|
| II. Secure By Default | PASS | La identidad y secretos salen del código; el SoftAP usa clave por dispositivo y los artefactos quedan fuera de Git. |
| III. Validated Data Contracts | PASS | El portal conserva validación de campos y el contrato NVS define tipos, claves y marcas de escritura completa. |
| IV. Testable Changes | PASS | Se incluyen pruebas del generador, compilación, búsqueda de secretos y validación física reproducible. |
| V. Reliable and Observable Operation | PASS | Se mantienen TLS 8883, ACL, tópico y payload; se documentan estados, timeout y evidencia serial. |
| Security/Technology Constraints | PASS | Arduino IDE se conserva, no se toca backend y los secretos se guardan en NVS/salida local no versionada. |
| Documentation Quality Gate | PASS | README/documentación de instalación debe reflejar reflasheo USB, carga NVS y pruebas reales. |

## Project Structure

### Documentation (this feature)

```text
specs/010-endurecer-provisionamiento-wifi/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    ├── factory-nvs-image.md
    └── provisioning-portal.md
```

### Source Code (repository root)

```text
codigo-esp32-mosquitto/
├── codigo-esp32-mosquitto.ino
├── DeviceConfig.cpp
├── DeviceConfig.h
├── SetupPortal.cpp
├── SetupPortal.h
├── SetupPortalPage.h
├── esp32Secret.h.example
└── ecotrack_ca.h
scripts/
└── provision_factory.py
tests/
└── provision_factory_test.py
```

**Structure Decision**: Mantener el sketch y sus módulos en `codigo-esp32-mosquitto/`,
añadir la herramienta de fabricación y sus pruebas bajo `scripts/` y `tests/`, y conservar
los contratos y la guía de validación dentro de la carpeta de la feature. El backend queda
fuera del cambio.

## Phase 0: Research

La investigación está consolidada en [research.md](research.md). Resuelve la elección de
Arduino IDE frente a PlatformIO, la estrategia NVS/`nvs_partition_gen.py`, generación
criptográfica con `secrets`, timeout con `millis()`, compatibilidad MQTT/TLS y el impacto
del cambio de particiones.

## Phase 1: Design

- [data-model.md](data-model.md) define identidad, registros, imagen NVS y estados del portal.
- [contracts/factory-nvs-image.md](contracts/factory-nvs-image.md) define el contrato de generación y las claves NVS.
- [contracts/provisioning-portal.md](contracts/provisioning-portal.md) define eventos observables y compatibilidad MQTT.
- [quickstart.md](quickstart.md) define la validación en dos dispositivos reales, carga USB, timeout, BOOT y TLS.

## Post-Design Constitution Check

| Gate | Resultado | Verificación posterior al diseño |
|---|---|---|
| Secure By Default | PASS | Los secretos se generan fuera del código, se cargan por NVS y sus artefactos quedan ignorados. |
| Testable Changes | PASS | Cada flujo tiene evidencia automatizada o procedimiento físico reproducible. |
| Reliable and Observable Operation | PASS | Los contratos preservan TLS 8883, ACL, tópico y payload; se registran estados y tiempos. |
| Documentation/Requirements | PASS | La guía cubre reflasheo USB, porcentaje de flash, carga NVS y requisitos RF/RNF/RI/RD citados en la spec. |

No se identifican violaciones constitucionales que requieran una excepción.

## Complexity Tracking

No aplica: el diseño mantiene el sketch y el flujo de Arduino IDE existentes, añade una sola
herramienta de fabricación y no introduce backend, OTA ni una nueva infraestructura.
