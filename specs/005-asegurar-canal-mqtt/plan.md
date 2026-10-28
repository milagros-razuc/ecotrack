# Implementation Plan: Asegurar canal MQTT

**Branch**: `005-asegurar-canal-mqtt` | **Date**: 2026-10-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-asegurar-canal-mqtt/spec.md`

## Summary

Se protegerá el único flujo operativo MQTT con TLS en `8883`, usando una CA privada
autofirmada y un certificado de broker con SAN. El backend cargará la CA desde
`MQTT_CA_PATH` y el ESP32 sincronizará NTP antes de validar con `WiFiClientSecure`.
La ACL, las credenciales, el tópico y el payload existentes permanecen sin cambios. La
validación se completará con una prueba de integración de ACL, pruebas de confianza TLS y
documentación actualizada. El buffer y el campo `ts` quedan fuera de este plan y se trasladan
al spec 006.

## Technical Context

**Language/Version**: Node.js 18 (backend); C++ Arduino/ESP32; YAML y configuración de Mosquitto

**Primary Dependencies**: `mqtt` 5.x, Mosquitto 2.x, PubSubClient, WiFiClientSecure, Docker Compose

**Storage**: PostgreSQL sin cambios; certificados montados como archivos, con claves privadas
locales no versionadas

**Testing**: Node.js built-in test runner del backend; integración con Docker Compose/Mosquitto;
validación manual reproducible del firmware en hardware o simulador disponible

**Target Platform**: Docker Compose en entorno local y NodeMCU ESP32S

**Project Type**: Backend web service + firmware IoT + infraestructura local/documentación

**Performance Goals**: La prueba ACL distingue publicación válida de publicación cruzada; las
conexiones válidas completan el handshake TLS sin degradación insegura.

**Constraints**: Sin cambios de modelo de ACL/credenciales, tópico o payload; sin mTLS; sin
fallback inseguro; sin refactors fuera de alcance; claves privadas `*.key` ignoradas por Git;
buffer y campo `ts` fuera de este spec

**Scale/Scope**: Dos usuarios MQTT de prueba para ACL, un broker, un backend y firmware
existente; alcance mínimo sin fase de polish

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Modular Boundaries**: PASS. La conexión MQTT se mantiene en `backend/src/mqtt`, TLS del
  broker en `mosquitto/`, NTP/TLS en el sketch y documentación en README/diagramas.
- **II. Secure By Default**: PASS. CA obligatoria, hostname validado, `rejectUnauthorized` activo,
  `setCACert` y sin `setInsecure`; claves privadas fuera de Git.
- **III. Validated Data Contracts**: PASS. Tópico/payload no cambian y el backend conserva
  validación antes de persistir.
- **IV. Testable Changes**: PASS. Se añade integración ACL y validaciones TLS reproducibles,
  conservando la suite existente.
- **V. Reliable and Observable Operation**: PASS. Se mantienen contratos y se registran errores
  de conexión.
- **Security/Technology Constraints**: PASS. Compose sigue siendo el entorno reproducible,
  Mosquitto conserva usuarios y ACL, y secretos permanecen fuera del control de versiones.
- **Requirements traceability**: PASS. Cubre RF03, RF04, RF05, RF12, RF18, RI16, RI21, RI22,
  RI24, RE03, RE05, RD02 y RD07 de [docs/requisitos.md](../../docs/requisitos.md).

## Project Structure

### Documentation (this feature)

```text
specs/005-asegurar-canal-mqtt/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── mqtt-security.md
│   └── acl-integration.md
└── tasks.md
```

### Source Code (repository root)

```text
docker-compose.yml
backend/
├── .env.example
├── Dockerfile
├── src/mqtt/client.js
└── src/test/
    ├── mqtt-acl.integration.test.js
    └── mqtt-tls.integration.test.js
mosquitto/
├── Dockerfile
└── config/
    ├── mosquitto.conf
    ├── acl.conf
    ├── ca.crt
    └── broker.crt
codigo-esp32-mosquitto/
├── codigo-esp32-mosquitto.ino
├── esp32Secret.h.example
└── certs/
    └── ecotrack-ca.crt
README.MD
docs/requisitos.md
.gitignore
```

Los archivos de clave privada, `passwd` y configuraciones locales con credenciales no se
versionan.

**Structure Decision**: Mantener la estructura actual del monorepo. La infraestructura TLS se
configura en Mosquitto/Compose, el cliente backend se modifica en su módulo MQTT, NTP/TLS se
implementa en el sketch, y los artefactos operativos se documentan en README y `docs/`. No se
crean capas nuevas ni se toca PostgreSQL.

## Phase 0: Research

Completada en [research.md](./research.md) para CA/SAN, cliente Node.js, NTP/ESP32, prueba ACL
y gestión de claves privadas. Las decisiones de buffer y `ts` se reservan al spec 006.

## Phase 1: Design & Contracts

Completada con:

- [data-model.md](./data-model.md): bundle de certificados, configuración TLS y contrato de
  mensaje vigente.
- [contracts/mqtt-security.md](./contracts/mqtt-security.md): transporte, identidad, ACL y
  mensajes.
- [contracts/acl-integration.md](./contracts/acl-integration.md): escenarios válido y cruzado.
- [quickstart.md](./quickstart.md): validación reproducible de TLS, ACL y documentación.

## Post-Design Constitution Check

- **Modularidad y alcance mínimo**: PASS; no se agregan refactors ni persistencia nueva.
- **Seguridad**: PASS; la única confianza compartida es el CA público y las claves privadas están
  excluidas de Git.
- **Contratos y compatibilidad**: PASS; tópico, payload, usuarios y ACL no cambian.
- **Pruebas y operación**: PASS; quickstart y contrato ACL verifican aceptación propia, ausencia
  cruzada y rechazo por CA inválido.
- **Documentación**: PASS; README y diagramas quedan incluidos como superficies requeridas.

## Complexity Tracking

No hay violaciones de la constitución que requieran justificación.
