# Implementation Plan: Enrolamiento seguro de dispositivo

**Branch**: `014-enrolar-dispositivo` | **Date**: 2026-11-02 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/[###-feature-name]/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

El firmware enviará únicamente `device_id` y `device_secret` por HTTPS a Caddy en
443 durante el desarrollo. El backend validará el hash de fábrica y el reclamo previo del dashboard,
creará el cliente/rol MQTT mediante el adaptador dynamic-security existente y
devolverá las credenciales una sola vez. La transacción local y las operaciones
MQTT tendrán compensaciones explícitas para evitar vínculos o identidades
huérfanas. La compensación fallida se observará mediante un log sanitizado en
stderr y requerirá resolución manual; no se agrega una cola de incidentes.
En desarrollo Caddy usará una CA interna persistida en `caddy_data`; la CA
embebida en el firmware y el SAN `serverHost` quedan reservados para la
validación física/producción.

La spec fue corregida: el código de alta y el token no forman parte del body del
endpoint; pertenecen exclusivamente al flujo previo de reclamo del dashboard.
El endpoint no usa JWT: el firmware se autentica con `device_id` y
`device_secret`, y el reclamo previo aporta el `cliente_id`.

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: Node.js existente (backend), SQL PostgreSQL, C++ Arduino/ESP32,
Caddy para terminación TLS de desarrollo.

**Primary Dependencies**: Express, `mqtt` 5.x ya instalado, `bcryptjs`/`crypto`,
`express-rate-limit`, PostgreSQL, Docker Compose, Mosquitto dynamic-security,
Caddy y Docker Compose.

**Storage**: PostgreSQL para dispositivos de fábrica, reclamos y estado de
enrolamiento; dynamic-security.json en volumen Mosquitto; claves/certificados
operativos fuera del repositorio.

**Testing**: `node:test` con doble de MQTT, tests de rutas/servicios existentes,
validación de migración y smoke test HTTPS/TLS cuando Docker esté disponible.

**Target Platform**: Docker Compose local/servidor Linux con clientes ESP32 y
backend Node.js.

**Project Type**: API web, integración MQTT, migración SQL e infraestructura TLS.

**Performance Goals**: respuesta normal del endpoint dentro del timeout del cliente
MQTT; rate limit por IP y dispositivo evita intentos ilimitados. No se fija
throughput de producción en esta feature.

**Constraints**: body exacto de dos campos; error genérico uniforme; comparación
en tiempo constante; sin secretos en logs/repositorio/CLI; TLS validado sin
`setInsecure`; ACL propia con denegaciones explícitas de `subscribePattern
ecotrack/#`; rollback ante fallos parciales; no tocar payload MQTT de lecturas.

**Scale/Scope**: dos clientes A/B y un dispositivo por cliente en tests unitarios;
reclamo previo existente; no incluye enrolamiento automático del dashboard ni
rotación automática de credenciales.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Modular Boundaries**: PASS. Ruta, servicio, persistencia, adaptador MQTT y
  proxy TLS se mantienen separados.
- **Secure By Default**: PASS. El endpoint usa secreto de fábrica, rate limit,
  hash, comparación constante, TLS verificado y secretos fuera de Git; la
  sesión/admin se valida en el reclamo previo.
- **Validated Data Contracts**: PASS. Se valida body exacto, estado reclamado,
  `device_id`, secreto, respuestas dynamic-security y SAN TLS.
- **Testable Changes**: PASS. Se cubren doble MQTT, rollback, errores genéricos,
  rate limit y A/B.
- **Reliable and Observable Operation**: PASS. Transacción/compensación, log
  sanitizado en stderr ante compensación fallida y migración repetible.
- **Tenant Isolation**: PASS. `cliente_id` proviene de sesión/reclamo y las ACL
  se construyen por dispositivo.
- **Controlled and Auditable Access**: PASS. Reclamo y enrolamiento requieren admin,
  tienen rate limit y registran eventos sin secretos.

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
backend/
├── src/
│   ├── routes/dispositivos.js
│   ├── services/dispositivos.service.js
│   ├── services/dynamicSecurity.service.js
│   ├── middleware/rateLimiter.js
│   └── test/enrolamiento-dispositivo.test.js
└── migrations/
    └── 015_device_enrollment.sql

scripts/
└── provision-mqtt-dynamic.js

caddy/
└── Caddyfile

codigo-esp32-mosquitto/
└── ecotrack_ca.h

docker-compose.yml

ios/ or android/
└── [platform-specific structure: feature modules, UI flows, platform tests]
```

**Structure Decision**: El endpoint permanece en la ruta de dispositivos, la
lógica de enrolamiento y compensación vive en servicios, y el adaptador MQTT
reutiliza el contrato del script dynamic-security existente. Caddy es un servicio
de terminación TLS de desarrollo delante del backend interno; su CA local persiste
en un volumen nombrado y no se montan secretos desde Git. Express confía en un
solo salto de proxy porque el backend no publica el puerto 3000 al host.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| N/A | N/A | No se agrega un proyecto adicional; Caddy es infraestructura del compose. |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
