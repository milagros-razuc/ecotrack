# Implementation Plan: Alta de cliente y administrador inicial

**Branch**: `021-alta-cliente-admin` | **Date**: 2026-11-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/021-alta-cliente-admin/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Crear clientes y administradores iniciales desde el panel de plataforma mediante dos
rutas explícitas, una transacción que incluya auditoría fail-closed, contraseña
temporal de entrega única y estado persistido de cambio obligatorio. Reutilizar
autenticación, bcrypt, JWT y `token_version`; añadir migraciones para el estado de
primer login y unicidad case-insensitive.

## Technical Context

**Language/Version**: Node.js CommonJS

**Primary Dependencies**: Express, PostgreSQL (`pg`), bcryptjs, jsonwebtoken, Zod, express-rate-limit

**Storage**: PostgreSQL

**Testing**: Node test runner; integration tests against `TEST_DATABASE_URL` with temporary migrated databases

**Target Platform**: Backend Node/Express and static browser frontend

**Project Type**: Web application

**Performance Goals**: Complete a single administrative alta within normal panel interaction latency; no bulk creation is required.

**Constraints**: Raw JWT Authorization header, tenant isolation, no plaintext secrets in persistence/logs/audit, fail-closed audit, no download, default 5 requests/15 minutes/user.

**Scale/Scope**: One client plus one initial admin per request; existing global uniqueness and platform-admin panel.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Pass:
- Modular routing, services, persistence, middleware, and static frontend remain separated.
- Authentication, authorization, hashing, secret cleanup, tenant isolation, rate limiting,
  and auditability are explicit requirements.
- API bodies are schema-validated and strict.
- PostgreSQL integration tests cover transaction, migration, authentication, and
  concurrency-sensitive uniqueness.
- No constitution violation requires a complexity exception.

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
```text
backend/
├── src/
│   ├── routes/plataforma.js
│   ├── services/plataforma.service.js
│   ├── services/usuarios.service.js
│   ├── services/auth.service.js
│   ├── middleware/auth.js
│   ├── schemas.js
│   └── test/
├── migrations/
└── scripts/run-migrations.js
frontend/
└── plataforma.html
specs/021-alta-cliente-admin/
├── plan.md
├── research.md
├── data-model.md
├── contracts/
│   └── platform-client-admin.md
└── quickstart.md
```

**Structure Decision**: Preserve the existing single backend/static-frontend layout.
Platform routes and services own the transaction; authentication middleware owns
persisted session restrictions; migrations own schema changes; integration tests use
the existing temporary migration database helper.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | The design stays within the existing application structure. |
