# Implementation Plan: Reclamo seguro y aprovisionamiento de dispositivos

**Branch**: `004-reclamo-seguro-dispositivos` | **Date**: 2026-10-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-reclamo-seguro-dispositivos/spec.md`

## Summary

Implementar el ciclo seguro de aprovisionamiento, reclamo y baja de dispositivos en el backend Node/Express con PostgreSQL, junto con el cambio mínimo del formulario existente en `frontend/index.html` y `frontend/shared/app.js`. Se agregarán columnas para representar el hash del token del ciclo y `reclamado_en`, se reemplazará el alta/reclamo por una operación atómica condicionada a dispositivo sin dueño y token válido, y se mantendrá el aislamiento histórico mediante `cliente_id` persistido en lecturas y alertas. La migración será idempotente: el backfill de dispositivos liberados solo ocurrirá al crear por primera vez la columna `cliente_id`, los dispositivos existentes con dueño no recibirán tokens y los seeds no reclamarán ni configurarán dispositivos sin dueño. La baja dejará el hash nulo; solo el operador podrá habilitar otro ciclo mediante `--rotate`. El flujo será auditado y tendrá cobertura de integración para reclamos válidos, rechazos, concurrencia, reinicio y frontend mínimo.

## Technical Context

**Language/Version**: Node.js CommonJS, versión determinada por el runtime y `backend/package.json`

**Primary Dependencies**: Express, `pg`, `crypto` nativo de Node.js, Zod, `node:test`

**Storage**: PostgreSQL; migraciones idempotentes en `backend/src/config/migrate.js`

**Testing**: `node --test --test-timeout=30000 --test-concurrency=1 src/test/*.test.js`, con PostgreSQL de pruebas mediante `TEST_DATABASE_URL`

**Target Platform**: Backend Linux/Docker, compatible con el entorno local de Docker Compose

**Project Type**: Servicio web backend con API REST, ingestión MQTT y eventos Socket.io

**Performance Goals**: Un solo intento de reclamo debe resolverse mediante una operación SQL atómica; ante reclamos concurrentes, como máximo uno debe modificar el dispositivo. La ingestión MQTT debe conservar el flujo existente sin consultas adicionales innecesarias.

**Constraints**: El token en claro solo existe durante la ejecución del script de aprovisionamiento/rotación y se imprime una sola vez; nunca se persiste ni se incluye en errores. El cliente se toma de la sesión autenticada. La migración debe poder ejecutarse en cada arranque sin reasignar dispositivos liberados, generar tokens para dispositivos existentes con dueño ni reinsertar umbrales inválidos. La baja deja `token_reclamo_hash` nulo y solo `--rotate` puede generar otro. El tópico MQTT y el payload de firmware permanecen compatibles.

**Scale/Scope**: Dispositivos de múltiples clientes, múltiples ciclos de vida por código y datos históricos conservados por cliente. El alcance incluye backend, migración, script operativo, pruebas y el cambio mínimo del formulario de alta/error en `frontend/index.html` y `frontend/shared/app.js`; no incluye rediseño frontend, nuevas pantallas ni cambios de firmware.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Modular Boundaries**: PASS. Rutas validan/autorizan; servicios encapsulan transacciones y SQL; migración queda en configuración; MQTT solo descarta o delega la lectura.
- **II. Secure By Default**: PASS. Solo administradores reclaman/dan de baja; el cliente proviene del JWT; el token se almacena como hash y el script no lo escribe en archivos.
- **III. Validated Data Contracts**: PASS. Se ampliarán esquemas para exigir código y token en el reclamo, se validarán entradas del aprovisionamiento sin aceptar `cliente_id` desde el request y el frontend enviará el campo `token`.
- **IV. Testable Changes**: PASS. Se agregarán pruebas de servicio/API e integración PostgreSQL para token inválido, reutilización, concurrencia, histórico y reinicio.
- **V. Reliable and Observable Operation**: PASS. La migración detectará columnas antes de ejecutar backfills; se conservará compatibilidad MQTT; reclamo y baja producirán auditoría.
- **VI. Tenant Isolation**: PASS. La asociación usará el cliente autenticado y las lecturas/alertas seguirán filtradas por su `cliente_id`; los mensajes sin dueño se descartan.
- **VII. Controlled and Auditable Access**: PASS. Aprovisionamiento, reclamo y baja quedarán restringidos y auditados sin registrar el secreto.
- **Requisitos citados**: la especificación implementa RF21, RNF17 y RNF18 proporcionados para la funcionalidad, además de RF12, RF14, RF17 y RF18 existentes.

## Project Structure

### Documentation (this feature)

```text
specs/004-reclamo-seguro-dispositivos/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── dispositivos.md
├── checklists/
│   └── requirements.md
└── tasks.md                 # generado por /speckit-tasks
```

### Source Code

```text
backend/
├── scripts/
│   └── provision-device.js
├── src/
│   ├── config/
│   │   └── migrate.js
│   ├── mqtt/
│   │   └── client.js
│   ├── routes/
│   │   └── dispositivos.js
│   │   ├── schemas.js
│   ├── services/
│   │   ├── auditoria.service.js
│   │   └── dispositivos.service.js
│   └── test/
│       ├── aislamiento-historico-dispositivo.integration.test.js
│       └── reclamo-dispositivo.integration.test.js
└── package.json
frontend/
├── index.html
└── shared/
    └── app.js
```

**Structure Decision**: Mantener la estructura modular existente. El script de aprovisionamiento será una herramienta operativa separada del router HTTP; las pruebas se ejecutarán como integración contra la base de datos configurada por `TEST_DATABASE_URL`.

## Constitution Check (Post-Design)

- **Modularidad y contratos**: PASS. El contrato HTTP separa reclamo de aprovisionamiento, el servicio concentra la operación atómica y MQTT conserva el tópico/payload existente.
- **Seguridad y aislamiento**: PASS. No se acepta `cliente_id` desde entradas, el secreto no se persiste ni audita, y lecturas/alertas mantienen su cliente histórico.
- **Migración y operación confiable**: PASS. La detección de primera creación de `cliente_id`, la conversión decimal y los seeds condicionados hacen repetible el arranque sin reasignaciones.
- **Pruebas y observabilidad**: PASS. Los casos de rechazo, carrera, reinicio, auditoría y descarte sin dueño están incluidos en el alcance de integración.

## Complexity Tracking

No hay violaciones de la constitución que requieran justificación.
