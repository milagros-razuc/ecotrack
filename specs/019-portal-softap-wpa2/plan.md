# Implementation Plan: Proteger portal SoftAP con WPA2

**Branch**: `019-cerrar-softap-eliminar-pin` | **Date**: 2026-11-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/019-portal-softap-wpa2/spec.md`

## Summary

Usar `EcoTrack.123` como código compartido del WPA2 SoftAP; quitar PIN y claves SoftAP individuales del firmware y del proceso de fábrica. El formulario HTTP y conectividad posterior siguen iguales. El código compartido se clasifica como público y su riesgo queda aceptado por decisión explícita del usuario.

## Technical Context

**Language/Version**: Arduino C++ sobre ESP32 Arduino core existente; Python 3 y PowerShell 7 para fabricación.

**Primary Dependencies**: `WiFi.h`, `Preferences`, `WebServer`, `DNSServer`; `secrets` en Python para identidad restante.

**Storage**: NVS mantiene `deviceId`, `serverHost` y `deviceSecret`; no requiere `softApPass` ni `setupPin`.

**Testing**: Regresiones y fixtures existentes actualizados; no se ejecutaron. Validación WPA2/portal en hardware pendiente en T013.

**Target Platform**: ESP32/NodeMCU-32S; fabricación Windows.

**Project Type**: Firmware embebido, herramientas de fabricación y documentación técnica.

**Performance Goals**: Sin cambio del tiempo de conexión, timeout o transición a estación.

**Constraints**: Código compartido visible en source; cualquiera que lo conozca puede asociarse. HTTP local sigue sin TLS. Conservar timeout, BOOT, MQTT/TLS y formato de mensajes.

**Scale/Scope**: Portal, identidad de fábrica, generador/etiquetas, requisitos y documentación; sin cambios backend.

## Constitution Check

| Gate | Resultado | Evidencia |
|---|---|---|
| II. Secure By Default | Excepción aprobada y acotada | Constitución 2.0.0 y RNF06 clasifican `EcoTrack.123` como código público; no se trata como secreto ni como control frente a quien lo conozca. |
| III. Validated Data Contracts | PASS | La identidad sigue validando los campos NVS que usa; `softApPass` deja de ser una dependencia. |
| IV. Testable Changes | PARCIAL | Se ajustaron pruebas existentes; no se ejecutaron. La aceptación en placa sigue pendiente. |
| V. Reliable and Observable Operation | PASS | Se mantienen timeout, BOOT, conexión y MQTT/TLS. |
| Requirements Traceability | PASS | RF15, RI13, RD06, RNF06 en `docs/requisitos.md`; RNF06 y Constitución tienen una excepción documentada. |

## Project Structure

```text
specs/019-portal-softap-wpa2/
  spec.md, plan.md, research.md, data-model.md, quickstart.md, tasks.md
  contracts/provisioning-portal.md
codigo-esp32-mosquitto/
  DeviceConfig.h, DeviceConfig.cpp, SetupPortal.cpp, SetupPortalPage.h
scripts/
  provision_factory.py, fabricate-devices.ps1
README.MD, docs/requisitos.md, .specify/memory/constitution.md
```

**Structure Decision**: Ajustar los módulos existentes; no añadir dependencias ni modificar backend.

## Phase 0: Research

Las decisiones constan en [research.md](research.md): clave compartida, riesgo aceptado, ausencia de `softApPass`/PIN en la fabricación y HTTP sin TLS.

## Phase 1: Design and Contracts

- [data-model.md](data-model.md): identidad y clasificación del código común.
- [contracts/provisioning-portal.md](contracts/provisioning-portal.md): comportamiento observable.
- [quickstart.md](quickstart.md): escenarios pendientes de validar en hardware.

## Constitution Check (post-design)

PASS bajo la excepción aprobada en Constitución 2.0.0. La clave no se considera un secreto, una credencial individual ni una garantía de acceso restringido. HTTP y la exposición frente a clientes que conozcan la clave permanecen como riesgo documentado.
