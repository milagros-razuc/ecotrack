# Implementation Plan: Seccion Clientes de plataforma

**Branch**: `026-seccion-clientes-platform` | **Date**: 2026-11-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/026-seccion-clientes-platform/spec.md`

## Summary

Crear una página `clientes.html` exclusiva para `platform_admin`, con una vista
eficiente de todos los clientes y sus administradores. La pantalla reutiliza
`GET /api/plataforma/clientes`, incorpora la información de administradores sin
consultas por cliente y reutiliza `POST /api/usuarios/:id/reset-password` de la
Feature 024. El listado «Usuarios por cliente» se mueve a la nueva vista y deja
de duplicarse en `plataforma.html`. No se modifica el contrato de autenticación
temporal ni la auditoría existente.

## Technical Context

**Language/Version**: Node.js y JavaScript ES moderno; HTML/CSS estático

**Primary Dependencies**: Express, PostgreSQL, bcryptjs, Tailwind existente,
Socket.IO y componentes compartidos del frontend

**Storage**: PostgreSQL; sin almacenamiento nuevo persistente para contraseñas
temporales porque el hash y el vencimiento ya existen en la Feature 024

**Testing**: Node test runner existente y pruebas de integración HTTP/PostgreSQL

**Target Platform**: Navegador web responsive y backend Linux/Docker

**Project Type**: Aplicación web con frontend estático y API REST

**Performance Goals**: Listar al menos 500 clientes sin consultas por fila y
mostrar el resultado inicial en menos de 3 segundos

**Constraints**: Solo `platform_admin`; entrega de contraseña temporal una sola
vez; backend debe mantener autorización aunque la interfaz o la ruta sean alteradas

**Scale/Scope**: Todos los clientes no plataforma, sus usuarios y administradores

## Constitution Check

*GATE: Debe pasar antes de investigar y volver a verificarse después del diseño.*

- **Secure by Default**: pasa; el endpoint de plataforma usa `verificarToken` +
  `requirePlatformAdmin`, y el reset vuelve a validar la matriz en el service.
- **Tenant Isolation**: pasa con matiz; la vista cruza clientes solo para el rol
  de plataforma y el backend no acepta `cliente_id` del cuerpo como autorización.
- **Controlled and Auditable Access**: pasa; el reset reutiliza la transacción y
  el evento `reset_password` existente.
- **Validated Data Contracts**: pasa; se valida el ID objetivo y se reutiliza el
  contrato existente sin payload adicional.
- **Testable Changes**: pasa si se añaden integración backend y renderizado
  frontend para cero, uno y varios administradores.

No hay violaciones de constitución que requieran excepción.

### Revalidación posterior al diseño

- Los datos cruzan clientes únicamente bajo el middleware de `platform_admin`.
- No se agrega persistencia de la contraseña temporal.
- El endpoint de reset conserva su transacción, auditoría e invalidación de
  sesiones existentes.
- El diseño define una interfaz de prueba para listado, acceso directo, reset,
  entrega única y casos con cero, uno o varios administradores.

La puerta constitucional pasa posterior al diseño.

## Project Structure

### Documentation (this feature)

```text
specs/026-seccion-clientes-platform/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    └── clientes-platform.md
```

### Source Code (repository root)

```text
backend/src/
├── app.js
├── routes/plataforma.js
├── routes/reset-password.js
├── services/plataforma.service.js
└── services/password-reset.service.js

frontend/
├── clientes.html
├── plataforma.html
└── shared/
    ├── app.js
    ├── role-routing.js
    ├── sidebar.html
    └── platform-panel-render.js
```

**Structure Decision**: Aplicación web existente. Se agrega una página
`clientes.html` y se amplía el servicio/listado de plataforma con administradores
en una sola consulta. El reset permanece en el endpoint ya implementado por la
Feature 024. No se crea una API paralela ni un nuevo modelo persistente.

## Complexity Tracking

No hay violaciones que justificar.
