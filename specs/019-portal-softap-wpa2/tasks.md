# Tasks: Proteger portal SoftAP con WPA2

**Input**: Design documents from `specs/019-portal-softap-wpa2/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`

## Phase 1: Setup

- [x] T001 Actualizar la spec, plan, research, modelo, contrato, quickstart y checklist en `specs/019-portal-softap-wpa2/` para reflejar el código compartido y el riesgo aceptado.

## Phase 2: Foundational

- [x] T002 Retirar `softApPassword` de `DeviceConfig` y dejar de leer/validar `softApPass` en `codigo-esp32-mosquitto/DeviceConfig.h` y `codigo-esp32-mosquitto/DeviceConfig.cpp`.

## Phase 3: User Story 1 - Conectar al portal protegido (Priority: P1)

**Goal**: WPA2 usa `EcoTrack.123` y el formulario abre directamente sin PIN.

**Independent Test**: En ESP32 real, clave correcta permite asociación, incorrecta la rechaza, y el portal muestra formulario sin PIN.

- [x] T003 [US1] Configurar el SoftAP con `EcoTrack.123`, retirando comprobaciones de credenciales SoftAP individuales en `codigo-esp32-mosquitto/SetupPortal.cpp`.
- [x] T004 [US1] Eliminar HTML, JavaScript y referencia al formulario PIN en `codigo-esp32-mosquitto/SetupPortalPage.h`.
- [x] T005 [US1] Quitar PIN y clave SoftAP del generador, NVS, CSV y etiquetas en `scripts/provision_factory.py`.
- [x] T006 [US1] Ajustar la etiqueta de fabricación para que solo incluya `device_id` en `scripts/fabricate-devices.ps1`.
- [x] T007 [US1] Ajustar regresiones y fixtures existentes al código estático y al nuevo formato de identidad en `tests/setup_portal_regression_test.py`, `tests/provision_factory_test.py` y `backend/src/test/fabricate-devices.test.js`; no ejecutar.

## Phase 4: Polish & Cross-Cutting

- [x] T008 Documentar el código compartido y sus límites en `README.MD` y `docs/requisitos.md`.
- [x] T009 Documentar riesgo, contrato y escenarios manuales en `specs/019-portal-softap-wpa2/`.
- [x] T010 Alinear la descripción de etiquetas y estado de identidad en `specs/015-automatizar-fabricacion-dispositivos/` y `specs/017-auto-recuperacion-version-firmware/spec.md`.
- [x] T011 Marcar el comportamiento previo como histórico y retirar el PIN/clave individual de los artefactos aplicables de `specs/010-endurecer-provisionamiento-wifi/`.
- [x] T012 Actualizar RNF06 y Constitución para registrar formalmente la excepción pública del código `EcoTrack.123` y su riesgo aceptado en `docs/requisitos.md` y `.specify/memory/constitution.md`.
- [ ] T013 Validar en ESP32 real asociación correcta/incorrecta, carga del portal y cierre según `specs/019-portal-softap-wpa2/quickstart.md`.

## Dependencies & Execution Order

- T002 y T003 establecen la fuente y uso del código estático.
- T004 retira el paso PIN del portal.
- T005 antecede a T006; el formato del CSV de fábrica cambia antes de generar las etiquetas finales.
- T007–T012 mantienen fixtures, requisitos, constitución y documentación alineados.
- T013 requiere hardware y queda pendiente.

## Implementation Strategy

Una historia P1 entrega el cambio. Los fixtures se editaron pero no se ejecutaron. La aceptación física es necesaria para cerrar la feature.
