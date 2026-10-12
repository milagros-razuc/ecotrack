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

**Constraints**: Solo se pueden modificar `backend/src/config/migrate.js`,
`backend/src/app.js`, `backend/index.js`, `backend/package.json` y
`backend/package-lock.json` (únicamente para agregar `helmet`),
`backend/.env.example` (documentar `NODE_ENV`, `ADMIN_PASS` y `CORS_ORIGIN`, sin
valores reales), un archivo nuevo `backend/src/config/cors.js` y tests nuevos o
modificados en `backend/src/test`. No cambiar formatos de eventos, endpoints, MQTT
ni el contrato de `change-password`. Las pruebas de base requieren `TEST_DATABASE_URL`.
`migrate.js` debe lanzar un `Error` (no llamar a `process.exit`) cuando falte
`ADMIN_PASS` en producción sobre una base sin usuarios.

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
├── package.json                     # solo: agregar helmet
├── package-lock.json                # solo: reflejar helmet
├── .env.example                     # solo: documentar NODE_ENV, ADMIN_PASS, CORS_ORIGIN
└── src/
    ├── app.js                       # Express, Helmet, CORS y rutas (module.exports = app)
    ├── config/
    │   ├── cors.js                  # nuevo: parseo de CORS_ORIGIN
    │   └── migrate.js               # esquema, CHECK/FK y arranque de usuarios
    └── test/
        ├── hardening.integration.test.js   # nuevo
        └── realtime.test-support.js        # existente, solo si hace falta ajustar CORS
```

**Structure Decision**: Se mantiene el backend CommonJS existente. La función que
parsea `CORS_ORIGIN` (quita espacios, elimina duplicados, aplica el valor por defecto
`http://localhost:8080`) vive en el archivo nuevo `backend/src/config/cors.js`, y la
consumen `app.js` e `index.js`. `app.js` conserva `module.exports = app` sin cambios.
Los tests de integración se ubican junto a los existentes en `backend/src/test`.

**Estrategia de pruebas de arranque**: los tests de `migrate.js` en producción se
ejecutan en un proceso hijo (`child_process`) con su propio `NODE_ENV` y `ADMIN_PASS`,
contra una base temporal creada y eliminada por el propio test (por ejemplo
`CREATE DATABASE hardening_<timestamp>` conectándose a `TEST_DATABASE_URL`). Ningún
test de esta feature modifica las tablas de la base compartida ni borra datos de los
tests de tiempo real. Las pruebas de CORS de Socket.io envían el encabezado `Origin`
con la opción `extraHeaders` de `socket.io-client`.

## Complexity Tracking

No hay violaciones de la constitución que requieran justificación.