---
description: "Tareas de especificación e implementación para el selector WiFi del portal ESP32"
---

# Tasks: Selección de redes WiFi en el portal ESP32

**Input**: Design documents from `specs/023-selector-redes-wifi/`

**Prerequisites**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`

## Phase 1: Spec review

- [x] T001 Revisar y aprobar alcance, criterios de aceptación y contrato local de `/networks` antes de cambiar firmware o HTML embebido.
- [ ] T002 Confirmar los navegadores/dispositivos cliente y una placa representativa para aceptación física.

## Phase 2: Implementación tras aprobar la spec

- [x] T003 Implementar el selector visible y la entrada manual de SSID en `codigo-esp32-mosquitto/SetupPortalPage.h`, conservando valores existentes al refrescar resultados.
- [x] T004 Alinear `GET /networks` en `codigo-esp32-mosquitto/SetupPortal.cpp` con `contracts/scan-networks.md`, incluyendo respuestas distinguibles para vacío, no disponible y error de escaneo.
- [x] T005 Revisar consistencia entre `research.md`, el contrato y `quickstart.md`; no surgió evidencia de placa/navegador que requiera ajustar la decisión de diseño.
- [x] T006 Registrar la aceptación del usuario de que el selector funciona en `quickstart.md`; placa y navegador no especificados.
- [x] T007 Revisar el cambio para confirmar que no altera SoftAP WPA2, clave compartida, timeout, recuperación BOOT, guardado, NVS ni MQTT/TLS.
