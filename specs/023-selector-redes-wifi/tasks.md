---
description: "Tareas de especificación e implementación para el selector WiFi del portal ESP32"
---

# Tasks: Selección de redes WiFi en el portal ESP32

**Input**: Design documents from `specs/023-selector-redes-wifi/`

**Prerequisites**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`

## Phase 1: Spec review

- [ ] T001 Revisar y aprobar alcance, criterios de aceptación y contrato local de `/networks` antes de cambiar firmware o HTML embebido.
- [ ] T002 Confirmar los navegadores/dispositivos cliente y una placa representativa para aceptación física.

## Phase 2: Implementación tras aprobar la spec

- [ ] T003 Implementar el selector visible y la entrada manual de SSID en `codigo-esp32-mosquitto/SetupPortalPage.h`, conservando valores existentes al refrescar resultados.
- [ ] T004 Alinear `GET /networks` en `codigo-esp32-mosquitto/SetupPortal.cpp` con `contracts/scan-networks.md`, incluyendo respuestas distinguibles para vacío, no disponible y error de escaneo.
- [ ] T005 Actualizar `research.md`, el contrato y `quickstart.md` si la evidencia de placa o navegador cambia alguna decisión de la spec.
- [ ] T006 Realizar la validación en ESP32 y navegadores acordados, y registrar evidencia no sensible en `quickstart.md`.
- [ ] T007 Revisar el cambio para confirmar que no altera SoftAP WPA2, clave compartida, timeout, recuperación BOOT, guardado, NVS ni MQTT/TLS.
