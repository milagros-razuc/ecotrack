# Implementation Plan: Continuidad de lecturas y fecha de captura

**Branch**: `006-continuidad-lecturas` | **Date**: 2026-10-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-continuidad-lecturas/spec.md`

## Summary

El dispositivo conservará en RAM las lecturas que no pueda publicar y las transferirá en orden
al reconectar. El backend aceptará el campo opcional `ts` en segundos Unix UTC, resolverá la
fecha de captura frente a la hora de recepción, validará sus límites y conservará la fecha
correcta en la tabla particionada. Las lecturas con más de cinco minutos de atraso se guardarán
como histórico sin alertas, umbrales ni eventos en tiempo real. Las consultas existentes
continuarán usando `timestamp` como fecha de captura y `ultima_conexion` seguirá representando
la recepción.

## Technical Context

**Language/Version**: Node.js 18+ con CommonJS; C++ Arduino/ESP32

**Primary Dependencies**: Express, `pg`, Zod, `mqtt` 5.x, Socket.IO, PubSubClient,
WiFiClientSecure y NTP ya configurado por spec 005

**Storage**: PostgreSQL 15; `lecturas` particionada por rango mensual sobre `timestamp`

**Testing**: `node:test` con `backend/src/test/*.test.js`, base aislada mediante
`TEST_DATABASE_URL`, integración MQTT TLS cuando Docker esté disponible y verificación manual
del firmware

**Target Platform**: Backend en Docker/Linux y firmware ESP32 con intervalo por defecto de 10 s

**Project Type**: Monorepo con servicio web, ingesta MQTT, base PostgreSQL y firmware IoT

**Performance Goals**: Capturar sin bloquear durante una desconexión de hasta una hora,
transferir hasta 360 lecturas en orden y mantener la operación normal sin alimentar el
watchdog ni perder la conexión MQTT

**Constraints**: Buffer volátil de exactamente 360 entradas; sin persistencia flash; `ts` opcional
para compatibilidad; aceptar solo `[recepción-24h, recepción+1min]`; atraso estricto `>5min`
es diferido; no versionar `esp32Secret.h` ni claves; no cambios de ACL, TLS, tópicos ni frontend

**Scale/Scope**: Un nodo puede acumular 360 lecturas; el backend debe cubrir lecturas actuales,
diferidas, límites de fecha, transferencia de propietario, última lectura, agregado mensual y
API pública sin rediseñar los contratos HTTP existentes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Modular Boundaries**: PASS. La lógica de payload e ingesta permanece en `schemas.js`,
  `mqtt/client.js` y `services/lecturas.service.js`; la capacidad del dispositivo queda en el
  sketch; particiones y migración permanecen en `config/migrate.js`.
- **II. Secure By Default**: PASS. No se modifican autenticación, ACL, TLS ni secretos; el
  cliente MQTT sigue exigiendo CA y transporte seguro.
- **III. Validated Data Contracts**: PASS. `ts` se valida junto con el payload MQTT antes de
  consultar, persistir o producir efectos derivados.
- **IV. Testable Changes**: PASS. Se añadirán pruebas unitarias/integración con `node:test`
  para límites, persistencia, consultas, alertas/eventos y particiones; la suite existente
  seguirá ejecutándose.
- **V. Reliable and Observable Operation**: PASS. Se conserva `ultima_conexion` basada en
  recepción, se registran descartes y la migración de particiones es idempotente.
- **VI. Tenant Isolation**: PASS. La lectura y sus alertas continúan tomando `cliente_id` del
  propietario actual en el momento de inserción; una lectura anterior a `reclamado_en` se
  descarta antes de persistir.
- **VII. Controlled and Auditable Access**: PASS. No se amplían endpoints ni permisos; la API
  pública conserva su aislamiento por API key.
- **Requirements traceability**: PASS. Cubre RF22, RF23, RNF18 y RNF22, con dependencias
  funcionales de las specs 004 y 005.

## Project Structure

### Documentation (this feature)

```text
specs/006-continuidad-lecturas/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── mqtt-reading.md
│   └── ingestion-semantics.md
└── tasks.md             # creado por /speckit-tasks
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── config/migrate.js
│   ├── mqtt/client.js
│   ├── schemas.js
│   ├── services/lecturas.service.js
│   └── test/
│       ├── continuidad-lecturas.integration.test.js
│       └── ...
frontend/
└── (sin cambios funcionales)
codigo-esp32-mosquitto/
└── codigo-esp32-mosquitto.ino
mosquitto/
└── config/
```

**Structure Decision**: Mantener el monorepo actual. El backend centraliza validación, resolución
de timestamp, persistencia y efectos; el firmware solo captura, encola y publica; PostgreSQL
mantiene la partición mensual; las consultas y la API pública reutilizan `lecturas.service.js`.
No se introducen repositorios, colas externas ni cambios de frontend.

## Phase 0: Research

Completada en [research.md](./research.md). Se resolvieron las decisiones sobre compatibilidad
del payload, validación temporal, particiones mensuales, orden/confirmación del buffer y
clasificación de efectos diferidos.

## Phase 1: Design & Contracts

Completada con:

- [data-model.md](./data-model.md): campos, reglas temporales, propietario y buffer.
- [contracts/mqtt-reading.md](./contracts/mqtt-reading.md): payload MQTT compatible y formato
  de transferencia.
- [contracts/ingestion-semantics.md](./contracts/ingestion-semantics.md): resultados de
  ingesta, efectos y consultas.
- [quickstart.md](./quickstart.md): validación reproducible de backend y firmware.

## Post-Design Constitution Check

- **Modularidad**: PASS; no se agrega una capa paralela y cada regla queda en su módulo
  existente.
- **Contratos**: PASS; `ts` es opcional, los payloads antiguos siguen siendo válidos y las
  lecturas descartadas no producen efectos.
- **Persistencia y aislamiento**: PASS; la fecha de captura determina partición/consultas y
  `cliente_id` conserva el propietario al insertar.
- **Pruebas**: PASS; se cubren límites inclusivos, atraso, reclamación, buffer y partición
  mensual; la prueba manual del firmware queda explícitamente no automatizable.

## Complexity Tracking

No hay violaciones de la constitución que requieran justificación.
