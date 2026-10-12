# Implementation Plan: Endurecer backend para producción

**Branch**: `002-endurecer-backend-produccion` | **Date**: 2026-10-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-endurecer-backend-produccion/spec.md`

## Summary

Endurecer el arranque, la integridad de datos y la política de orígenes del backend sin
alterar endpoints, eventos ni MQTT. Se reutilizará la estructura actual: `migrate.js`
validará el entorno y aplicará CHECK/FK con bloques PostgreSQL idempotentes; `app.js`
aplicará Helmet y CORS; `index.js` usará la misma lista de orígenes para Socket.io.
La lista de orígenes se parseará mediante una única función compartida. La cobertura
será con `node:test` en `backend/src/test`, usando `TEST_DATABASE_URL` para PostgreSQL.

## Technical Context

**Language/Version**: Node.js CommonJS (versión soportada por el proyecto)

**Primary Dependencies**: Express, Socket.io, PostgreSQL/pg, node:test y Helmet

**Storage**: PostgreSQL

**Testing**: `node --test --test-timeout=30000 --test-concurrency=1 src/test/*.test.js`;
tests de integración contra `TEST_DATABASE_URL`

**Target Platform**: Servidor Node.js ejecutado localmente o en hosting compatible

**Project Type**: Servicio web backend con API REST y Socket.io

**Performance Goals**: Sin regresión perceptible en arranque, solicitudes REST o
conexiones Socket.io; el parseo de CORS se realiza una vez al crear la aplicación/servidor.

**Constraints**: No cambios fuera de `backend/src/config/migrate.js`,
`backend/src/app.js`, `backend/index.js` y tests nuevos o modificados en
`backend/src/test`; no cambiar formatos de eventos, endpoints, MQTT ni contrato de
`change-password`. Las pruebas de base requieren `TEST_DATABASE_URL`.

**Scale/Scope**: Un backend existente, tablas `usuarios` y `alertas`, dos superficies
de CORS (REST y Socket.io) y pruebas de arranque/migración.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Estado | Evidencia |
|---|---|---|
| Secure By Default | PASS | Producción sin `ADMIN_PASS` no crea credenciales por defecto; CORS deja de aceptar `*`; Helmet se aplica antes de rutas. |
| Validated Data Contracts | PASS | Los dominios `rol` y `estado` se validan también en PostgreSQL mediante CHECK; no se cambia ningún payload externo. |
| Testable Changes | PASS | Se agregan pruebas `node:test` de arranque, migración, restricciones y CORS contra `TEST_DATABASE_URL`. |
| Reliable and Observable Operation | PASS | FK y CHECK se agregan de forma idempotente; se preservan contratos y se mantiene advertencia de desarrollo. |
| Modular Boundaries | PASS | El parseo de CORS se centraliza en una función compartida y se consume desde Express y Socket.io. |
| Secrets and configuration | PASS | `ADMIN_PASS` se exige al crear el administrador inicial en producción; no se incorporan secretos al repositorio. |
| Scope restriction | PASS | Solo se planifican los archivos solicitados y tests bajo `backend/src/test`. |

## Phase 0: Research

Las decisiones de investigación están documentadas en [research.md](./research.md).
No quedan decisiones técnicas abiertas: el usuario fijó la estructura, el mecanismo de
idempotencia, `node:test`, `TEST_DATABASE_URL` y el alcance de archivos.

## Phase 1: Design

El modelo de datos y sus restricciones están en [data-model.md](./data-model.md).
La compatibilidad externa y la política CORS están en
[contracts/cors-and-compatibility.md](./contracts/cors-and-compatibility.md).
Los pasos ejecutables de validación están en [quickstart.md](./quickstart.md).

**Constitution Check post-diseño**: PASS. El diseño mantiene límites modulares, añade
validación real en PostgreSQL, hace repetible la migración, evita defaults inseguros,
conserva contratos externos y limita los cambios de código a los archivos solicitados
y sus tests.

## Project Structure

### Documentation (this feature)

```text
specs/002-endurecer-backend-produccion/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    └── cors-and-compatibility.md
```

### Source Code (repository root)

```text
backend/
├── index.js                         # servidor HTTP y configuración Socket.io
└── src/
    ├── app.js                       # Express, Helmet, CORS y rutas
    ├── config/
    │   └── migrate.js               # esquema, CHECK/FK y arranque de usuarios
    └── test/
        ├── hardening.integration.test.js
        └── realtime.test-support.js # soporte existente, solo si hace falta ajustar CORS
```

**Structure Decision**: Se mantiene el backend CommonJS existente. La función compartida
para parsear `CORS_ORIGIN` se definirá en `backend/src/app.js` y se expondrá para que
`backend/index.js` reutilice exactamente la misma lista; así no se crea otro archivo
fuera del alcance. Los tests de integración se ubicarán junto a los tests existentes en
`backend/src/test`.

## Complexity Tracking

No hay violaciones de la constitución que requieran justificación.
