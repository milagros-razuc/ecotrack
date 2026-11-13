# Implementation Plan: Selección de redes WiFi en el portal ESP32

**Branch**: `023-selector-redes-wifi` | **Date**: 2026-11-13 | **Spec**: [spec.md](./spec.md)

## Summary

Reemplazar la dependencia del `datalist` por un selector visible de redes detectadas, conservar un campo de SSID manual y definir respuestas/estados observables para búsqueda cargando, vacía, exitosa o fallida. No cambiar el ciclo de provisión aprobado en Feature 019.

## Technical Context

**Language/Version**: C++ Arduino-ESP32; HTML/CSS/JavaScript embebido en PROGMEM  
**Primary Components**: `codigo-esp32-mosquitto/SetupPortal.cpp`, `SetupPortalPage.h`  
**Storage**: Ningún almacenamiento nuevo; credenciales siguen persistidas por el flujo vigente.  
**Testing**: Revisión estática del contrato y validación manual en ESP32/navegadores objetivo, de acuerdo con las tareas aprobadas. No se ejecuta en esta etapa.  
**Target Platform**: ESP32 con Arduino-ESP32, celular o computadora conectados al SoftAP.  
**Constraints**: Preservar WPA2/`EcoTrack.123`, HTTP local, timeout, recuperación BOOT, `/save`, conexión MQTT/TLS, NVS y comportamiento de cierre.  
**Scale/Scope**: Portal local de un dispositivo; lista de hasta 20 SSID únicos según el escaneo vigente.

## Constitution Check

- Se respetan los límites entre interfaz embebida y firmware que escanea radio.
- Los estados de respuesta quedan explicitados en un contrato local.
- No se cambia la persistencia ni se agregan secretos/datos de red persistidos.
- La aceptación final requiere validación en hardware, ya que una prueba estática no demuestra recepción de SSID reales.

## Project Structure

```text
specs/023-selector-redes-wifi/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── tasks.md
├── checklists/requirements.md
└── contracts/scan-networks.md

codigo-esp32-mosquitto/
├── SetupPortal.cpp
└── SetupPortalPage.h
```

**Structure Decision**: Mantener el endpoint local y la página embebida en los componentes actuales; no agregar dependencias ni servicios externos.

## Complexity Tracking

No se propone excepción de complejidad.
