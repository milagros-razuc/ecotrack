# Implementation Plan: Suite de pruebas unitarias trazables

**Branch**: `011-suite-pruebas-unitarias` | **Date**: 2026-10-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-suite-pruebas-unitarias/spec.md`

## Summary

Crear una suite unitaria reproducible para las reglas de negocio del backend, con
trazabilidad CP-ID para RF01-RF23 y RE01-RE06. Se conservar├í `node:test`, se aislar├ín
`pg`, MQTT y el reloj con dobles, y se agregar├í Supertest ├║nicamente para pruebas de
rutas HTTP si la implementaci├│n lo requiere. El resultado incluir├í un reporte de
trazabilidad que distingue Aprobado, Fallido y Pendiente.

## Technical Context

**Language/Version**: JavaScript CommonJS sobre Node.js 18 (imagen base actual)

**Primary Dependencies**: `node:test`, `assert`, `bcryptjs`, `jsonwebtoken`, `zod`,
`pg`, `mqtt`, Express; `supertest` se agregar├í como devDependency si se prueban rutas

**Storage**: PostgreSQL reemplazado por un doble de `pool.query`, `pool.connect` y
transacciones en pruebas unitarias

**Testing**: Runner nativo `node --test` ya configurado en `backend/package.json`;
`node:test` mock timers o reloj controlado por fixture, sin runner alternativo

**Target Platform**: Backend Node.js ejecutado localmente y en el contenedor existente,
sin servicios externos para la suite unitaria

**Project Type**: Servicio web Express con l├│gica de negocio, persistencia y consumidor MQTT

**Performance Goals**: La suite debe ser determinista y ejecutable sin red; RE01-RE06 se
trazan, pero las m├®tricas de rendimiento no se inventan ni se aprueban con unitarias

**Constraints**: No red, Docker, PostgreSQL real, broker MQTT ni hardware; cada nombre de
`describe`/`it` debe incluir `CP-RFxx` o `CP-REyy`; no modificar producci├│n para forzar
aprobaciones; defectos conocidos quedan en `todo`/`skip` con motivo

**Scale/Scope**: m├│dulos bajo `backend/src/{schemas.js,middleware,services,mqtt,routes}`,
fixtures para clientes A y B y usuarios admin/com├║n de cada cliente; un archivo de test
por m├│dulo funcional y un reporte global

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

* PASS: La estrategia usa el runner existente y dobles inyectados, sin red ni servicios
  reales, conforme al principio VIII.
* PASS: Cada caso tendr├í CP-ID y el reporte reflejar├í su estado real.
* PASS: Se prueban dos clientes en cada requisito de aislamiento.
* PASS: RF02, RF07 (filtros hist├│ricos), RF14, RF15 y RF19 se registran como pendientes
  expl├¡citos, sin corregir producci├│n durante esta feature.
* PASS: La adici├│n de Supertest es una dependencia de desarrollo justificada para rutas;
  no introduce un runner distinto.

## Project Structure

### Documentation (this feature)

```text
specs/011-suite-pruebas-unitarias/
Ôö£ÔöÇÔöÇ plan.md
Ôö£ÔöÇÔöÇ research.md
Ôö£ÔöÇÔöÇ data-model.md
Ôö£ÔöÇÔöÇ contracts/
Ôöé   Ôö£ÔöÇÔöÇ test-isolation.md
Ôöé   ÔööÔöÇÔöÇ traceability-report.md
ÔööÔöÇÔöÇ quickstart.md
```

### Source Code (repository root)

```text
backend/
Ôö£ÔöÇÔöÇ src/
Ôöé   Ôö£ÔöÇÔöÇ schemas.js
Ôöé   Ôö£ÔöÇÔöÇ middleware/
Ôöé   Ôö£ÔöÇÔöÇ services/
Ôöé   Ôö£ÔöÇÔöÇ mqtt/
Ôöé   Ôö£ÔöÇÔöÇ routes/
Ôöé   ÔööÔöÇÔöÇ test/
Ôöé       Ôö£ÔöÇÔöÇ helpers/
Ôöé       Ôöé   Ôö£ÔöÇÔöÇ fixtures.js
Ôöé       Ôöé   Ôö£ÔöÇÔöÇ mock-db.js
Ôöé       Ôöé   Ôö£ÔöÇÔöÇ mock-mqtt.js
Ôöé       Ôöé   ÔööÔöÇÔöÇ clock.js
Ôöé       Ôö£ÔöÇÔöÇ schemas.test.js
Ôöé       Ôö£ÔöÇÔöÇ lecturas.test.js
Ôöé       Ôö£ÔöÇÔöÇ alertas.test.js
Ôöé       Ôö£ÔöÇÔöÇ umbrales.test.js
Ôöé       Ôö£ÔöÇÔöÇ dispositivos.test.js
Ôöé       Ôö£ÔöÇÔöÇ usuarios.test.js
Ôöé       Ôö£ÔöÇÔöÇ auth.test.js
Ôöé       Ôö£ÔöÇÔöÇ rol.test.js
Ôöé       Ôö£ÔöÇÔöÇ cliente-aislamiento.test.js
Ôöé       ÔööÔöÇÔöÇ mqtt-handler.test.js
ÔööÔöÇÔöÇ package.json

docs/
ÔööÔöÇÔöÇ trazabilidad-unitarias.md
```

**Structure Decision**: Se mantiene el backend existente y se ampl├¡a `backend/src/test`
con helpers compartidos y archivos unitarios por m├│dulo. El reporte de trazabilidad vive
en `docs/` porque es un entregable reutilizable fuera de la spec. Las pruebas de integraci├│n
existentes permanecen separadas y no cuentan como cobertura unitaria.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Agregar Supertest como devDependency | Probar rutas Express sin abrir servicios reales | `fetch` requiere un servidor escuchando y los mocks manuales no validan el contrato HTTP completo |
