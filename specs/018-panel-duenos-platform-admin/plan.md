# Implementation Plan: Panel global de dueños de plataforma

**Branch**: `018-panel-duenos-platform-admin` | **Date**: 2026-11-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/018-panel-duenos-platform-admin/spec.md`

## Summary

Agregar una superficie global exclusiva para `platform_admin`, con resumen, clientes,
dispositivos, filtros, estados de ciclo de vida, firmware y reset de credenciales.
La implementación conservará las rutas tenant existentes, delegará el reset en el
servicio de la spec 016 y registrará auditoría con el cliente operativo afectado y
actor sanitizado.

El diseño usa un cliente especial “plataforma” con seed idempotente, middleware
propio de plataforma y endpoints `/api/plataforma/...`. La última lectura se obtiene
con una consulta acotada por dispositivo sobre `lecturas.timestamp`, sin escanear
innecesariamente todas las particiones; la última conexión permanece separada en
`dispositivos.ultima_conexion`.

## Technical Context

**Language/Version**: Node.js existente del backend; JavaScript CommonJS; frontend HTML/CSS/JavaScript estático.

**Primary Dependencies**: Express, PostgreSQL (`pg`), JWT (`jsonwebtoken`), Zod, `node:test`, Docker Compose.

**Storage**: PostgreSQL; tablas `clientes`, `usuarios`, `dispositivos`, `dispositivos_fabrica`, `lecturas`, `auditoria` y particiones mensuales de lecturas.

**Testing**: `node:test` con tests unitarios e integración; guardas existentes mediante `TEST_DATABASE_URL`.

**Target Platform**: Backend Node.js en Docker Compose, frontend estático servido por el mismo origen, navegador moderno y firmware ESP32 para validación manual.

**Project Type**: Web application con API REST, frontend estático, MQTT y PostgreSQL.

**Performance Goals**: Listados paginados; la consulta de última lectura debe ser acotada por dispositivo y no ejecutar un escaneo global de todas las particiones.

**Constraints**: Mantener aislamiento tenant, JWT crudo en `Authorization` sin `Bearer`, lista blanca de respuestas, rate limit para reset, migraciones repetibles, servicio de reset HTTP-agnóstico y compatibilidad con rutas existentes.

**Scale/Scope**: Todos los clientes y dispositivos operativos, con filtros y paginación; una única escritura nueva desde el panel: reset de credenciales.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Modular Boundaries**: PASS. Se separan middleware, rutas, servicios, persistencia,
  contratos y frontend; el reset se delega al servicio existente.
- **Secure By Default**: PASS. JWT y rol se validan en backend; el cliente oculta la
  vista solo como conveniencia; no se exponen secretos.
- **Validated Data Contracts**: PASS. Query params, body vacío del reset y respuestas
  usarán validación y lista blanca.
- **Testable Changes**: PASS. Se definen tests de rutas, servicio, integración,
  aislamiento, auditoría, UI y prueba manual con placa real.
- **Reliable and Observable Operation**: PASS. Seed y migraciones serán idempotentes;
  errores sanitizados y auditoría sin secretos.
- **Tenant Isolation**: PASS con frontera explícita. El middleware de plataforma solo
  se montará en `/api/plataforma`; las rutas tenant no se amplían para el rol global.
- **Controlled and Auditable Access**: PASS. Reset rate-limited y auditado con cliente
  afectado y actor no personal visible al tenant.

## Phase 0: Research Decisions

Las decisiones están documentadas en [research.md](./research.md):

1. Consulta indexada/acotada para `última lectura`, separada de `última conexión`.
2. `LEFT JOIN` por `dispositivos.codigo = dispositivos_fabrica.device_id`.
3. Cliente especial “plataforma”, constraint de rol ampliado y seed idempotente.
4. Auditoría con cliente afectado y actor de plataforma sanitizado.
5. Endpoint nuevo separado y T2 contra las tres rutas tenant existentes.
6. Guardas existentes de `TEST_DATABASE_URL` y prueba manual con placa real.

## Phase 1: Design

- [data-model.md](./data-model.md): entidades, claves, estados y transiciones.
- [contracts/platform-api.md](./contracts/platform-api.md): endpoints globales y
  lista blanca.
- [contracts/authorization-and-audit.md](./contracts/authorization-and-audit.md):
  T2 y contrato de auditoría visible al cliente.
- [contracts/ui.md](./contracts/ui.md): ruta, tabla, filtros y confirmación de reset.
- [quickstart.md](./quickstart.md): validación automatizada y manual end-to-end.

## Source Code Structure

```text
backend/
├── migrations/                 # rol, cliente plataforma, actor/auditoría, índices
├── scripts/                    # seed idempotente del usuario/cliente plataforma
└── src/
    ├── middleware/             # autorización específica de plataforma
    ├── routes/                 # rutas /api/plataforma y rutas tenant sin ampliación
    ├── services/               # consultas globales, auditoría y delegación de reset
    └── test/                   # unitarias e integración de T1-T9 y T2
frontend/
├── plataforma.html             # panel global separado
└── shared/                     # sesión, visibilidad y navegación
specs/018-panel-duenos-platform-admin/
├── contracts/
├── data-model.md
├── plan.md
├── quickstart.md
└── research.md
```

**Structure Decision**: Se mantiene la estructura actual de aplicación web separada
entre `backend/` y `frontend/`, reutilizando servicios y middleware existentes sin
crear un tercer proyecto ni dependencias externas nuevas.

## Verification Gates

Antes de pasar a `/speckit-tasks` deben estar definidos y cubiertos:

- T2 concreto contra `/api/dispositivos`, `/api/dispositivos/estado` y
  `/api/dispositivos/:codigo/reset-credenciales`.
- Exclusión del cliente especial en listados, filtros y conteos.
- Seed repetible sin duplicados.
- Consulta de última lectura acotada por dispositivo y JOIN por claves correctas.
- Auditoría con cliente afectado y actor visible como “Administración de la plataforma”.
- Suite de integración con las guardas existentes.
- Prueba manual final con placa real.

## Post-Design Constitution Check

- **PASS**: no se agregan rutas globales a los routers tenant ni se relaja su
  aislamiento.
- **PASS**: todas las respuestas globales tienen lista blanca y el actor tenant se
  sanitiza.
- **PASS**: las decisiones de base, API, autorización, frontend y firmware manual
  están cubiertas por contratos y pruebas.
- **PASS**: no quedan decisiones técnicas sin resolver en `research.md`.

## Complexity Tracking

No se identifican violaciones de la constitución ni componentes adicionales fuera de
la estructura existente.
