# Implementation Plan: Trazabilidad de alertas

**Branch**: `008-trazabilidad-alertas` | **Date**: 2026-10-30 | **Spec**: [spec.md](./spec.md)

## Summary

Agregar una tabla de acciones de alerta con `cliente_id` propio de la alerta y
usar sus registros como historial inmutable de generación y cambios de estado.
La creación de una alerta se guardará junto con su acción inicial, y cada
cambio de estado junto con su acción, dentro de una única transacción
PostgreSQL. El backend expondrá el historial aislado por cliente y publicará
las acciones confirmadas mediante Socket.IO en la sala existente del cliente.
`auditor.html` mostrará el historial de cada alerta y el Registro de actividad
integrará las acciones nuevas sin quitar la auditoría administrativa existente.

## Technical Context

**Language/Version**: Node.js existente del proyecto, CommonJS JavaScript

**Primary Dependencies**: Express, `pg`, Socket.IO, Zod; sin dependencias nuevas

**Storage**: PostgreSQL; tabla nueva `alerta_acciones` con `cliente_id`,
  referencia a `alertas.id`, actor nullable para generación automática y
  timestamp

**Testing**: Node.js built-in test runner, tests de integración existentes con
  PostgreSQL y `socket.io-client`

**Target Platform**: Backend Node.js/Express y frontend estático HTML/JavaScript
  servido junto al dashboard

**Project Type**: Web application con API REST, MQTT y actualizaciones
  realtime

**Performance Goals**: Historial paginado o acotado por alerta, con índices por
  `(cliente_id, alerta_id, timestamp)`; una acción confirmada se emite después
  del commit sin bloquear la respuesta por conexiones desconectadas

**Constraints**: Mantener contratos actuales de alertas y auditoría; no aceptar
  `cliente_id` desde requests; no emitir eventos antes del commit; no modificar
  firmware MQTT; historial de solo lectura y aislamiento estricto

**Scale/Scope**: Todas las alertas y usuarios de un cliente; afecta generación
  MQTT, PATCH de estado, consulta de detalle, Registro de actividad y eventos
  Socket.IO

## Constitution Check

*GATE: Must pass before Phase 0 research and after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I. Modular Boundaries | Separar ruta, servicio de acciones, persistencia transaccional y emisor realtime; MQTT y REST usarán servicios explícitos. | PASS |
| II. Secure By Default | `cliente_id` se obtiene del token/alerta; historial protegido y Registro de actividad conserva rol admin. | PASS |
| III. Validated Data Contracts | Reutilizar schema de cambio de estado y validar `id`, paginación y filtros; no persistir payloads sin validar. | PASS |
| IV. Testable Changes | Añadir integración para transacciones, aislamiento, historial y Socket.IO entre clientes. | PASS |
| V. Reliable and Observable Operation | Migración repetible, emitir solo tras commit, errores visibles y contratos REST existentes compatibles. | PASS |
| VI. Tenant Isolation | La tabla y cada query contienen `cliente_id`; la sala Socket.IO se deriva del cliente autenticado y del cliente histórico. | PASS |
| VII. Controlled and Auditable Access | Las acciones de alerta son inmutables; la actividad administrativa mantiene autorización y filtros. | PASS |

No hay violaciones que requieran Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/008-trazabilidad-alertas/
├── plan.md
├── research.md
├── data-model.md
├── contracts/
│   ├── alert-history-api.md
│   └── realtime-alert-actions.md
├── quickstart.md
└── tasks.md
```

### Source Code

```text
backend/src/
├── config/migrate.js
├── routes/alertas.js
├── routes/auditoria.js
├── services/alertas.service.js
├── services/alerta-acciones.service.js
├── services/auditoria.service.js
├── realtime/socketRegistry.js
└── mqtt/client.js

backend/src/test/
├── trazabilidad-alertas.integration.test.js
└── realtime.integration.test.js

frontend/
├── auditor.html
└── shared/app.js
```

**Structure Decision**: Mantener la estructura web existente. La persistencia y
las transacciones quedan en servicios backend; las rutas solo resuelven
identidad, validan y delegan; el frontend consume REST y eventos de la sala
Socket.IO ya autenticada.

## Phase 0: Research

Ver [research.md](./research.md). Se resolvieron los patrones de transacción,
aislamiento realtime, compatibilidad del Registro de actividad y actor sistema.

## Phase 1: Design

Ver [data-model.md](./data-model.md), [contracts/alert-history-api.md](./contracts/alert-history-api.md),
[contracts/realtime-alert-actions.md](./contracts/realtime-alert-actions.md) y
[quickstart.md](./quickstart.md).

### Post-design Constitution Check

PASS. El diseño usa una tabla append-only específica para acciones, mantiene
`cliente_id` redundante de forma intencional para blindar el aislamiento,
actualiza estado+acción en la misma transacción y publica eventos únicamente
después de confirmar la transacción. No se agregan permisos ni dependencias.

## Complexity Tracking

No aplica: no hay violaciones constitucionales.
